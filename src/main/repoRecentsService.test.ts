import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_REPO_RECENTS, RepoRecentsService } from "./repoRecentsService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-repo-recents-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("RepoRecentsService", () => {
  it("returns an empty list when no recents file exists", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);

      await expect(service.getRecents()).resolves.toEqual([]);
    });
  });

  it("falls back to an empty list for corrupt or non-array stored recents", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const recentsPath = path.join(dir, "repo-recents.json");

      await fs.writeFile(recentsPath, "{bad json", "utf8");
      await expect(service.getRecents()).resolves.toEqual([]);

      await fs.writeFile(recentsPath, JSON.stringify({ repoPath: path.join(dir, "Repo") }), "utf8");
      await expect(service.getRecents()).resolves.toEqual([]);
    });
  });

  it("dedupes and caps repositories without promoting existing entries", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const repoPaths = Array.from({ length: MAX_REPO_RECENTS + 2 }, (_value, index) => path.join(dir, `Repo${index}`));

      for (const repoPath of repoPaths) {
        await service.addRecent(repoPath);
      }

      expect(await service.getRecents()).toEqual(repoPaths.slice(0, MAX_REPO_RECENTS));

      const promotedRepo = repoPaths[4]!;
      const duplicatePromotedRepo = process.platform === "win32" ? promotedRepo.toLocaleUpperCase() : promotedRepo;
      expect(await service.addRecent(duplicatePromotedRepo)).toEqual(repoPaths.slice(0, MAX_REPO_RECENTS));
    });
  });

  it("appends new repositories to the bottom", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const firstRepo = path.join(dir, "First");
      const secondRepo = path.join(dir, "Second");

      await expect(service.addRecent(firstRepo)).resolves.toEqual([
        firstRepo
      ]);
      await expect(service.addRecent(secondRepo)).resolves.toEqual([
        firstRepo,
        secondRepo
      ]);
    });
  });

  it("persists manual repository order", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const firstRepo = path.join(dir, "First");
      const secondRepo = path.join(dir, "Second");
      const thirdRepo = path.join(dir, "Third");

      await service.addRecent(firstRepo);
      await service.addRecent(secondRepo);
      await service.addRecent(thirdRepo);

      await expect(service.reorderRecents([
        thirdRepo,
        firstRepo,
        secondRepo
      ])).resolves.toEqual([
        thirdRepo,
        firstRepo,
        secondRepo
      ]);
      await expect(service.getRecents()).resolves.toEqual([
        thirdRepo,
        firstRepo,
        secondRepo
      ]);
    });
  });

  it("sanitizes reordered repositories and preserves stored entries missing from stale requests", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const firstRepo = path.join(dir, "First");
      const secondRepo = path.join(dir, "Second");
      const thirdRepo = path.join(dir, "Third");
      const unknownRepo = path.join(dir, "Unknown");
      const duplicateSecondRepo = process.platform === "win32" ? secondRepo.toLocaleUpperCase() : secondRepo;

      await service.addRecent(firstRepo);
      await service.addRecent(secondRepo);
      await service.addRecent(thirdRepo);

      await expect(service.reorderRecents([
        thirdRepo,
        "relative-repo",
        unknownRepo,
        duplicateSecondRepo,
        secondRepo
      ])).resolves.toEqual([
        thirdRepo,
        secondRepo,
        firstRepo
      ]);
    });
  });

  it("removes repository paths using the platform path key", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const firstRepo = path.join(dir, "First");
      const secondRepo = path.join(dir, "Second");
      const removePath = process.platform === "win32" ? firstRepo.toLocaleUpperCase() : firstRepo;

      await service.addRecent(firstRepo);
      await service.addRecent(secondRepo);

      await expect(service.removeRecent(removePath)).resolves.toEqual([
        secondRepo
      ]);
    });
  });

  it("sanitizes stored values and ignores relative paths", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const validRepo = path.join(dir, "Repo");
      const recentsPath = path.join(dir, "repo-recents.json");

      await fs.writeFile(recentsPath, JSON.stringify([
        `  ${validRepo}${path.sep}  `,
        "relative-repo",
        "",
        null,
        validRepo
      ]), "utf8");

      await expect(service.getRecents()).resolves.toEqual([
        validRepo
      ]);
      await expect(service.addRecent("relative-repo")).resolves.toEqual([
        validRepo
      ]);
    });
  });
});
