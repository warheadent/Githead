// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitWorktree, GitWorktreeRemovalCheck } from "../shared/types";
import { WorktreeRemoveDialog } from "./WorktreeDialogs";

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

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WorktreeRemoveDialog", () => {
  it("enables force removal three seconds after a dirty-worktree dialog opens", () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    render(<WorktreeRemoveDialog target={target} check={dirtyCheck} checking={false} busy={false} onClose={vi.fn()} onRemove={onRemove} />);

    const removeButton = screen.getByRole("button", { name: "Remove Worktree" }) as HTMLButtonElement;
    expect(removeButton.disabled).toBe(true);
    expect(screen.queryByText(/available after 3 seconds/i)).toBeNull();

    act(() => vi.advanceTimersByTime(2_999));
    expect(removeButton.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1));
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
});
