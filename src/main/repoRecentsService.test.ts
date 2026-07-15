import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { GitWorktree, RepositoryGroup } from "../shared/types";
import { RepoRecentsService } from "./repoRecentsService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-repo-recents-test-"));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("RepoRecentsService", () => {
  it("returns an empty list for missing, corrupt, or invalid storage", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const recentsPath = path.join(dir, "repo-recents.json");
      await expect(service.getRecents()).resolves.toEqual([]);
      await fs.writeFile(recentsPath, "{bad json", "utf8");
      await expect(service.getRecents()).resolves.toEqual([]);
      await fs.writeFile(recentsPath, JSON.stringify({ version: 2, repositories: "bad" }), "utf8");
      await expect(service.getRecents()).resolves.toEqual([]);
    });
  });

  it("migrates the legacy string-array format in place on the next mutation", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const repo = path.join(dir, "Repo");
      const other = path.join(dir, "Other");
      const recentsPath = path.join(dir, "repo-recents.json");
      await fs.writeFile(recentsPath, JSON.stringify([repo, other]), "utf8");

      await expect(service.getRecents()).resolves.toEqual([
        { anchorPath: repo, lastUsedPath: repo },
        { anchorPath: other, lastUsedPath: other }
      ]);
      await service.addRecent(repo, repo);
      await expect(readStored(recentsPath)).resolves.toMatchObject({ version: 2 });
    });
  });

  it("updates a repository's last-used worktree without changing manual order", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const repo = path.join(dir, "Repo");
      const linked = path.join(dir, "Repo-feature");
      const other = path.join(dir, "Other");
      await service.addRecent(repo, repo);
      await service.addRecent(other, other);

      await expect(service.addRecent(repo, linked)).resolves.toEqual([
        { anchorPath: repo, lastUsedPath: linked },
        { anchorPath: other, lastUsedPath: other }
      ]);
    });
  });

  it("persists manual order while retaining each last-used worktree", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const first = path.join(dir, "First");
      const firstLinked = path.join(dir, "First-feature");
      const second = path.join(dir, "Second");
      await service.addRecent(first, firstLinked);
      await service.addRecent(second, second);

      await expect(service.reorderRecents([second, first])).resolves.toEqual([
        { anchorPath: second, lastUsedPath: second },
        { anchorPath: first, lastUsedPath: firstLinked }
      ]);
    });
  });

  it("reconciles legacy linked entries into one group and preserves the active worktree", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const main = path.join(dir, "Repo");
      const linked = path.join(dir, "Repo-feature");
      await fs.writeFile(path.join(dir, "repo-recents.json"), JSON.stringify([linked, main]), "utf8");

      const [group] = await service.reconcileGroups([createGroup(main, linked)], linked);
      expect(group?.lastUsedPath).toBe(linked);
      await expect(service.getRecents()).resolves.toEqual([{ anchorPath: main, lastUsedPath: linked }]);
    });
  });

  it("falls back from missing, bare, and prunable worktrees to a usable main worktree", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const main = path.join(dir, "Repo");
      const missing = path.join(dir, "Repo-missing");
      await service.addRecent(main, missing);
      const group = createGroup(main, missing);
      group.worktrees[1] = { ...group.worktrees[1]!, prunable: true };

      const [reconciled] = await service.reconcileGroups([group], null);
      expect(reconciled?.lastUsedPath).toBe(main);
      await expect(service.getRecents()).resolves.toEqual([{ anchorPath: main, lastUsedPath: main }]);
    });
  });

  it("serializes concurrent additions without losing repositories", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const repos = Array.from({ length: 12 }, (_value, index) => path.join(dir, `Repo${index}`));
      await Promise.all(repos.map((repo) => service.addRecent(repo, repo)));
      expect(await service.getRecents()).toEqual(repos.map((repo) => ({ anchorPath: repo, lastUsedPath: repo })));
    });
  });

  it("removes repository anchors using platform path comparison", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoRecentsService(dir);
      const first = path.join(dir, "First");
      const second = path.join(dir, "Second");
      await service.addRecent(first, first);
      await service.addRecent(second, second);
      const removePath = process.platform === "win32" ? first.toLocaleUpperCase() : first;
      await expect(service.removeRecent(removePath)).resolves.toEqual([{ anchorPath: second, lastUsedPath: second }]);
    });
  });
});

function createGroup(main: string, linked: string): RepositoryGroup {
  const worktree = (repoPath: string, isMain: boolean): GitWorktree => ({
    path: repoPath,
    head: "abc",
    branch: isMain ? "main" : "feature/test",
    isMain,
    isBare: false,
    isDetached: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null
  });
  return {
    id: "repo-group",
    kind: "git",
    anchorPath: main,
    lastUsedPath: main,
    recentPaths: [linked, main],
    commonDir: path.join(main, ".git"),
    worktrees: [worktree(main, true), worktree(linked, false)],
    error: ""
  };
}

async function readStored(recentsPath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(recentsPath, "utf8")) as unknown;
}
