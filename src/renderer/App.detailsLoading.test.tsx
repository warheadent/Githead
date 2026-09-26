// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createCommit,
  createCommitDetails,
  createTextDiff,
  defer,
  emitRepoChanged,
  githead,
  waitForRepositoryWorkspace,
  type GitFileDiff,
  type GitheadApi
} from "./AppTestHarness";
import { App } from "./App";

describe("Commit detail loading", { timeout: 10_000 }, () => {
  it("ignores the previous commit diff while the next commit details load", async () => {
    const user = userEvent.setup();
    const first = createCommit({ hash: "a".repeat(40), subject: "first commit" });
    const second = createCommit({ hash: "b".repeat(40), subject: "second commit" });
    const pendingDiff = defer<GitFileDiff>();
    const pendingDetails = defer<Awaited<ReturnType<GitheadApi["getCommitDetails"]>>>();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([first, second]);
    vi.mocked(githead.getCommitDetails).mockImplementation(({ hash }) => hash === first.hash
      ? Promise.resolve(createCommitDetails(hash, {
        files: [{ path: "first.txt", status: "M", additions: 1, deletions: 0 }]
      }))
      : pendingDetails.promise);
    vi.mocked(githead.getCommitFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(1));
    const previousRequestId = vi.mocked(githead.getCommitFileDiff).mock.calls[0]![0].requestId;

    await user.click(screen.getByRole("option", { name: /second commit/ }));
    await waitFor(() => expect(githead.getCommitDetails).toHaveBeenCalledTimes(2));
    await act(async () => pendingDiff.resolve(createTextDiff("first.txt", "obsolete-commit-diff")));

    expect(document.querySelector(".diff-output")?.textContent ?? "").not.toContain("obsolete-commit-diff");
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: previousRequestId });
    await act(async () => pendingDetails.resolve(createCommitDetails(second.hash, { files: [] })));
    expect(document.querySelector(".diff-output")?.textContent ?? "").not.toContain("obsolete-commit-diff");
  });

  it("clears the old diff loading state and ignores its error for a commit without files", async () => {
    const user = userEvent.setup();
    const first = createCommit({ hash: "a".repeat(40), subject: "first commit" });
    const second = createCommit({ hash: "b".repeat(40), subject: "empty commit" });
    const pendingDiff = defer<GitFileDiff>();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([first, second]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash, {
      files: hash === first.hash ? [{ path: "first.txt", status: "M", additions: 1, deletions: 0 }] : []
    }));
    vi.mocked(githead.getCommitFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("option", { name: /empty commit/ }));
    await waitFor(() => expect(githead.getCommitDetails).toHaveBeenCalledTimes(2));

    expect(screen.queryByText("Loading diff")).toBeNull();
    await act(async () => pendingDiff.reject(new Error("obsolete diff error")));
    expect(screen.queryByText("obsolete diff error")).toBeNull();
    expect(screen.getByText("Select a file to view the diff")).toBeTruthy();
  });

  it("does not restart the current diff after an earlier read of the same commit fails", async () => {
    const user = userEvent.setup();
    const first = createCommit({ hash: "a".repeat(40), subject: "first commit" });
    const second = createCommit({ hash: "b".repeat(40), subject: "second commit" });
    const pendingDetails = defer<Awaited<ReturnType<GitheadApi["getCommitDetails"]>>>();
    const pendingDiff = defer<GitFileDiff>();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([first, second]);
    vi.mocked(githead.getCommitDetails).mockReturnValueOnce(pendingDetails.promise)
      .mockImplementation(async ({ hash }) => createCommitDetails(hash, {
        files: hash === first.hash ? [{ path: "first.txt", status: "M", additions: 1, deletions: 0 }] : []
      }));
    vi.mocked(githead.getCommitFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(githead.getCommitDetails).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("option", { name: /second commit/ }));
    await user.click(screen.getByRole("option", { name: /first commit/ }));
    await waitFor(() => expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(1));

    await act(async () => pendingDetails.reject(new Error("Earlier read was cancelled")));
    expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Earlier read was cancelled")).toBeNull();
    await act(async () => pendingDiff.resolve(createTextDiff("first.txt", "current-commit-diff")));
    expect(document.querySelector(".diff-output")?.textContent).toContain("current-commit-diff");
  });

  it.each(["details", "diff"])("ignores pending %s when a refresh removes every commit", async (pendingRead) => {
    const user = userEvent.setup();
    const commit = createCommit({ hash: "a".repeat(40), subject: "removed commit" });
    const details = createCommitDetails(commit.hash, {
      body: "obsolete commit body",
      files: [{ path: "first.txt", status: "M", additions: 1, deletions: 0 }]
    });
    const pendingDetails = defer<Awaited<ReturnType<GitheadApi["getCommitDetails"]>>>();
    const pendingDiff = defer<GitFileDiff>();
    vi.mocked(githead.getCommitHistory).mockResolvedValueOnce([commit]).mockResolvedValue([]);
    vi.mocked(githead.getCommitDetails).mockReturnValue(pendingRead === "details"
      ? pendingDetails.promise
      : Promise.resolve(details));
    vi.mocked(githead.getCommitFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(pendingRead === "details" ? githead.getCommitDetails : githead.getCommitFileDiff).toHaveBeenCalledTimes(1));
    emitRepoChanged({ reason: "filesystem-metadata" });
    await screen.findByText("No commits in this repository.");

    await act(async () => {
      pendingDetails.resolve(details);
      pendingDiff.resolve(createTextDiff("first.txt", "obsolete-commit-diff"));
    });
    expect(screen.queryByRole("button", { name: "Copy commit SHA" })).toBeNull();
    expect(screen.queryByText("obsolete commit body")).toBeNull();
    expect(document.querySelector(".diff-output")?.textContent ?? "").not.toContain("obsolete-commit-diff");
    expect(screen.queryByText("Loading commit details")).toBeNull();
    expect(screen.queryByText("Loading diff")).toBeNull();
  });
});
