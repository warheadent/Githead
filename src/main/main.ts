import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, safeStorage, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  ExternalUrlRequest,
  FileSystemPathRequest,
  GitBranchRequest,
  GitCloneRequest,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitHistoryRequest,
  GenerateCommitMessageRequest,
  GitCommitRequest,
  GitFileDiffRequest,
  GitHunkRequest,
  GitHubRepositoryRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitOutputEvent,
  GitPathRequest,
  GitRepositoryAccessCheckRequest,
  RepoTrustRequest,
  GitRunRequest,
  GitUpstreamRequest
} from "../shared/types";
import { AiSettingsService } from "./aiSettingsService";
import { CommitMessageService } from "./commitMessageService";
import { GitService } from "./gitService";
import { GitHubService } from "./githubService";
import { NodeProcessRunner } from "./processRunner";
import { getOpenRepositoryFileError } from "./openFilePolicy";
import { RepoRecentsService } from "./repoRecentsService";
import { RepoTrustService } from "./repoTrustService";
import { RepoWatchService } from "./repoWatchService";
import { AppUpdateService } from "./updateService";
import { MIN_WINDOW_BOUNDS, WindowStateService } from "./windowStateService";

const DEFAULT_REPO_PATH = "D:\\Githead";
const processRunner = new NodeProcessRunner();
const gitService = new GitService(processRunner);

let mainWindow: BrowserWindow | null = null;
let commandRunning = false;
let aiSettingsService: AiSettingsService | null = null;
let commitMessageService: CommitMessageService | null = null;
let githubService: GitHubService | null = null;
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
  getWindowStateService().watchWindow(mainWindow);

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

ipcMain.handle(IPC_CHANNELS.getRepoSummary, async (_event, repoPath: string) => {
  return gitService.getRepoSummary(repoPath);
});

ipcMain.handle(IPC_CHANNELS.watchRepoChanges, async (_event, repoPath: string) => {
  getRepoWatchService().watchRepo(repoPath);
});

ipcMain.handle(IPC_CHANNELS.unwatchRepoChanges, async (_event, repoPath?: string) => {
  getRepoWatchService().stopWatching(repoPath);
});

ipcMain.handle(IPC_CHANNELS.getRepoRecents, async () => {
  return getRepoRecentsService().getRecents();
});

ipcMain.handle(IPC_CHANNELS.addRepoRecent, async (_event, repoPath: string) => {
  return getRepoRecentsService().addRecent(repoPath);
});

ipcMain.handle(IPC_CHANNELS.removeRepoRecent, async (_event, repoPath: string) => {
  return getRepoRecentsService().removeRecent(repoPath);
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

ipcMain.handle(IPC_CHANNELS.getGitHubWorkflowRuns, async (_event, request: GitHubRepositoryRequest) => {
  return getGitHubService().getWorkflowRuns(request);
});

ipcMain.handle(IPC_CHANNELS.getGitHubIssues, async (_event, request: GitHubRepositoryRequest) => {
  return getGitHubService().getIssues(request);
});

ipcMain.handle(IPC_CHANNELS.getGitHubPullRequests, async (_event, request: GitHubRepositoryRequest) => {
  return getGitHubService().getPullRequests(request);
});

ipcMain.handle(IPC_CHANNELS.getCommitHistory, async (_event, request: GitCommitHistoryRequest) => {
  return gitService.getCommitHistory(request);
});

ipcMain.handle(IPC_CHANNELS.getCommitDetails, async (_event, request: GitCommitDetailsRequest) => {
  return gitService.getCommitDetails(request);
});

ipcMain.handle(IPC_CHANNELS.getCommitFileDiff, async (_event, request: GitCommitFileDiffRequest) => {
  return gitService.getCommitFileDiff(request);
});

ipcMain.handle(IPC_CHANNELS.getFileDiff, async (_event, request) => {
  return gitService.getFileDiff(request);
});

ipcMain.handle(IPC_CHANNELS.stageFiles, async (_event, request: GitPathRequest) => {
  return runExclusiveGitOperation(() => gitService.stageFiles(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.unstageFiles, async (_event, request: GitPathRequest) => {
  return runExclusiveGitOperation(() => gitService.unstageFiles(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.stageHunk, async (_event, request: GitHunkRequest) => {
  return runExclusiveGitOperation(() => gitService.stageHunk(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.unstageHunk, async (_event, request: GitHunkRequest) => {
  return runExclusiveGitOperation(() => gitService.unstageHunk(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.commitChanges, async (_event, request: GitCommitRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(() => gitService.commitChanges(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.switchBranch, async (_event, request: GitBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(() => gitService.switchBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.createBranch, async (_event, request: GitBranchRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(() => gitService.createBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.setBranchUpstream, async (_event, request: GitUpstreamRequest) => {
  const trusted = await requireTrustedRepo(request.repoPath);
  if (trusted) {
    return trusted;
  }

  return runExclusiveGitOperation(() => gitService.setBranchUpstream(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.getAiSettings, async () => {
  return getAiSettingsService().getSettings();
});

ipcMain.handle(IPC_CHANNELS.saveAiSettings, async (_event, request: AiSettingsSaveRequest) => {
  return getAiSettingsService().saveSettings(request);
});

ipcMain.handle(IPC_CHANNELS.generateCommitMessage, async (_event, request: GenerateCommitMessageRequest) => {
  return runExclusiveGitOperation(() => getCommitMessageService().generateCommitMessage(request), request.repoPath);
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

ipcMain.handle(IPC_CHANNELS.copyPathToClipboard, async (_event, request: FileSystemPathRequest) => {
  const resolved = resolveRepoFilePath(request);
  if ("error" in resolved) {
    return createOperationFailure(request.repoPath, resolved.error);
  }

  clipboard.writeText(resolved.absolutePath);
  return createOperationSuccess(request.repoPath, "Path copied to clipboard.");
});

ipcMain.handle(IPC_CHANNELS.deleteFile, async (_event, request: FileSystemPathRequest) => {
  return runExclusiveGitOperation(async () => {
    const resolved = resolveRepoFilePath(request);
    if ("error" in resolved) {
      return createOperationFailure(request.repoPath, resolved.error);
    }

    const stats = await getStats(resolved.absolutePath);
    if (!stats) {
      return createOperationFailure(request.repoPath, "File does not exist.");
    }

    await shell.trashItem(resolved.absolutePath);
    return createOperationSuccess(request.repoPath, "File moved to Recycle Bin.");
  }, request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.revertFileChanges, async (_event, request: GitFileDiffRequest) => {
  return runExclusiveGitOperation(() => gitService.revertFileChanges(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.addPathToIgnore, async (_event, request: GitIgnorePathRequest) => {
  return runExclusiveGitOperation(() => gitService.addPathToIgnore(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.cloneRepository, async (_event, request: GitCloneRequest) => {
  return runExclusiveGitOperation(() => gitService.cloneRepository(request), request.parentPath);
});

ipcMain.handle(IPC_CHANNELS.checkRepositoryAccess, async (_event, request: GitRepositoryAccessCheckRequest) => {
  if (commandRunning) {
    return {
      source: request.source,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running.",
      branches: [],
      defaultBranch: null
    };
  }

  commandRunning = true;

  try {
    return await gitService.checkRepositoryAccess(request);
  } finally {
    commandRunning = false;
  }
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

  if (commandRunning) {
    const now = new Date().toISOString();
    return {
      runId: "busy",
      action: request.action,
      repoPath: request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running.",
      startedAt: now,
      endedAt: now
    };
  }

  commandRunning = true;

  try {
    return await gitService.runGitAction(request, sendGitOutput);
  } finally {
    commandRunning = false;
  }
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

async function runExclusiveGitOperation(
  operation: () => Promise<GitOperationResult>,
  repoPath: string
): Promise<GitOperationResult> {
  if (commandRunning) {
    return {
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Another git command is already running."
    };
  }

  commandRunning = true;

  try {
    return await operation();
  } finally {
    commandRunning = false;
  }
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

function resolveRepoFilePath(request: FileSystemPathRequest):
  | { repoRoot: string; absolutePath: string }
  | { error: string } {
  if (!request.repoPath.trim()) {
    return {
      error: "Select a repository folder."
    };
  }

  if (!request.path.trim()) {
    return {
      error: "Select a file."
    };
  }

  if (path.isAbsolute(request.path)) {
    return {
      error: "File path must be relative to the repository."
    };
  }

  const repoRoot = path.resolve(request.repoPath);
  const absolutePath = path.resolve(repoRoot, request.path);
  const relativePath = path.relative(repoRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      error: "File path must stay inside the repository."
    };
  }

  return {
    repoRoot,
    absolutePath
  };
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

async function getStats(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
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

function getAiSettingsService(): AiSettingsService {
  aiSettingsService ??= new AiSettingsService(app.getPath("userData"), safeStorage);
  return aiSettingsService;
}

function getCommitMessageService(): CommitMessageService {
  commitMessageService ??= new CommitMessageService(gitService, getAiSettingsService());
  return commitMessageService;
}

function getGitHubService(): GitHubService {
  githubService ??= new GitHubService(gitService, fetch, processRunner);
  return githubService;
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
