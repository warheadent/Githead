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

export interface GitHubOpenCounts {
  issues: number;
  pullRequests: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
}

export type GitDiffSide = "staged" | "unstaged";

export type GitDiffKind = "text" | "image" | "binary" | "empty" | "error";

export type CommitRefKind = "head" | "branch" | "remote" | "tag" | "other";

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
  fetch: boolean;
  sync: boolean;
  resetModes: boolean;
  safeDirectory: boolean;
  github: boolean;
  ignoreFile: boolean;
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
    fetch: true,
    sync: false,
    resetModes: true,
    safeDirectory: true,
    github: true,
    ignoreFile: true
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
    fetch: false,
    sync: true,
    resetModes: false,
    safeDirectory: false,
    github: false,
    ignoreFile: false
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
  statusLines: string[];
  files: GitStatusFile[];
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

export interface GitRunRequest {
  repoPath: string;
  action: GitAction;
}

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

export interface GitHubPageRequest extends GitHubRepositoryRequest {
  page?: number;
}

export interface GitHubWorkflowRunsRequest extends GitHubPageRequest { query?: GitHubWorkflowRunQuery | undefined }
export interface GitHubPullRequestsRequest extends GitHubPageRequest { query?: GitHubPullRequestQuery | undefined }
export interface GitHubIssuesRequest extends GitHubPageRequest { query?: GitHubIssueQuery | undefined }

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
  statusLines: string[];
  files: GitStatusFile[];
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

export interface GitCommitHashRequest {
  repoPath: string;
  hash: string;
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
  repository: GitIdentityValue;
  global: GitIdentityValue;
}

export interface GitIdentitySaveRequest extends GitIdentityValue {
  repoPath: string;
  scope: GitIdentityScope;
}

export const AI_COMMIT_MESSAGE_PROVIDERS = [
  "openrouter",
  "openai",
  "codex-cli",
  "anthropic",
  "claude-code"
] as const;

export type AiCommitMessageProvider = (typeof AI_COMMIT_MESSAGE_PROVIDERS)[number];

export const AI_REASONING_EFFORTS = ["low", "medium", "high"] as const;

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

export interface AiProviderSettings {
  model: string;
  /** Model used for PR descriptions; empty string falls back to `model`. */
  prDescriptionModel: string;
  reasoningEffort: AiReasoningEffort;
  /** Reasoning effort for PR descriptions; used only with `prDescriptionModel`. */
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
}

export interface AiSettingsSaveRequest {
  selectedProvider: AiCommitMessageProvider;
  providerModels: Record<AiCommitMessageProvider, string>;
  prDescriptionModels?: Partial<Record<AiCommitMessageProvider, string>>;
  reasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  prDescriptionReasoningEfforts?: Partial<Record<AiCommitMessageProvider, AiReasoningEffort>>;
  apiKeys?: Partial<Record<AiApiKeyProvider, string>>;
  clearApiKeys?: Partial<Record<AiApiKeyProvider, boolean>>;
  commitMessagePrompt: string;
  prDescriptionPrompt?: string;
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
export const STATUS_FILE_VIEW_MODES = ["list", "tree"] as const;
export type StatusFileViewMode = (typeof STATUS_FILE_VIEW_MODES)[number];

export const APP_ZOOM_FACTORS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export function isAppZoomFactor(value: unknown): value is number {
  return typeof value === "number" && APP_ZOOM_FACTORS.some((factor) => factor === value);
}

export interface AppSettings {
  autoFetchIntervalMinutes: number;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  zoomFactor: number;
  statusFileViewMode: StatusFileViewMode;
}

export interface AppSettingsSaveRequest {
  autoFetchIntervalMinutes: number;
  colorTheme: AppColorTheme;
  appearanceMode: AppAppearanceMode;
  zoomFactor: number;
  statusFileViewMode?: StatusFileViewMode;
}

export interface GenerateCommitMessageRequest {
  repoPath: string;
  additionalContext?: string;
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

export interface GitheadApi {
  chooseRepo(defaultPath?: string): Promise<string | null>;
  chooseCloneParent(defaultPath?: string): Promise<string | null>;
  getRepoSummary(repoPath: string, requestId?: string): Promise<RepoSummary>;
  getRepoIdentity(request: RepoSectionRequest): Promise<RepoIdentitySection>;
  getRepoStatus(request: RepoSectionRequest): Promise<RepoStatusSection>;
  getRepoMetadata(request: RepoSectionRequest): Promise<RepoMetadataSection>;
  cancelRepositoryRead(request: CancelRepositoryReadRequest): Promise<void>;
  watchRepoChanges(repoPath: string): Promise<void>;
  unwatchRepoChanges(repoPath?: string): Promise<void>;
  getRepoRecents(): Promise<string[]>;
  getRepoSyncStatuses(repoPaths: string[]): Promise<RepoSyncStatus[]>;
  addRepoRecent(repoPath: string): Promise<string[]>;
  removeRepoRecent(repoPath: string): Promise<string[]>;
  reorderRepoRecents(repoPaths: string[]): Promise<string[]>;
  getRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  addRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  addSafeDirectory(request: GitSafeDirectoryRequest): Promise<GitOperationResult>;
  getGitHubWorkflowRuns(request: GitHubWorkflowRunsRequest): Promise<GitHubOperationResult<GitHubPage<GitHubWorkflowRun>>>;
  getGitHubViewer(request: GitHubRepositoryRequest): Promise<GitHubOperationResult<GitHubViewer>>;
  getGitHubOpenCounts(request: GitHubRepositoryRequest): Promise<GitHubOperationResult<GitHubOpenCounts>>;
  getGitHubIssues(request: GitHubIssuesRequest): Promise<GitHubOperationResult<GitHubPage<GitHubIssue>>>;
  getGitHubPullRequests(request: GitHubPullRequestsRequest): Promise<GitHubOperationResult<GitHubPage<GitHubPullRequest>>>;
  getGitHubHistoryInsights(request: GitHubHistoryInsightsRequest): Promise<GitHubOperationResult<GitHubHistoryInsights>>;
  createGitHubPullRequest(request: CreatePullRequestRequest): Promise<GitHubOperationResult<CreatePullRequestResult>>;
  cancelGitHubRequest(request: CancelGitHubRequest): Promise<void>;
  getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]>;
  getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails>;
  getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff>;
  getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff>;
  fetchLfsImageVersions(request: GitLfsImageFetchRequest): Promise<GitOperationResult>;
  resetFilesToCommit(request: GitCommitFileResetRequest): Promise<GitOperationResult>;
  openCommitFileVersion(request: GitCommitFileVersionRequest): Promise<GitOperationResult>;
  stageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  unstageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  stageHunk(request: GitHunkRequest): Promise<GitOperationResult>;
  unstageHunk(request: GitHunkRequest): Promise<GitOperationResult>;
  commitChanges(request: GitCommitRequest): Promise<GitOperationResult>;
  copyCommitShaToClipboard(request: GitCommitHashRequest): Promise<GitOperationResult>;
  resetBranchToCommit(request: GitResetCommitRequest): Promise<GitOperationResult>;
  revertCommit(request: GitCommitHashRequest): Promise<GitOperationResult>;
  createTag(request: GitCreateTagRequest): Promise<GitOperationResult>;
  deleteTag(request: GitDeleteTagRequest): Promise<GitOperationResult>;
  switchBranch(request: GitBranchRequest): Promise<GitOperationResult>;
  checkoutRemoteBranch(request: GitRemoteBranchCheckoutRequest): Promise<GitOperationResult>;
  checkoutGitHubPullRequest(request: GitHubPullRequestCheckoutRequest): Promise<GitOperationResult>;
  createBranch(request: GitBranchRequest): Promise<GitOperationResult>;
  renameBranch(request: GitRenameBranchRequest): Promise<GitOperationResult>;
  deleteBranch(request: GitDeleteBranchRequest): Promise<GitOperationResult>;
  setBranchUpstream(request: GitUpstreamRequest): Promise<GitOperationResult>;
  publishBranch(request: GitPublishBranchRequest): Promise<GitRunResult>;
  getRemoteConfigs(repoPath: string): Promise<GitRemoteConfig[]>;
  addRemote(request: GitAddRemoteRequest): Promise<GitOperationResult>;
  renameRemote(request: GitRenameRemoteRequest): Promise<GitOperationResult>;
  setRemoteUrl(request: GitSetRemoteUrlRequest): Promise<GitOperationResult>;
  removeRemote(request: GitRemoveRemoteRequest): Promise<GitOperationResult>;
  getGitIdentity(repoPath: string): Promise<GitIdentitySettings>;
  saveGitIdentity(request: GitIdentitySaveRequest): Promise<GitIdentitySettings>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(request: AiSettingsSaveRequest): Promise<AiSettings>;
  getAiReasoningCapabilities(request: GetAiReasoningCapabilitiesRequest): Promise<AiReasoningCapabilities>;
  getAppSettings(): Promise<AppSettings>;
  saveAppSettings(request: AppSettingsSaveRequest): Promise<AppSettings>;
  setWindowZoomFactor(zoomFactor: number): Promise<void>;
  generateCommitMessage(request: GenerateCommitMessageRequest): Promise<GitOperationResult>;
  generatePrTitle(request: GeneratePrTitleRequest): Promise<GitOperationResult>;
  generatePrDescription(request: GeneratePrDescriptionRequest): Promise<GitOperationResult>;
  openExternalUrl(request: ExternalUrlRequest): Promise<void>;
  openFile(request: FileSystemPathRequest): Promise<GitOperationResult>;
  showInExplorer(request: FileSystemPathRequest): Promise<GitOperationResult>;
  showRepositoryInExplorer(repoPath: string): Promise<GitOperationResult>;
  copyPathToClipboard(request: FileSystemPathRequest): Promise<GitOperationResult>;
  copyTextToClipboard(request: ClipboardTextRequest): Promise<GitOperationResult>;
  deleteFile(request: FileSystemPathRequest): Promise<GitOperationResult>;
  deleteFiles(request: FileSystemPathListRequest): Promise<GitOperationResult>;
  revertFileChanges(request: GitFileChangesRequest): Promise<GitOperationResult>;
  addPathToIgnore(request: GitIgnorePathRequest): Promise<GitOperationResult>;
  cloneRepository(request: GitCloneRequest): Promise<GitOperationResult>;
  updateSubmodules(request: GitSubmoduleRequest): Promise<GitOperationResult>;
  syncSubmodules(request: GitSubmoduleRequest): Promise<GitOperationResult>;
  checkRepositoryAccess(request: GitRepositoryAccessCheckRequest): Promise<GitRepositoryAccessCheckResult>;
  runGitAction(request: GitRunRequest): Promise<GitRunResult>;
  runConfiguredAction(request: GitConfiguredActionRunRequest): Promise<GitRunResult>;
  saveConfiguredActions(request: GitConfiguredActionSaveRequest): Promise<GitOperationResult>;
  getUpdateState(): Promise<AppUpdateState>;
  checkForUpdates(): Promise<AppUpdateCheckResult>;
  downloadUpdate(): Promise<AppUpdateActionResult>;
  installUpdate(): Promise<AppUpdateActionResult>;
  minimizeWindow(): Promise<AppWindowState>;
  toggleMaximizeWindow(): Promise<AppWindowState>;
  closeWindow(): Promise<void>;
  getWindowState(): Promise<AppWindowState>;
  onGitOutput(callback: (event: GitOutputEvent) => void): () => void;
  onRepoChanged(callback: (event: RepoChangedEvent) => void): () => void;
  onUpdateState(callback: (state: AppUpdateState) => void): () => void;
  onWindowState(callback: (state: AppWindowState) => void): () => void;
}

export function isGitAction(value: unknown): value is GitAction {
  return typeof value === "string" && GIT_ACTIONS.includes(value as GitAction);
}
