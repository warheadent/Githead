// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitWorktree, GitWorktreeRemovalCheck, RepositoryGroup } from "../shared/types";
import { WorktreeCreateDialog, WorktreeRemoveDialog } from "./WorktreeDialogs";

const target: GitWorktree = {
  path: "C:\\repo-feature",
  head: null,
  branch: "feature",
  isMain: false,
  isBare: false,
  isDetached: false,
  locked: false,
  lockReason: null,
  prunable: false,
  prunableReason: null
};

const dirtyCheck: GitWorktreeRemovalCheck = {
  repoPath: "C:\\repo",
  worktreePath: target.path,
  canRemove: false,
  canForceRemove: true,
  isClean: false,
  reason: "Worktree has uncommitted or untracked files."
};

const group: RepositoryGroup = {
  id: "repo",
  kind: "git",
  anchorPath: "C:\\repo",
  lastUsedPath: "C:\\repo",
  recentPaths: ["C:\\repo"],
  commonDir: "C:\\repo\\.git",
  worktrees: [{ ...target, path: "C:\\repo", branch: "main", isMain: true }],
  error: ""
};

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WorktreeRemoveDialog", () => {
  it("enables force removal three seconds after a dirty-worktree dialog opens", () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    render(<WorktreeRemoveDialog target={target} check={dirtyCheck} checking={false} busy={false} onClose={vi.fn()} onRemove={onRemove} />);

    const removeButton = screen.getByRole("button", { name: "Remove Worktree (3)" }) as HTMLButtonElement;
    expect(removeButton.disabled).toBe(true);
    expect(screen.queryByText(/available after 3 seconds/i)).toBeNull();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("button", { name: "Remove Worktree (2)" })).toBe(removeButton);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("button", { name: "Remove Worktree (1)" })).toBe(removeButton);
    act(() => vi.advanceTimersByTime(999));
    expect(removeButton.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Remove Worktree" })).toBe(removeButton);
    expect(removeButton.disabled).toBe(false);
    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("does not unlock non-forceable removal failures", () => {
    vi.useFakeTimers();
    render(<WorktreeRemoveDialog target={target} check={{ ...dirtyCheck, canForceRemove: false, reason: "Worktree is locked." }} checking={false} busy={false} onClose={vi.fn()} onRemove={vi.fn()} />);
    const removeButton = screen.getByRole("button", { name: "Remove Worktree" }) as HTMLButtonElement;

    act(() => vi.advanceTimersByTime(3_000));
    expect(removeButton.disabled).toBe(true);
  });

  it("keeps cancellation available while removal remains disabled", () => {
    const onClose = vi.fn();
    const onRemove = vi.fn();
    render(<WorktreeRemoveDialog target={target} check={{ ...dirtyCheck, canRemove: true }} checking={false} busy onClose={onClose} onRemove={onRemove} />);

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const remove = screen.getByRole("button", { name: "Remove Worktree (3)" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    fireEvent.click(cancel);

    expect(onRemove).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("WorktreeCreateDialog", () => {
  it("keeps cancellation available while creation controls remain disabled", () => {
    const onOpenChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<WorktreeCreateDialog open group={group} branches={[]} remoteBranches={[]} busy onOpenChange={onOpenChange} onChooseParent={vi.fn()} onCreate={onCreate} />);

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const create = screen.getByRole("button", { name: "Create Worktree" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    fireEvent.submit(create.closest("form")!);
    fireEvent.click(cancel);

    expect(onCreate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
