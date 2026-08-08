// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createOperationResult,
  createRepositoryOperationState,
  createStatusFile,
  createSummary,
  createTextDiff,
  emitRepoChanged,
  githead,
  repoPath,
  waitForRepositoryWorkspace
} from "./AppTestHarness";
import { App } from "./App";

describe("App repository operation recovery", { timeout: 10_000 }, () => {
  it.each([
    ["merge", "Merge in progress"],
    ["rebase", "Rebase (merge backend) in progress"],
    ["cherry-pick", "Cherry-pick in progress"],
    ["revert", "Revert in progress"]
  ] as const)("restores a pre-existing %s operation during repository load", async (kind, heading) => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      operationState: createRepositoryOperationState(kind)
    }));

    render(<App />);

    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByText(/recovery required/)).toBeTruthy();
  });

  it("sends a state-bound Continue request and hides recovery only after a confirmed fresh read", async () => {
    const operationState = createRepositoryOperationState("merge", {
      hasConflicts: false,
      conflictedPaths: [],
      phase: "ready-to-continue",
      stateId: "merge-ready",
      actions: {
        ...createRepositoryOperationState("merge", { hasConflicts: false }).actions,
        abort: {
          supported: true,
          enabled: true,
          disabledReason: null,
          requiresConfirmation: false
        }
      }
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ operationState }))
      .mockResolvedValue(createSummary({ operationState: null }));
    vi.mocked(githead.resolveRepositoryOperation).mockResolvedValue({
      ...createOperationResult(),
      outcome: "completed",
      state: null
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    await waitFor(() => expect(githead.resolveRepositoryOperation).toHaveBeenCalledWith({
      repoPath,
      expectedKind: "merge",
      expectedStateId: "merge-ready",
      action: "continue",
      operationId: expect.any(String)
    }));
    await waitFor(() => expect(screen.queryByText("Merge in progress")).toBeNull());
  });

  it("keeps recovery visible and adopts fresh state after stale-action rejection", async () => {
    const initial = createRepositoryOperationState("revert", {
      hasConflicts: false,
      conflictedPaths: [],
      phase: "ready-to-continue",
      stateId: "revert-before"
    });
    const fresh = createRepositoryOperationState("revert", { stateId: "revert-after" });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ operationState: initial }))
      .mockResolvedValue(createSummary({ operationState: fresh }));
    vi.mocked(githead.resolveRepositoryOperation).mockResolvedValue({
      ...createOperationResult({ exitCode: 1, stderr: "Repository operation state changed. Refresh and try again." }),
      outcome: "stale",
      state: fresh
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect((await screen.findByRole("alert")).textContent).toContain("state changed");
    expect(screen.getByText("Revert in progress")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
  });

  it("opens a conflicted path in the existing status diff and permits staging it", async () => {
    const conflictedFile = createStatusFile("conflict.txt", {
      indexStatus: "U",
      worktreeStatus: "U",
      isStaged: true,
      isUnstaged: true,
      isConflicted: true
    });
    const conflicted = createRepositoryOperationState("merge");
    const ready = createRepositoryOperationState("merge", {
      hasConflicts: false,
      conflictedPaths: [],
      phase: "ready-to-continue",
      stateId: "merge-staged"
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ files: [conflictedFile], operationState: conflicted }))
      .mockResolvedValue(createSummary({
        files: [createStatusFile("conflict.txt", { indexStatus: "M", isStaged: true })],
        operationState: ready
      }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff("conflict.txt", "resolved"));

    render(<App />);
    await waitForRepositoryWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: /conflict\.txt/ }));
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      path: "conflict.txt"
    })));

    fireEvent.click(screen.getByRole("button", { name: "Stage All" }));
    await waitFor(() => expect(githead.stageFiles).toHaveBeenCalledWith({
      repoPath,
      paths: ["conflict.txt"],
      operationId: expect.any(String)
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false));
  });

  it("does not hide a detected operation when an unrelated status refresh fails", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      operationState: createRepositoryOperationState("cherry-pick")
    }));

    render(<App />);
    expect(await screen.findByText("Cherry-pick in progress")).toBeTruthy();
    vi.mocked(githead.getRepoStatus).mockRejectedValueOnce(new Error("status unavailable"));
    emitRepoChanged();

    await waitFor(() => expect(githead.getRepoStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Cherry-pick in progress")).toBeTruthy();
  });

  it("limits file actions to inspection and staging while recovery is active", async () => {
    const conflictedFile = createStatusFile("conflict.txt", {
      indexStatus: "U",
      worktreeStatus: "U",
      isStaged: true,
      isUnstaged: true,
      isConflicted: true
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [conflictedFile],
      operationState: createRepositoryOperationState("merge")
    }));

    render(<App />);
    const unstagedFiles = await screen.findByRole("listbox", { name: "Unstaged files" });
    fireEvent.contextMenu(within(unstagedFiles).getByRole("option", { name: /conflict\.txt/ }));

    expect((await screen.findByRole("menuitem", { name: "Stage" })).getAttribute("data-disabled")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Stash selected files..." }).getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Revert changes" }).getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Add to ignore" }).getAttribute("data-disabled")).not.toBeNull();
  });
});
