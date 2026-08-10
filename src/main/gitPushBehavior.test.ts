import { describe, expect, it } from "vite-plus/test";
import type { AppSettings } from "../shared/types";
import { snapshotGitPushExecutionOptions } from "./gitPushBehavior";

describe("snapshotGitPushExecutionOptions", () => {
  it("snapshots the main-process setting without accepting renderer Git arguments", async () => {
    const settings: AppSettings = {
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: { tagPushBehavior: "follow" },
      privacy: { shareAnonymousDiagnostics: true }
    };
    const controller = new AbortController();

    const snapshot = await snapshotGitPushExecutionOptions(async () => settings, controller.signal);
    settings.gitBehaviors.tagPushBehavior = "none";

    expect(snapshot).toEqual({
      signal: controller.signal,
      tagPushBehavior: "follow"
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
