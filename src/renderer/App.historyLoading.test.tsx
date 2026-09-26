// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createCommit, defer, emitRepoChanged, flushRendererAsync, githead, waitForRepositoryWorkspace, type GitCommitGraphRow } from "./AppTestHarness";
import { App } from "./App";

function controlIdleCallbacks(): () => Promise<void> {
  const callbacks = new Map<number, IdleRequestCallback>();
  let nextCallbackId = 0;
  vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
    const id = ++nextCallbackId;
    callbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => callbacks.delete(id)));
  return async () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    await act(async () => {
      for (const callback of pending) callback({ didTimeout: false, timeRemaining: () => 50 });
    });
    await flushRendererAsync();
  };
}

describe("history loading recovery", () => {
  it("retries an initial history failure without leaving the active tab or changing scope", async () => {
    const user = userEvent.setup();
    const runIdleCallbacks = controlIdleCallbacks();
    const failedHistory = defer<GitCommitGraphRow[]>();
    const retryHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockReturnValueOnce(failedHistory.promise)
      .mockReturnValueOnce(retryHistory.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);
    failedHistory.reject(new Error("History is temporarily unavailable."));
    await flushRendererAsync();
    expect(screen.getByText("History is temporarily unavailable.")).toBeTruthy();

    const retryButton = screen.getByRole("button", { name: "Retry loading commit history" });
    expect(retryButton.textContent).toBe("Retry");
    await user.click(retryButton);

    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Loading commit history")).toBeTruthy();
    expect(screen.queryByText("History is temporarily unavailable.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry loading commit history" })).toBeNull();
    await runIdleCallbacks();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);

    retryHistory.resolve([createCommit({ subject: "feat: recovered history" })]);
    expect(await screen.findByRole("option", { name: /recovered history/ })).toBeTruthy();
    expect(screen.queryByText("Loading commit history")).toBeNull();
    expect(screen.getByRole("tab", { name: /Commit History/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Current branch" }).getAttribute("aria-pressed")).toBe("true");
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed explicit retry manual and allows another retry", async () => {
    const user = userEvent.setup();
    const runIdleCallbacks = controlIdleCallbacks();
    const failedHistory = defer<GitCommitGraphRow[]>();
    const failedRetry = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockReturnValueOnce(failedHistory.promise)
      .mockReturnValueOnce(failedRetry.promise)
      .mockResolvedValue([createCommit({ subject: "feat: recovered after retry failure" })]);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    failedHistory.reject(new Error("Initial history load failed."));
    await flushRendererAsync();
    await user.click(screen.getByRole("button", { name: "Retry loading commit history" }));
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);

    failedRetry.reject(new Error("History is still unavailable."));
    await flushRendererAsync();
    expect(screen.getByText("History is still unavailable.")).toBeTruthy();
    expect(screen.queryByText("Loading commit history")).toBeNull();
    await runIdleCallbacks();
    await runIdleCallbacks();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Retry loading commit history" }));
    expect(await screen.findByRole("option", { name: /recovered after retry failure/ })).toBeTruthy();
    expect(screen.queryByText("History is still unavailable.")).toBeNull();
    expect(screen.getByRole("tab", { name: /Commit History/ }).getAttribute("aria-selected")).toBe("true");
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(3);
  });

  it.each(["tab", "repository change"])("stops idle retries after failure and recovers on %s", async (retry) => {
    const user = userEvent.setup();
    const runIdleCallbacks = controlIdleCallbacks();
    const failedHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory).mockReturnValue(failedHistory.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    if (retry === "repository change") {
      await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    }
    await runIdleCallbacks();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);
    failedHistory.reject(new Error("History is temporarily unavailable."));
    await flushRendererAsync();

    await runIdleCallbacks();
    await runIdleCallbacks();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);

    vi.mocked(githead.getCommitHistory).mockResolvedValue([createCommit({ subject: "feat: recovered history" })]);
    if (retry === "repository change") {
      emitRepoChanged({ reason: "filesystem-metadata" });
      await waitFor(() => expect(githead.getRepoIdentity).toHaveBeenCalledTimes(2));
      await flushRendererAsync();
      await runIdleCallbacks();
      expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
    }
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(await screen.findByRole("option", { name: /recovered history/ })).toBeTruthy();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });
});
