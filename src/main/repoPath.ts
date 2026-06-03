import path from "node:path";

export function normalizeRepoPath(repoPath: string): string | null {
  const trimmed = repoPath.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedPath = path.normalize(trimmed);
  if (!path.isAbsolute(normalizedPath)) {
    return null;
  }

  const root = path.parse(normalizedPath).root;
  return normalizedPath.length > root.length ? normalizedPath.replace(/[\\/]+$/, "") : normalizedPath;
}

export function getRepoPathKey(repoPath: string): string {
  return process.platform === "win32" ? repoPath.toLocaleLowerCase() : repoPath;
}
