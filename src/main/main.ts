import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, safeStorage, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
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
  GitHubRepositoryRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitOutputEvent,
  GitPathRequest,
  GitRunRequest
} from "../shared/types";
import { AiSettingsService } from "./aiSettingsService";
import { CommitMessageService } from "./commitMessageService";
import { GitService } from "./gitService";
import { GitHubService } from "./githubService";
import { NodeProcessRunner } from "./processRunner";
import { RepoRecentsService } from "./repoRecentsService";

const DEFAULT_REPO_PATH = "D:\\Githead";
const processRunner = new NodeProcessRunner();
const gitService = new GitService(processRunner);

let mainWindow: BrowserWindow | null = null;
let commandRunning = false;
let aiSettingsService: AiSettingsService | null = null;
let commitMessageService: CommitMessageService | null = null;
let githubService: GitHubService | null = null;
let repoRecentsService: RepoRecentsService | null = null;

const remoteDebuggingPort = process.env.GITHEAD_REMOTE_DEBUGGING_PORT;
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: "Githead",
    backgroundColor: getWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
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

app.whenReady().then(() => {
  createWindow();

  nativeTheme.on("updated", () => {
    mainWindow?.setBackgroundColor(getWindowBackgroundColor());
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
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

ipcMain.handle(IPC_CHANNELS.getRepoSummary, async (_event, repoPath: string) => {
  return gitService.getRepoSummary(repoPath);
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

ipcMain.handle(IPC_CHANNELS.getGitHubWorkflowRuns, async (_event, request: GitHubRepositoryRequest) => {
  return getGitHubService().getWorkflowRuns(request);
});

ipcMain.handle(IPC_CHANNELS.getGitHubIssues, async (_event, request: GitHubRepositoryRequest) => {
  return getGitHubService().getIssues(request);
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

ipcMain.handle(IPC_CHANNELS.commitChanges, async (_event, request: GitCommitRequest) => {
  return runExclusiveGitOperation(() => gitService.commitChanges(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.switchBranch, async (_event, request: GitBranchRequest) => {
  return runExclusiveGitOperation(() => gitService.switchBranch(request), request.repoPath);
});

ipcMain.handle(IPC_CHANNELS.createBranch, async (_event, request: GitBranchRequest) => {
  return runExclusiveGitOperation(() => gitService.createBranch(request), request.repoPath);
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

ipcMain.handle(IPC_CHANNELS.runGitAction, async (_event, request: GitRunRequest) => {
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
