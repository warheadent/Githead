export const GIT_ACTIONS = [
  "fetch",
  "pull",
  "push"
] as const;

export type GitAction = (typeof GIT_ACTIONS)[number];

export interface GitRemote {
  name: string;
  url: string;
  direction: "fetch" | "push";
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
  graph: string;
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
  statusLines: string[];
  files: GitStatusFile[];
  validationErrors: string[];
}

export interface GitRunRequest {
  repoPath: string;
  action: GitAction;
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

export interface GitCommitRequest {
  repoPath: string;
  message: string;
}

export interface GitBranchRequest {
  repoPath: string;
  branchName: string;
}

export interface AiSettings {
  hasApiKey: boolean;
  model: string;
  siteUrl: string;
  siteTitle: string;
}

export interface AiSettingsSaveRequest {
  apiKey?: string;
  clearApiKey?: boolean;
  model: string;
  siteUrl: string;
  siteTitle: string;
}

export interface GenerateCommitMessageRequest {
  repoPath: string;
}

export interface GitFileDiffRequest {
  repoPath: string;
  path: string;
  side: GitDiffSide;
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
  action: GitAction;
  repoPath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  endedAt: string;
}

export interface GitOutputEvent {
  runId: string;
  action: GitAction;
  stream: "stdout" | "stderr" | "system";
  text: string;
  timestamp: string;
}

export interface GitheadApi {
  chooseRepo(defaultPath?: string): Promise<string | null>;
  getRepoSummary(repoPath: string): Promise<RepoSummary>;
  getRepoRecents(): Promise<string[]>;
  addRepoRecent(repoPath: string): Promise<string[]>;
  removeRepoRecent(repoPath: string): Promise<string[]>;
  getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]>;
  getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails>;
  getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff>;
  getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff>;
  stageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  unstageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  commitChanges(request: GitCommitRequest): Promise<GitOperationResult>;
  switchBranch(request: GitBranchRequest): Promise<GitOperationResult>;
  createBranch(request: GitBranchRequest): Promise<GitOperationResult>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(request: AiSettingsSaveRequest): Promise<AiSettings>;
  generateCommitMessage(request: GenerateCommitMessageRequest): Promise<GitOperationResult>;
  openFile(request: FileSystemPathRequest): Promise<GitOperationResult>;
  showInExplorer(request: FileSystemPathRequest): Promise<GitOperationResult>;
  copyPathToClipboard(request: FileSystemPathRequest): Promise<GitOperationResult>;
  deleteFile(request: FileSystemPathRequest): Promise<GitOperationResult>;
  revertFileChanges(request: GitFileDiffRequest): Promise<GitOperationResult>;
  addPathToIgnore(request: GitIgnorePathRequest): Promise<GitOperationResult>;
  runGitAction(request: GitRunRequest): Promise<GitRunResult>;
  onGitOutput(callback: (event: GitOutputEvent) => void): () => void;
}

export function isGitAction(value: unknown): value is GitAction {
  return typeof value === "string" && GIT_ACTIONS.includes(value as GitAction);
}
