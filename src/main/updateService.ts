import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AppUpdateActionResult,
  AppUpdateCheckResult,
  AppUpdateErrorContext,
  AppUpdateReleaseNotes,
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
  reduceAppUpdateStateOnReleaseNotesFailure,
  reduceAppUpdateStateOnReleaseNotesLoaded,
  reduceAppUpdateStateOnUpdateAvailable
} from "./updateMachine";

const STARTUP_CHECK_DELAY_MS = 15_000;
const UPDATE_POLL_INTERVAL_MS = 4 * 60_000;
const GITHEAD_RELEASES_API_BASE = "https://api.github.com/repos/warheadent/Githead/releases/tags";
const UPDATE_PROVIDER = "generic";
const UPDATE_FEED_URL = "https://github.com/warheadent/Githead/releases/latest/download";
const UPDATE_CACHE_DIR_NAME = "githead-updater";
const UPDATE_CONFIG_FILE_NAME = "app-update.yml";
const UPDATE_CONFIG_REPAIR_FAILURE_MESSAGE = "Automatic updates are unavailable because the local update configuration is corrupted. Reinstall Githead to repair the installation.";
const UPDATE_CONFIG_REPAIRED_RESTART_MESSAGE = "Could not check for updates because the local update configuration is corrupted. Githead tried to repair it; restart Githead and check again.";
const UPDATE_CONFIG_REPAIR_INSTALL_MESSAGE = "Could not check for updates because the local update configuration is corrupted. Reinstall Githead to repair the installation.";
const EXPECTED_UPDATE_CONFIG = [
  `provider: ${UPDATE_PROVIDER}`,
  `url: ${UPDATE_FEED_URL}`,
  `updaterCacheDirName: ${UPDATE_CACHE_DIR_NAME}`,
  ""
].join("\n");

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  updateConfigPath?: string | null;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(eventName: string, listener: (...args: unknown[]) => void): this;
}

interface AppUpdateRuntime {
  getVersion(): string;
  isPackaged: boolean;
}

interface UpdateConfigHealth {
  exists: boolean;
  readable: boolean;
  hasNullBytes: boolean;
  hasExpectedProvider: boolean;
  hasExpectedUrl: boolean;
  hasExpectedCacheDir: boolean;
}

interface ReleaseNotesResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type ReleaseNotesFetch = (
  url: string,
  init: { headers: Record<string, string> }
) => Promise<ReleaseNotesResponseLike>;

export interface AppUpdateServiceOptions {
  runtime?: AppUpdateRuntime;
  updater?: AutoUpdaterLike;
  releaseNotesFetch?: ReleaseNotesFetch;
  getWindows: () => BrowserWindow[];
  startupDelayMs?: number;
  pollIntervalMs?: number;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  appImagePath?: string | undefined;
  disabledByEnv?: boolean;
  clock?: () => Date;
}

export class AppUpdateService {
  private readonly runtime: AppUpdateRuntime;
  private readonly updater: AutoUpdaterLike;
  private readonly releaseNotesFetch: ReleaseNotesFetch;
  private readonly getWindows: () => BrowserWindow[];
  private readonly startupDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly resourcesPath: string;
  private readonly platform: NodeJS.Platform;
  private readonly appImagePath: string | undefined;
  private readonly disabledByEnv: boolean;
  private readonly clock: () => Date;
  private state: AppUpdateState;
  private configured = false;
  private checkInFlight = false;
  private downloadInFlight = false;
  private installInFlight = false;
  private releaseNotesInFlightVersion: string | null = null;
  private releaseNotesRequestId = 0;
  private startupTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private repairedUpdateConfigThisSession = false;

  constructor(options: AppUpdateServiceOptions) {
    this.runtime = options.runtime ?? app;
    this.updater = options.updater ?? autoUpdater;
    this.releaseNotesFetch = options.releaseNotesFetch ?? fetchReleaseNotesResponse;
    this.getWindows = options.getWindows;
    this.startupDelayMs = options.startupDelayMs ?? STARTUP_CHECK_DELAY_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? UPDATE_POLL_INTERVAL_MS;
    this.resourcesPath = options.resourcesPath ?? getElectronResourcesPath();
    this.platform = options.platform ?? process.platform;
    this.appImagePath = "appImagePath" in options ? options.appImagePath : process.env.APPIMAGE;
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
      await this.checkForUpdatesWithRepair();
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
    if (!this.runtime.isPackaged) {
      return "Automatic updates are only available in packaged production builds.";
    }

    if (this.disabledByEnv) {
      return "Automatic updates are disabled by GITHEAD_DISABLE_AUTO_UPDATE.";
    }

    if (this.platform === "linux" && !this.appImagePath) {
      return "Automatic updates are only available for Linux AppImage builds.";
    }

    if (this.platform !== "win32" && this.platform !== "linux") {
      return "Automatic updates are only available for Windows and Linux AppImage builds.";
    }

    try {
      await ensureHealthyUpdateConfig(this.resourcesPath);
      this.refreshUpdaterConfigPath();
    } catch {
      return UPDATE_CONFIG_REPAIR_FAILURE_MESSAGE;
    }

    return null;
  }

  private async checkForUpdatesWithRepair(): Promise<void> {
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      if (!(await this.tryRepairCorruptedUpdateConfig(error))) {
        throw error;
      }

      await this.updater.checkForUpdates();
    }
  }

  private async tryRepairCorruptedUpdateConfig(error: unknown): Promise<boolean> {
    if (this.repairedUpdateConfigThisSession || !isRepairableUpdateConfigError(error)) {
      return false;
    }

    const health = await readUpdateConfigHealth(this.resourcesPath);
    if (isHealthyUpdateConfig(health)) {
      return false;
    }

    this.repairedUpdateConfigThisSession = true;

    try {
      await repairUpdateConfig(this.resourcesPath);
      this.refreshUpdaterConfigPath();
      return true;
    } catch (repairError) {
      throw new UpdateConfigRepairError(repairError);
    }
  }

  private refreshUpdaterConfigPath(): void {
    this.updater.updateConfigPath = getUpdateConfigPath(this.resourcesPath);
  }

  private registerUpdaterEvents(): void {
    this.updater.on("checking-for-update", () => {
      if (!this.checkInFlight) {
        this.setState(reduceAppUpdateStateOnCheckStart(this.state, this.now()));
      }
    });

    this.updater.on("update-available", (info) => {
      const version = readUpdateVersion(info);
      this.setState(reduceAppUpdateStateOnUpdateAvailable(this.state, version, this.now()));
      void this.loadReleaseNotes(version);
    });

    this.updater.on("update-not-available", () => {
      this.setState(reduceAppUpdateStateOnNoUpdate(this.state, this.now()));
    });

    this.updater.on("download-progress", (progress) => {
      this.setState(reduceAppUpdateStateOnDownloadProgress(this.state, readDownloadPercent(progress)));
    });

    this.updater.on("update-downloaded", (info) => {
      const version = readUpdateVersion(info);
      this.setState(reduceAppUpdateStateOnDownloadComplete(this.state, version));
      void this.loadReleaseNotes(version);
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

  private async loadReleaseNotes(version: string): Promise<void> {
    if (version === "unknown") {
      return;
    }

    if (this.releaseNotesInFlightVersion === version) {
      return;
    }

    if (!this.state.releaseNotes || this.state.releaseNotes.version !== version || !this.state.releaseNotes.loading) {
      return;
    }

    this.releaseNotesInFlightVersion = version;
    const requestId = ++this.releaseNotesRequestId;

    try {
      const releaseNotes = await fetchGitHubReleaseNotes(version, this.releaseNotesFetch);
      if (this.releaseNotesRequestId === requestId) {
        this.setState(reduceAppUpdateStateOnReleaseNotesLoaded(this.state, releaseNotes));
      }
    } catch (error) {
      if (this.releaseNotesRequestId === requestId) {
        this.setState(reduceAppUpdateStateOnReleaseNotesFailure(
          this.state,
          version,
          getReleaseNotesErrorMessage(error)
        ));
      }
    } finally {
      if (this.releaseNotesRequestId === requestId) {
        this.releaseNotesInFlightVersion = null;
      }
    }
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

function getUpdateConfigPath(resourcesPath: string): string {
  return path.join(resourcesPath, UPDATE_CONFIG_FILE_NAME);
}

async function ensureHealthyUpdateConfig(resourcesPath: string): Promise<void> {
  const health = await readUpdateConfigHealth(resourcesPath);
  if (isHealthyUpdateConfig(health)) {
    return;
  }

  await repairUpdateConfig(resourcesPath);
}

async function readUpdateConfigHealth(resourcesPath: string): Promise<UpdateConfigHealth> {
  try {
    const content = await fs.readFile(getUpdateConfigPath(resourcesPath));
    const text = content.toString("utf8");

    return {
      exists: true,
      readable: true,
      hasNullBytes: content.includes(0),
      hasExpectedProvider: hasYamlStringProperty(text, "provider", UPDATE_PROVIDER),
      hasExpectedUrl: hasYamlStringProperty(text, "url", UPDATE_FEED_URL),
      hasExpectedCacheDir: hasYamlStringProperty(text, "updaterCacheDirName", UPDATE_CACHE_DIR_NAME)
    };
  } catch (error) {
    return {
      exists: !isMissingFileError(error),
      readable: false,
      hasNullBytes: false,
      hasExpectedProvider: false,
      hasExpectedUrl: false,
      hasExpectedCacheDir: false
    };
  }
}

function isHealthyUpdateConfig(health: UpdateConfigHealth): boolean {
  return (
    health.exists &&
    health.readable &&
    !health.hasNullBytes &&
    health.hasExpectedProvider &&
    health.hasExpectedUrl &&
    health.hasExpectedCacheDir
  );
}

async function repairUpdateConfig(resourcesPath: string): Promise<void> {
  const updateConfigPath = getUpdateConfigPath(resourcesPath);
  const tempPath = path.join(
    resourcesPath,
    `${UPDATE_CONFIG_FILE_NAME}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  let file: Awaited<ReturnType<typeof fs.open>> | null = null;

  try {
    file = await fs.open(tempPath, "w");
    await file.writeFile(EXPECTED_UPDATE_CONFIG, "utf8");
    await file.sync();
    await file.close();
    file = null;
    await fs.rename(tempPath, updateConfigPath);
  } catch (error) {
    if (file) {
      await file.close().catch(() => undefined);
    }

    await fs.rm(tempPath, {
      force: true
    }).catch(() => undefined);
    throw error;
  }
}

function hasYamlStringProperty(text: string, property: string, expectedValue: string): boolean {
  const pattern = new RegExp(`^\\s*${escapeRegExp(property)}\\s*:\\s*['"]?${escapeRegExp(expectedValue)}['"]?\\s*$`, "m");
  return pattern.test(text);
}

function isMissingFileError(error: unknown): boolean {
  return isErrorWithCode(error, "ENOENT");
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getElectronResourcesPath(): string {
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  return electronProcess.resourcesPath ?? path.dirname(app.getPath("exe"));
}

async function fetchGitHubReleaseNotes(
  version: string,
  releaseNotesFetch: ReleaseNotesFetch
): Promise<AppUpdateReleaseNotes> {
  const response = await releaseNotesFetch(`${GITHEAD_RELEASES_API_BASE}/${encodeURIComponent(`v${version}`)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Githead"
    }
  });

  if (!response.ok) {
    throw new ReleaseNotesRequestError(response.status);
  }

  const payload = await response.json();

  return {
    version,
    url: readStringProperty(payload, "html_url"),
    title: readStringProperty(payload, "name") || readStringProperty(payload, "tag_name"),
    body: readStringProperty(payload, "body"),
    loading: false,
    error: null
  };
}

async function fetchReleaseNotesResponse(
  url: string,
  init: { headers: Record<string, string> }
): Promise<ReleaseNotesResponseLike> {
  return fetch(url, init);
}

class ReleaseNotesRequestError extends Error {
  constructor(readonly status: number) {
    super(`Release notes request failed with status ${status}.`);
  }
}

class UpdateConfigRepairError extends Error {
  constructor(readonly cause: unknown) {
    super("Local update configuration repair failed.");
  }
}

function getReleaseNotesErrorMessage(error: unknown): string {
  if (error instanceof ReleaseNotesRequestError) {
    if (error.status === 404) {
      return "Release notes are not published for this version.";
    }

    if (error.status === 401 || error.status === 403) {
      return "GitHub release notes are not publicly available.";
    }
  }

  return "Could not load release notes. Check your network connection and try again.";
}

function getUpdateErrorMessage(context: NonNullable<AppUpdateErrorContext>, error: unknown): string {
  const rawMessage = getRawErrorMessage(error);
  const lowerMessage = rawMessage.toLocaleLowerCase();
  const action = context === "check"
    ? "check for updates"
    : context === "download"
      ? "download the update"
      : "install the update";

  if (error instanceof UpdateConfigRepairError) {
    return UPDATE_CONFIG_REPAIR_INSTALL_MESSAGE;
  }

  if (isRepairableUpdateConfigError(error)) {
    return UPDATE_CONFIG_REPAIRED_RESTART_MESSAGE;
  }

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

function isRepairableUpdateConfigError(error: unknown): boolean {
  const lowerMessage = getRawErrorMessage(error).toLocaleLowerCase();
  return (
    lowerMessage.includes("null byte") ||
    lowerMessage.includes("cannot parse update info") ||
    lowerMessage.includes("app-update.yml") ||
    lowerMessage.includes("update config") ||
    (
      lowerMessage.includes("yaml") &&
      (lowerMessage.includes("update") || lowerMessage.includes("latest.yml") || lowerMessage.includes("latest-linux.yml"))
    )
  );
}

function getRawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "An unknown update error occurred.");
}

function sanitizeUpdateErrorMessage(message: string): string {
  return message
    .replaceAll(String.fromCharCode(0), "")
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

function readStringProperty(value: unknown, property: string): string | null {
  if (!value || typeof value !== "object" || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" && propertyValue.trim() ? propertyValue : null;
}
