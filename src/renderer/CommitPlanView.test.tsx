// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommitPlan, GenerateCommitPlanResult, GitOperationResult, GitStatusFile } from "../shared/types";
import { CommitPlanView } from "./CommitPlanView";

const files: GitStatusFile[] = [
  { path: "src/a.ts", indexStatus: " ", worktreeStatus: "M", isStaged: false, isUnstaged: true, isConflicted: false },
  { path: "src/b.ts", indexStatus: " ", worktreeStatus: "M", isStaged: false, isUnstaged: true, isConflicted: false }
];

const plan: CommitPlan = {
  granularity: "file",
  changes: [
    { id: "change-a", path: "src/a.ts", kind: "file", label: "Whole file", fingerprint: "a".repeat(64) },
    { id: "change-b", path: "src/b.ts", kind: "file", label: "Whole file", fingerprint: "b".repeat(64) }
  ],
  groups: [
    { id: "a", message: "First commit", rationale: "First rationale", changeIds: ["change-a"] },
    { id: "b", message: "Second commit", rationale: "Second rationale", changeIds: ["change-b"] }
  ],
  unassignedChangeIds: []
};

const generated: GenerateCommitPlanResult = {
  repoPath: "D:/repo",
  exitCode: 0,
  plan,
  stderr: ""
};

const committed: GitOperationResult = {
  repoPath: "D:/repo",
  exitCode: 0,
  stdout: "",
  stderr: ""
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderView(
  onGenerate = vi.fn().mockResolvedValue(generated),
  onQuickCommit = vi.fn().mockResolvedValue(committed),
  viewFiles = files,
  onValidatePlan = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, stderr: "" })
): ReturnType<typeof render> {
  return render(
    <CommitPlanView
      repoPath="D:/repo"
      files={viewFiles}
      stagedCount={0}
      selectedPath={null}
      disabled={false}
      supported
      canGenerate
      generateTitle="Generate"
      onSelectFile={vi.fn()}
      onGenerate={onGenerate}
      onValidatePlan={onValidatePlan}
      onQuickCommit={onQuickCommit}
    />
  );
}

async function generatePlan(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await Promise.resolve();
  });
}

describe("CommitPlanView motion", () => {
  it("shows and commits separate hunks from one file", async () => {
    const hunkPlan: CommitPlan = {
      granularity: "hunk",
      changes: [
        { id: "hunk-a", path: "src/a.ts", kind: "hunk", label: "@@ -1 +1 @@ first", fingerprint: "c".repeat(64) },
        { id: "hunk-b", path: "src/a.ts", kind: "hunk", label: "@@ -20 +20 @@ second", fingerprint: "d".repeat(64) }
      ],
      groups: [
        { id: "a", message: "First hunk", rationale: "Early change", changeIds: ["hunk-a"] },
        { id: "b", message: "Second hunk", rationale: "Late change", changeIds: ["hunk-b"] }
      ],
      unassignedChangeIds: []
    };
    const onQuickCommit = vi.fn().mockResolvedValue(committed);
    renderView(vi.fn().mockResolvedValue({ ...generated, plan: hunkPlan }), onQuickCommit, [files[0]!]);

    await generatePlan();
    expect(screen.getByText("@@ -1 +1 @@ first")).toBeTruthy();
    expect(screen.getByText("@@ -20 +20 @@ second")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Quick Commit" })[0]!);
      await Promise.resolve();
    });

    expect(onQuickCommit).toHaveBeenCalledWith([
      { path: "src/a.ts", kind: "hunk", fingerprint: "c".repeat(64) }
    ], "First hunk\n\nEarly change");
  });

  it("keeps a generated plan usable when monitored hunks are unchanged", async () => {
    const onGenerate = vi.fn().mockResolvedValue(generated);
    const onValidatePlan = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, stderr: "" });
    const view = render(
      <CommitPlanView
        repoPath="D:/repo"
        files={files}
        stagedCount={0}
        selectedPath={null}
        disabled={false}
        supported
        canGenerate
        generateTitle="Generate"
        repositoryChangeVersion={0}
        onSelectFile={vi.fn()}
        onGenerate={onGenerate}
        onValidatePlan={onValidatePlan}
        onQuickCommit={vi.fn().mockResolvedValue(committed)}
      />
    );
    await generatePlan();

    view.rerender(
      <CommitPlanView
        repoPath="D:/repo"
        files={files}
        stagedCount={0}
        selectedPath={null}
        disabled={false}
        supported
        canGenerate
        generateTitle="Generate"
        repositoryChangeVersion={1}
        onSelectFile={vi.fn()}
        onGenerate={onGenerate}
        onValidatePlan={onValidatePlan}
        onQuickCommit={vi.fn().mockResolvedValue(committed)}
      />
    );

    await waitFor(() => expect(onValidatePlan).toHaveBeenCalledWith({
      repoPath: "D:/repo",
      paths: ["src/a.ts", "src/b.ts"],
      granularity: "file",
      changes: plan.changes
    }));
    expect(screen.queryByText("The working tree changed. Generate the commit plan again.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("marks a generated plan stale when monitored hunks changed", async () => {
    const onValidatePlan = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: false, stderr: "" });
    const view = renderView(vi.fn().mockResolvedValue(generated), vi.fn().mockResolvedValue(committed), files, onValidatePlan);
    await generatePlan();

    view.rerender(
      <CommitPlanView
        repoPath="D:/repo"
        files={files}
        stagedCount={0}
        selectedPath={null}
        disabled={false}
        supported
        canGenerate
        generateTitle="Generate"
        repositoryChangeVersion={1}
        onSelectFile={vi.fn()}
        onGenerate={vi.fn().mockResolvedValue(generated)}
        onValidatePlan={onValidatePlan}
        onQuickCommit={vi.fn().mockResolvedValue(committed)}
      />
    );

    expect(await screen.findByText("The working tree changed. Generate the commit plan again.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("revalidates a plan when the repository changes during generation", async () => {
    let resolveGeneration: ((result: GenerateCommitPlanResult) => void) | undefined;
    const onGenerate = vi.fn().mockImplementation(() => new Promise<GenerateCommitPlanResult>((resolve) => {
      resolveGeneration = resolve;
    }));
    const onValidatePlan = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, stderr: "" });
    const props = {
      repoPath: "D:/repo",
      files,
      stagedCount: 0,
      selectedPath: null,
      disabled: false,
      supported: true,
      canGenerate: true,
      generateTitle: "Generate",
      onSelectFile: vi.fn(),
      onGenerate,
      onValidatePlan,
      onQuickCommit: vi.fn().mockResolvedValue(committed)
    };
    const view = render(<CommitPlanView {...props} repositoryChangeVersion={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    view.rerender(<CommitPlanView {...props} repositoryChangeVersion={1} />);
    await act(async () => { resolveGeneration?.(generated); });

    await waitFor(() => expect(onValidatePlan).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("The working tree changed. Generate the commit plan again.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("ignores an older stale validation after a newer validation succeeds", async () => {
    let resolveFirst: ((result: { repoPath: string; valid: boolean; stderr: string }) => void) | undefined;
    let resolveSecond: ((result: { repoPath: string; valid: boolean; stderr: string }) => void) | undefined;
    const onValidatePlan = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const onGenerate = vi.fn().mockResolvedValue(generated);
    const props = {
      repoPath: "D:/repo",
      files,
      stagedCount: 0,
      selectedPath: null,
      disabled: false,
      supported: true,
      canGenerate: true,
      generateTitle: "Generate",
      onSelectFile: vi.fn(),
      onGenerate,
      onValidatePlan,
      onQuickCommit: vi.fn().mockResolvedValue(committed)
    };
    const view = render(<CommitPlanView {...props} repositoryChangeVersion={0} />);
    await generatePlan();

    view.rerender(<CommitPlanView {...props} repositoryChangeVersion={1} />);
    await waitFor(() => expect(onValidatePlan).toHaveBeenCalledTimes(1));
    view.rerender(<CommitPlanView {...props} repositoryChangeVersion={2} />);
    await waitFor(() => expect(onValidatePlan).toHaveBeenCalledTimes(2));

    await act(async () => { resolveSecond?.({ repoPath: "D:/repo", valid: true, stderr: "" }); });
    await act(async () => { resolveFirst?.({ repoPath: "D:/repo", valid: false, stderr: "" }); });

    expect(screen.queryByText("The working tree changed. Generate the commit plan again.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("shows eligible changed files in the persistent files-to-plan inbox", () => {
    renderView();

    const inbox = screen.getByRole("region", { name: "Files to plan" });
    expect(inbox.textContent).toContain("2");
    expect(inbox.textContent).toContain("a.ts");
    expect(inbox.textContent).toContain("b.ts");
    expect(screen.getByRole("button", { name: "Hide files to plan" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps unassigned files in the inbox after generation", async () => {
    const generatedWithUnassigned = {
      ...generated,
      plan: {
        ...plan,
        groups: [plan.groups[0]!],
        unassignedChangeIds: ["change-b"]
      }
    };
    const onGenerate = vi.fn().mockResolvedValue(generatedWithUnassigned);
    const view = renderView(onGenerate);
    await generatePlan();

    view.rerender(
      <CommitPlanView
        repoPath="D:/repo"
        files={files}
        stagedCount={0}
        selectedPath={null}
        disabled={false}
        supported
        canGenerate
        generateTitle="Generate"
        onSelectFile={vi.fn()}
        onGenerate={onGenerate}
        onValidatePlan={vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, stderr: "" })}
        onQuickCommit={vi.fn().mockResolvedValue(committed)}
      />
    );

    const inbox = screen.getByRole("region", { name: "Files to plan" });
    expect(inbox.textContent).toContain("1");
    expect(inbox.textContent).toContain("b.ts");
    expect(inbox.textContent).not.toContain("a.ts");
  });

  it("swaps the empty state for an immediately usable generated plan", async () => {
    const { container } = renderView();

    await generatePlan();

    const input = screen.getByDisplayValue("First commit");
    const enteringState = input.closest(".commit-plan-state-presence");
    expect(enteringState?.getAttribute("data-motion-state")).toBe("entered");
    expect(enteringState?.hasAttribute("inert")).toBe(false);
    expect(input.hasAttribute("disabled")).toBe(false);
    await waitFor(() => expect(container.querySelector(".motion-swap-outgoing")).toBeNull());
  });

  it("exits a committed group before moving the remaining group", async () => {
    const onQuickCommit = vi.fn().mockResolvedValue(committed);
    renderView(undefined, onQuickCommit);
    await generatePlan();

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Quick Commit" })[0]!);
      await Promise.resolve();
    });

    const exitingGroup = screen.getByText("First rationale").closest("article");
    expect(exitingGroup?.getAttribute("data-motion-state")).toBe("exiting");
    expect(exitingGroup?.hasAttribute("inert")).toBe(true);
    expect(screen.getByText("Second rationale")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("First rationale")).toBeNull());
    expect(screen.queryByText("All planned groups are committed.")).toBeNull();
    expect(onQuickCommit).toHaveBeenCalledWith([
      { path: "src/a.ts", kind: "file", fingerprint: "a".repeat(64) }
    ], "First commit\n\nFirst rationale");
  });

  it("keeps unassigned files visible after the last planned group exits", async () => {
    const generatedWithUnassigned = {
      ...generated,
      plan: {
        ...plan,
        groups: [plan.groups[0]!],
        unassignedChangeIds: ["change-b"]
      }
    };
    renderView(vi.fn().mockResolvedValue(generatedWithUnassigned));
    await generatePlan();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quick Commit" }));
      await Promise.resolve();
    });

    expect(await screen.findByText("All planned groups are committed.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("b.ts");
  });
});
