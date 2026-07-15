import type { RepositoryGroup, RepoSyncStatus, VcsKind } from "../shared/types";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";
import { mapRepoSyncStatuses } from "./repoSyncStatus";
import { mapWithConcurrency } from "./asyncMap";
import { detectVcsKinds } from "./vcsDetect";
import type { VcsService } from "./vcsService";

/**
 * Routes each repository to the version-control backend that owns it. The
 * resolved kind is cached per normalized path key because a folder's VCS does
 * not change during a session; {@link invalidate} clears entries if a repo is
 * re-initialized (e.g. on a filesystem-change notification).
 */
export class VcsRouter {
  private readonly kindCache = new Map<string, VcsKind>();

  constructor(
    private readonly git: VcsService,
    private readonly lore: VcsService
  ) {}

  async serviceForRepo(repoPath: string): Promise<VcsService> {
    const kind = await this.resolveKind(repoPath);
    return this.serviceForKind(kind);
  }

  serviceForKind(kind: VcsKind): VcsService {
    return kind === "lore" ? this.lore : this.git;
  }

  async resolveKind(repoPath: string): Promise<VcsKind> {
    const cacheKey = this.cacheKey(repoPath);
    const cached = this.kindCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const kinds = await detectVcsKinds(repoPath);
    // When a folder hosts both a `.git` and a `.lore`, default to Git (the
    // mature path) until the renderer's both-detected disambiguation prompt
    // (Stage 4) lets the user choose and persists that choice.
    const kind: VcsKind = kinds.length === 1 && kinds[0] === "lore" ? "lore" : "git";
    this.kindCache.set(cacheKey, kind);
    return kind;
  }

  async getRepoSyncStatuses(repoPaths: string[]): Promise<RepoSyncStatus[]> {
    return mapRepoSyncStatuses(
      repoPaths,
      async (repoPath) => (await this.serviceForRepo(repoPath)).getRepoSyncStatus(repoPath)
    );
  }

  async getRepositoryGroups(repoPaths: string[]): Promise<RepositoryGroup[]> {
    const resolved = await mapWithConcurrency(repoPaths, 4, async (repoPath) => {
      const kind = await this.resolveKind(repoPath);
      if (kind === "lore") {
        return { repoPath, kind, commonDir: null, worktrees: [], error: "" };
      }
      try {
        const list = await this.git.getWorktrees(repoPath);
        return { repoPath, kind, ...list, error: "" };
      } catch (error) {
        return { repoPath, kind, commonDir: null, worktrees: [], error: error instanceof Error ? error.message : "Unable to list worktrees." };
      }
    });

    const groups: RepositoryGroup[] = [];
    const byId = new Map<string, RepositoryGroup>();
    for (const item of resolved) {
      const id = item.commonDir ? getRepoPathKey(normalizeRepoPath(item.commonDir) ?? item.commonDir) : `${item.kind}:${getRepoPathKey(normalizeRepoPath(item.repoPath) ?? item.repoPath)}`;
      const existing = byId.get(id);
      if (existing) {
        existing.recentPaths.push(item.repoPath);
        if (!existing.worktrees.length && item.worktrees.length) existing.worktrees = item.worktrees;
        if (existing.error && !item.error) existing.error = "";
        continue;
      }
      const group: RepositoryGroup = {
        id,
        kind: item.kind,
        anchorPath: item.worktrees.find((worktree) => worktree.isMain && !worktree.isBare)?.path ?? item.repoPath,
        lastUsedPath: item.repoPath,
        recentPaths: [item.repoPath],
        commonDir: item.commonDir,
        worktrees: item.worktrees,
        error: item.error
      };
      byId.set(id, group);
      groups.push(group);
    }
    return groups;
  }

  invalidate(repoPath?: string): void {
    if (!repoPath) {
      this.kindCache.clear();
      return;
    }

    this.kindCache.delete(this.cacheKey(repoPath));
  }

  private cacheKey(repoPath: string): string {
    return getRepoPathKey(normalizeRepoPath(repoPath) ?? repoPath);
  }
}
