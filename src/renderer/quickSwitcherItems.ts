import type {
  AppUpdateState,
  GitActionsConfig,
  GitConfiguredAction,
  GitHubPullRequestAssociation,
  GitWorktree,
  RepoSummary,
  RepoSyncStatus,
  RepositoryGroup,
  VcsKind
} from "../shared/types";
import { getRepositoryWebUrl } from "../shared/remoteWebUrl";
import type { ActivityLogAttention } from "./activityLogStore";
import { getAppUpdateButtonLabel, resolveAppUpdateAction, type AppUpdateAction } from "./AppUpdateControl";
import {
  REPOSITORY_UNAVAILABLE_REASON,
  buildBranchItems,
  buildUpstreamItems,
  getOperationBlockedReason,
  getUpstreamDisabledReason,
  resolveBranchChoice,
  type BranchChoice,
  type BranchItem
} from "./branchOptions";
import { buildConfiguredActionMenu, type ConfiguredActionMenuEntry } from "./configuredActionMenu";
import {
  formatCommitCountLabel,
  formatPullRequestAssociationState,
  getPushRemotes,
  shouldShowCreatePullRequest
} from "./remoteActions";
import {
  organizeRepositories,
  repositoryLabels,
  repositoryName,
  repositoryPreference,
  type RepositoryOrganization
} from "./repositoryOrganization";
import { getRepoPathKey } from "./repositorySnapshotCache";
import { formatRepoSyncStatusDescription } from "./SyncCountChip";
import type { WorkspaceView } from "./useWorkspaceNavigation";
import { WORKSPACE_VIEW_LABELS, type GuestView } from "./workspaceViews";

/** 'all' opens from Ctrl+K, ⋯ and the repository name; 'branches' from the branch pill; 'upstream' from "Change upstream…". */
export type QuickSwitcherMode = "all" | "branches" | "upstream";

export type QuickSwitcherSectionId =
  | "repositories"
  | "branches-local"
  | "branches-remote"
  | "branch-actions"
  | "upstream"
  | "remotes"
  | "repository-actions"
  | "go-to"
  | "commands";

/** Remote branch rows shown until the user types a query. */
export const REMOTE_BRANCH_ROW_LIMIT = 100;

export type BranchAction =
  | "new-branch"
  | "merge"
  | "rebase"
  | "checkout-tag"
  | "add-worktree"
  | "manage-branches"
  | "change-upstream";

export interface RepositoryRowPayload {
  /** The workspace path to open: the group's last-used worktree, the worktree or the saved repository. */
  path: string;
  /** The path the row's context menu acts on: the group anchor, the worktree or the saved repository. */
  menuPath: string;
  group: RepositoryGroup | null;
  worktree: GitWorktree | null;
  displayName: string;
  /** Parent folders that tell repositories with the same name apart (from repositoryLabels). */
  labelDetail: string;
  syncStatus: RepoSyncStatus | null;
  vcsKind: VcsKind | null;
  hidden: boolean;
}

export interface RepositoryRepairPayload extends RepositoryRowPayload {
  /**
   * The saved repository to repair or remove: the group anchor or the saved repository, never a linked worktree.
   * Saved repositories are keyed by their anchor, so the repair must target it.
   */
  path: string;
  /** Why Githead cannot open the repository. */
  reason: string;
}

/** The payload each item kind carries for the switcher to dispatch. */
export interface QuickSwitcherPayloads {
  repository: RepositoryRowPayload;
  repair: RepositoryRepairPayload;
  "add-repository": null;
  "toggle-hidden-repositories": { showHidden: boolean };
  "organize-repositories": null;
  branch: { item: BranchItem; choice: BranchChoice | null };
  "branch-action": { action: BranchAction };
  upstream: { upstream: string | null };
  "open-remote": { url: string | null };
  "manage-remotes": null;
  remote: { name: string };
  "repository-action": { action: GitConfiguredAction };
  notice: null;
  view: { view: GuestView };
  settings: null;
  "open-pull-request": { pullRequest: GitHubPullRequestAssociation };
  "create-pull-request": null;
  "repository-settings": { path: string };
  "app-update": { action: Exclude<AppUpdateAction, "none"> };
  "performance-diagnostics": null;
  navigate: { direction: "back" | "forward" };
  "manage-repository-actions": null;
  "push-to-branch": null;
}

export type QuickSwitcherItemKind = keyof QuickSwitcherPayloads;

interface QuickSwitcherItemFields {
  /** Unique across all sections. */
  id: string;
  section: QuickSwitcherSectionId;
  /** The option's accessible name. It contains the visible title. */
  label: string;
  /** The visible primary text. */
  title: string;
  /** Secondary text after the title, such as a path, an upstream or a command. */
  detail?: string | undefined;
  /** A short right-aligned hint, such as "current", "Run" or a count. */
  meta?: string | undefined;
  /** A keyboard shortcut hint, such as "Ctrl B". */
  kbd?: string | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  /** Marks the open repository, worktree, branch or view (aria-current). */
  current?: boolean | undefined;
  /** Marks the chosen value of a picker, such as the current upstream. */
  selected?: boolean | undefined;
  /** 1 for worktree rows nested under their repository. */
  depth?: number | undefined;
  /** Extra search terms. */
  keywords: string[];
}

export type QuickSwitcherItem = {
  [K in QuickSwitcherItemKind]: QuickSwitcherItemFields & { kind: K; payload: QuickSwitcherPayloads[K] };
}[QuickSwitcherItemKind];

export interface QuickSwitcherSection {
  id: QuickSwitcherSectionId;
  /** Unique key; equals the id except for upstream groups, which are keyed by remote. */
  key: string;
  /** The visible section heading. */
  label: string;
  items: QuickSwitcherItem[];
  /** Rows left out until the user types a query (remote branches only). */
  omittedCount?: number;
}

export interface RepositoryItemsInput {
  /** The open repository or worktree path, or an empty string. */
  repoPath: string;
  /** Saved repositories in their saved order. */
  repoRecents: readonly string[];
  repositoryGroups: readonly RepositoryGroup[];
  organization: RepositoryOrganization;
  repoSyncStatuses: Readonly<Record<string, RepoSyncStatus>>;
  showHidden: boolean;
  /** True while the query is not empty. Hidden repositories are then searchable. */
  searching: boolean;
  /** True while an operation runs. Pass isOperationRunning only; an unfinished merge or rebase comes from the summary. */
  running: boolean;
  /** The open repository's summary. Its unfinished merge, rebase, cherry-pick or revert blocks switching. */
  summary: Pick<RepoSummary, "operationState"> | null;
}

export interface BranchSectionInput {
  repoPath: string;
  summary: RepoSummary | null;
  /** True while an operation runs. An unfinished merge or rebase comes from summary.operationState. */
  running: boolean;
}

export interface GoToInput {
  summary: RepoSummary | null;
  stashCount: number;
  /** The compact open pull request count (formatCompactCount), or null while unknown. */
  pullRequestCount: string | null;
  /** The compact open issue count (formatCompactCount), or null while unknown. */
  issueCount: string | null;
  /** The activity log attention, already "none" while the activity log is open. */
  activityAttention: ActivityLogAttention;
  activeView: WorkspaceView;
}

export interface CommandInput {
  repoPath: string;
  summary: RepoSummary | null;
  /** True while an operation runs. An unfinished merge or rebase comes from summary.operationState. */
  running: boolean;
  branchPullRequests: readonly GitHubPullRequestAssociation[];
  hasPullRequestData: boolean;
  appUpdate: AppUpdateState;
  canGoBack: boolean;
  canGoForward: boolean;
}

export type QuickSwitcherInput = RepositoryItemsInput & BranchSectionInput & GoToInput & CommandInput;

const ADD_REPOSITORY_KBD = "Ctrl O";
const NEW_BRANCH_KBD = "Ctrl B";
const SETTINGS_KBD = "Ctrl ,";
const GO_BACK_KBD = "Alt ←";
const GO_FORWARD_KBD = "Alt →";

/**
 * Builds the Repositories section: saved repositories with pinned ones first and project grouping dropped. A
 * repository with more than one worktree lists its worktrees under it. Rows of unavailable repositories repair them.
 */
export function buildRepositoryItems({
  repoPath,
  repoRecents,
  repositoryGroups,
  organization,
  repoSyncStatuses,
  showHidden,
  searching,
  running,
  summary
}: RepositoryItemsInput): QuickSwitcherItem[] {
  const paths = [...repoRecents];
  const sections = organizeRepositories(paths, [...repositoryGroups], organization, "", showHidden || searching, repoPath);
  const pinnedPaths = sections.find((section) => section.id === "pinned")?.paths ?? [];
  const pinnedKeys = new Set(pinnedPaths.map(getRepoPathKey));
  const visibleKeys = new Set(sections.flatMap((section) => section.paths).map(getRepoPathKey));
  const orderedPaths = [
    ...pinnedPaths,
    ...paths.filter((path) => visibleKeys.has(getRepoPathKey(path)) && !pinnedKeys.has(getRepoPathKey(path)))
  ];
  const labels = repositoryLabels(paths, organization);
  const groupsByPath = new Map(repositoryGroups.map((group) => [getRepoPathKey(group.anchorPath), group]));
  const blockedReason = getOperationBlockedReason({ running, operationState: summary?.operationState ?? null }) ?? undefined;
  const blocked = blockedReason !== undefined;
  const items: QuickSwitcherItem[] = [];

  for (const path of orderedPaths) {
    const key = getRepoPathKey(path);
    const preference = repositoryPreference(organization, path);
    const label = labels.get(key);
    const group = groupsByPath.get(key) ?? null;
    const anchorPath = group?.anchorPath ?? path;
    const syncStatus = repoSyncStatuses[getRepoPathKey(anchorPath)] ?? null;
    const projectName = organization.projects.find((project) => project.id === preference.projectId)?.name ?? "";
    const base: RepositoryRowPayload = {
      path: group?.lastUsedPath ?? path,
      menuPath: anchorPath,
      group,
      worktree: null,
      displayName: label?.name ?? repositoryName(anchorPath),
      labelDetail: label?.detail ?? "",
      syncStatus,
      vcsKind: group?.kind ?? (syncStatus?.isValid ? syncStatus.kind : null),
      hidden: preference.hidden
    };
    const keywords = [
      anchorPath,
      base.displayName,
      preference.alias,
      base.labelDetail,
      projectName,
      ...(group?.worktrees.flatMap((worktree) => [worktree.path, worktree.branch ?? ""]) ?? [])
    ].filter(Boolean);
    const unavailableReason = group
      ? (syncStatus?.isValid === false ? syncStatus.error : "") || group.error
      : syncStatus?.isValid === false ? syncStatus.error : "";

    if (unavailableReason) {
      items.push({
        id: `repair:${key}`,
        section: "repositories",
        kind: "repair",
        label: `Repair repository location for ${anchorPath}`,
        title: base.displayName,
        detail: anchorPath,
        meta: "Unavailable",
        current: Boolean(repoPath) && (isSamePath(base.path, repoPath) || isSamePath(anchorPath, repoPath)),
        disabled: blocked,
        disabledReason: blockedReason,
        keywords: [...keywords, unavailableReason],
        payload: { ...base, path: anchorPath, reason: unavailableReason }
      });
    } else {
      const navigationWorktree = group?.worktrees.find((worktree) => isSamePath(worktree.path, group.lastUsedPath));
      const navigationUnavailable = Boolean(navigationWorktree?.isBare || navigationWorktree?.prunable);
      const current = Boolean(repoPath) && isSamePath(base.path, repoPath);
      const syncDescription = formatRepoSyncStatusDescription(syncStatus);
      items.push({
        id: `repository:${key}`,
        section: "repositories",
        kind: "repository",
        label: syncDescription ? `Switch to ${anchorPath}, ${syncDescription}` : `Switch to ${anchorPath}`,
        title: base.displayName,
        detail: anchorPath,
        meta: current ? "current" : undefined,
        current,
        disabled: blocked || navigationUnavailable,
        disabledReason: blockedReason ?? (navigationUnavailable ? "The last used worktree is unavailable." : undefined),
        keywords,
        payload: base
      });
    }

    if (group && group.worktrees.length > 1) {
      for (const worktree of group.worktrees) {
        items.push(buildWorktreeItem(worktree, base, repoPath, repoSyncStatuses, blockedReason));
      }
    }
  }

  const hiddenCount = paths.filter((path) => repositoryPreference(organization, path).hidden).length;
  items.push({
    id: "repositories:add",
    section: "repositories",
    kind: "add-repository",
    label: "Add or clone repository…",
    title: "Add or clone repository…",
    kbd: ADD_REPOSITORY_KBD,
    disabled: blocked,
    disabledReason: blockedReason,
    keywords: ["open", "clone", "new", "folder"],
    payload: null
  });
  if (hiddenCount > 0) {
    const title = showHidden ? "Hide hidden repositories" : `Show hidden repositories (${hiddenCount})`;
    items.push({
      id: "repositories:toggle-hidden",
      section: "repositories",
      kind: "toggle-hidden-repositories",
      label: title,
      title,
      keywords: ["hidden", "inactive"],
      payload: { showHidden: !showHidden }
    });
  }
  items.push({
    id: "repositories:organize",
    section: "repositories",
    kind: "organize-repositories",
    label: "Organize repositories…",
    title: "Organize repositories…",
    keywords: ["groups", "projects", "pin", "rename", "alias", "hide"],
    payload: null
  });
  return items;
}

function buildWorktreeItem(
  worktree: GitWorktree,
  groupRow: RepositoryRowPayload,
  repoPath: string,
  repoSyncStatuses: Readonly<Record<string, RepoSyncStatus>>,
  blockedReason: string | undefined
): QuickSwitcherItem {
  const current = Boolean(repoPath) && isSamePath(worktree.path, repoPath);
  const syncStatus = repoSyncStatuses[getRepoPathKey(worktree.path)] ?? null;
  const syncDescription = formatRepoSyncStatusDescription(syncStatus);
  const title = worktree.branch ?? (worktree.isDetached ? "Detached HEAD" : repositoryName(worktree.path));
  const unavailableReason = worktree.prunable
    ? worktree.prunableReason || "The worktree folder is missing."
    : worktree.isBare
      ? "A bare worktree cannot be opened."
      : undefined;
  const disabledReason = blockedReason ?? unavailableReason;
  const flags = [
    current ? "current" : "",
    worktree.isMain ? "main" : "",
    worktree.locked ? "locked" : "",
    worktree.prunable ? "missing" : ""
  ].filter(Boolean);
  const label = `Switch to worktree ${title} at ${worktree.path}`;
  return {
    id: `worktree:${getRepoPathKey(worktree.path)}`,
    section: "repositories",
    kind: "repository",
    label: syncDescription ? `${label}, ${syncDescription}` : label,
    title,
    detail: worktree.path,
    meta: flags.length ? flags.join(" · ") : undefined,
    current,
    depth: 1,
    disabled: disabledReason !== undefined,
    disabledReason,
    keywords: [worktree.path, worktree.branch ?? "", groupRow.displayName, "worktree"].filter(Boolean),
    payload: { ...groupRow, path: worktree.path, menuPath: worktree.path, worktree, syncStatus }
  };
}

export interface BranchSectionItems {
  "branches-local": QuickSwitcherItem[];
  "branches-remote": QuickSwitcherItem[];
  "branch-actions": QuickSwitcherItem[];
  remotes: QuickSwitcherItem[];
}

/** Builds the branch rows, the branch actions and the remote rows of the Branches content. */
export function buildBranchSectionItems({ repoPath, summary, running }: BranchSectionInput): BranchSectionItems {
  const result: BranchSectionItems = { "branches-local": [], "branches-remote": [], "branch-actions": [], remotes: [] };
  if (!summary) {
    return result;
  }

  const blockedReason = !summary.isValid
    ? REPOSITORY_UNAVAILABLE_REASON
    : getOperationBlockedReason({ running, operationState: summary.operationState }) ?? undefined;
  const blocked = blockedReason !== undefined;
  const ahead = summary.ahead ?? 0;

  for (const item of buildBranchItems({
    repoPath,
    currentBranch: summary.branch,
    branches: summary.branches,
    remoteBranches: summary.remoteBranches
  })) {
    const detail = item.detail ?? (item.kind === "local" ? "local only" : undefined);
    const aheadLabel = item.current && ahead > 0 ? formatCommitCountLabel(ahead, "ahead") : "";
    const section = item.kind === "local" ? "branches-local" : "branches-remote";
    result[section].push({
      id: `branch:${item.value}`,
      section,
      kind: "branch",
      label: [item.label, detail, aheadLabel].filter(Boolean).join(", "),
      title: item.label,
      detail,
      meta: aheadLabel ? `↑${ahead}` : undefined,
      current: item.current,
      disabled: blocked,
      disabledReason: blockedReason,
      keywords: item.kind === "remote"
        ? [item.remoteBranch.name]
        : [item.branch.upstream ?? "", item.worktreePath ?? ""].filter(Boolean),
      payload: { item, choice: resolveBranchChoice(item) }
    });
  }

  const currentBranchName = summary.branch ?? "current branch";
  const branchAction = (action: BranchAction, title: string, fields: Partial<Pick<QuickSwitcherItemFields, "detail" | "kbd" | "disabled" | "disabledReason">> = {}): QuickSwitcherItem => ({
    id: `branch-action:${action}`,
    section: "branch-actions",
    kind: "branch-action",
    label: fields.detail ? `${title}, ${fields.detail}` : title,
    title,
    detail: fields.detail,
    kbd: fields.kbd,
    disabled: fields.disabled ?? blocked,
    disabledReason: fields.disabled === false ? undefined : fields.disabledReason ?? blockedReason,
    keywords: ["branch"],
    payload: { action }
  });
  const actions = result["branch-actions"];
  actions.push(branchAction("new-branch", "New branch…", { kbd: NEW_BRANCH_KBD }));
  if (summary.kind === "git") {
    actions.push(
      branchAction("merge", `Merge into ${currentBranchName}…`),
      branchAction("rebase", `Rebase ${currentBranchName} onto…`),
      branchAction("checkout-tag", "Check out tag…"),
      branchAction("add-worktree", "Add worktree…")
    );
  }
  // Branch management stays available during operations, like the sidebar's manage button.
  actions.push(branchAction("manage-branches", "Manage branches…", { disabled: false }));
  if (summary.capabilities.setUpstream ?? true) {
    const reason = getUpstreamDisabledReason({
      currentBranch: summary.branch,
      upstream: summary.upstream,
      remoteBranches: summary.remoteBranches,
      running,
      operationState: summary.operationState,
      isValid: summary.isValid
    });
    actions.push(branchAction("change-upstream", "Change upstream…", {
      detail: summary.upstream ?? "No upstream",
      disabled: reason !== null,
      disabledReason: reason ?? undefined
    }));
  }

  const remoteNames = [...new Set(summary.remotes.map((remote) => remote.name))];
  if (summary.capabilities.manageRemotes ?? false) {
    const url = getRepositoryWebUrl(summary.remotes);
    const openDisabledReason = !summary.isValid
      ? REPOSITORY_UNAVAILABLE_REASON
      : !url ? "No hosted repository URL available" : undefined;
    result.remotes.push(
      {
        id: "remote:open",
        section: "remotes",
        kind: "open-remote",
        label: "Open remote repository",
        title: "Open remote repository",
        detail: url ?? undefined,
        disabled: openDisabledReason !== undefined,
        disabledReason: openDisabledReason,
        keywords: ["browser", "web", "hosted", ...remoteNames],
        payload: { url }
      },
      {
        id: "remote:manage",
        section: "remotes",
        kind: "manage-remotes",
        label: remoteNames.length ? `Manage remotes…, ${remoteNames.join(", ")}` : "Manage remotes…",
        title: "Manage remotes…",
        detail: remoteNames.length ? remoteNames.join(", ") : undefined,
        disabled: !summary.isValid,
        disabledReason: summary.isValid ? undefined : REPOSITORY_UNAVAILABLE_REASON,
        keywords: ["remote", ...remoteNames],
        payload: null
      }
    );
  } else {
    for (const name of remoteNames) {
      result.remotes.push({
        id: `remote:${name}`,
        section: "remotes",
        kind: "remote",
        label: `Remote ${name}`,
        title: name,
        keywords: ["remote", ...summary.remotes.filter((remote) => remote.name === name).map((remote) => remote.url)],
        payload: { name }
      });
    }
  }

  return result;
}

/** Builds the upstream options shown in 'upstream' mode, grouped by remote, with "No upstream" last. */
export function buildUpstreamSections({ summary, running }: Pick<BranchSectionInput, "summary" | "running">): QuickSwitcherSection[] {
  if (!summary) {
    return [];
  }

  const disabledReason = getUpstreamDisabledReason({
    currentBranch: summary.branch,
    upstream: summary.upstream,
    remoteBranches: summary.remoteBranches,
    running,
    operationState: summary.operationState,
    isValid: summary.isValid
  }) ?? undefined;
  const sections: QuickSwitcherSection[] = [];
  for (const option of buildUpstreamItems(summary.remoteBranches, summary.upstream)) {
    const key = option.upstream === null ? "upstream-tracking" : `upstream-remote:${option.group}`;
    let section = sections.at(-1);
    if (section?.key !== key) {
      section = { id: "upstream", key, label: option.group, items: [] };
      sections.push(section);
    }
    const detail = option.upstream === null ? option.detail : undefined;
    section.items.push({
      id: option.upstream === null ? "upstream:none" : `upstream:${option.upstream}`,
      section: "upstream",
      kind: "upstream",
      label: [option.label, detail, option.selected && option.upstream ? "current" : ""].filter(Boolean).join(", "),
      title: option.label,
      detail,
      meta: option.selected && option.upstream ? "current" : undefined,
      selected: option.selected,
      disabled: disabledReason !== undefined,
      disabledReason,
      keywords: [option.detail, option.group],
      payload: { upstream: option.upstream }
    });
  }
  return sections;
}

/**
 * Builds the Repository actions section: one row per configured action, named by its group path ("A › B"). A config
 * error or an empty configuration shows one notice row.
 */
export function buildRepositoryActionItems(actionsConfig: GitActionsConfig | null | undefined, { isValid }: { isValid: boolean }): QuickSwitcherItem[] {
  if (!actionsConfig) {
    return [];
  }

  const configError = actionsConfig.error.trim();
  const disabledReason = !isValid ? REPOSITORY_UNAVAILABLE_REASON : configError || undefined;
  const items = flattenConfiguredActions(buildConfiguredActionMenu(actionsConfig.actions), []).map(({ key, path, action }): QuickSwitcherItem => {
    const title = path.join(" › ");
    return {
      id: `repository-${key}`,
      section: "repository-actions",
      kind: "repository-action",
      label: title,
      title,
      detail: action.command,
      meta: "Run",
      disabled: disabledReason !== undefined,
      disabledReason,
      keywords: [action.name, action.description, action.command].filter(Boolean),
      payload: { action }
    };
  });

  if (configError || items.length === 0) {
    const title = configError || "No configured actions";
    items.unshift({
      id: "repository-actions:notice",
      section: "repository-actions",
      kind: "notice",
      label: title,
      title,
      disabled: true,
      disabledReason: title,
      keywords: ["repository actions"],
      payload: null
    });
  }
  return items;
}

function flattenConfiguredActions(
  entries: readonly ConfiguredActionMenuEntry[],
  parents: readonly string[]
): Array<{ key: string; path: string[]; action: GitConfiguredAction }> {
  return entries.flatMap((entry) => entry.type === "group"
    ? flattenConfiguredActions(entry.entries, [...parents, entry.label])
    : [{ key: entry.key, path: [...parents, entry.label], action: entry.action }]);
}

/** Builds the Go to section: the guest views the repository supports, then Settings. */
export function buildGoToItems({ summary, stashCount, pullRequestCount, issueCount, activityAttention, activeView }: GoToInput): QuickSwitcherItem[] {
  const items: QuickSwitcherItem[] = [];
  const view = (target: GuestView, fields: { meta?: string | undefined; labelSuffix?: string | undefined; keywords: string[] }): QuickSwitcherItem => {
    const title = WORKSPACE_VIEW_LABELS[target];
    return {
      id: `go-to:${target}`,
      section: "go-to",
      kind: "view",
      label: `${title}${fields.labelSuffix ?? ""}`,
      title,
      meta: fields.meta,
      current: activeView === target,
      keywords: fields.keywords,
      payload: { view: target }
    };
  };

  if (summary?.capabilities.stashes && stashCount > 0) {
    items.push(view("stashes", { meta: String(stashCount), labelSuffix: ` ${stashCount}`, keywords: ["stash"] }));
  }
  if (summary?.githubRepository) {
    items.push(
      view("pullRequests", {
        meta: pullRequestCount ? `${pullRequestCount} open` : undefined,
        labelSuffix: pullRequestCount ? ` ${pullRequestCount} open` : undefined,
        keywords: ["pr", "github", "review"]
      }),
      view("issues", {
        meta: issueCount ?? undefined,
        labelSuffix: issueCount ? ` ${issueCount}` : undefined,
        keywords: ["github", "bugs"]
      }),
      view("workflows", { keywords: ["github", "actions", "ci", "checks"] })
    );
  }
  if (summary?.isValid && summary.capabilities.analytics) {
    items.push(view("analytics", { keywords: ["insights", "statistics", "charts"] }));
  }
  items.push(view("activity", {
    labelSuffix: activityAttention === "error"
      ? ", unread error details available"
      : activityAttention === "unread" ? ", unread output available" : undefined,
    keywords: ["output", "log", "console"]
  }));
  items.push({
    id: "go-to:settings",
    section: "go-to",
    kind: "settings",
    label: "Settings",
    title: "Settings",
    kbd: SETTINGS_KBD,
    keywords: ["preferences", "options", "theme", "font"],
    payload: null
  });
  return items;
}

/** Builds the Commands section. */
export function buildCommandItems({
  repoPath,
  summary,
  running,
  branchPullRequests,
  hasPullRequestData,
  appUpdate,
  canGoBack,
  canGoForward
}: CommandInput): QuickSwitcherItem[] {
  const items: QuickSwitcherItem[] = [];
  const blockedReason = getOperationBlockedReason({ running, operationState: summary?.operationState ?? null }) ?? undefined;

  if (branchPullRequests.length > 0) {
    for (const pullRequest of branchPullRequests) {
      const title = `Open pull request #${pullRequest.number} · ${formatPullRequestAssociationState(pullRequest)}`;
      const repository = pullRequest.headRepositoryFullName ?? pullRequest.baseRepositoryFullName;
      items.push({
        id: `command:pull-request:${repository}#${pullRequest.number}`,
        section: "commands",
        kind: "open-pull-request",
        label: title,
        title,
        detail: pullRequest.title,
        keywords: ["pr", "github", repository, pullRequest.headBranch],
        payload: { pullRequest }
      });
    }
  } else if (shouldShowCreatePullRequest(summary, [], hasPullRequestData)) {
    items.push({
      id: "command:create-pull-request",
      section: "commands",
      kind: "create-pull-request",
      label: "Create pull request…",
      title: "Create pull request…",
      disabled: blockedReason !== undefined,
      disabledReason: blockedReason,
      keywords: ["pr", "github", "new"],
      payload: null
    });
  }

  if (repoPath) {
    items.push({
      id: "command:repository-settings",
      section: "commands",
      kind: "repository-settings",
      label: "Repository settings…",
      title: "Repository settings…",
      keywords: ["git config", "identity", "preferences"],
      payload: { path: repoPath }
    });
  }

  const updateAction = resolveAppUpdateAction(appUpdate);
  if (updateAction !== "none") {
    const title = getAppUpdateButtonLabel(appUpdate);
    const busy = appUpdate.status === "checking" || appUpdate.status === "downloading";
    const version = appUpdate.downloadedVersion ?? appUpdate.availableVersion;
    items.push({
      id: "command:app-update",
      section: "commands",
      kind: "app-update",
      label: appUpdate.message ? `${title}: ${appUpdate.message}` : title,
      title,
      detail: version ? `Version ${version}` : undefined,
      disabled: busy,
      disabledReason: busy ? title : undefined,
      keywords: ["update", "upgrade", "version", "install"],
      payload: { action: updateAction }
    });
  }

  items.push(
    {
      id: "command:performance-diagnostics",
      section: "commands",
      kind: "performance-diagnostics",
      label: "Performance diagnostics…",
      title: "Performance diagnostics…",
      keywords: ["performance", "diagnostics", "slow", "profile"],
      payload: null
    },
    {
      id: "command:go-back",
      section: "commands",
      kind: "navigate",
      label: "Go back",
      title: "Go back",
      kbd: GO_BACK_KBD,
      disabled: !canGoBack,
      disabledReason: canGoBack ? undefined : "There is no previous view.",
      keywords: ["back", "previous", "navigation"],
      payload: { direction: "back" }
    },
    {
      id: "command:go-forward",
      section: "commands",
      kind: "navigate",
      label: "Go forward",
      title: "Go forward",
      kbd: GO_FORWARD_KBD,
      disabled: !canGoForward,
      disabledReason: canGoForward ? undefined : "There is no next view.",
      keywords: ["forward", "next", "navigation"],
      payload: { direction: "forward" }
    }
  );

  if (summary) {
    items.push({
      id: "command:manage-repository-actions",
      section: "commands",
      kind: "manage-repository-actions",
      label: "Manage repository actions…",
      title: "Manage repository actions…",
      disabled: !summary.isValid,
      disabledReason: summary.isValid ? undefined : REPOSITORY_UNAVAILABLE_REASON,
      keywords: ["actions", "scripts", "configure"],
      payload: null
    });
  }

  if (summary?.capabilities.pushToBranch) {
    const disabledReason = blockedReason
      ?? (!summary.branch ? "Switch to a branch before pushing." : getPushRemotes(summary).length === 0 ? "Add a remote before pushing." : undefined);
    items.push({
      id: "command:push-to-branch",
      section: "commands",
      kind: "push-to-branch",
      label: "Push to another branch…",
      title: "Push to another branch…",
      disabled: disabledReason !== undefined,
      disabledReason,
      keywords: ["push", "remote", "branch"],
      payload: null
    });
  }

  return items;
}

/** Branch section headings: the 'all' list names them in full; the branch pill's list is only about branches. */
const BRANCH_SECTION_LABELS = {
  all: { "branches-local": "Branches", "branches-remote": "Remote branches", "branch-actions": "Branch actions" },
  branches: { "branches-local": "Local", "branches-remote": "Remote", "branch-actions": "Actions" }
} as const;

/**
 * Builds the sections for a mode. 'all' lists Repositories, the Branches content, Repository actions, Go to and
 * Commands. 'branches' lists only the Branches content. 'upstream' lists only the upstream options. Empty sections
 * are left out.
 */
export function buildQuickSwitcherSections(mode: QuickSwitcherMode, input: QuickSwitcherInput): QuickSwitcherSection[] {
  if (mode === "upstream") {
    return buildUpstreamSections(input);
  }

  const branchLabels = BRANCH_SECTION_LABELS[mode];
  const branchItems = buildBranchSectionItems(input);
  const capabilities = input.summary?.capabilities;
  const section = (id: Exclude<QuickSwitcherSectionId, "upstream">, label: string, items: QuickSwitcherItem[]): QuickSwitcherSection => ({
    id,
    key: id,
    label,
    items
  });
  const branchSections = [
    section("branches-local", branchLabels["branches-local"], branchItems["branches-local"]),
    section("branches-remote", branchLabels["branches-remote"], branchItems["branches-remote"]),
    section("branch-actions", branchLabels["branch-actions"], branchItems["branch-actions"]),
    section(
      "remotes",
      capabilities?.manageRemotes || (capabilities?.multipleRemotes ?? true) ? "Remotes" : "Remote",
      branchItems.remotes
    )
  ];
  const sections = mode === "branches"
    ? branchSections
    : [
        section("repositories", "Repositories", buildRepositoryItems(input)),
        ...branchSections,
        section(
          "repository-actions",
          "Repository actions",
          buildRepositoryActionItems(input.summary?.actionsConfig, { isValid: Boolean(input.summary?.isValid) })
        ),
        section("go-to", "Go to", buildGoToItems(input)),
        section("commands", "Commands", buildCommandItems(input))
      ];
  return sections.filter((candidate) => candidate.items.length > 0);
}

export interface QuickSwitcherFilterOptions {
  /** Remote branch rows kept while the query is empty. Defaults to REMOTE_BRANCH_ROW_LIMIT. */
  remoteBranchLimit?: number;
}

const searchTextCache = new WeakMap<QuickSwitcherItem, string>();

/**
 * Keeps the items whose label, title or keywords contain every whitespace-separated query token, ignoring case.
 * Section order and item order are kept and empty sections are dropped. While the query is empty, remote branch rows
 * are capped and the section reports how many it left out.
 */
export function filterQuickSwitcherItems(
  sections: readonly QuickSwitcherSection[],
  query: string,
  { remoteBranchLimit = REMOTE_BRANCH_ROW_LIMIT }: QuickSwitcherFilterOptions = {}
): QuickSwitcherSection[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result: QuickSwitcherSection[] = [];

  for (const section of sections) {
    if (!tokens.length) {
      if (section.id === "branches-remote" && section.items.length > remoteBranchLimit) {
        result.push({
          ...section,
          items: section.items.slice(0, remoteBranchLimit),
          omittedCount: section.items.length - remoteBranchLimit
        });
      } else if (section.items.length) {
        result.push(section);
      }
      continue;
    }

    const items = section.items.filter((item) => {
      const text = getSearchText(item);
      return tokens.every((token) => text.includes(token));
    });
    if (items.length) {
      result.push(items.length === section.items.length ? section : { ...section, items });
    }
  }

  return result;
}

function getSearchText(item: QuickSwitcherItem): string {
  let text = searchTextCache.get(item);
  if (text === undefined) {
    text = [item.label, item.title, ...item.keywords].join("\n").toLocaleLowerCase();
    searchTextCache.set(item, text);
  }
  return text;
}

function isSamePath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}
