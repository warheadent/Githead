import fs from "node:fs/promises";
import path from "node:path";
import { APP_APPEARANCE_MODES, APP_CODE_FONTS, APP_COLOR_THEMES, APP_UI_FONTS, DEFAULT_TAG_PUSH_BEHAVIOR, STATUS_FILE_VIEW_MODES, TAG_PUSH_BEHAVIORS, isAppZoomFactor, type AppAppearanceMode, type AppCodeFont, type AppColorTheme, type AppSettings, type AppSettingsSaveRequest, type AppUiFont, type GitBehaviorSettings, type StatusFileViewMode, type TagPushBehavior } from "../shared/types";
import {
  normalizeAutoFetchIntervalForSave,
  parseStoredAutoFetchInterval
} from "./autoFetchSettings";

export { DEFAULT_AUTO_FETCH_INTERVAL_MINUTES } from "./autoFetchSettings";

interface StoredAppSettings {
  autoFetchIntervalMinutes?: unknown;
  colorTheme?: unknown;
  appearanceMode?: unknown;
  uiFont?: unknown;
  codeFont?: unknown;
  zoomFactor?: unknown;
  statusFileViewMode?: unknown;
  wrapDiffLines?: unknown;
  gitBehaviors?: unknown;
}

export const DEFAULT_COLOR_THEME: AppColorTheme = "githead";
export const DEFAULT_APPEARANCE_MODE: AppAppearanceMode = "system";
export const DEFAULT_UI_FONT: AppUiFont = "inter";
export const DEFAULT_CODE_FONT: AppCodeFont = "system-mono";
export const DEFAULT_ZOOM_FACTOR = 1;
export const DEFAULT_STATUS_FILE_VIEW_MODE: StatusFileViewMode = "list";
export const DEFAULT_WRAP_DIFF_LINES = false;
export { DEFAULT_TAG_PUSH_BEHAVIOR } from "../shared/types";
export { DEFAULT_ALLOW_CHERRY_PICKING_CONTAINED_COMMITS } from "../shared/types";

export class AppSettingsService {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "app-settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    return {
      autoFetchIntervalMinutes: parseStoredAutoFetchInterval(stored.autoFetchIntervalMinutes),
      colorTheme: parseStoredColorTheme(stored.colorTheme),
      appearanceMode: parseStoredAppearanceMode(stored.appearanceMode),
      uiFont: parseStoredUiFont(stored.uiFont),
      codeFont: parseStoredCodeFont(stored.codeFont),
      zoomFactor: parseStoredZoomFactor(stored.zoomFactor),
      statusFileViewMode: parseStoredStatusFileViewMode(stored.statusFileViewMode),
      wrapDiffLines: parseStoredWrapDiffLines(stored.wrapDiffLines),
      gitBehaviors: parseStoredGitBehaviors(stored.gitBehaviors)
    };
  }

  async saveSettings(request: AppSettingsSaveRequest): Promise<AppSettings> {
    const existing = await this.getSettings();
    const autoFetchIntervalMinutes = normalizeAutoFetchIntervalForSave(request.autoFetchIntervalMinutes);
    const colorTheme = normalizeColorThemeForSave(request.colorTheme);
    const appearanceMode = normalizeAppearanceModeForSave(request.appearanceMode);
    const uiFont = normalizeUiFontForSave(request.uiFont);
    const codeFont = normalizeCodeFontForSave(request.codeFont);
    const zoomFactor = normalizeZoomFactorForSave(request.zoomFactor);
    const statusFileViewMode = normalizeStatusFileViewModeForSave(request.statusFileViewMode);
    const wrapDiffLines = normalizeWrapDiffLinesForSave(request.wrapDiffLines);
    const gitBehaviors = request.gitBehaviors === undefined
      ? existing.gitBehaviors
      : normalizeGitBehaviorsForSave(request.gitBehaviors);

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify({
      autoFetchIntervalMinutes,
      colorTheme,
      appearanceMode,
      uiFont,
      codeFont,
      zoomFactor,
      statusFileViewMode,
      wrapDiffLines,
      gitBehaviors
    } satisfies AppSettings, null, 2)}\n`, "utf8");

    return this.getSettings();
  }

  private async readStoredSettings(): Promise<StoredAppSettings> {
    try {
      const text = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(text) as StoredAppSettings;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
}

function parseStoredGitBehaviors(value: unknown): GitBehaviorSettings {
  if (!value || typeof value !== "object") {
    return {
      tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR
    };
  }

  const stored = value as {
    tagPushBehavior?: unknown;
    allowCherryPickingContainedCommits?: unknown;
    requireUpToDateUpstreamBeforeCommit?: unknown;
  };
  const tagPushBehavior = stored.tagPushBehavior;
  return {
    tagPushBehavior: TAG_PUSH_BEHAVIORS.includes(tagPushBehavior as TagPushBehavior)
      ? tagPushBehavior as TagPushBehavior
      : DEFAULT_TAG_PUSH_BEHAVIOR,
    ...(stored.allowCherryPickingContainedCommits === true
      ? { allowCherryPickingContainedCommits: true }
      : {}),
    ...(stored.requireUpToDateUpstreamBeforeCommit === true
      ? { requireUpToDateUpstreamBeforeCommit: true }
      : {})
  };
}

function normalizeGitBehaviorsForSave(value: GitBehaviorSettings): GitBehaviorSettings {
  if (!value || !TAG_PUSH_BEHAVIORS.includes(value.tagPushBehavior)) {
    throw new Error("Unknown tag push behavior.");
  }
  if (
    value.allowCherryPickingContainedCommits !== undefined &&
    typeof value.allowCherryPickingContainedCommits !== "boolean"
  ) {
    throw new Error("Cherry-pick contained commit behavior must be a Boolean value.");
  }
  if (
    value.requireUpToDateUpstreamBeforeCommit !== undefined &&
    typeof value.requireUpToDateUpstreamBeforeCommit !== "boolean"
  ) {
    throw new Error("Pre-commit upstream behavior must be a Boolean value.");
  }
  return {
    tagPushBehavior: value.tagPushBehavior,
    ...(value.allowCherryPickingContainedCommits === true
      ? { allowCherryPickingContainedCommits: true }
      : {}),
    ...(value.requireUpToDateUpstreamBeforeCommit === true
      ? { requireUpToDateUpstreamBeforeCommit: true }
      : {})
  };
}

function parseStoredStatusFileViewMode(value: unknown): StatusFileViewMode {
  return STATUS_FILE_VIEW_MODES.includes(value as StatusFileViewMode) ? value as StatusFileViewMode : DEFAULT_STATUS_FILE_VIEW_MODE;
}

function normalizeStatusFileViewModeForSave(value: StatusFileViewMode | undefined): StatusFileViewMode {
  if (value === undefined) return DEFAULT_STATUS_FILE_VIEW_MODE;
  if (!STATUS_FILE_VIEW_MODES.includes(value)) throw new Error("Unknown status file view mode.");
  return value;
}

function parseStoredWrapDiffLines(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_WRAP_DIFF_LINES;
}

function normalizeWrapDiffLinesForSave(value: boolean | undefined): boolean {
  if (value === undefined) return DEFAULT_WRAP_DIFF_LINES;
  if (typeof value !== "boolean") throw new Error("Diff line wrap must be a Boolean value.");
  return value;
}

function parseStoredColorTheme(value: unknown): AppColorTheme {
  return APP_COLOR_THEMES.includes(value as AppColorTheme) ? value as AppColorTheme : DEFAULT_COLOR_THEME;
}

function normalizeColorThemeForSave(value: AppColorTheme): AppColorTheme {
  if (!APP_COLOR_THEMES.includes(value)) {
    throw new Error("Unknown color theme.");
  }

  return value;
}

function parseStoredAppearanceMode(value: unknown): AppAppearanceMode {
  return APP_APPEARANCE_MODES.includes(value as AppAppearanceMode) ? value as AppAppearanceMode : DEFAULT_APPEARANCE_MODE;
}

function normalizeAppearanceModeForSave(value: AppAppearanceMode): AppAppearanceMode {
  if (!APP_APPEARANCE_MODES.includes(value)) {
    throw new Error("Unknown appearance mode.");
  }

  return value;
}

function parseStoredUiFont(value: unknown): AppUiFont {
  return APP_UI_FONTS.includes(value as AppUiFont) ? value as AppUiFont : DEFAULT_UI_FONT;
}

function normalizeUiFontForSave(value: AppUiFont | undefined): AppUiFont {
  if (value === undefined) return DEFAULT_UI_FONT;
  if (!APP_UI_FONTS.includes(value)) throw new Error("Unknown interface font.");
  return value;
}

function parseStoredCodeFont(value: unknown): AppCodeFont {
  return APP_CODE_FONTS.includes(value as AppCodeFont) ? value as AppCodeFont : DEFAULT_CODE_FONT;
}

function normalizeCodeFontForSave(value: AppCodeFont | undefined): AppCodeFont {
  if (value === undefined) return DEFAULT_CODE_FONT;
  if (!APP_CODE_FONTS.includes(value)) throw new Error("Unknown code font.");
  return value;
}

function parseStoredZoomFactor(value: unknown): number {
  return isAppZoomFactor(value) ? value : DEFAULT_ZOOM_FACTOR;
}

export function normalizeZoomFactorForSave(value: number): number {
  if (!isAppZoomFactor(value)) {
    throw new Error("Unsupported interface scale.");
  }

  return value;
}
