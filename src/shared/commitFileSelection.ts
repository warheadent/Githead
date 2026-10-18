/**
 * Chooses the file shown when a commit opens: the previously selected path
 * when the commit changed it, otherwise the first changed file.
 */
export function preferredCommitFile<T extends { path: string }>(files: readonly T[], preferredPath: string | null | undefined): T | null {
  return (preferredPath ? files.find((file) => file.path === preferredPath) : undefined) ?? files[0] ?? null;
}
