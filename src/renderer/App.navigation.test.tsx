// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { chooseSwitcherOption, closeQuickSwitcher, createCommit, createCommitDetails, createSummary, createTextDiff, defer, githead, openQuickSwitcher, openSettings, openWorkspaceView, repoPath, repositoryRecents, switchToRepository, waitForRepositoryWorkspace, type RepoSummary } from "./AppTestHarness";
import { App } from "./App";

async function traverseHistory(direction: "back" | "forward"): Promise<void> {
  await act(() => new Promise<void>((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    window.history[direction]();
  }));
}

async function goBack(): Promise<void> {
  await traverseHistory("back");
}

async function goForward(): Promise<void> {
  await traverseHistory("forward");
}

/** Checks the quick switcher's Go back or Go forward command, then closes the switcher so history can move again. */
async function expectNavigationCommand(name: "Go back" | "Go forward", enabled: boolean, user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const dialog = await openQuickSwitcher(user);
  const option = within(dialog).getByRole("option", { name });
  expect(option.getAttribute("aria-disabled")).toBe(enabled ? null : "true");
  await closeQuickSwitcher(user);
}

/** The header names the open repository on its switcher button. */
function currentRepositoryButton(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Workspace navigation" })).getByRole("button", { name: `Switch repository: ${name}` });
}

function selectedTab(name: RegExp): HTMLElement {
  const tab = screen.getByRole("tab", { name });
  expect(tab.getAttribute("aria-selected")).toBe("true");
  return tab;
}

describe("workspace navigation", { timeout: 10_000 }, () => {
  it.each(["loaded", "empty", "failed"] as const)("waits for the restored repository's stashes before handling a %s result", async (outcome) => {
    const user = userEvent.setup();
    const otherPath = "D:\\Other";
    const stash = { ref: "stash@{0}", hash: "a".repeat(40), message: "saved navigation work", sourceBranch: "main", createdAt: "2026-09-26T00:00:00Z" };
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    vi.mocked(githead.getStashes).mockImplementation(async ({ repoPath: path }) => path === repoPath ? [stash] : []);
    vi.mocked(githead.getStashDetails).mockResolvedValue({ stash, files: [] });
    render(<App />);
    await waitForRepositoryWorkspace();
    await openWorkspaceView("Stashes", user);
    await screen.findByRole("option", { name: /saved navigation work/ });
    await switchToRepository(otherPath, user);
    await waitFor(() => expect(githead.getStashes).toHaveBeenCalledWith(expect.objectContaining({ repoPath: otherPath })));
    await waitFor(() => expect(screen.queryByRole("tab", { name: /Stashes/ })).toBeNull());

    const pending = defer<(typeof stash)[]>();
    vi.mocked(githead.getStashes).mockImplementation(({ repoPath: path }) => path === repoPath ? pending.promise : Promise.resolve([]));
    await goBack();
    selectedTab(/Stashes/);
    await expectNavigationCommand("Go forward", true, user);
    selectedTab(/Stashes/);
    await act(async () => {
      if (outcome === "failed") pending.reject(new Error("Stash list unavailable"));
      else pending.resolve(outcome === "loaded" ? [stash] : []);
    });
    if (outcome === "empty") {
      await waitFor(() => selectedTab(/^Changes/));
      expect(screen.queryByRole("tab", { name: /Stashes/ })).toBeNull();
    } else {
      selectedTab(/Stashes/);
      if (outcome === "loaded") expect(await screen.findByRole("option", { name: /saved navigation work/ })).toBeTruthy();
      else expect(await screen.findByText("Stash list unavailable")).toBeTruthy();
      await goForward();
      await waitFor(() => expect(currentRepositoryButton("Other")).toBeTruthy());
    }
  });

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
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/first\.ts/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log selected" }));
    const first = await screen.findByRole("region", { name: "File history for src/first.ts" });
    await within(first).findByText("diff for src/first.ts");
    await user.click(within(first).getByRole("button", { name: "Back" }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/second\.ts/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log selected" }));
    const second = await screen.findByRole("region", { name: "File history for src/second.ts" });
    await within(second).findByText("diff for src/second.ts");

    await goBack();
    await goBack();
    const restored = await screen.findByRole("region", { name: "File history for src/first.ts" });
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
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log selected" }));
    await user.click(await screen.findByRole("button", { name: "Blame this version" }));
    await screen.findByRole("region", { name: `Blame for ${file.path}` });
    await switchToRepository(otherPath, user);
    await waitFor(() => expect(currentRepositoryButton("Other")).toBeTruthy());
    await goBack();
    const blame = await screen.findByRole("region", { name: `Blame for ${file.path}` });
    await waitFor(() => expect(githead.getFileBlame).toHaveBeenCalledTimes(2));
    await user.click(within(blame).getByRole("button", { name: "Back to file history" }));
    const restored = await screen.findByRole("region", { name: `File history for ${file.path}` });
    expect(await within(restored).findByText("restored file change")).toBeTruthy();
    expect(await within(restored).findByText("restored file diff")).toBeTruthy();
  });

  it("restores tabs through native history and discards the forward path after a new screen", async () => {
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    await waitForRepositoryWorkspace();
    await expectNavigationCommand("Go back", false, user);
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    await openWorkspaceView("Activity log", user);
    await goBack();
    selectedTab(/^History$/);
    await goBack();
    selectedTab(/^Changes/);
    await goForward();
    selectedTab(/^History$/);
    await user.click(screen.getByRole("tab", { name: /^Changes/ }));
    await expectNavigationCommand("Go forward", false, user);
    await goBack();
    selectedTab(/^History$/);
  });

  it("keeps one guest view beside Changes and History until it is closed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)).toEqual(["Changes", "History"]);

    await openWorkspaceView("Activity log", user);
    await user.click(screen.getByRole("tab", { name: /^Changes/ }));
    // The guest keeps its segment while a permanent view is active.
    expect(screen.getByRole("tab", { name: "Activity log", selected: false })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Activity log" }));
    await user.click(screen.getByRole("button", { name: "Close Activity log view" }));
    await waitFor(() => selectedTab(/^Changes/));
    expect(screen.queryByRole("tab", { name: /^Activity log/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close Activity log view" })).toBeNull();
    // Keyboard users keep their place in the header instead of dropping to the page body.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^Changes/, selected: true }));
  });

  it("supports the quick switcher commands and Alt+Left/Right without recording the same tab twice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    await waitFor(() => selectedTab(/^Changes/));
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() => selectedTab(/^History$/));
    await chooseSwitcherOption("Go back", user);
    await waitFor(() => selectedTab(/^Changes/));
    await chooseSwitcherOption("Go forward", user);
    await waitFor(() => selectedTab(/^History$/));
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
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log selected" }));
    const fileHistory = await screen.findByRole("region", { name: `File history for ${file.path}` });
    await user.click(await within(fileHistory).findByRole("button", { name: "Blame this version" }));
    await waitFor(() => expect(githead.getFileBlame).toHaveBeenCalled());
    await goBack();
    expect(await screen.findByRole("region", { name: `File history for ${file.path}` })).toBeTruthy();
    expect(githead.getFileHistory).toHaveBeenCalledTimes(1);
    await goBack();
    expect(await screen.findByRole("listbox", { name: "Commit history" })).toBeTruthy();
    await goBack();
    selectedTab(/^Changes/);
    await goForward();
    await goForward();
    expect(await screen.findByRole("region", { name: `File history for ${file.path}` })).toBeTruthy();
  });

  it("restores the repository and its screen together", async () => {
    const user = userEvent.setup();
    const otherPath = "D:\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherPath));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    render(<App />);
    await waitForRepositoryWorkspace();
    await openWorkspaceView("Activity log", user);
    await switchToRepository(otherPath, user);
    await waitFor(() => expect(githead.getRepoIdentity).toHaveBeenCalledWith(expect.objectContaining({ repoPath: otherPath })));
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    await goBack();
    await goBack();
    await waitFor(() => selectedTab(/^Activity log/));
    expect(currentRepositoryButton("Githead")).toBeTruthy();
  });

  it("does not leave the screen or reload while a dialog is open", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    await openSettings(user);
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
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    first.unmount();
    render(<App />);
    await waitForRepositoryWorkspace();
    const initial = window.history.state;
    await goBack();
    await waitFor(() => expect(window.history.state).toEqual(initial));
    selectedTab(/^Changes/);
    await openWorkspaceView("Activity log", user);
    await goBack();
    selectedTab(/^Changes/);
    await expectNavigationCommand("Go back", false, user);
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
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log selected" }));
    await screen.findByRole("region", { name: `File history for ${file.path}` });
    await switchToRepository(otherPath, user);
    await waitFor(() => expect(currentRepositoryButton("Other")).toBeTruthy());

    const pending = defer<RepoSummary>();
    vi.mocked(githead.getRepoSummary).mockImplementation((path) => path === repoPath ? pending.promise : Promise.resolve(createSummary({ repoPath: path })));
    await goBack();
    await openWorkspaceView("Activity log", user);
    await act(async () => pending.resolve(createSummary()));
    selectedTab(/^Activity log/);
    expect(githead.getFileHistory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("tab", { name: /^History$/ }));
    await waitFor(() => expect(githead.getFileHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Blame this version" })).toBeTruthy();
  });
});
