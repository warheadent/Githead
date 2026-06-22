import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings, AppSettingsSaveRequest } from "../shared/types";

interface StoredAppSettings {
  autoFetchIntervalMinutes?: unknown;
}

export const DEFAULT_AUTO_FETCH_INTERVAL_MINUTES = 10;
export const MIN_AUTO_FETCH_INTERVAL_MINUTES = 0;
export const MAX_AUTO_FETCH_INTERVAL_MINUTES = 1440;

export class AppSettingsService {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "app-settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    return {
      autoFetchIntervalMinutes: parseStoredInterval(stored.autoFetchIntervalMinutes)
    };
  }

  async saveSettings(request: AppSettingsSaveRequest): Promise<AppSettings> {
    const autoFetchIntervalMinutes = normalizeIntervalForSave(request.autoFetchIntervalMinutes);

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify({
      autoFetchIntervalMinutes
    } satisfies AppSettings, null, 2)}\n`, "utf8");

    return this.getSettings();
  }

  private async readStoredSettings(): Promise<StoredAppSettings> {
    try {
      const text = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(text) as StoredAppSettings;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
}

function parseStoredInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_AUTO_FETCH_INTERVAL_MINUTES;
  }

  if (value < MIN_AUTO_FETCH_INTERVAL_MINUTES || value > MAX_AUTO_FETCH_INTERVAL_MINUTES) {
    return DEFAULT_AUTO_FETCH_INTERVAL_MINUTES;
  }

  return value;
}

function normalizeIntervalForSave(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error("Auto-fetch interval must be a whole number of minutes.");
  }

  if (value < MIN_AUTO_FETCH_INTERVAL_MINUTES) {
    throw new Error("Auto-fetch interval cannot be negative.");
  }

  if (value > MAX_AUTO_FETCH_INTERVAL_MINUTES) {
    throw new Error(`Auto-fetch interval cannot exceed ${MAX_AUTO_FETCH_INTERVAL_MINUTES} minutes.`);
  }

  return value;
}
