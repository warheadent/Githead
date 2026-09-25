// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createCommit, defer, emitRepoChanged, flushRendererAsync, githead, waitForRepositoryWorkspace, type GitCommitGraphRow } from "./AppTestHarness";
import { App } from "./App";

describe("history loading recovery", () => {
  it.each(["tab", "repository change"])("stops idle retries after failure and recovers on %s", async (retry) => {
    const user = userEvent.setup();
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextCallbackId = 0;
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      const id = ++nextCallbackId;
      callbacks.set(id, callback);
      return id;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => callbacks.delete(id)));
    const runIdleCallbacks = async () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      await act(async () => {
        for (const callback of pending) callback({ didTimeout: false, timeRemaining: () => 50 });
      });
      await flushRendererAsync();
    };
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
