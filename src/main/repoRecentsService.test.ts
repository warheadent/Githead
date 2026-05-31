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

  it("dedupes, orders, and caps recent repositories", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const repoPaths = Array.from({ length: MAX_REPO_RECENTS + 2 }, (_value, index) => path.join(dir, `Repo${index}`));

      for (const repoPath of repoPaths) {
        await service.addRecent(repoPath);
      }

      expect(await service.getRecents()).toEqual(repoPaths.slice(2).reverse());

      const promotedRepo = repoPaths[4]!;
      const duplicatePromotedRepo = process.platform === "win32" ? promotedRepo.toLocaleUpperCase() : promotedRepo;
      expect(await service.addRecent(duplicatePromotedRepo)).toEqual([
        duplicatePromotedRepo,
        ...repoPaths.slice(2).reverse().filter((repoPath) => repoPath !== promotedRepo)
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
