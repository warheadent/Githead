import type { GitStashEntry } from "../shared/types";

export function findStashEntry(entries: GitStashEntry[], target: GitStashEntry | null | undefined, originalEntries: GitStashEntry[]): GitStashEntry | null {
  if (!target) return null;
  // An unchanged list still contains the exact reflog entry the user chose.
  if (entries.includes(target)) return target;
  const matchesTarget = (entry: GitStashEntry): boolean => entry.hash === target.hash
    && entry.message === target.message
    && entry.createdAt === target.createdAt
    && entry.sourceBranch === target.sourceBranch;
  if (originalEntries.filter(matchesTarget).length !== 1) return null;
  const matches = entries.filter(matchesTarget);
  // Ref positions can be reused after refresh. Do not guess between duplicates.
  return matches.length === 1 ? matches[0]! : null;
}
