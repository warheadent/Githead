// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  chooseSwitcherOption,
  createSummary,
  githead,
  openQuickSwitcher,
  openSettings,
  repoPath,
  repositoryOption,
  repositoryRecents,
  switchToRepository,
  waitForRepositoryWorkspace
} from "./AppTestHarness";
import { App } from "./App";

const otherRepo = "D:\\Work\\Other";

function selectedTab(name: RegExp): HTMLElement {
  return screen.getByRole("tab", { name, selected: true });
}

describe("quick switcher", { timeout: 10_000 }, () => {
  it("opens with Ctrl+K, closes with it, and switches repositories", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) => createSummary({ repoPath: path }));
    render(<App />);

    const dialog = await openQuickSwitcher(user);
    expect(within(dialog).getByRole("option", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull());

    await switchToRepository(otherRepo, user);
    expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull();
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));
    expect((await repositoryOption(otherRepo, user)).getAttribute("aria-current")).toBe("true");
  });

  it("closes before a repository menu action opens its dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    render(<App />);

    fireEvent.contextMenu(await repositoryOption(otherRepo, user));
    await user.click(await screen.findByRole("menuitem", { name: "Rename repository" }));

    expect(await screen.findByRole("dialog", { name: "Rename repository" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("moves saved repositories up and down from the row menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    render(<App />);

    fireEvent.contextMenu(await repositoryOption(repoPath, user));
    expect((await screen.findByRole("menuitem", { name: "Move up" })).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));

    await waitFor(() => expect(githead.reorderRepoRecents).toHaveBeenCalledWith([otherRepo, repoPath]));
    expect(screen.getByRole("dialog", { name: "Quick switcher" })).toBeTruthy();
  });

  it("switches branches and changes the upstream in branch content", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branches: [
        { name: "main", current: true, upstream: "origin/main" },
        { name: "feature/nav", current: false, upstream: null }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature", remote: "origin", branch: "feature" }
      ]
    }));
    render(<App />);

    await chooseSwitcherOption("feature/nav, local only", user);
    await waitFor(() => expect(githead.switchBranch).toHaveBeenCalledWith(expect.objectContaining({ repoPath, branchName: "feature/nav" })));

    await chooseSwitcherOption(/^Change upstream…/, user);
    expect(screen.getByRole("combobox", { name: "Change upstream" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Branches" })).toBeTruthy();

    await user.click(screen.getByRole("option", { name: /^Change upstream…/ }));
    await user.click(screen.getByRole("option", { name: /^origin\/feature/ }));
    await waitFor(() => expect(githead.setBranchUpstream).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      branchName: "main",
      upstream: "origin/feature"
    })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull());
  });

  it("keeps the switcher open with the error when the upstream change fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature", remote: "origin", branch: "feature" }
      ]
    }));
    vi.mocked(githead.setBranchUpstream).mockResolvedValue({ repoPath, exitCode: 1, stdout: "", stderr: "Unable to set upstream." });
    render(<App />);

    await chooseSwitcherOption(/^Change upstream…/, user);
    await user.click(screen.getByRole("option", { name: /^origin\/feature/ }));

    const dialog = screen.getByRole("dialog", { name: "Quick switcher" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Unable to set upstream.");
  });

  it("returns focus to the header control that opened it, or to the tab of the chosen view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();

    const branchPill = screen.getByRole("button", { name: "Switch branch" });
    await user.click(branchPill);
    await screen.findByRole("dialog", { name: "Quick switcher" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(branchPill));

    await user.click(screen.getByRole("button", { name: "More" }));
    await chooseSwitcherOption(/^Activity log/, user);
    await waitFor(() => expect(document.activeElement).toBe(selectedTab(/^Activity log/)));
  });

  it("opens New branch with Ctrl+B and ignores shortcuts while another dialog is open", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Control>}b{/Control}");
    expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    await openQuickSwitcher(user);
    await user.keyboard("{Control>}b{/Control}");
    expect(await screen.findByLabelText("Branch name")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Quick switcher" })).toBeNull();
  });
});
