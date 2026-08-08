// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GitRepositoryOperationKind, GitRepositoryOperationState } from "../shared/types";
import { GitOperationRecoveryBanner } from "./GitOperationRecoveryBanner";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GitOperationRecoveryBanner", () => {
  it.each([
    ["merge", "Finish this merge", false],
    ["rebase", "Finish this rebase", true],
    ["cherry-pick", "Finish this cherry-pick", true],
    ["revert", "Finish this revert", true]
  ] as const)("shows a guided recovery journey for %s", (kind, heading, supportsSkip) => {
    renderBanner(createOperationState(kind));

    expect(screen.getByText(heading)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Recovery steps" })).toBeTruthy();
    expect(screen.getByText("Review and resolve")).toBeTruthy();
    expect(screen.getByText("Stage resolutions")).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(`Continue ${kind === "cherry-pick" ? "cherry-pick" : kind}`) })).toHaveProperty("disabled", true);
    expect(screen.getByText("Stage conflicts to unlock")).toHaveProperty(
      "title",
      "Resolve and stage all conflicted files before continuing."
    );
    expect(Boolean(screen.queryByRole("button", { name: "Skip commit…" }))).toBe(supportsSkip);
    expect(screen.getByRole("button", { name: new RegExp(`Abort ${kind === "cherry-pick" ? "cherry-pick" : kind}`) })).toHaveProperty("disabled", false);
  });

  it("opens a conflicted file through the existing diff workflow", () => {
    const onOpenConflict = vi.fn();
    renderBanner(createOperationState("merge"), { onOpenConflict });

    fireEvent.click(screen.getByRole("button", { name: "Resolve conflict" }));

    expect(onOpenConflict).toHaveBeenCalledWith("src/conflicted file.ts");
  });

  it("opens a conflicted file in the user's editor from the guide", () => {
    const onOpenConflictFile = vi.fn();
    renderBanner(createOperationState("merge"), { onOpenConflictFile });

    fireEvent.click(screen.getByRole("button", { name: "Open file" }));

    expect(onOpenConflictFile).toHaveBeenCalledWith("src/conflicted file.ts");
  });

  it("confirms Abort when conflict-resolution work may be discarded", () => {
    const onAction = vi.fn();
    renderBanner(createOperationState("merge"), { onAction });

    fireEvent.click(screen.getByRole("button", { name: "Abort merge…" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/discard conflict-resolution work/)).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Abort operation" }));
    expect(onAction).toHaveBeenCalledWith("abort");
  });

  it("confirms Skip and exposes cancellation while a recovery command runs", () => {
    const onAction = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = renderBanner(createOperationState("rebase"), { onAction, onCancel });

    fireEvent.click(screen.getByRole("button", { name: "Skip commit…" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip commit" }));
    expect(onAction).toHaveBeenCalledWith("skip");

    rerender(
      <GitOperationRecoveryBanner
        state={createOperationState("rebase")}
        busy
        cancellable
        error=""
        onAction={onAction}
        onOpenConflict={vi.fn()}
        onOpenConflictFile={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel command" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps a detected operation visible with an inline action failure", () => {
    renderBanner(createOperationState("revert"), { error: "Revert failed; the operation is still active." });

    expect(screen.getByText("Finish this revert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("still active");
  });
});

function renderBanner(
  state: GitRepositoryOperationState,
  overrides: Partial<Parameters<typeof GitOperationRecoveryBanner>[0]> = {}
) {
  return render(
    <GitOperationRecoveryBanner
      state={state}
      busy={false}
      cancellable={false}
      error=""
      onAction={vi.fn()}
      onOpenConflict={vi.fn()}
      onOpenConflictFile={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />
  );
}

function createOperationState(kind: GitRepositoryOperationKind): GitRepositoryOperationState {
  const skipSupported = kind !== "merge";
  return {
    stateId: `${kind}-state`,
    kind,
    phase: "conflicts",
    backend: kind === "rebase" ? "merge" : null,
    hasConflicts: true,
    conflictedPaths: ["src/conflicted file.ts"],
    sequence: kind === "rebase" ? { current: 2, total: 4 } : null,
    originalBranch: "feature/recovery",
    currentBranch: kind === "rebase" ? null : "main",
    actions: {
      continue: {
        supported: true,
        enabled: false,
        disabledReason: "Resolve and stage all conflicted files before continuing.",
        requiresConfirmation: false
      },
      skip: {
        supported: skipSupported,
        enabled: skipSupported,
        disabledReason: skipSupported ? null : "Git does not support skipping a merge.",
        requiresConfirmation: skipSupported
      },
      abort: {
        supported: true,
        enabled: true,
        disabledReason: null,
        requiresConfirmation: true
      }
    },
    summary: `A ${kind} is paused because one file still has unresolved conflicts.`
  };
}
