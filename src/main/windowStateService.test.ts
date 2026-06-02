import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Rectangle } from "electron";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_BOUNDS,
  MIN_WINDOW_BOUNDS,
  restoreWindowState,
  WindowStateService
} from "./windowStateService";

const primaryWorkArea: Rectangle = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1040
};

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-window-state-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("WindowStateService", () => {
  it("uses default bounds when no window state file exists", async () => {
    await withTempDir(async (dir) => {
      const service = new WindowStateService(dir);

      await expect(service.getWindowState([
        primaryWorkArea
      ])).resolves.toEqual({
        bounds: DEFAULT_WINDOW_BOUNDS,
        isMaximized: false
      });
    });
  });

  it("uses default bounds for corrupt or invalid stored state", async () => {
    await withTempDir(async (dir) => {
      const service = new WindowStateService(dir);
      const statePath = path.join(dir, "window-state.json");

      await fs.writeFile(statePath, "{bad json", "utf8");
      await expect(service.getWindowState([
        primaryWorkArea
      ])).resolves.toEqual({
        bounds: DEFAULT_WINDOW_BOUNDS,
        isMaximized: false
      });

      await fs.writeFile(statePath, JSON.stringify({ x: 10, y: 10 }), "utf8");
      await expect(service.getWindowState([
        primaryWorkArea
      ])).resolves.toEqual({
        bounds: DEFAULT_WINDOW_BOUNDS,
        isMaximized: false
      });
    });
  });

  it("restores visible bounds and maximized state", async () => {
    await withTempDir(async (dir) => {
      const service = new WindowStateService(dir);
      await fs.writeFile(
        path.join(dir, "window-state.json"),
        JSON.stringify({
          x: 120,
          y: 90,
          width: 1300,
          height: 820,
          isMaximized: true
        }),
        "utf8"
      );

      await expect(service.getWindowState([
        primaryWorkArea
      ])).resolves.toEqual({
        bounds: {
          x: 120,
          y: 90,
          width: 1300,
          height: 820
        },
        isMaximized: true
      });
    });
  });

  it("clamps bounds to the visible work area", () => {
    expect(restoreWindowState({
      x: -60,
      y: -40,
      width: 2200,
      height: 1300,
      isMaximized: false
    }, [
      {
        x: 0,
        y: 0,
        width: 1200,
        height: 800
      }
    ])).toEqual({
      bounds: {
        x: 0,
        y: 0,
        width: 1200,
        height: 800
      },
      isMaximized: false
    });
  });

  it("does not restore an off-screen position after display changes", () => {
    expect(restoreWindowState({
      x: 5000,
      y: 5000,
      width: 1100,
      height: 720,
      isMaximized: false
    }, [
      primaryWorkArea
    ])).toEqual({
      bounds: {
        width: 1100,
        height: 720
      },
      isMaximized: false
    });
  });

  it("supports negative coordinates for displays to the left of the primary display", () => {
    expect(restoreWindowState({
      x: -1480,
      y: 120,
      width: 1000,
      height: 720,
      isMaximized: false
    }, [
      primaryWorkArea,
      {
        x: -1600,
        y: 0,
        width: 1600,
        height: 900
      }
    ])).toEqual({
      bounds: {
        x: -1480,
        y: 120,
        width: 1000,
        height: 720
      },
      isMaximized: false
    });
  });

  it("clamps restored defaults to the minimum window size", () => {
    expect(restoreWindowState(null, [
      {
        x: 0,
        y: 0,
        width: 640,
        height: 480
      }
    ])).toEqual({
      bounds: MIN_WINDOW_BOUNDS,
      isMaximized: false
    });
  });

  it("keeps oversized minimum windows anchored inside very small work areas", () => {
    expect(restoreWindowState({
      x: 20,
      y: 30,
      width: 1000,
      height: 800,
      isMaximized: false
    }, [
      {
        x: 0,
        y: 0,
        width: 640,
        height: 480
      }
    ])).toEqual({
      bounds: {
        x: 0,
        y: 0,
        ...MIN_WINDOW_BOUNDS
      },
      isMaximized: false
    });
  });

  it("saves normal bounds and maximized state", async () => {
    await withTempDir(async (dir) => {
      const service = new WindowStateService(dir);

      expect(service.saveWindowStateNow({
        getBounds: () => ({
          x: 0,
          y: 0,
          width: 1920,
          height: 1040
        }),
        getNormalBounds: () => ({
          x: 150,
          y: 100,
          width: 1260,
          height: 820
        }),
        isFullScreen: () => false,
        isMaximized: () => true,
        isMinimized: () => false
      })).toBe(true);

      await expect(fs.readFile(path.join(dir, "window-state.json"), "utf8"))
        .resolves.toBe(`${JSON.stringify({
          x: 150,
          y: 100,
          width: 1260,
          height: 820,
          isMaximized: true
        }, null, 2)}\n`);
    });
  });
});
