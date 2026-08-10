import { describe, expect, it, vi } from "vite-plus/test";
import type { RepoSyncStatus } from "../shared/types";
import { REPO_SYNC_STATUS_CONCURRENCY } from "./repoSyncStatus";
import { VcsRouter } from "./vcsRouter";
import type { VcsService } from "./vcsService";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createStatus(repoPath: string): RepoSyncStatus {
  return {
    repoPath,
    kind: "git",
    isValid: true,
    ahead: 0,
    behind: 0,
    error: ""
  };
}

describe("VcsRouter", () => {
  it("loads sync statuses with bounded concurrency and preserves repository order", async () => {
    const repoPaths = Array.from({ length: 7 }, (_value, index) => `D:\\Repos\\Repo${index}`);
    const pending = new Map(repoPaths.map((repoPath) => [repoPath, deferred<RepoSyncStatus>()]));
    let active = 0;
    let maximumActive = 0;
    const service = {
      getRepoSyncStatus: vi.fn(async (repoPath: string) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          return await pending.get(repoPath)!.promise;
        } finally {
          active -= 1;
        }
      })
    } as unknown as VcsService;
    const router = new VcsRouter(service, service);
    vi.spyOn(router, "serviceForRepo").mockResolvedValue(service);

    const result = router.getRepoSyncStatuses(repoPaths);
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(REPO_SYNC_STATUS_CONCURRENCY);

    pending.get(repoPaths[3]!)!.resolve(createStatus(repoPaths[3]!));
    await Promise.resolve();
    await Promise.resolve();

    for (const repoPath of repoPaths) {
      pending.get(repoPath)!.resolve(createStatus(repoPath));
    }

    await expect(result).resolves.toEqual(repoPaths.map(createStatus));
    expect(maximumActive).toBe(REPO_SYNC_STATUS_CONCURRENCY);
  });

  it("returns an empty status list without consulting a backend", async () => {
    const service = {
      getRepoSyncStatus: vi.fn()
    } as unknown as VcsService;
    const router = new VcsRouter(service, service);
    const serviceForRepo = vi.spyOn(router, "serviceForRepo");

    await expect(router.getRepoSyncStatuses([])).resolves.toEqual([]);
    expect(serviceForRepo).not.toHaveBeenCalled();
  });

  it("groups recent linked worktrees by their shared Git directory", async () => {
    const service = {
      getWorktrees: vi.fn(async (_repoPath: string) => ({
        commonDir: "D:\\Repo\\.git",
        worktrees: [
          { path: "D:\\Repo", head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null },
          { path: "D:\\Repo-feature", head: "def", branch: "feature", isMain: false, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }
        ]
      }))
    } as unknown as VcsService;
    const router = new VcsRouter(service, service);
    vi.spyOn(router, "resolveKind").mockResolvedValue("git");

    const groups = await router.getRepositoryGroups(["D:\\Repo-feature", "D:\\Repo"]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ anchorPath: "D:\\Repo", recentPaths: ["D:\\Repo-feature", "D:\\Repo"] });
    expect(groups[0]?.worktrees).toHaveLength(2);
  });

  it("does not run Git worktree inspection for untrusted recent repositories", async () => {
    const service = {
      getWorktrees: vi.fn()
    } as unknown as VcsService;
    const router = new VcsRouter(service, service);
    vi.spyOn(router, "resolveKind").mockResolvedValue("git");

    await expect(router.getRepositoryGroups(["D:\\Untrusted"], () => false)).resolves.toEqual([
      expect.objectContaining({
        kind: "git",
        anchorPath: "D:\\Untrusted",
        worktrees: []
      })
    ]);
    expect(service.getWorktrees).not.toHaveBeenCalled();
  });
});
