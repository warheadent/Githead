import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  ClipboardTextRequest,
  ExternalUrlRequest,
  FileSystemPathListRequest,
  FileSystemPathRequest,
  GitBranchRequest,
  GitCloneRequest,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitFileResetRequest,
  GitCommitFileVersionRequest,
  GitCommitHashRequest,
  GitCommitHistoryRequest,
  GenerateCommitMessageRequest,
  GitCommitRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitFileChangesRequest,
  GitFileDiffRequest,
  GitHunkRequest,
  GitHubRepositoryRequest,
  GitIgnorePathRequest,
  GitOutputEvent,
  GitPathRequest,
  GitRepositoryAccessCheckRequest,
  GitResetCommitRequest,
  GitRunRequest,
  GitUpstreamRequest,
  GitheadApi,
  AppUpdateState,
  RepoChangedEvent,
  RepoTrustRequest,
  RepoSummary
} from "../shared/types";

const api: GitheadApi = {
  chooseRepo: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseRepo, defaultPath) as Promise<string | null>,
  chooseCloneParent: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseCloneParent, defaultPath) as Promise<string | null>,
  getRepoSummary: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoSummary, repoPath) as Promise<RepoSummary>,
  watchRepoChanges: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.watchRepoChanges, repoPath) as ReturnType<GitheadApi["watchRepoChanges"]>,
  unwatchRepoChanges: (repoPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.unwatchRepoChanges, repoPath) as ReturnType<GitheadApi["unwatchRepoChanges"]>,
  getRepoRecents: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoRecents) as ReturnType<GitheadApi["getRepoRecents"]>,
  addRepoRecent: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRepoRecent, repoPath) as ReturnType<GitheadApi["addRepoRecent"]>,
  removeRepoRecent: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRepoRecent, repoPath) as ReturnType<GitheadApi["removeRepoRecent"]>,
  getRepoTrust: (request: RepoTrustRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoTrust, request) as ReturnType<GitheadApi["getRepoTrust"]>,
  addRepoTrust: (request: RepoTrustRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRepoTrust, request) as ReturnType<GitheadApi["addRepoTrust"]>,
  getGitHubWorkflowRuns: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubWorkflowRuns, request) as ReturnType<GitheadApi["getGitHubWorkflowRuns"]>,
  getGitHubIssues: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubIssues, request) as ReturnType<GitheadApi["getGitHubIssues"]>,
  getGitHubPullRequests: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubPullRequests, request) as ReturnType<GitheadApi["getGitHubPullRequests"]>,
  getCommitHistory: (request: GitCommitHistoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitHistory, request) as ReturnType<GitheadApi["getCommitHistory"]>,
  getCommitDetails: (request: GitCommitDetailsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitDetails, request) as ReturnType<GitheadApi["getCommitDetails"]>,
  getCommitFileDiff: (request: GitCommitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitFileDiff, request) as ReturnType<GitheadApi["getCommitFileDiff"]>,
  getFileDiff: (request: GitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileDiff, request) as ReturnType<GitheadApi["getFileDiff"]>,
  resetFilesToCommit: (request: GitCommitFileResetRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.resetFilesToCommit, request) as ReturnType<GitheadApi["resetFilesToCommit"]>,
  openCommitFileVersion: (request: GitCommitFileVersionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openCommitFileVersion, request) as ReturnType<GitheadApi["openCommitFileVersion"]>,
  stageFiles: (request: GitPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageFiles, request) as ReturnType<GitheadApi["stageFiles"]>,
  unstageFiles: (request: GitPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.unstageFiles, request) as ReturnType<GitheadApi["unstageFiles"]>,
  stageHunk: (request: GitHunkRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageHunk, request) as ReturnType<GitheadApi["stageHunk"]>,
  unstageHunk: (request: GitHunkRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.unstageHunk, request) as ReturnType<GitheadApi["unstageHunk"]>,
  commitChanges: (request: GitCommitRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.commitChanges, request) as ReturnType<GitheadApi["commitChanges"]>,
  copyCommitShaToClipboard: (request: GitCommitHashRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyCommitShaToClipboard, request) as ReturnType<GitheadApi["copyCommitShaToClipboard"]>,
  resetBranchToCommit: (request: GitResetCommitRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.resetBranchToCommit, request) as ReturnType<GitheadApi["resetBranchToCommit"]>,
  revertCommit: (request: GitCommitHashRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.revertCommit, request) as ReturnType<GitheadApi["revertCommit"]>,
  createTag: (request: GitCreateTagRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTag, request) as ReturnType<GitheadApi["createTag"]>,
  deleteTag: (request: GitDeleteTagRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteTag, request) as ReturnType<GitheadApi["deleteTag"]>,
  switchBranch: (request: GitBranchRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.switchBranch, request) as ReturnType<GitheadApi["switchBranch"]>,
  createBranch: (request: GitBranchRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBranch, request) as ReturnType<GitheadApi["createBranch"]>,
  setBranchUpstream: (request: GitUpstreamRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.setBranchUpstream, request) as ReturnType<GitheadApi["setBranchUpstream"]>,
  getAiSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAiSettings) as ReturnType<GitheadApi["getAiSettings"]>,
  saveAiSettings: (request: AiSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAiSettings, request) as ReturnType<GitheadApi["saveAiSettings"]>,
  generateCommitMessage: (request: GenerateCommitMessageRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCommitMessage, request) as ReturnType<GitheadApi["generateCommitMessage"]>,
  openExternalUrl: (request: ExternalUrlRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, request) as ReturnType<GitheadApi["openExternalUrl"]>,
  openFile: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, request) as ReturnType<GitheadApi["openFile"]>,
  showInExplorer: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.showInExplorer, request) as ReturnType<GitheadApi["showInExplorer"]>,
  copyPathToClipboard: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyPathToClipboard, request) as ReturnType<GitheadApi["copyPathToClipboard"]>,
  copyTextToClipboard: (request: ClipboardTextRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyTextToClipboard, request) as ReturnType<GitheadApi["copyTextToClipboard"]>,
  deleteFile: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteFile, request) as ReturnType<GitheadApi["deleteFile"]>,
  deleteFiles: (request: FileSystemPathListRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteFiles, request) as ReturnType<GitheadApi["deleteFiles"]>,
  revertFileChanges: (request: GitFileChangesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.revertFileChanges, request) as ReturnType<GitheadApi["revertFileChanges"]>,
  addPathToIgnore: (request: GitIgnorePathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.addPathToIgnore, request) as ReturnType<GitheadApi["addPathToIgnore"]>,
  cloneRepository: (request: GitCloneRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.cloneRepository, request) as ReturnType<GitheadApi["cloneRepository"]>,
  checkRepositoryAccess: (request: GitRepositoryAccessCheckRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkRepositoryAccess, request) as ReturnType<GitheadApi["checkRepositoryAccess"]>,
  runGitAction: (request: GitRunRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.runGitAction, request) as ReturnType<GitheadApi["runGitAction"]>,
  getUpdateState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getUpdateState) as ReturnType<GitheadApi["getUpdateState"]>,
  checkForUpdates: () =>
    ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates) as ReturnType<GitheadApi["checkForUpdates"]>,
  downloadUpdate: () =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate) as ReturnType<GitheadApi["downloadUpdate"]>,
  installUpdate: () =>
    ipcRenderer.invoke(IPC_CHANNELS.installUpdate) as ReturnType<GitheadApi["installUpdate"]>,
  onGitOutput: (callback: (event: GitOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: GitOutputEvent) => {
      callback(output);
    };

    ipcRenderer.on(IPC_CHANNELS.gitOutput, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.gitOutput, listener);
    };
  },
  onRepoChanged: (callback: (event: RepoChangedEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, repoChanged: RepoChangedEvent) => {
      callback(repoChanged);
    };

    ipcRenderer.on(IPC_CHANNELS.repoChanged, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.repoChanged, listener);
    };
  },
  onUpdateState: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, updateState: AppUpdateState) => {
      callback(updateState);
    };

    ipcRenderer.on(IPC_CHANNELS.updateState, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updateState, listener);
    };
  }
};

contextBridge.exposeInMainWorld("githead", api);
