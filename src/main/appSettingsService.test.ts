import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  AppSettingsService,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
  DEFAULT_COLOR_THEME,
  DEFAULT_ZOOM_FACTOR
} from "./appSettingsService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-app-settings-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("AppSettingsService", () => {
  it("uses the default auto-fetch interval when no settings are stored", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });
    });
  });

  it("saves and reloads a custom auto-fetch interval", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        zoomFactor: 1.25
      })).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        zoomFactor: 1.25
      });

      await expect(new AppSettingsService(dir).getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        zoomFactor: 1.25
      });
    });
  });

  it("allows disabling automatic fetch with zero", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 0,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1
      })).resolves.toEqual({
        autoFetchIntervalMinutes: 0,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1
      });
    });
  });

  it("rejects negative intervals", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: -1,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1
      })).rejects.toThrow("Auto-fetch interval cannot be negative.");
    });
  });

  it("rejects intervals above one day", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 1441,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1
      })).rejects.toThrow("Auto-fetch interval cannot exceed 1440 minutes.");
    });
  });

  it("falls back to the default for malformed JSON and invalid stored values", async () => {
    await withTempDir(async (dir) => {
      const settingsPath = path.join(dir, "app-settings.json");
      const service = new AppSettingsService(dir);

      await fs.writeFile(settingsPath, "{", "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: "10"
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: 1441
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });
    });
  });

  it("falls back to Githead for an unknown stored theme", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify({
        autoFetchIntervalMinutes: 20,
        colorTheme: "unknown"
      }), "utf8");

      await expect(new AppSettingsService(dir).getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 20,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });
    });
  });

  it("rejects an unknown theme when saving", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "unknown" as "githead",
        appearanceMode: "system",
        zoomFactor: 1
      })).rejects.toThrow("Unknown color theme.");
    });
  });

  it("defaults unknown appearance modes and rejects them on save", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify({
        autoFetchIntervalMinutes: 10,
        colorTheme: "orchid",
        appearanceMode: "sepia",
        zoomFactor: 99
      }), "utf8");
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 10,
        colorTheme: "orchid",
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "orchid",
        appearanceMode: "sepia" as "system",
        zoomFactor: 1
      })).rejects.toThrow("Unknown appearance mode.");
    });
  });

  it("defaults invalid stored zoom factors and rejects unsupported factors on save", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1.2
      }), "utf8");
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toMatchObject({
        zoomFactor: DEFAULT_ZOOM_FACTOR
      });
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1.2
      })).rejects.toThrow("Unsupported interface scale.");
    });
  });
});
