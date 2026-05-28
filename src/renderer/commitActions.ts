import type { RepoSummary } from "../shared/types";

export type PrimaryCommitAction = "commit" | "push";

export function hasStagedChanges(summary: RepoSummary | null): boolean {
  return Boolean(summary?.files.some((file) => file.isStaged));
}

export function hasUnpushedCommits(summary: RepoSummary | null): boolean {
  if (!summary?.isValid || !summary.upstream) {
    return false;
  }

  const aheadBehindLine = summary.statusLines.find((line) => line.startsWith("# branch.ab "));
  const match = /^# branch\.ab \+(?<ahead>\d+) -(?<behind>\d+)$/.exec(aheadBehindLine ?? "");
  if (!match?.groups) {
    return false;
  }

  return Number.parseInt(match.groups.ahead ?? "0", 10) > 0;
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
