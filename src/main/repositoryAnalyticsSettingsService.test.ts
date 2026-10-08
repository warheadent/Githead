import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_ANALYTICS_EXCLUDED_PATHS } from "../shared/analyticsPathFilter";
import { RepositoryAnalyticsSettingsService } from "./repositoryAnalyticsSettingsService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-analytics-settings-test-"));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("RepositoryAnalyticsSettingsService", () => {
  it("starts from the default vendored folders", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      await expect(new RepositoryAnalyticsSettingsService(dir).getSettings(repoPath)).resolves.toEqual({
        repoPath,
        excludedPaths: [...DEFAULT_ANALYTICS_EXCLUDED_PATHS]
      });
    });
  });

  it("persists normalized patterns per repository, including an empty list", async () => {
    await withTempDir(async (dir) => {
      const first = path.join(dir, "First");
      const second = path.join(dir, "Second");
      const service = new RepositoryAnalyticsSettingsService(dir);
      await Promise.all([
        service.saveSettings({ repoPath: first, excludedPaths: [" Plugins/ ", "", "# comment", "Plugins/", "!Content/Game/"] }),
        service.saveSettings({ repoPath: second, excludedPaths: [] })
      ]);

      const reloaded = new RepositoryAnalyticsSettingsService(dir);
      await expect(reloaded.getSettings(first)).resolves.toEqual({ repoPath: first, excludedPaths: ["Plugins/", "!Content/Game/"] });
      await expect(reloaded.getSettings(second)).resolves.toEqual({ repoPath: second, excludedPaths: [] });
    });
  });

  it("rejects malformed requests", async () => {
    await withTempDir(async (dir) => {
      const service = new RepositoryAnalyticsSettingsService(dir);
      await expect(service.saveSettings({ repoPath: path.join(dir, "Repo"), excludedPaths: [1] as unknown as string[] })).rejects.toThrow("Excluded paths");
      await expect(service.saveSettings({ repoPath: " ", excludedPaths: [] })).rejects.toThrow("Choose a repository");
    });
  });
});
