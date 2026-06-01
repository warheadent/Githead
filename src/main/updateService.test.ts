import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";
import type { AppUpdateState } from "../shared/types";
import { AppUpdateService, type AutoUpdaterLike } from "./updateService";

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

async function createServiceFixture(resourcesPath: string): Promise<ServiceFixture> {
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
    platform: "win32",
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
