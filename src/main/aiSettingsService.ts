import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import {
  AI_API_KEY_PROVIDERS,
  AI_CLI_PROVIDERS,
  AI_COMMIT_MESSAGE_PROVIDERS,
  AI_REASONING_EFFORTS,
  type AiApiKeyProvider,
  type AiCliProvider,
  type AiCliProviderStatus,
  type AiCommitMessageProvider,
  type AiProviderSettings,
  type AiReasoningEffort,
  type AiSettings,
  type AiSettingsSaveRequest
} from "../shared/types";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.4-nano";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
export const DEFAULT_CODEX_CLI_MODEL = "gpt-5.4-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_CLAUDE_CODE_MODEL = "haiku";
export const DEFAULT_AI_REASONING_EFFORT: AiReasoningEffort = "low";

export const DEFAULT_AI_PROVIDER_MODELS: Record<AiCommitMessageProvider, string> = {
  openrouter: DEFAULT_OPENROUTER_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  "codex-cli": DEFAULT_CODEX_CLI_MODEL,
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  "claude-code": DEFAULT_CLAUDE_CODE_MODEL
};

interface StoredAiSettings {
  selectedProvider?: AiCommitMessageProvider;
  providerModels?: Partial<Record<AiCommitMessageProvider, string>>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  encryptedApiKeys?: Partial<Record<AiApiKeyProvider, string>>;
  commitMessagePrompt?: string;
  prDescriptionPrompt?: string;

  model?: string;
  siteUrl?: string;
  siteTitle?: string;
  encryptedApiKey?: string;
}

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

type CliStatusProvider = () => Promise<Record<AiCliProvider, AiCliProviderStatus>>;

const unavailableCliStatus: Record<AiCliProvider, AiCliProviderStatus> = {
  "codex-cli": {
    detected: false,
    authenticated: false,
    message: "Codex CLI status is unavailable."
  },
  "claude-code": {
    detected: false,
    authenticated: false,
    message: "Claude Code status is unavailable."
  }
};

export class AiSettingsService {
  private readonly settingsPath: string;

  constructor(
    userDataPath: string,
    private readonly secretStorage: SecretStorage,
    private readonly getCliStatus: CliStatusProvider = async () => unavailableCliStatus
  ) {
    this.settingsPath = path.join(userDataPath, "ai-settings.json");
  }

  async getSettings(): Promise<AiSettings> {
    const [
      stored,
      cliStatus
    ] = await Promise.all([
      this.readStoredSettings(),
      this.getCliStatus()
    ]);

    const encryptedApiKeys = getStoredEncryptedApiKeys(stored);

    return {
      selectedProvider: sanitizeProvider(stored.selectedProvider) ?? "openrouter",
      providers: createProviderSettings(stored, encryptedApiKeys),
      cliStatus,
      commitMessagePrompt: sanitizePrompt(stored.commitMessagePrompt) || DEFAULT_COMMIT_MESSAGE_PROMPT,
      prDescriptionPrompt: sanitizePrompt(stored.prDescriptionPrompt) || DEFAULT_PR_DESCRIPTION_PROMPT
    };
  }

  async saveSettings(request: AiSettingsSaveRequest): Promise<AiSettings> {
    const selectedProvider = sanitizeProvider(request.selectedProvider);
    if (!selectedProvider) {
      throw new Error("Choose an AI provider.");
    }

    const commitMessagePrompt = sanitizePrompt(request.commitMessagePrompt);
    if (!commitMessagePrompt) {
      throw new Error("Enter a commit message prompt.");
    }

    const providerModels = createSavedProviderModels(request.providerModels);
    const selectedModel = providerModels[selectedProvider];
    if (!selectedModel) {
      throw new Error(`Enter ${getProviderArticle(selectedProvider)} ${getProviderLabel(selectedProvider)} model.`);
    }

    const existing = await this.readStoredSettings();
    const encryptedApiKeys: Partial<Record<AiApiKeyProvider, string>> = {
      ...getStoredEncryptedApiKeys(existing)
    };

    for (const provider of AI_API_KEY_PROVIDERS) {
      if (request.clearApiKeys?.[provider]) {
        delete encryptedApiKeys[provider];
      }

      const apiKey = request.apiKeys?.[provider]?.trim();
      if (apiKey) {
        if (!this.secretStorage.isEncryptionAvailable()) {
          throw new Error("Secure API key storage is not available on this system.");
        }

        encryptedApiKeys[provider] = this.secretStorage.encryptString(apiKey).toString("base64");
      }
    }

    if (isApiKeyProvider(selectedProvider) && !encryptedApiKeys[selectedProvider]) {
      throw new Error(`Enter ${getProviderArticle(selectedProvider)} ${getProviderLabel(selectedProvider)} API key.`);
    }

    const prDescriptionModels = createSavedPrDescriptionModels(
      request.prDescriptionModels ?? existing.prDescriptionModels
    );
    const reasoningEfforts = createSavedReasoningEfforts(request.reasoningEfforts ?? existing.reasoningEfforts);
    const prDescriptionReasoningEfforts = createSavedReasoningEfforts(
      request.prDescriptionReasoningEfforts ?? existing.prDescriptionReasoningEfforts
    );
    const prDescriptionPrompt = request.prDescriptionPrompt === undefined
      ? sanitizePrompt(existing.prDescriptionPrompt)
      : sanitizePrompt(request.prDescriptionPrompt);

    const stored: StoredAiSettings = {
      selectedProvider,
      providerModels,
      reasoningEfforts,
      prDescriptionReasoningEfforts,
      commitMessagePrompt,
      ...(Object.keys(prDescriptionModels).length > 0 ? { prDescriptionModels } : {}),
      ...(prDescriptionPrompt ? { prDescriptionPrompt } : {}),
      ...(Object.keys(encryptedApiKeys).length > 0 ? { encryptedApiKeys } : {})
    };

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");

    return this.getSettings();
  }

  async getApiKey(provider: AiApiKeyProvider): Promise<string | null> {
    const stored = await this.readStoredSettings();
    const encryptedApiKey = getStoredEncryptedApiKeys(stored)[provider];
    if (!encryptedApiKey) {
      return null;
    }

    if (!this.secretStorage.isEncryptionAvailable()) {
      throw new Error("Secure API key storage is not available on this system.");
    }

    return this.secretStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
  }

  private async readStoredSettings(): Promise<StoredAiSettings> {
    try {
      const text = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(text) as StoredAiSettings;

      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }
}

function createProviderSettings(
  stored: StoredAiSettings,
  encryptedApiKeys: Partial<Record<AiApiKeyProvider, string>>
): Record<AiCommitMessageProvider, AiProviderSettings> {
  const models = createStoredProviderModels(stored);

  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((providers, provider) => {
    providers[provider] = {
      model: models[provider],
      prDescriptionModel: sanitizeSetting(stored.prDescriptionModels?.[provider]),
      reasoningEffort: sanitizeReasoningEffort(stored.reasoningEfforts?.[provider]),
      prDescriptionReasoningEffort: sanitizeReasoningEffort(stored.prDescriptionReasoningEfforts?.[provider]),
      hasApiKey: isApiKeyProvider(provider) ? Boolean(encryptedApiKeys[provider]) : false
    };
    return providers;
  }, {} as Record<AiCommitMessageProvider, AiProviderSettings>);
}

function createSavedReasoningEfforts(
  efforts: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>> | undefined
): Record<AiCommitMessageProvider, AiReasoningEffort> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((saved, provider) => {
    saved[provider] = sanitizeReasoningEffort(efforts?.[provider]);
    return saved;
  }, {} as Record<AiCommitMessageProvider, AiReasoningEffort>);
}

function createSavedPrDescriptionModels(
  models: Partial<Record<AiCommitMessageProvider, string>> | undefined
): Partial<Record<AiCommitMessageProvider, string>> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((saved, provider) => {
    const model = sanitizeSetting(models?.[provider]);
    if (model) {
      saved[provider] = model;
    }
    return saved;
  }, {} as Partial<Record<AiCommitMessageProvider, string>>);
}

function createSavedProviderModels(
  models: Partial<Record<AiCommitMessageProvider, string>> | undefined
): Record<AiCommitMessageProvider, string> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((saved, provider) => {
    saved[provider] = sanitizeSetting(models?.[provider]) || DEFAULT_AI_PROVIDER_MODELS[provider];
    return saved;
  }, {} as Record<AiCommitMessageProvider, string>);
}

function createStoredProviderModels(stored: StoredAiSettings): Record<AiCommitMessageProvider, string> {
  const models = createSavedProviderModels(stored.providerModels);
  const legacyModel = sanitizeSetting(stored.model);
  if (legacyModel && !sanitizeSetting(stored.providerModels?.openrouter)) {
    models.openrouter = legacyModel;
  }

  return models;
}

function getStoredEncryptedApiKeys(stored: StoredAiSettings): Partial<Record<AiApiKeyProvider, string>> {
  return {
    ...stored.encryptedApiKeys,
    ...(stored.encryptedApiKey && !stored.encryptedApiKeys?.openrouter
      ? { openrouter: stored.encryptedApiKey }
      : {})
  };
}

function sanitizeProvider(value: string | undefined): AiCommitMessageProvider | null {
  return AI_COMMIT_MESSAGE_PROVIDERS.includes(value as AiCommitMessageProvider)
    ? value as AiCommitMessageProvider
    : null;
}

export function isApiKeyProvider(provider: AiCommitMessageProvider): provider is AiApiKeyProvider {
  return AI_API_KEY_PROVIDERS.includes(provider as AiApiKeyProvider);
}

export function isCliProvider(provider: AiCommitMessageProvider): provider is AiCliProvider {
  return AI_CLI_PROVIDERS.includes(provider as AiCliProvider);
}

export function getProviderLabel(provider: AiCommitMessageProvider): string {
  switch (provider) {
    case "openrouter":
      return "OpenRouter";
    case "openai":
      return "OpenAI";
    case "codex-cli":
      return "Codex CLI";
    case "anthropic":
      return "Anthropic";
    case "claude-code":
      return "Claude Code";
  }
}

function getProviderArticle(provider: AiCommitMessageProvider): "a" | "an" {
  return provider === "openrouter" || provider === "openai" || provider === "anthropic"
    ? "an"
    : "a";
}

function sanitizeSetting(value: string | undefined): string {
  return value?.trim() ?? "";
}

function sanitizeReasoningEffort(value: string | undefined): AiReasoningEffort {
  return AI_REASONING_EFFORTS.includes(value as AiReasoningEffort)
    ? value as AiReasoningEffort
    : DEFAULT_AI_REASONING_EFFORT;
}

function sanitizePrompt(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
