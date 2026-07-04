import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import type { AiCliProvider, AiCliProviderStatus } from "../shared/types";
import {
  AiSettingsService,
  DEFAULT_AI_PROVIDER_MODELS,
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

const cliStatus: Record<AiCliProvider, AiCliProviderStatus> = {
  "codex-cli": {
    detected: true,
    authenticated: true,
    message: "Codex CLI is authenticated."
  },
  "claude-code": {
    detected: false,
    authenticated: false,
    message: "Claude Code was not detected."
  }
};

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

function createService(dir: string, secretStorage: SecretStorage = new FakeSecretStorage()): AiSettingsService {
  return new AiSettingsService(dir, secretStorage, async () => cliStatus);
}

describe("AiSettingsService", () => {
  it("uses provider defaults when no settings are stored", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      await expect(service.getSettings()).resolves.toEqual({
        selectedProvider: "openrouter",
        providers: {
          openrouter: {
            model: DEFAULT_AI_PROVIDER_MODELS.openrouter,
            prDescriptionModel: "",
            hasApiKey: false
          },
          openai: {
            model: DEFAULT_AI_PROVIDER_MODELS.openai,
            prDescriptionModel: "",
            hasApiKey: false
          },
          "codex-cli": {
            model: DEFAULT_AI_PROVIDER_MODELS["codex-cli"],
            prDescriptionModel: "",
            hasApiKey: false
          },
          anthropic: {
            model: DEFAULT_AI_PROVIDER_MODELS.anthropic,
            prDescriptionModel: "",
            hasApiKey: false
          },
          "claude-code": {
            model: DEFAULT_AI_PROVIDER_MODELS["claude-code"],
            prDescriptionModel: "",
            hasApiKey: false
          }
        },
        cliStatus,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT
      });
    });
  });

  it("migrates legacy OpenRouter model and encrypted API key", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        model: "openrouter/auto",
        encryptedApiKey: Buffer.from("encrypted:sk-or-key", "utf8").toString("base64"),
        siteUrl: "https://example.test",
        siteTitle: "Githead Test"
      }), "utf8");
      const service = createService(dir);

      const settings = await service.getSettings();

      expect(settings.selectedProvider).toBe("openrouter");
      expect(settings.providers.openrouter).toEqual({
        model: "openrouter/auto",
        prDescriptionModel: "",
        hasApiKey: true
      });
      expect(settings.commitMessagePrompt).toBe(DEFAULT_COMMIT_MESSAGE_PROMPT);
      expect(settings.prDescriptionPrompt).toBe(DEFAULT_PR_DESCRIPTION_PROMPT);
      await expect(service.getApiKey("openrouter")).resolves.toBe("sk-or-key");
    });
  });

  it("persists multiple encrypted API keys and exposes only key presence", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      const saved = await service.saveSettings({
        selectedProvider: "anthropic",
        providerModels: {
          ...DEFAULT_AI_PROVIDER_MODELS,
          anthropic: "claude-haiku-4-5-20251001"
        },
        apiKeys: {
          openai: "sk-openai",
          anthropic: "sk-ant"
        },
        commitMessagePrompt: "  Write a focused commit message.  "
      });

      expect(saved.providers.openai.hasApiKey).toBe(true);
      expect(saved.providers.anthropic.hasApiKey).toBe(true);
      expect(saved.providers.openrouter.hasApiKey).toBe(false);
      expect(saved.commitMessagePrompt).toBe("Write a focused commit message.");
      await expect(service.getApiKey("openai")).resolves.toBe("sk-openai");
      await expect(service.getApiKey("anthropic")).resolves.toBe("sk-ant");
      await expect(fs.readFile(path.join(dir, "ai-settings.json"), "utf8"))
        .resolves.not.toContain("sk-openai");
    });
  });

  it("preserves existing keys on blank saves and clears only requested providers", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      await service.saveSettings({
        selectedProvider: "openai",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        apiKeys: {
          openai: "sk-openai",
          anthropic: "sk-ant"
        },
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });
      const saved = await service.saveSettings({
        selectedProvider: "openai",
        providerModels: {
          ...DEFAULT_AI_PROVIDER_MODELS,
          openai: "gpt-5.4-mini"
        },
        apiKeys: {
          openai: ""
        },
        clearApiKeys: {
          anthropic: true
        },
        commitMessagePrompt: "Use one-line commit messages."
      });

      expect(saved.providers.openai.hasApiKey).toBe(true);
      expect(saved.providers.anthropic.hasApiKey).toBe(false);
      expect(saved.providers.openai.model).toBe("gpt-5.4-mini");
      await expect(service.getApiKey("openai")).resolves.toBe("sk-openai");
      await expect(service.getApiKey("anthropic")).resolves.toBeNull();
    });
  });

  it("does not require an API key for CLI providers", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      await expect(service.saveSettings({
        selectedProvider: "codex-cli",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        apiKeys: {},
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      })).resolves.toMatchObject({
        selectedProvider: "codex-cli"
      });
    });
  });

  it("requires an API key for the selected direct API provider", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      await expect(service.saveSettings({
        selectedProvider: "openai",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        apiKeys: {},
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      })).rejects.toThrow("Enter an OpenAI API key.");
    });
  });

  it("fails clearly when secure storage is unavailable for a new key", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir, new FakeSecretStorage(false));

      await expect(service.saveSettings({
        selectedProvider: "openrouter",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        apiKeys: {
          openrouter: "sk-or-key"
        },
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      })).rejects.toThrow("Secure API key storage is not available on this system.");
    });
  });

  it("requires a commit message prompt when saving settings", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      await expect(service.saveSettings({
        selectedProvider: "codex-cli",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        commitMessagePrompt: " "
      })).rejects.toThrow("Enter a commit message prompt.");
    });
  });
});
