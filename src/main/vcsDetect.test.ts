import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { detectVcsKinds, findVcsRoot } from "./vcsDetect";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-vcs-detect-"));

  try {
    return await callback(await fs.realpath(dir));
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("detectVcsKinds", () => {
  it("detects a git repository by its .git directory", async () => {
    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, ".git"));

      await expect(detectVcsKinds(dir)).resolves.toEqual([
        "git"
      ]);
    });
  });

  it("detects a git worktree/submodule by a .git file", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, ".git"), "gitdir: ../actual/.git", "utf8");

      await expect(detectVcsKinds(dir)).resolves.toEqual([
        "git"
      ]);
    });
  });

  it("detects a lore repository by its .lore directory", async () => {
    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, ".lore"));

      await expect(detectVcsKinds(dir)).resolves.toEqual([
        "lore"
      ]);
    });
  });

  it("reports both kinds when a folder has .git and .lore at the same level", async () => {
    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, ".git"));
      await fs.mkdir(path.join(dir, ".lore"));

      const kinds = await detectVcsKinds(dir);

      expect(kinds).toContain("git");
      expect(kinds).toContain("lore");
      expect(kinds).toHaveLength(2);
    });
  });

  it("walks up to the nearest enclosing repository", async () => {
    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, ".lore"));
      const nested = path.join(dir, "src", "feature");
      await fs.mkdir(nested, {
        recursive: true
      });

      await expect(detectVcsKinds(nested)).resolves.toEqual([
        "lore"
      ]);
      await expect(findVcsRoot(nested)).resolves.toEqual({
        rootPath: dir,
        kinds: ["lore"]
      });
    });
  });

  it("returns an empty array for a non-repository folder", async () => {
    await withTempDir(async (dir) => {
      await expect(detectVcsKinds(dir)).resolves.toEqual([]);
    });
  });
});
