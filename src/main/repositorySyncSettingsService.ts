import fs from "node:fs/promises";
import path from "node:path";
import type {
  RepositorySyncSettings,
  RepositorySyncSettingsSaveRequest
} from "../shared/types";
import {
  DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
  isValidAutoFetchInterval,
  normalizeAutoFetchIntervalForSave
} from "./autoFetchSettings";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

interface StoredRepositorySyncSettings {
  version: 1;
  repositories: RepositorySyncSettings[];
}

export class RepositorySyncSettingsService {
  private readonly settingsPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "repository-sync-settings.json");
  }

  async getSettings(repoPath: string): Promise<RepositorySyncSettings> {
    const normalizedPath = requireRepoPath(repoPath);
    const stored = (await this.readSettings()).find((item) => (
      getRepoPathKey(item.repoPath) === getRepoPathKey(normalizedPath)
    ));
    return stored ?? {
      repoPath: normalizedPath,
      enabled: false,
      autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES
    };
  }

  async saveSettings(request: RepositorySyncSettingsSaveRequest): Promise<RepositorySyncSettings> {
    const repoPath = requireRepoPath(request.repoPath);
    const autoFetchIntervalMinutes = normalizeAutoFetchIntervalForSave(request.autoFetchIntervalMinutes);
    const nextSetting: RepositorySyncSettings = {
      repoPath,
      enabled: request.enabled,
      autoFetchIntervalMinutes
    };

    return this.enqueueMutation(async () => {
      const settings = await this.readSettings();
      const repoKey = getRepoPathKey(repoPath);
      const next = request.enabled
        ? [...settings.filter((item) => getRepoPathKey(item.repoPath) !== repoKey), nextSetting]
        : settings.filter((item) => getRepoPathKey(item.repoPath) !== repoKey);
      await this.writeSettings(next);
      return nextSetting;
    });
  }

  private async readSettings(): Promise<RepositorySyncSettings[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as unknown;
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.repositories)) return [];
      return sanitizeSettings(parsed.repositories);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  }

  private async writeSettings(repositories: RepositorySyncSettings[]): Promise<void> {
    const stored: StoredRepositorySyncSettings = { version: 1, repositories };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function sanitizeSettings(values: unknown[]): RepositorySyncSettings[] {
  const seen = new Set<string>();
  const settings: RepositorySyncSettings[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const repoPath = typeof value.repoPath === "string" ? normalizeRepoPath(value.repoPath) : null;
    if (!repoPath || value.enabled !== true || !isValidAutoFetchInterval(value.autoFetchIntervalMinutes)) continue;
    const key = getRepoPathKey(repoPath);
    if (seen.has(key)) continue;
    seen.add(key);
    settings.push({ repoPath, enabled: true, autoFetchIntervalMinutes: value.autoFetchIntervalMinutes });
  }
  return settings;
}

function requireRepoPath(repoPath: string): string {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) throw new Error("Choose a repository before editing sync settings.");
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
