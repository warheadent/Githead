export const GIT_ACTIONS = [
  "fetch",
  "pull",
  "push"
] as const;

export type GitAction = (typeof GIT_ACTIONS)[number];

export const GIT_CONFIGURED_ACTION_SHELLS = [
  "powershell",
  "cmd",
  "bash"
] as const;

export type GitConfiguredActionShell = (typeof GIT_CONFIGURED_ACTION_SHELLS)[number];

export interface GitConfiguredAction {
  name: string;
  description: string;
  command: string;
  shell: GitConfiguredActionShell;
}

export type GitConfiguredActionFile = "shared" | "local";

export interface GitConfiguredActionFileConfig {
  target: GitConfiguredActionFile;
  fileName: string;
  exists: boolean;
  actions: GitConfiguredAction[];
  error: string;
  writable: boolean;
  blockedReason: string;
}

export interface GitActionsConfig {
  hasGitheadDir: boolean;
  actions: GitConfiguredAction[];
  error: string;
  shared: GitConfiguredActionFileConfig;
  local: GitConfiguredActionFileConfig;
}

export interface GitRemote {
  name: string;
  url: string;
  direction: "fetch" | "push";
}

export interface GitRemoteConfig {
  name: string;
  fetchUrls: string[];
  /** Explicit remote.<name>.pushurl values. Empty means Git reuses the fetch URL. */
  pushUrls: string[];
  trackedBranches: string[];
}

export interface GitRemoteBranch {
  name: string;
  remote: string;
  branch: string;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  webUrl: string;
}

export interface GitHubWorkflowRun {
  id: string;
  name: string;
  runNumber: number | null;
  status: string;
  conclusion: string | null;
  branch: string;
  event: string;
  commitSha: string;
  commitMessage: string;
  url: string;
  startedAt: string;
  updatedAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  authorLogin: string;
  labels: string[];
  comments: number;
  updatedAt: string;
  url: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  authorLogin: string;
  sourceBranch: string;
  sourceRepositoryFullName: string;
  targetBranch: string;
  labels: string[];
  comments: number;
  draft: boolean;
  updatedAt: string;
  url: string;
}

export type GitHubItemType = "pullRequest" | "issue";
export type GitHubPullRequestDisplayState = "open" | "closed" | "merged" | "draft";
export type GitHubMergeStatus = "ready" | "blocked" | "conflicting" | "checking" | "closed" | "merged" | "draft";
export type GitHubReviewStatus = "approved" | "changesRequested" | "reviewRequired" | "none";

export interface GitHubUserSummary {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface GitHubCommentDetail {
  id: string;
  kind: "issue" | "review";
  author: GitHubUserSummary;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  path: string | null;
  line: number | null;
  side: string | null;
  diffHunk: string | null;
}

export interface GitHubReviewDetail {
  id: string;
  author: GitHubUserSummary;
  state: string;
  body: string;
  submittedAt: string;
  url: string;
}

export interface GitHubPullRequestFileDetail {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  url: string;
}

export interface GitHubCheckDetail {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string;
  startedAt: string;
  completedAt: string;
}

export interface GitHubPullRequestCommitDetail {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authoredAt: string;
  url: string;
}

export interface GitHubPullRequestDetail {
  number: number;
  title: string;
  displayState: GitHubPullRequestDisplayState;
  draft: boolean;
  author: GitHubUserSummary;
  body: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  url: string;
  sourceBranch: string;
  sourceRepositoryFullName: string;
  sourceSha: string;
  targetBranch: string;
  targetRepositoryFullName: string;
  mergeable: boolean | null;
  mergeableState: string;
  mergeStatus: GitHubMergeStatus;
  canMerge: boolean;
  reviewStatus: GitHubReviewStatus;
  requestedReviewers: GitHubUserSummary[];
  comments: GitHubCommentDetail[];
  reviews: GitHubReviewDetail[];
  files: GitHubPullRequestFileDetail[];
  checks: GitHubCheckDetail[];
  commits: GitHubPullRequestCommitDetail[];
  commitCount: number;
  branchRelationship: string;
  aheadBy: number;
  behindBy: number;
}

export interface GitHubLabelDetail {
  name: string;
  color: string;
}

export interface GitHubMilestoneDetail {
  number: number;
  title: string;
  url: string;
}

export interface GitHubLinkedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GitHubIssueDetail {
  number: number;
  title: string;
  state: string;
  author: GitHubUserSummary;
  body: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
  comments: GitHubCommentDetail[];
  assignees: GitHubUserSummary[];
  labels: GitHubLabelDetail[];
  milestone: GitHubMilestoneDetail | null;
  linkedPullRequests: GitHubLinkedPullRequest[];
}

export interface GitHubOpenCounts {
  issues: number;
  pullRequests: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  /** Absolute path of the worktree currently checking out this branch. */
  worktreePath?: string | null;
}

export interface GitWorktree {
  path: string;
  head: string | null;
  branch: string | null;
  isMain: boolean;
  isBare: boolean;
  isDetached: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  prunableReason: string | null;
}

export interface GitWorktreeList {
  commonDir: string;
  worktrees: GitWorktree[];
}

export interface RepositoryGroup {
  id: string;
  kind: VcsKind;
  anchorPath: string;
  lastUsedPath: string;
  recentPaths: string[];
  commonDir: string | null;
  worktrees: GitWorktree[];
  error: string;
}

export interface RepositoryRecent {
  anchorPath: string;
  lastUsedPath: string;
}

export interface RepositoryRecentSelectionRequest {
  repoPath: string;
  anchorPath?: string;
}

export interface RepositoryGroupsRequest {
  repoPaths: string[];
  activeRepoPath: string | null;
}

export type GitDiffSide = "staged" | "unstaged";

export type GitDiffKind = "text" | "image" | "binary" | "empty" | "error";

export type CommitRefKind = "head" | "branch" | "remote" | "tag" | "other";

export type CommitHistoryScope = "current" | "all";

export interface CommitRef {
  name: string;
  kind: CommitRefKind;
}

export interface GitCommitGraphRow {
  hash: string;
  shortHash: string;
  parents: string[];
  refs: CommitRef[];
  subject: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  relativeDate: string;
}

export interface GitCommitChangedFile {
  path: string;
  originalPath?: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitCommitDetails {
  hash: string;
  shortHash: string;
  refs: CommitRef[];
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  parents: string[];
  files: GitCommitChangedFile[];
}

export interface GitFileHistoryEntry extends GitCommitGraphRow {
  path: string;
  originalPath?: string;
  status: string;
}

export interface GitFileHistoryResult {
  repoPath: string;
  startHash: string;
  requestedPath: string;
  entries: GitFileHistoryEntry[];
  hasMore: boolean;
}

export interface GitBlameCommit {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  summary: string;
}

export interface GitBlameLine {
  finalLine: number;
  originalLine: number;
  commitHash: string;
  originalPath: string;
  text: string;
  boundary: boolean;
}

export type GitFileBlameResult =
  | {
    kind: "text";
    repoPath: string;
    hash: string;
    path: string;
    byteLength: number;
    lines: GitBlameLine[];
    commits: GitBlameCommit[];
  }
  | {
    kind: "unavailable";
    repoPath: string;
    hash: string;
    path: string;
    reason: "missing" | "binary" | "oversized" | "too-many-lines" | "metadata-limit" | "timed-out";
    message: string;
    byteLength?: number;
    lineCount?: number;
  };

export interface GitStatusFile {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isConflicted: boolean;
  submodule?: GitSubmoduleFileState;
}

export interface GitSubmoduleFileState {
  commitChanged: boolean;
  trackedChanges: boolean;
  untrackedChanges: boolean;
  initialized: boolean;
  canStage: boolean;
  canUnstage: boolean;
}

export interface GitSubmodule {
  path: string;
  url: string;
  recordedCommit: string | null;
  checkedOutCommit: string | null;
  initialized: boolean;
  status: "clean" | "modified" | "untracked" | "conflicted" | "uninitialized" | "missing";
}

export type VcsKind = "git" | "lore";

/**
 * Feature flags describing what a repository's backing VCS supports. The
 * renderer gates VCS-specific UI on these rather than on `kind` directly so
 * that adding a third VCS later does not require touching every call site.
 */
export interface RepoCapabilities {
  renameBranches: boolean;
  removeBranches: boolean;
  hunkStaging: boolean;
  tags: boolean;
  multipleRemotes: boolean;
  manageRemotes: boolean;
  setUpstream: boolean;
  pushToBranch: boolean;
  fetch: boolean;
  sync: boolean;
  resetModes: boolean;
  safeDirectory: boolean;
  github: boolean;
  ignoreFile: boolean;
  worktrees: boolean;
  fileHistory: boolean;
  blame: boolean;
  stashes: boolean;
}

export function gitCapabilities(): RepoCapabilities {
  return {
    renameBranches: true,
    removeBranches: true,
    hunkStaging: true,
    tags: true,
    multipleRemotes: true,
    manageRemotes: true,
    setUpstream: true,
    pushToBranch: true,
    fetch: true,
    sync: false,
    resetModes: true,
    safeDirectory: true,
    github: true,
    ignoreFile: true,
    worktrees: true,
    fileHistory: true,
    blame: true,
    stashes: true
  };
}

export function loreCapabilities(): RepoCapabilities {
  return {
    renameBranches: false,
    removeBranches: true,
    hunkStaging: false,
    tags: false,
    multipleRemotes: false,
    manageRemotes: false,
    setUpstream: false,
    pushToBranch: false,
    fetch: false,
    sync: true,
    resetModes: false,
    safeDirectory: false,
    github: false,
    ignoreFile: false,
    worktrees: false,
    fileHistory: false,
    blame: false,
    stashes: false
  };
}

export function capabilitiesForKind(kind: VcsKind): RepoCapabilities {
  return kind === "lore" ? loreCapabilities() : gitCapabilities();
}

export interface RepoSummary {
  repoPath: string;
  kind: VcsKind;
  capabilities: RepoCapabilities;
  isValid: boolean;
  branch: string | null;
  upstream: string | null;
  branches: GitBranch[];
  hasHead: boolean;
  remotes: GitRemote[];
  remoteBranches: GitRemoteBranch[];
  defaultRemoteBranch: GitRemoteBranch | null;
  commitsAheadOfDefaultBranch: number | null;
  githubRepository: GitHubRepository | null;
  ahead: number | null;
  behind: number | null;
  files: GitStatusFile[];
  operationState: GitRepositoryOperationState | null;
  submodules?: GitSubmodule[];
  validationErrors: string[];
  safeDirectory: GitSafeDirectoryInfo | null;
  actionsConfig: GitActionsConfig;
}

export interface RepoSyncStatus {
  repoPath: string;
  kind: VcsKind;
  isValid: boolean;
  ahead: number;
  behind: number;
  error: string;
}

export interface GitSafeDirectoryInfo {
  required: boolean;
  path: string;
  message: string;
}

export interface GitSafeDirectoryRequest {
  repoPath: string;
}

export interface GitPushTarget {
  sourceBranch: string;
  remoteName: string;
  destinationBranch: string;
}

interface GitBaseRunRequest {
  repoPath: string;
}

export type GitRunRequest =
  | (GitBaseRunRequest & {
      action: "fetch" | "pull";
      pushTarget?: never;
    })
  | (GitBaseRunRequest & {
      action: "push";
      pushTarget?: GitPushTarget;
    });

export interface GitConfiguredActionRunRequest {
  repoPath: string;
  name: string;
}

export interface GitConfiguredActionSaveRequest {
  repoPath: string;
  target: GitConfiguredActionFile;
  actions: GitConfiguredAction[];
}

export interface GitHubRepositoryRequest {
  repoPath: string;
  /** Opaque renderer-generated identity. Optional only for backwards-compatible direct service callers. */
  requestId?: string;
}

export type GitHubSortDirection = "desc" | "asc";
export type GitHubWorkflowRunStatus = "queued" | "in_progress" | "completed" | "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | "neutral" | "stale";

export interface GitHubWorkflowRunQuery {
  branch?: string | undefined;
  event?: string | undefined;
  status?: GitHubWorkflowRunStatus | undefined;
  sortDirection: GitHubSortDirection;
}

export interface GitHubPullRequestQuery {
  search?: string | undefined;
  author?: string | undefined;
  assignee?: string | undefined;
  reviewRequested?: string | undefined;
  label?: string | undefined;
  sourceBranch?: string | undefined;
  draft?: "draft" | "ready" | undefined;
  sort: "updated" | "created";
  direction: GitHubSortDirection;
}

export interface GitHubIssueQuery {
  search?: string | undefined;
  author?: string | undefined;
  assignee?: string | undefined;
  unassigned?: boolean | undefined;
  label?: string | undefined;
  sort: "updated" | "created";
  direction: GitHubSortDirection;
}

export interface GitHubViewer {
  login: string | null;
  authenticated: boolean;
}

export type GitHubAuthenticationSource = "anonymous" | "environment" | "githubApp" | "gh";
export type GitHubConnectionState = "anonymous" | "authenticated" | "unauthorized" | "rateLimited" | "offline";
export type GitHubRepositoryAccess = "unknown" | "granted" | "missing";

export interface GitHubConnectionStatus {
  state: GitHubConnectionState;
  source: GitHubAuthenticationSource;
  accountLogin: string | null;
  repositoryAccess: GitHubRepositoryAccess;
  message: string;
  failure: GitHubFailure | null;
}

export interface GitHubConnectionRequest {
  repoPath?: string;
}

export interface GitHubDeviceFlow {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  intervalSeconds: number;
}

export type GitHubDeviceFlowPollResult =
  | { state: "pending"; intervalSeconds: number }
  | { state: "connected"; connection: GitHubConnectionStatus }
  | { state: "error"; message: string; retryable: boolean };

export interface GitHubPageRequest extends GitHubRepositoryRequest {
  page?: number;
}

export interface GitHubWorkflowRunsRequest extends GitHubPageRequest { query?: GitHubWorkflowRunQuery | undefined }
export interface GitHubPullRequestsRequest extends GitHubPageRequest { query?: GitHubPullRequestQuery | undefined }
export interface GitHubIssuesRequest extends GitHubPageRequest { query?: GitHubIssueQuery | undefined }

export interface GitHubPullRequestDetailRequest extends GitHubRepositoryRequest {
  number: number;
}

export interface GitHubIssueDetailRequest extends GitHubRepositoryRequest {
  number: number;
}

export interface GitHubPullRequestReviewRequest extends GitHubRepositoryRequest {
  number: number;
  body?: string;
}

export interface GitHubItemCommentRequest extends GitHubRepositoryRequest {
  itemType: GitHubItemType;
  number: number;
  body: string;
}

export interface GitHubPullRequestMergeRequest extends GitHubRepositoryRequest {
  number: number;
  method?: "merge" | "squash" | "rebase";
}

export interface GitHubMutationResult {
  number: number;
  url: string;
  message: string;
  merged: boolean | null;
}

export interface GitHubPage<T> {
  items: T[];
  page: number;
  nextPage: number | null;
  totalCount: number | null;
}

export interface CancelGitHubRequest {
  requestId: string;
}

export type GitHubFailureKind =
  | "cancelled" | "timeout" | "offline" | "authentication" | "authorization"
  | "notFound" | "rateLimited" | "validation" | "transient" | "unexpected";

export interface GitHubRateLimit {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  resource: string | null;
}

export interface GitHubFailure {
  kind: GitHubFailureKind;
  message: string;
  missingPermission?: string | null;
  retryable: boolean;
  retryAfterAt: string | null;
  outcomeUnknown: boolean;
  source: "gh" | "rest" | "combined";
  rateLimit: GitHubRateLimit | null;
}

export type GitHubOperationResult<T> =
  | { ok: true; data: T; rateLimit: GitHubRateLimit | null }
  | { ok: false; error: GitHubFailure };

export interface CreatePullRequestRequest {
  repoPath: string;
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  draft: boolean;
}

export interface CreatePullRequestResult {
  number: number;
  url: string;
  title: string;
  draft: boolean;
}

export interface RepositoryReadRequest {
  requestId?: string;
}

export interface RepoSummaryReadRequest extends RepositoryReadRequest {
  repoPath: string;
}

export interface CancelRepositoryReadRequest {
  requestId: string;
}

export interface GitOperationContext {
  operationId: string;
}

export type CoordinatedRequest<T> = T & GitOperationContext;

export interface CancelGitOperationRequest {
  operationId: string;
}

export interface GetGitOperationStatesRequest {
  operationIds: string[];
}

export interface GitOperationStateResult {
  operationId: string;
  state: "running" | "cancelling" | "not-found" | "not-owner";
}

export type CancelGitOperationResult =
  | { accepted: true; state: "cancelling" | "already-cancelling" }
  | { accepted: false; state: "not-found" | "not-owner" };

export interface RepoSectionRequest extends RepositoryReadRequest {
  repoPath: string;
  generation: number;
}

export interface RepoIdentitySection {
  repoPath: string;
  generation: number;
  kind: VcsKind;
  capabilities: RepoCapabilities;
  isValid: boolean;
  branch: string | null;
  hasHead: boolean;
  safeDirectory: GitSafeDirectoryInfo | null;
  validationErrors: string[];
}

export interface RepoStatusSection {
  repoPath: string;
  generation: number;
  ahead: number | null;
  behind: number | null;
  files: GitStatusFile[];
  operationState: GitRepositoryOperationState | null;
  submodules?: GitSubmodule[];
}

export interface RepoMetadataSection {
  repoPath: string;
  generation: number;
  upstream: string | null;
  branches: GitBranch[];
  remotes: GitRemote[];
  remoteBranches: GitRemoteBranch[];
  defaultRemoteBranch: GitRemoteBranch | null;
  commitsAheadOfDefaultBranch: number | null;
  githubRepository: GitHubRepository | null;
  actionsConfig: GitActionsConfig;
}

export interface GitCommitHistoryRequest extends RepositoryReadRequest {
  repoPath: string;
  limit?: number;
  scope?: CommitHistoryScope;
}

export interface GitCommitDetailsRequest extends RepositoryReadRequest {
  repoPath: string;
  hash: string;
}

export interface GitCommitFileDiffRequest extends RepositoryReadRequest {
  repoPath: string;
  hash: string;
  path: string;
  originalPath?: string;
}

export interface GitCommitFileResetRequest {
  repoPath: string;
  hash: string;
  paths: string[];
}

export interface GitCommitFileVersionRequest {
  repoPath: string;
  hash: string;
  path: string;
}

export interface ClipboardTextRequest {
  text: string;
}

export interface GitPathRequest {
  repoPath: string;
  paths: string[];
}

export type GitStashScope = "all" | "selected" | "staged";

export interface GitStashSelection {
  scope: GitStashScope;
  paths: string[];
  includeUntracked: boolean;
  keepIndex: boolean;
}

export interface GitStashEntry {
  ref: string;
  hash: string;
  message: string;
  sourceBranch: string | null;
  createdAt: string;
}

export interface GitStashFile {
  path: string;
  originalPath?: string;
  status: string;
}

export interface GitStashDetails {
  stash: GitStashEntry;
  files: GitStashFile[];
}

export interface GitStashListRequest extends RepositoryReadRequest {
  repoPath: string;
}

export interface GitStashDetailsRequest extends RepositoryReadRequest {
  repoPath: string;
  stashRef: string;
}

export interface GitStashFileDiffRequest extends RepositoryReadRequest {
  repoPath: string;
  stashRef: string;
  path: string;
}

export interface GitStashCreateRequest extends GitStashSelection {
  repoPath: string;
  message: string;
}

export interface GitStashRefRequest {
  repoPath: string;
  stashRef: string;
}

export interface GitStashBranchRequest extends GitStashRefRequest {
  branchName: string;
}

export interface GitSinglePathRequest {
  repoPath: string;
  path: string;
}

export interface GitIgnorePathRequest {
  repoPath: string;
  path: string;
}

export interface FileSystemPathRequest {
  repoPath: string;
  path: string;
}

export interface FileSystemPathListRequest {
  repoPath: string;
  paths: string[];
}

export interface RepoTrustRequest {
  repoPath: string;
}

export interface RepoTrustResult {
  trusted: boolean;
}

export interface GitCommitRequest {
  repoPath: string;
  message: string;
}

export type GitCommitAndPushOutcome =
  | "pushed"
  | "remote-ahead"
  | "diverged"
  | "fetch-failed"
  | "preflight-failed"
  | "commit-failed"
  | "push-failed";

export interface GitCommitAndPushResult extends GitOperationResult {
  outcome: GitCommitAndPushOutcome;
  commitCreated: boolean;
  branchName: string | null;
  ahead: number | null;
  behind: number | null;
  previousHeadOid: string | null;
  headOid: string | null;
  canUndoCommit: boolean;
  push?: GitPushResultDetails;
}

export type GitCommitWithRemoteCheckOutcome =
  | "committed"
  | "remote-ahead"
  | "diverged"
  | "fetch-failed"
  | "preflight-failed"
  | "commit-failed";

export interface GitCommitWithRemoteCheckResult extends GitOperationResult {
  outcome: GitCommitWithRemoteCheckOutcome;
  commitCreated: boolean;
  branchName: string | null;
  ahead: number | null;
  behind: number | null;
}

export interface GitUndoCommitRequest {
  repoPath: string;
  branchName: string;
  expectedHeadOid: string;
  previousHeadOid: string;
}

export type GitAmendMode = "message-only" | "staged-edit" | "staged-keep";
export type GitAmendEntryPoint = "history" | "composer";

export interface GitAmendPreviewRequest {
  repoPath: string;
  source: GitAmendEntryPoint;
  mode?: GitAmendMode;
}

export interface GitAmendStagedFile {
  path: string;
  originalPath?: string;
  status: string;
}

export interface GitAmendRecoveryPoint {
  ref: string;
  oid: string;
  shortOid: string;
  subject: string;
  commitDate: string;
  restoreToken: string;
}

export interface GitAmendPreview {
  repoPath: string;
  repositoryId: string;
  snapshotId: string;
  source: GitAmendEntryPoint;
  mode: GitAmendMode;
  defaultMode: GitAmendMode;
  currentBranch: string | null;
  headOid: string;
  shortHeadOid: string;
  subject: string;
  message: string;
  authorName: string;
  authorEmail: string;
  commitDate: string;
  stagedFiles: GitAmendStagedFile[];
  indexFingerprint: string;
  upstream: string | null;
  publication: "published" | "local-ahead" | "local" | "unknown";
  publishedRefs: string[];
  blockingReasons: string[];
  recoveryPoints: GitAmendRecoveryPoint[];
}

export interface GitAmendPreviewResult {
  outcome: "ready" | "blocked" | "failed";
  preview: GitAmendPreview | null;
  message: string;
}

export interface GitAmendExecuteRequest {
  repoPath: string;
  source: GitAmendEntryPoint;
  mode: GitAmendMode;
  message: string;
  expectedSnapshotId: string;
}

export type GitAmendErrorKind =
  | "missing-author-identity"
  | "hook-rejected"
  | "signing-failed"
  | "invalid-message"
  | "noninteractive-prompt"
  | "stale"
  | "no-head"
  | "operation-active"
  | "cancelled"
  | "timed-out"
  | "verification-failed";

export interface GitAmendResult extends GitOperationResult {
  outcome: "completed" | "stale" | "cancelled" | "timed-out" | "failed";
  message: string;
  previousHeadOid: string | null;
  headOid: string | null;
  recoveryRef: string | null;
  amendErrorKind?: GitAmendErrorKind;
  viewRefreshWarning?: string;
}

export interface GitAmendRestoreRequest {
  repoPath: string;
  recoveryRef: string;
  expectedRestoreToken: string;
}

export interface GitAmendRestoreResult extends GitOperationResult {
  outcome: "completed" | "stale" | "cancelled" | "timed-out" | "failed";
  message: string;
  previousHeadOid: string | null;
  headOid: string | null;
  recoveryRef: string | null;
}

export interface GitQuickCommitRequest extends GitCommitRequest {
  paths: string[];
}

export interface GitCommitHashRequest {
  repoPath: string;
  hash: string;
}

export type GitIntegrationKind = "merge" | "cherry-pick" | "rebase";
export type GitIntegrationRefKind = "local" | "remote";

export interface GitIntegrationRef {
  kind: GitIntegrationRefKind;
  /** Display name, for example `feature/search` or `origin/feature/search`. */
  name: string;
}

export type GitMergeMode = "normal" | "ff-only" | "no-ff" | "squash";

export interface GitIntegrationCommit {
  oid: string;
  shortOid: string;
  parentOids: string[];
  subject: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  files: GitCommitChangedFile[];
}

export interface GitIntegrationFile {
  path: string;
  originalPath?: string;
  status: string;
}

interface GitIntegrationPreviewBase {
  kind: GitIntegrationKind;
  repoPath: string;
  snapshotId: string;
  currentBranch: string | null;
  headOid: string | null;
  clean: boolean;
  blockingReasons: string[];
  warnings: string[];
  commits: GitIntegrationCommit[];
  files: GitIntegrationFile[];
}

export interface GitMergePreview extends GitIntegrationPreviewBase {
  kind: "merge";
  source: GitIntegrationRef;
  sourceOid: string;
  ahead: number;
  behind: number;
  canFastForward: boolean;
  alreadyUpToDate: boolean;
}

export interface GitCherryPickPreview extends GitIntegrationPreviewBase {
  kind: "cherry-pick";
  /** Exact application order. */
  commitOids: string[];
  mergeCommitOids: string[];
  alreadyContainedCommitOids: string[];
}

export interface GitRebasePreview extends GitIntegrationPreviewBase {
  kind: "rebase";
  newBase: GitIntegrationRef;
  newBaseOid: string;
  upstream: string | null;
  upstreamOid: string | null;
  published: boolean;
  expectedRewrittenCommitCount: number;
  alreadyUpToDate: boolean;
}

export type GitIntegrationPreview = GitMergePreview | GitCherryPickPreview | GitRebasePreview;

export type GitIntegrationPreviewRequest =
  | { kind: "merge"; repoPath: string; source: GitIntegrationRef }
  | { kind: "cherry-pick"; repoPath: string; commitOids: string[]; allowAlreadyContained?: boolean }
  | { kind: "rebase"; repoPath: string; newBase: GitIntegrationRef };

export interface GitIntegrationPreviewResult {
  outcome: "ready" | "blocked" | "failed";
  preview: GitIntegrationPreview | null;
  message: string;
}

export type GitIntegrationExecuteRequest =
  | { kind: "merge"; repoPath: string; source: GitIntegrationRef; mode: GitMergeMode; expectedSnapshotId: string }
  | { kind: "cherry-pick"; repoPath: string; commitOids: string[]; noCommit: boolean; allowAlreadyContained?: boolean; expectedSnapshotId: string }
  | { kind: "rebase"; repoPath: string; newBase: GitIntegrationRef; preserveMerges: boolean; expectedSnapshotId: string };

export interface GitIntegrationResult extends GitOperationResult {
  kind: GitIntegrationKind;
  outcome: "completed" | "no-op" | "staged" | "active" | "stale" | "failed";
  message: string;
  previousHeadOid: string | null;
  headOid: string | null;
  completedCommitOids: string[];
  stoppedCommitOid: string | null;
  operationState: GitRepositoryOperationState | null;
  forceWithLease: GitForceWithLeaseOffer | null;
}

export interface GitForceWithLeaseOffer {
  branchName: string;
  remoteName: string;
  remoteBranchName: string;
  expectedRemoteOid: string;
  expectedHeadOid: string;
}

export interface GitForceWithLeaseRequest extends GitForceWithLeaseOffer {
  repoPath: string;
}

export type GitResetMode = "soft" | "mixed" | "hard";

export interface GitResetCommitRequest {
  repoPath: string;
  hash: string;
  mode: GitResetMode;
}

export interface GitCreateTagRequest {
  repoPath: string;
  hash: string;
  tagName: string;
  message: string;
  lightweight: boolean;
  force: boolean;
  pushRemote: string | null;
}

export interface GitDeleteTagRequest {
  repoPath: string;
  tagName: string;
  pushRemote: string | null;
}

export interface GitCloneRequest {
  source: string;
  parentPath: string;
  directoryName: string;
  branchName?: string;
  depth?: number | null;
  recurseSubmodules?: boolean;
}

export interface GitSubmoduleRequest {
  repoPath: string;
  path?: string;
}

export interface GitRepositoryAccessCheckRequest {
  source: string;
}

export interface GitRepositoryAccessCheckResult {
  source: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  branches: string[];
  defaultBranch: string | null;
}

export interface GitBranchRequest {
  repoPath: string;
  branchName: string;
}

export interface GitUpstreamRequest {
  repoPath: string;
  branchName: string;
  upstream: string | null;
}

export interface GitPublishBranchRequest {
  repoPath: string;
  branchName: string;
  remoteName: string;
}

export type GitPullRecoveryPhase = "ready" | "rebase-conflicts";

export interface GitPullRecovery {
  branchName: string;
  upstreamName: string;
  oldUpstreamOid: string;
  newUpstreamOid: string;
  originalHeadOid: string;
  localCommitCount: number;
  hasWorkingChanges: boolean;
  canReapply: boolean;
  phase: GitPullRecoveryPhase;
}

export type GitPullRecoveryAction = "reapply" | "match" | "continue" | "abort";

export interface GitPullRecoveryRequest {
  repoPath: string;
  branchName: string;
  action: GitPullRecoveryAction;
}

export interface GitPullRecoveryResult extends GitOperationResult {
  outcome: "complete" | "conflicts" | "ready" | "failed";
  recovery: GitPullRecovery | null;
  recoveryRef: string | null;
}

export type GitRepositoryOperationKind = "merge" | "rebase" | "cherry-pick" | "revert";
export type GitRepositoryOperationPhase = "conflicts" | "empty-commit" | "ready-to-continue";
export type GitRepositoryOperationAction = "continue" | "skip" | "keep-empty" | "abort";

export interface GitRepositoryOperationActionAvailability {
  supported: boolean;
  enabled: boolean;
  disabledReason: string | null;
  requiresConfirmation: boolean;
}

export interface GitRepositoryOperationState {
  stateId: string;
  kind: GitRepositoryOperationKind;
  phase: GitRepositoryOperationPhase;
  backend: "merge" | "apply" | null;
  hasConflicts: boolean;
  conflictedPaths: string[];
  sequence: {
    current: number;
    total: number;
  } | null;
  originalBranch: string | null;
  currentBranch: string | null;
  actions: Record<GitRepositoryOperationAction, GitRepositoryOperationActionAvailability>;
  summary: string;
}

export interface GitRepositoryOperationActionRequest {
  repoPath: string;
  expectedKind: GitRepositoryOperationKind;
  expectedStateId: string;
  action: GitRepositoryOperationAction;
}

export interface GitRepositoryOperationActionResult extends GitOperationResult {
  outcome: "completed" | "active" | "stale" | "failed";
  state: GitRepositoryOperationState | null;
}

export interface GitConflictResolutionRequest extends RepositoryReadRequest {
  repoPath: string;
  path: string;
  expectedKind: GitRepositoryOperationKind;
  expectedStateId: string;
}

export interface GitConflictResolution {
  outcome: "ready" | "stale" | "unsupported" | "failed";
  path: string;
  state: GitRepositoryOperationState | null;
  baseText: string | null;
  currentText: string | null;
  incomingText: string | null;
  workingText: string | null;
  workingHash: string | null;
  message: string;
}

export interface GitConflictResolutionSaveRequest {
  repoPath: string;
  path: string;
  expectedKind: GitRepositoryOperationKind;
  expectedStateId: string;
  expectedWorkingHash: string;
  resolvedText: string;
}

export interface GitConflictResolutionSaveResult extends GitOperationResult {
  outcome: "staged" | "stale" | "failed";
  state: GitRepositoryOperationState | null;
}

export interface GitRemoteBranchCheckoutRequest extends GitBranchRequest {
  remoteBranch: string;
}

export interface GitHubPullRequestCheckoutRequest extends GitBranchRequest {
  pullRequestNumber: number;
  sourceBranch: string;
  sourceRepositoryFullName: string;
}

export interface GitRenameBranchRequest {
  repoPath: string;
  branchName: string;
  newBranchName: string;
}

export interface GitDeleteBranchRequest {
  repoPath: string;
  branchName: string;
  force: boolean;
}

export type GitWorktreeCreateDraft = {
  destinationPath: string;
} & (
  | {
      mode: "new-branch";
      branchName: string;
      startPoint: string;
      track: boolean;
    }
  | {
      mode: "existing-branch";
      branchName: string;
    }
);

export interface GitWorktreeRequest {
  repoPath: string;
  worktreePath: string;
}

export interface GitFileHistoryRequest extends RepositoryReadRequest {
  repoPath: string;
  startHash: string;
  path: string;
  limit?: number;
}

export interface GitFileBlameRequest extends RepositoryReadRequest {
  repoPath: string;
  hash: string;
  path: string;
}

export interface GitWorktreeRemoveRequest extends GitWorktreeRequest {
  force?: boolean;
}

export interface GitWorktreeRemovalCheck {
  repoPath: string;
  worktreePath: string;
  canRemove: boolean;
  canForceRemove: boolean;
  isClean: boolean;
  reason: string;
}

export interface GitAddRemoteRequest {
  repoPath: string;
  name: string;
  url: string;
}

export type GitHubCheckState = "success" | "failure" | "pending" | "neutral" | "unknown";

export interface GitHubPullRequestAssociation {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  url: string;
  baseRepositoryFullName: string;
  headRepositoryFullName: string | null;
  headBranch: string;
  headSha: string;
}

export interface GitHubCommitAssociation {
  commitSha: string;
  pullRequests: GitHubPullRequestAssociation[];
  checkState: GitHubCheckState;
}

export interface GitHubHistoryInsightsRequest extends GitHubRepositoryRequest {
  currentBranch: string | null;
  headSha: string | null;
  commitShas: string[];
}

export interface GitHubHistoryInsights {
  currentBranchPullRequests: GitHubPullRequestAssociation[];
  commits: GitHubCommitAssociation[];
  unavailableCommitShas: string[];
}

export type GitHubReferenceResolution = "exact" | "search" | "unsupported";
export type GitHubReferenceKind = "issue-or-pull-request" | "issue" | "pull-request";

export interface GitHubReference {
  kind: GitHubReferenceKind;
  owner: string | null;
  repository: string | null;
  number: number;
  displayText: string;
  targetUrl: string | null;
  resolution: GitHubReferenceResolution;
}

export interface GitRenameRemoteRequest {
  repoPath: string;
  currentName: string;
  newName: string;
}

export interface GitSetRemoteUrlRequest {
  repoPath: string;
  name: string;
  url: string;
}

export interface GitRemoveRemoteRequest {
  repoPath: string;
  name: string;
}

export type GitIdentityScope = "repository" | "global";

export interface GitIdentityValue {
  name: string;
  email: string;
}

export interface GitIdentitySettings extends GitIdentityValue {
  scope: GitIdentityScope;
  repositoryOverrideEnabled: boolean;
  repository: GitIdentityValue;
  global: GitIdentityValue;
}

export interface GitIdentitySaveRequest extends GitIdentityValue {
  repoPath: string;
  scope: GitIdentityScope;
  /** Set to false to remove a repository-local identity override. */
  enabled?: boolean;
}

export const AI_COMMIT_MESSAGE_PROVIDERS = [
  "openrouter",
  "openai",
  "codex-cli",
  "anthropic",
  "claude-code"
] as const;

export type AiCommitMessageProvider = (typeof AI_COMMIT_MESSAGE_PROVIDERS)[number];

export const AI_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra"
] as const;

export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number];

export type AiReasoningCapabilityStatus = "supported" | "unsupported" | "unknown";

export interface AiReasoningCapabilities {
  status: AiReasoningCapabilityStatus;
  supportedEfforts: AiReasoningEffort[];
}

export interface GetAiReasoningCapabilitiesRequest {
  provider: AiCommitMessageProvider;
  model: string;
}

export const AI_API_KEY_PROVIDERS = [
  "openrouter",
  "openai",
  "anthropic"
] as const;

export type AiApiKeyProvider = (typeof AI_API_KEY_PROVIDERS)[number];

export const AI_CLI_PROVIDERS = [
  "codex-cli",
  "claude-code"
] as const;

export type AiCliProvider = (typeof AI_CLI_PROVIDERS)[number];

export const SOURCE_CONTROL_WRITING_STYLE_MODES = [
  "repo_conventions",
  "conventional_commits",
  "custom"
] as const;

export type SourceControlWritingStyleMode = (typeof SOURCE_CONTROL_WRITING_STYLE_MODES)[number];

export interface SourceControlWritingStyle {
  mode: SourceControlWritingStyleMode;
  customInstructions: string;
}

export interface AiProviderSettings {
  model: string;
  /** Model used for commit plans; empty string falls back to `model`. */
  commitPlanModel?: string;
  /** Reasoning effort used for commit plans. */
  commitPlanReasoningEffort: AiReasoningEffort;
  /** Model used for PR descriptions; empty string falls back to `model`. */
  prDescriptionModel: string;
  reasoningEffort: AiReasoningEffort;
  /** Reasoning effort for PR descriptions. */
  prDescriptionReasoningEffort: AiReasoningEffort;
  hasApiKey: boolean;
}

export interface AiCliProviderStatus {
  detected: boolean;
  authenticated: boolean;
  message: string;
}

export interface AiSettings {
  selectedProvider: AiCommitMessageProvider;
  providers: Record<AiCommitMessageProvider, AiProviderSettings>;
  cliStatus: Record<AiCliProvider, AiCliProviderStatus>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
  sourceControlWritingStyle: SourceControlWritingStyle;
}

export interface AiSettingsSaveRequest {
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  commitPlanModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  apiKeys?: Partial<Record<AiApiKeyProvider, string>>;
  clearApiKeys?: Partial<Record<AiApiKeyProvider, boolean>>;
  commitMessagePrompt: string;
  prDescriptionPrompt?: string;
  sourceControlWritingStyle?: SourceControlWritingStyle;
}

export interface RepositoryAiSettings {
  repoPath: string;
  /** True when `.githead/ai-settings.json` overrides the global AI settings. */
  enabled: boolean;
  settings: AiSettings;
}

export interface RepositoryAiSettingsRequest {
  repoPath: string;
}

export interface RepositoryAiSettingsSaveRequest extends RepositoryAiSettingsRequest {
  enabled: boolean;
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  commitPlanModels?: Partial<Record<AiCommitMessageProvider, string>>;
  commitPlanReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  commitMessagePrompt: string;
  prDescriptionPrompt: string;
  sourceControlWritingStyle?: SourceControlWritingStyle;
}

export interface RepositorySyncSettings {
  repoPath: string;
  /** True when this repository overrides the global auto-fetch interval. */
  enabled: boolean;
  autoFetchIntervalMinutes: number;
}

export interface RepositorySyncSettingsRequest {
  repoPath: string;
}

export interface RepositorySyncSettingsSaveRequest extends RepositorySyncSettingsRequest {
  enabled: boolean;
  autoFetchIntervalMinutes: number;
}

export const APP_COLOR_THEMES = [
  "githead",
  "tidepool",
  "ember",
  "orchid",
  "evergreen",
  "rosewood",
  "glacier",
  "sunbeam",
  "graphite",
  "copper",
  "sakura",
  "midnight"
] as const;

export type AppColorTheme = (typeof APP_COLOR_THEMES)[number];

export const APP_APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppAppearanceMode = (typeof APP_APPEARANCE_MODES)[number];
export const APP_UI_FONTS = ["system", "inter", "ibm-plex-sans", "roboto"] as const;
export type AppUiFont = (typeof APP_UI_FONTS)[number];
export const APP_CODE_FONTS = ["system-mono", "jetbrains-mono", "fira-code", "source-code-pro", "ibm-plex-mono"] as const;
export type AppCodeFont = (typeof APP_CODE_FONTS)[number];
export const STATUS_FILE_VIEW_MODES = ["list", "tree"] as const;
export type StatusFileViewMode = (typeof STATUS_FILE_VIEW_MODES)[number];

export const TAG_PUSH_BEHAVIORS = ["all", "follow", "none"] as const;
export type TagPushBehavior = (typeof TAG_PUSH_BEHAVIORS)[number];
export const DEFAULT_TAG_PUSH_BEHAVIOR: TagPushBehavior = "all";
export const DEFAULT_ALLOW_CHERRY_PICKING_CONTAINED_COMMITS = false;
export const DEFAULT_REQUIRE_UP_TO_DATE_UPSTREAM_BEFORE_COMMIT = false;

export interface GitBehaviorSettings {
  tagPushBehavior: TagPushBehavior;
  allowCherryPickingContainedCommits?: boolean;
  requireUpToDateUpstreamBeforeCommit?: boolean;
}

export const APP_ZOOM_FACTORS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export function isAppZoomFactor(value: unknown): value is number {
  return typeof value === "number" && APP_ZOOM_FACTORS.some((factor) => factor === value);
}

export interface AppSettings {
  autoFetchIntervalMinutes: number;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  uiFont: AppUiFont;
  codeFont: AppCodeFont;
  zoomFactor: number;
  statusFileViewMode: StatusFileViewMode;
  wrapDiffLines: boolean;
  gitBehaviors: GitBehaviorSettings;
}

export interface AppSettingsSaveRequest {
  autoFetchIntervalMinutes: number;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  uiFont?: AppUiFont;
  codeFont?: AppCodeFont;
  zoomFactor: number;
  statusFileViewMode?: StatusFileViewMode;
  wrapDiffLines?: boolean;
  gitBehaviors?: GitBehaviorSettings;
}

export interface GenerateCommitMessageRequest {
  repoPath: string;
  additionalContext?: string;
  stashSelection?: GitStashSelection;
}

export interface CommitPlanGroup {
  id: string;
  message: string;
  rationale: string;
  paths: string[];
}

export interface CommitPlan {
  groups: CommitPlanGroup[];
  unassignedPaths: string[];
}

export interface GenerateCommitPlanRequest {
  repoPath: string;
  paths: string[];
}

export interface GenerateCommitPlanResult {
  repoPath: string;
  exitCode: number;
  plan: CommitPlan | null;
  stderr: string;
  retriedAfterLength?: boolean;
}

export interface GeneratePrDescriptionRequest {
  repoPath: string;
  /** Remote-qualified base ref, e.g. "origin/main". */
  baseRef: string;
  /** Local head branch name. */
  headRef: string;
  title?: string;
}

export interface GeneratePrTitleRequest {
  repoPath: string;
  /** Remote-qualified base ref, e.g. "origin/main". */
  baseRef: string;
  /** Local head branch name. */
  headRef: string;
}

export interface ExternalUrlRequest {
  url: string;
}

export interface GitFileDiffRequest extends RepositoryReadRequest {
  repoPath: string;
  path: string;
  side: GitDiffSide;
}

export type GitFilePreviewSource =
  | { kind: "working" }
  | { kind: "staged" }
  | { kind: "commit"; hash: string };

export interface GitFilePreviewRequest extends RepositoryReadRequest {
  repoPath: string;
  path: string;
  source: GitFilePreviewSource;
}

export interface GitFilePreview {
  path: string;
  text: string;
}

export interface GitFileChangesRequest {
  repoPath: string;
  paths: string[];
  side: GitDiffSide;
}

export interface GitHunkRequest {
  repoPath: string;
  path: string;
  side: GitDiffSide;
  patch: string;
}

interface GitFileDiffBase {
  path: string;
  side: GitDiffSide;
}

export interface GitImageVersion {
  mimeType: string;
  data: Uint8Array;
  byteLength: number;
}

export type GitImageSide =
  | { status: "available"; version: GitImageVersion }
  | { status: "absent" }
  | { status: "lfs-missing"; byteLength: number; fetchable: boolean };

export type GitLfsImageFetchRequest =
  | { context: "status"; repoPath: string; path: string; side: GitDiffSide }
  | { context: "commit"; repoPath: string; hash: string; path: string; originalPath?: string };

export type GitFileDiff = GitFileDiffBase & (
  | {
    kind: "text";
    text: string;
    truncated?: boolean;
    before?: never;
    after?: never;
  }
  | {
    kind: "image";
    text: "";
    before: GitImageSide;
    after: GitImageSide;
    truncated?: never;
  }
  | {
    kind: "binary" | "empty" | "error";
    text: string;
    truncated?: never;
    before?: never;
    after?: never;
  }
);

export type GitWorktreeCreateRequest = GitWorktreeCreateDraft & { repoPath: string };

export interface GitOperationResult {
  repoPath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorKind?: "missing-author-identity" | "branch-name-conflict";
}

export interface GitRunResult {
  runId: string;
  action: string;
  repoPath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  endedAt: string;
  pullRecovery?: GitPullRecovery;
  push?: GitPushResultDetails;
}

export type GitTagPushOutcome =
  | "not-requested"
  | "not-started"
  | "included-with-branch"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed-out";

export interface GitPushResultDetails {
  branchSucceeded: boolean;
  partialSuccess: boolean;
  remoteName: string | null;
  tagPushBehavior: TagPushBehavior;
  tagOutcome: GitTagPushOutcome;
}

export interface GitOutputEvent {
  runId: string;
  action: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
  timestamp: string;
}

export type RepoChangedReason = "filesystem" | "filesystem-metadata" | "filesystem-unknown" | "watcher-error";

export interface RepoChangedEvent {
  repoPath: string;
  changedAt: string;
  reason: RepoChangedReason;
}

export type AppUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type AppUpdateErrorContext = "check" | "download" | "install" | null;

export interface AppUpdateReleaseNotes {
  version: string;
  url: string | null;
  title: string | null;
  body: string | null;
  loading: boolean;
  error: string | null;
}

export interface AppUpdateState {
  enabled: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  releaseNotes: AppUpdateReleaseNotes | null;
  errorContext: AppUpdateErrorContext;
  canRetry: boolean;
}

export interface AppUpdateCheckResult {
  checked: boolean;
  state: AppUpdateState;
}

export interface AppUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: AppUpdateState;
}

export interface AppWindowState {
  isMaximized: boolean;
}

export const PERFORMANCE_COMMAND_KINDS = [
  "git",
  "lore",
  "github",
  "ai",
  "configured-action",
  "system",
  "other"
] as const;

export const PERFORMANCE_COMMAND_OUTCOMES = [
  "success",
  "failure",
  "cancelled",
  "timed-out",
  "truncated",
  "rejected"
] as const;

export const PERFORMANCE_REFRESH_KINDS = [
  "status",
  "metadata",
  "snapshot",
  "references",
  "github",
  "other"
] as const;

export type PerformanceCommandKind = (typeof PERFORMANCE_COMMAND_KINDS)[number];
export type PerformanceCommandOutcome = (typeof PERFORMANCE_COMMAND_OUTCOMES)[number];
export type PerformanceRefreshKind = (typeof PERFORMANCE_REFRESH_KINDS)[number];

export type PerformanceProcessKind = "browser" | "renderer" | "gpu" | "utility" | "other";

export interface PerformanceCommandSample {
  type: "command";
  sequence: number;
  recordedAtMs: number;
  commandKind: PerformanceCommandKind;
  durationMs: number;
  outcome: PerformanceCommandOutcome;
  outputBytes: number;
  queueDepth: number;
}

export interface PerformanceQueueSample {
  type: "queue";
  sequence: number;
  recordedAtMs: number;
  queueDepth: number;
}

export interface PerformanceRefreshSample {
  type: "refresh";
  sequence: number;
  recordedAtMs: number;
  refreshKind: PerformanceRefreshKind;
  refreshRequestCount: number;
  refreshCoalescedCount: number;
  queueDepth: number;
}

export interface PerformanceRefreshRecord {
  refreshKind: PerformanceRefreshKind;
  requestCount: number;
  coalescedCount: number;
  queueDepth: number;
}

export type PerformanceDiagnosticSample =
  | PerformanceCommandSample
  | PerformanceQueueSample
  | PerformanceRefreshSample;

export interface PerformanceProcessMetric {
  processKind: PerformanceProcessKind;
  percentCpuUsage: number;
  idleWakeupsPerSecond: number;
  workingSetKilobytes: number;
  peakWorkingSetKilobytes: number;
  privateKilobytes: number;
}

export interface PerformanceDiagnosticsSnapshot {
  samples: PerformanceDiagnosticSample[];
  processMetrics: PerformanceProcessMetric[];
  processMetricsStatus: "available" | "unavailable";
  processMetricLimit: number;
  droppedProcessMetricCount: number;
  retainedSampleLimit: number;
  droppedSampleCount: number;
}

export interface GitheadApi {
  chooseRepo(defaultPath?: string): Promise<string | null>;
  chooseCloneParent(defaultPath?: string): Promise<string | null>;
  chooseWorktreeParent(defaultPath?: string): Promise<string | null>;
  getRepoSummary(repoPath: string, requestId?: string): Promise<RepoSummary>;
  getRepoIdentity(request: RepoSectionRequest): Promise<RepoIdentitySection>;
  getRepoStatus(request: RepoSectionRequest): Promise<RepoStatusSection>;
  getRepoMetadata(request: RepoSectionRequest): Promise<RepoMetadataSection>;
  getRepositoryOperationState(repoPath: string): Promise<GitRepositoryOperationState | null>;
  resolveRepositoryOperation(request: CoordinatedRequest<GitRepositoryOperationActionRequest>): Promise<GitRepositoryOperationActionResult>;
  getConflictResolution(request: GitConflictResolutionRequest): Promise<GitConflictResolution>;
  saveConflictResolution(request: CoordinatedRequest<GitConflictResolutionSaveRequest>): Promise<GitConflictResolutionSaveResult>;
  cancelRepositoryRead(request: CancelRepositoryReadRequest): Promise<void>;
  getGitOperationStates(request: GetGitOperationStatesRequest): Promise<GitOperationStateResult[]>;
  cancelGitOperation(request: CancelGitOperationRequest): Promise<CancelGitOperationResult>;
  watchRepoChanges(repoPath: string): Promise<void>;
  unwatchRepoChanges(repoPath?: string): Promise<void>;
  getRepoRecents(): Promise<RepositoryRecent[]>;
  getRepoSyncStatuses(repoPaths: string[]): Promise<RepoSyncStatus[]>;
  addRepoRecent(request: RepositoryRecentSelectionRequest): Promise<RepositoryRecent[]>;
  removeRepoRecent(repoPath: string): Promise<RepositoryRecent[]>;
  reorderRepoRecents(repoPaths: string[]): Promise<RepositoryRecent[]>;
  getRepositoryGroups(request: RepositoryGroupsRequest): Promise<RepositoryGroup[]>;
  getRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  addRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  addSafeDirectory(request: CoordinatedRequest<GitSafeDirectoryRequest>): Promise<GitOperationResult>;
  getGitHubWorkflowRuns(request: GitHubWorkflowRunsRequest): Promise<GitHubOperationResult<GitHubPage<GitHubWorkflowRun>>>;
  getGitHubViewer(request: GitHubRepositoryRequest): Promise<GitHubOperationResult<GitHubViewer>>;
  getGitHubOpenCounts(request: GitHubRepositoryRequest): Promise<GitHubOperationResult<GitHubOpenCounts>>;
  getGitHubIssues(request: GitHubIssuesRequest): Promise<GitHubOperationResult<GitHubPage<GitHubIssue>>>;
  getGitHubPullRequests(request: GitHubPullRequestsRequest): Promise<GitHubOperationResult<GitHubPage<GitHubPullRequest>>>;
  getGitHubPullRequestDetail(request: GitHubPullRequestDetailRequest): Promise<GitHubOperationResult<GitHubPullRequestDetail>>;
  getGitHubIssueDetail(request: GitHubIssueDetailRequest): Promise<GitHubOperationResult<GitHubIssueDetail>>;
  approveGitHubPullRequest(request: CoordinatedRequest<GitHubPullRequestReviewRequest>): Promise<GitHubOperationResult<GitHubMutationResult>>;
  commentOnGitHubItem(request: CoordinatedRequest<GitHubItemCommentRequest>): Promise<GitHubOperationResult<GitHubMutationResult>>;
  mergeGitHubPullRequest(request: CoordinatedRequest<GitHubPullRequestMergeRequest>): Promise<GitHubOperationResult<GitHubMutationResult>>;
  getGitHubHistoryInsights(request: GitHubHistoryInsightsRequest): Promise<GitHubOperationResult<GitHubHistoryInsights>>;
  createGitHubPullRequest(request: CoordinatedRequest<CreatePullRequestRequest>): Promise<GitHubOperationResult<CreatePullRequestResult>>;
  cancelGitHubRequest(request: CancelGitHubRequest): Promise<void>;
  getGitHubConnection(request: GitHubConnectionRequest): Promise<GitHubConnectionStatus>;
  beginGitHubDeviceFlow(): Promise<GitHubDeviceFlow>;
  pollGitHubDeviceFlow(flow: GitHubDeviceFlow): Promise<GitHubDeviceFlowPollResult>;
  disconnectGitHub(): Promise<GitHubConnectionStatus>;
  getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]>;
  getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails>;
  getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff>;
  getFileHistory(request: GitFileHistoryRequest): Promise<GitFileHistoryResult>;
  getFileBlame(request: GitFileBlameRequest): Promise<GitFileBlameResult>;
  getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff>;
  getStashes(request: GitStashListRequest): Promise<GitStashEntry[]>;
  getStashDetails(request: GitStashDetailsRequest): Promise<GitStashDetails>;
  getStashFileDiff(request: GitStashFileDiffRequest): Promise<GitFileDiff>;
  getFilePreview(request: GitFilePreviewRequest): Promise<GitFilePreview>;
  fetchLfsImageVersions(request: CoordinatedRequest<GitLfsImageFetchRequest>): Promise<GitOperationResult>;
  resetFilesToCommit(request: CoordinatedRequest<GitCommitFileResetRequest>): Promise<GitOperationResult>;
  openCommitFileVersion(request: CoordinatedRequest<GitCommitFileVersionRequest>): Promise<GitOperationResult>;
  stageFiles(request: CoordinatedRequest<GitPathRequest>): Promise<GitOperationResult>;
  unstageFiles(request: CoordinatedRequest<GitPathRequest>): Promise<GitOperationResult>;
  stageHunk(request: CoordinatedRequest<GitHunkRequest>): Promise<GitOperationResult>;
  unstageHunk(request: CoordinatedRequest<GitHunkRequest>): Promise<GitOperationResult>;
  commitChanges(request: CoordinatedRequest<GitCommitRequest>): Promise<GitOperationResult>;
  commitWithRemoteCheck(request: CoordinatedRequest<GitCommitRequest>): Promise<GitCommitWithRemoteCheckResult>;
  commitAndPush(request: CoordinatedRequest<GitCommitRequest>): Promise<GitCommitAndPushResult>;
  undoCommitAndKeepStaged(request: CoordinatedRequest<GitUndoCommitRequest>): Promise<GitOperationResult>;
  getAmendPreview(request: GitAmendPreviewRequest): Promise<GitAmendPreviewResult>;
  amendLastCommit(request: CoordinatedRequest<GitAmendExecuteRequest>): Promise<GitAmendResult>;
  restoreAmendRecovery(request: CoordinatedRequest<GitAmendRestoreRequest>): Promise<GitAmendRestoreResult>;
  quickCommitFiles(request: CoordinatedRequest<GitQuickCommitRequest>): Promise<GitOperationResult>;
  createStash(request: CoordinatedRequest<GitStashCreateRequest>): Promise<GitOperationResult>;
  applyStash(request: CoordinatedRequest<GitStashRefRequest>): Promise<GitOperationResult>;
  popStash(request: CoordinatedRequest<GitStashRefRequest>): Promise<GitOperationResult>;
  dropStash(request: CoordinatedRequest<GitStashRefRequest>): Promise<GitOperationResult>;
  createBranchFromStash(request: CoordinatedRequest<GitStashBranchRequest>): Promise<GitOperationResult>;
  copyCommitShaToClipboard(request: GitCommitHashRequest): Promise<GitOperationResult>;
  resetBranchToCommit(request: CoordinatedRequest<GitResetCommitRequest>): Promise<GitOperationResult>;
  revertCommit(request: CoordinatedRequest<GitCommitHashRequest>): Promise<GitOperationResult>;
  getIntegrationPreview(request: GitIntegrationPreviewRequest): Promise<GitIntegrationPreviewResult>;
  runIntegration(request: CoordinatedRequest<GitIntegrationExecuteRequest>): Promise<GitIntegrationResult>;
  pushWithForceLease(request: CoordinatedRequest<GitForceWithLeaseRequest>): Promise<GitOperationResult>;
  createTag(request: CoordinatedRequest<GitCreateTagRequest>): Promise<GitOperationResult>;
  deleteTag(request: CoordinatedRequest<GitDeleteTagRequest>): Promise<GitOperationResult>;
  switchBranch(request: CoordinatedRequest<GitBranchRequest>): Promise<GitOperationResult>;
  checkoutRemoteBranch(request: CoordinatedRequest<GitRemoteBranchCheckoutRequest>): Promise<GitOperationResult>;
  checkoutGitHubPullRequest(request: CoordinatedRequest<GitHubPullRequestCheckoutRequest>): Promise<GitOperationResult>;
  createBranch(request: CoordinatedRequest<GitBranchRequest>): Promise<GitOperationResult>;
  renameBranch(request: CoordinatedRequest<GitRenameBranchRequest>): Promise<GitOperationResult>;
  deleteBranch(request: CoordinatedRequest<GitDeleteBranchRequest>): Promise<GitOperationResult>;
  createWorktree(request: CoordinatedRequest<GitWorktreeCreateRequest>): Promise<GitOperationResult>;
  checkWorktreeRemoval(request: GitWorktreeRequest): Promise<GitWorktreeRemovalCheck>;
  removeWorktree(request: CoordinatedRequest<GitWorktreeRemoveRequest>): Promise<GitOperationResult>;
  setBranchUpstream(request: CoordinatedRequest<GitUpstreamRequest>): Promise<GitOperationResult>;
  publishBranch(request: CoordinatedRequest<GitPublishBranchRequest>): Promise<GitRunResult>;
  getPullRecovery(repoPath: string): Promise<GitPullRecovery | null>;
  resolvePullRecovery(request: CoordinatedRequest<GitPullRecoveryRequest>): Promise<GitPullRecoveryResult>;
  getRemoteConfigs(repoPath: string): Promise<GitRemoteConfig[]>;
  addRemote(request: CoordinatedRequest<GitAddRemoteRequest>): Promise<GitOperationResult>;
  renameRemote(request: CoordinatedRequest<GitRenameRemoteRequest>): Promise<GitOperationResult>;
  setRemoteUrl(request: CoordinatedRequest<GitSetRemoteUrlRequest>): Promise<GitOperationResult>;
  removeRemote(request: CoordinatedRequest<GitRemoveRemoteRequest>): Promise<GitOperationResult>;
  getGitIdentity(repoPath: string): Promise<GitIdentitySettings>;
  saveGitIdentity(request: CoordinatedRequest<GitIdentitySaveRequest>): Promise<GitIdentitySettings>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(request: AiSettingsSaveRequest): Promise<AiSettings>;
  getRepositoryAiSettings(request: RepositoryAiSettingsRequest): Promise<RepositoryAiSettings>;
  saveRepositoryAiSettings(request: RepositoryAiSettingsSaveRequest): Promise<RepositoryAiSettings>;
  getRepositorySyncSettings(request: RepositorySyncSettingsRequest): Promise<RepositorySyncSettings>;
  saveRepositorySyncSettings(request: RepositorySyncSettingsSaveRequest): Promise<RepositorySyncSettings>;
  getAiReasoningCapabilities(request: GetAiReasoningCapabilitiesRequest): Promise<AiReasoningCapabilities>;
  getAppSettings(): Promise<AppSettings>;
  saveAppSettings(request: AppSettingsSaveRequest): Promise<AppSettings>;
  setWindowZoomFactor(zoomFactor: number): Promise<void>;
  generateCommitMessage(request: CoordinatedRequest<GenerateCommitMessageRequest>): Promise<GitOperationResult>;
  generateCommitPlan(request: CoordinatedRequest<GenerateCommitPlanRequest>): Promise<GenerateCommitPlanResult>;
  generatePrTitle(request: CoordinatedRequest<GeneratePrTitleRequest>): Promise<GitOperationResult>;
  generatePrDescription(request: CoordinatedRequest<GeneratePrDescriptionRequest>): Promise<GitOperationResult>;
  openExternalUrl(request: ExternalUrlRequest): Promise<void>;
  openFile(request: FileSystemPathRequest): Promise<GitOperationResult>;
  showInExplorer(request: FileSystemPathRequest): Promise<GitOperationResult>;
  showRepositoryInExplorer(repoPath: string): Promise<GitOperationResult>;
  copyPathToClipboard(request: FileSystemPathRequest): Promise<GitOperationResult>;
  copyTextToClipboard(request: ClipboardTextRequest): Promise<GitOperationResult>;
  deleteFile(request: CoordinatedRequest<FileSystemPathRequest>): Promise<GitOperationResult>;
  deleteFiles(request: CoordinatedRequest<FileSystemPathListRequest>): Promise<GitOperationResult>;
  revertFileChanges(request: CoordinatedRequest<GitFileChangesRequest>): Promise<GitOperationResult>;
  addPathToIgnore(request: CoordinatedRequest<GitIgnorePathRequest>): Promise<GitOperationResult>;
  cloneRepository(request: CoordinatedRequest<GitCloneRequest>): Promise<GitOperationResult>;
  updateSubmodules(request: CoordinatedRequest<GitSubmoduleRequest>): Promise<GitOperationResult>;
  syncSubmodules(request: CoordinatedRequest<GitSubmoduleRequest>): Promise<GitOperationResult>;
  checkRepositoryAccess(request: CoordinatedRequest<GitRepositoryAccessCheckRequest>): Promise<GitRepositoryAccessCheckResult>;
  runGitAction(request: CoordinatedRequest<GitRunRequest>): Promise<GitRunResult>;
  runConfiguredAction(request: CoordinatedRequest<GitConfiguredActionRunRequest>): Promise<GitRunResult>;
  saveConfiguredActions(request: CoordinatedRequest<GitConfiguredActionSaveRequest>): Promise<GitOperationResult>;
  getUpdateState(): Promise<AppUpdateState>;
  checkForUpdates(): Promise<AppUpdateCheckResult>;
  downloadUpdate(): Promise<AppUpdateActionResult>;
  installUpdate(): Promise<AppUpdateActionResult>;
  minimizeWindow(): Promise<AppWindowState>;
  toggleMaximizeWindow(): Promise<AppWindowState>;
  closeWindow(): Promise<void>;
  getWindowState(): Promise<AppWindowState>;
  startPerformanceDiagnostics(): Promise<PerformanceDiagnosticsSnapshot>;
  getPerformanceDiagnosticsSnapshot(): Promise<PerformanceDiagnosticsSnapshot>;
  stopPerformanceDiagnostics(): Promise<void>;
  recordPerformanceRefresh(record: PerformanceRefreshRecord): void;
  onGitOutput(callback: (event: GitOutputEvent) => void): () => void;
  onRepoChanged(callback: (event: RepoChangedEvent) => void): () => void;
  onUpdateState(callback: (state: AppUpdateState) => void): () => void;
  onWindowState(callback: (state: AppWindowState) => void): () => void;
}

export function isGitAction(value: unknown): value is GitAction {
  return typeof value === "string" && GIT_ACTIONS.includes(value as GitAction);
}
