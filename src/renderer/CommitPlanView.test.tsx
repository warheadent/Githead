// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommitPlan, GenerateCommitPlanResult, GitOperationResult, GitStatusFile } from "../shared/types";
import { commitPlanDraftKey } from "./commitPlanDraft";
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
  window.localStorage.clear();
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

    expect(await screen.findByText("Create a group to assign the remaining changes.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("b.ts");
  });
});


describe("CommitPlanView editing and recovery", () => {
  it("generates only the selected files", async () => {
    const onGenerate = vi.fn().mockResolvedValue(generated);
    renderView(onGenerate);
    fireEvent.click(screen.getByRole("checkbox", { name: "Plan src/b.ts" }));
    await generatePlan();
    expect(onGenerate).toHaveBeenCalledWith(["src/a.ts"]);
  });

  it("keeps unchecked changes in their group after a partial commit", async () => {
    const combined = { ...plan, groups: [{ ...plan.groups[0]!, changeIds: ["change-a", "change-b"] }] };
    const onQuickCommit = vi.fn().mockResolvedValue(committed);
    renderView(vi.fn().mockResolvedValue({ ...generated, plan: combined }), onQuickCommit);
    await generatePlan();
    fireEvent.change(screen.getByRole("textbox", { name: "Commit body" }), { target: { value: "User body\n\nMore detail" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Include src/b.ts in this commit" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Quick Commit" })); });
    expect(onQuickCommit).toHaveBeenCalledWith([expect.objectContaining({ path: "src/a.ts" })], "First commit\n\nUser body\n\nMore detail");
    expect(screen.getByDisplayValue("First commit")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Commit body" })).toHaveProperty("value", "User body\n\nMore detail");
    expect(screen.getByRole("checkbox", { name: "Include src/b.ts in this commit" })).toHaveProperty("checked", false);
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).not.toContain("b.ts");
  });

  it("creates, reorders and removes groups without losing changes", async () => {
    renderView();
    await generatePlan();
    fireEvent.click(screen.getByRole("button", { name: "Move commit 2 up" }));
    expect(screen.getAllByRole("textbox", { name: "Commit message" })[0]).toHaveProperty("value", "Second commit");
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getAllByRole("textbox", { name: "Commit message" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove commit group 1" }));
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("b.ts");
    expect(screen.getAllByRole("textbox", { name: "Commit message" })).toHaveLength(2);
  });

  it("restores edits and blocks commits until the saved draft is validated", async () => {
    const first = renderView();
    await generatePlan();
    fireEvent.change(screen.getAllByRole("textbox", { name: "Commit message" })[0]!, { target: { value: "Saved subject" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Include src/a.ts in this commit" }));
    first.unmount();
    const raw = window.localStorage.getItem(commitPlanDraftKey("D:/repo"));
    expect(raw).toContain("Saved subject");
    expect(raw).not.toContain("validating");
    let resolve!: (result: { repoPath: string; valid: boolean; stderr: string }) => void;
    const validate = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
    renderView(vi.fn(), vi.fn(), files, validate);
    expect(screen.getByDisplayValue("Saved subject")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    await act(async () => { resolve({ repoPath: "D:/repo", valid: true, stderr: "" }); });
    expect(screen.getByRole("checkbox", { name: "Include src/a.ts in this commit" })).toHaveProperty("checked", false);
    expect(screen.getAllByRole("button", { name: "Quick Commit" })[1]).toHaveProperty("disabled", false);
  });

  it("preserves unaffected groups when a refresh returns changed content", async () => {
    const validate = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, currentChanges: plan.changes, stderr: "" });
    renderView(vi.fn().mockResolvedValue(generated), vi.fn(), files, validate);
    await generatePlan();
    fireEvent.change(screen.getAllByRole("textbox", { name: "Commit message" })[0]!, { target: { value: "Keep this edit" } });
    validate.mockResolvedValue({ repoPath: "D:/repo", valid: false, currentChanges: [{ ...plan.changes[0]!, fingerprint: "c".repeat(64) }, plan.changes[1]!], stderr: "" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh" })); });
    expect(screen.getByDisplayValue("Keep this edit")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("a.ts");
    expect(screen.getByText("Changes moved or disappeared. Review this group.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Quick Commit" })[1]).toHaveProperty("disabled", false);
  });

  it("clears the busy state after a rejected generation", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error("Provider disconnected")).mockResolvedValue(generated);
    renderView(generate);
    await generatePlan();
    expect(screen.getByText("Provider disconnected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate" })).toHaveProperty("disabled", false);
    await generatePlan();
    expect(screen.getByDisplayValue("First commit")).toBeTruthy();
  });

  it("preserves a commit failure message after background validation", async () => {
    renderView(vi.fn().mockResolvedValue(generated), vi.fn().mockResolvedValue({ ...committed, exitCode: 1, stderr: "Hook failed" }));
    await generatePlan();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Quick Commit" })[0]!); });
    expect(screen.getByText("Hook failed")).toBeTruthy();
    expect(screen.getByDisplayValue("First commit")).toBeTruthy();
  });
});


it("stores a completed generation after the user leaves the plan view", async () => {
  let resolve!: (result: GenerateCommitPlanResult) => void;
  const generate = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = renderView(generate);
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  view.unmount();
  await act(async () => { resolve(generated); });
  renderView();
  expect(screen.getByDisplayValue("First commit")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Quick Commit" })).toHaveLength(2);
});

it("adds newly discovered files to the inbox without invalidating existing groups", async () => {
  const addedFile = { ...files[0]!, path: "src/new.ts" };
  const addedChange = { ...plan.changes[0]!, id: "new", path: addedFile.path, fingerprint: "e".repeat(64) };
  const validate = vi.fn().mockResolvedValue({ repoPath: "D:/repo", valid: true, currentChanges: plan.changes, stderr: "" });
  const props = { repoPath: "D:/repo", files, stagedCount: 0, selectedPath: null, disabled: false, supported: true, canGenerate: true, generateTitle: "Generate", onSelectFile: vi.fn(), onGenerate: vi.fn().mockResolvedValue(generated), onQuickCommit: vi.fn(), onValidatePlan: validate };
  const view = render(<CommitPlanView {...props} />);
  await generatePlan();
  validate.mockResolvedValue({ repoPath: "D:/repo", valid: false, currentChanges: [...plan.changes, addedChange], stderr: "" });
  await act(async () => { view.rerender(<CommitPlanView {...props} files={[...files, addedFile]} />); });
  expect(validate).toHaveBeenLastCalledWith(expect.objectContaining({ paths: ["src/a.ts", "src/b.ts", "src/new.ts"] }));
  expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("new.ts");
  expect(screen.getAllByRole("button", { name: "Quick Commit" }).every((button) => !button.hasAttribute("disabled"))).toBe(true);
});


it("does not read the diffs again after generation if the repository did not change", async () => {
  const validate = vi.fn();
  renderView(vi.fn().mockResolvedValue(generated), vi.fn(), files, validate);
  await generatePlan();
  expect(validate).not.toHaveBeenCalled();
});
