import path from "node:path";

export function sanitizeSingleRepoPath(filePath: string): { path: string } | { error: string } {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) return { error: "Select a file." };
  if (path.isAbsolute(trimmedPath)) return { error: "File path must be relative to the repository." };
  const normalizedPath = path.normalize(trimmedPath);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
    return { error: "File path must stay inside the repository." };
  }
  return { path: trimmedPath };
}

export function sanitizeCommitHash(hash: string): { hash: string } | { error: string } {
  const trimmedHash = hash.trim();
  return /^[0-9a-f]{7,64}$/i.test(trimmedHash)
    ? { hash: trimmedHash }
    : { error: "Commit hash is invalid." };
}

export function sanitizeHistorySkip(skip: number | undefined): { skip: number } | { error: string } {
  if (skip === undefined) return { skip: 0 };
  return Number.isSafeInteger(skip) && skip >= 0 && skip <= 0xFFFFFFFF
    ? { skip }
    : { error: "Commit history page offset is invalid." };
}

export function sanitizeHistoryLimit(limit: number | undefined, defaultLimit = 200, maxLimit = 500): number {
  if (!Number.isFinite(limit)) return defaultLimit;
  return Math.max(1, Math.min(maxLimit, Math.trunc(limit ?? defaultLimit)));
}
