import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import {
  AiSettingsService,
  DEFAULT_OPENROUTER_MODEL,
  type SecretStorage
} from "./aiSettingsService";

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
  it("uses the default OpenRouter model when no model is stored", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await expect(service.getSettings()).resolves.toEqual({
        hasApiKey: false,
        model: DEFAULT_OPENROUTER_MODEL,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });
    });
  });

  it("persists encrypted API keys and exposes only key presence", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      const saved = await service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        commitMessagePrompt: "  Write a focused commit message.  "
      });

      expect(saved).toEqual({
        hasApiKey: true,
        model: "openrouter/auto",
        commitMessagePrompt: "Write a focused commit message."
      });
      await expect(service.getApiKey()).resolves.toBe("sk-or-key");
      await expect(fs.readFile(path.join(dir, "ai-settings.json"), "utf8"))
        .resolves.not.toContain("sk-or-key");
      await expect(fs.readFile(path.join(dir, "ai-settings.json"), "utf8"))
        .resolves.toContain("Write a focused commit message.");
    });
  });

  it("ignores legacy attribution fields and defaults a missing prompt", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        model: "openrouter/auto",
        siteUrl: "https://example.test",
        siteTitle: "Githead Test"
      }), "utf8");
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await expect(service.getSettings()).resolves.toEqual({
        hasApiKey: false,
        model: "openrouter/auto",
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });
    });
  });

  it("preserves an existing API key when saving a blank key", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });
      const saved = await service.saveSettings({
        apiKey: "",
        model: "anthropic/claude-sonnet-4",
        commitMessagePrompt: "Use one-line commit messages."
      });

      expect(saved.hasApiKey).toBe(true);
      expect(saved.model).toBe("anthropic/claude-sonnet-4");
      expect(saved.commitMessagePrompt).toBe("Use one-line commit messages.");
      await expect(service.getApiKey()).resolves.toBe("sk-or-key");
    });
  });

  it("fails clearly when secure storage is unavailable for a new key", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage(false));

      await expect(service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      })).rejects.toThrow("Secure API key storage is not available on this system.");
    });
  });

  it("requires an API key when no key has been stored", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await expect(service.saveSettings({
        apiKey: "",
        model: "openrouter/auto",
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      })).rejects.toThrow("Enter an OpenRouter API key.");
    });
  });

  it("requires a commit message prompt when saving settings", async () => {
    await withTempDir(async (dir) => {
      const service = new AiSettingsService(dir, new FakeSecretStorage());

      await expect(service.saveSettings({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        commitMessagePrompt: " "
      })).rejects.toThrow("Enter a commit message prompt.");
    });
  });
});
