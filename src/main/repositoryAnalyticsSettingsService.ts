import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ANALYTICS_EXCLUDED_PATHS, normalizeExcludedPaths } from "../shared/analyticsPathFilter";
import type { RepositoryAnalyticsSettings } from "../shared/types";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

interface StoredRepositoryAnalyticsSettings {
  version: 1;
  repositories: RepositoryAnalyticsSettings[];
}

/** Per-repository analytics preferences stored in the app's user data folder. */
export class RepositoryAnalyticsSettingsService {
  private readonly settingsPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "repository-analytics-settings.json");
  }

  async getSettings(repoPath: string): Promise<RepositoryAnalyticsSettings> {
    const normalizedPath = requireRepoPath(repoPath);
    const stored = (await this.readSettings()).find((item) => getRepoPathKey(item.repoPath) === getRepoPathKey(normalizedPath));
    return stored ?? { repoPath: normalizedPath, excludedPaths: [...DEFAULT_ANALYTICS_EXCLUDED_PATHS] };
  }

  async saveSettings(request: RepositoryAnalyticsSettings): Promise<RepositoryAnalyticsSettings> {
    const repoPath = requireRepoPath(request.repoPath);
    if (!Array.isArray(request.excludedPaths) || request.excludedPaths.some((pattern) => typeof pattern !== "string")) {
      throw new Error("Excluded paths must be a list of patterns.");
    }
    const next: RepositoryAnalyticsSettings = { repoPath, excludedPaths: normalizeExcludedPaths(request.excludedPaths) };
    return this.enqueueMutation(async () => {
      const repoKey = getRepoPathKey(repoPath);
      const settings = (await this.readSettings()).filter((item) => getRepoPathKey(item.repoPath) !== repoKey);
      await this.writeSettings([...settings, next]);
      return next;
    });
  }

  private async readSettings(): Promise<RepositoryAnalyticsSettings[]> {
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

  private async writeSettings(repositories: RepositoryAnalyticsSettings[]): Promise<void> {
    const stored: StoredRepositoryAnalyticsSettings = { version: 1, repositories };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    const temporary = `${this.settingsPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    await fs.rename(temporary, this.settingsPath);
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function sanitizeSettings(values: unknown[]): RepositoryAnalyticsSettings[] {
  const seen = new Set<string>();
  const settings: RepositoryAnalyticsSettings[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const repoPath = typeof value.repoPath === "string" ? normalizeRepoPath(value.repoPath) : null;
    if (!repoPath || !Array.isArray(value.excludedPaths)) continue;
    const key = getRepoPathKey(repoPath);
    if (seen.has(key)) continue;
    seen.add(key);
    settings.push({ repoPath, excludedPaths: normalizeExcludedPaths(value.excludedPaths.filter((pattern): pattern is string => typeof pattern === "string")) });
  }
  return settings;
}

function requireRepoPath(repoPath: string): string {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) throw new Error("Choose a repository before editing analytics settings.");
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
