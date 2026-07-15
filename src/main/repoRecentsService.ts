import fs from "node:fs/promises";
import path from "node:path";
import type { GitWorktree, RepositoryGroup, RepositoryRecent } from "../shared/types";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

interface StoredRecentsV2 {
  version: 2;
  repositories: RepositoryRecent[];
}

export class RepoRecentsService {
  private readonly recentsPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.recentsPath = path.join(userDataPath, "repo-recents.json");
  }

  async getRecents(): Promise<RepositoryRecent[]> {
    return this.readRecents();
  }

  async addRecent(anchorPath: string, lastUsedPath: string): Promise<RepositoryRecent[]> {
    const normalizedAnchor = normalizeRepoPath(anchorPath);
    const normalizedLastUsed = normalizeRepoPath(lastUsedPath);
    if (!normalizedAnchor || !normalizedLastUsed) return this.getRecents();

    return this.enqueueMutation(async () => {
      const recents = await this.readRecents();
      const anchorKey = getRepoPathKey(normalizedAnchor);
      const existingIndex = recents.findIndex((recent) => getRepoPathKey(recent.anchorPath) === anchorKey);
      const next = existingIndex < 0
        ? [...recents, { anchorPath: normalizedAnchor, lastUsedPath: normalizedLastUsed }]
        : recents.map((recent, index) => index === existingIndex
          ? { ...recent, anchorPath: normalizedAnchor, lastUsedPath: normalizedLastUsed }
          : recent);
      await this.writeRecents(next);
      return next;
    });
  }

  async removeRecent(repoPath: string): Promise<RepositoryRecent[]> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) return this.getRecents();

    return this.enqueueMutation(async () => {
      const key = getRepoPathKey(normalizedPath);
      const next = (await this.readRecents()).filter((recent) => getRepoPathKey(recent.anchorPath) !== key);
      await this.writeRecents(next);
      return next;
    });
  }

  async reorderRecents(repoPaths: string[]): Promise<RepositoryRecent[]> {
    return this.enqueueMutation(async () => {
      const recents = await this.readRecents();
      const recentsByKey = new Map(recents.map((recent) => [getRepoPathKey(recent.anchorPath), recent]));
      const requested = dedupePaths(repoPaths.flatMap((repoPath) => {
        const normalized = normalizeRepoPath(repoPath);
        return normalized ? [normalized] : [];
      }));
      const requestedKeys = new Set<string>();
      const ordered = requested.flatMap((repoPath) => {
        const key = getRepoPathKey(repoPath);
        const stored = recentsByKey.get(key);
        if (!stored) return [];
        requestedKeys.add(key);
        return [stored];
      });
      const next = [...ordered, ...recents.filter((recent) => !requestedKeys.has(getRepoPathKey(recent.anchorPath)))];
      await this.writeRecents(next);
      return next;
    });
  }

  async reconcileGroups(groups: RepositoryGroup[], activeRepoPath: string | null): Promise<RepositoryGroup[]> {
    return this.enqueueMutation(async () => {
      const recents = await this.readRecents();
      const activePath = normalizeRepoPath(activeRepoPath ?? "");
      const reconciled = groups.map((group) => {
        const matching = recents.filter((recent) => recentMatchesGroup(recent, group));
        const activeWorktree = activePath ? findUsablePath(group, activePath) : null;
        const storedWorktree = matching.map((recent) => findUsablePath(group, recent.lastUsedPath)).find(Boolean) ?? null;
        const lastUsedPath = activeWorktree ?? storedWorktree ?? getFallbackPath(group);
        return { ...group, lastUsedPath };
      });
      const next = reconciled.map((group) => ({ anchorPath: group.anchorPath, lastUsedPath: group.lastUsedPath }));
      if (!areRecentsEqual(recents, next)) await this.writeRecents(next);
      return reconciled;
    });
  }

  private async readRecents(): Promise<RepositoryRecent[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.recentsPath, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        return sanitizeRecents(parsed.map((value) => ({ anchorPath: value, lastUsedPath: value })));
      }
      if (!isRecord(parsed) || parsed.version !== 2 || !Array.isArray(parsed.repositories)) return [];
      return sanitizeRecents(parsed.repositories);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  }

  private async writeRecents(recents: RepositoryRecent[]): Promise<void> {
    const stored: StoredRecentsV2 = { version: 2, repositories: recents };
    await fs.mkdir(path.dirname(this.recentsPath), { recursive: true });
    await fs.writeFile(this.recentsPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function sanitizeRecents(values: unknown[]): RepositoryRecent[] {
  const seen = new Set<string>();
  const recents: RepositoryRecent[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const anchorPath = typeof value.anchorPath === "string" ? normalizeRepoPath(value.anchorPath) : null;
    const lastUsedPath = typeof value.lastUsedPath === "string" ? normalizeRepoPath(value.lastUsedPath) : null;
    if (!anchorPath || !lastUsedPath) continue;
    const key = getRepoPathKey(anchorPath);
    if (seen.has(key)) continue;
    seen.add(key);
    recents.push({ anchorPath, lastUsedPath });
  }
  return recents;
}

function recentMatchesGroup(recent: RepositoryRecent, group: RepositoryGroup): boolean {
  const groupPaths = [group.anchorPath, ...group.recentPaths, ...group.worktrees.map((worktree) => worktree.path)];
  return groupPaths.some((repoPath) => isSamePath(repoPath, recent.anchorPath) || isSamePath(repoPath, recent.lastUsedPath));
}

function findUsablePath(group: RepositoryGroup, repoPath: string): string | null {
  if (!group.worktrees.length) {
    return [group.anchorPath, ...group.recentPaths].some((candidate) => isSamePath(candidate, repoPath)) ? repoPath : null;
  }
  return group.worktrees.find((worktree) => isUsable(worktree) && isSamePath(worktree.path, repoPath))?.path ?? null;
}

function getFallbackPath(group: RepositoryGroup): string {
  return group.worktrees.find((worktree) => worktree.isMain && isUsable(worktree))?.path
    ?? group.worktrees.find(isUsable)?.path
    ?? group.anchorPath;
}

function isUsable(worktree: GitWorktree): boolean {
  return !worktree.isBare && !worktree.prunable;
}

function areRecentsEqual(left: RepositoryRecent[], right: RepositoryRecent[]): boolean {
  return left.length === right.length && left.every((recent, index) => {
    const other = right[index];
    return other !== undefined && isSamePath(recent.anchorPath, other.anchorPath) && isSamePath(recent.lastUsedPath, other.lastUsedPath);
  });
}

function dedupePaths(repoPaths: string[]): string[] {
  const seen = new Set<string>();
  return repoPaths.filter((repoPath) => {
    const key = getRepoPathKey(repoPath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSamePath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
