import fs from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import {
  AI_API_KEY_PROVIDERS,
  AI_CLI_PROVIDERS,
  AI_COMMIT_MESSAGE_PROVIDERS,
  AI_REASONING_EFFORTS,
  DEFAULT_COMMIT_PLAN_GRANULARITY,
  type AiApiKeyProvider,
  type AiCliProvider,
  type AiCliProviderStatus,
  type AiCommitMessageProvider,
  type AiProviderSettings,
  type AiReasoningEffort,
  type AiSettings,
  type AiSettingsSaveRequest,
  type CommitPlanGranularity,
  type RepositoryAiSettings,
  type RepositoryAiSettingsSaveRequest,
  type SourceControlWritingStyle,
  type SourceControlWritingStyleMode
} from "../shared/types";
import { runEffect, tryPromise } from "../shared/effectRuntime";

const LEGACY_DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.4-nano";
const LEGACY_DEFAULT_CODEX_CLI_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
export const DEFAULT_CODEX_CLI_MODEL = "gpt-5.6-luna";
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
  commitPlanGranularity?: CommitPlanGranularity;
  providerModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  encryptedApiKeys?: Partial<Record<AiApiKeyProvider, string>>;
  commitMessagePrompt?: string;
  prDescriptionPrompt?: string;
  sourceControlWritingStyle?: Partial<SourceControlWritingStyle>;

  model?: string;
  siteUrl?: string;
  siteTitle?: string;
  encryptedApiKey?: string;
}

interface StoredRepositoryAiSettings {
  version: 1;
  selectedProvider?: AiCommitMessageProvider;
  commitPlanGranularity?: CommitPlanGranularity;
  providerModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  commitMessagePrompt?: string;
  prDescriptionPrompt?: string;
  sourceControlWritingStyle?: Partial<SourceControlWritingStyle>;
}

const REPOSITORY_SETTINGS_PATH = path.join(".githead", "ai-settings.json");

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

  async getSettings(repoPath?: string): Promise<AiSettings> {
    const globalSettings = await this.getGlobalSettings();
    if (!repoPath) {
      return globalSettings;
    }

    const stored = await this.readRepositorySettings(repoPath);
    return stored ? mergeRepositorySettings(globalSettings, stored) : globalSettings;
  }

  async getRepositorySettings(repoPath: string): Promise<RepositoryAiSettings> {
    const globalSettings = await this.getGlobalSettings();
    const stored = await this.readRepositorySettings(repoPath);
    return {
      repoPath,
      enabled: Boolean(stored),
      settings: stored ? mergeRepositorySettings(globalSettings, stored) : globalSettings
    };
  }

  async saveRepositorySettings(request: RepositoryAiSettingsSaveRequest): Promise<RepositoryAiSettings> {
    const repoPath = request.repoPath.trim();
    if (!repoPath) {
      throw new Error("Repository path is required.");
    }

    const settingsPath = getRepositorySettingsPath(repoPath);
    if (!request.enabled) {
      await fs.rm(settingsPath, { force: true });
      return this.getRepositorySettings(repoPath);
    }

    const repoStat = await fs.stat(repoPath).catch(() => null);
    if (!repoStat?.isDirectory()) {
      throw new Error("Repository folder does not exist.");
    }

    const selectedProvider = sanitizeProvider(request.selectedProvider);
    if (!selectedProvider) {
      throw new Error("Choose an AI provider.");
    }
    const commitMessagePrompt = sanitizePrompt(request.commitMessagePrompt);
    if (!commitMessagePrompt) {
      throw new Error("Enter a commit message prompt.");
    }
    const prDescriptionPrompt = sanitizePrompt(request.prDescriptionPrompt);
    if (!prDescriptionPrompt) {
      throw new Error("Enter a pull request description prompt.");
    }

    const commitPlanReasoningEfforts = request.commitPlanReasoningEfforts === undefined
      ? undefined
      : createSavedReasoningEfforts(request.commitPlanReasoningEfforts);
    const stored: StoredRepositoryAiSettings = {
      version: 1,
      selectedProvider,
      commitPlanGranularity: sanitizeCommitPlanGranularity(request.commitPlanGranularity),
      providerModels: createSavedProviderModels(request.providerModels),
      commitPlanModels: createSavedOptionalModels(request.commitPlanModels),
      ...(commitPlanReasoningEfforts ? { commitPlanReasoningEfforts } : {}),
      prDescriptionModels: createSavedPrDescriptionModels(request.prDescriptionModels),
      reasoningEfforts: createSavedReasoningEfforts(request.reasoningEfforts),
      prDescriptionReasoningEfforts: createSavedReasoningEfforts(request.prDescriptionReasoningEfforts),
      commitMessagePrompt,
      prDescriptionPrompt,
      sourceControlWritingStyle: request.sourceControlWritingStyle === undefined
        ? resolveStoredWritingStyle(
            undefined,
            DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
            commitMessagePrompt,
            prDescriptionPrompt,
            DEFAULT_COMMIT_MESSAGE_PROMPT,
            DEFAULT_PR_DESCRIPTION_PROMPT
          )
        : sanitizeWritingStyle(request.sourceControlWritingStyle)
    };

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await writeJsonFile(settingsPath, stored);
    return this.getRepositorySettings(repoPath);
  }

  private async getGlobalSettings(): Promise<AiSettings> {
    const [
      stored,
      cliStatus
    ] = await runEffect(Effect.all([
      tryPromise(() => this.readStoredSettings()),
      tryPromise(() => this.getCliStatus())
    ], { concurrency: "unbounded" }));

    const encryptedApiKeys = getStoredEncryptedApiKeys(stored);

    return {
      selectedProvider: sanitizeProvider(stored.selectedProvider) ?? "openrouter",
      providers: createProviderSettings(stored, encryptedApiKeys),
      cliStatus,
      commitPlanGranularity: sanitizeCommitPlanGranularity(stored.commitPlanGranularity),
      commitMessagePrompt: sanitizePrompt(stored.commitMessagePrompt) || DEFAULT_COMMIT_MESSAGE_PROMPT,
      prDescriptionPrompt: sanitizePrompt(stored.prDescriptionPrompt) || DEFAULT_PR_DESCRIPTION_PROMPT,
      sourceControlWritingStyle: resolveStoredWritingStyle(
        stored.sourceControlWritingStyle,
        DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
        stored.commitMessagePrompt,
        stored.prDescriptionPrompt,
        DEFAULT_COMMIT_MESSAGE_PROMPT,
        DEFAULT_PR_DESCRIPTION_PROMPT
      )
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
    const commitPlanModels = createSavedOptionalModels(
      request.commitPlanModels ?? existing.commitPlanModels
    );
    const reasoningEfforts = createSavedReasoningEfforts(request.reasoningEfforts ?? existing.reasoningEfforts);
    const savedCommitPlanReasoningEfforts = request.commitPlanReasoningEfforts ?? existing.commitPlanReasoningEfforts;
    const commitPlanReasoningEfforts = savedCommitPlanReasoningEfforts === undefined
      ? undefined
      : createSavedReasoningEfforts(savedCommitPlanReasoningEfforts);
    const prDescriptionReasoningEfforts = createSavedReasoningEfforts(
      request.prDescriptionReasoningEfforts ?? existing.prDescriptionReasoningEfforts
    );
    const prDescriptionPrompt = request.prDescriptionPrompt === undefined
      ? sanitizePrompt(existing.prDescriptionPrompt)
      : sanitizePrompt(request.prDescriptionPrompt);
    const commitPlanGranularity = sanitizeCommitPlanGranularity(
      request.commitPlanGranularity ?? existing.commitPlanGranularity
    );

    const stored: StoredAiSettings = {
      selectedProvider,
      commitPlanGranularity,
      providerModels,
      reasoningEfforts,
      ...(commitPlanReasoningEfforts ? { commitPlanReasoningEfforts } : {}),
      prDescriptionReasoningEfforts,
      commitMessagePrompt,
      sourceControlWritingStyle: request.sourceControlWritingStyle === undefined
        ? resolveStoredWritingStyle(
            existing.sourceControlWritingStyle,
            DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
            commitMessagePrompt,
            prDescriptionPrompt,
            DEFAULT_COMMIT_MESSAGE_PROMPT,
            DEFAULT_PR_DESCRIPTION_PROMPT
          )
        : sanitizeWritingStyle(request.sourceControlWritingStyle),
      ...(Object.keys(commitPlanModels).length > 0 ? { commitPlanModels } : {}),
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

  private async readRepositorySettings(repoPath: string): Promise<StoredRepositoryAiSettings | null> {
    try {
      const text = await fs.readFile(getRepositorySettingsPath(repoPath), "utf8");
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Repository AI settings must contain a JSON object.");
      }
      return parsed as StoredRepositoryAiSettings;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Repository AI settings contain invalid JSON: ${error.message}`);
      }
      throw error;
    }
  }
}

function mergeRepositorySettings(global: AiSettings, stored: StoredRepositoryAiSettings): AiSettings {
  const providers = AI_COMMIT_MESSAGE_PROVIDERS.reduce((result, provider) => {
    const base = global.providers[provider];
    result[provider] = {
      ...base,
      model: sanitizeSetting(stored.providerModels?.[provider]) || base.model,
      commitPlanModel: stored.commitPlanModels?.[provider] === undefined
        ? base.commitPlanModel ?? ""
        : sanitizeSetting(stored.commitPlanModels[provider]),
      commitPlanReasoningEffort: stored.commitPlanReasoningEfforts?.[provider] === undefined
        ? base.commitPlanReasoningEffort
        : sanitizeReasoningEffort(stored.commitPlanReasoningEfforts[provider]),
      prDescriptionModel: stored.prDescriptionModels?.[provider] === undefined
        ? base.prDescriptionModel
        : sanitizeSetting(stored.prDescriptionModels[provider]),
      reasoningEffort: stored.reasoningEfforts?.[provider] === undefined
        ? base.reasoningEffort
        : sanitizeReasoningEffort(stored.reasoningEfforts[provider]),
      prDescriptionReasoningEffort: stored.prDescriptionReasoningEfforts?.[provider] === undefined
        ? base.prDescriptionReasoningEffort
        : sanitizeReasoningEffort(stored.prDescriptionReasoningEfforts[provider])
    };
    return result;
  }, {} as Record<AiCommitMessageProvider, AiProviderSettings>);

  return {
    ...global,
    selectedProvider: sanitizeProvider(stored.selectedProvider) ?? global.selectedProvider,
    providers,
    commitPlanGranularity: stored.commitPlanGranularity === undefined
      ? global.commitPlanGranularity
      : sanitizeCommitPlanGranularity(stored.commitPlanGranularity),
    commitMessagePrompt: sanitizePrompt(stored.commitMessagePrompt) || global.commitMessagePrompt,
    prDescriptionPrompt: sanitizePrompt(stored.prDescriptionPrompt) || global.prDescriptionPrompt,
    sourceControlWritingStyle: resolveStoredWritingStyle(
      stored.sourceControlWritingStyle,
      global.sourceControlWritingStyle,
      stored.commitMessagePrompt,
      stored.prDescriptionPrompt,
      global.commitMessagePrompt,
      global.prDescriptionPrompt
    )
  };
}

function sanitizeWritingStyle(style: Partial<SourceControlWritingStyle> | undefined): SourceControlWritingStyle {
  return {
    mode: sanitizeWritingStyleMode(style?.mode) ?? DEFAULT_SOURCE_CONTROL_WRITING_STYLE.mode,
    customInstructions: sanitizePrompt(style?.customInstructions)
  };
}

function sanitizeWritingStyleMode(value: unknown): SourceControlWritingStyleMode | null {
  return value === "repo_conventions" || value === "conventional_commits" || value === "custom"
    ? value
    : null;
}

function resolveStoredWritingStyle(
  stored: Partial<SourceControlWritingStyle> | undefined,
  fallback: SourceControlWritingStyle,
  legacyCommitPrompt: string | undefined,
  legacyPrPrompt: string | undefined,
  baseCommitPrompt: string,
  basePrPrompt: string
): SourceControlWritingStyle {
  const mode = sanitizeWritingStyleMode(stored?.mode);
  if (mode) {
    return {
      mode,
      customInstructions: sanitizePrompt(stored?.customInstructions)
    };
  }

  const commitPrompt = sanitizePrompt(legacyCommitPrompt);
  const prPrompt = sanitizePrompt(legacyPrPrompt);
  const legacyInstructions = [
    commitPrompt && commitPrompt !== baseCommitPrompt.trim() ? `Commit messages:\n${commitPrompt}` : "",
    prPrompt && prPrompt !== basePrPrompt.trim() ? `Pull request descriptions:\n${prPrompt}` : ""
  ].filter(Boolean).join("\n\n");

  return legacyInstructions
    ? { mode: "custom", customInstructions: legacyInstructions }
    : { ...fallback };
}

function getRepositorySettingsPath(repoPath: string): string {
  return path.join(path.resolve(repoPath), REPOSITORY_SETTINGS_PATH);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
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
      commitPlanModel: sanitizeSetting(stored.commitPlanModels?.[provider]),
      commitPlanReasoningEffort: stored.commitPlanReasoningEfforts?.[provider] === undefined
        ? sanitizeReasoningEffort(stored.reasoningEfforts?.[provider])
        : sanitizeReasoningEffort(stored.commitPlanReasoningEfforts[provider]),
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

function createSavedOptionalModels(
  models: Partial<Record<AiCommitMessageProvider, string>> | undefined
): Partial<Record<AiCommitMessageProvider, string>> {
  return createSavedPrDescriptionModels(models);
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
  if (models.openrouter === LEGACY_DEFAULT_OPENROUTER_MODEL) {
    models.openrouter = DEFAULT_OPENROUTER_MODEL;
  }
  if (models["codex-cli"] === LEGACY_DEFAULT_CODEX_CLI_MODEL) {
    models["codex-cli"] = DEFAULT_CODEX_CLI_MODEL;
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

function sanitizeCommitPlanGranularity(value: string | undefined): CommitPlanGranularity {
  return value === "hunk" || value === "file" ? value : DEFAULT_COMMIT_PLAN_GRANULARITY;
}

function sanitizePrompt(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
