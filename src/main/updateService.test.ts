import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";
import type { AppUpdateState } from "../shared/types";
import { AppUpdateService, type AppUpdateServiceOptions, type AutoUpdaterLike } from "./updateService";

class FakeUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(null);
  downloadUpdate = vi.fn<() => Promise<unknown>>().mockResolvedValue([]);
  quitAndInstall = vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>();

  override on(eventName: string, listener: (...args: unknown[]) => void): this {
    super.on(eventName, listener);
    return this;
  }
}

interface ServiceFixture {
  service: AppUpdateService;
  updater: FakeUpdater;
  send: ReturnType<typeof vi.fn>;
}

interface ServiceFixtureOptions {
  appImagePath?: string;
  platform?: NodeJS.Platform;
  releaseNotesFetch?: AppUpdateServiceOptions["releaseNotesFetch"];
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-updater-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

async function createServiceFixture(
  resourcesPath: string,
  options: ServiceFixtureOptions = {}
): Promise<ServiceFixture> {
  await fs.writeFile(path.join(resourcesPath, "app-update.yml"), "provider: github\n", "utf8");
  const updater = new FakeUpdater();
  const send = vi.fn();
  const window = {
    webContents: {
      send
    }
  } as unknown as BrowserWindow;
  const service = new AppUpdateService({
    runtime: {
      getVersion: () => "0.1.0",
      isPackaged: true
    },
    updater,
    getWindows: () => [window],
    resourcesPath,
    platform: options.platform ?? "win32",
    appImagePath: options.appImagePath,
    ...(options.releaseNotesFetch ? { releaseNotesFetch: options.releaseNotesFetch } : {}),
    startupDelayMs: 60_000,
    pollIntervalMs: 60_000,
    clock: () => new Date("2026-05-31T10:00:00Z")
  });

  await service.configure();
  return {
    service,
    updater,
    send
  };
}

function createReleaseNotesFetch(response: unknown, status = 200): NonNullable<AppUpdateServiceOptions["releaseNotesFetch"]> {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response
  }));
}

async function waitForUpdateState(
  service: AppUpdateService,
  predicate: (state: AppUpdateState) => boolean
): Promise<AppUpdateState> {
  for (let index = 0; index < 20; index += 1) {
    const state = service.getState();
    if (predicate(state)) {
      return state;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return service.getState();
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("AppUpdateService", () => {
  it("stays disabled when no packaged update feed is available", async () => {
    await withTempDir(async (dir) => {
      const updater = new FakeUpdater();
      const service = new AppUpdateService({
        runtime: {
          getVersion: () => "0.1.0",
          isPackaged: true
        },
        updater,
        getWindows: () => [],
        resourcesPath: dir,
        platform: "win32"
      });

      await expect(service.configure()).resolves.toMatchObject({
        enabled: false,
        status: "disabled",
        message: "Automatic updates are not available because no update feed is configured."
      });
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      service.stop();
    });
  });

  it("stays disabled for packaged Linux builds that are not AppImages", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-update.yml"), "provider: github\n", "utf8");
      const updater = new FakeUpdater();
      const service = new AppUpdateService({
        runtime: {
          getVersion: () => "0.1.0",
          isPackaged: true
        },
        updater,
        getWindows: () => [],
        resourcesPath: dir,
        platform: "linux"
      });

      await expect(service.configure()).resolves.toMatchObject({
        enabled: false,
        status: "disabled",
        message: "Automatic updates are only available for Linux AppImage builds."
      });
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      service.stop();
    });
  });

  it("stays disabled for unsupported packaged platforms", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-update.yml"), "provider: github\n", "utf8");
      const updater = new FakeUpdater();
      const service = new AppUpdateService({
        runtime: {
          getVersion: () => "0.1.0",
          isPackaged: true
        },
        updater,
        getWindows: () => [],
        resourcesPath: dir,
        platform: "darwin"
      });

      await expect(service.configure()).resolves.toMatchObject({
        enabled: false,
        status: "disabled",
        message: "Automatic updates are only available for Windows and Linux AppImage builds."
      });
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      service.stop();
    });
  });

  it("configures manual update behavior and emits initial state", async () => {
    await withTempDir(async (dir) => {
      const { service, updater, send } = await createServiceFixture(dir);

      expect(updater.autoDownload).toBe(false);
      expect(updater.autoInstallOnAppQuit).toBe(false);
      expect(updater.allowPrerelease).toBe(false);
      expect(service.getState()).toMatchObject({
        enabled: true,
        status: "idle",
        currentVersion: "0.1.0"
      });
      expect(send).toHaveBeenCalledWith(IPC_CHANNELS.updateState, service.getState());
      service.stop();
    });
  });

  it("configures manual update behavior for Linux AppImage builds", async () => {
    await withTempDir(async (dir) => {
      const { service, updater, send } = await createServiceFixture(dir, {
        appImagePath: "/tmp/Githead.AppImage",
        platform: "linux"
      });

      expect(updater.autoDownload).toBe(false);
      expect(updater.autoInstallOnAppQuit).toBe(false);
      expect(updater.allowPrerelease).toBe(false);
      expect(service.getState()).toMatchObject({
        enabled: true,
        status: "idle",
        currentVersion: "0.1.0"
      });
      expect(send).toHaveBeenCalledWith(IPC_CHANNELS.updateState, service.getState());
      service.stop();
    });
  });

  it("moves to available when an update is found", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit("update-available", {
          version: "0.1.1"
        });
      });

      await expect(service.checkForUpdates()).resolves.toMatchObject({
        checked: true,
        state: {
          status: "available",
          availableVersion: "0.1.1",
          checkedAt: "2026-05-31T10:00:00.000Z"
        }
      });
      service.stop();
    });
  });

  it("loads GitHub release notes when an update is found", async () => {
    await withTempDir(async (dir) => {
      const releaseNotesFetch = createReleaseNotesFetch({
        html_url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1",
        name: "Githead 0.1.1",
        body: "## Changes\n\n- Faster updates"
      });
      const { service, updater } = await createServiceFixture(dir, { releaseNotesFetch });
      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit("update-available", {
          version: "0.1.1"
        });
      });

      await service.checkForUpdates();

      expect(service.getState()).toMatchObject({
        status: "available",
        releaseNotes: {
          version: "0.1.1",
          loading: true
        }
      });
      const state = await waitForUpdateState(service, (nextState) => nextState.releaseNotes?.loading === false);
      expect(releaseNotesFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/warheadent/Githead/releases/tags/v0.1.1",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Githead"
          }
        }
      );
      expect(state).toMatchObject({
        status: "available",
        availableVersion: "0.1.1",
        releaseNotes: {
          version: "0.1.1",
          url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1",
          title: "Githead 0.1.1",
          body: "## Changes\n\n- Faster updates",
          loading: false,
          error: null
        }
      });
      service.stop();
    });
  });

  it("keeps update status available when release notes fail to load", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir, {
        releaseNotesFetch: createReleaseNotesFetch({
          message: "Not Found"
        }, 404)
      });
      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit("update-available", {
          version: "0.1.1"
        });
      });

      await service.checkForUpdates();

      const state = await waitForUpdateState(service, (nextState) => nextState.releaseNotes?.loading === false);
      expect(state).toMatchObject({
        status: "available",
        availableVersion: "0.1.1",
        releaseNotes: {
          version: "0.1.1",
          loading: false,
          error: "Release notes are not published for this version."
        }
      });
      service.stop();
    });
  });

  it("ignores stale release notes when a newer update arrives", async () => {
    await withTempDir(async (dir) => {
      const first = createDeferred<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
      }>();
      const releaseNotesFetch = vi.fn<NonNullable<AppUpdateServiceOptions["releaseNotesFetch"]>>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            html_url: "https://github.com/warheadent/Githead/releases/tag/v0.1.2",
            name: "Githead 0.1.2",
            body: "Newer notes"
          })
        });
      const { service, updater } = await createServiceFixture(dir, { releaseNotesFetch });

      updater.emit("update-available", {
        version: "0.1.1"
      });
      updater.emit("update-available", {
        version: "0.1.2"
      });

      const newerState = await waitForUpdateState(service, (nextState) => (
        nextState.releaseNotes?.version === "0.1.2" &&
        nextState.releaseNotes.loading === false
      ));
      first.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          html_url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1",
          name: "Githead 0.1.1",
          body: "Stale notes"
        })
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(newerState.releaseNotes).toMatchObject({
        version: "0.1.2",
        title: "Githead 0.1.2",
        body: "Newer notes"
      });
      expect(service.getState().releaseNotes).toMatchObject({
        version: "0.1.2",
        title: "Githead 0.1.2",
        body: "Newer notes"
      });
      service.stop();
    });
  });

  it("keeps release notes when the same version finishes downloading", async () => {
    await withTempDir(async (dir) => {
      const releaseNotesFetch = createReleaseNotesFetch({
        html_url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1",
        name: "Githead 0.1.1",
        body: "Downloaded notes"
      });
      const { service, updater } = await createServiceFixture(dir, { releaseNotesFetch });
      updater.emit("update-available", {
        version: "0.1.1"
      });
      await waitForUpdateState(service, (nextState) => nextState.releaseNotes?.loading === false);
      updater.downloadUpdate.mockImplementation(async () => {
        updater.emit("update-downloaded", {
          version: "0.1.1"
        });
      });

      await service.downloadUpdate();

      expect(service.getState()).toMatchObject({
        status: "downloaded",
        downloadedVersion: "0.1.1",
        releaseNotes: {
          version: "0.1.1",
          title: "Githead 0.1.1",
          body: "Downloaded notes",
          loading: false
        }
      });
      expect(releaseNotesFetch).toHaveBeenCalledTimes(1);
      service.stop();
    });
  });

  it("moves to up-to-date when no update is available", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit("update-not-available", {
          version: "0.1.0"
        });
      });

      await expect(service.checkForUpdates()).resolves.toMatchObject({
        checked: true,
        state: {
          status: "up-to-date",
          availableVersion: null,
          downloadedVersion: null
        }
      });
      service.stop();
    });
  });

  it("tracks download progress and downloaded updates", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.emit("update-available", {
        version: "0.1.1"
      });
      updater.downloadUpdate.mockImplementation(async () => {
        updater.emit("download-progress", {
          percent: 44.8
        });
        updater.emit("update-downloaded", {
          version: "0.1.1"
        });
      });

      await expect(service.downloadUpdate()).resolves.toMatchObject({
        accepted: true,
        completed: true,
        state: {
          status: "downloaded",
          downloadedVersion: "0.1.1",
          downloadPercent: 100
        }
      });
      service.stop();
    });
  });

  it("records check failures as retryable errors", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.checkForUpdates.mockRejectedValue(new Error("network unavailable"));

      await expect(service.checkForUpdates()).resolves.toMatchObject({
        checked: true,
        state: {
          status: "error",
          message: "Could not check for updates. Check your network connection and try again.",
          errorContext: "check",
          canRetry: true
        } satisfies Partial<AppUpdateState>
      });
      service.stop();
    });
  });

  it("keeps a failed download retryable when the update remains available", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.emit("update-available", {
        version: "0.1.1"
      });
      updater.downloadUpdate.mockRejectedValue(new Error("download failed"));

      await expect(service.downloadUpdate()).resolves.toMatchObject({
        accepted: true,
        completed: false,
        state: {
          status: "available",
          availableVersion: "0.1.1",
          message: "Could not download the update. download failed",
          errorContext: "download",
          canRetry: true
        }
      });
      service.stop();
    });
  });

  it("keeps a failed install retryable from the downloaded state", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.emit("update-downloaded", {
        version: "0.1.1"
      });
      updater.quitAndInstall.mockImplementation(() => {
        throw new Error("install failed");
      });

      await expect(service.installUpdate()).resolves.toMatchObject({
        accepted: true,
        completed: false,
        state: {
          status: "downloaded",
          message: "Could not install the update. install failed",
          errorContext: "install",
          canRetry: true
        }
      });
      expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
      service.stop();
    });
  });

  it("sanitizes GitHub 404 updater errors before exposing them to the renderer", async () => {
    await withTempDir(async (dir) => {
      const { service, updater } = await createServiceFixture(dir);
      updater.checkForUpdates.mockRejectedValue(new Error([
        "404 \"method: GET url: https://github.com/warheadent/Githead/releases.atom",
        "Please double check that your authentication token is correct.\"",
        "Headers: { \"set-cookie\": [\"_gh_sess=secret; logged_in=no\"] }"
      ].join("\n")));

      const result = await service.checkForUpdates();

      expect(result.state).toMatchObject({
        status: "error",
        message: "Could not check for updates. The GitHub release feed is not publicly available yet.",
        errorContext: "check",
        canRetry: true
      });
      expect(result.state.message).not.toContain("_gh_sess");
      expect(result.state.message).not.toContain("Headers:");
      service.stop();
    });
  });
});
