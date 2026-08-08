import type { AppSettings } from "../shared/types";
import type { GitPushExecutionOptions } from "./gitService";

/** Reads main-process application settings once for one coordinated push. */
export async function snapshotGitPushExecutionOptions(
  loadSettings: () => Promise<AppSettings>,
  signal: AbortSignal
): Promise<GitPushExecutionOptions> {
  signal.throwIfAborted();
  const settings = await loadSettings();
  signal.throwIfAborted();
  return Object.freeze({
    signal,
    tagPushBehavior: settings.gitBehaviors.tagPushBehavior
  });
}
