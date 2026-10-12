// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  chooseSwitcherOption,
  closeQuickSwitcher,
  createSummary,
  githead,
  openQuickSwitcher,
  repoPath,
  repositoryOption,
  repositoryRecents,
  waitForRepositoryWorkspace,
} from "./AppTestHarness";
import { App } from "./App";
import { readRepositoryOrganization, repositoryPreference, REPOSITORY_ORGANIZATION_KEY } from "./repositoryOrganization";

const other = "D:\\Work\\Other";
const third = "D:\\Archive\\Other";
beforeEach(() => {
  window.localStorage.removeItem(REPOSITORY_ORGANIZATION_KEY);
  vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, other, third));
});
afterEach(() => window.localStorage.removeItem(REPOSITORY_ORGANIZATION_KEY));
/** The open quick switcher, which lists the saved repositories. */
const repositories = () => within(screen.getByRole("dialog", { name: "Quick switcher" }));
const searchBox = () => repositories().getByRole("combobox", { name: "Switch repository, branch or view…" });
const optionPattern = (path: string) => new RegExp(`^Switch to ${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:,|$)`);

async function openRename(path: string, user: ReturnType<typeof userEvent.setup>): Promise<void> {
  fireEvent.contextMenu(await repositoryOption(path, user));
  await user.click(await screen.findByRole("menuitem", { name: "Rename repository" }));
}

describe("Repository organization", { timeout: 10_000 }, () => {
  it("saves groups, aliases, pins and hidden state and restores them after remount", async () => {
    const user = userEvent.setup();
    const mounted = render(<App />);
    await waitForRepositoryWorkspace();
    await chooseSwitcherOption("Organize repositories…", user);
    const dialog = within(await screen.findByRole("dialog", { name: "Organize repositories" }));
    await user.click(dialog.getByRole("button", { name: "New group" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Tools");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await user.click(dialog.getByRole("button", { name: `Rename ${other} in Githead` }));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Builder");
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    await user.selectOptions(dialog.getByRole("combobox", { name: `Group for ${other}` }), "Tools");
    await user.click(dialog.getByRole("checkbox", { name: `Pin ${repoPath}` }));
    await user.click(dialog.getByRole("checkbox", { name: `Show ${third}` }));
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Organize repositories" })).toBeNull());

    // Projects stay in the saved organization; the switcher lists pinned repositories first and leaves hidden ones out.
    const saved = readRepositoryOrganization();
    expect(saved.projects.map((project) => project.name)).toEqual(["Tools"]);
    expect(repositoryPreference(saved, other)).toMatchObject({ alias: "Builder", projectId: saved.projects[0]!.id });
    expect(repositoryPreference(saved, repoPath).pinned).toBe(true);
    expect(repositoryPreference(saved, third).hidden).toBe(true);
    await openQuickSwitcher(user);
    const rows = repositories().getAllByRole("option", { name: /^Switch to / });
    expect(rows[0]!.getAttribute("aria-label")).toMatch(optionPattern(repoPath));
    expect(repositories().getByRole("option", { name: optionPattern(other) }).textContent).toContain("Builder");
    expect(repositories().queryByRole("option", { name: optionPattern(third) })).toBeNull();
    await closeQuickSwitcher(user);

    mounted.unmount();
    render(<App />);
    await waitForRepositoryWorkspace();
    await openQuickSwitcher(user);
    await user.type(searchBox(), "builder");
    expect(repositories().getByRole("option", { name: optionPattern(other) }).textContent).toContain("Builder");
    expect(repositories().queryByRole("option", { name: optionPattern(repoPath) })).toBeNull();
    await user.clear(searchBox());
    expect(repositories().queryByRole("option", { name: optionPattern(third) })).toBeNull();
    await user.click(repositories().getByRole("option", { name: "Show hidden repositories (1)" }));
    expect(repositories().getByRole("option", { name: optionPattern(third) })).toBeTruthy();
  });

  it("renames from the context menu, persists the alias, and restores the folder name", async () => {
    const user = userEvent.setup();
    const mounted = render(<App />);
    await waitForRepositoryWorkspace();
    await openRename(other, user);
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "  Builder  ");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await repositoryOption(other, user)).textContent).toContain("Builder");
    await closeQuickSwitcher(user);
    mounted.unmount();
    render(<App />);
    await waitForRepositoryWorkspace();
    expect((await repositoryOption(other, user)).textContent).toContain("Builder");
    await openRename(other, user);
    expect((screen.getByRole("textbox", { name: "Display name" }) as HTMLInputElement).value).toBe("Builder");
    await user.clear(screen.getByRole("textbox", { name: "Display name" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename repository" })).toBeNull());
    const row = await repositoryOption(other, user);
    expect(row.textContent).not.toContain("Builder");
    expect(row.textContent).toContain("Other");
    expect(githead.removeRepoRecent).not.toHaveBeenCalled();
  });

  it("cancels direct rename and keeps the draft available after a failed save", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await openRename(other, user);
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Temporary");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readRepositoryOrganization().repositories).toEqual({});
    await openRename(other, user);
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Builder");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("Unable to save");
    expect(readRepositoryOrganization().repositories).toEqual({});
    write.mockRestore();
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename repository" })).toBeNull());
    expect((await repositoryOption(other, user)).textContent).toContain("Builder");
  });

  it("searches hidden paths and switches without removing them", async () => {
    window.localStorage.setItem(
      REPOSITORY_ORGANIZATION_KEY,
      JSON.stringify({ version: 1, repositories: { [third]: { hidden: true } } }),
    );
    vi.mocked(githead.getRepoSummary).mockImplementation(async (path) =>
      createSummary({ repoPath: path }),
    );
    render(<App />);
    await waitForRepositoryWorkspace();
    const user = userEvent.setup();
    await openQuickSwitcher(user);
    expect(repositories().queryByRole("option", { name: optionPattern(third) })).toBeNull();
    await user.type(searchBox(), "archive");
    await user.click(repositories().getByRole("option", { name: optionPattern(third) }));
    await waitFor(() => expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: third }));
    expect(githead.removeRepoRecent).not.toHaveBeenCalled();
  });

  it("cancels organization edits and does not save an invalid group name", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await chooseSwitcherOption("Organize repositories…", user);
    await user.click(await screen.findByRole("button", { name: "New group" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Temporary");
    await user.clear(screen.getByRole("textbox", { name: "Group name" }));
    expect(screen.getByRole("button", { name: "Create group" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Temporary");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readRepositoryOrganization().projects).toEqual([]);
  });

  it("reports storage failures and keeps the saved organization unchanged", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await chooseSwitcherOption("Organize repositories…", user);
    await user.click(await screen.findByRole("button", { name: `Rename ${repoPath} in Githead` }));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Daily");
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain(
      "Unable to save",
    );
    expect(readRepositoryOrganization().repositories).toEqual({});
    write.mockRestore();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Organize repositories" })).toBeNull());
    expect(repositoryPreference(readRepositoryOrganization(), repoPath).alias).toBe("Daily");
    expect(screen.getByRole("button", { name: "Switch repository: Daily" })).toBeTruthy();
  });

  // The switcher lists repositories in saved order without project sections, so a move steps over the next listed row.
  it("moves a repository past the next switcher row even when projects group it elsewhere", async () => {
    window.localStorage.setItem(
      REPOSITORY_ORGANIZATION_KEY,
      JSON.stringify({
        version: 1,
        projects: [{ id: "tools", name: "Tools" }],
        repositories: { [repoPath]: { projectId: "tools" }, [third]: { projectId: "tools" } },
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    const row = await repositoryOption(repoPath, user);
    const rows = repositories().getAllByRole("option", { name: /^Switch to / }).map((option) => option.getAttribute("aria-label"));
    expect(rows).toEqual([`Switch to ${repoPath}`, `Switch to ${other}`, `Switch to ${third}`]);
    fireEvent.contextMenu(row);
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(githead.reorderRepoRecents).toHaveBeenCalledWith([other, repoPath, third]));
  });
});
