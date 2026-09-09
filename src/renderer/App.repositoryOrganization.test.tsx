// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createSummary,
  githead,
  repoPath,
  repositoryRecents,
  waitForRepositoryWorkspace,
} from "./AppTestHarness";
import { App } from "./App";
import { readRepositoryOrganization, REPOSITORY_ORGANIZATION_KEY } from "./repositoryOrganization";

const other = "D:\\Work\\Other";
const third = "D:\\Archive\\Other";
beforeEach(() => {
  window.localStorage.removeItem(REPOSITORY_ORGANIZATION_KEY);
  vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, other, third));
});
afterEach(() => window.localStorage.removeItem(REPOSITORY_ORGANIZATION_KEY));
const repositories = () => within(screen.getByRole("region", { name: "Repositories" }));

describe("Repository organization", { timeout: 10_000 }, () => {
  it("saves groups, aliases, pins and hidden state and restores them after remount", async () => {
    const user = userEvent.setup();
    const mounted = render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Organize repositories" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: "New group name" }), "Tools");
    await user.click(dialog.getByRole("button", { name: "Add group" }));
    const aliases = dialog.getAllByRole("textbox", { name: "Display alias" });
    await user.type(aliases[1]!, "Builder");
    await user.selectOptions(
      dialog.getAllByRole("combobox", { name: "Project group" })[1]!,
      "Tools",
    );
    await user.click(dialog.getAllByRole("checkbox", { name: "Pinned" })[0]!);
    await user.click(dialog.getAllByRole("checkbox", { name: "Hidden" })[2]!);
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    expect(repositories().getByText("Pinned")).toBeTruthy();
    expect(repositories().getByText("Builder")).toBeTruthy();
    expect(repositories().queryByRole("button", { name: `Switch to ${third}` })).toBeNull();
    await user.click(repositories().getByRole("button", { name: "Tools, 1 repositories" }));
    expect(repositories().queryByText("Builder")).toBeNull();
    mounted.unmount();
    render(<App />);
    await waitForRepositoryWorkspace();
    expect(
      repositories()
        .getByRole("button", { name: "Tools, 1 repositories" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    await user.type(
      repositories().getByRole("searchbox", { name: "Search repositories" }),
      "builder",
    );
    expect(repositories().getByText("Builder")).toBeTruthy();
    await user.clear(repositories().getByRole("searchbox", { name: "Search repositories" }));
    expect(repositories().queryByText("Builder")).toBeNull();
    await user.click(repositories().getByRole("button", { name: "Show hidden (1)" }));
    expect(repositories().getByRole("button", { name: `Switch to ${third}` })).toBeTruthy();
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
    await userEvent.setup().type(repositories().getByRole("searchbox"), "archive");
    await userEvent
      .setup()
      .click(repositories().getByRole("button", { name: `Switch to ${third}` }));
    await waitFor(() => expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: third }));
    expect(githead.removeRepoRecent).not.toHaveBeenCalled();
  });

  it("cancels organization edits and does not save an invalid group name", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Organize repositories" }));
    await user.type(screen.getByRole("textbox", { name: "New group name" }), "Temporary");
    await user.click(screen.getByRole("button", { name: "Add group" }));
    await user.clear(screen.getByRole("textbox", { name: "Group name 1" }));
    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readRepositoryOrganization().projects).toEqual([]);
  });

  it("reports storage failures and keeps the saved organization unchanged", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Organize repositories" }));
    await user.type(screen.getAllByRole("textbox", { name: "Display alias" })[0]!, "Daily");
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
    expect(repositories().getByText("Daily")).toBeTruthy();
  });

  it("reorders within the visible project across unrelated repositories", async () => {
    window.localStorage.setItem(
      REPOSITORY_ORGANIZATION_KEY,
      JSON.stringify({
        version: 1,
        projects: [{ id: "tools", name: "Tools" }],
        repositories: { [repoPath]: { projectId: "tools" }, [third]: { projectId: "tools" } },
      }),
    );
    render(<App />);
    await waitForRepositoryWorkspace();
    await act(async () =>
      fireEvent.keyDown(repositories().getByRole("button", { name: `Reorder ${repoPath}` }), {
        key: "ArrowDown",
      }),
    );
    expect(githead.reorderRepoRecents).toHaveBeenCalledWith([other, third, repoPath]);
  });
});
