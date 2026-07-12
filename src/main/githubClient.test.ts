import { describe, expect, it, vi } from "vite-plus/test";
import type { GitHubRepository } from "../shared/types";
import type { ProcessResult, ProcessRunner, ProcessRunOptions } from "./processRunner";
import { DefaultGitHubClient } from "./githubClient";

const repository: GitHubRepository = {
  owner: "openai", name: "githead", fullName: "openai/githead", webUrl: "https://github.com/openai/githead"
};

describe("DefaultGitHubClient", () => {
  it("rejects absolute and protocol-relative request paths", async () => {
    const client = new DefaultGitHubClient(vi.fn<typeof fetch>(), undefined, { env: {} });
    await expect(client.requestJson(repository, "https://example.com/token-leak")).rejects.toThrow("relative path");
    await expect(client.requestJson(repository, "//example.com/token-leak")).rejects.toThrow("relative path");
  });

  it("prefers GITHUB_TOKEN and does not invoke the CLI", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const runner = new FakeRunner([]);
    const client = new DefaultGitHubClient(fetchImpl, runner, { env: { GITHUB_TOKEN: "github-sentinel", GH_TOKEN: "gh-sentinel" } });
    await client.requestJson(repository, "/repos/openai/githead");
    expect(authHeader(fetchImpl)).toBe("Bearer github-sentinel");
    expect(runner.calls).toHaveLength(0);
  });

  it("uses GH_TOKEN when GITHUB_TOKEN is empty", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({}));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: { GITHUB_TOKEN: " ", GH_TOKEN: "gh-sentinel" } });
    await client.requestJson(repository, "/rate_limit");
    expect(authHeader(fetchImpl)).toBe("Bearer gh-sentinel");
  });

  it("deduplicates concurrent CLI credential discovery and reuses its decision", async () => {
    let resolveToken!: (result: ProcessResult) => void;
    const runner = new FakeRunner([new Promise((resolve) => { resolveToken = resolve; })]);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({}));
    const client = new DefaultGitHubClient(fetchImpl, runner, { env: {} });
    const first = client.requestJson(repository, "/one");
    const second = client.requestJson(repository, "/two");
    await vi.waitFor(() => expect(runner.calls).toHaveLength(1));
    resolveToken(ok("cli-sentinel\n"));
    await Promise.all([first, second]);
    await client.requestJson(repository, "/three");
    expect(runner.calls).toEqual([{ command: "gh", args: ["auth", "token", "--hostname", "github.com"], options: { timeoutMs: 5_000 } }]);
    expect(authHeader(fetchImpl, 0)).toBe("Bearer cli-sentinel");
  });

  for (const [name, result] of [
    ["missing", failed("not found", "spawnFailed")],
    ["failed", failed("not logged in", "exited")],
    ["timed out", failed("timeout", "timedOut")],
    ["empty", ok("  ")]
  ] as const) it(`falls back to anonymous access when CLI lookup is ${name}`, async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const client = new DefaultGitHubClient(fetchImpl, new FakeRunner([result]), { env: {} });
    await client.requestJson(repository, "/repos/openai/githead");
    expect(authHeader(fetchImpl)).toBeNull();
  });

  it("refreshes authentication once for GET after 401", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "Bad credentials" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const runner = new FakeRunner([ok("old-token"), ok("new-token")]);
    const client = new DefaultGitHubClient(fetchImpl, runner, { env: {} });
    await expect(client.requestJson<{ ok: boolean }>(repository, "/user")).resolves.toMatchObject({ payload: { ok: true } });
    expect(runner.calls).toHaveLength(2);
    expect(authHeader(fetchImpl, 1)).toBe("Bearer new-token");
  });

  it("does not retry POST or invalidate authentication for 403", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "Bad credentials" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ message: "Rate limited" }, { status: 403 }));
    const runner = new FakeRunner([ok("secret"), ok("second")]);
    const client = new DefaultGitHubClient(fetchImpl, runner, { env: {} });
    await expect(client.requestJson(repository, "/pulls", { method: "POST", body: {} })).rejects.toThrow("Bad credentials");
    await expect(client.requestJson(repository, "/rate_limit")).rejects.toThrow("Rate limited");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(runner.calls).toHaveLength(2);
  });

  it("deduplicates identical GETs and cleans up after success and failure", async () => {
    let resolve!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: {} });
    const first = client.requestJson(repository, "/same");
    const second = client.requestJson(repository, "/same");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    resolve(jsonResponse({ value: 1 }));
    expect(await first).toEqual(await second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockRejectedValueOnce(new Error("network failed"));
    await expect(client.requestJson(repository, "/failure")).rejects.toThrow("network failed");
    fetchImpl.mockResolvedValueOnce(jsonResponse({ value: 2 }));
    await client.requestJson(repository, "/failure");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never coalesces POST requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ number: 1 }, { status: 201 }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: {} });
    await Promise.all([
      client.requestJson(repository, "/pulls", { method: "POST", body: { title: "one" } }),
      client.requestJson(repository, "/pulls", { method: "POST", body: { title: "one" } })
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reuses fresh entries and conditionally revalidates stale ETags", async () => {
    let now = 100;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ value: 1 }, { headers: { ETag: "v1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(jsonResponse({ value: 2 }, { headers: { ETag: "v2" } }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: {}, now: () => now });
    const policy = { cache: { mode: "conditional" as const, maxAgeMs: 30 } };
    await client.requestJson(repository, "/cached", policy);
    now = 110;
    await expect(client.requestJson(repository, "/cached", policy)).resolves.toMatchObject({ payload: { value: 1 }, source: "fresh-cache" });
    now = 200;
    await expect(client.requestJson(repository, "/cached", policy)).resolves.toMatchObject({ payload: { value: 1 }, source: "not-modified" });
    expect(requestHeaders(fetchImpl, 1).get("if-none-match")).toBe("v1");
    now = 300;
    await expect(client.requestJson(repository, "/cached", policy)).resolves.toMatchObject({ payload: { value: 2 } });
    expect(requestHeaders(fetchImpl, 2).get("if-none-match")).toBe("v1");
  });

  it("evicts least recently used entries and invalidates one repository", async () => {
    const other = { ...repository, owner: "other", fullName: "other/githead" };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url) => jsonResponse({}, { headers: { ETag: String(fetchImpl.mock.calls.length) } }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: {}, maxCacheEntries: 2 });
    const conditional = { cache: { mode: "conditional" as const, maxAgeMs: 1_000 } };
    await client.requestJson(repository, "/one", conditional);
    await client.requestJson(repository, "/two", conditional);
    await client.requestJson(repository, "/one", conditional);
    await client.requestJson(other, "/three", conditional);
    await client.requestJson(repository, "/two", conditional);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    client.invalidateRepository(repository);
    await client.requestJson(other, "/three", conditional);
    await client.requestJson(repository, "/one", conditional);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("does not cache malformed responses and never exposes a token in API errors", async () => {
    const token = "VERY-SECRET-SENTINEL";
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ message: `Denied ${token}` }, { status: 403 }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: { GITHUB_TOKEN: token } });
    await expect(client.requestJson(repository, "/bad", { cache: { mode: "conditional" } })).rejects.toThrow("invalid JSON");
    let message = "";
    try { await client.requestJson(repository, "/bad", { cache: { mode: "conditional" } }); } catch (error) { message = String(error); }
    expect(message).not.toContain(token);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

interface RunnerCall { command: string; args: string[]; options?: ProcessRunOptions }
class FakeRunner implements ProcessRunner {
  readonly calls: RunnerCall[] = [];
  constructor(private readonly results: Array<ProcessResult | Promise<ProcessResult>>) {}
  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({ command, args, ...(options ? { options } : {}) });
    const result = this.results.shift();
    if (!result) throw new Error("No fake result queued.");
    return result;
  }
}

function ok(stdout = ""): ProcessResult { return { exitCode: 0, stdout, stderr: "", terminationReason: "exited" }; }
function failed(error: string, terminationReason: NonNullable<ProcessResult["terminationReason"]>): ProcessResult {
  return { exitCode: 1, stdout: "", stderr: error, terminationReason };
}
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    ...(init.statusText === undefined ? {} : { statusText: init.statusText }),
    headers: { "Content-Type": "application/json", ...init.headers }
  });
}
function requestHeaders(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): Headers {
  return new Headers(fetchImpl.mock.calls[call]?.[1]?.headers);
}
function authHeader(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): string | null {
  return requestHeaders(fetchImpl, call).get("authorization");
}
