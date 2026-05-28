import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AiSettingsService, type SecretStorage } from "./aiSettingsService";

class FakeSecretStorage implements SecretStorage {
  constructor(private readonly available = true) {}

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(value: string): Buffer {
    return Buffer.from(`encrypted:${value}`, "utf8");
  }

  decryptString(value: Buffer): string {
    return value.toString("utf8").replace(/^encrypted:/, "");
  }
}

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-ai-settings-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("AiSettingsService", () => {
  it("persists encrypted API keys and exposes only key presence", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      const saved = await service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        siteUrl: "https://example.test",
        siteTitle: "Githead Test"
      });

      expect(saved).toEqual({
        hasApiKey: true,
        model: "openrouter/auto",
        siteUrl: "https://example.test",
        siteTitle: "Githead Test"
      });
      await expect(service.getApiKey()).resolves.toBe("sk-or-key");
      await expect(fs.readFile(path.join(dir, "ai-settings.json"), "utf8"))
        .resolves.not.toContain("sk-or-key");
    });
  });

  it("preserves an existing API key when saving a blank key", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        siteUrl: "",
        siteTitle: "Githead"
      });
      const saved = await service.saveSettings({
        apiKey: "",
        model: "anthropic/claude-sonnet-4",
        siteUrl: "",
        siteTitle: "Githead"
      });

      expect(saved.hasApiKey).toBe(true);
      expect(saved.model).toBe("anthropic/claude-sonnet-4");
      await expect(service.getApiKey()).resolves.toBe("sk-or-key");
    });
  });

  it("fails clearly when secure storage is unavailable for a new key", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage(false));

      await expect(service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        siteUrl: "",
        siteTitle: "Githead"
      })).rejects.toThrow("Secure API key storage is not available on this system.");
    });
  });

  it("requires an API key when no key has been stored", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await expect(service.saveSettings({
        apiKey: "",
        model: "openrouter/auto",
        siteUrl: "",
        siteTitle: "Githead"
      })).rejects.toThrow("Enter an OpenRouter API key.");
    });
  });
});
