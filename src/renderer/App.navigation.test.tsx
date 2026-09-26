// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createCommit, createCommitDetails, createSummary, createTextDiff, defer, githead, repoPath, repositoryRecents, waitForRepositoryWorkspace, type RepoSummary } from "./AppTestHarness";
import { App } from "./App";

async function goBack(): Promise<void> {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function goForward(): Promise<void> {
  await act(async () => {
    window.history.forward();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function selectedTab(name: RegExp): HTMLElement {
  const tab = screen.getByRole("tab", { name });
  expect(tab.getAttribute("aria-selected")).toBe("true");
  return tab;
}

describe("workspace navigation", () => {
  it("restores tabs through native history and discards the forward path after a new screen", async () => {
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: "Go back" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("tab", { name: /Activity/ }));
    await goBack();
    selectedTab(/Commit History/);
    await goBack();
    selectedTab(/File Status/);
    await goForward();
    selectedTab(/Commit History/);
    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    expect(screen.getByRole("button", { name: "Go forward" }).hasAttribute("disabled")).toBe(true);
    await goBack();
    selectedTab(/Commit History/);
  });

  it("supports toolbar buttons and Alt+Left/Right without recording the same tab twice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    await waitFor(() => selectedTab(/File Status/));
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() => selectedTab(/Commit History/));
    await user.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => selectedTab(/File Status/));
    await user.click(screen.getByRole("button", { name: "Go forward" }));
    await waitFor(() => selectedTab(/Commit History/));
  });

  it("restores file history and blame, and keeps commit selection out of the Back steps", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 3, deletions: 1 };
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff(file.path, "navigation diff"));
    vi.mocked(githead.getFileHistory).mockResolvedValue({ repoPath, startHash: commit.hash, requestedPath: file.path, hasMore: false, entries: [{ ...commit, path: file.path, status: "M" }] });
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    const fileHistory = await screen.findByRole("region", { name: `File History for ${file.path}` });
    await user.click(await within(fileHistory).findByRole("button", { name: "Blame this version" }));
    await waitFor(() => expect(githead.getFileBlame).toHaveBeenCalled());
    await goBack();
    expect(await screen.findByRole("region", { name: `File History for ${file.path}` })).toBeTruthy();
    expect(githead.getFileHistory).toHaveBeenCalledTimes(1);
    await goBack();
    expect(await screen.findByRole("listbox", { name: "Commit history" })).toBeTruthy();
    await goBack();
    selectedTab(/File Status/);
    await goForward();
    await goForward();
    expect(await screen.findByRole("region", { name: `File History for ${file.path}` })).toBeTruthy();
  });

  it("restores the repository and its screen together", async () => {
    const user = userEvent.setup();
    const otherPath = "D:\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Activity/ }));
    await user.click(screen.getByRole("button", { name: `Switch to ${otherPath}` }));
    await waitFor(() => expect(githead.getRepoIdentity).toHaveBeenCalledWith(expect.objectContaining({ repoPath: otherPath })));
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await goBack();
    await goBack();
    await waitFor(() => selectedTab(/Activity/));
    expect(within(screen.getByRole("navigation", { name: "Workspace navigation" })).getByRole("button", { name: "Githead" })).toBeTruthy();
  });

  it("does not leave the screen or reload while a dialog is open", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("dialog");
    const before = window.history.state;
    await goBack();
    await waitFor(() => expect(window.history.state).toEqual(before));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("starts a new history session on remount and ignores locations from the previous session", async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    first.unmount();
    render(<App />);
    await waitForRepositoryWorkspace();
    const initial = window.history.state;
    await goBack();
    await waitFor(() => expect(window.history.state).toEqual(initial));
    selectedTab(/File Status/);
    await user.click(screen.getByRole("tab", { name: /Activity/ }));
    await goBack();
    selectedTab(/File Status/);
    expect(screen.getByRole("button", { name: "Go back" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not reopen a restored file screen after the user leaves during a repository refresh", async () => {
    const user = userEvent.setup();
    const otherPath = "D:\\Other";
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 3, deletions: 1 };
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getFileHistory).mockResolvedValue({ repoPath, startHash: commit.hash, requestedPath: file.path, hasMore: false, entries: [{ ...commit, path: file.path, status: "M" }] });
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    await screen.findByRole("region", { name: `File History for ${file.path}` });
    await user.click(screen.getByRole("button", { name: `Switch to ${otherPath}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Switch to ${otherPath}` }).getAttribute("aria-current")).toBe("true"));

    const pending = defer<RepoSummary>();
    vi.mocked(githead.getRepoSummary).mockImplementation((path) => path === repoPath ? pending.promise : Promise.resolve(createSummary({ repoPath: path })));
    await goBack();
    await user.click(screen.getByRole("tab", { name: /Activity/ }));
    await act(async () => pending.resolve(createSummary()));
    selectedTab(/Activity/);
    expect(githead.getFileHistory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(githead.getFileHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Blame this version" })).toBeTruthy();
  });
});
