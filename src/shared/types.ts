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

export interface RepoSummary {
  repoPath: string;
  isValid: boolean;
  branch: string | null;
  upstream: string | null;
  branches: GitBranch[];
  hasHead: boolean;
  remotes: GitRemote[];
  remoteBranches: GitRemoteBranch[];
  githubRepository: GitHubRepository | null;
  statusLines: string[];
  files: GitStatusFile[];
  validationErrors: string[];
  actionsConfig: GitActionsConfig;
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

export interface AiSettings {
  hasApiKey: boolean;
  model: string;
  commitMessagePrompt: string;
}

export interface AiSettingsSaveRequest {
  apiKey?: string;
  clearApiKey?: boolean;
  model: string;
  commitMessagePrompt: string;
}

export interface GenerateCommitMessageRequest {
  repoPath: string;
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

export interface AppUpdateState {
  enabled: boolean;
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
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
  addRepoRecent(repoPath: string): Promise<string[]>;
  removeRepoRecent(repoPath: string): Promise<string[]>;
  reorderRepoRecents(repoPaths: string[]): Promise<string[]>;
  getRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  addRepoTrust(request: RepoTrustRequest): Promise<RepoTrustResult>;
  getGitHubWorkflowRuns(request: GitHubRepositoryRequest): Promise<GitHubWorkflowRun[]>;
  getGitHubOpenCounts(request: GitHubRepositoryRequest): Promise<GitHubOpenCounts>;
  getGitHubIssues(request: GitHubRepositoryRequest): Promise<GitHubIssue[]>;
  getGitHubPullRequests(request: GitHubRepositoryRequest): Promise<GitHubPullRequest[]>;
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
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(request: AiSettingsSaveRequest): Promise<AiSettings>;
  generateCommitMessage(request: GenerateCommitMessageRequest): Promise<GitOperationResult>;
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
