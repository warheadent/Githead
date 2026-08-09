import { describe, expect, it } from "vite-plus/test";
import { IPC_CHANNELS } from "./ipc";
import type {
  CoordinatedRequest,
  GitAmendExecuteRequest,
  GitAmendPreviewRequest,
  GitAmendRestoreRequest,
  GitheadApi
} from "./types";

describe("amend IPC contract", () => {
  it("uses dedicated typed channels for preview, amend, and restore", () => {
    expect(IPC_CHANNELS.getAmendPreview).toBe("git:amend-preview");
    expect(IPC_CHANNELS.amendLastCommit).toBe("git:amend-last-commit");
    expect(IPC_CHANNELS.restoreAmendRecovery).toBe("git:amend-recovery-restore");
    expect(new Set([
      IPC_CHANNELS.getAmendPreview,
      IPC_CHANNELS.amendLastCommit,
      IPC_CHANNELS.restoreAmendRecovery
    ]).size).toBe(3);
  });

  it("does not expose raw Git arguments in renderer requests", () => {
    const preview: GitAmendPreviewRequest = { repoPath: "D:\\Repo", source: "history", mode: "message-only" };
    const amend: CoordinatedRequest<GitAmendExecuteRequest> = {
      repoPath: "D:\\Repo",
      source: "history",
      mode: "message-only",
      message: "new message",
      expectedSnapshotId: "snapshot",
      operationId: "operation"
    };
    const restore: CoordinatedRequest<GitAmendRestoreRequest> = {
      repoPath: "D:\\Repo",
      recoveryRef: "refs/githead/amend-recovery/point",
      expectedRestoreToken: "token",
      operationId: "operation"
    };
    const invokePreview: Parameters<GitheadApi["getAmendPreview"]>[0] = preview;
    const invokeAmend: Parameters<GitheadApi["amendLastCommit"]>[0] = amend;
    const invokeRestore: Parameters<GitheadApi["restoreAmendRecovery"]>[0] = restore;

    expect(invokePreview).not.toHaveProperty("args");
    expect(invokeAmend).not.toHaveProperty("args");
    expect(invokeRestore).not.toHaveProperty("args");
  });
});
