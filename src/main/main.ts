import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  GetAiReasoningCapabilitiesRequest,
  AppSettingsSaveRequest,
  ClipboardTextRequest,
  CancelRepositoryReadRequest,
  CancelGitOperationRequest,
  CancelGitHubRequest,
  CreatePullRequestRequest,
  ExternalUrlRequest,
  GeneratePrDescriptionRequest,
  GeneratePrTitleRequest,
  FileSystemPathListRequest,
  FileSystemPathRequest,
  GitBranchRequest,
  GitRemoteBranchCheckoutRequest,
  GitHubPullRequestCheckoutRequest,
  GitRenameBranchRequest,
  GitDeleteBranchRequest,
  GitAddRemoteRequest,
  GitCloneRequest,
  GitConfiguredActionRunRequest,
  GitConfiguredActionSaveRequest,
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
  GitFilePreviewRequest,
  GitHunkRequest,
  GitLfsImageFetchRequest,
  GitHubWorkflowRunsRequest,
  GitHubPullRequestsRequest,
  GitHubIssuesRequest,
  GitHubHistoryInsightsRequest,
  GitHubRepositoryRequest,
  GitIdentitySaveRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitOutputEvent,
  GitPathRequest,
  GitPublishBranchRequest,
  GitRemoveRemoteRequest,
  GitRenameRemoteRequest,
  GitRepositoryAccessCheckRequest,
  RepositoryGroupsRequest,
  RepositoryRecentSelectionRequest,
  GitResetCommitRequest,
  RepoTrustRequest,
  RepoSummaryReadRequest,
  RepoSectionRequest,
  GitRunRequest,
  GitSafeDirectoryRequest,
  GitSetRemoteUrlRequest,
  GitSubmoduleRequest,
  GitUpstreamRequest,
  GitWorktreeCreateRequest,
  GitWorktreeRemoveRequest,
  GitWorktreeRequest
} from "../shared/types";
import { AiCliStatusService } from "./aiCliStatusService";
import { AiSettingsService } from "./aiSettingsService";
import { AiReasoningCapabilityService } from "./aiReasoningCapabilityService";
import { AppSettingsService, normalizeZoomFactorForSave } from "./appSettingsService";
import { CommitMessageService } from "./commitMessageService";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import { deleteFiles, getStats, resolveRepoFilePath, showRepositoryInExplorer } from "./fileOperationService";
import { GitIdentityService } from "./gitIdentityService";
import { GitService } from "./gitService";
import { DefaultGitHubClient, type GitHubClient } from "./githubClient";
import { GitHubService } from "./githubService";
import { RequestRegistry } from "./requestRegistry";
import { LoreService } from "./loreService";
import { NodeProcessRunner } from "./processRunner";
import { PrDescriptionService } from "./prDescriptionService";
import { getOpenRepositoryFileError } from "./openFilePolicy";
import { RepoRecentsService } from "./repoRecentsService";
import { RepoTrustService } from "./repoTrustService";
import { RepoWatchService, type RepoWatchTarget } from "./repoWatchService";
import { RepositoryOperationCoordinator } from "./repositoryOperationCoordinator";
import { AppUpdateService } from "./updateService";
import { VcsRouter } from "./vcsRouter";
import { MIN_WINDOW_BOUNDS, WindowStateService } from "./windowStateService";

const DEFAULT_REPO_PATH = "D:\\Githead";
const processRunner = new CancellableProcessRunner(new NodeProcessRunner());
const gitService = new GitService(processRunner);
const loreService = new LoreService(processRunner);
const vcsRouter = new VcsRouter(gitService, loreService);
const repositoryOperations = new RepositoryOperationCoordinator();

const LOCAL_OPERATION_TIMEOUT_MS = 10 * 60_000;
const NETWORK_OPERATION_TIMEOUT_MS = 30 * 60_000;

function isLoreSource(source: string): boolean {
  return source.trim().toLowerCase().startsWith("lore://");
}

let mainWindow: BrowserWindow | null = null;
let aiCliStatusService: AiCliStatusService | null = null;
let aiSettingsService: AiSettingsService | null = null;
let aiReasoningCapabilityService: AiReasoningCapabilityService | null = null;
let appSettingsService: AppSettingsService | null = null;
let gitIdentityService: GitIdentityService | null = null;
let commitMessageService: CommitMessageService | null = null;
let prDescriptionService: PrDescriptionService | null = null;
let githubService: GitHubService | null = null;
let githubClient: GitHubClient | null = null;
const readRequests = new RequestRegistry<number>();
const readRequestOwners = new Set<number>();
let repoRecentsService: RepoRecentsService | null = null;
let repoTrustService: RepoTrustService | null = null;
let repoWatchService: RepoWatchService | null = null;
let appUpdateService: AppUpdateService | null = null;
let windowStateService: WindowStateService | null = null;

const remoteDebuggingPort = process.env.GITHEAD_REMOTE_DEBUGGING_PORT;
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
}

async function createWindow(): Promise<void> {
  const restoredWindowState = await getWindowStateService().getWindowState(getDisplayWorkAreas());

  mainWindow = new BrowserWindow({
    ...restoredWindowState.bounds,
    frame: false,
    autoHideMenuBar: true,
    minWidth: MIN_WINDOW_BOUNDS.width,
    minHeight: MIN_WINDOW_BOUNDS.height,
    title: "Githead",
    backgroundColor: getWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const { zoomFactor } = await getAppSettingsService().getSettings();
  mainWindow.webContents.setZoomFactor(zoomFactor);
  getWindowStateService().watchWindow(mainWindow);
  Menu.setApplicationMenu(null);
  mainWindow.on("maximize", () => {
    sendWindowState(mainWindow);
  });
  mainWindow.on("unmaximize", () => {
    sendWindowState(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = normalizeExternalUrl(url);
    if ("url" in parsed) {
      void shell.openExternal(parsed.url);
    }

    return {
      action: "deny"
    };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
  }

  if (restoredWindowState.isMaximized) {
    mainWindow.maximize();
  }
}

function getWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? "#12161b" : "#f4f5f7";
}

function sendGitOutput(event: GitOutputEvent): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.gitOutput, event);
  });
}

function getDisplayWorkAreas(): Electron.Rectangle[] {
  const primaryDisplay = screen.getPrimaryDisplay();
  const primaryWorkArea = primaryDisplay.workArea;
  const otherWorkAreas = screen
    .getAllDisplays()
    .filter((display) => display.id !== primaryDisplay.id)
    .map((display) => display.workArea);

  return [
    primaryWorkArea,
    ...otherWorkAreas
  ];
}

app.whenReady().then(async () => {
  await createWindow();
  void getAppUpdateService().configure();

  nativeTheme.on("updated", () => {
    mainWindow?.setBackgroundColor(getWindowBackgroundColor());
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  appUpdateService?.stop();
  repoWatchService?.stopWatching();
});

ipcMain.handle(IPC_CHANNELS.chooseRepo, async (_event, defaultPath?: string) => {
  const options: Electron.OpenDialogOptions = {
    title: "Select Git Repository",
    defaultPath: defaultPath?.trim() || DEFAULT_REPO_PATH,
    properties: [
      "openDirectory"
    ]
  };

  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle(IPC_CHANNELS.chooseCloneParent, async (_event, defaultPath?: string) => {
  const options: Electron.OpenDialogOptions = {
    title: "Select Clone Destination Folder",
    defaultPath: defaultPath?.trim() || app.getPath("documents"),
    properties: [
      "openDirectory"
    ]
  };

  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle(IPC_CHANNELS.chooseWorktreeParent, async (_event, defaultPath?: string) => {
  const options: Electron.OpenDialogOptions = {
    title: "Select Worktree Parent Folder",
    defaultPath: defaultPath?.trim() || app.getPath("documents"),
    properties: ["openDirectory"]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
});

ipcMain.handle(IPC_CHANNELS.getRepoSummary, (event, request: RepoSummaryReadRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getRepoSummary(request.repoPath))));

ipcMain.handle(IPC_CHANNELS.getRepoIdentity, (event, request: RepoSectionRequest) =>
  handleRead(event, request, (signal) => processRunner.runWithSignal(signal, async () =>
    (await vcsRouter.serviceForRepo(request.repoPath)).getRepoIdentity(request))));
ipcMain.handle(IPC_CHANNELS.getRepoStatus, (event, request: RepoSectionRequest) =>
  handleRead(event, request, (signal) => processRunner.runWithSignal(signal, async () =>
    (await vcsRouter.serviceForRepo(request.repoPath)).getRepoStatus(request))));
ipcMain.handle(IPC_CHANNELS.getRepoMetadata, (event, request: RepoSectionRequest) =>
  handleRead(event, request, (signal) => processRunner.runWithSignal(signal, async () =>
    (await vcsRouter.serviceForRepo(request.repoPath)).getRepoMetadata(request))));

ipcMain.handle(IPC_CHANNELS.cancelRepositoryRead, (event, request: CancelRepositoryReadRequest) => {
  readRequests.cancel(event.sender.id, request.requestId);
});

ipcMain.handle(IPC_CHANNELS.cancelGitOperation, (_event, request: CancelGitOperationRequest) => {
  return repositoryOperations.cancel(request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.watchRepoChanges, async (_event, repoPath: string) => {
  const targets: RepoWatchTarget[] = [{ path: repoPath, recursive: true, kind: "content" }];
  if (await vcsRouter.resolveKind(repoPath) === "git") {
    try {
      const admin = await gitService.getWorktreeAdminPaths(repoPath);
      targets.push({ path: admin.gitDir, recursive: false, kind: "metadata" });
      targets.push({ path: admin.commonDir, recursive: false, kind: "metadata" });
      for (const metadataPath of [path.join(admin.commonDir, "refs"), path.join(admin.commonDir, "worktrees")]) {
        try {
          if ((await fs.stat(metadataPath)).isDirectory()) targets.push({ path: metadataPath, recursive: true, kind: "metadata" });
        } catch { /* optional metadata directory */ }
      }
    } catch { /* content watching still provides focus-refresh fallback */ }
  }
  getRepoWatchService().watchRepo(repoPath, targets);
});

ipcMain.handle(IPC_CHANNELS.unwatchRepoChanges, async (_event, repoPath?: string) => {
  getRepoWatchService().stopWatching(repoPath);
});

ipcMain.handle(IPC_CHANNELS.getRepoRecents, async () => {
  return getRepoRecentsService().getRecents();
});

ipcMain.handle(IPC_CHANNELS.getRepoSyncStatuses, async (_event, repoPaths: string[]) => {
  return vcsRouter.getRepoSyncStatuses(repoPaths);
});

ipcMain.handle(IPC_CHANNELS.addRepoRecent, async (_event, request: RepositoryRecentSelectionRequest) => {
  let anchorPath = request.anchorPath;
  if (!anchorPath) {
    const [group] = await vcsRouter.getRepositoryGroups([request.repoPath]);
    anchorPath = group?.anchorPath ?? request.repoPath;
  }
  return getRepoRecentsService().addRecent(anchorPath, request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.removeRepoRecent, async (_event, repoPath: string) => {
  return getRepoRecentsService().removeRecent(repoPath);
});

ipcMain.handle(IPC_CHANNELS.reorderRepoRecents, async (_event, repoPaths: string[]) => {
  return getRepoRecentsService().reorderRecents(repoPaths);
});

ipcMain.handle(IPC_CHANNELS.getRepositoryGroups, async (_event, request: RepositoryGroupsRequest) => {
  const groups = await vcsRouter.getRepositoryGroups(request.repoPaths);
  return getRepoRecentsService().reconcileGroups(groups, request.activeRepoPath);
});

ipcMain.handle(IPC_CHANNELS.getRepoTrust, async (_event, request: RepoTrustRequest) => {
  return {
    trusted: await getRepoTrustService().isTrusted(request.repoPath)
  };
});

ipcMain.handle(IPC_CHANNELS.addRepoTrust, async (_event, request: RepoTrustRequest) => {
  return {
    trusted: await getRepoTrustService().trustRepo(request.repoPath)
  };
});

ipcMain.handle(IPC_CHANNELS.addSafeDirectory, async (_event, request: GitSafeDirectoryRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).addSafeDirectory(request), request.repoPath);
});

function handleRead<T>(event: Electron.IpcMainInvokeEvent, request: { requestId?: string }, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ownerId = event.sender.id;
  const requestId = request.requestId ?? crypto.randomUUID();
  const registration = readRequests.register(ownerId, requestId);
  if (!readRequestOwners.has(ownerId)) {
    readRequestOwners.add(ownerId);
    event.sender.once("destroyed", () => {
      readRequests.cancelAll(ownerId);
      readRequestOwners.delete(ownerId);
    });
  }
  return operation(registration.signal).finally(registration.complete);
}

function handleGitHubRead<T>(event: Electron.IpcMainInvokeEvent, request: GitHubRepositoryRequest, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return handleRead(event, request, operation);
}

ipcMain.handle(IPC_CHANNELS.cancelGitHubRequest, (event, request: CancelGitHubRequest) => {
  readRequests.cancel(event.sender.id, request.requestId);
});
ipcMain.handle(IPC_CHANNELS.getGitHubWorkflowRuns, (event, request: GitHubWorkflowRunsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getWorkflowRuns(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubViewer, (event, request: GitHubRepositoryRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getViewer(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubOpenCounts, (event, request: GitHubRepositoryRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getOpenCounts(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubIssues, (event, request: GitHubIssuesRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getIssues(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubPullRequests, (event, request: GitHubPullRequestsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getPullRequests(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubHistoryInsights, (event, request: GitHubHistoryInsightsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getHistoryInsights(request, signal)));

ipcMain.handle(IPC_CHANNELS.createGitHubPullRequest, async (_event, request: CreatePullRequestRequest) => {
  return getGitHubService().createPullRequest(request);
});

ipcMain.handle(IPC_CHANNELS.getCommitHistory, (event, request: GitCommitHistoryRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getCommitHistory(request))));

ipcMain.handle(IPC_CHANNELS.getCommitDetails, (event, request: GitCommitDetailsRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getCommitDetails(request))));

ipcMain.handle(IPC_CHANNELS.getCommitFileDiff, (event, request: GitCommitFileDiffRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getCommitFileDiff(request))));

ipcMain.handle(IPC_CHANNELS.getFileDiff, (event, request: GitFileDiffRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFileDiff(request))));

ipcMain.handle(IPC_CHANNELS.getFilePreview, (event, request: GitFilePreviewRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFilePreview(request))));

ipcMain.handle(IPC_CHANNELS.fetchLfsImageVersions, async (_event, request: GitLfsImageFetchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  return trusted ?? (await vcsRouter.serviceForRepo(request.repoPath)).fetchLfsImageVersions(request);
});

ipcMain.handle(IPC_CHANNELS.resetFilesToCommit, async (_event, request: GitCommitFileResetRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).resetFilesToCommit(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.openCommitFileVersion, async (_event, request: GitCommitFileVersionRequest) => {
  return openCommitFileVersion(request);
});

ipcMain.handle(IPC_CHANNELS.stageFiles, async (_event, request: GitPathRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).stageFiles(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.unstageFiles, async (_event, request: GitPathRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).unstageFiles(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.stageHunk, async (_event, request: GitHunkRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).stageHunk(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.unstageHunk, async (_event, request: GitHunkRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).unstageHunk(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.commitChanges, async (_event, request: GitCommitRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).commitChanges(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.copyCommitShaToClipboard, async (_event, request: GitCommitHashRequest) => {
  clipboard.writeText(request.hash.trim());
  return createOperationSuccess(request.repoPath, "Commit SHA copied to clipboard.");
});

ipcMain.handle(IPC_CHANNELS.resetBranchToCommit, async (_event, request: GitResetCommitRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).resetBranchToCommit(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.revertCommit, async (_event, request: GitCommitHashRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).revertCommit(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.createTag, async (_event, request: GitCreateTagRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).createTag(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.deleteTag, async (_event, request: GitDeleteTagRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).deleteTag(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.switchBranch, async (_event, request: GitBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).switchBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.createBranch, async (_event, request: GitBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).createBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.setBranchUpstream, async (_event, request: GitUpstreamRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).setBranchUpstream(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.publishBranch, async (_event, request: GitPublishBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).publishBranch(request, sendGitOutput), request.repoPath, NETWORK_OPERATION_TIMEOUT_MS);
});

ipcMain.handle(IPC_CHANNELS.getGitIdentity, async (_event, repoPath: string) => {
  return getGitIdentityService().getIdentity(repoPath);
});

ipcMain.handle(IPC_CHANNELS.saveGitIdentity, async (_event, request: GitIdentitySaveRequest) => {
  if (request.scope === "repository") {
    const trusted = await requireTrustedRepo(request.repoPath);
    if (trusted) {
      throw new Error(trusted.stderr);
    }
  }

  const operationKey = request.scope === "repository" ? request.repoPath : "git-global-config";
  return runExclusiveRepositoryOperation(
    operationKey,
    () => getGitIdentityService().saveIdentity(request),
    () => { throw new Error("Another git command is already running for this repository."); }
  );
});

ipcMain.handle(IPC_CHANNELS.getAiSettings, async () => {
  return getAiSettingsService().getSettings();
});

ipcMain.handle(IPC_CHANNELS.saveAiSettings, async (_event, request: AiSettingsSaveRequest) => {
  return getAiSettingsService().saveSettings(request);
});

ipcMain.handle(IPC_CHANNELS.checkoutRemoteBranch, async (_event, request: GitRemoteBranchCheckoutRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).checkoutRemoteBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.checkoutGitHubPullRequest, async (_event, request: GitHubPullRequestCheckoutRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).checkoutGitHubPullRequest(request), request.repoPath, NETWORK_OPERATION_TIMEOUT_MS);
});

ipcMain.handle(IPC_CHANNELS.renameBranch, async (_event, request: GitRenameBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).renameBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.deleteBranch, async (_event, request: GitDeleteBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).deleteBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.createWorktree, async (_event, request: GitWorktreeCreateRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).createWorktree(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.checkWorktreeRemoval, async (_event, request: GitWorktreeRequest) => {
  return (await vcsRouter.serviceForRepo(request.repoPath)).checkWorktreeRemoval(request);
});

ipcMain.handle(IPC_CHANNELS.removeWorktree, async (_event, request: GitWorktreeRemoveRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) return trusted;
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).removeWorktree(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.getAiReasoningCapabilities, async (_event, request: GetAiReasoningCapabilitiesRequest) => {
  return getAiReasoningCapabilityService().getCapabilities(request);
});

ipcMain.handle(IPC_CHANNELS.getAppSettings, async () => {
  return getAppSettingsService().getSettings();
});

ipcMain.handle(IPC_CHANNELS.saveAppSettings, async (_event, request: AppSettingsSaveRequest) => {
  return getAppSettingsService().saveSettings(request);
});

ipcMain.handle(IPC_CHANNELS.setWindowZoomFactor, (event, zoomFactor: number) => {
  event.sender.setZoomFactor(normalizeZoomFactorForSave(zoomFactor));
});

ipcMain.handle(IPC_CHANNELS.generateCommitMessage, async (_event, request: GenerateCommitMessageRequest) => {
  return runExclusiveGitOperation(() => getCommitMessageService().generateCommitMessage(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.getRemoteConfigs, async (_event, repoPath: string) => {
  return (await vcsRouter.serviceForRepo(repoPath)).getRemoteConfigs(repoPath);
});

ipcMain.handle(IPC_CHANNELS.addRemote, async (_event, request: GitAddRemoteRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).addRemote(request),
    request.repoPath
  );
});

ipcMain.handle(IPC_CHANNELS.renameRemote, async (_event, request: GitRenameRemoteRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).renameRemote(request),
    request.repoPath
  );
});

ipcMain.handle(IPC_CHANNELS.setRemoteUrl, async (_event, request: GitSetRemoteUrlRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).setRemoteUrl(request),
    request.repoPath
  );
});

ipcMain.handle(IPC_CHANNELS.removeRemote, async (_event, request: GitRemoveRemoteRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).removeRemote(request),
    request.repoPath
  );
});

ipcMain.handle(IPC_CHANNELS.generatePrTitle, async (_event, request: GeneratePrTitleRequest) => {
  return runExclusiveGitOperation(() => getPrDescriptionService().generatePrTitle(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.generatePrDescription, async (_event, request: GeneratePrDescriptionRequest) => {
  return runExclusiveGitOperation(() => getPrDescriptionService().generatePrDescription(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.openExternalUrl, async (_event, request: ExternalUrlRequest) => {
  const parsed = normalizeExternalUrl(request.url);
  if ("error" in parsed) {
    throw new Error(parsed.error);
  }

  await shell.openExternal(parsed.url);
});

ipcMain.handle(IPC_CHANNELS.openFile, async (_event, request: FileSystemPathRequest) => {
  const resolved = resolveRepoFilePath(request);
  if ("error" in resolved) {
    return createOperationFailure(request.repoPath, resolved.error);
  }

  const stats = await getStats(resolved.absolutePath);
  if (!stats) {
    return createOperationFailure(request.repoPath, "File does not exist.");
  }

  if (!stats.isFile()) {
    return createOperationFailure(request.repoPath, "Only files can be opened.");
  }

  const policyError = getOpenRepositoryFileError(resolved.absolutePath);
  if (policyError) {
    return createOperationFailure(request.repoPath, policyError);
  }

  const error = await shell.openPath(resolved.absolutePath);
  if (error) {
    return createOperationFailure(request.repoPath, error);
  }

  return createOperationSuccess(request.repoPath, "File opened.");
});

ipcMain.handle(IPC_CHANNELS.showInExplorer, async (_event, request: FileSystemPathRequest) => {
  const resolved = resolveRepoFilePath(request);
  if ("error" in resolved) {
    return createOperationFailure(request.repoPath, resolved.error);
  }

  shell.showItemInFolder(await getExplorerTarget(resolved.absolutePath, resolved.repoRoot));
  return createOperationSuccess(request.repoPath, "Shown in Explorer.");
});

ipcMain.handle(IPC_CHANNELS.showRepositoryInExplorer, async (_event, repoPath: string) => {
  return showRepositoryInExplorer(repoPath, shell.openPath);
});

ipcMain.handle(IPC_CHANNELS.copyPathToClipboard, async (_event, request: FileSystemPathRequest) => {
  const resolved = resolveRepoFilePath(request);
  if ("error" in resolved) {
    return createOperationFailure(request.repoPath, resolved.error);
  }

  clipboard.writeText(resolved.absolutePath);
  return createOperationSuccess(request.repoPath, "Path copied to clipboard.");
});

ipcMain.handle(IPC_CHANNELS.copyTextToClipboard, async (_event, request: ClipboardTextRequest) => {
  clipboard.writeText(request.text);
  return createOperationSuccess("", "Text copied to clipboard.");
});

ipcMain.handle(IPC_CHANNELS.deleteFile, async (_event, request: FileSystemPathRequest) => {
  return runExclusiveGitOperation(() => deleteFiles({
    repoPath: request.repoPath,
    paths: [
      request.path
    ]
  }, shell.trashItem), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.deleteFiles, async (_event, request: FileSystemPathListRequest) => {
  return runExclusiveGitOperation(() => deleteFiles(request, shell.trashItem), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.revertFileChanges, async (_event, request: GitFileChangesRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).revertFileChanges(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.addPathToIgnore, async (_event, request: GitIgnorePathRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).addPathToIgnore(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.cloneRepository, async (_event, request: GitCloneRequest) => {
  const service = isLoreSource(request.source) ? loreService : gitService;
  return runExclusiveGitOperation(() => service.cloneRepository(request), request.parentPath, NETWORK_OPERATION_TIMEOUT_MS);
});

ipcMain.handle(IPC_CHANNELS.checkRepositoryAccess, async (_event, request: GitRepositoryAccessCheckRequest) => {
  return runExclusiveRepositoryOperation(
    request.source,
    async () => {
      const service = isLoreSource(request.source) ? loreService : gitService;
      return service.checkRepositoryAccess(request);
    },
    () => ({
      source: request.source,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository.",
      branches: [],
      defaultBranch: null
    }),
    NETWORK_OPERATION_TIMEOUT_MS
  );
});

ipcMain.handle(IPC_CHANNELS.runGitAction, async (_event, request: GitRunRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    const now = new Date().toISOString();
    return {
      runId: "untrusted",
      action: request.action,
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: trusted.stderr,
      startedAt: now,
      endedAt: now
    };
  }

  return runExclusiveRepositoryOperation(
    request.repoPath,
    async () => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      return service.runGitAction(request, sendGitOutput);
    },
    () => {
      const now = new Date().toISOString();
      return {
        runId: "busy",
        action: request.action,
        repoPath: request.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: "Another git command is already running for this repository.",
        startedAt: now,
        endedAt: now
      };
    },
    NETWORK_OPERATION_TIMEOUT_MS
  );
});

ipcMain.handle(IPC_CHANNELS.runConfiguredAction, async (_event, request: GitConfiguredActionRunRequest) => {
  const actionName = request.name.trim() || "Actions";
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    const now = new Date().toISOString();
    return {
      runId: "untrusted",
      action: actionName,
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: trusted.stderr,
      startedAt: now,
      endedAt: now
    };
  }

  return runExclusiveRepositoryOperation(
    request.repoPath,
    async () => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      return service.runConfiguredAction(request, sendGitOutput);
    },
    () => {
      const now = new Date().toISOString();
      return {
        runId: "busy",
        action: actionName,
        repoPath: request.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: "Another git command is already running for this repository.",
        startedAt: now,
        endedAt: now
      };
    },
    NETWORK_OPERATION_TIMEOUT_MS
  );
});

ipcMain.handle(IPC_CHANNELS.updateSubmodules, async (_event, request: GitSubmoduleRequest) => {
  return runExclusiveGitOperation(() => gitService.updateSubmodules(request), request.repoPath, NETWORK_OPERATION_TIMEOUT_MS);
});

ipcMain.handle(IPC_CHANNELS.syncSubmodules, async (_event, request: GitSubmoduleRequest) => {
  return runExclusiveGitOperation(() => gitService.syncSubmodules(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.saveConfiguredActions, async (_event, request: GitConfiguredActionSaveRequest) => {
  return runExclusiveGitOperation(async () => (await vcsRouter.serviceForRepo(request.repoPath)).saveConfiguredActions(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.getUpdateState, async () => {
  return getAppUpdateService().getState();
});

ipcMain.handle(IPC_CHANNELS.checkForUpdates, async () => {
  return getAppUpdateService().checkForUpdates();
});

ipcMain.handle(IPC_CHANNELS.downloadUpdate, async () => {
  return getAppUpdateService().downloadUpdate();
});

ipcMain.handle(IPC_CHANNELS.installUpdate, async () => {
  return getAppUpdateService().installUpdate();
});

ipcMain.handle(IPC_CHANNELS.minimizeWindow, () => {
  const window = getWindowForControl();
  window?.minimize();
  return getAppWindowState(window);
});

ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, () => {
  const window = getWindowForControl();
  if (!window) {
    return getAppWindowState(window);
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }

  return getAppWindowState(window);
});

ipcMain.handle(IPC_CHANNELS.closeWindow, () => {
  getWindowForControl()?.close();
});

ipcMain.handle(IPC_CHANNELS.getWindowState, () => {
  return getAppWindowState(getWindowForControl());
});

async function runExclusiveGitOperation(
  operation: () => Promise<GitOperationResult>,
  repoPath: string,
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS
): Promise<GitOperationResult> {
  return runExclusiveRepositoryOperation(
    repoPath,
    operation,
    () => ({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository."
    }),
    timeoutMs
  );
}

async function runExclusiveRepositoryOperation<T>(
  repoPath: string,
  operation: () => Promise<T>,
  busyResult: () => T,
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS
): Promise<T> {
  const result = await repositoryOperations.run(
    repoPath,
    timeoutMs,
    (signal) => processRunner.runWithSignal(signal, operation)
  );
  return result.started ? result.value : busyResult();
}

async function requireTrustedRepo(repoPath: string): Promise<GitOperationResult | null> {
  if (await getRepoTrustService().isTrusted(repoPath)) {
    return null;
  }

  return createOperationFailure(
    repoPath,
    "Do you trust this workspace? This is the first time Githead will run Git operations here that may execute configured hooks or local Git configuration."
  );
}

function normalizeExternalUrl(url: string): { url: string } | { error: string } {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        error: "Only HTTP and HTTPS links can be opened."
      };
    }

    return {
      url: parsed.href
    };
  } catch {
    return {
      error: "External URL is invalid."
    };
  }
}

async function openCommitFileVersion(request: GitCommitFileVersionRequest): Promise<GitOperationResult> {
  const resolved = resolveRepoFilePath({
    repoPath: request.repoPath,
    path: request.path
  });
  if ("error" in resolved) {
    return createOperationFailure(request.repoPath, resolved.error);
  }

  const hash = request.hash.trim();
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) {
    return createOperationFailure(request.repoPath, "Commit hash is invalid.");
  }

  const policyError = getOpenRepositoryFileError(resolved.absolutePath);
  if (policyError) {
    return createOperationFailure(request.repoPath, policyError);
  }

  const tempDir = await fs.mkdtemp(path.join(app.getPath("temp"), "githead-commit-file-"));
  const tempPath = path.join(tempDir, path.basename(resolved.absolutePath));
  const service = await vcsRouter.serviceForRepo(request.repoPath);
  const result = await service.writeCommitFileVersionToPath(
    request.repoPath,
    hash,
    request.path.replace(/\\/g, "/"),
    tempPath
  );

  if (result.exitCode !== 0) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    return createOperationFailure(
      request.repoPath,
      result.stderr.trim() || result.error || "Unable to read file at the selected commit."
    );
  }

  await fs.chmod(tempPath, 0o444).catch(() => undefined);
  const error = await shell.openPath(tempPath);
  if (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    return createOperationFailure(request.repoPath, error);
  }

  return createOperationSuccess(request.repoPath, "Selected file version opened.");
}

async function getExplorerTarget(absolutePath: string, repoRoot: string): Promise<string> {
  let currentPath = absolutePath;

  while (path.relative(repoRoot, currentPath) && !(await getStats(currentPath))) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return repoRoot;
    }

    currentPath = parentPath;
  }

  return currentPath;
}

function createOperationSuccess(repoPath: string, stdout: string): GitOperationResult {
  return {
    repoPath,
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function createOperationFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}

function getWindowForControl(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? mainWindow;
}

function getAppWindowState(window: BrowserWindow | null): { isMaximized: boolean } {
  return {
    isMaximized: window?.isMaximized() ?? false
  };
}

function sendWindowState(window: BrowserWindow | null): void {
  window?.webContents.send(IPC_CHANNELS.windowState, getAppWindowState(window));
}

function getAiSettingsService(): AiSettingsService {
  aiSettingsService ??= new AiSettingsService(
    app.getPath("userData"),
    safeStorage,
    () => getAiCliStatusService().getStatus()
  );
  return aiSettingsService;
}

function getAiCliStatusService(): AiCliStatusService {
  aiCliStatusService ??= new AiCliStatusService(processRunner);
  return aiCliStatusService;
}

function getAiReasoningCapabilityService(): AiReasoningCapabilityService {
  aiReasoningCapabilityService ??= new AiReasoningCapabilityService(getAiSettingsService());
  return aiReasoningCapabilityService;
}

function getAppSettingsService(): AppSettingsService {
  appSettingsService ??= new AppSettingsService(app.getPath("userData"));
  return appSettingsService;
}

function getGitIdentityService(): GitIdentityService {
  gitIdentityService ??= new GitIdentityService(app.getPath("userData"), processRunner);
  return gitIdentityService;
}

function getCommitMessageService(): CommitMessageService {
  commitMessageService ??= new CommitMessageService(
    (repoPath) => vcsRouter.serviceForRepo(repoPath),
    getAiSettingsService(),
    fetch,
    processRunner,
    getAiReasoningCapabilityService()
  );
  return commitMessageService;
}

function getPrDescriptionService(): PrDescriptionService {
  prDescriptionService ??= new PrDescriptionService(
    gitService,
    getAiSettingsService(),
    fetch,
    processRunner,
    getAiReasoningCapabilityService()
  );
  return prDescriptionService;
}

function getGitHubService(): GitHubService {
  githubService ??= new GitHubService(gitService, getGitHubClient());
  return githubService;
}

function getGitHubClient(): GitHubClient {
  githubClient ??= new DefaultGitHubClient(fetch, processRunner);
  return githubClient;
}

function getRepoRecentsService(): RepoRecentsService {
  repoRecentsService ??= new RepoRecentsService(app.getPath("userData"));
  return repoRecentsService;
}

function getRepoTrustService(): RepoTrustService {
  repoTrustService ??= new RepoTrustService(app.getPath("userData"));
  return repoTrustService;
}

function getRepoWatchService(): RepoWatchService {
  repoWatchService ??= new RepoWatchService({
    getWindows: () => BrowserWindow.getAllWindows()
  });
  return repoWatchService;
}

function getAppUpdateService(): AppUpdateService {
  appUpdateService ??= new AppUpdateService({
    getWindows: () => BrowserWindow.getAllWindows()
  });
  return appUpdateService;
}

function getWindowStateService(): WindowStateService {
  windowStateService ??= new WindowStateService(app.getPath("userData"));
  return windowStateService;
}
