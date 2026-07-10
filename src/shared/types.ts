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

export type GitDiffKind = "text" | "binary" | "empty" | "error";

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
}

export type VcsKind = "git" | "lore";

/**
 * Feature flags describing what a repository's backing VCS supports. The
 * renderer gates VCS-specific UI on these rather than on `kind` directly so
 * that adding a third VCS later does not require touching every call site.
 */
export interface RepoCapabilities {
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
}

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

export interface GitCommitHistoryRequest {
  repoPath: string;
  limit?: number;
}

export interface GitCommitDetailsRequest {
  repoPath: string;
  hash: string;
}

export interface GitCommitFileDiffRequest {
  repoPath: string;
  hash: string;
  path: string;
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

export interface GitAddRemoteRequest {
  repoPath: string;
  name: string;
  url: string;
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

export interface AppSettings {
  autoFetchIntervalMinutes: number;
}

export interface AppSettingsSaveRequest {
  autoFetchIntervalMinutes: number;
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

export interface GitFileDiffRequest {
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

export interface GitFileDiff {
  path: string;
  side: GitDiffSide;
  kind: GitDiffKind;
  text: string;
  truncated?: boolean;
}

export interface GitOperationResult {
  repoPath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorKind?: "missing-author-identity";
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

export type RepoChangedReason = "filesystem" | "watcher-error";

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
  getRepoSummary(repoPath: string): Promise<RepoSummary>;
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
  getGitHubWorkflowRuns(request: GitHubRepositoryRequest): Promise<GitHubWorkflowRun[]>;
  getGitHubOpenCounts(request: GitHubRepositoryRequest): Promise<GitHubOpenCounts>;
  getGitHubIssues(request: GitHubRepositoryRequest): Promise<GitHubIssue[]>;
  getGitHubPullRequests(request: GitHubRepositoryRequest): Promise<GitHubPullRequest[]>;
  createGitHubPullRequest(request: CreatePullRequestRequest): Promise<CreatePullRequestResult>;
  getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]>;
  getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails>;
  getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff>;
  getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff>;
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
  createBranch(request: GitBranchRequest): Promise<GitOperationResult>;
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
