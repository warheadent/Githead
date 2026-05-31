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

  const aheadBehindLine = summary.statusLines.find((line) => line.startsWith("# branch.ab "));
  const match = /^# branch\.ab \+(?<ahead>\d+) -(?<behind>\d+)$/.exec(aheadBehindLine ?? "");
  if (!match?.groups) {
    return null;
  }

  return {
    ahead: Number.parseInt(match.groups.ahead ?? "0", 10),
    behind: Number.parseInt(match.groups.behind ?? "0", 10)
  };
}

export function hasUnpushedCommits(summary: RepoSummary | null): boolean {
  return (getAheadBehindCounts(summary)?.ahead ?? 0) > 0;
}

export function getPullableCommitCount(summary: RepoSummary | null): number {
  return getAheadBehindCounts(summary)?.behind ?? 0;
}

export function canPush(summary: RepoSummary | null): boolean {
  return hasUnpushedCommits(summary);
}

export function getPrimaryCommitAction(summary: RepoSummary | null): PrimaryCommitAction | null {
  if (hasStagedChanges(summary)) {
    return "commit";
  }

  if (canPush(summary)) {
    return "push";
  }

  return null;
}
