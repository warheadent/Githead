import type { GitHubPullRequestAssociation, GitRemoteBranch, RepoSummary } from "../shared/types";
import { hasUnpushedCommits } from "./commitActions";

export function getPushRemotes(summary: RepoSummary | null): string[] {
  if (!summary) {
    return [];
  }

  return [...new Set(summary.remotes.filter((remote) => remote.direction === "push").map((remote) => remote.name))];
}

export function shouldPublishInsteadOfPush(summary: RepoSummary | null): summary is RepoSummary {
  return Boolean(
    summary?.isValid &&
    (summary.capabilities.setUpstream ?? true) &&
    summary.branch &&
    !summary.upstream &&
    getPushRemotes(summary).length > 0
  );
}

export function getRemoteDefaultBranch(summary: RepoSummary | null): GitRemoteBranch | null {
  if (!summary?.isValid) {
    return null;
  }

  // origin/HEAD can be locally unset (e.g. manually added remotes), so fall
  // back to the conventional default branch names.
  return summary.defaultRemoteBranch
    ?? summary.remoteBranches.find((remoteBranch) => remoteBranch.name === "origin/main")
    ?? summary.remoteBranches.find((remoteBranch) => remoteBranch.name === "origin/master")
    ?? null;
}

export function shouldShowCreatePullRequest(
  summary: RepoSummary | null,
  pullRequests: GitHubPullRequestAssociation[],
  _hasPullRequestData: boolean
): boolean {
  if (!summary?.isValid || !summary.capabilities.github || !summary.githubRepository || !summary.branch) {
    return false;
  }

  const defaultBranch = getRemoteDefaultBranch(summary);
  if (!defaultBranch || summary.branch === defaultBranch.branch) {
    return false;
  }

  const aheadOfDefault = summary.commitsAheadOfDefaultBranch !== null
    ? summary.commitsAheadOfDefaultBranch > 0
    : hasUnpushedCommits(summary) || shouldPublishInsteadOfPush(summary);
  if (!aheadOfDefault) {
    return false;
  }

  return pullRequests.length === 0;
}

export function formatPullRequestAssociationState(pullRequest: GitHubPullRequestAssociation): string {
  if (pullRequest.draft) return "Draft";
  return pullRequest.state.charAt(0).toUpperCase() + pullRequest.state.slice(1).toLowerCase();
}

export function formatActionCountLabel(action: "Pull" | "Push", count: number): string {
  return `${action} ${count} ${count === 1 ? "commit" : "commits"}`;
}

export function formatCommitCountLabel(count: number, direction: "ahead" | "behind"): string {
  return `${count} ${count === 1 ? "commit" : "commits"} ${direction}`;
}

export function getRepositoryActionKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}
