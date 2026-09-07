// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitOutputEvent, GitWorktree, GitWorktreeRemovalCheck, RepositoryGroup } from "../shared/types";
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

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
  it("shows the latest progress and keeps cancellation separate from closing", () => {
    let emit!: (event: GitOutputEvent) => void;
    const unsubscribe = vi.fn();
    vi.stubGlobal("githead", { onGitOutput: (listener: typeof emit) => { emit = listener; return unsubscribe; } });
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    const props = { open: true, group, branches: [], remoteBranches: [], busy: true, onCancel, onOpenChange, onChooseParent: vi.fn(), onCreate: vi.fn() };
    const { rerender, unmount } = render(<WorktreeCreateDialog {...props} />);
    const output = { runId: "run", action: "worktree-add", stream: "stderr" as const, repoPath: group.anchorPath, timestamp: "now" };
    act(() => emit({ ...output, text: "Updating files: 1% (1/100)\rUpdating files: 6" }));
    act(() => emit({ ...output, text: "5% (65/100)\r" }));
    expect(screen.getByRole("status").textContent).toContain("Updating files: 65% (65/100)");
    expect(screen.getByRole("status").textContent).not.toContain("1%");
    act(() => emit({ ...output, repoPath: "C:\\other", text: "unrelated" }));
    expect(screen.getByRole("status").textContent).not.toContain("unrelated");
    fireEvent.click(screen.getByRole("button", { name: "Cancel operation" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    rerender(<WorktreeCreateDialog {...props} cancelling />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for Git to stop");
    expect((screen.getByRole("button", { name: "Cancelling..." }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("preserves the selected branch label when a refresh marks it in use", () => {
    const branch = { name: "feature", current: false, upstream: null };
    const props = { open: true, group, branches: [branch], remoteBranches: [], busy: false, onCancel: vi.fn(), onOpenChange: vi.fn(), onChooseParent: vi.fn(), onCreate: vi.fn() };
    const { rerender } = render(<WorktreeCreateDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Existing branch" }));
    expect(screen.getByRole("button", { name: "Select worktree branch" }).textContent).toContain("feature");
    rerender(<WorktreeCreateDialog {...props} branches={[{ ...branch, worktreePath: target.path }]} />);
    expect(screen.getByRole("button", { name: "Select worktree branch" }).textContent).toContain("feature");
  });

  it("keeps a long checkout failure in collapsed details and permits retry", async () => {
    const failure = "Preparing worktree\n" + "Updating files: 65% (650/1000)\r".repeat(1000) + "fatal: disk full";
    const onCreate = vi.fn().mockResolvedValue(failure);
    render(<WorktreeCreateDialog open group={group} branches={[]} remoteBranches={[]} busy={false} onCancel={vi.fn()} onOpenChange={vi.fn()} onChooseParent={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "feature/test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Worktree" }));
    const alert = await screen.findByRole("alert");
    expect(alert.querySelectorAll("p")[1]?.textContent).toBe("fatal: disk full");
    expect(alert.querySelector("details")?.open).toBe(false);
    expect(alert.querySelector("pre")!.textContent!.length).toBeLessThanOrEqual(16_384);
    expect((screen.getByLabelText("Branch") as HTMLInputElement).value).toBe("feature/test");
    expect((screen.getByRole("button", { name: "Create Worktree" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("restores the form after a rejected request", async () => {
    render(<WorktreeCreateDialog open group={group} branches={[]} remoteBranches={[]} busy={false} onCancel={vi.fn()} onOpenChange={vi.fn()} onChooseParent={vi.fn()} onCreate={vi.fn().mockRejectedValue(new Error("Connection lost"))} />);
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "feature/test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Worktree" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connection lost");
    expect((screen.getByRole("button", { name: "Create Worktree" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps cancellation available while creation controls remain disabled", () => {
    const onOpenChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<WorktreeCreateDialog open group={group} branches={[]} remoteBranches={[]} busy onCancel={onOpenChange} onOpenChange={onOpenChange} onChooseParent={vi.fn()} onCreate={onCreate} />);

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const create = screen.getByRole("button", { name: "Creating Worktree..." }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    fireEvent.submit(create.closest("form")!);
    fireEvent.click(cancel);

    expect(onCreate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledOnce();
  });
});
