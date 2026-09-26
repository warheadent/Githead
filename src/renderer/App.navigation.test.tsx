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
  it("reloads the matching file history after Back crosses another file's cached history", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    const files = ["src/first.ts", "src/second.ts"].map((path) => ({ path, status: "M", additions: 1, deletions: 0 }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files }));
    vi.mocked(githead.getCommitFileDiff).mockImplementation(async ({ path }) => createTextDiff(path, `diff for ${path}`));
    vi.mocked(githead.getFileHistory).mockImplementation(async ({ path, startHash }) => ({
      repoPath, startHash, requestedPath: path, hasMore: false,
      entries: [{ ...commit, path, status: "M", subject: `change to ${path}` }]
    }));
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/first\.ts/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    const first = await screen.findByRole("region", { name: "File History for src/first.ts" });
    await within(first).findByText("diff for src/first.ts");
    await user.click(within(first).getByRole("button", { name: "Back" }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/second\.ts/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    const second = await screen.findByRole("region", { name: "File History for src/second.ts" });
    await within(second).findByText("diff for src/second.ts");

    await goBack();
    await goBack();
    const restored = await screen.findByRole("region", { name: "File History for src/first.ts" });
    expect(await within(restored).findByText("change to src/first.ts")).toBeTruthy();
    expect(await within(restored).findByText("diff for src/first.ts")).toBeTruthy();
    expect(within(restored).queryByText("change to src/second.ts")).toBeNull();
  });

  it("loads file history when leaving blame restored from another repository", async () => {
    const user = userEvent.setup();
    const otherPath = "D:\\Other";
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 1, deletions: 0 };
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff(file.path, "restored file diff"));
    vi.mocked(githead.getFileHistory).mockResolvedValue({ repoPath, startHash: commit.hash, requestedPath: file.path, hasMore: false, entries: [{ ...commit, path: file.path, status: "M", subject: "restored file change" }] });
    vi.mocked(githead.getFileBlame).mockResolvedValue({ kind: "text", repoPath, hash: commit.hash, path: file.path, byteLength: 0, commits: [], lines: [] });
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    await user.click(await screen.findByRole("button", { name: "Blame this version" }));
    await screen.findByRole("region", { name: `Blame for ${file.path}` });
    await user.click(screen.getByRole("button", { name: `Switch to ${otherPath}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Switch to ${otherPath}` }).getAttribute("aria-current")).toBe("true"));
    await goBack();
    const blame = await screen.findByRole("region", { name: `Blame for ${file.path}` });
    await waitFor(() => expect(githead.getFileBlame).toHaveBeenCalledTimes(2));
    await user.click(within(blame).getByRole("button", { name: "Back to File History" }));
    const restored = await screen.findByRole("region", { name: `File History for ${file.path}` });
    expect(await within(restored).findByText("restored file change")).toBeTruthy();
    expect(await within(restored).findByText("restored file diff")).toBeTruthy();
  });

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
