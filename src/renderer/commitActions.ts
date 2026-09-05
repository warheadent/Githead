import type { RepoSummary } from "../shared/types";

export type PrimaryCommitAction = "commit" | "push";

export interface AheadBehindCounts {
  ahead: number;
  behind: number;
}

export function hasStagedChanges(summary: RepoSummary | null): boolean {
  return Boolean(summary?.files.some((file) => file.isStaged));
}

export function getAheadBehindCounts(summary: RepoSummary | null): AheadBehindCounts | null {
  if (!summary?.isValid || !summary.upstream) {
    return null;
  }

  if (summary.ahead === null || summary.behind === null) {
    return null;
  }

  return {
    ahead: summary.ahead,
    behind: summary.behind
  };
}

export function hasUnpushedCommits(summary: RepoSummary | null): boolean {
  return (getAheadBehindCounts(summary)?.ahead ?? 0) > 0;
}

export function getPushableCommitCount(summary: RepoSummary | null): number {
  return getAheadBehindCounts(summary)?.ahead ?? 0;
}

export function getPullableCommitCount(summary: RepoSummary | null): number {
  return getAheadBehindCounts(summary)?.behind ?? 0;
}

export function getPrimaryCommitAction(summary: RepoSummary | null): PrimaryCommitAction | null {
  if (hasStagedChanges(summary)) {
    return "commit";
  }

  if (hasUnpushedCommits(summary)) {
    return "push";
  }

  return null;
}
