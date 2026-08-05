import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  RepositoryAiSettingsRequest,
  RepositoryAiSettingsSaveRequest,
  GetAiReasoningCapabilitiesRequest,
  AppSettingsSaveRequest,
  ClipboardTextRequest,
  CancelRepositoryReadRequest,
  CancelGitOperationRequest,
  GetGitOperationStatesRequest,
  CoordinatedRequest,
  CancelGitHubRequest,
  CreatePullRequestRequest,
  CreatePullRequestResult,
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
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult,
  GitCommitRequest,
  GitQuickCommitRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitFileChangesRequest,
  GitFileDiffRequest,
  GitFileHistoryRequest,
  GitFileBlameRequest,
  GitFilePreviewRequest,
  GitHunkRequest,
  GitLfsImageFetchRequest,
  GitHubWorkflowRunsRequest,
  GitHubOperationResult,
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
  GitPullRecoveryRequest,
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
  GitRunResult,
  GitSafeDirectoryRequest,
  GitStashBranchRequest,
  GitStashCreateRequest,
  GitStashDetailsRequest,
  GitStashFileDiffRequest,
  GitStashListRequest,
  GitStashRefRequest,
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
import { CommitPlanService } from "./commitPlanService";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import {
  runCoordinatedRepositoryOperation,
  runCoordinatedRepositoryOperationAfterPreflight
} from "./coordinatedRepositoryOperation";
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
import {
  RepositoryOperationCoordinator,
  repositoryOperationOwnerId,
  type RepositoryOperationOptions
} from "./repositoryOperationCoordinator";
import { AppUpdateService } from "./updateService";
import { VcsRouter } from "./vcsRouter";
import { MIN_WINDOW_BOUNDS, WindowStateService } from "./windowStateService";
import { initializeSentry } from "./sentry";

initializeSentry();

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
let commitPlanService: CommitPlanService | null = null;
let prDescriptionService: PrDescriptionService | null = null;
let githubService: GitHubService | null = null;
let githubClient: GitHubClient | null = null;
const readRequests = new RequestRegistry<number>();
const readRequestOwners = new Set<number>();
const repositoryOperationOwnerSessions = new WeakMap<Electron.WebContents, Set<string>>();
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
  watchRepositoryOperationOwner(mainWindow.webContents);
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

function watchRepositoryOperationOwner(webContents: Electron.WebContents): Set<string> {
  const existingOwnerSessions = repositoryOperationOwnerSessions.get(webContents);
  if (existingOwnerSessions) {
    return existingOwnerSessions;
  }

  const ownerSessions = new Set<string>();
  repositoryOperationOwnerSessions.set(webContents, ownerSessions);
  const cancelOwnedOperations = () => {
    for (const ownerId of ownerSessions) {
      repositoryOperations.cancelAll(ownerId);
    }
    ownerSessions.clear();
  };
  const handleNavigation = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>) => {
    if (details.isMainFrame && !details.isSameDocument) {
      cancelOwnedOperations();
    }
  };
  const handleDestroyed = () => {
    cancelOwnedOperations();
    repositoryOperationOwnerSessions.delete(webContents);
    webContents.off("did-start-navigation", handleNavigation);
    webContents.off("render-process-gone", cancelOwnedOperations);
  };

  // These listeners are registered once per WebContents, rather than once per
  // operation. Main-frame navigation includes reload, where the WebContents ID
  // remains stable even though the renderer document that owns the work is gone.
  webContents.on("did-start-navigation", handleNavigation);
  webContents.on("render-process-gone", cancelOwnedOperations);
  webContents.once("destroyed", handleDestroyed);
  return ownerSessions;
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

ipcMain.handle(IPC_CHANNELS.getGitOperationStates, (event, request: GetGitOperationStatesRequest) => {
  return repositoryOperations.getStates(request.operationIds, getRepositoryOperationOwnerId(event));
});

ipcMain.handle(IPC_CHANNELS.cancelGitOperation, (event, request: CancelGitOperationRequest) => {
  return repositoryOperations.cancel(request.operationId, getRepositoryOperationOwnerId(event));
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

ipcMain.handle(IPC_CHANNELS.addSafeDirectory, async (event, request: CoordinatedRequest<GitSafeDirectoryRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).addSafeDirectory(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
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

ipcMain.handle(IPC_CHANNELS.createGitHubPullRequest, (event, request: CoordinatedRequest<CreatePullRequestRequest>) =>
  runExclusiveRepositoryOperation(
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS),
    (signal) => getGitHubService().createPullRequest(request, signal),
    () => createGitHubMutationFailure(
      "unexpected",
      "Another operation is already running for this repository.",
      false
    )
  ).catch((error: unknown) => {
    if (isAbortError(error)) {
      return createGitHubMutationFailure("cancelled", getErrorMessage(error), true);
    }
    if (isTimeoutError(error)) {
      return createGitHubMutationFailure("timeout", getErrorMessage(error), true);
    }
    throw error;
  }));

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

ipcMain.handle(IPC_CHANNELS.getFileHistory, (event, request: GitFileHistoryRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFileHistory(request))));

ipcMain.handle(IPC_CHANNELS.getFileBlame, (event, request: GitFileBlameRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFileBlame(request))));

ipcMain.handle(IPC_CHANNELS.getFileDiff, (event, request: GitFileDiffRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFileDiff(request))));

ipcMain.handle(IPC_CHANNELS.getStashes, (event, request: GitStashListRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getStashes(request))));

ipcMain.handle(IPC_CHANNELS.getStashDetails, (event, request: GitStashDetailsRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getStashDetails(request))));

ipcMain.handle(IPC_CHANNELS.getStashFileDiff, (event, request: GitStashFileDiffRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getStashFileDiff(request))));

ipcMain.handle(IPC_CHANNELS.getFilePreview, (event, request: GitFilePreviewRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getFilePreview(request))));

ipcMain.handle(IPC_CHANNELS.fetchLfsImageVersions, async (event, request: CoordinatedRequest<GitLfsImageFetchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).fetchLfsImageVersions(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS)
  );
});

ipcMain.handle(IPC_CHANNELS.resetFilesToCommit, async (event, request: CoordinatedRequest<GitCommitFileResetRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).resetFilesToCommit(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.openCommitFileVersion, async (event, request: CoordinatedRequest<GitCommitFileVersionRequest>) => {
  const prepared = await runExclusiveRepositoryOperation<PreparedCommitFileVersion>(
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    () => prepareCommitFileVersion(request),
    () => ({
      result: createOperationFailure(request.repoPath, "Another git command is already running for this repository.")
    })
  );

  if (!prepared.tempDir || !prepared.tempPath) {
    return prepared.result;
  }

  await fs.chmod(prepared.tempPath, 0o444).catch(() => undefined);
  const error = await shell.openPath(prepared.tempPath);
  if (error) {
    await fs.rm(prepared.tempDir, { recursive: true, force: true }).catch(() => undefined);
    return createOperationFailure(request.repoPath, error);
  }

  return createOperationSuccess(request.repoPath, "Selected file version opened.");
});

ipcMain.handle(IPC_CHANNELS.stageFiles, async (event, request: CoordinatedRequest<GitPathRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).stageFiles(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.unstageFiles, async (event, request: CoordinatedRequest<GitPathRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).unstageFiles(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.stageHunk, async (event, request: CoordinatedRequest<GitHunkRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).stageHunk(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.unstageHunk, async (event, request: CoordinatedRequest<GitHunkRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).unstageHunk(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.commitChanges, async (event, request: CoordinatedRequest<GitCommitRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).commitChanges(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.copyCommitShaToClipboard, async (_event, request: GitCommitHashRequest) => {
  clipboard.writeText(request.hash.trim());
  return createOperationSuccess(request.repoPath, "Commit SHA copied to clipboard.");
});

ipcMain.handle(IPC_CHANNELS.resetBranchToCommit, async (event, request: CoordinatedRequest<GitResetCommitRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).resetBranchToCommit(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.revertCommit, async (event, request: CoordinatedRequest<GitCommitHashRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).revertCommit(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.createTag, async (event, request: CoordinatedRequest<GitCreateTagRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).createTag(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.deleteTag, async (event, request: CoordinatedRequest<GitDeleteTagRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).deleteTag(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.switchBranch, async (event, request: CoordinatedRequest<GitBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).switchBranch(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.createBranch, async (event, request: CoordinatedRequest<GitBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).createBranch(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.setBranchUpstream, async (event, request: CoordinatedRequest<GitUpstreamRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).setBranchUpstream(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.publishBranch, async (event, request: CoordinatedRequest<GitPublishBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).publishBranch(request, sendGitOutput),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS)
  );
});

ipcMain.handle(IPC_CHANNELS.getGitIdentity, async (_event, repoPath: string) => {
  return getGitIdentityService().getIdentity(repoPath);
});

ipcMain.handle(IPC_CHANNELS.saveGitIdentity, async (event, request: CoordinatedRequest<GitIdentitySaveRequest>) => {
  const operationKey = request.scope === "repository" ? request.repoPath : "git-global-config";
  const options = repositoryOperationOptions(event, request.operationId, operationKey);
  const operation = () => getGitIdentityService().saveIdentity(request);
  const busyResult = () => { throw new Error("Another git command is already running for this repository."); };

  return request.scope === "repository"
    ? runTrustedExclusiveRepositoryOperation(
        operation,
        options,
        (failure) => { throw new Error(failure.stderr); },
        busyResult
      )
    : runExclusiveRepositoryOperation(options, operation, busyResult);
});

ipcMain.handle(IPC_CHANNELS.getAiSettings, async () => {
  return getAiSettingsService().getSettings();
});

ipcMain.handle(IPC_CHANNELS.saveAiSettings, async (_event, request: AiSettingsSaveRequest) => {
  return getAiSettingsService().saveSettings(request);
});

ipcMain.handle(IPC_CHANNELS.quickCommitFiles, async (event, request: CoordinatedRequest<GitQuickCommitRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.resolveKind(request.repoPath)) === "git"
      ? gitService.quickCommitFiles(request)
      : createOperationFailure(request.repoPath, "Quick Commit is available only for Git repositories."),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.createStash, async (event, request: CoordinatedRequest<GitStashCreateRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).createStash(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

for (const [channel, operation] of [
  [IPC_CHANNELS.applyStash, "applyStash"],
  [IPC_CHANNELS.popStash, "popStash"],
  [IPC_CHANNELS.dropStash, "dropStash"]
] as const) {
  ipcMain.handle(channel, async (event, request: CoordinatedRequest<GitStashRefRequest>) => {
    return runTrustedExclusiveGitOperation(
      async () => (await vcsRouter.serviceForRepo(request.repoPath))[operation](request),
      repositoryOperationOptions(event, request.operationId, request.repoPath)
    );
  });
}

ipcMain.handle(IPC_CHANNELS.createBranchFromStash, async (event, request: CoordinatedRequest<GitStashBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).createBranchFromStash(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.getRepositoryAiSettings, async (_event, request: RepositoryAiSettingsRequest) => {
  return getAiSettingsService().getRepositorySettings(request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.saveRepositoryAiSettings, async (_event, request: RepositoryAiSettingsSaveRequest) => {
  return getAiSettingsService().saveRepositorySettings(request);
});

ipcMain.handle(IPC_CHANNELS.checkoutRemoteBranch, async (event, request: CoordinatedRequest<GitRemoteBranchCheckoutRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).checkoutRemoteBranch(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.checkoutGitHubPullRequest, async (event, request: CoordinatedRequest<GitHubPullRequestCheckoutRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).checkoutGitHubPullRequest(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS)
  );
});

ipcMain.handle(IPC_CHANNELS.renameBranch, async (event, request: CoordinatedRequest<GitRenameBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).renameBranch(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.deleteBranch, async (event, request: CoordinatedRequest<GitDeleteBranchRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).deleteBranch(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.createWorktree, async (event, request: CoordinatedRequest<GitWorktreeCreateRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).createWorktree(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.checkWorktreeRemoval, async (_event, request: GitWorktreeRequest) => {
  return (await vcsRouter.serviceForRepo(request.repoPath)).checkWorktreeRemoval(request);
});

ipcMain.handle(IPC_CHANNELS.removeWorktree, async (event, request: CoordinatedRequest<GitWorktreeRemoveRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).removeWorktree(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
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

ipcMain.handle(IPC_CHANNELS.generateCommitMessage, async (event, request: CoordinatedRequest<GenerateCommitMessageRequest>) => {
  return runExclusiveGitOperation(
    (signal) => getCommitMessageService().generateCommitMessage(request, signal),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.getRemoteConfigs, async (_event, repoPath: string) => {
  return (await vcsRouter.serviceForRepo(repoPath)).getRemoteConfigs(repoPath);
});

ipcMain.handle(IPC_CHANNELS.addRemote, async (event, request: CoordinatedRequest<GitAddRemoteRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).addRemote(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.renameRemote, async (event, request: CoordinatedRequest<GitRenameRemoteRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).renameRemote(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.setRemoteUrl, async (event, request: CoordinatedRequest<GitSetRemoteUrlRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).setRemoteUrl(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.removeRemote, async (event, request: CoordinatedRequest<GitRemoveRemoteRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).removeRemote(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.generatePrTitle, async (event, request: CoordinatedRequest<GeneratePrTitleRequest>) => {
  return runExclusiveGitOperation(
    (signal) => getPrDescriptionService().generatePrTitle(request, signal),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.generatePrDescription, async (event, request: CoordinatedRequest<GeneratePrDescriptionRequest>) => {
  return runExclusiveGitOperation(
    (signal) => getPrDescriptionService().generatePrDescription(request, signal),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
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

ipcMain.handle(IPC_CHANNELS.deleteFile, async (event, request: CoordinatedRequest<FileSystemPathRequest>) => {
  return runExclusiveGitOperation(() => deleteFiles({
    repoPath: request.repoPath,
    paths: [
      request.path
    ]
  }, shell.trashItem), repositoryOperationOptions(event, request.operationId, request.repoPath));
});

ipcMain.handle(IPC_CHANNELS.deleteFiles, async (event, request: CoordinatedRequest<FileSystemPathListRequest>) => {
  return runExclusiveGitOperation(
    () => deleteFiles(request, shell.trashItem),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.revertFileChanges, async (event, request: CoordinatedRequest<GitFileChangesRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).revertFileChanges(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.addPathToIgnore, async (event, request: CoordinatedRequest<GitIgnorePathRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).addPathToIgnore(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.cloneRepository, async (event, request: CoordinatedRequest<GitCloneRequest>) => {
  const service = isLoreSource(request.source) ? loreService : gitService;
  return runExclusiveGitOperation(
    () => service.cloneRepository(request),
    repositoryOperationOptions(event, request.operationId, request.parentPath, NETWORK_OPERATION_TIMEOUT_MS)
  );
});

ipcMain.handle(IPC_CHANNELS.checkRepositoryAccess, async (event, request: CoordinatedRequest<GitRepositoryAccessCheckRequest>) => {
  return runExclusiveRepositoryOperation(
    repositoryOperationOptions(event, request.operationId, request.source, NETWORK_OPERATION_TIMEOUT_MS),
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
    })
  );
});

ipcMain.handle(IPC_CHANNELS.runGitAction, async (event, request: CoordinatedRequest<GitRunRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      return service.runGitAction(request, sendGitOutput);
    },
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS),
    (failure) => createGitRunFailure("untrusted", request.action, request.repoPath, failure.stderr),
    () => createGitRunFailure(
      "busy",
      request.action,
      request.repoPath,
      "Another git command is already running for this repository."
    )
  );
});

ipcMain.handle(IPC_CHANNELS.generateCommitPlan, async (event, request: CoordinatedRequest<GenerateCommitPlanRequest>) => {
  return runExclusiveRepositoryOperation<GenerateCommitPlanResult>(
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    async (signal) => (await vcsRouter.resolveKind(request.repoPath)) === "git"
      ? getCommitPlanService().generateCommitPlan(request, signal)
      : createCommitPlanFailure(request.repoPath, "Commit plans are available only for Git repositories."),
    () => createCommitPlanFailure(request.repoPath, "Another operation is already running for this repository.")
  );
});

ipcMain.handle(IPC_CHANNELS.getPullRecovery, async (_event, repoPath: string) => {
  return (await vcsRouter.serviceForRepo(repoPath)).getPullRecovery(repoPath);
});

ipcMain.handle(IPC_CHANNELS.resolvePullRecovery, async (event, request: CoordinatedRequest<GitPullRecoveryRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).resolvePullRecovery(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    (failure) => ({ ...failure, outcome: "failed" as const, recovery: null, recoveryRef: null }),
    () => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository.",
      outcome: "failed" as const,
      recovery: null,
      recoveryRef: null
    })
  );
});

ipcMain.handle(IPC_CHANNELS.runConfiguredAction, async (event, request: CoordinatedRequest<GitConfiguredActionRunRequest>) => {
  const actionName = request.name.trim() || "Actions";
  return runTrustedExclusiveRepositoryOperation(
    async () => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      return service.runConfiguredAction(request, sendGitOutput);
    },
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS),
    (failure) => createGitRunFailure("untrusted", actionName, request.repoPath, failure.stderr),
    () => createGitRunFailure(
      "busy",
      actionName,
      request.repoPath,
      "Another git command is already running for this repository."
    )
  );
});

ipcMain.handle(IPC_CHANNELS.updateSubmodules, async (event, request: CoordinatedRequest<GitSubmoduleRequest>) => {
  return runExclusiveGitOperation(
    () => gitService.updateSubmodules(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS)
  );
});

ipcMain.handle(IPC_CHANNELS.syncSubmodules, async (event, request: CoordinatedRequest<GitSubmoduleRequest>) => {
  return runExclusiveGitOperation(
    () => gitService.syncSubmodules(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.saveConfiguredActions, async (event, request: CoordinatedRequest<GitConfiguredActionSaveRequest>) => {
  return runExclusiveGitOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).saveConfiguredActions(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
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

function runExclusiveGitOperation(
  operation: (signal: AbortSignal) => Promise<GitOperationResult>,
  options: RepositoryOperationOptions
): Promise<GitOperationResult> {
  return runExclusiveRepositoryOperation(
    options,
    operation,
    () => ({
      repoPath: options.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository."
    })
  );
}

function runTrustedExclusiveGitOperation(
  operation: (signal: AbortSignal) => Promise<GitOperationResult>,
  options: RepositoryOperationOptions
): Promise<GitOperationResult> {
  return runTrustedExclusiveRepositoryOperation(
    operation,
    options,
    (failure) => failure,
    () => createOperationFailure(
      options.repoPath,
      "Another git command is already running for this repository."
    )
  );
}

function runTrustedExclusiveRepositoryOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RepositoryOperationOptions,
  trustFailure: (failure: GitOperationResult) => T | Promise<T>,
  busyResult: () => T
): Promise<T> {
  return runCoordinatedRepositoryOperationAfterPreflight(
    repositoryOperations,
    processRunner,
    options,
    () => requireTrustedRepo(options.repoPath),
    operation,
    trustFailure,
    busyResult
  );
}

function runExclusiveRepositoryOperation<T>(
  options: RepositoryOperationOptions,
  operation: (signal: AbortSignal) => Promise<T>,
  busyResult: () => T
): Promise<T> {
  return runCoordinatedRepositoryOperation(
    repositoryOperations,
    processRunner,
    options,
    operation,
    busyResult
  );
}

function createGitRunFailure(
  runId: string,
  action: GitRunResult["action"],
  repoPath: string,
  stderr: string
): GitRunResult {
  const now = new Date().toISOString();
  return {
    runId,
    action,
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr,
    startedAt: now,
    endedAt: now
  };
}

function createGitHubMutationFailure(
  kind: "cancelled" | "timeout" | "unexpected",
  message: string,
  outcomeUnknown: boolean
): GitHubOperationResult<CreatePullRequestResult> {
  return {
    ok: false,
    error: {
      kind,
      message,
      retryable: false,
      retryAfterAt: null,
      outcomeUnknown,
      source: "combined",
      rateLimit: null
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The GitHub request did not complete.";
}

function repositoryOperationOptions(
  event: Electron.IpcMainInvokeEvent,
  operationId: string,
  repoPath: string,
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS
): RepositoryOperationOptions {
  if (!event.senderFrame || event.senderFrame.isDestroyed()) {
    throw new DOMException("Operation owner is no longer available.", "AbortError");
  }
  const ownerId = getRepositoryOperationOwnerId(event);
  watchRepositoryOperationOwner(event.sender).add(ownerId);
  return { operationId, ownerId, repoPath, timeoutMs };
}

function getRepositoryOperationOwnerId(event: Electron.IpcMainInvokeEvent): string {
  return repositoryOperationOwnerId(event.sender.id, event.processId, event.frameId);
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

interface PreparedCommitFileVersion {
  result: GitOperationResult;
  tempDir?: string;
  tempPath?: string;
}

async function prepareCommitFileVersion(request: GitCommitFileVersionRequest): Promise<PreparedCommitFileVersion> {
  const resolved = resolveRepoFilePath({
    repoPath: request.repoPath,
    path: request.path
  });
  if ("error" in resolved) {
    return { result: createOperationFailure(request.repoPath, resolved.error) };
  }

  const hash = request.hash.trim();
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) {
    return { result: createOperationFailure(request.repoPath, "Commit hash is invalid.") };
  }

  const policyError = getOpenRepositoryFileError(resolved.absolutePath);
  if (policyError) {
    return { result: createOperationFailure(request.repoPath, policyError) };
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
    return {
      result: createOperationFailure(
        request.repoPath,
        result.stderr.trim() || result.error || "Unable to read file at the selected commit."
      )
    };
  }

  return {
    result: createOperationSuccess(request.repoPath, "Selected file version prepared."),
    tempDir,
    tempPath
  };
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

function getCommitPlanService(): CommitPlanService {
  commitPlanService ??= new CommitPlanService(
    (repoPath) => vcsRouter.serviceForRepo(repoPath),
    getAiSettingsService(),
    fetch,
    processRunner,
    getAiReasoningCapabilityService()
  );
  return commitPlanService;
}

function createCommitPlanFailure(repoPath: string, stderr: string): GenerateCommitPlanResult {
  return {
    repoPath,
    exitCode: -1,
    plan: null,
    stderr
  };
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
