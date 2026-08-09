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
  groups: [
    { id: "a", message: "First commit", rationale: "First rationale", paths: ["src/a.ts"] },
    { id: "b", message: "Second commit", rationale: "Second rationale", paths: ["src/b.ts"] }
  ],
  unassignedPaths: []
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
  viewFiles = files
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
  it("shows eligible changed files in the persistent files-to-plan inbox", () => {
    renderView();

    const inbox = screen.getByRole("region", { name: "Files to plan" });
    expect(inbox.textContent).toContain("2");
    expect(inbox.textContent).toContain("a.ts");
    expect(inbox.textContent).toContain("b.ts");
    expect(screen.getByRole("button", { name: "Hide files to plan" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps only unassigned and newly changed files in the inbox after generation", async () => {
    const generatedWithUnassigned = {
      ...generated,
      plan: {
        groups: [plan.groups[0]!],
        unassignedPaths: ["src/b.ts"]
      }
    };
    const onGenerate = vi.fn().mockResolvedValue(generatedWithUnassigned);
    const extraFile: GitStatusFile = {
      path: "src/new.ts",
      indexStatus: " ",
      worktreeStatus: "?",
      isStaged: false,
      isUnstaged: true,
      isConflicted: false
    };
    const view = renderView(onGenerate);
    await generatePlan();

    view.rerender(
      <CommitPlanView
        repoPath="D:/repo"
        files={[...files, extraFile]}
        stagedCount={0}
        selectedPath={null}
        disabled={false}
        supported
        canGenerate
        generateTitle="Generate"
        onSelectFile={vi.fn()}
        onGenerate={onGenerate}
        onQuickCommit={vi.fn().mockResolvedValue(committed)}
      />
    );

    const inbox = screen.getByRole("region", { name: "Files to plan" });
    expect(inbox.textContent).toContain("2");
    expect(inbox.textContent).toContain("b.ts");
    expect(inbox.textContent).toContain("new.ts");
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
    expect(onQuickCommit).toHaveBeenCalledWith(["src/a.ts"], "First commit\n\nFirst rationale");
  });

  it("keeps unassigned files visible after the last planned group exits", async () => {
    const generatedWithUnassigned = {
      ...generated,
      plan: {
        groups: [plan.groups[0]!],
        unassignedPaths: ["src/b.ts"]
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
