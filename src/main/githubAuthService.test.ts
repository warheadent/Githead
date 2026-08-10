import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SecretStorage } from "./aiSettingsService";
import { GITHUB_APP_CLIENT_ID, GitHubAuthService } from "./githubAuthService";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("GitHubAuthService", () => {
  it("keeps the device code in main while completing the flow", async () => {
    const directory = await temporaryDirectory();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        device_code: "device-secret",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "access-secret",
        expires_in: 28_800,
        refresh_token: "refresh-secret",
        refresh_token_expires_in: 15_897_600
      }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl, () => 1_000);

    const flow = await service.beginDeviceFlow(1);
    expect(flow).toMatchObject({ userCode: "ABCD-1234", intervalSeconds: 5 });
    expect(flow).not.toHaveProperty("deviceCode");
    expect(JSON.stringify(flow)).not.toContain("device-secret");
    expect(await service.pollDeviceFlow(1, flow.flowId)).toMatchObject({ state: "connected" });
    expect(await service.getToken()).toBe("access-secret");

    const stored = await fs.readFile(path.join(directory, "github-auth.json"), "utf8");
    expect(stored).not.toContain("access-secret");
    expect(stored).not.toContain("refresh-secret");
    expect(new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body)).get("client_id")).toBe(GITHUB_APP_CLIENT_ID);
    expect(new URLSearchParams(String(fetchImpl.mock.calls[1]?.[1]?.body)).get("device_code")).toBe("device-secret");
  });

  it("refreshes an expired device-flow token without a client secret", async () => {
    const directory = await temporaryDirectory();
    let now = 1_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ device_code: "device", user_code: "CODE", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 1 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "old", expires_in: 1, refresh_token: "refresh", refresh_token_expires_in: 10_000 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "new", expires_in: 28_800, refresh_token: "next-refresh", refresh_token_expires_in: 10_000 }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl, () => now);
    const flow = await service.beginDeviceFlow(1);
    await service.pollDeviceFlow(1, flow.flowId);
    now = 20_000;

    expect(await service.getToken()).toBe("new");
    const refreshBody = new URLSearchParams(String(fetchImpl.mock.calls[2]?.[1]?.body));
    expect(refreshBody.get("grant_type")).toBe("refresh_token");
    expect(refreshBody.get("refresh_token")).toBe("refresh");
    expect(refreshBody.has("client_secret")).toBe(false);
  });

  it("removes the stored GitHub App credential on disconnect", async () => {
    const directory = await temporaryDirectory();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ device_code: "device", user_code: "CODE", verification_uri: "https://github.com/login/device", expires_in: 900 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "access" }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl);
    const flow = await service.beginDeviceFlow(1);
    await service.pollDeviceFlow(1, flow.flowId);

    await service.disconnect();

    expect(await service.getToken()).toBeNull();
    await expect(fs.stat(path.join(directory, "github-auth.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a flow from another renderer without sending its device code", async () => {
    const directory = await temporaryDirectory();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ device_code: "device-secret", user_code: "CODE", verification_uri: "https://github.com/login/device", expires_in: 900 }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl);
    const flow = await service.beginDeviceFlow(1);

    await expect(service.pollDeviceFlow(2, flow.flowId)).resolves.toMatchObject({ state: "error", retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("removes a device flow after a terminal response", async () => {
    const directory = await temporaryDirectory();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ device_code: "device-secret", user_code: "CODE", verification_uri: "https://github.com/login/device", expires_in: 900 }))
      .mockResolvedValueOnce(jsonResponse({ error: "access_denied" }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl);
    const flow = await service.beginDeviceFlow(1);

    await expect(service.pollDeviceFlow(1, flow.flowId)).resolves.toMatchObject({ state: "error", retryable: false });
    await expect(service.pollDeviceFlow(1, flow.flowId)).resolves.toMatchObject({ state: "error", retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("removes device flows when their renderer is destroyed", async () => {
    const directory = await temporaryDirectory();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ device_code: "device-secret", user_code: "CODE", verification_uri: "https://github.com/login/device", expires_in: 900 }));
    const service = new GitHubAuthService(directory, fakeSecretStorage, fetchImpl);
    const flow = await service.beginDeviceFlow(1);

    service.cancelDeviceFlowsForOwner(1);

    await expect(service.pollDeviceFlow(1, flow.flowId)).resolves.toMatchObject({ state: "error", retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

const fakeSecretStorage: SecretStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, "")
};

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-github-auth-"));
  temporaryDirectories.push(directory);
  return directory;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
}
