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

export type GitDiffSide = "staged" | "unstaged";

export type GitDiffKind = "text" | "binary" | "empty" | "error";

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
  chooseRepo(): Promise<string | null>;
  getRepoSummary(repoPath: string): Promise<RepoSummary>;
  getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff>;
  stageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  unstageFiles(request: GitPathRequest): Promise<GitOperationResult>;
  commitChanges(request: GitCommitRequest): Promise<GitOperationResult>;
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
