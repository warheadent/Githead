import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import type { AiSettings, AiSettingsSaveRequest } from "../shared/types";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

interface StoredAiSettings {
  model?: string;
  siteUrl?: string;
  siteTitle?: string;
  commitMessagePrompt?: string;
  encryptedApiKey?: string;
}

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class AiSettingsService {
  private readonly settingsPath: string;

  constructor(
    userDataPath: string,
    private readonly secretStorage: SecretStorage
  ) {
    this.settingsPath = path.join(userDataPath, "ai-settings.json");
  }

  async getSettings(): Promise<AiSettings> {
    const stored = await this.readStoredSettings();

    return {
      hasApiKey: Boolean(stored.encryptedApiKey),
      model: sanitizeSetting(stored.model) || DEFAULT_OPENROUTER_MODEL,
      commitMessagePrompt: sanitizePrompt(stored.commitMessagePrompt) || DEFAULT_COMMIT_MESSAGE_PROMPT
    };
  }

  async saveSettings(request: AiSettingsSaveRequest): Promise<AiSettings> {
    const model = sanitizeSetting(request.model);
    if (!model) {
      throw new Error("Enter an OpenRouter model.");
    }

    const commitMessagePrompt = sanitizePrompt(request.commitMessagePrompt);
    if (!commitMessagePrompt) {
      throw new Error("Enter a commit message prompt.");
    }

    const existing = await this.readStoredSettings();
    const apiKey = request.apiKey?.trim();
    let encryptedApiKey = request.clearApiKey ? undefined : existing.encryptedApiKey;

    if (!apiKey && !encryptedApiKey) {
      throw new Error("Enter an OpenRouter API key.");
    }

    if (apiKey) {
      if (!this.secretStorage.isEncryptionAvailable()) {
        throw new Error("Secure API key storage is not available on this system.");
      }

      encryptedApiKey = this.secretStorage.encryptString(apiKey).toString("base64");
    }

    const stored: StoredAiSettings = {
      model,
      commitMessagePrompt,
      ...(encryptedApiKey ? { encryptedApiKey } : {})
    };

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");

    return this.getSettings();
  }

  async getApiKey(): Promise<string | null> {
    const stored = await this.readStoredSettings();
    if (!stored.encryptedApiKey) {
      return null;
    }

    if (!this.secretStorage.isEncryptionAvailable()) {
      throw new Error("Secure API key storage is not available on this system.");
    }

    return this.secretStorage.decryptString(Buffer.from(stored.encryptedApiKey, "base64"));
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

function sanitizeSetting(value: string | undefined): string {
  return value?.trim() ?? "";
}

function sanitizePrompt(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
