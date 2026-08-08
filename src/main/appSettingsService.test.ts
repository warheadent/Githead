import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  AppSettingsService,
  DEFAULT_CODE_FONT,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
  DEFAULT_COLOR_THEME,
  DEFAULT_UI_FONT,
  DEFAULT_STATUS_FILE_VIEW_MODE,
  DEFAULT_TAG_PUSH_BEHAVIOR,
  DEFAULT_WRAP_DIFF_LINES,
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
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      });
    });
  });

  it("migrates missing and invalid Git Behaviors values to push all tags", async () => {
    await withTempDir(async (dir) => {
      const settingsPath = path.join(dir, "app-settings.json");

      await fs.writeFile(settingsPath, JSON.stringify({ colorTheme: "orchid" }), "utf8");
      await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
        colorTheme: "orchid",
        gitBehaviors: { tagPushBehavior: "all" }
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        colorTheme: "tidepool",
        gitBehaviors: { tagPushBehavior: "everything" }
      }), "utf8");
      await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
        colorTheme: "tidepool",
        gitBehaviors: { tagPushBehavior: "all" }
      });
    });
  });

  it("saves and reloads every tag push behavior without changing unrelated settings", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      for (const tagPushBehavior of ["all", "follow", "none"] as const) {
        const saved = await service.saveSettings({
          autoFetchIntervalMinutes: 37,
          colorTheme: "copper",
          appearanceMode: "dark",
          uiFont: "roboto",
          codeFont: "fira-code",
          zoomFactor: 1.25,
          statusFileViewMode: "tree",
          wrapDiffLines: true,
          gitBehaviors: { tagPushBehavior }
        });

        expect(saved).toMatchObject({
          autoFetchIntervalMinutes: 37,
          colorTheme: "copper",
          appearanceMode: "dark",
          uiFont: "roboto",
          codeFont: "fira-code",
          zoomFactor: 1.25,
          statusFileViewMode: "tree",
          wrapDiffLines: true,
          gitBehaviors: { tagPushBehavior }
        });
        await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
          gitBehaviors: { tagPushBehavior }
        });
      }
    });
  });

  it("preserves Git Behaviors when an older save request omits the category", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1,
        gitBehaviors: { tagPushBehavior: "follow" }
      });

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        zoomFactor: 1.1
      })).resolves.toMatchObject({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        gitBehaviors: { tagPushBehavior: "follow" }
      });
    });
  });

  it("rejects an invalid tag push behavior when saving", async () => {
    await withTempDir(async (dir) => {
      await expect(new AppSettingsService(dir).saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        zoomFactor: 1,
        gitBehaviors: { tagPushBehavior: "invalid" as "all" }
      })).rejects.toThrow("Unknown tag push behavior.");
    });
  });

  it("saves and reloads a custom auto-fetch interval", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        uiFont: "roboto",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "list",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      })).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        uiFont: "roboto",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "list",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      });

      await expect(new AppSettingsService(dir).getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        uiFont: "roboto",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "list",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
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
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: 1,
        statusFileViewMode: "list",
        wrapDiffLines: false,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      })).resolves.toEqual({
        autoFetchIntervalMinutes: 0,
        colorTheme: "githead",
        appearanceMode: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: 1,
        statusFileViewMode: "list",
        wrapDiffLines: false,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
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
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: "10",
        wrapDiffLines: "yes"
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: 1441
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
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
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
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
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR }
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

  it("defaults unknown stored fonts and rejects unknown fonts on save", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify({
        uiFont: "comic-sans",
        codeFont: "papyrus"
      }), "utf8");
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toMatchObject({
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT
      });
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        uiFont: "comic-sans" as "inter",
        codeFont: "system-mono",
        zoomFactor: 1
      })).rejects.toThrow("Unknown interface font.");
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        uiFont: "inter",
        codeFont: "papyrus" as "system-mono",
        zoomFactor: 1
      })).rejects.toThrow("Unknown code font.");
    });
  });
});
