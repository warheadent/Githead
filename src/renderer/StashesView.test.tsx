// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStashDetails, GitStashEntry } from "../shared/types";
import { StashesView } from "./StashesView";
import { WorkspacePanelStateProvider, WorkspacePanelStateStore } from "./workspacePanelState";

const entries: GitStashEntry[] = [
  createEntry(0, "cache cleanup", "feature/cache"),
  createEntry(1, "icon refactor", "feature/icons"),
  createEntry(2, "temporary logs", "main"),
  createEntry(3, "settings experiment", "feature/settings")
];

const details: GitStashDetails = {
  stash: entries[0]!,
  files: [
    { path: "src/cache.ts", status: "M" },
    { path: "src/cache.test.ts", status: "A" }
  ]
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StashesView", () => {
  it("filters the stash rail by message, reference, and branch", () => {
    renderView();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stashes" }), { target: { value: "icons" } });

    expect(screen.getByRole("option", { name: /icon refactor/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /cache cleanup/ })).toBeNull();
  });

  it("collapses and restores the changed-file list", () => {
    renderView();

    expect(screen.getByRole("listbox", { name: "Stash files" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide changed files" }));
    expect(screen.queryByRole("listbox", { name: "Stash files" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show changed files" }));
    expect(screen.getByRole("listbox", { name: "Stash files" })).toBeTruthy();
  });

  it("keeps stash and file selection callbacks active", () => {
    const onSelect = vi.fn();
    const onSelectFile = vi.fn();
    renderView({ onSelect, onSelectFile });

    fireEvent.click(screen.getByRole("option", { name: /icon refactor/ }));
    fireEvent.click(screen.getByRole("option", { name: /src\/cache\.test\.ts/ }));

    expect(onSelect).toHaveBeenCalledWith("stash@{1}");
    expect(onSelectFile).toHaveBeenCalledWith("src/cache.test.ts");
  });

  it.each(["Apply", "Pop"])("runs %s on the right-clicked stash instead of the selected stash", (action) => {
    const onApply = vi.fn();
    const onPop = vi.fn();
    renderView({ onApply, onPop });

    fireEvent.contextMenu(screen.getByRole("option", { name: /icon refactor/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: action }));

    expect(action === "Apply" ? onApply : onPop).toHaveBeenCalledWith("stash@{1}");
    expect(action === "Apply" ? onPop : onApply).not.toHaveBeenCalled();
  });

  it("confirms deletion of the right-clicked stash", async () => {
    const onDrop = vi.fn().mockResolvedValue(null);
    renderView({ onDrop });

    fireEvent.contextMenu(screen.getByRole("option", { name: /icon refactor/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete stash..." }));

    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").textContent).toContain("stash@{1}");
    fireEvent.click(screen.getByRole("button", { name: "Delete stash" }));
    expect(onDrop).toHaveBeenCalledWith("stash@{1}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("creates a branch from the right-clicked stash", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(null);
    renderView({ onCreateBranch });

    fireEvent.contextMenu(screen.getByRole("option", { name: /icon refactor/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Create branch..." }));
    fireEvent.change(screen.getByRole("textbox", { name: "Branch name" }), { target: { value: "restore-icons" } });
    fireEvent.click(screen.getByRole("button", { name: "Create branch" }));

    expect(onCreateBranch).toHaveBeenCalledWith("stash@{1}", "restore-icons");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("disables context-menu actions while stash operations are unavailable", () => {
    const onApply = vi.fn();
    const onPop = vi.fn();
    renderView({ disabled: true, onApply, onPop });

    fireEvent.contextMenu(screen.getByRole("option", { name: /icon refactor/ }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item);
    }
    expect(onApply).not.toHaveBeenCalled();
    expect(onPop).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores its filter after the panel unmounts", () => {
    const store = new WorkspacePanelStateStore();
    const view = renderPersistentView(store, true);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stashes" }), { target: { value: "icons" } });
    view.rerender(persistentView(store, false));
    expect(screen.queryByRole("searchbox", { name: "Search stashes" })).toBeNull();

    view.rerender(persistentView(store, true));
    expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search stashes" }).value).toBe("icons");
    expect(screen.getByRole("option", { name: /icon refactor/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /cache cleanup/ })).toBeNull();
  });
});

function renderView(overrides: Partial<Parameters<typeof StashesView>[0]> = {}) {
  return render(<StashesView
    entries={entries}
    loading={false}
    error=""
    selectedRef="stash@{0}"
    details={details}
    detailsLoading={false}
    detailsError=""
    selectedFilePath="src/cache.ts"
    disabled={false}
    diffContent={<div>Diff content</div>}
    onRefresh={vi.fn()}
    onSelect={vi.fn()}
    onSelectFile={vi.fn()}
    onApply={vi.fn()}
    onPop={vi.fn()}
    onDrop={vi.fn().mockResolvedValue(null)}
    onCreateBranch={vi.fn().mockResolvedValue(null)}
    {...overrides}
  />);
}

function renderPersistentView(store: WorkspacePanelStateStore, visible: boolean) {
  return render(persistentView(store, visible));
}

function persistentView(store: WorkspacePanelStateStore, visible: boolean) {
  return (
    <WorkspacePanelStateProvider store={store} namespace="D:/repo">
      {visible ? <StashesView
        entries={entries}
        loading={false}
        error=""
        selectedRef="stash@{0}"
        details={details}
        detailsLoading={false}
        detailsError=""
        selectedFilePath="src/cache.ts"
        disabled={false}
        diffContent={<div>Diff content</div>}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onSelectFile={vi.fn()}
        onApply={vi.fn()}
        onPop={vi.fn()}
        onDrop={vi.fn().mockResolvedValue(null)}
        onCreateBranch={vi.fn().mockResolvedValue(null)}
      /> : <div>Inactive panel</div>}
    </WorkspacePanelStateProvider>
  );
}

function createEntry(index: number, message: string, sourceBranch: string): GitStashEntry {
  return {
    ref: `stash@{${index}}`,
    hash: String(index).repeat(40),
    message,
    sourceBranch,
    createdAt: `2026-08-0${4 - index}T20:00:00-07:00`
  };
}
