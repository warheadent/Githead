import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
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
        commitPlanGranularity: "file",
        providers: {
          openrouter: {
            model: DEFAULT_AI_PROVIDER_MODELS.openrouter,
            commitPlanModel: "",
            commitPlanReasoningEffort: "low",
            prDescriptionModel: "",
            reasoningEffort: "low",
            prDescriptionReasoningEffort: "low",
            hasApiKey: false
          },
          openai: {
            model: DEFAULT_AI_PROVIDER_MODELS.openai,
            commitPlanModel: "",
            commitPlanReasoningEffort: "low",
            prDescriptionModel: "",
            reasoningEffort: "low",
            prDescriptionReasoningEffort: "low",
            hasApiKey: false
          },
          "codex-cli": {
            model: DEFAULT_AI_PROVIDER_MODELS["codex-cli"],
            commitPlanModel: "",
            commitPlanReasoningEffort: "low",
            prDescriptionModel: "",
            reasoningEffort: "low",
            prDescriptionReasoningEffort: "low",
            hasApiKey: false
          },
          anthropic: {
            model: DEFAULT_AI_PROVIDER_MODELS.anthropic,
            commitPlanModel: "",
            commitPlanReasoningEffort: "low",
            prDescriptionModel: "",
            reasoningEffort: "low",
            prDescriptionReasoningEffort: "low",
            hasApiKey: false
          },
          "claude-code": {
            model: DEFAULT_AI_PROVIDER_MODELS["claude-code"],
            commitPlanModel: "",
            commitPlanReasoningEffort: "low",
            prDescriptionModel: "",
            reasoningEffort: "low",
            prDescriptionReasoningEffort: "low",
            hasApiKey: false
          }
        },
        cliStatus,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT,
        sourceControlWritingStyle: { mode: "conventional_commits", customInstructions: "" }
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
        commitPlanModel: "",
        commitPlanReasoningEffort: "low",
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      });
      expect(settings.commitMessagePrompt).toBe(DEFAULT_COMMIT_MESSAGE_PROMPT);
      expect(settings.prDescriptionPrompt).toBe(DEFAULT_PR_DESCRIPTION_PROMPT);
      await expect(service.getApiKey("openrouter")).resolves.toBe("sk-or-key");
    });
  });

  it("migrates the former OpenRouter default without replacing custom models", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        providerModels: {
          openrouter: "openai/gpt-5.4-nano",
          openai: "gpt-5.4-mini"
        }
      }), "utf8");
      const service = createService(dir);

      const migrated = await service.getSettings();

      expect(migrated.providers.openrouter.model).toBe(DEFAULT_AI_PROVIDER_MODELS.openrouter);
      expect(migrated.providers.openai.model).toBe("gpt-5.4-mini");

      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        providerModels: {
          openrouter: "openrouter/auto"
        }
      }), "utf8");

      const custom = await service.getSettings();

      expect(custom.providers.openrouter.model).toBe("openrouter/auto");
    });
  });

  it("migrates the former Codex CLI default without replacing custom models", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        providerModels: {
          "codex-cli": "gpt-5.4-mini"
        }
      }), "utf8");
      const service = createService(dir);

      const migrated = await service.getSettings();

      expect(migrated.providers["codex-cli"].model).toBe(DEFAULT_AI_PROVIDER_MODELS["codex-cli"]);

      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        providerModels: {
          "codex-cli": "gpt-5.3-codex"
        }
      }), "utf8");

      const custom = await service.getSettings();

      expect(custom.providers["codex-cli"].model).toBe("gpt-5.3-codex");
    });
  });

  it("defaults invalid reasoning values and persists efforts per provider", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "ai-settings.json"), JSON.stringify({
        reasoningEfforts: { openai: "turbo", "codex-cli": "high" },
        commitPlanReasoningEfforts: { openai: "high" },
        prDescriptionReasoningEfforts: { openai: "medium" }
      }), "utf8");
      const service = createService(dir);

      const migrated = await service.getSettings();
      expect(migrated.providers.openai.reasoningEffort).toBe("low");
      expect(migrated.providers.openai.commitPlanReasoningEffort).toBe("high");
      expect(migrated.providers.openai.prDescriptionReasoningEffort).toBe("medium");
      expect(migrated.providers["codex-cli"].reasoningEffort).toBe("high");

      const saved = await service.saveSettings({
        selectedProvider: "codex-cli",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        reasoningEfforts: {
          openrouter: "medium",
          "codex-cli": "high"
        },
        commitPlanReasoningEfforts: {
          openrouter: "xhigh",
          "codex-cli": "medium"
        },
        prDescriptionReasoningEfforts: {
          openrouter: "high",
          "codex-cli": "medium"
        },
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });

      expect(saved.providers.openrouter.reasoningEffort).toBe("medium");
      expect(saved.providers.openrouter.commitPlanReasoningEffort).toBe("xhigh");
      expect(saved.providers.openrouter.prDescriptionReasoningEffort).toBe("high");
      expect(saved.providers["codex-cli"].reasoningEffort).toBe("high");
      expect(saved.providers["codex-cli"].commitPlanReasoningEffort).toBe("medium");
      expect(saved.providers["codex-cli"].prDescriptionReasoningEffort).toBe("medium");
    });
  });

  it("persists source control writing style settings", async () => {
    await withTempDir(async (dir) => {
      const service = createService(dir);

      const saved = await service.saveSettings({
        selectedProvider: "codex-cli",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
        sourceControlWritingStyle: {
          mode: "custom",
          customInstructions: "  Use sentence case.  "
        }
      });

      expect(saved.sourceControlWritingStyle).toEqual({
        mode: "custom",
        customInstructions: "Use sentence case."
      });
      await expect(createService(dir).getSettings()).resolves.toMatchObject({
        sourceControlWritingStyle: {
          mode: "custom",
          customInstructions: "Use sentence case."
        }
      });
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
        commitPlanGranularity: "hunk",
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

  it("stores repository overrides in the repository and applies them to generation settings", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "repo");
      await fs.mkdir(repoPath);
      const service = createService(dir);
      await service.saveSettings({
        selectedProvider: "openai",
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        apiKeys: { openai: "sk-openai" },
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
      });

      const saved = await service.saveRepositorySettings({
        repoPath,
        enabled: true,
        selectedProvider: "codex-cli",
        commitPlanGranularity: "file",
        providerModels: { ...DEFAULT_AI_PROVIDER_MODELS, "codex-cli": "gpt-repo" },
        commitPlanModels: { "codex-cli": "gpt-repo-plan" },
        commitPlanReasoningEfforts: { "codex-cli": "xhigh" },
        prDescriptionModels: { "codex-cli": "gpt-repo-pr" },
        reasoningEfforts: { "codex-cli": "high" },
        prDescriptionReasoningEfforts: { "codex-cli": "medium" },
        commitMessagePrompt: "Write a repository commit message.",
        prDescriptionPrompt: "Write a repository pull request description."
      });

      expect(saved.enabled).toBe(true);
      expect(saved.settings.selectedProvider).toBe("codex-cli");
      expect(saved.settings.commitPlanGranularity).toBe("file");
      expect(saved.settings.providers["codex-cli"]).toMatchObject({
        model: "gpt-repo",
        commitPlanModel: "gpt-repo-plan",
        commitPlanReasoningEffort: "xhigh",
        prDescriptionModel: "gpt-repo-pr",
        reasoningEffort: "high",
        prDescriptionReasoningEffort: "medium"
      });
      expect(saved.settings.providers.openai.hasApiKey).toBe(true);

      const updated = await service.saveRepositorySettings({
        repoPath,
        enabled: true,
        selectedProvider: "codex-cli",
        providerModels: { ...DEFAULT_AI_PROVIDER_MODELS, "codex-cli": "gpt-repo-updated" },
        commitPlanModels: { "codex-cli": "gpt-repo-plan-updated" },
        commitPlanReasoningEfforts: { "codex-cli": "medium" },
        prDescriptionModels: { "codex-cli": "gpt-repo-pr" },
        reasoningEfforts: { "codex-cli": "high" },
        prDescriptionReasoningEfforts: { "codex-cli": "medium" },
        commitMessagePrompt: "Write a repository commit message.",
        prDescriptionPrompt: "Write a repository pull request description."
      });
      expect(updated.settings.providers["codex-cli"].model).toBe("gpt-repo-updated");
      expect(updated.settings.providers["codex-cli"].commitPlanModel).toBe("gpt-repo-plan-updated");
      expect(updated.settings.providers["codex-cli"].commitPlanReasoningEffort).toBe("medium");
      await expect(service.getSettings(repoPath)).resolves.toEqual(updated.settings);

      const storedText = await fs.readFile(path.join(repoPath, ".githead", "ai-settings.json"), "utf8");
      expect(storedText).toContain("Write a repository commit message.");
      expect(storedText).not.toContain("sk-openai");
    });
  });

  it("removes a repository override when the repository uses global settings", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "repo");
      await fs.mkdir(repoPath);
      const service = createService(dir);
      const request = {
        repoPath,
        enabled: true,
        selectedProvider: "codex-cli" as const,
        providerModels: DEFAULT_AI_PROVIDER_MODELS,
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT
      };
      await service.saveRepositorySettings(request);

      const cleared = await service.saveRepositorySettings({ ...request, enabled: false });

      expect(cleared.enabled).toBe(false);
      await expect(fs.stat(path.join(repoPath, ".githead", "ai-settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(service.getSettings(repoPath)).resolves.toEqual(cleared.settings);
    });
  });

  it("reports invalid repository settings JSON", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "repo");
      await fs.mkdir(path.join(repoPath, ".githead"), { recursive: true });
      await fs.writeFile(path.join(repoPath, ".githead", "ai-settings.json"), "{ invalid", "utf8");
      const service = createService(dir);

      await expect(service.getSettings(repoPath)).rejects.toThrow("Repository AI settings contain invalid JSON");
    });
  });
});
