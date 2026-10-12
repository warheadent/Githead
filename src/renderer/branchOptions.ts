import type { GitBranch, GitRemoteBranch, GitRepositoryOperationKind, GitRepositoryOperationState } from "../shared/types";
import { repositoryName } from "./repositoryOrganization";
import { getRepoPathKey } from "./repositorySnapshotCache";

/** Group headings used by the branch picker. */
export const LOCAL_BRANCH_GROUP = "Local branches";
export const REMOTE_BRANCH_GROUP = "Remote branches";
/** Group heading of the "No upstream" option in the upstream picker. */
export const UPSTREAM_TRACKING_GROUP = "Tracking";

/** Which icon a branch option shows: a branch, a branch open in another worktree, or a remote branch to check out. */
export type BranchItemIcon = "branch" | "worktree" | "remote";

interface BranchItemFields {
  /** Picker value: `local:<name>` or `remote:<remote>/<branch>`. */
  value: string;
  label: string;
  /**
   * Secondary text. "current" for the checked-out branch, the upstream or the occupying worktree name for other local
   * branches, and the remote name for remote branches. Local branches without an upstream have none.
   */
  detail?: string;
  group: string;
  icon: BranchItemIcon;
  /** True for the checked-out branch. Choosing it does nothing. */
  current: boolean;
}

export interface LocalBranchItem extends BranchItemFields {
  kind: "local";
  branch: GitBranch;
  /** The worktree that has this branch checked out, when it is not the open repository. */
  worktreePath: string | null;
}

export interface RemoteBranchItem extends BranchItemFields {
  kind: "remote";
  remoteBranch: GitRemoteBranch;
}

export type BranchItem = LocalBranchItem | RemoteBranchItem;

export interface BranchItemsInput {
  /** The open repository or worktree path. */
  repoPath: string;
  currentBranch: string | null;
  branches: readonly GitBranch[];
  remoteBranches: readonly GitRemoteBranch[];
}

/** What choosing a branch option does. */
export type BranchChoice =
  | { kind: "switch"; branchName: string }
  | { kind: "open-worktree"; branchName: string; worktreePath: string }
  | { kind: "checkout-remote"; remoteBranch: GitRemoteBranch };

/**
 * Builds the branch options: the checked-out branch first, then the other local branches, then the remote branches
 * that no local branch tracks yet.
 */
export function buildBranchItems({ repoPath, currentBranch, branches, remoteBranches }: BranchItemsInput): BranchItem[] {
  const activeBranch = branches.find((branch) => branch.current || branch.name === currentBranch) ?? null;
  const switchableBranches = branches.filter((branch) => !branch.current && branch.name !== currentBranch);
  const localUpstreams = new Set(branches.flatMap((branch) => branch.upstream ? [branch.upstream] : []));
  const checkoutableRemoteBranches = remoteBranches.filter((remoteBranch) => !localUpstreams.has(remoteBranch.name));
  const items: BranchItem[] = [];

  if (activeBranch) {
    items.push({
      kind: "local",
      value: `local:${activeBranch.name}`,
      label: activeBranch.name,
      detail: "current",
      group: LOCAL_BRANCH_GROUP,
      icon: "branch",
      current: true,
      branch: activeBranch,
      worktreePath: null
    });
  }

  for (const branch of switchableBranches) {
    const worktreePath = getOccupyingWorktreePath(branch, repoPath);
    const detail = worktreePath ? repositoryName(worktreePath) : branch.upstream;
    items.push({
      kind: "local",
      value: `local:${branch.name}`,
      label: branch.name,
      ...(detail ? { detail } : {}),
      group: LOCAL_BRANCH_GROUP,
      icon: worktreePath ? "worktree" : "branch",
      current: false,
      branch,
      worktreePath
    });
  }

  for (const remoteBranch of checkoutableRemoteBranches) {
    items.push({
      kind: "remote",
      value: `remote:${remoteBranch.name}`,
      label: remoteBranch.branch,
      detail: remoteBranch.remote,
      group: REMOTE_BRANCH_GROUP,
      icon: "remote",
      current: false,
      remoteBranch
    });
  }

  return items;
}

/**
 * Resolves a chosen branch option. A local branch checked out in another worktree opens that worktree instead of
 * switching. Returns null for the checked-out branch.
 */
export function resolveBranchChoice(item: BranchItem): BranchChoice | null {
  if (item.kind === "remote") {
    return { kind: "checkout-remote", remoteBranch: item.remoteBranch };
  }

  if (item.current) {
    return null;
  }

  return item.worktreePath
    ? { kind: "open-worktree", branchName: item.branch.name, worktreePath: item.worktreePath }
    : { kind: "switch", branchName: item.branch.name };
}

/** The text that names the checked-out reference: the branch, the checked-out tag or "Detached HEAD". */
export function getBranchDisplayValue(currentBranch: string | null, currentTag: string | null | undefined): string {
  return currentBranch ?? (currentTag ? `Tag: ${currentTag}` : "Detached HEAD");
}

export interface UpstreamItem {
  /** Picker value: the remote branch name, or an empty string for "No upstream". */
  value: string;
  /** The upstream to set, or null to stop tracking. */
  upstream: string | null;
  label: string;
  detail: string;
  /** The remote name, or "Tracking" for the "No upstream" option. */
  group: string;
  /** True when this option is the current upstream. */
  selected: boolean;
}

/** Builds the upstream options: remote branches grouped by remote in first-seen order, then "No upstream". */
export function buildUpstreamItems(remoteBranches: readonly GitRemoteBranch[], upstream: string | null): UpstreamItem[] {
  const byRemote = new Map<string, GitRemoteBranch[]>();
  for (const remoteBranch of remoteBranches) {
    const group = byRemote.get(remoteBranch.remote);
    if (group) group.push(remoteBranch);
    else byRemote.set(remoteBranch.remote, [remoteBranch]);
  }

  const items: UpstreamItem[] = [...byRemote.values()].flat().map((remoteBranch) => ({
    value: remoteBranch.name,
    upstream: remoteBranch.name,
    label: remoteBranch.name,
    detail: remoteBranch.branch,
    group: remoteBranch.remote,
    selected: remoteBranch.name === upstream
  }));
  items.push({
    value: "",
    upstream: null,
    label: "No upstream",
    detail: upstream ? `Stop tracking ${upstream}` : "Do not track a remote branch",
    group: UPSTREAM_TRACKING_GROUP,
    selected: !upstream
  });
  return items;
}

export const REPOSITORY_UNAVAILABLE_REASON = "The repository is unavailable.";
export const OPERATION_RUNNING_REASON = "Wait for the current operation to finish.";

/** Tells the user to end an unfinished merge, rebase, cherry-pick or revert. Waiting does not end it. */
export function getActiveOperationReason(kind: GitRepositoryOperationKind): string {
  return `Finish or abort the active ${kind} first.`;
}

export interface OperationBlockInput {
  /** True while an operation runs. */
  running: boolean;
  /** The unfinished merge, rebase, cherry-pick or revert in the open repository (RepoSummary.operationState). */
  operationState: Pick<GitRepositoryOperationState, "kind"> | null;
}

/**
 * Explains why repository, branch and upstream changes are blocked, or returns null when they are not. An unfinished
 * merge, rebase, cherry-pick or revert comes first because it stays after the running operation finishes.
 */
export function getOperationBlockedReason({ running, operationState }: OperationBlockInput): string | null {
  if (operationState) {
    return getActiveOperationReason(operationState.kind);
  }

  return running ? OPERATION_RUNNING_REASON : null;
}

export interface UpstreamDisabledInput extends OperationBlockInput {
  currentBranch: string | null;
  upstream: string | null;
  remoteBranches: readonly GitRemoteBranch[];
  isValid: boolean;
}

/** Explains why the upstream cannot change right now, or returns null when it can. */
export function getUpstreamDisabledReason({ currentBranch, upstream, remoteBranches, running, operationState, isValid }: UpstreamDisabledInput): string | null {
  if (!isValid) {
    return REPOSITORY_UNAVAILABLE_REASON;
  }

  const blockedReason = getOperationBlockedReason({ running, operationState });
  if (blockedReason) {
    return blockedReason;
  }

  if (!currentBranch) {
    return "Select a branch before changing its upstream";
  }

  if (remoteBranches.length === 0 && !upstream) {
    return "Add a remote before setting an upstream";
  }

  return null;
}

function getOccupyingWorktreePath(branch: GitBranch, repoPath: string): string | null {
  return branch.worktreePath && getRepoPathKey(branch.worktreePath) !== getRepoPathKey(repoPath)
    ? branch.worktreePath
    : null;
}
