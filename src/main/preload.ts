import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  FileSystemPathRequest,
  GitBranchRequest,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitHistoryRequest,
  GenerateCommitMessageRequest,
  GitCommitRequest,
  GitFileDiffRequest,
  GitIgnorePathRequest,
  GitOutputEvent,
  GitPathRequest,
  GitRunRequest,
  GitheadApi,
  RepoSummary
} from "../shared/types";

const api: GitheadApi = {
  chooseRepo: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseRepo, defaultPath) as Promise<string | null>,
  getRepoSummary: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoSummary, repoPath) as Promise<RepoSummary>,
  getRepoRecents: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoRecents) as ReturnType<GitheadApi["getRepoRecents"]>,
  addRepoRecent: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRepoRecent, repoPath) as ReturnType<GitheadApi["addRepoRecent"]>,
  removeRepoRecent: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRepoRecent, repoPath) as ReturnType<GitheadApi["removeRepoRecent"]>,
  getCommitHistory: (request: GitCommitHistoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitHistory, request) as ReturnType<GitheadApi["getCommitHistory"]>,
  getCommitDetails: (request: GitCommitDetailsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitDetails, request) as ReturnType<GitheadApi["getCommitDetails"]>,
  getCommitFileDiff: (request: GitCommitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitFileDiff, request) as ReturnType<GitheadApi["getCommitFileDiff"]>,
  getFileDiff: (request: GitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileDiff, request) as ReturnType<GitheadApi["getFileDiff"]>,
  stageFiles: (request: GitPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageFiles, request) as ReturnType<GitheadApi["stageFiles"]>,
  unstageFiles: (request: GitPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.unstageFiles, request) as ReturnType<GitheadApi["unstageFiles"]>,
  commitChanges: (request: GitCommitRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.commitChanges, request) as ReturnType<GitheadApi["commitChanges"]>,
  switchBranch: (request: GitBranchRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.switchBranch, request) as ReturnType<GitheadApi["switchBranch"]>,
  createBranch: (request: GitBranchRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBranch, request) as ReturnType<GitheadApi["createBranch"]>,
  getAiSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAiSettings) as ReturnType<GitheadApi["getAiSettings"]>,
  saveAiSettings: (request: AiSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAiSettings, request) as ReturnType<GitheadApi["saveAiSettings"]>,
  generateCommitMessage: (request: GenerateCommitMessageRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCommitMessage, request) as ReturnType<GitheadApi["generateCommitMessage"]>,
  openFile: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, request) as ReturnType<GitheadApi["openFile"]>,
  showInExplorer: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.showInExplorer, request) as ReturnType<GitheadApi["showInExplorer"]>,
  copyPathToClipboard: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyPathToClipboard, request) as ReturnType<GitheadApi["copyPathToClipboard"]>,
  deleteFile: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteFile, request) as ReturnType<GitheadApi["deleteFile"]>,
  revertFileChanges: (request: GitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.revertFileChanges, request) as ReturnType<GitheadApi["revertFileChanges"]>,
  addPathToIgnore: (request: GitIgnorePathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.addPathToIgnore, request) as ReturnType<GitheadApi["addPathToIgnore"]>,
  runGitAction: (request: GitRunRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.runGitAction, request) as ReturnType<GitheadApi["runGitAction"]>,
  onGitOutput: (callback: (event: GitOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: GitOutputEvent) => {
      callback(output);
    };

    ipcRenderer.on(IPC_CHANNELS.gitOutput, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.gitOutput, listener);
    };
  }
};

contextBridge.exposeInMainWorld("githead", api);
