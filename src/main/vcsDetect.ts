import fs from "node:fs/promises";
import path from "node:path";
import type { VcsKind } from "../shared/types";

/**
 * Detect which version-control system(s) own a path by walking up the
 * directory tree looking for metadata markers — `.git` (a directory for a
 * normal repo, or a file for worktrees/submodules) and `.lore` (a directory).
 *
 * Returns the kind(s) found at the nearest enclosing level. Usually one entry;
 * both only in the rare case a folder contains a `.git` and a `.lore` at the
 * same level, which the caller disambiguates. An empty array means neither was
 * found (not a repository).
 */
export async function detectVcsKinds(repoPath: string): Promise<VcsKind[]> {
  return (await findVcsRoot(repoPath))?.kinds ?? [];
}

/** Resolve the nearest repository root without invoking repository tools. */
export async function findVcsRoot(repoPath: string): Promise<{ rootPath: string; kinds: VcsKind[] } | null> {
  const start = path.resolve(repoPath);
  let current = start;

  while (true) {
    const [hasGit, hasLore] = await Promise.all([
      hasGitMarker(current),
      isDirectory(path.join(current, ".lore"))
    ]);

    const kinds: VcsKind[] = [];
    if (hasGit) {
      kinds.push("git");
    }
    if (hasLore) {
      kinds.push("lore");
    }
    if (kinds.length > 0) {
      return { rootPath: current, kinds };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function hasGitMarker(dir: string): Promise<boolean> {
  // `.git` is a directory for a normal repo and a file for linked worktrees and
  // submodules, so any existing entry counts.
  return existsAny(path.join(dir, ".git"));
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const stats = await fs.stat(target);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function existsAny(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}
