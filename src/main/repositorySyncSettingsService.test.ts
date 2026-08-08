import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { RepositorySyncSettingsService } from "./repositorySyncSettingsService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-repository-sync-test-"));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("RepositorySyncSettingsService", () => {
  it("defaults to the global schedule with a ten-minute draft", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      await expect(new RepositorySyncSettingsService(dir).getSettings(repoPath)).resolves.toEqual({
        repoPath,
        enabled: false,
        autoFetchIntervalMinutes: 10
      });
    });
  });

  it("persists independent repository overrides, including disabled auto-fetch", async () => {
    await withTempDir(async (dir) => {
      const firstRepo = path.join(dir, "First");
      const secondRepo = path.join(dir, "Second");
      const service = new RepositorySyncSettingsService(dir);

      await Promise.all([
        service.saveSettings({ repoPath: firstRepo, enabled: true, autoFetchIntervalMinutes: 15 }),
        service.saveSettings({ repoPath: secondRepo, enabled: true, autoFetchIntervalMinutes: 0 })
      ]);

      const reloaded = new RepositorySyncSettingsService(dir);
      await expect(reloaded.getSettings(firstRepo)).resolves.toMatchObject({ enabled: true, autoFetchIntervalMinutes: 15 });
      await expect(reloaded.getSettings(secondRepo)).resolves.toMatchObject({ enabled: true, autoFetchIntervalMinutes: 0 });
    });
  });

  it("removes a repository override when inheritance is restored", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      const service = new RepositorySyncSettingsService(dir);
      await service.saveSettings({ repoPath, enabled: true, autoFetchIntervalMinutes: 30 });
      await service.saveSettings({ repoPath, enabled: false, autoFetchIntervalMinutes: 30 });

      await expect(new RepositorySyncSettingsService(dir).getSettings(repoPath)).resolves.toEqual({
        repoPath,
        enabled: false,
        autoFetchIntervalMinutes: 10
      });
    });
  });

  it("rejects invalid intervals without overwriting stored settings", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      const service = new RepositorySyncSettingsService(dir);
      await service.saveSettings({ repoPath, enabled: true, autoFetchIntervalMinutes: 20 });
      await expect(service.saveSettings({ repoPath, enabled: true, autoFetchIntervalMinutes: 1441 }))
        .rejects.toThrow("Auto-fetch interval cannot exceed 1440 minutes.");
      await expect(service.getSettings(repoPath)).resolves.toMatchObject({ enabled: true, autoFetchIntervalMinutes: 20 });
    });
  });

  it("ignores malformed storage", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      await fs.writeFile(path.join(dir, "repository-sync-settings.json"), "{bad", "utf8");
      await expect(new RepositorySyncSettingsService(dir).getSettings(repoPath)).resolves.toMatchObject({
        enabled: false,
        autoFetchIntervalMinutes: 10
      });
    });
  });
});
