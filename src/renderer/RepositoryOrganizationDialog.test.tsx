// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RepositoryOrganizationDialog } from "./RepositoryOrganizationDialog";
import {
  type RepositoryOrganization,
  normalizeRepositoryOrganization,
  repositoryPreference,
} from "./repositoryOrganization";

const paths = ["/work/Myrion", "/work/MyrionGDD", "/archive/Myrion"];
const original = normalizeRepositoryOrganization({
  version: 1,
  projects: [
    { id: "myrion", name: "Myrion" },
    { id: "tools", name: "Tools" },
  ],
  repositories: {
    [paths[0]!]: { projectId: "myrion", pinned: true },
    [paths[1]!]: { projectId: "myrion", hidden: true },
  },
});
function setup() {
  const onSave = vi.fn<(draft: RepositoryOrganization) => boolean>(() => true);
  const onClose = vi.fn();
  render(
    <TooltipProvider>
      <RepositoryOrganizationDialog
        organization={original}
        paths={paths}
        initialQuery=""
        onSave={onSave}
        onClose={onClose}
      />
    </TooltipProvider>,
  );
  return { user: userEvent.setup(), onSave, onClose };
}
const table = () => within(screen.getByRole("table"));
const saveButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" });
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Repository organizer controls", () => {
  it("moves selected group members together, including pinned and hidden members", async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole("button", { name: "Myrion, 2 repositories" }));
    expect(table().getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "Select all shown repositories" }));
    await user.click(screen.getByRole("button", { name: "Move to group" }));
    await user.click(screen.getByRole("menuitem", { name: "Tools" }));
    expect(screen.getByText("No repositories in this group.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move to group" })).toBeNull();
    await user.click(saveButton());
    const saved = normalizeRepositoryOrganization(onSave.mock.calls[0]?.[0]);
    expect(repositoryPreference(saved, paths[0]!)).toMatchObject({
      projectId: "tools",
      pinned: true,
      hidden: false,
    });
    expect(repositoryPreference(saved, paths[1]!)).toMatchObject({
      projectId: "tools",
      pinned: false,
      hidden: true,
    });
  });

  it("clears selection when the search changes and moves only the new selection into a new group", async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole("checkbox", { name: `Select ${paths[0]}` }));
    await user.type(screen.getByRole("searchbox"), "archive");
    expect(screen.queryByText("1 selected")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select all shown repositories" }));
    await user.click(screen.getByRole("button", { name: "Move to group" }));
    await user.click(screen.getByRole("menuitem", { name: "New group…" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Archive");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await user.click(saveButton());
    const saved = normalizeRepositoryOrganization(onSave.mock.calls[0]?.[0]);
    const group = saved.projects.find((project) => project.name === "Archive");
    expect(group).toBeDefined();
    expect(repositoryPreference(saved, paths[2]!)).toMatchObject({ projectId: group?.id });
    expect(repositoryPreference(saved, paths[0]!)).toEqual(
      repositoryPreference(original, paths[0]!),
    );
  });

  it("restores a hidden repository without changing its group or losing it from All repositories", async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole("button", { name: "Hidden, 1 repositories" }));
    await user.click(screen.getByRole("checkbox", { name: `Show ${paths[1]}` }));
    expect(screen.getByText("No hidden repositories.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All repositories, 3 repositories" }));
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: `Show ${paths[1]}` }).checked,
    ).toBe(true);
    await user.click(saveButton());
    const saved = normalizeRepositoryOrganization(onSave.mock.calls[0]?.[0]);
    expect(repositoryPreference(saved, paths[1]!)).toMatchObject({
      hidden: false,
      projectId: "myrion",
    });
  });

  it("disables saving again when edits return to the original values", async () => {
    const { user } = setup();
    expect(saveButton().disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: `Pin ${paths[2]}` }));
    expect(saveButton().disabled).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: `Pin ${paths[2]}` }));
    expect(saveButton().disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: `Rename ${paths[2]} in Githead` }));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Old engine");
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    expect(table().getByText("Old engine")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: `Rename ${paths[2]} in Githead` }));
    await user.clear(screen.getByRole("textbox", { name: "Display name" }));
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    expect(saveButton().disabled).toBe(true);
  });

  it("validates group renames and keeps group order and membership correct after deletion", async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole("button", { name: "Manage group Myrion" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename group" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await user.clear(input);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Apply name" }).disabled).toBe(
      true,
    );
    await user.type(input, " tools ");
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Apply name" }).disabled).toBe(
      true,
    );
    await user.clear(input);
    await user.type(input, "Game");
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    await user.click(screen.getByRole("button", { name: "Manage group Game" }));
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    const nav = within(screen.getByRole("navigation", { name: "Repository filters" }));
    expect(
      nav
        .getAllByRole("button", { name: /^Manage group/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Manage group Tools", "Manage group Game"]);
    await user.click(screen.getByRole("button", { name: "Game, 2 repositories" }));
    await user.click(screen.getByRole("button", { name: "Manage group Game" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete group" }));
    expect(
      screen
        .getByRole("button", { name: "Ungrouped, 3 repositories" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(saveButton());
    const saved = normalizeRepositoryOrganization(onSave.mock.calls[0]?.[0]);
    expect(saved.projects.map((project) => project.name)).toEqual(["Tools"]);
    expect(repositoryPreference(saved, paths[0]!)).toMatchObject({ projectId: "", pinned: true });
    expect(repositoryPreference(saved, paths[1]!)).toMatchObject({ projectId: "", hidden: true });
  });

  it("cancels name editing with Escape and keeps the organizer open", async () => {
    const { user, onClose, onSave } = setup();
    await user.click(screen.getByRole("button", { name: `Rename ${paths[0]} in Githead` }));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Temporary");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Organize repositories" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect(saveButton().disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
