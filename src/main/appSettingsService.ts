import fs from "node:fs/promises";
import path from "node:path";
import * as Schema from "effect/Schema";
import { APP_VISUAL_EFFECTS, APP_REDUCE_MOTION_MODES, DEFAULT_VISUAL_EFFECTS, DEFAULT_REDUCE_MOTION, APP_APPEARANCE_MODES, APP_CODE_FONTS, APP_COLOR_THEMES, APP_UI_FONTS, DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS, DEFAULT_TAG_PUSH_BEHAVIOR, REMOTE_CHECK_LEASE_SECONDS, STATUS_FILE_VIEW_MODES, TAG_PUSH_BEHAVIORS, isAppZoomFactor, type AppAppearanceMode, type AppCodeFont, type AppColorTheme, type AppSettings, type AppSettingsSaveRequest, type AppUiFont, type GitBehaviorSettings, type PrivacySettings, type StatusFileViewMode } from "../shared/types";
import {
  normalizeAutoFetchIntervalForSave,
  parseStoredAutoFetchInterval
} from "./autoFetchSettings";

export { DEFAULT_AUTO_FETCH_INTERVAL_MINUTES } from "./autoFetchSettings";

interface StoredAppSettings {
  cloneParentPath?: unknown;
  visualEffects?: unknown;
  reduceMotion?: unknown;
  autoFetchIntervalMinutes?: unknown;
  colorTheme?: unknown;
  appearanceMode?: unknown;
  uiFont?: unknown;
  codeFont?: unknown;
  zoomFactor?: unknown;
  statusFileViewMode?: unknown;
  wrapDiffLines?: unknown;
  gitBehaviors?: unknown;
  privacy?: unknown;
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

// Reads recover each field separately. Saves use the same schema but reject invalid input.
function settingField<A>(schema: Schema.Schema<A>, fallback: NoInfer<A>, message: string) {
  const isValid = Schema.is(schema);
  return {
    read(value: unknown): A {
      return isValid(value) ? value : fallback;
    },
    save(value: unknown): A {
      if (!isValid(value)) throw new Error(message);
      return value;
    }
  };
}

const fields = {
  visualEffects: settingField(Schema.Literals(APP_VISUAL_EFFECTS), DEFAULT_VISUAL_EFFECTS, "Unknown visual effects level."),
  reduceMotion: settingField(Schema.Literals(APP_REDUCE_MOTION_MODES), DEFAULT_REDUCE_MOTION, "Unknown reduced motion preference."),
  colorTheme: settingField(Schema.Literals(APP_COLOR_THEMES), DEFAULT_COLOR_THEME, "Unknown color theme."),
  appearanceMode: settingField(Schema.Literals(APP_APPEARANCE_MODES), DEFAULT_APPEARANCE_MODE, "Unknown appearance mode."),
  uiFont: settingField(Schema.Literals(APP_UI_FONTS), DEFAULT_UI_FONT, "Unknown interface font."),
  codeFont: settingField(Schema.Literals(APP_CODE_FONTS), DEFAULT_CODE_FONT, "Unknown code font."),
  zoomFactor: settingField(Schema.Number.check(Schema.makeFilter(isAppZoomFactor)), DEFAULT_ZOOM_FACTOR, "Unsupported interface scale."),
  statusFileViewMode: settingField(Schema.Literals(STATUS_FILE_VIEW_MODES), DEFAULT_STATUS_FILE_VIEW_MODE, "Unknown status file view mode."),
  wrapDiffLines: settingField(Schema.Boolean, DEFAULT_WRAP_DIFF_LINES, "Diff line wrap must be a Boolean value."),
  shareAnonymousDiagnostics: settingField(Schema.Boolean, DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS, "Anonymous diagnostics preference must be a Boolean value.")
};

const gitBehaviorFields = {
  tagPushBehavior: settingField(Schema.Literals(TAG_PUSH_BEHAVIORS), DEFAULT_TAG_PUSH_BEHAVIOR, "Unknown tag push behavior."),
  quickCommitByDefault: settingField(Schema.Boolean, false, "Quick Commit default must be a Boolean value."),
  allowCherryPickingContainedCommits: settingField(Schema.Boolean, false, "Cherry-pick contained commit behavior must be a Boolean value."),
  requireUpToDateUpstreamBeforeCommit: settingField(Schema.Boolean, false, "Pre-commit upstream behavior must be a Boolean value."),
  remoteCheckLeaseSeconds: settingField(Schema.UndefinedOr(Schema.Literals(REMOTE_CHECK_LEASE_SECONDS)), undefined, "Unknown remote check reuse duration.")
};

export class AppSettingsService {
  private readonly settingsPath: string;
  private pendingSave: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "app-settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    return {
      ...(typeof stored.cloneParentPath === "string" && path.isAbsolute(stored.cloneParentPath) ? { cloneParentPath: stored.cloneParentPath } : {}),
      autoFetchIntervalMinutes: parseStoredAutoFetchInterval(stored.autoFetchIntervalMinutes),
      visualEffects: fields.visualEffects.read(stored.visualEffects),
      reduceMotion: fields.reduceMotion.read(stored.reduceMotion),
      colorTheme: fields.colorTheme.read(stored.colorTheme),
      appearanceMode: fields.appearanceMode.read(stored.appearanceMode),
      uiFont: fields.uiFont.read(stored.uiFont),
      codeFont: fields.codeFont.read(stored.codeFont),
      zoomFactor: fields.zoomFactor.read(stored.zoomFactor),
      statusFileViewMode: fields.statusFileViewMode.read(stored.statusFileViewMode),
      wrapDiffLines: fields.wrapDiffLines.read(stored.wrapDiffLines),
      gitBehaviors: parseStoredGitBehaviors(stored.gitBehaviors),
      privacy: parseStoredPrivacySettings(stored.privacy)
    };
  }

  async saveSettings(request: AppSettingsSaveRequest): Promise<AppSettings> {
    return this.serializeSave(() => this.writeSettings(request));
  }

  async rememberCloneParent(parentPath: string): Promise<void> {
    if (!path.isAbsolute(parentPath)) throw new Error("Select an absolute destination folder.");
    await this.serializeSave(async () => {
      const existing = await this.getSettings();
      await this.writeSettings(existing, path.normalize(parentPath));
    });
  }

  private serializeSave<T>(save: () => Promise<T>): Promise<T> {
    const result = this.pendingSave.then(save);
    this.pendingSave = result.catch(() => undefined);
    return result;
  }

  private async writeSettings(request: AppSettingsSaveRequest, cloneParentPath?: string): Promise<AppSettings> {
    const existing = await this.getSettings();
    const visualEffects = fields.visualEffects.save(request.visualEffects === undefined ? existing.visualEffects : request.visualEffects);
    const reduceMotion = fields.reduceMotion.save(request.reduceMotion === undefined ? existing.reduceMotion : request.reduceMotion);
    const autoFetchIntervalMinutes = normalizeAutoFetchIntervalForSave(request.autoFetchIntervalMinutes);
    const colorTheme = fields.colorTheme.save(request.colorTheme);
    const appearanceMode = fields.appearanceMode.save(request.appearanceMode);
    const uiFont = fields.uiFont.save(request.uiFont === undefined ? DEFAULT_UI_FONT : request.uiFont);
    const codeFont = fields.codeFont.save(request.codeFont === undefined ? DEFAULT_CODE_FONT : request.codeFont);
    const zoomFactor = normalizeZoomFactorForSave(request.zoomFactor);
    const statusFileViewMode = fields.statusFileViewMode.save(request.statusFileViewMode === undefined ? DEFAULT_STATUS_FILE_VIEW_MODE : request.statusFileViewMode);
    const wrapDiffLines = fields.wrapDiffLines.save(request.wrapDiffLines === undefined ? DEFAULT_WRAP_DIFF_LINES : request.wrapDiffLines);
    const gitBehaviors = request.gitBehaviors === undefined
      ? existing.gitBehaviors
      : normalizeGitBehaviorsForSave(request.gitBehaviors);
    const privacy = request.privacy === undefined
      ? existing.privacy
      : normalizePrivacySettingsForSave(request.privacy);

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify({
      autoFetchIntervalMinutes,
      visualEffects,
      reduceMotion,
      colorTheme,
      appearanceMode,
      uiFont,
      codeFont,
      zoomFactor,
      statusFileViewMode,
      wrapDiffLines,
      gitBehaviors,
      privacy,
      ...((cloneParentPath ?? existing.cloneParentPath) ? { cloneParentPath: cloneParentPath ?? existing.cloneParentPath } : {})
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

function parseStoredPrivacySettings(value: unknown): PrivacySettings {
  if (!value || typeof value !== "object") {
    return { shareAnonymousDiagnostics: DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS };
  }
  const shareAnonymousDiagnostics = (value as { shareAnonymousDiagnostics?: unknown }).shareAnonymousDiagnostics;
  return {
    shareAnonymousDiagnostics: fields.shareAnonymousDiagnostics.read(shareAnonymousDiagnostics)
  };
}

function normalizePrivacySettingsForSave(value: PrivacySettings): PrivacySettings {
  return { shareAnonymousDiagnostics: fields.shareAnonymousDiagnostics.save(value?.shareAnonymousDiagnostics) };
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
    quickCommitByDefault?: unknown;
    remoteCheckLeaseSeconds?: unknown;
  };
  const remoteCheckLeaseSeconds = gitBehaviorFields.remoteCheckLeaseSeconds.read(stored.remoteCheckLeaseSeconds);
  return {
    tagPushBehavior: gitBehaviorFields.tagPushBehavior.read(stored.tagPushBehavior),
    ...(gitBehaviorFields.allowCherryPickingContainedCommits.read(stored.allowCherryPickingContainedCommits)
      ? { allowCherryPickingContainedCommits: true }
      : {}),
    ...(gitBehaviorFields.requireUpToDateUpstreamBeforeCommit.read(stored.requireUpToDateUpstreamBeforeCommit)
      ? { requireUpToDateUpstreamBeforeCommit: true }
      : {}),
    ...(gitBehaviorFields.quickCommitByDefault.read(stored.quickCommitByDefault) ? { quickCommitByDefault: true } : {}),
    ...(remoteCheckLeaseSeconds !== undefined
      ? { remoteCheckLeaseSeconds }
      : {})
  };
}

function normalizeGitBehaviorsForSave(value: GitBehaviorSettings): GitBehaviorSettings {
  gitBehaviorFields.tagPushBehavior.save(value?.tagPushBehavior);
  if (value.quickCommitByDefault !== undefined) {
    gitBehaviorFields.quickCommitByDefault.save(value.quickCommitByDefault);
  }
  if (value.allowCherryPickingContainedCommits !== undefined) {
    gitBehaviorFields.allowCherryPickingContainedCommits.save(value.allowCherryPickingContainedCommits);
  }
  if (value.requireUpToDateUpstreamBeforeCommit !== undefined) {
    gitBehaviorFields.requireUpToDateUpstreamBeforeCommit.save(value.requireUpToDateUpstreamBeforeCommit);
  }
  gitBehaviorFields.remoteCheckLeaseSeconds.save(value.remoteCheckLeaseSeconds);
  return parseStoredGitBehaviors(value);
}

export function normalizeZoomFactorForSave(value: number): number {
  return fields.zoomFactor.save(value);
}
