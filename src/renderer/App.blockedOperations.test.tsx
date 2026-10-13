// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createCommit, createCommitDetails, createRunResult,
  createStatusFile, createSummary, createRepositoryOperationState, defer, githead,
  openBranchSwitcher, openQuickSwitcher, openSettings, repoPath, repositoryOption, repositoryRecents, waitForRepositoryWorkspace
} from "./AppTestHarness";
import { App } from "./App";

async function startFetch() {
  const pending = defer<Awaited<ReturnType<typeof githead.runGitAction>>>();
  vi.mocked(githead.runGitAction).mockReturnValueOnce(pending.promise);
  render(<App />);
  await waitForRepositoryWorkspace();
  fireEvent.click(screen.getByRole("button", { name: /^Fetch/ }));
  await waitFor(() => expect(githead.runGitAction).toHaveBeenCalledOnce());
  const operationId = vi.mocked(githead.runGitAction).mock.calls[0]![0].operationId;
  return {
    operationId,
    finish: async () => {
      await act(async () => { pending.resolve(createRunResult("fetch")); await pending.promise; });
      await waitFor(() => expect(screen.getByRole("button", { name: /^Fetch/ }).hasAttribute("disabled")).toBe(false));
    }
  };
}

async function editAction() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Repository actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Manage repository actions…" }));
  await user.click(screen.getByRole("button", { name: "Add action" }));
  await user.type(screen.getByLabelText("Name"), "Build");
  await user.type(screen.getByLabelText("Command"), "npm run build");
  await user.click(screen.getByRole("button", { name: "Save Shared" }));
}

describe("unrelated tasks during Git operations", { timeout: 20_000 }, () => {
  it("saves action files during fetch without replacing the fetch cancellation target", async () => {
    const fetch = await startFetch();
    await editAction();
    await waitFor(() => expect(githead.saveConfiguredActions).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toBeTruthy());
    // The mocked summary still contains no actions, so discard the retained editor draft.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const discard = await screen.findByRole("button", { name: /Discard/ });
    fireEvent.click(discard);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: fetch.operationId }));
    await fetch.finish();
  });

  it("cancels a concurrent action save by its own ID and recovers a missing reply", async () => {
    const save = defer<Awaited<ReturnType<typeof githead.saveConfiguredActions>>>();
    vi.mocked(githead.saveConfiguredActions).mockReturnValueOnce(save.promise);
    const fetch = await startFetch();
    await editAction();
    await waitFor(() => expect(githead.saveConfiguredActions).toHaveBeenCalledOnce());
    const saveId = vi.mocked(githead.saveConfiguredActions).mock.calls[0]![0].operationId;
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel save" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: saveId }));
    expect(saveId).not.toBe(fetch.operationId);
    expect((await screen.findAllByText(/action save ended before its result arrived/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    // A late result must not clear the recovery message or the unrelated fetch.
    await act(async () => { save.resolve({ repoPath, exitCode: 0, stdout: "saved", stderr: "" }); });
    expect(screen.getAllByText(/action save ended before its result arrived/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: /Discard/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenLastCalledWith({ operationId: fetch.operationId }));
    await fetch.finish();
  });

  it("explains why action files cannot be saved during a working-tree mutation", async () => {
    const pending = defer<Awaited<ReturnType<typeof githead.runGitAction>>>();
    vi.mocked(githead.runGitAction).mockReturnValueOnce(pending.promise);
    render(<App />);
    await waitForRepositoryWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /^Pull/ }));
    await waitFor(() => expect(githead.runGitAction).toHaveBeenCalledOnce());
    await editAction();
    expect((await screen.findAllByText(/Wait for the current operation to finish before saving action files/)).length).toBeGreaterThan(0);
    expect(githead.saveConfiguredActions).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("npm run build")).toBeTruthy();
    await act(async () => { pending.resolve(createRunResult("pull")); });
  });

  it("saves appearance preferences while fetch retains its progress and cancellation", async () => {
    const user = userEvent.setup();
    const fetch = await startFetch();
    await openSettings(user);
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.selectOptions(screen.getByLabelText("Interface font"), "roboto");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith(expect.objectContaining({ uiFont: "roboto" })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
    expect(screen.getByRole("button", { name: /^Fetch/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: fetch.operationId }));
    await fetch.finish();
  });

  it("copies status file paths while mutations remain disabled", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [createStatusFile("sample.txt", { isUnstaged: true, worktreeStatus: "M" })] }));
    const fetch = await startFetch();
    const file = await screen.findByText("sample.txt");
    fireEvent.contextMenu(file);
    expect(screen.getByRole("menuitem", { name: "Show in Explorer" }).hasAttribute("data-disabled")).toBe(false);
    await user.click(screen.getByRole("menuitem", { name: "Copy path" }));
    await waitFor(() => expect(githead.copyPathToClipboard).toHaveBeenCalledWith({ repoPath, path: "sample.txt" }));
    expect(screen.getByRole("button", { name: /^Fetch/ }).hasAttribute("disabled")).toBe(true);
    await fetch.finish();
  });

  it("keeps submodule navigation blocked without blocking ordinary file opening during fetch", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [
      createStatusFile("sample.txt", { isUnstaged: true, worktreeStatus: "M" }),
      createStatusFile("modules/sample", {
        isUnstaged: true, worktreeStatus: "M",
        submodule: { commitChanged: false, trackedChanges: true, untrackedChanges: false,
          initialized: true, canStage: false, canUnstage: false }
      })
    ] }));
    const fetch = await startFetch();
    fireEvent.contextMenu(await screen.findByRole("option", { name: /modules\/sample/ }));
    expect(screen.getByRole("menuitem", { name: "Open submodule" }).hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open submodule" }));
    expect(githead.cancelGitOperation).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    fireEvent.contextMenu(screen.getByText("sample.txt"));
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    await waitFor(() => expect(githead.openFile).toHaveBeenCalledWith({ repoPath, path: "sample.txt" }));
    expect(githead.cancelGitOperation).not.toHaveBeenCalled();
    await fetch.finish();
  });

  it("copies commit hashes and permits historical file inspection during fetch", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ hash: "a".repeat(40), subject: "Inspect this commit" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [{ path: "sample.txt", status: "M", additions: 1, deletions: 1 }] }));
    const fetch = await startFetch();
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: "Copy commit SHA" }));
    await waitFor(() => expect(githead.copyCommitShaToClipboard).toHaveBeenCalledWith({ repoPath, hash: commit.hash }));
    const files = await screen.findByRole("listbox", { name: "Changed files" });
    fireEvent.contextMenu(within(files).getAllByRole("option")[0]!);
    for (const name of ["Log selected", "Blame selected", "Open selected version", "Copy path to clipboard"]) {
      expect(screen.getByRole("menuitem", { name }).hasAttribute("data-disabled")).toBe(false);
    }
    expect(screen.getByRole("menuitem", { name: "Reset to commit" }).hasAttribute("data-disabled")).toBe(true);
    await user.click(screen.getByRole("menuitem", { name: "Open selected version" }));
    await waitFor(() => expect(githead.openCommitFileVersion).toHaveBeenCalledOnce());
    await fetch.finish();
  });

  it("allows repository organization and closes branch and remote browsers without cancelling fetch", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\OtherRepo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (paths) => repositoryRecents(...paths));
    const fetch = await startFetch();
    fireEvent.contextMenu(await repositoryOption(otherRepo, user));
    const moveUp = await screen.findByRole("menuitem", { name: "Move up" });
    expect(moveUp.hasAttribute("data-disabled")).toBe(false);
    await user.click(moveUp);
    await waitFor(() => expect(githead.reorderRepoRecents).toHaveBeenCalledWith([otherRepo, repoPath]));
    fireEvent.contextMenu(await repositoryOption(otherRepo, user));
    await user.click(await screen.findByRole("menuitem", { name: "Repository settings…" }));
    expect(await screen.findByRole("dialog", { name: "Repository settings" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Repository settings" })).toBeNull());
    const manageBranches = within(await openBranchSwitcher(user)).getByRole("option", { name: "Manage branches…" });
    expect(manageBranches.getAttribute("aria-disabled")).toBeNull();
    await user.click(manageBranches);
    expect(await screen.findByRole("dialog", { name: "Manage branches" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Manage branches" })).toBeNull());
    const manageRemotes = within(await openBranchSwitcher(user)).getByRole("option", { name: /^Manage remotes…/ });
    expect(manageRemotes.getAttribute("aria-disabled")).toBeNull();
    await user.click(manageRemotes);
    expect(await screen.findByRole("dialog", { name: "Manage remotes" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add remote" }));
    await user.type(screen.getByLabelText("Name", { exact: true }), "backup");
    expect(screen.getByRole("button", { name: "Add remote" }).hasAttribute("disabled")).toBe(true);
    await user.keyboard("{Escape}");
    expect(githead.cancelGitOperation).not.toHaveBeenCalled();
    await fetch.finish();
  });

  it("keeps settings and repository list controls available during conflict recovery", async () => {
    const otherRepo = "D:\\OtherRepo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ operationState: createRepositoryOperationState("merge") }));
    render(<App />);
    await screen.findByText("Finish this merge");
    expect(await openSettings()).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
    const switcher = await openQuickSwitcher();
    expect(within(switcher).getByRole("option", { name: /^Settings/ }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.contextMenu(await repositoryOption(otherRepo));
    expect((await screen.findByRole("menuitem", { name: "Move up" })).hasAttribute("data-disabled")).toBe(false);
  });
});
