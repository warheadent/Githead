// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { GitAmendEntryPoint, GitAmendMode, GitAmendPreview, GitRepositoryOperationState } from "../shared/types";
import {
  createCommit,
  createCommitDetails,
  createStatusFile,
  createSummary,
  githead,
  repoPath,
  waitForRepositoryWorkspace
} from "./AppTestHarness";
import { App } from "./App";

describe("App amend entry points", { timeout: 10_000 }, () => {
  it("shows amend only for exact HEAD and opens the shared dialog", async () => {
    const user = userEvent.setup();
    const head = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      refs: [{ kind: "branch", name: "main" }],
      subject: "HEAD commit"
    });
    const older = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      refs: [{ kind: "tag", name: "v1" }],
      subject: "Older commit"
    });
    const otherTip = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      refs: [{ kind: "branch", name: "feature" }],
      subject: "Other branch tip"
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());
    vi.mocked(githead.getCommitHistory).mockResolvedValue([head, older, otherTip]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));
    mockAmendPreview();

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    const olderRow = await screen.findByRole("option", { name: /Older commit/ });
    fireEvent.contextMenu(olderRow);
    expect(screen.queryByRole("menuitem", { name: "Amend last commit…" })).toBeNull();
    await user.keyboard("{Escape}");

    const otherRow = screen.getByRole("option", { name: /Other branch tip/ });
    fireEvent.contextMenu(otherRow);
    expect(screen.queryByRole("menuitem", { name: "Amend last commit…" })).toBeNull();
    await user.keyboard("{Escape}");

    const headRow = screen.getByRole("option", { name: /HEAD commit/ });
    fireEvent.contextMenu(headRow);
    const menuLabels = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(menuLabels.indexOf("Amend last commit…")).toBe(menuLabels.indexOf("Reverse commit") + 1);
    await user.click(await screen.findByRole("menuitem", { name: "Amend last commit…" }));
    expect(await screen.findByRole("heading", { name: "Amend last commit" })).toBeTruthy();
    expect(githead.getAmendPreview).toHaveBeenCalledWith(expect.objectContaining({ repoPath, source: "history" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(headRow));
  });

  it("opens the same dialog from the Commit secondary action and selects the staged composer mode", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("staged.ts", { indexStatus: "M", worktreeStatus: ".", isStaged: true, isUnstaged: false })]
    }));
    mockAmendPreview([{ path: "staged.ts", status: "M" }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    const trigger = screen.getByRole("button", { name: "More commit actions" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Amend last commit…" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Amend last commit" })).toBeTruthy();
    expect(await within(dialog).findByRole("radio", { name: /Add staged changes and edit message/ })).toHaveProperty("checked", true);
    expect(githead.getAmendPreview).toHaveBeenCalledWith(expect.objectContaining({ repoPath, source: "composer" }));

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps Commit & Push visible when the amend action makes the Commit menu available", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [] }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "More commit actions" }));

    const commitAndPush = screen.getByRole("menuitem", { name: "Commit & Push" });
    expect(commitAndPush.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Amend last commit…" })).toBeTruthy();
  });

  it("keeps History staged choice predictable and defaults to message only", async () => {
    const user = userEvent.setup();
    const head = createCommit({ hash: "a".repeat(40), refs: [{ kind: "branch", name: "main" }], subject: "History staged" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([head]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(head.hash));
    mockAmendPreview([{ path: "staged.ts", status: "M" }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /History staged/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Amend last commit…" }));

    expect(await screen.findByRole("radio", { name: /Change message only/ })).toHaveProperty("checked", true);
  });

  it("disables HEAD amend with a reason while a repository operation is active", async () => {
    const user = userEvent.setup();
    const head = createCommit({ hash: "a".repeat(40), refs: [{ kind: "branch", name: "main" }], subject: "Busy HEAD" });
    const operation = createOperationState();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ operationState: operation }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([head]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(head.hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /Busy HEAD/ }));
    const item = await screen.findByRole("menuitem", { name: "Amend last commit…" });
    expect(item.getAttribute("data-disabled")).not.toBeNull();
    await user.hover(item);
    expect(await screen.findByText("Finish or abort the active rebase first.")).toBeTruthy();
  });

  it("opens the history context menu with the keyboard context-menu key", async () => {
    const user = userEvent.setup();
    const head = createCommit({ hash: "a".repeat(40), refs: [{ kind: "branch", name: "main" }], subject: "Keyboard HEAD" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([head]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(head.hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const row = await screen.findByRole("option", { name: /Keyboard HEAD/ });
    row.focus();
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    expect(await screen.findByRole("menuitem", { name: "Amend last commit…" })).toBeTruthy();
  });

  it("reports a stale view when refresh fails after Git verified the amend and never pushes", async () => {
    const user = userEvent.setup();
    const summary = createSummary();
    vi.mocked(githead.getRepoIdentity)
      .mockImplementationOnce(async (request) => ({
        repoPath,
        generation: request.generation,
        kind: "git",
        capabilities: summary.capabilities,
        isValid: true,
        branch: "main",
        hasHead: true,
        safeDirectory: null,
        validationErrors: []
      }))
      .mockRejectedValue(new Error("refresh failed"));
    mockAmendPreview();
    vi.mocked(githead.amendLastCommit).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "amended",
      stderr: "",
      outcome: "completed",
      message: "The last commit was amended. No push was started.",
      previousHeadOid: "a".repeat(40),
      headOid: "b".repeat(40),
      recoveryRef: "refs/githead/amend-recovery/test"
    });

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Amend last commit…" }));
    fireEvent.change(await screen.findByLabelText("Commit message"), { target: { value: "new message" } });
    await user.click(screen.getByRole("button", { name: "Amend last commit" }));

    expect(await screen.findByText(/The commit was amended, but Githead could not refresh every view/)).toBeTruthy();
    expect(githead.runGitAction).not.toHaveBeenCalledWith(expect.objectContaining({ action: "push" }));
  });
});

function mockAmendPreview(stagedFiles: GitAmendPreview["stagedFiles"] = []): void {
  vi.mocked(githead.getAmendPreview).mockImplementation(async (request) => {
    const defaultMode: GitAmendMode = stagedFiles.length > 0 && request.source === "composer" ? "staged-edit" : "message-only";
    return {
      outcome: "ready",
      message: "Review and confirm the amend.",
      preview: createAmendPreview(request.source, request.mode ?? defaultMode, defaultMode, stagedFiles)
    };
  });
}

function createAmendPreview(
  source: GitAmendEntryPoint,
  mode: GitAmendMode,
  defaultMode: GitAmendMode,
  stagedFiles: GitAmendPreview["stagedFiles"]
): GitAmendPreview {
  return {
    repoPath,
    repositoryId: "repository",
    snapshotId: `${source}-${mode}`,
    source,
    mode,
    defaultMode,
    currentBranch: "main",
    headOid: "a".repeat(40),
    shortHeadOid: "aaaaaaa",
    subject: "HEAD commit",
    message: "old message",
    authorName: "Githead Test",
    authorEmail: "githead@example.test",
    commitDate: "2026-08-09T00:00:00Z",
    stagedFiles,
    indexFingerprint: "index",
    upstream: "origin/main",
    publication: "local-ahead",
    publishedRefs: [],
    blockingReasons: [],
    recoveryPoints: []
  };
}

function createOperationState(): GitRepositoryOperationState {
  const unavailable = { supported: false, enabled: false, disabledReason: null, requiresConfirmation: false };
  return {
    stateId: "rebase-state",
    kind: "rebase",
    phase: "ready-to-continue",
    backend: "merge",
    hasConflicts: false,
    conflictedPaths: [],
    sequence: null,
    originalBranch: "main",
    currentBranch: null,
    actions: {
      continue: { supported: true, enabled: true, disabledReason: null, requiresConfirmation: false },
      skip: { ...unavailable },
      "keep-empty": { ...unavailable },
      abort: { supported: true, enabled: true, disabledReason: null, requiresConfirmation: true }
    },
    summary: "Rebase is ready to continue."
  };
}
