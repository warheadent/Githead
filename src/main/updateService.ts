import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AppUpdateActionResult,
  AppUpdateCheckResult,
  AppUpdateErrorContext,
  AppUpdateState
} from "../shared/types";
import {
  createInitialAppUpdateState,
  disableAppUpdateState,
  enableAppUpdateState,
  reduceAppUpdateStateOnCheckFailure,
  reduceAppUpdateStateOnCheckStart,
  reduceAppUpdateStateOnDownloadComplete,
  reduceAppUpdateStateOnDownloadFailure,
  reduceAppUpdateStateOnDownloadProgress,
  reduceAppUpdateStateOnDownloadStart,
  reduceAppUpdateStateOnInstallFailure,
  reduceAppUpdateStateOnNoUpdate,
  reduceAppUpdateStateOnUpdateAvailable
} from "./updateMachine";

const STARTUP_CHECK_DELAY_MS = 15_000;
const UPDATE_POLL_INTERVAL_MS = 4 * 60_000;

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(eventName: string, listener: (...args: unknown[]) => void): this;
}

interface AppUpdateRuntime {
  getVersion(): string;
  isPackaged: boolean;
}

export interface AppUpdateServiceOptions {
  runtime?: AppUpdateRuntime;
  updater?: AutoUpdaterLike;
  getWindows: () => BrowserWindow[];
  startupDelayMs?: number;
  pollIntervalMs?: number;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  disabledByEnv?: boolean;
  clock?: () => Date;
}

export class AppUpdateService {
  private readonly runtime: AppUpdateRuntime;
  private readonly updater: AutoUpdaterLike;
  private readonly getWindows: () => BrowserWindow[];
  private readonly startupDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly resourcesPath: string;
  private readonly platform: NodeJS.Platform;
  private readonly disabledByEnv: boolean;
  private readonly clock: () => Date;
  private state: AppUpdateState;
  private configured = false;
  private checkInFlight = false;
  private downloadInFlight = false;
  private installInFlight = false;
  private startupTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(options: AppUpdateServiceOptions) {
    this.runtime = options.runtime ?? app;
    this.updater = options.updater ?? autoUpdater;
    this.getWindows = options.getWindows;
    this.startupDelayMs = options.startupDelayMs ?? STARTUP_CHECK_DELAY_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? UPDATE_POLL_INTERVAL_MS;
    this.resourcesPath = options.resourcesPath ?? getElectronResourcesPath();
    this.platform = options.platform ?? process.platform;
    this.disabledByEnv = options.disabledByEnv ?? process.env.GITHEAD_DISABLE_AUTO_UPDATE === "1";
    this.clock = options.clock ?? (() => new Date());
    this.state = createInitialAppUpdateState(this.runtime.getVersion());
  }

  async configure(): Promise<AppUpdateState> {
    if (this.configured || this.state.enabled) {
      return this.getState();
    }

    const disabledReason = await this.getDisabledReason();
    if (disabledReason) {
      this.setState(disableAppUpdateState(this.state, disabledReason));
      return this.getState();
    }

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.registerUpdaterEvents();
    this.configured = true;
    this.setState(enableAppUpdateState(this.state));
    this.startPollers();
    return this.getState();
  }

  getState(): AppUpdateState {
    return this.state;
  }

  async checkForUpdates(): Promise<AppUpdateCheckResult> {
    if (!this.configured || !this.state.enabled) {
      return {
        checked: false,
        state: this.getState()
      };
    }

    if (this.checkInFlight || this.state.status === "downloading" || this.state.status === "downloaded") {
      return {
        checked: false,
        state: this.getState()
      };
    }

    this.checkInFlight = true;
    this.setState(reduceAppUpdateStateOnCheckStart(this.state, this.now()));

    try {
      await this.updater.checkForUpdates();
      return {
        checked: true,
        state: this.getState()
      };
    } catch (error) {
      this.setState(reduceAppUpdateStateOnCheckFailure(
        this.state,
        getUpdateErrorMessage("check", error),
        this.now()
      ));
      return {
        checked: true,
        state: this.getState()
      };
    } finally {
      this.checkInFlight = false;
    }
  }

  async downloadUpdate(): Promise<AppUpdateActionResult> {
    if (!this.configured || this.downloadInFlight || this.state.status !== "available") {
      return {
        accepted: false,
        completed: false,
        state: this.getState()
      };
    }

    this.downloadInFlight = true;
    this.setState(reduceAppUpdateStateOnDownloadStart(this.state));

    try {
      await this.updater.downloadUpdate();
      const state = this.getState();
      return {
        accepted: true,
        completed: state.status === "downloaded",
        state
      };
    } catch (error) {
      this.setState(reduceAppUpdateStateOnDownloadFailure(this.state, getUpdateErrorMessage("download", error)));
      return {
        accepted: true,
        completed: false,
        state: this.getState()
      };
    } finally {
      this.downloadInFlight = false;
    }
  }

  async installUpdate(): Promise<AppUpdateActionResult> {
    if (!this.configured || this.installInFlight || this.state.status !== "downloaded") {
      return {
        accepted: false,
        completed: false,
        state: this.getState()
      };
    }

    this.installInFlight = true;

    try {
      this.updater.quitAndInstall(true, true);
      return {
        accepted: true,
        completed: false,
        state: this.getState()
      };
    } catch (error) {
      this.installInFlight = false;
      this.setState(reduceAppUpdateStateOnInstallFailure(this.state, getUpdateErrorMessage("install", error)));
      return {
        accepted: true,
        completed: false,
        state: this.getState()
      };
    }
  }

  stop(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async getDisabledReason(): Promise<string | null> {
    if (this.platform !== "win32") {
      return "Automatic updates are only available for Windows builds.";
    }

    if (!this.runtime.isPackaged) {
      return "Automatic updates are only available in packaged production builds.";
    }

    if (this.disabledByEnv) {
      return "Automatic updates are disabled by GITHEAD_DISABLE_AUTO_UPDATE.";
    }

    if (!(await hasUpdateFeedConfig(this.resourcesPath))) {
      return "Automatic updates are not available because no update feed is configured.";
    }

    return null;
  }

  private registerUpdaterEvents(): void {
    this.updater.on("checking-for-update", () => {
      if (!this.checkInFlight) {
        this.setState(reduceAppUpdateStateOnCheckStart(this.state, this.now()));
      }
    });

    this.updater.on("update-available", (info) => {
      this.setState(reduceAppUpdateStateOnUpdateAvailable(this.state, readUpdateVersion(info), this.now()));
    });

    this.updater.on("update-not-available", () => {
      this.setState(reduceAppUpdateStateOnNoUpdate(this.state, this.now()));
    });

    this.updater.on("download-progress", (progress) => {
      this.setState(reduceAppUpdateStateOnDownloadProgress(this.state, readDownloadPercent(progress)));
    });

    this.updater.on("update-downloaded", (info) => {
      this.setState(reduceAppUpdateStateOnDownloadComplete(this.state, readUpdateVersion(info)));
    });

    this.updater.on("error", (error) => {
      this.handleUpdaterError(error);
    });
  }

  private handleUpdaterError(error: unknown): void {
    if (this.installInFlight) {
      this.installInFlight = false;
      this.setState(reduceAppUpdateStateOnInstallFailure(this.state, getUpdateErrorMessage("install", error)));
      return;
    }

    if (this.downloadInFlight || this.state.status === "downloading") {
      this.setState(reduceAppUpdateStateOnDownloadFailure(this.state, getUpdateErrorMessage("download", error)));
      return;
    }

    const context: AppUpdateErrorContext = "check";
    this.setState({
      ...this.state,
      status: "error",
      message: getUpdateErrorMessage("check", error),
      checkedAt: this.now(),
      downloadPercent: null,
      errorContext: context,
      canRetry: true
    });
  }

  private startPollers(): void {
    this.startupTimer = setTimeout(() => {
      void this.checkForUpdates();
    }, this.startupDelayMs);

    this.pollTimer = setInterval(() => {
      void this.checkForUpdates();
    }, this.pollIntervalMs);
  }

  private setState(nextState: AppUpdateState): void {
    this.state = nextState;
    this.emitState();
  }

  private emitState(): void {
    for (const window of this.getWindows()) {
      window.webContents.send(IPC_CHANNELS.updateState, this.state);
    }
  }

  private now(): string {
    return this.clock().toISOString();
  }
}

async function hasUpdateFeedConfig(resourcesPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(resourcesPath, "app-update.yml"));
    return true;
  } catch {
    return false;
  }
}

function getElectronResourcesPath(): string {
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  return electronProcess.resourcesPath ?? path.dirname(app.getPath("exe"));
}

function getUpdateErrorMessage(context: NonNullable<AppUpdateErrorContext>, error: unknown): string {
  const rawMessage = getRawErrorMessage(error);
  const lowerMessage = rawMessage.toLocaleLowerCase();
  const action = context === "check"
    ? "check for updates"
    : context === "download"
      ? "download the update"
      : "install the update";

  if (lowerMessage.includes("404") || lowerMessage.includes("not found")) {
    return `Could not ${action}. The GitHub release feed is not publicly available yet.`;
  }

  if (lowerMessage.includes("authentication") || lowerMessage.includes("unauthorized") || lowerMessage.includes("forbidden")) {
    return `Could not ${action}. The GitHub release feed requires authentication.`;
  }

  if (lowerMessage.includes("network") || lowerMessage.includes("timeout") || lowerMessage.includes("econn")) {
    return `Could not ${action}. Check your network connection and try again.`;
  }

  return `Could not ${action}. ${sanitizeUpdateErrorMessage(rawMessage)}`;
}

function getRawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "An unknown update error occurred.");
}

function sanitizeUpdateErrorMessage(message: string): string {
  return message
    .replace(/Headers:\s*\{[\s\S]*$/i, "")
    .replace(/"set-cookie":\s*\[[\s\S]*?\]/gi, '"set-cookie": "[redacted]"')
    .replace(/_gh_sess=[^;"\s]+/gi, "_gh_sess=[redacted]")
    .replace(/_octo=[^;"\s]+/gi, "_octo=[redacted]")
    .replace(/logged_in=[^;"\s]+/gi, "logged_in=[redacted]")
    .trim() || "An unexpected updater error occurred.";
}

function readUpdateVersion(info: unknown): string {
  if (info && typeof info === "object" && "version" in info && typeof info.version === "string") {
    return info.version;
  }

  return "unknown";
}

function readDownloadPercent(progress: unknown): number {
  if (progress && typeof progress === "object" && "percent" in progress && typeof progress.percent === "number") {
    return progress.percent;
  }

  return 0;
}
