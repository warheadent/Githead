// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

const nativeAnimateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 1));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame));
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (nativeAnimateDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "animate", nativeAnimateDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
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
    act(() => vi.runOnlyPendingTimers());

    await generatePlan();

    const input = screen.getByDisplayValue("First commit");
    const enteringState = input.closest(".commit-plan-state-presence");
    expect(enteringState?.getAttribute("data-motion-state")).toBe("entering");
    expect(enteringState?.hasAttribute("inert")).toBe(false);
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(container.querySelector(".motion-swap-outgoing")?.textContent).toContain("Create a focused commit plan");

    act(() => vi.runOnlyPendingTimers());
    expect(input.closest(".commit-plan-state-presence")?.getAttribute("data-motion-state")).toBe("entered");
  });

  it("exits a committed group before moving the remaining group", async () => {
    const animations: Array<{ cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }> = [];
    const animate = vi.fn(() => {
      const animation = { cancel: vi.fn(), finished: new Promise<void>(() => undefined) };
      animations.push(animation);
      return animation as unknown as Animation;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
      const top = index * 100;
      return { x: 0, y: top, top, left: 0, right: 400, bottom: top + 80, width: 400, height: 80, toJSON: () => ({}) };
    });
    const onQuickCommit = vi.fn().mockResolvedValue(committed);
    renderView(undefined, onQuickCommit);
    act(() => vi.runOnlyPendingTimers());
    await generatePlan();
    act(() => vi.runOnlyPendingTimers());

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Quick Commit" })[0]!);
      await Promise.resolve();
    });

    const exitingGroup = screen.getByText("First rationale").closest("article");
    expect(exitingGroup?.getAttribute("data-motion-state")).toBe("exiting");
    expect(exitingGroup?.hasAttribute("inert")).toBe(true);
    expect(screen.getByText("Second rationale")).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(120));
    expect(screen.queryByText("First rationale")).toBeNull();
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateY(100px)" }, { transform: "translateY(0)" }],
      { duration: 120, easing: "ease" }
    );
    expect(screen.queryByText("All planned groups are committed.")).toBeNull();
    expect(onQuickCommit).toHaveBeenCalledWith(["src/a.ts"], "First commit\n\nFirst rationale");

    act(() => vi.advanceTimersByTime(200));
    expect(animations.at(-1)?.cancel).toHaveBeenCalled();
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
    act(() => vi.runOnlyPendingTimers());
    await generatePlan();
    act(() => vi.runOnlyPendingTimers());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Quick Commit" }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(120));

    expect(screen.getByText("All planned groups are committed.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Files to plan" }).textContent).toContain("b.ts");
  });
});
