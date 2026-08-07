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
