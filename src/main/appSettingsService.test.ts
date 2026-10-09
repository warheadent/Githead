import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppSettingsSaveRequest } from "../shared/types";
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

describe("remembered clone destination", () => {
  it("survives service restarts and concurrent appearance saves", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const settings = await service.getSettings();
      const destination = path.join(dir, "Code");
      await Promise.all([
        service.rememberCloneParent(destination),
        service.saveSettings({ ...settings, appearanceMode: "dark" })
      ]);
      expect(await new AppSettingsService(dir).getSettings()).toMatchObject({ cloneParentPath: destination, appearanceMode: "dark" });
      await expect(service.rememberCloneParent("relative/path")).rejects.toThrow("absolute destination");
    });
  });
});

describe("AppSettingsService", () => {
  it("uses the default auto-fetch interval when no settings are stored", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
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
          visualEffects: "standard",
          reduceMotion: "system",
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
          visualEffects: "standard",
          reduceMotion: "system",
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

  it("saves the opt-in for cherry-picking commits contained in the current branch", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const saved = await service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1,
        gitBehaviors: {
          tagPushBehavior: "all",
          allowCherryPickingContainedCommits: true
        }
      });

      expect(saved.gitBehaviors).toEqual({
        tagPushBehavior: "all",
        allowCherryPickingContainedCommits: true
      });
      await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
        gitBehaviors: { allowCherryPickingContainedCommits: true }
      });
    });
  });

  it("saves the opt-in and lease duration for checking the upstream before a commit", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const saved = await service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1,
        gitBehaviors: {
          tagPushBehavior: "all",
          requireUpToDateUpstreamBeforeCommit: true,
          remoteCheckLeaseSeconds: 300
        }
      });

      expect(saved.gitBehaviors).toEqual({
        tagPushBehavior: "all",
        requireUpToDateUpstreamBeforeCommit: true,
        remoteCheckLeaseSeconds: 300
      });
      await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
        gitBehaviors: { requireUpToDateUpstreamBeforeCommit: true, remoteCheckLeaseSeconds: 300 }
      });
    });
  });

  it("persists and clears Quick Commit as the default across restarts", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const settings = await service.getSettings();
      expect(settings.gitBehaviors.quickCommitByDefault).toBeUndefined();
      await service.saveSettings({ ...settings, gitBehaviors: { ...settings.gitBehaviors, quickCommitByDefault: true } });
      expect((await new AppSettingsService(dir).getSettings()).gitBehaviors.quickCommitByDefault).toBe(true);
      await service.saveSettings({ ...settings, gitBehaviors: { ...settings.gitBehaviors, quickCommitByDefault: false } });
      expect((await new AppSettingsService(dir).getSettings()).gitBehaviors.quickCommitByDefault).toBeUndefined();
      await expect(service.saveSettings({ ...settings, gitBehaviors: { ...settings.gitBehaviors, quickCommitByDefault: "true" as unknown as boolean } })).rejects.toThrow("Quick Commit default must be a Boolean value.");
    });
  });

  it("preserves Git Behaviors when an older save request omits the category", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1,
        gitBehaviors: { tagPushBehavior: "follow" }
      });

      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1.1
      })).resolves.toMatchObject({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        visualEffects: "standard",
        reduceMotion: "system",
        gitBehaviors: { tagPushBehavior: "follow" }
      });
    });
  });

  it("saves, reloads, and preserves the anonymous diagnostics preference", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1,
        privacy: { shareAnonymousDiagnostics: false }
      })).resolves.toMatchObject({
        privacy: { shareAnonymousDiagnostics: false }
      });

      await expect(new AppSettingsService(dir).getSettings()).resolves.toMatchObject({
        privacy: { shareAnonymousDiagnostics: false }
      });
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1
      })).resolves.toMatchObject({
        privacy: { shareAnonymousDiagnostics: false }
      });
    });
  });

  it("rejects an invalid anonymous diagnostics preference", async () => {
    await withTempDir(async (dir) => {
      await expect(new AppSettingsService(dir).saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 1,
        privacy: { shareAnonymousDiagnostics: "no" as unknown as boolean }
      })).rejects.toThrow("Anonymous diagnostics preference must be a Boolean value.");
    });
  });

  it("rejects an invalid tag push behavior when saving", async () => {
    await withTempDir(async (dir) => {
      await expect(new AppSettingsService(dir).saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: "roboto",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "list",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
      });

      await expect(new AppSettingsService(dir).getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "tidepool",
        appearanceMode: "dark",
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: "roboto",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "list",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: 1,
        statusFileViewMode: "list",
        wrapDiffLines: false,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: "10",
        wrapDiffLines: "yes"
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
      });

      await fs.writeFile(settingsPath, JSON.stringify({
        autoFetchIntervalMinutes: 1441
      }), "utf8");
      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_INTERVAL_MINUTES,
        colorTheme: DEFAULT_COLOR_THEME,
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
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
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
      });
    });
  });

  it("recovers invalid stored fields without discarding valid fields in the same category", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify({
        autoFetchIntervalMinutes: 15,
        colorTheme: "copper",
        appearanceMode: "sepia",
        visualEffects: "full",
        reduceMotion: null,
        uiFont: "unknown",
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "tree",
        wrapDiffLines: "true",
        gitBehaviors: {
          tagPushBehavior: "invalid",
          allowCherryPickingContainedCommits: true,
          requireUpToDateUpstreamBeforeCommit: "true",
          quickCommitByDefault: false,
          remoteCheckLeaseSeconds: 0,
          futurePreference: true
        },
        privacy: { shareAnonymousDiagnostics: false, futurePreference: true },
        futureCategory: { enabled: true }
      }), "utf8");

      await expect(new AppSettingsService(dir).getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 15,
        colorTheme: "copper",
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        visualEffects: "full",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: "fira-code",
        zoomFactor: 1.25,
        statusFileViewMode: "tree",
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: {
          tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR,
          allowCherryPickingContainedCommits: true,
          remoteCheckLeaseSeconds: 0
        },
        privacy: { shareAnonymousDiagnostics: false }
      });
    });
  });

  it("keeps the different omission rules for older save requests", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await service.saveSettings({
        ...await service.getSettings(),
        visualEffects: "full",
        reduceMotion: "always",
        uiFont: "roboto",
        codeFont: "fira-code",
        statusFileViewMode: "tree",
        wrapDiffLines: true,
        gitBehaviors: { tagPushBehavior: "none", quickCommitByDefault: true, remoteCheckLeaseSeconds: 0 },
        privacy: { shareAnonymousDiagnostics: false }
      });

      const saved = await service.saveSettings({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        zoomFactor: 1.1
      });
      expect(saved).toEqual({
        autoFetchIntervalMinutes: 20,
        colorTheme: "orchid",
        appearanceMode: "light",
        zoomFactor: 1.1,
        visualEffects: "full",
        reduceMotion: "always",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: "none", quickCommitByDefault: true, remoteCheckLeaseSeconds: 0 },
        privacy: { shareAnonymousDiagnostics: false }
      });
      expect(await fs.readFile(path.join(dir, "app-settings.json"), "utf8")).toBe(`${JSON.stringify(saved, null, 2)}\n`);
    });
  });

  it("omits disabled Git behavior flags from disk while preserving a zero lease", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await service.saveSettings({
        ...await service.getSettings(),
        gitBehaviors: {
          tagPushBehavior: "follow",
          quickCommitByDefault: false,
          allowCherryPickingContainedCommits: false,
          requireUpToDateUpstreamBeforeCommit: false,
          remoteCheckLeaseSeconds: 0
        }
      });
      const stored = JSON.parse(await fs.readFile(path.join(dir, "app-settings.json"), "utf8"));
      expect(stored.gitBehaviors).toEqual({ tagPushBehavior: "follow", remoteCheckLeaseSeconds: 0 });
      expect((await new AppSettingsService(dir).getSettings()).gitBehaviors).toEqual(stored.gitBehaviors);
    });
  });

  it.each<{ name: string; overrides: Record<string, unknown>; message: string }>([
    { name: "missing theme", overrides: { colorTheme: undefined }, message: "Unknown color theme." },
    { name: "missing appearance mode", overrides: { appearanceMode: undefined }, message: "Unknown appearance mode." },
    { name: "missing zoom", overrides: { zoomFactor: undefined }, message: "Unsupported interface scale." },
    { name: "null interface font", overrides: { uiFont: null }, message: "Unknown interface font." },
    { name: "null code font", overrides: { codeFont: null }, message: "Unknown code font." },
    { name: "null file view", overrides: { statusFileViewMode: null }, message: "Unknown status file view mode." },
    { name: "null line wrap", overrides: { wrapDiffLines: null }, message: "Diff line wrap must be a Boolean value." },
    { name: "null Git behaviors", overrides: { gitBehaviors: null }, message: "Unknown tag push behavior." },
    { name: "null Quick Commit", overrides: { gitBehaviors: { tagPushBehavior: "all", quickCommitByDefault: null } }, message: "Quick Commit default must be a Boolean value." },
    { name: "numeric cherry-pick preference", overrides: { gitBehaviors: { tagPushBehavior: "all", allowCherryPickingContainedCommits: 1 } }, message: "Cherry-pick contained commit behavior must be a Boolean value." },
    { name: "string upstream preference", overrides: { gitBehaviors: { tagPushBehavior: "all", requireUpToDateUpstreamBeforeCommit: "true" } }, message: "Pre-commit upstream behavior must be a Boolean value." },
    { name: "string lease duration", overrides: { gitBehaviors: { tagPushBehavior: "all", remoteCheckLeaseSeconds: "300" } }, message: "Unknown remote check reuse duration." },
    { name: "null privacy", overrides: { privacy: null }, message: "Anonymous diagnostics preference must be a Boolean value." }
  ])("rejects $name without changing the saved file", async ({ overrides, message }) => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const saved = await service.saveSettings(await service.getSettings());
      const settingsPath = path.join(dir, "app-settings.json");
      const original = await fs.readFile(settingsPath, "utf8");

      await expect(service.saveSettings({ ...saved, ...overrides })).rejects.toThrow(new Error(message));
      expect(await fs.readFile(settingsPath, "utf8")).toBe(original);
    });
  });

  it("keeps the first validation error when several input fields are invalid", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const settings = await service.getSettings();
      const overrides: Record<string, unknown> = {
        visualEffects: "ultra",
        reduceMotion: "never",
        autoFetchIntervalMinutes: -1,
        gitBehaviors: {
          tagPushBehavior: "none",
          quickCommitByDefault: "true",
          allowCherryPickingContainedCommits: "true"
        },
        privacy: null
      };
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Unknown visual effects level."));
      delete overrides.visualEffects;
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Unknown reduced motion preference."));
      delete overrides.reduceMotion;
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Auto-fetch interval cannot be negative."));
      delete overrides.autoFetchIntervalMinutes;
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Quick Commit default must be a Boolean value."));
      overrides.gitBehaviors = { tagPushBehavior: "none", allowCherryPickingContainedCommits: "true" };
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Cherry-pick contained commit behavior must be a Boolean value."));
      delete overrides.gitBehaviors;
      await expect(service.saveSettings({ ...settings, ...overrides })).rejects.toThrow(new Error("Anonymous diagnostics preference must be a Boolean value."));
    });
  });

  it("rejects an unknown theme when saving", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "unknown" as "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
        zoomFactor: 99
      }), "utf8");
      const service = new AppSettingsService(dir);

      await expect(service.getSettings()).resolves.toEqual({
        autoFetchIntervalMinutes: 10,
        colorTheme: "orchid",
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: DEFAULT_UI_FONT,
        codeFont: DEFAULT_CODE_FONT,
        zoomFactor: DEFAULT_ZOOM_FACTOR,
        statusFileViewMode: DEFAULT_STATUS_FILE_VIEW_MODE,
        wrapDiffLines: DEFAULT_WRAP_DIFF_LINES,
        gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
        privacy: { shareAnonymousDiagnostics: true }
      });
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "orchid",
        appearanceMode: "sepia" as "system",
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
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
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: "comic-sans" as "inter",
        codeFont: "system-mono",
        zoomFactor: 1
      })).rejects.toThrow("Unknown interface font.");
      await expect(service.saveSettings({
        autoFetchIntervalMinutes: 10,
        colorTheme: "githead",
        appearanceMode: "system",
        visualEffects: "standard",
        reduceMotion: "system",
        uiFont: "inter",
        codeFont: "papyrus" as "system-mono",
        zoomFactor: 1
      })).rejects.toThrow("Unknown code font.");
    });
  });
});

describe("visual preferences", () => {
  it("defaults missing or invalid stored preferences", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      for (const stored of [{}, { visualEffects: "ultra", reduceMotion: "never" }, { visualEffects: null, reduceMotion: 1 }]) {
        await fs.writeFile(path.join(dir, "app-settings.json"), JSON.stringify(stored));
        expect(await service.getSettings()).toMatchObject({ visualEffects: "standard", reduceMotion: "system" });
      }
    });
  });

  it("persists every level and preserves preferences when an unrelated caller omits them", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      for (const visualEffects of ["off", "standard", "full"] as const) {
        for (const reduceMotion of ["system", "always"] as const) {
          await service.saveSettings({ ...await service.getSettings(), visualEffects, reduceMotion });
          const restored = await new AppSettingsService(dir).getSettings();
          expect(restored).toMatchObject({ visualEffects, reduceMotion });
          const request: AppSettingsSaveRequest = { ...restored, wrapDiffLines: true };
          delete request.visualEffects;
          delete request.reduceMotion;
          await service.saveSettings(request);
          expect(await service.getSettings()).toMatchObject({ visualEffects, reduceMotion, wrapDiffLines: true });
        }
      }
    });
  });

  it("rejects invalid incoming preferences without changing the saved file", async () => {
    await withTempDir(async (dir) => {
      const service = new AppSettingsService(dir);
      const saved = await service.saveSettings(await service.getSettings());
      for (const invalid of [{ visualEffects: "ultra" }, { reduceMotion: "never" }, { visualEffects: null }, { reduceMotion: null }]) {
        await expect(service.saveSettings({ ...saved, ...JSON.parse(JSON.stringify(invalid)) })).rejects.toThrow(/Unknown/);
        expect(await service.getSettings()).toEqual(saved);
      }
    });
  });
});
