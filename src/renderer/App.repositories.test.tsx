// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { gitCapabilities } from "../shared/types";
import {
  createActionsConfig,
  createCommit,
  createCommitDetails,
  createOperationResult,
  createRepoSyncStatus,
  createRunResult,
  createSafeDirectorySummary,
  createStatusFile,
  createSummary,
  createTextDiff,
  defer,
  emitRepoChanged,
  flushRendererAsync,
  githead,
  repoPath,
  repositoryRecents,
  scrollIntoView,
  waitForRepositoryWorkspace,
  type GitFileDiff,
  type GitheadApi,
  type GitIdentitySettings,
  type GitOperationResult,
  type GitRunResult,
  type RepoSummary
} from "./AppTestHarness";
import { App } from "./App";

describe("App", { timeout: 10_000 }, () => {
  it("refreshes File Status after active repository file changes", async () => {
    const changedFile = createStatusFile("src/App.tsx", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          changedFile
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    await waitForRepositoryWorkspace();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    emitRepoChanged();
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/App\.tsx/ })).toBeTruthy();
  });

  it("does not refresh File Status on idle timers", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("auto-fetches the active repository after the default interval", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("releases an old auto-fetch owner when the native picker switches repositories", async () => {
    vi.useFakeTimers();
    const nextRepoPath = "D:\\Work\\Picked";
    const pendingPicker = defer<string | null>();
    const pendingFetch = defer<GitRunResult>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingPicker.promise);
    vi.mocked(githead.runGitAction).mockReturnValue(pendingFetch.promise);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("button", { name: "Add existing" }));
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();
    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });

    await act(async () => {
      pendingPicker.resolve(nextRepoPath);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushRendererAsync();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(nextRepoPath);
    expect(screen.getByRole("button", { name: `Switch to ${nextRepoPath}` }).getAttribute("aria-current")).toBe("true");
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);

    pendingFetch.resolve(createRunResult("fetch", { repoPath }));
    await flushRendererAsync();

    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Fetch running")).toBeNull();
  });

  it("does not auto-fetch immediately on startup", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("refreshes repository state after a successful auto-fetch", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
  });

  it("keeps the auto-fetch countdown after an intervening repository refresh", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    emitRepoChanged();
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("does not auto-fetch while another repository operation is running", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/pending.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("lets the user cancel a pending repository operation", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/pending.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    const operationId = vi.mocked(githead.stageFiles).mock.calls[0]?.[0].operationId;
    expect(operationId).toEqual(expect.any(String));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId });
    expect((screen.getByRole("button", { name: "Cancelling" }) as HTMLButtonElement).disabled).toBe(true);
    pendingStage.resolve(createOperationResult({ exitCode: -1, stderr: "Operation was cancelled." }));
    await flushRendererAsync();
  });

  it("recovers stale operation state when cancellation reports it missing", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/stale.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/stale\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(screen.queryByRole("button", { name: "Dismiss Stale Status" })).toBeNull();
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("recovers a lost operation result from authoritative main-process state", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/lost-result.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.getGitOperationStates).mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId) => ({ operationId, state: "not-found" }))
    ));

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/lost-result\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    const operationId = vi.mocked(githead.stageFiles).mock.calls[0]?.[0].operationId;
    vi.mocked(githead.getRepoStatus).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await flushRendererAsync();

    expect(githead.getGitOperationStates).toHaveBeenCalledWith({ operationIds: [operationId] });
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(githead.getRepoStatus).toHaveBeenCalled();

    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps an operation locked when cancellation transport fails and permits a retry", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/retry-cancel.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.cancelGitOperation)
      .mockRejectedValueOnce(new Error("Cancellation IPC failed."))
      .mockResolvedValueOnce({ accepted: true, state: "cancelling" });

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/retry-cancel\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(screen.getByRole("alert").textContent).toContain("Cancellation IPC failed.");
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry Cancel" }));
    await flushRendererAsync();

    expect(githead.cancelGitOperation).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("button", { name: "Cancelling" }) as HTMLButtonElement).disabled).toBe(true);

    pendingStage.resolve(createOperationResult({ exitCode: -1, stderr: "Operation was cancelled." }));
    await flushRendererAsync();
  });

  it("does not start auto-fetch if an operation begins while trust is loading", async () => {
    vi.useFakeTimers();
    const pendingTrust = defer<{ trusted: boolean }>();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoTrust).mockReturnValueOnce(pendingTrust.promise);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/race.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("option", { name: /src\/race\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    pendingTrust.resolve({
      trusted: true
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("does not auto-fetch invalid repositories", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      isValid: false,
      validationErrors: [
        "Not a git repository."
      ],
      remotes: []
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("does not auto-fetch repositories without fetch capability", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      capabilities: {
        ...gitCapabilities(),
        fetch: false
      }
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("does not auto-fetch repositories without fetch remotes", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remotes: []
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("skips untrusted repositories during auto-fetch without prompting", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoTrust).mockResolvedValue({
      trusted: false
    });

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Do you trust this workspace?" })).toBeNull();
  });

  it("does not auto-fetch when the interval is disabled", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 0,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false
    });

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("refreshes File Status when the window is refocused", async () => {
    const changedFile = createStatusFile("src/focused.ts", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          changedFile
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/focused\.ts/ })).toBeTruthy();
  });

  it("does not repeatedly refresh while the window is already focused", async () => {
    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);
  });

  it("restores parent-owned file data and retains the used Commit History panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: Array.from({ length: 20 }, (_, index) => createStatusFile(`persisted-${index}.ts`, {
        isUnstaged: true,
        worktreeStatus: "M"
      }))
    }));

    render(<App />);
    const statusList = await screen.findByRole("listbox", { name: "Unstaged files" });
    statusList.scrollTop = 340;
    fireEvent.scroll(statusList);
    const fileOption = await screen.findByRole("option", { name: /persisted-18\.ts/ });
    await user.click(fileOption);
    expect(fileOption.getAttribute("aria-selected")).toBe("true");
    statusList.scrollTop = 340;
    fireEvent.scroll(statusList);
    expect(screen.queryByRole("listbox", { name: "Commit history" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(await screen.findByRole("listbox", { name: "Commit history" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /persisted-18\.ts/ })).toBeNull();

    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    expect((await screen.findByRole("option", { name: /persisted-18\.ts/ })).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Unstaged files" }).scrollTop).toBe(340);
    });
    expect(screen.getByRole("listbox", { name: "Commit history" })).toBeTruthy();
  });

  it("keeps Commit History mounted after its first use", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ subject: "feat: retained history row" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Commit History/ }));
    const historyRow = await screen.findByRole("option", { name: /retained history row/ });

    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    expect(screen.getByRole("option", { name: /retained history row/ })).toBe(historyRow);
    expect(document.querySelectorAll(".history-row")).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(await screen.findByRole("option", { name: /retained history row/ })).toBe(historyRow);
  });

  it("renders a bounded window of Commit History rows", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getCommitHistory).mockResolvedValue(Array.from({ length: 200 }, (_, index) => createCommit({
      hash: index.toString(16).padStart(40, "0"),
      shortHash: index.toString(16).padStart(7, "0"),
      subject: `feat: virtual history ${index}`
    })));

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Commit History/ }));
    const firstRow = await screen.findByRole("option", { name: /virtual history 0/ });

    expect(document.querySelectorAll(".history-row").length).toBeLessThan(200);
    expect(firstRow.getAttribute("aria-setsize")).toBe("200");
  });

  it("defers file change refreshes until File Status is opened", async () => {
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          createStatusFile("src/deferred.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Commit History/ }), {
      button: 0
    });

    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /File Status/ }), {
      button: 0
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/deferred\.ts/ })).toBeTruthy();
  });

  it("ignores file change events for stale repositories", async () => {
    render(<App />);
    await flushRendererAsync();

    emitRepoChanged({
      repoPath: "D:\\Other"
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);
  });

  it("coalesces file changes during an in-flight refresh into one trailing refresh", async () => {
    const pendingRefresh = defer<RepoSummary>();
    const largeFiles = Array.from({ length: 10_000 }, (_, index) => createStatusFile(
      `generated/live-${index.toString().padStart(5, "0")}.ts`,
      { isUnstaged: true, worktreeStatus: "M" }
    ));
    const finalFile = createStatusFile("src/final.ts", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    let activeSummaryCalls = 0;
    let maxActiveSummaryCalls = 0;
    vi.mocked(githead.getRepoSummary).mockImplementation(async () => {
      const call = vi.mocked(githead.getRepoSummary).mock.calls.length;
      activeSummaryCalls += 1;
      maxActiveSummaryCalls = Math.max(maxActiveSummaryCalls, activeSummaryCalls);
      try {
        if (call === 2) {
          return await pendingRefresh.promise;
        }
        return createSummary({
          files: call === 1 ? largeFiles : call === 3 ? [finalFile] : []
        });
      } finally {
        activeSummaryCalls -= 1;
      }
    });

    render(<App />);
    await flushRendererAsync();
    expect(screen.getAllByRole("option").length).toBeLessThan(100);
    const metadataCallsBeforeLiveUpdate = vi.mocked(githead.getRepoMetadata).mock.calls.length;
    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    emitRepoChanged();
    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    pendingRefresh.resolve(createSummary());
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(3);
    expect(githead.getRepoMetadata).toHaveBeenCalledTimes(metadataCallsBeforeLiveUpdate);
    expect(maxActiveSummaryCalls).toBe(1);
    expect(screen.getByRole("option", { name: /src\/final\.ts/ })).toBeTruthy();
  });

  it("keeps file changes dirty instead of refreshing during repository operations", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [
          createStatusFile("src/pending.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }))
      .mockResolvedValue(createSummary());
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("loads recent repositories and starts on the most recent repo", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: `Switch to ${recentRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` })).toBeTruthy();
    expect(screen.queryByText(otherRepo)).toBeNull();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(recentRepo);
  });

  it("groups linked worktrees and opens an occupied branch in its workspace", async () => {
    const user = userEvent.setup();
    const linked = "D:\\Githead-feature";
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [
        { path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null },
        { path: linked, head: "def", branch: "feature/worktrees", isMain: false, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }
      ]
    }]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      branch: requestedRepoPath === linked ? "feature/worktrees" : "main",
      branches: [
        { name: "main", current: requestedRepoPath === repoPath, upstream: null, worktreePath: repoPath },
        { name: "feature/worktrees", current: requestedRepoPath === linked, upstream: null, worktreePath: linked }
      ]
    }));

    render(<App />);
    await waitForRepositoryWorkspace();
    const disclosure = await screen.findByRole("button", { name: "Expand worktrees for Githead" });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("feature/worktrees")).toBeNull();
    await user.click(disclosure);
    expect(await screen.findByText("feature/worktrees")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse worktrees for Githead" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Add worktree" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("option", { name: /feature\/worktrees/ }));
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(linked));
    expect(githead.switchBranch).not.toHaveBeenCalled();
  });

  it("opens a repository's last-used worktree without expanding its worktree list", async () => {
    const user = userEvent.setup();
    const linked = "D:\\Githead-feature";
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: linked,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [
        { path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null },
        { path: linked, head: "def", branch: "feature/worktrees", isMain: false, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }
      ]
    }]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.addRepoRecent).mockResolvedValue([{ anchorPath: repoPath, lastUsedPath: linked }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    const disclosure = await screen.findByRole("button", { name: "Expand worktrees for Githead" });
    expect(screen.queryByText("feature/worktrees")).toBeNull();
    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));

    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(linked));
    expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: linked, anchorPath: repoPath });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("feature/worktrees")).toBeNull();
  });

  it("creates a new worktree with the guided sibling destination", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [{ path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }]
    }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add worktree" }));
    await user.type(screen.getByLabelText("Branch"), "feature/worktrees");
    await waitFor(() => expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("D:\\Githead-feature-worktrees"));
    await user.click(screen.getByRole("button", { name: "Create Worktree" }));

    await waitFor(() => expect(githead.createWorktree).toHaveBeenCalledWith({
      repoPath,
      mode: "new-branch",
      branchName: "feature/worktrees",
      destinationPath: "D:\\Githead-feature-worktrees",
      startPoint: "HEAD",
      track: false,
      operationId: expect.any(String)
    }));
  });

  it("does not switch to a created worktree after the user moves repositories during group reload", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Worktree-B";
    const destinationPath = "D:\\Githead-feature-late";
    const pendingGroupReload = defer<Awaited<ReturnType<GitheadApi["getRepositoryGroups"]>>>();
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    const groups = [{
      id: "d:\\githead\\.git",
      kind: "git" as const,
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [{ path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }]
    }];
    let blockGroupReload = false;
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepositoryGroups).mockImplementation(() => (
      blockGroupReload ? pendingGroupReload.promise : Promise.resolve(groups)
    ));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: "Add worktree" }));
    await user.type(screen.getByLabelText("Branch"), "feature/late");
    await user.clear(screen.getByLabelText("Destination"));
    await user.type(screen.getByLabelText("Destination"), destinationPath);
    const groupCallsBeforeCreate = vi.mocked(githead.getRepositoryGroups).mock.calls.length;
    blockGroupReload = true;
    await user.click(screen.getByRole("button", { name: "Create Worktree" }));

    await waitFor(() => expect(githead.createWorktree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(githead.getRepositoryGroups).toHaveBeenCalledTimes(groupCallsBeforeCreate + 1));
    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));

    pendingGroupReload.resolve(groups);
    await flushRendererAsync();

    expect(vi.mocked(githead.getRepoSummary).mock.calls.some(([requestedRepoPath]) => requestedRepoPath === destinationPath)).toBe(false);
  });

  it("shows local push and pull counts beside recent repositories", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: recentRepo,
        ahead: 1,
        behind: 4
      }),
      createRepoSyncStatus({
        repoPath: otherRepo,
        behind: 2
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      ahead: 1,
      behind: 4
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    const recentButton = await screen.findByRole("button", { name: `Switch to ${recentRepo}, 1 commit ahead, 4 commits behind` });
    const otherButton = screen.getByRole("button", { name: `Switch to ${otherRepo}, 2 commits behind` });
    expect(recentButton).toBeTruthy();
    expect(otherButton).toBeTruthy();
    expect(within(recentButton).getByText("1 ↑").classList.contains("is-ahead")).toBe(true);
    expect(within(recentButton).getByText("4 ↓").classList.contains("is-behind")).toBe(true);
    expect(within(otherButton).getByText("2 ↓").classList.contains("is-behind")).toBe(true);
  });

  it("shows VCS icons beside recent repositories", async () => {
    const loreRepo = "D:\\Work\\Story";
    const gitRepo = "D:\\Work\\Git";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(loreRepo, gitRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(loreRepo, gitRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: loreRepo,
        kind: "lore"
      }),
      createRepoSyncStatus({
        repoPath: gitRepo
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      kind: requestedRepoPath === loreRepo ? "lore" : "git"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    const repositories = within(screen.getByRole("region", { name: "Repositories" }));
    expect(repositories.getByLabelText("Lore repository")).toBeTruthy();
    expect(repositories.getByLabelText("Git repository")).toBeTruthy();
    expect(repositories.queryByText("Lore")).toBeNull();
  });

  it("leaves recent repository names unchanged when sync counts are zero or unavailable", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: recentRepo
      }),
      createRepoSyncStatus({
        repoPath: otherRepo,
        isValid: false,
        error: "Selected folder is not a git repository."
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.queryByText(/\d+ ↑|\d+ ↓/)).toBeNull();
  });

  it("shows the setup screen on first run without probing the old hard-coded fallback", async () => {
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText("Select a repository to continue.")).toBeTruthy();
    await waitFor(() => {
      expect(githead.getRepoSummary).not.toHaveBeenCalled();
    });
    expect(screen.queryByDisplayValue("D:\\Githead")).toBeNull();
  });

  it("shows the setup screen when the initial recent repository is invalid", async () => {
    const invalidRepo = "D:\\MissingRepo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(invalidRepo));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      repoPath: invalidRepo,
      isValid: false,
      validationErrors: [
        "Selected folder is not a git repository."
      ]
    }));

    render(<App />);

    expect(await screen.findByText("Select a repository to continue.")).toBeTruthy();
    expect(screen.getByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByText("MissingRepo")).toBeTruthy();
    const recents = screen.getByRole("region", { name: "Repositories" });
    expect(within(recents).getByRole("button", { name: `Switch to ${invalidRepo}` })).toBeTruthy();
    expect(within(recents).queryByText(invalidRepo)).toBeNull();
  });

  it("shows a safe.directory prompt for an initial recent repository blocked by dubious ownership", async () => {
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(blockedRepo));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    expect(await screen.findByText("Git ownership check blocked this repository.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Git Exception" })).toBeTruthy();
    expect(screen.getByText("D:/Work/Blocked")).toBeTruthy();
  });

  it("switches repositories from a recent entry", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: otherRepo });
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Switch to ${repoPath}`,
      `Switch to ${otherRepo}`
    ]);
  });

  it("restores each repository's in-session commit history scope", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.getCommitHistory).mockImplementation(async ({ repoPath: requestedRepoPath, scope }) => [createCommit({
      hash: requestedRepoPath === repoPath ? "a".repeat(40) : "b".repeat(40),
      subject: `${scope} history for ${requestedRepoPath}`,
      refs: scope === "all" ? [{ name: "origin/feature", kind: "remote" }] : []
    })]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("button", { name: "All" }));
    await screen.findByText(`all history for ${repoPath}`);

    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await screen.findByText(`current history for ${otherRepo}`);
    expect(screen.getByRole("button", { name: "Current" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));
    await screen.findByText(`all history for ${repoPath}`);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      repoPath,
      scope: "all"
    })));
  });

  it("keeps only the active Repository summary visible during rapid A to B to A switching", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingOther = defer<RepoSummary>();
    const pendingReturn = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [createStatusFile("src/initial-a.ts", { isUnstaged: true, worktreeStatus: "M" })]
      }))
      .mockReturnValueOnce(pendingOther.promise)
      .mockReturnValueOnce(pendingReturn.promise);

    render(<App />);
    await screen.findByRole("option", { name: /src\/initial-a\.ts/ });

    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));
    expect(screen.getByRole("option", { name: /src\/initial-a\.ts/ })).toBeTruthy();
    pendingReturn.resolve(createSummary({
      files: [createStatusFile("src/final-a.ts", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    await screen.findByRole("option", { name: /src\/final-a\.ts/ });

    pendingOther.resolve(createSummary({
      repoPath: otherRepo,
      files: [createStatusFile("src/stale-b.ts", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    await flushRendererAsync();

    expect(screen.getByRole("button", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("option", { name: /src\/stale-b\.ts/ })).toBeNull();
    expect(vi.mocked(githead.getRepoSummary).mock.calls.map(([path]) => path)).toEqual([
      repoPath,
      otherRepo,
      repoPath
    ]);
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "identity:2" });
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "status:2" });
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "metadata:2" });
  });

  it("renders Repository identity before deferred File Status and metadata", async () => {
    const pendingStatus = defer<Awaited<ReturnType<GitheadApi["getRepoStatus"]>>>();
    const pendingMetadata = defer<Awaited<ReturnType<GitheadApi["getRepoMetadata"]>>>();
    vi.mocked(githead.getRepoIdentity).mockResolvedValue({ repoPath, generation: 1, kind: "git", capabilities: gitCapabilities(), isValid: true, branch: "fast/identity", hasHead: true, safeDirectory: null, validationErrors: [] });
    vi.mocked(githead.getRepoStatus).mockReturnValue(pendingStatus.promise);
    vi.mocked(githead.getRepoMetadata).mockReturnValue(pendingMetadata.promise);

    render(<App />);

    expect(await screen.findByText("fast/identity")).toBeTruthy();
    expect(screen.queryByRole("option", { name: /src\/later\.ts/ })).toBeNull();
    pendingStatus.resolve({ repoPath, generation: 1, ahead: null, behind: null, files: [createStatusFile("src/later.ts", { isUnstaged: true, worktreeStatus: "M" })] });
    pendingMetadata.resolve({ repoPath, generation: 1, upstream: null, branches: [], remotes: [], remoteBranches: [], defaultRemoteBranch: null, commitsAheadOfDefaultBranch: null, githubRepository: null, actionsConfig: createActionsConfig() });
    expect(await screen.findByRole("option", { name: /src\/later\.ts/ })).toBeTruthy();
  });

  it("ignores an unresolved diff from Repository A after switching to Repository B", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingDiff = defer<GitFileDiff>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      files: [createStatusFile(
        requestedRepoPath === repoPath ? "src/a.ts" : "src/b.ts",
        { isUnstaged: true, worktreeStatus: "M" }
      )]
    }));
    vi.mocked(githead.getFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await user.click(await screen.findByRole("option", { name: /src\/a\.ts/ }));
    expect(githead.getFileDiff).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await screen.findByRole("option", { name: /src\/b\.ts/ });

    pendingDiff.resolve(createTextDiff("src/a.ts", "stale-a-diff"));
    await flushRendererAsync();

    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText(/stale-a-diff/)).toBeNull();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(githead.getFileDiff).toHaveBeenCalledTimes(1);
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "diff:1" });
  });

  it("ignores stale Git identity after switching Repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingIdentity = defer<GitIdentitySettings>();
    const identity = (name: string): GitIdentitySettings => ({
      scope: "repository",
      name,
      email: `${name.toLowerCase()}@example.test`,
      repository: { name, email: `${name.toLowerCase()}@example.test` },
      global: { name: "Global", email: "global@example.test" }
    });
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.getGitIdentity).mockImplementation(async (requestedRepoPath) => {
      if (!requestedRepoPath) return identity("Empty");
      if (requestedRepoPath === repoPath) return pendingIdentity.promise;
      return identity("Repository B");
    });

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await waitFor(() => expect(githead.getGitIdentity).toHaveBeenCalledWith(otherRepo));
    pendingIdentity.resolve(identity("Stale Repository A"));
    await flushRendererAsync();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Git Identity" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Repository B");
  });

  it("removes a recent entry without switching repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.removeRepoRecent).mockResolvedValue(repositoryRecents(repoPath));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.getRepoSummary).mockClear();
    await user.click(screen.getByRole("button", { name: `Remove ${otherRepo} from recent repositories` }));

    await waitFor(() => {
      expect(githead.removeRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
    expect(screen.getByRole("button", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("reorders repositories with the keyboard handle", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repositoryRecents(...repoPaths));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Reorder ${otherRepo}` }));
    await user.keyboard("{ArrowUp}");

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Switch to ${otherRepo}`,
      `Switch to ${repoPath}`
    ]);
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("reorders repositories with drag and drop", async () => {
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repositoryRecents(...repoPaths));

    render(<App />);

    await waitForRepositoryWorkspace();
    const dragHandle = screen.getByRole("button", { name: `Reorder ${otherRepo}` });
    const targetRow = screen.getByRole("button", { name: `Switch to ${repoPath}` }).closest(".repo-recent-row");
    if (!targetRow) {
      throw new Error("Expected repository row.");
    }

    vi.spyOn(targetRow, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 260,
      bottom: 40,
      width: 260,
      height: 40,
      toJSON: () => ({})
    });
    fireEvent.mouseDown(dragHandle);
    fireEvent.mouseUp(targetRow, { clientY: 1 });

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("rolls back repository order when reordering fails", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockRejectedValue(new Error("Unable to save order."));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Reorder ${otherRepo}` }));
    await user.keyboard("{ArrowUp}");

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    await waitFor(() => {
      const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
        name: /^Switch to /
      });
      expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
        `Switch to ${repoPath}`,
        `Switch to ${otherRepo}`
      ]);
    });
  });

  it("shows a recent repository in Explorer from the context menu", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));

    render(<App />);

    await waitForRepositoryWorkspace();
    fireEvent.contextMenu(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    expect(await screen.findByText(otherRepo)).toBeTruthy();
    await user.click(await screen.findByRole("menuitem", { name: "Show in Explorer" }));

    await waitFor(() => {
      expect(githead.showRepositoryInExplorer).toHaveBeenCalledWith(otherRepo);
    });
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("opens and saves AI settings for a recent repository from the context menu", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));

    render(<App />);

    await waitForRepositoryWorkspace();
    fireEvent.contextMenu(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await user.click(await screen.findByRole("menuitem", { name: "AI Settings…" }));

    const dialog = await screen.findByRole("dialog", { name: "Repository AI Settings" });
    await waitFor(() => expect(githead.getRepositoryAiSettings).toHaveBeenCalledWith({ repoPath: otherRepo }));
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveRepositoryAiSettings).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: otherRepo,
      enabled: true
    })));
  });

  it("adds a ninth browsed repository to the bottom and reveals its active row", async () => {
    const user = userEvent.setup();
    const browsedRepo = "D:\\Work\\Browsed";
    const existingRepos = [
      repoPath,
      ...Array.from({ length: 7 }, (_value, index) => `D:\\Work\\Existing${index + 1}`)
    ];
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(...existingRepos));
    vi.mocked(githead.chooseRepo).mockResolvedValue(browsedRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) =>
      repositoryRecents(...(request.repoPath === repoPath ? existingRepos : [...existingRepos, request.repoPath]))
    );

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    scrollIntoView.mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${browsedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: browsedRepo });
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      ...existingRepos.map((existingRepo) => `Switch to ${existingRepo}`),
      `Switch to ${browsedRepo}`
    ]);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest"
    });
  });

  it("does not add an invalid browsed repository to repositories", async () => {
    const user = userEvent.setup();
    const invalidRepo = "D:\\NotARepo";
    vi.mocked(githead.chooseRepo).mockResolvedValue(invalidRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      isValid: requestedRepoPath !== invalidRepo,
      validationErrors: requestedRepoPath === invalidRepo ? [
        "Selected folder is not a git repository."
      ] : []
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    expect(await screen.findByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByText(invalidRepo)).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(invalidRepo);
  });

  it("shows a safe.directory prompt for a browsed repository blocked by dubious ownership", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));

    expect(await screen.findByText("Git ownership check blocked this repository.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Git Exception" })).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(blockedRepo);
  });

  it("does not add a safe.directory exception when the prompt is canceled", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    expect(screen.getByRole("heading", { name: "Allow Git Ownership Exception?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(githead.addSafeDirectory).not.toHaveBeenCalled();
    });
  });

  it("recovers a stale safe.directory operation from its dialog", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    const pendingAdd = defer<GitOperationResult>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));
    vi.mocked(githead.addSafeDirectory).mockReturnValue(pendingAdd.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValue({ accepted: false, state: "not-found" });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    const operationId = vi.mocked(githead.addSafeDirectory).mock.calls[0]?.[0].operationId;
    expect(operationId).toEqual(expect.any(String));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Allow Git Ownership Exception?" })).toBeNull());

    pendingAdd.resolve(createOperationResult({ repoPath: blockedRepo }));
    await flushRendererAsync();
  });

  it("adds a safe.directory exception, refreshes, and adds the repository to recents", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSafeDirectorySummary(blockedRepo))
      .mockResolvedValueOnce(createSummary({
        repoPath: blockedRepo
      }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    await waitForRepositoryWorkspace();
    expect(githead.addSafeDirectory).toHaveBeenCalledWith({
      repoPath: "D:/Work/Blocked",
      operationId: expect.any(String)
    });
    expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: blockedRepo });
  });

  it("keeps setup visible and shows the config error when safe.directory cannot be added", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));
    vi.mocked(githead.addSafeDirectory).mockResolvedValue(createOperationResult({
      repoPath: "D:/Work/Blocked",
      exitCode: 1,
      stderr: "error: could not lock config file"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    expect(await screen.findByText("error: could not lock config file")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(blockedRepo);
  });
});
