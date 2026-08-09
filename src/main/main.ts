import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import { DEFAULT_REMOTE_CHECK_LEASE_SECONDS, PERFORMANCE_REFRESH_KINDS } from "../shared/types";
import type {
  AiSettingsSaveRequest,
  RepositoryAiSettingsRequest,
  RepositoryAiSettingsSaveRequest,
  RepositorySyncSettingsRequest,
  RepositorySyncSettingsSaveRequest,
  GetAiReasoningCapabilitiesRequest,
  AppSettingsSaveRequest,
  AppSettings,
  ClipboardTextRequest,
  CancelRepositoryReadRequest,
  CancelGitOperationRequest,
  GetGitOperationStatesRequest,
  CoordinatedRequest,
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
  GitAmendExecuteRequest,
  GitAmendPreviewRequest,
  GitAmendRestoreRequest,
  GitAmendRestoreResult,
  GitAmendResult,
  GitCloneRequest,
  GitConfiguredActionRunRequest,
  GitConfiguredActionSaveRequest,
  GitConflictResolutionRequest,
  GitConflictResolutionSaveRequest,
  GitConflictResolutionSaveResult,
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
  GitCommitAndPushResult,
  GitCommitWithRemoteCheckResult,
  GitUndoCommitRequest,
  GitQuickCommitRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitFileChangesRequest,
  GitFileDiffRequest,
  GitFileHistoryRequest,
  GitForceWithLeaseRequest,
  GitFileBlameRequest,
  GitFilePreviewRequest,
  GitHunkRequest,
  GitLfsImageFetchRequest,
  GitHubWorkflowRunRequest,
  GitHubWorkflowRunsRequest,
  GitHubOperationResult,
  GitHubPullRequestDetailRequest,
  GitHubIssueDetailRequest,
  GitHubPullRequestReviewRequest,
  GitHubItemCommentRequest,
  GitHubPullRequestMergeRequest,
  GitHubPullRequestsRequest,
  GitHubIssuesRequest,
  GitHubHistoryInsightsRequest,
  GitHubConnectionRequest,
  GitHubDeviceFlow,
  GitHubRepositoryRequest,
  GitIdentitySaveRequest,
  GitIgnorePathRequest,
  GitIntegrationExecuteRequest,
  GitIntegrationPreviewRequest,
  GitIntegrationResult,
  GitOperationResult,
  GitRepositoryOperationActionRequest,
  GitRepositoryOperationActionResult,
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
  PerformanceRefreshRecord,
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
import { GitOutputBatcher, runWithGitOutputSink } from "./gitOutputBatcher";
import { snapshotGitPushExecutionOptions } from "./gitPushBehavior";
import { GitService } from "./gitService";
import { DefaultGitHubClient, type GitHubClient } from "./githubClient";
import { GitHubAuthService } from "./githubAuthService";
import { GitHubService } from "./githubService";
import { RequestRegistry } from "./requestRegistry";
import { LoreService } from "./loreService";
import { InstrumentedProcessRunner } from "./instrumentedProcessRunner";
import {
  LOCAL_OPERATION_TIMEOUT_MS,
  NETWORK_OPERATION_TIMEOUT_MS
} from "./operationTimeouts";
import {
  PerformanceDiagnostics,
  PerformanceDiagnosticsSessionRegistry
} from "./performanceDiagnostics";
import { NodeProcessRunner } from "./processRunner";
import { PrDescriptionService } from "./prDescriptionService";
import { getOpenRepositoryFileError } from "./openFilePolicy";
import { RepoRecentsService } from "./repoRecentsService";
import { RepositorySyncSettingsService } from "./repositorySyncSettingsService";
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

const performanceDiagnostics = new PerformanceDiagnostics({ appMetricsSource: app });
const performanceDiagnosticsSessions = new PerformanceDiagnosticsSessionRegistry(performanceDiagnostics);
const processRunner = new CancellableProcessRunner(
  new InstrumentedProcessRunner(new NodeProcessRunner(), performanceDiagnostics)
);
const gitService = new GitService(processRunner);
const loreService = new LoreService(processRunner);
const vcsRouter = new VcsRouter(gitService, loreService);
const repositoryOperations = new RepositoryOperationCoordinator();
const gitOutputBatcher = new GitOutputBatcher({
  getBroadcastTargets: () => BrowserWindow.getAllWindows().map((window) => window.webContents)
});

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
let githubAuthService: GitHubAuthService | null = null;
const readRequests = new RequestRegistry<number>();
const readRequestOwners = new Set<number>();
const repositoryOperationOwnerSessions = new WeakMap<Electron.WebContents, Set<string>>();
let repoRecentsService: RepoRecentsService | null = null;
let repositorySyncSettingsService: RepositorySyncSettingsService | null = null;
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
  const outputWindow = mainWindow;
  outputWindow.on("close", () => {
    gitOutputBatcher.flushTarget(outputWindow.webContents);
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
    gitOutputBatcher.flushTarget(webContents);
    performanceDiagnosticsSessions.stop(webContents);
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
  gitOutputBatcher.flushAll();
  performanceDiagnosticsSessions.stopAll();
  appUpdateService?.stop();
  repoWatchService?.stopWatching();
});

ipcMain.handle(IPC_CHANNELS.chooseRepo, async (_event, defaultPath?: string) => {
  const normalizedDefaultPath = defaultPath?.trim();
  const options: Electron.OpenDialogOptions = {
    title: "Select Git Repository",
    ...(normalizedDefaultPath ? { defaultPath: normalizedDefaultPath } : {}),
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

ipcMain.handle(IPC_CHANNELS.getRepositoryOperationState, async (_event, repoPath: string) => {
  return (await vcsRouter.serviceForRepo(repoPath)).getRepositoryOperationState(repoPath);
});

ipcMain.handle(IPC_CHANNELS.getConflictResolution, (event, request: GitConflictResolutionRequest) =>
  handleRead(event, request, async (signal) =>
    processRunner.runWithSignal(signal, async () =>
      (await vcsRouter.serviceForRepo(request.repoPath)).getConflictResolution(request))));

ipcMain.handle(IPC_CHANNELS.cancelRepositoryRead, (event, request: CancelRepositoryReadRequest) => {
  readRequests.cancel(event.sender.id, request.requestId);
});

ipcMain.handle(IPC_CHANNELS.getGitOperationStates, (event, request: GetGitOperationStatesRequest) => {
  return repositoryOperations.getStates(request.operationIds, getRepositoryOperationOwnerId(event));
});

ipcMain.handle(IPC_CHANNELS.cancelGitOperation, (event, request: CancelGitOperationRequest) => {
  gitOutputBatcher.flushTarget(event.sender);
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

function handleGitHubMutation<TRequest extends GitHubRepositoryRequest, TResult>(
  event: Electron.IpcMainInvokeEvent,
  request: CoordinatedRequest<TRequest>,
  operation: (signal: AbortSignal) => Promise<GitHubOperationResult<TResult>>
): Promise<GitHubOperationResult<TResult>> {
  return runExclusiveRepositoryOperation(
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS),
    operation,
    () => createGitHubMutationFailure<TResult>(
      "unexpected",
      "Another operation is already running for this repository.",
      false
    )
  ).catch((error: unknown) => {
    if (isAbortError(error)) return createGitHubMutationFailure<TResult>("cancelled", getErrorMessage(error), true);
    if (isTimeoutError(error)) return createGitHubMutationFailure<TResult>("timeout", getErrorMessage(error), true);
    throw error;
  });
}

ipcMain.handle(IPC_CHANNELS.cancelGitHubRequest, (event, request: CancelGitHubRequest) => {
  readRequests.cancel(event.sender.id, request.requestId);
});
ipcMain.handle(IPC_CHANNELS.getGitHubConnection, async (_event, request: GitHubConnectionRequest) => {
  const repository = request.repoPath ? await gitService.getGitHubRepository(request.repoPath) : null;
  return getGitHubClient().getConnectionStatus(repository);
});
ipcMain.handle(IPC_CHANNELS.beginGitHubDeviceFlow, () => getGitHubAuthService().beginDeviceFlow());
ipcMain.handle(IPC_CHANNELS.pollGitHubDeviceFlow, async (_event, flow: GitHubDeviceFlow) => {
  const result = await getGitHubAuthService().pollDeviceFlow(flow);
  if (result.state === "connected") getGitHubClient().resetAuthentication();
  return result;
});
ipcMain.handle(IPC_CHANNELS.disconnectGitHub, async () => {
  await getGitHubAuthService().disconnect();
  getGitHubClient().resetAuthentication();
  return getGitHubClient().getConnectionStatus();
});
ipcMain.handle(IPC_CHANNELS.getGitHubWorkflowRuns, (event, request: GitHubWorkflowRunsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getWorkflowRuns(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubWorkflowRunDetail, (event, request: GitHubWorkflowRunRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getWorkflowRunDetail(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubViewer, (event, request: GitHubRepositoryRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getViewer(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubOpenCounts, (event, request: GitHubRepositoryRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getOpenCounts(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubIssues, (event, request: GitHubIssuesRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getIssues(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubPullRequests, (event, request: GitHubPullRequestsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getPullRequests(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubPullRequestDetail, (event, request: GitHubPullRequestDetailRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getPullRequestDetail(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubIssueDetail, (event, request: GitHubIssueDetailRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getIssueDetail(request, signal)));
ipcMain.handle(IPC_CHANNELS.getGitHubHistoryInsights, (event, request: GitHubHistoryInsightsRequest) =>
  handleGitHubRead(event, request, (signal) => getGitHubService().getHistoryInsights(request, signal)));

ipcMain.handle(IPC_CHANNELS.createGitHubPullRequest, (event, request: CoordinatedRequest<CreatePullRequestRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().createPullRequest(request, signal)));
ipcMain.handle(IPC_CHANNELS.rerunGitHubWorkflowRun, (event, request: CoordinatedRequest<GitHubWorkflowRunRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().rerunWorkflowRun(request, signal)));
ipcMain.handle(IPC_CHANNELS.cancelGitHubWorkflowRun, (event, request: CoordinatedRequest<GitHubWorkflowRunRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().cancelWorkflowRun(request, signal)));
ipcMain.handle(IPC_CHANNELS.approveGitHubPullRequest, (event, request: CoordinatedRequest<GitHubPullRequestReviewRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().approvePullRequest(request, signal)));
ipcMain.handle(IPC_CHANNELS.commentOnGitHubItem, (event, request: CoordinatedRequest<GitHubItemCommentRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().commentOnItem(request, signal)));
ipcMain.handle(IPC_CHANNELS.mergeGitHubPullRequest, (event, request: CoordinatedRequest<GitHubPullRequestMergeRequest>) =>
  handleGitHubMutation(event, request, (signal) => getGitHubService().mergePullRequest(request, signal)));

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

ipcMain.handle(IPC_CHANNELS.commitWithRemoteCheck, async (event, request: CoordinatedRequest<GitCommitRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, async (onOutput) => {
      const settings = await getAppSettingsService().getSettings();
      return gitService.commitWithRemoteCheck(request, onOutput, remoteCheckLeaseDurationMs(settings));
    }),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS, true),
    (failure): GitCommitWithRemoteCheckResult => ({
      ...failure,
      outcome: "preflight-failed",
      commitCreated: false,
      branchName: null,
      ahead: null,
      behind: null
    }),
    (): GitCommitWithRemoteCheckResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository.",
      outcome: "preflight-failed",
      commitCreated: false,
      branchName: null,
      ahead: null,
      behind: null
    })
  );
});

ipcMain.handle(IPC_CHANNELS.commitAndPush, async (event, request: CoordinatedRequest<GitCommitRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async (signal) => withOwnedGitOutput(event, async (onOutput) => {
      const settings = await getAppSettingsService().getSettings();
      const pushOptions = await snapshotGitPushExecutionOptions(
        () => Promise.resolve(settings),
        signal
      );
      pushOptions.remoteCheckLeaseDurationMs = remoteCheckLeaseDurationMs(settings);
      return gitService.commitAndPush(request, onOutput, pushOptions);
    }),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS, true),
    (failure): GitCommitAndPushResult => ({
      ...failure,
      outcome: "preflight-failed",
      commitCreated: false,
      branchName: null,
      ahead: null,
      behind: null,
      previousHeadOid: null,
      headOid: null,
      canUndoCommit: false
    }),
    (): GitCommitAndPushResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository.",
      outcome: "preflight-failed",
      commitCreated: false,
      branchName: null,
      ahead: null,
      behind: null,
      previousHeadOid: null,
      headOid: null,
      canUndoCommit: false
    })
  );
});

ipcMain.handle(IPC_CHANNELS.undoCommitAndKeepStaged, async (event, request: CoordinatedRequest<GitUndoCommitRequest>) => {
  return runTrustedExclusiveGitOperation(
    () => gitService.undoCommitAndKeepStaged(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath)
  );
});

ipcMain.handle(IPC_CHANNELS.getAmendPreview, async (_event, request: GitAmendPreviewRequest) => {
  return gitService.getAmendPreview(request);
});

ipcMain.handle(IPC_CHANNELS.amendLastCommit, async (event, request: CoordinatedRequest<GitAmendExecuteRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, (onOutput) => gitService.amendLastCommit(request, onOutput)),
    repositoryOperationOptions(event, request.operationId, request.repoPath, LOCAL_OPERATION_TIMEOUT_MS, true),
    (failure): GitAmendResult => ({
      ...failure,
      outcome: "failed",
      message: failure.stderr,
      previousHeadOid: null,
      headOid: null,
      recoveryRef: null
    }),
    (): GitAmendResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another Git command is already running for this repository or a linked worktree.",
      outcome: "failed",
      message: "Another Git command is already running for this repository or a linked worktree.",
      previousHeadOid: null,
      headOid: null,
      recoveryRef: null
    })
  );
});

ipcMain.handle(IPC_CHANNELS.restoreAmendRecovery, async (event, request: CoordinatedRequest<GitAmendRestoreRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, (onOutput) => gitService.restoreAmendRecovery(request, onOutput)),
    repositoryOperationOptions(event, request.operationId, request.repoPath, LOCAL_OPERATION_TIMEOUT_MS, true),
    (failure): GitAmendRestoreResult => ({
      ...failure,
      outcome: "failed",
      message: failure.stderr,
      previousHeadOid: null,
      headOid: null,
      recoveryRef: null
    }),
    (): GitAmendRestoreResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another Git command is already running for this repository or a linked worktree.",
      outcome: "failed",
      message: "Another Git command is already running for this repository or a linked worktree.",
      previousHeadOid: null,
      headOid: null,
      recoveryRef: null
    })
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

ipcMain.handle(IPC_CHANNELS.getIntegrationPreview, async (_event, request: GitIntegrationPreviewRequest) => {
  return gitService.getIntegrationPreview(request);
});

ipcMain.handle(IPC_CHANNELS.runIntegration, async (event, request: CoordinatedRequest<GitIntegrationExecuteRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, (onOutput) => gitService.runIntegration(request, onOutput)),
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    (failure) => createIntegrationFailure(request, failure.stderr),
    () => createIntegrationFailure(request, "Another Git command is already running for this repository or a linked worktree.")
  );
});

ipcMain.handle(IPC_CHANNELS.pushWithForceLease, async (event, request: CoordinatedRequest<GitForceWithLeaseRequest>) => {
  return runTrustedExclusiveGitOperation(
    async () => withOwnedGitOutput(event, (onOutput) => gitService.pushWithForceLease(request, onOutput)),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS)
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
    async (signal) => withOwnedGitOutput(event, async (onOutput) => {
      const pushOptions = await snapshotGitPushExecutionOptions(
        () => getAppSettingsService().getSettings(),
        signal
      );
      return (await vcsRouter.serviceForRepo(request.repoPath)).publishBranch(request, onOutput, pushOptions);
    }),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS, true)
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
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, async (onOutput) => {
      if ((await vcsRouter.resolveKind(request.repoPath)) !== "git") {
        return createOperationFailure(request.repoPath, "Quick Commit is available only for Git repositories.");
      }
      const settings = await getAppSettingsService().getSettings();
      const leaseDurationMs = settings.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true
        ? remoteCheckLeaseDurationMs(settings)
        : undefined;
      return gitService.quickCommitFiles(request, onOutput, leaseDurationMs);
    }),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS, true),
    (failure) => failure,
    () => createOperationFailure(request.repoPath, "Another git command is already running for this repository.")
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

ipcMain.handle(IPC_CHANNELS.getRepositorySyncSettings, async (_event, request: RepositorySyncSettingsRequest) => {
  return getRepositorySyncSettingsService().getSettings(request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.saveRepositorySyncSettings, async (_event, request: RepositorySyncSettingsSaveRequest) => {
  return getRepositorySyncSettingsService().saveSettings(request);
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
    async (signal) => withOwnedGitOutput(event, async (onOutput) => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      if (request.action !== "push") {
        return service.runGitAction(request, onOutput);
      }
      const pushOptions = await snapshotGitPushExecutionOptions(
        () => getAppSettingsService().getSettings(),
        signal
      );
      return service.runGitAction(request, onOutput, pushOptions);
    }),
    repositoryOperationOptions(event, request.operationId, request.repoPath, NETWORK_OPERATION_TIMEOUT_MS, request.action === "push"),
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
    async (signal) => {
      if ((await vcsRouter.resolveKind(request.repoPath)) !== "git") {
        return createCommitPlanFailure(request.repoPath, "Commit plans are available only for Git repositories.");
      }
      const planPromise = getCommitPlanService().generateCommitPlan(request, signal);
      const settings = await getAppSettingsService().getSettings();
      const shouldWarmLease = settings.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true
        && await getRepoTrustService().isTrusted(request.repoPath);
      const warmLeasePromise = shouldWarmLease
        ? gitService.warmRemoteCheckLease(request.repoPath, remoteCheckLeaseDurationMs(settings)).catch(() => undefined)
        : Promise.resolve();
      const [plan] = await Promise.all([planPromise, warmLeasePromise]);
      return plan;
    },
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

ipcMain.handle(IPC_CHANNELS.resolveRepositoryOperation, async (event, request: CoordinatedRequest<GitRepositoryOperationActionRequest>) => {
  return runTrustedExclusiveRepositoryOperation(
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).resolveRepositoryOperation(request),
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    (failure): GitRepositoryOperationActionResult => ({ ...failure, outcome: "failed", state: null }),
    (): GitRepositoryOperationActionResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository or a linked worktree.",
      outcome: "failed",
      state: null
    })
  );
});

ipcMain.handle(IPC_CHANNELS.saveConflictResolution, async (event, request: CoordinatedRequest<GitConflictResolutionSaveRequest>) => {
  return runExclusiveRepositoryOperation<GitConflictResolutionSaveResult>(
    repositoryOperationOptions(event, request.operationId, request.repoPath),
    async () => (await vcsRouter.serviceForRepo(request.repoPath)).saveConflictResolution(request),
    (): GitConflictResolutionSaveResult => ({
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running for this repository or a linked worktree.",
      outcome: "failed",
      state: null
    })
  );
});

ipcMain.handle(IPC_CHANNELS.runConfiguredAction, async (event, request: CoordinatedRequest<GitConfiguredActionRunRequest>) => {
  const actionName = request.name.trim() || "Actions";
  return runTrustedExclusiveRepositoryOperation(
    async () => withOwnedGitOutput(event, async (onOutput) => {
      const service = await vcsRouter.serviceForRepo(request.repoPath);
      return service.runConfiguredAction(request, onOutput);
    }),
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

ipcMain.handle(IPC_CHANNELS.startPerformanceDiagnostics, (event) => {
  watchRepositoryOperationOwner(event.sender);
  return performanceDiagnosticsSessions.start(event.sender);
});

ipcMain.handle(IPC_CHANNELS.getPerformanceDiagnosticsSnapshot, (event) => {
  return performanceDiagnosticsSessions.snapshot(event.sender);
});

ipcMain.handle(IPC_CHANNELS.stopPerformanceDiagnostics, (event) => {
  performanceDiagnosticsSessions.stop(event.sender);
});

ipcMain.on(IPC_CHANNELS.recordPerformanceRefresh, (_event, record: unknown) => {
  const normalized = normalizePerformanceRefreshRecord(record);
  if (normalized) {
    performanceDiagnostics.recordRefresh(normalized);
  }
});

function normalizePerformanceRefreshRecord(record: unknown): PerformanceRefreshRecord | null {
  if (!record || typeof record !== "object") return null;
  const candidate = record as Partial<PerformanceRefreshRecord>;
  if (!PERFORMANCE_REFRESH_KINDS.includes(candidate.refreshKind as PerformanceRefreshRecord["refreshKind"])) return null;
  if (!isNonNegativeFiniteNumber(candidate.requestCount)) return null;
  if (!isNonNegativeFiniteNumber(candidate.coalescedCount)) return null;
  if (!isNonNegativeFiniteNumber(candidate.queueDepth)) return null;
  return {
    refreshKind: candidate.refreshKind,
    requestCount: candidate.requestCount,
    coalescedCount: candidate.coalescedCount,
    queueDepth: candidate.queueDepth
  } as PerformanceRefreshRecord;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

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

async function withOwnedGitOutput<T>(
  event: Electron.IpcMainInvokeEvent,
  operation: (onOutput: (output: GitOutputEvent) => void) => Promise<T>
): Promise<T> {
  return runWithGitOutputSink(gitOutputBatcher.createSink(event.sender), operation);
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

function createIntegrationFailure(
  request: Pick<GitIntegrationExecuteRequest, "kind" | "repoPath">,
  message: string
): GitIntegrationResult {
  return {
    repoPath: request.repoPath,
    kind: request.kind,
    exitCode: -1,
    stdout: "",
    stderr: message,
    outcome: "failed",
    message,
    previousHeadOid: null,
    headOid: null,
    completedCommitOids: [],
    stoppedCommitOid: null,
    operationState: null,
    forceWithLease: null
  };
}

function createGitHubMutationFailure<T>(
  kind: "cancelled" | "timeout" | "unexpected",
  message: string,
  outcomeUnknown: boolean
): GitHubOperationResult<T> {
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
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS,
  returnResultAfterAbort = false
): RepositoryOperationOptions {
  if (!event.senderFrame || event.senderFrame.isDestroyed()) {
    throw new DOMException("Operation owner is no longer available.", "AbortError");
  }
  const ownerId = getRepositoryOperationOwnerId(event);
  watchRepositoryOperationOwner(event.sender).add(ownerId);
  return {
    operationId,
    ownerId,
    repoPath,
    timeoutMs,
    ...(returnResultAfterAbort ? { returnResultAfterAbort: true } : {}),
    ...(path.isAbsolute(repoPath) ? {
      resolveScopePath: (signal: AbortSignal) => processRunner.runWithSignal(
        signal,
        () => gitService.resolveMutationScope(repoPath)
      )
    } : {})
  };
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
  aiReasoningCapabilityService ??= new AiReasoningCapabilityService(getAiSettingsService(), fetch, processRunner);
  return aiReasoningCapabilityService;
}

function getAppSettingsService(): AppSettingsService {
  appSettingsService ??= new AppSettingsService(app.getPath("userData"));
  return appSettingsService;
}

function remoteCheckLeaseDurationMs(settings: AppSettings): number {
  return (settings.gitBehaviors?.remoteCheckLeaseSeconds ?? DEFAULT_REMOTE_CHECK_LEASE_SECONDS) * 1_000;
}

function getRepositorySyncSettingsService(): RepositorySyncSettingsService {
  repositorySyncSettingsService ??= new RepositorySyncSettingsService(app.getPath("userData"));
  return repositorySyncSettingsService;
}

function getGitIdentityService(): GitIdentityService {
  gitIdentityService ??= new GitIdentityService(processRunner);
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
  githubClient ??= new DefaultGitHubClient(fetch, processRunner, { appTokenProvider: getGitHubAuthService() });
  return githubClient;
}

function getGitHubAuthService(): GitHubAuthService {
  githubAuthService ??= new GitHubAuthService(app.getPath("userData"), safeStorage, fetch);
  return githubAuthService;
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
