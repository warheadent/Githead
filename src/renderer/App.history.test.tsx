// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createCommit,
  createCommitDetails,
  createOperationResult,
  createStatusFile,
  createSummary,
  createTextDiff,
  defer,
  emitRepoChanged,
  flushRendererAsync,
  getStatusTone,
  githead,
  repoPath,
  repositoryRecents,
  waitForRepositoryWorkspace,
  windowStateCallback,
  type AppSettings,
  type GitCommitGraphRow,
  type GitheadApi,
  type GitOperationResult,
  type RepoSummary,
  type RepositoryRecent
} from "./AppTestHarness";
import { App } from "./App";

describe("App", { timeout: 10_000 }, () => {
  it("completes startup when Strict Mode replays effects", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    await waitForRepositoryWorkspace();
  });

  it("shows the startup screen instead of setup while recent repositories load", async () => {
    const pendingRecents = defer<RepositoryRecent[]>();
    vi.mocked(githead.getRepoRecents).mockReturnValue(pendingRecents.promise);

    render(<App />);

    const status = screen.getByRole("status");
    expect(within(status).getByText("Opening your workspace…")).toBeTruthy();
    expect(within(status).getByText("Loading saved repositories")).toBeTruthy();
    expect(screen.queryByText("Select a repository to continue.")).toBeNull();

    pendingRecents.resolve(repositoryRecents(repoPath));
    await waitForRepositoryWorkspace();
  });

  it("keeps the startup screen visible until app settings load", async () => {
    const pendingSettings = defer<AppSettings>();
    vi.mocked(githead.getAppSettings).mockReturnValue(pendingSettings.promise);

    render(<App />);

    expect(await screen.findByText("Opening Githead…")).toBeTruthy();
    expect(screen.queryByText("Select a repository to continue.")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();

    pendingSettings.resolve({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: { tagPushBehavior: "all" },
      privacy: { shareAnonymousDiagnostics: true }
    });
    await waitForRepositoryWorkspace();
  });

  it("shows a repository error when startup cannot load recents", async () => {
    vi.mocked(githead.getRepoRecents).mockRejectedValue(new Error("Recent repositories are unavailable."));

    render(<App />);

    expect(await screen.findByText("Recent repositories are unavailable.")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
  });

  it("renders custom window controls on the repository setup screen", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      isValid: false,
      validationErrors: [
        "Not a git repository."
      ]
    }));

    render(<App />);

    expect(await screen.findByText("Select a repository to continue.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Githead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximize window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close window" })).toBeTruthy();
  });

  it("renders custom window controls in the repository workspace and calls window APIs", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Maximize window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));

    expect(githead.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(githead.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(githead.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("dismisses a window control tooltip when its action is clicked", async () => {
    render(<App />);

    await waitForRepositoryWorkspace();
    const minimizeButton = screen.getByRole("button", { name: "Minimize window" });
    fireEvent.focus(minimizeButton);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Minimize window");

    fireEvent.click(minimizeButton);

    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(githead.minimizeWindow).toHaveBeenCalledTimes(1);
  });

  it("renders a compact repository heading with the add action", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).queryByRole("heading", { name: "Githead" })).toBeNull();
    expect(within(sidebar).queryByText("Repository ready")).toBeNull();
    expect(within(sidebar).queryByText("Checking repository...")).toBeNull();
    expect(within(sidebar).getAllByText("Repositories")).toHaveLength(1);

    await user.click(within(sidebar).getByRole("button", { name: "Add repository" }));
    expect(await screen.findByRole("button", { name: "Add existing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clone new" })).toBeTruthy();
  });

  it("marks file status badges with semantic tones", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/added.ts", {
          indexStatus: "A",
          isStaged: true
        }),
        createStatusFile("src/modified.ts", {
          worktreeStatus: "M",
          isUnstaged: true
        }),
        createStatusFile("src/deleted.ts", {
          worktreeStatus: "D",
          isUnstaged: true
        }),
        createStatusFile("src/untracked.ts", {
          indexStatus: "?",
          worktreeStatus: "?",
          isUnstaged: true
        }),
        createStatusFile("src/conflicted.ts", {
          indexStatus: "U",
          worktreeStatus: "U",
          isStaged: true,
          isUnstaged: true,
          isConflicted: true
        })
      ]
    }));

    render(<App />);

    const stagedFiles = await screen.findByRole("listbox", { name: "Staged files" });
    const unstagedFiles = screen.getByRole("listbox", { name: "Unstaged files" });

    const expectedStatuses = [
      [within(stagedFiles).getByRole("option", { name: /src\/added\.ts/ }), "added"],
      [within(unstagedFiles).getByRole("option", { name: /src\/modified\.ts/ }), "modified"],
      [within(unstagedFiles).getByRole("option", { name: /src\/deleted\.ts/ }), "deleted"],
      [within(unstagedFiles).getByRole("option", { name: /src\/untracked\.ts/ }), "untracked"],
      [within(stagedFiles).getByRole("option", { name: /src\/conflicted\.ts/ }), "conflict"]
    ] as const;

    for (const [row, tone] of expectedStatuses) {
      expect(getStatusTone(row)).toBe(tone);
      expect(row.querySelector(".status-chip svg")).toBeTruthy();
    }
  });

  it("generates a commit plan and creates a Quick Commit for one group", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/plan.ts", { worktreeStatus: "M", isUnstaged: true }),
        createStatusFile("src/plan.test.ts", { worktreeStatus: "M", isUnstaged: true })
      ]
    }));
    vi.mocked(githead.generateCommitPlan).mockResolvedValue({
      repoPath,
      exitCode: 0,
      plan: {
        granularity: "file",
        changes: [
          { id: "change-1", path: "src/plan.ts", kind: "file", label: "Whole file", fingerprint: "a".repeat(64) },
          { id: "change-2", path: "src/plan.test.ts", kind: "file", label: "Whole file", fingerprint: "b".repeat(64) }
        ],
        groups: [{
          id: "group-1",
          message: "feat(status): add commit plans",
          rationale: "Adds the plan workflow and its test.",
          changeIds: ["change-1", "change-2"]
        }],
        unassignedChangeIds: []
      },
      stderr: ""
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Commit plan view" }));
    expect(screen.queryByText("Commit message")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(githead.generateCommitPlan).toHaveBeenCalledWith({
      repoPath,
      paths: ["src/plan.test.ts", "src/plan.ts"],
      operationId: expect.any(String)
    }));
    expect(await screen.findByDisplayValue("feat(status): add commit plans")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("listbox", { name: "Commit history" });
    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    expect(await screen.findByDisplayValue("feat(status): add commit plans")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Quick Commit" }));
    await waitFor(() => expect(githead.quickCommitFiles).toHaveBeenCalledWith({
      repoPath,
      changes: [
        { path: "src/plan.ts", kind: "file", fingerprint: "a".repeat(64) },
        { path: "src/plan.test.ts", kind: "file", fingerprint: "b".repeat(64) }
      ],
      message: "feat(status): add commit plans\n\nAdds the plan workflow and its test.",
      operationId: expect.any(String)
    }));
  });

  it("keeps a commit plan usable after a monitored no-content working-tree change", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("src/plan.ts", { worktreeStatus: "M", isUnstaged: true })]
    }));
    vi.mocked(githead.generateCommitPlan).mockResolvedValue({
      repoPath,
      exitCode: 0,
      plan: {
        granularity: "hunk",
        changes: [{ id: "change-1", path: "src/plan.ts", kind: "hunk", label: "@@ -1 +1 @@", fingerprint: "a".repeat(64) }],
        groups: [{ id: "group-1", message: "Change one hunk", rationale: "Focused change.", changeIds: ["change-1"] }],
        unassignedChangeIds: []
      },
      stderr: ""
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Commit plan view" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByDisplayValue("Change one hunk");

    emitRepoChanged();

    await waitFor(() => expect(githead.validateCommitPlan).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      paths: ["src/plan.ts"],
      granularity: "hunk",
      changes: [{ id: "change-1", path: "src/plan.ts", kind: "hunk", label: "@@ -1 +1 @@", fingerprint: "a".repeat(64) }]
    })));
    expect(screen.queryByText("The working tree changed. Generate the commit plan again.")).toBeNull();
    expect(screen.getByRole("button", { name: "Quick Commit" }).hasAttribute("disabled")).toBe(false);
  });

  it("switches the maximize control to restore when the window is maximized", async () => {
    render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: "Maximize window" })).toBeTruthy();

    act(() => {
      windowStateCallback?.({
        isMaximized: true
      });
    });

    expect(screen.getByRole("button", { name: "Restore window" })).toBeTruthy();
  });

  it("renders repository validation failures from the initial summary", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      isValid: false,
      validationErrors: [
        "Not a git repository."
      ]
    }));

    render(<App />);

    expect(await screen.findByText("Not a git repository.")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
  });

  it("preloads the full history once and reuses it on the first tab open", async () => {
    const user = userEvent.setup();
    const history = Array.from({ length: 25 }, (_, index) => createCommit({
      hash: index.toString(16).padStart(40, "0"),
      subject: `feat: preloaded history ${index}`
    }));
    let idleCallback: IdleRequestCallback | null = null;
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      idleCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    vi.mocked(githead.getCommitHistory).mockResolvedValue(history);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await waitFor(() => expect(idleCallback).not.toBeNull());
    act(() => idleCallback?.({ didTimeout: false, timeRemaining: () => 50 }));
    await flushRendererAsync();
    expect(githead.getCommitHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ limit: 200, scope: "current" }));
    expect(githead.getCommitDetails).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(screen.getByRole("option", { name: /preloaded history 0/ }).getAttribute("aria-setsize")).toBe("25");
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);
    expect(githead.getCommitDetails).toHaveBeenCalledWith(expect.objectContaining({ hash: history[0]!.hash }));

    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });

  it("finishes an in-flight preload after opening History without waiting for commit details", async () => {
    const user = userEvent.setup();
    const history = Array.from({ length: 25 }, (_, index) => createCommit({
      hash: index.toString(16).padStart(40, "0"), subject: `feat: pending history ${index}`
    }));
    const pendingHistory = defer<GitCommitGraphRow[]>();
    const pendingDetails = defer<Awaited<ReturnType<GitheadApi["getCommitDetails"]>>>();
    let idleCallback: IdleRequestCallback | null = null;
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      idleCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    vi.mocked(githead.getCommitHistory).mockReturnValue(pendingHistory.promise);
    vi.mocked(githead.getCommitDetails).mockReturnValue(pendingDetails.promise);
    render(<App />);
    await waitForRepositoryWorkspace();
    act(() => idleCallback?.({ didTimeout: false, timeRemaining: () => 50 }));
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    pendingHistory.resolve(history);
    expect((await screen.findByRole("option", { name: /pending history 0/ })).getAttribute("aria-setsize")).toBe("25");
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);
    expect(githead.getCommitHistory).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    pendingDetails.resolve(createCommitDetails(history[0]!.hash));
    await flushRendererAsync();
  });

  it.each([false, true])("invalidates an idle preload after repository metadata changes, pending=%s", async (pending) => {
    const user = userEvent.setup();
    const pendingHistory = defer<GitCommitGraphRow[]>();
    const history = [createCommit({ subject: "feat: preloaded head" })];
    let idleCallback: IdleRequestCallback | null = null;
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      idleCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    vi.mocked(githead.getCommitHistory).mockReturnValueOnce(pendingHistory.promise)
      .mockResolvedValue([createCommit({ subject: "feat: current head" })]);
    render(<App />);
    await waitForRepositoryWorkspace();
    act(() => idleCallback?.({ didTimeout: false, timeRemaining: () => 50 }));
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(1));
    if (!pending) {
      pendingHistory.resolve(history);
      await flushRendererAsync();
    }
    emitRepoChanged({ reason: "filesystem-metadata" });
    await waitFor(() => expect(githead.getRepoIdentity).toHaveBeenCalledTimes(2));
    await flushRendererAsync();
    if (pending) {
      pendingHistory.resolve(history);
      await flushRendererAsync();
    }
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(await screen.findByRole("option", { name: /current head/ })).toBeTruthy();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });

  it("refreshes active history while repository sections are still pending", async () => {
    const user = userEvent.setup();
    const pendingStatus = defer<Awaited<ReturnType<GitheadApi["getRepoStatus"]>>>();
    const pendingMetadata = defer<Awaited<ReturnType<GitheadApi["getRepoMetadata"]>>>();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(1));
    const status = await githead.getRepoStatus({ repoPath, generation: 2 });
    const metadata = await githead.getRepoMetadata({ repoPath, generation: 2 });
    vi.mocked(githead.getRepoStatus).mockReturnValue(pendingStatus.promise);
    vi.mocked(githead.getRepoMetadata).mockReturnValue(pendingMetadata.promise);
    vi.mocked(githead.getCommitHistory).mockResolvedValue([createCommit({ subject: "feat: early history" })]);
    emitRepoChanged({ reason: "filesystem-metadata" });
    expect(await screen.findByRole("option", { name: /early history/ })).toBeTruthy();
    pendingStatus.resolve(status);
    pendingMetadata.resolve(metadata);
    await flushRendererAsync();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });

  it("styles conventional commit subjects in history and details while falling back to raw subjects", async () => {
    const user = userEvent.setup();
    const conventionalCommit = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat(ai): add attack pressure cooldown",
      refs: [
        {
          name: "main",
          kind: "branch"
        },
        {
          name: "v1.2.3",
          kind: "tag"
        }
      ]
    });
    const rawCommit = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "Add MeshBites Shader"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([
      conventionalCommit,
      rawCommit
    ]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash,
      hash === rawCommit.hash ? { subject: rawCommit.subject } : {}
    ));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    await waitFor(() => expect(screen.getAllByText("Feature")).toHaveLength(2));
    const historyBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".history-row"));
    const detailBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".commit-summary-meta"));
    expect(historyBadge?.className).toContain("commit-type-badge");
    expect(historyBadge?.className).toContain("type-feat");
    expect(detailBadge?.className).toContain("commit-type-badge");
    expect(detailBadge?.className).toContain("type-feat");
    expect(detailBadge?.closest(".commit-title")).toBeNull();
    const metadata = detailBadge?.closest(".commit-summary-meta");
    expect(metadata?.lastElementChild).toBe(detailBadge);
    expect(metadata?.querySelector(".commit-copy-hash")).toBeTruthy();
    expect(screen.queryByText("v1.2.3")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 2 references" }));
    expect(await screen.findByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("tag")).toBeTruthy();
    await user.keyboard("{Escape}");
    const branchRefBadge = screen.getAllByText("main").find((element) => element.closest(".ref-badge"))?.closest(".ref-badge");
    expect(branchRefBadge?.className).toContain("branch");
    expect(branchRefBadge?.querySelector("svg")).toBeNull();
    expect(screen.getByTestId("commit-graph-svg")).toBeTruthy();
    expect(screen.getAllByTestId("commit-graph-node")).toHaveLength(2);
    expect(screen.getAllByText("ai:").some((scope) => scope.closest(".commit-title"))).toBe(true);
    const detailDescription = screen.getAllByText("add attack pressure cooldown").find((element) => (
      element.className.includes("commit-title-description")
    ));
    const historyDescription = screen.getAllByText("add attack pressure cooldown").find((element) => (
      element.className.includes("history-description-text")
    ));
    expect(detailDescription).toBeTruthy();
    expect(historyDescription?.closest(".history-subject-tooltip")?.getAttribute("data-slot")).toBe("tooltip-trigger");
    expect(screen.getByText("Add MeshBites Shader")).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /Add MeshBites Shader/ }));
    const detailsPanel = screen.getByRole("region", { name: "Commit details" });
    await within(detailsPanel).findByRole("heading", { name: "Add MeshBites Shader" });
    expect(detailsPanel.querySelector(".commit-type-badge")).toBeNull();
  });

  it("keeps table headings and rows together when either scrolls horizontally", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([createCommit()]);
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const list = await screen.findByRole("listbox", { name: "Commit history" });
    const header = screen.getByRole("region", { name: "Commit list" }).querySelector<HTMLElement>(".history-table-header")!;
    fireEvent.scroll(list, { target: { scrollLeft: 100 } });
    expect(header.scrollLeft).toBe(100);
    fireEvent.scroll(header, { target: { scrollLeft: 40 } });
    expect(list.scrollLeft).toBe(40);
  });

  it("aligns the commit graph after hidden columns", async () => {
    const storageKey = "githead.column-layout.history";
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 2,
      order: ["description", "graph", "date", "author", "commit", "references", "pullRequest", "checks"],
      widths: { graph: 82, description: 360 },
      visibility: { graph: true, description: false }
    }));
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      subject: "fix: align visible history columns"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    try {
      render(<App />);
      await waitForRepositoryWorkspace();
      await user.click(screen.getByRole("tab", { name: /Commit History/ }));

      expect(await screen.findByTestId("commit-graph-svg")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Commit list" }).style.getPropertyValue("--history-graph-offset")).toBe("calc(12px)");
    } finally {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("does not render the commit graph overlay when its column is hidden", async () => {
    const storageKey = "githead.column-layout.history";
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 2,
      order: ["graph", "description", "date", "author", "commit", "references", "pullRequest", "checks"],
      widths: { graph: 82, description: 360 },
      visibility: { graph: false, description: true }
    }));
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "d".repeat(40),
      shortHash: "ddddddd",
      subject: "fix: hide history graph"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    try {
      render(<App />);
      await waitForRepositoryWorkspace();
      await user.click(screen.getByRole("tab", { name: /Commit History/ }));

      expect(await screen.findByRole("option", { name: /hide history graph/ })).toBeTruthy();
      expect(screen.queryByTestId("commit-graph-svg")).toBeNull();
    } finally {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("switches between current and all commit history with an accessible scope control", async () => {
    const user = userEvent.setup();
    const currentCommit = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat: current branch commit",
      refs: [{ name: "main", kind: "branch" }]
    });
    const remoteCommit = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "feat: remote branch commit",
      refs: [{ name: "origin/feature", kind: "remote" }]
    });
    vi.mocked(githead.getCommitHistory).mockImplementation(async ({ scope }) => (
      scope === "all" ? [remoteCommit, currentCommit] : [currentCommit]
    ));
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    const scopeControl = screen.getByRole("group", { name: "Commit history scope" });
    const currentButton = within(scopeControl).getByRole("button", { name: "Current branch" });
    const allButton = within(scopeControl).getByRole("button", { name: "All branches" });
    expect(currentButton.getAttribute("aria-pressed")).toBe("true");
    expect(allButton.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "current" })));

    await user.click(allButton);
    await screen.findByRole("option", { name: /remote branch commit/ });

    expect(currentButton.getAttribute("aria-pressed")).toBe("false");
    expect(allButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("origin/feature").closest(".ref-badge")?.className).toContain("remote");
    expect(screen.getByRole("option", { name: /current branch commit/ }).getAttribute("aria-selected")).toBe("true");
    expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "all" }));
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "commit-details:1" });
    await waitFor(() => expect(githead.getCommitDetails).toHaveBeenCalledTimes(2));
  });

  it("ignores an unresolved all-history response after switching back to current", async () => {
    const user = userEvent.setup();
    const currentCommit = createCommit({
      hash: "a".repeat(40),
      subject: "feat: stable current history",
      refs: [{ name: "main", kind: "branch" }]
    });
    const staleRemoteCommit = createCommit({
      hash: "b".repeat(40),
      subject: "feat: stale remote history",
      refs: [{ name: "origin/stale", kind: "remote" }]
    });
    const pendingAllHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([currentCommit])
      .mockReturnValueOnce(pendingAllHistory.promise)
      .mockResolvedValueOnce([currentCommit]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("option", { name: /stable current history/ });

    await user.click(screen.getByRole("button", { name: "All branches" }));
    expect(await screen.findByText("Loading commit history")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Current branch" }));
    await screen.findByRole("option", { name: /stable current history/ });
    pendingAllHistory.resolve([staleRemoteCommit, currentCommit]);
    await flushRendererAsync();

    expect(screen.queryByRole("option", { name: /stale remote history/ })).toBeNull();
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "history:2" });
    expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "current" }));
  });

  it("refreshes the active all-history scope after Fetch", async () => {
    const user = userEvent.setup();
    const currentCommit = createCommit({ hash: "a".repeat(40), subject: "feat: current" });
    const firstRemoteCommit = createCommit({ hash: "b".repeat(40), subject: "feat: first remote" });
    const refreshedRemoteCommit = createCommit({ hash: "c".repeat(40), subject: "feat: refreshed remote" });
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([currentCommit])
      .mockResolvedValueOnce([firstRemoteCommit, currentCommit])
      .mockResolvedValueOnce([refreshedRemoteCommit, firstRemoteCommit, currentCommit]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("button", { name: "All branches" }));
    await screen.findByRole("option", { name: /first remote/ });
    await user.click(screen.getByRole("button", { name: "Fetch" }));

    await screen.findByRole("option", { name: /refreshed remote/ });
    expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "all" }));
  });

  it("uses the decorated current branch as the GitHub head in all-history scope", async () => {
    const user = userEvent.setup();
    const currentCommit = createCommit({
      hash: "a".repeat(40),
      subject: "feat: current GitHub head",
      refs: [{ name: "main", kind: "branch" }]
    });
    const newerRemoteCommit = createCommit({
      hash: "b".repeat(40),
      subject: "feat: newer remote",
      refs: [{ name: "origin/feature", kind: "remote" }]
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      githubRepository: { owner: "openai", name: "githead", fullName: "openai/githead", webUrl: "https://github.com/openai/githead" }
    }));
    vi.mocked(githead.getCommitHistory).mockImplementation(async ({ scope }) => (
      scope === "all" ? [newerRemoteCommit, currentCommit] : [currentCommit]
    ));
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("button", { name: "All branches" }));

    await waitFor(() => expect(githead.getGitHubHistoryInsights).toHaveBeenLastCalledWith(expect.objectContaining({
      headSha: currentCommit.hash,
      commitShas: expect.arrayContaining([newerRemoteCommit.hash, currentCommit.hash])
    })));
  });

  it("keeps the current history and latest selection visible during a background refresh", async () => {
    const user = userEvent.setup();
    const firstCommit = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat: first commit"
    });
    const secondCommit = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "fix: selected commit"
    });
    const newHead = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      subject: "feat: refreshed head"
    });
    const pendingHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([firstCommit, secondCommit])
      .mockReturnValueOnce(pendingHistory.promise);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash, {
      files: [{ path: `${hash.slice(0, 1)}.ts`, status: "modified", additions: 1, deletions: 0 }]
    }));
    vi.mocked(githead.getCommitFileDiff).mockImplementation(async ({ path }) => createTextDiff(path, path));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const secondRow = await screen.findByRole("option", { name: /selected commit/ });

    emitRepoChanged({ reason: "filesystem-metadata" });
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(2));
    await user.click(secondRow);
    await screen.findByRole("option", { name: /b\.ts/ });
    await waitFor(() => expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(2));
    const detailsCallsBeforeRefreshCompletes = vi.mocked(githead.getCommitDetails).mock.calls.length;
    const diffCallsBeforeRefreshCompletes = vi.mocked(githead.getCommitFileDiff).mock.calls.length;

    expect(secondRow.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Loading commit history")).toBeNull();
    expect(screen.getByText("Refreshing commit history")).toBeTruthy();

    pendingHistory.resolve([newHead, firstCommit, secondCommit]);
    await screen.findByRole("option", { name: /refreshed head/ });
    await waitFor(() => expect(screen.queryByText("Refreshing commit history")).toBeNull());

    expect(screen.getByRole("option", { name: /selected commit/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /b\.ts/ })).toBeTruthy();
    expect(githead.getCommitDetails).toHaveBeenCalledTimes(detailsCallsBeforeRefreshCompletes);
    expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(diffCallsBeforeRefreshCompletes);
  });

  it("refreshes cached commit history when the Commit History tab opens again", async () => {
    const user = userEvent.setup();
    const previousHead = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat: previous head"
    });
    const pushedHead = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "fix: pushed head"
    });
    const pendingRefresh = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([previousHead])
      .mockReturnValueOnce(pendingRefresh.promise);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("option", { name: /previous head/ });

    await user.click(screen.getByRole("tab", { name: /File Status/ }));
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    expect(screen.getByRole("option", { name: /previous head/ })).toBeTruthy();
    expect(screen.getByText("Refreshing commit history")).toBeTruthy();
    pendingRefresh.resolve([pushedHead, previousHead]);
    expect(await screen.findByRole("option", { name: /pushed head/ })).toBeTruthy();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(2);
  });

  it("selects and loads the refreshed head when the previous commit disappears", async () => {
    const user = userEvent.setup();
    const removedCommit = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat: removed commit"
    });
    const refreshedHead = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "fix: replacement head"
    });
    const pendingHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([removedCommit])
      .mockReturnValueOnce(pendingHistory.promise);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("option", { name: /removed commit/ });

    emitRepoChanged({ reason: "filesystem-metadata" });
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(2));
    pendingHistory.resolve([refreshedHead]);

    const replacementRow = await screen.findByRole("option", { name: /replacement head/ });
    expect(replacementRow.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(githead.getCommitDetails).toHaveBeenLastCalledWith({
      repoPath,
      hash: refreshedHead.hash,
      requestId: expect.any(String)
    }));
  });

  it("retains stale history after a background refresh failure", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ subject: "feat: stable stale history" });
    const pendingHistory = defer<GitCommitGraphRow[]>();
    vi.mocked(githead.getCommitHistory)
      .mockResolvedValueOnce([commit])
      .mockReturnValueOnce(pendingHistory.promise);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitRow = await screen.findByRole("option", { name: /stable stale history/ });

    emitRepoChanged({ reason: "filesystem-metadata" });
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenCalledTimes(2));
    pendingHistory.reject(new Error("history unavailable"));

    expect(await screen.findByText("Commit history refresh failed: history unavailable")).toBeTruthy();
    expect(commitRow.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Loading commit history")).toBeNull();
  });

  it("shows a blocking error when the initial history load fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getCommitHistory).mockRejectedValue(new Error("initial history unavailable"));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    expect(await screen.findByText("initial history unavailable")).toBeTruthy();
    expect(screen.queryByRole("listbox", { name: "Commit history" })?.querySelector(".history-rows")).toBeNull();
  });

  it("renders selected commit bodies as markdown", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      subject: "feat(ui): render markdown commit body"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      body: [
        "- Preserve **graph** line segments",
        "- Render `connector` rows",
        "",
        "[View details](https://example.test/commit)"
      ].join("\n")
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    expect(await screen.findByText(/Preserve/)).toBeTruthy();
    expect(screen.getByRole("list").tagName).toBe("UL");
    expect(screen.getByText("graph").tagName).toBe("STRONG");
    expect(screen.getByText("connector").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "View details" });
    expect(link.getAttribute("href")).toBe("https://example.test/commit");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("keeps changed files separate from long commit body scrolling", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "d".repeat(40),
      shortHash: "ddddddd",
      subject: "feat(ui): keep commit details bounded"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      body: Array.from({ length: 18 }, (_, index) => `- Commit body bullet ${index + 1}`).join("\n"),
      files: [
        { path: "src/renderer/App.tsx", status: "modified", additions: 12, deletions: 4 },
        { path: "src/renderer/styles.css", status: "modified", additions: 8, deletions: 1 },
        { path: "src/renderer/App.test.tsx", status: "modified", additions: 16, deletions: 0 },
        { path: "README.md", status: "modified", additions: 1, deletions: 0 }
      ]
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    const firstBullet = await screen.findByText("Commit body bullet 1");
    const metaScroller = firstBullet.closest(".commit-meta-scroll");
    expect(metaScroller).toBeTruthy();
    expect(metaScroller?.querySelector(".commit-file-list-header")).toBeNull();

    const fileList = screen.getByRole("listbox", { name: "Changed files" });
    expect(fileList.className).toContain("commit-file-list");
    expect(within(fileList).getByRole("option", { name: /src\/renderer\/App\.tsx/ })).toBeTruthy();
    expect(within(fileList).getAllByRole("option")).toHaveLength(4);

    const fileHeader = screen.getByText("4 files").closest(".commit-file-list-header");
    expect(fileHeader).toBeTruthy();
    expect(fileHeader?.contains(fileList)).toBe(false);
    expect(fileHeader?.textContent).toContain("+37");
    expect(fileHeader?.textContent).toContain("−5");
    expect(fileHeader?.closest(".commit-meta-scroll")).toBeNull();
  });

  it("copies the full hash from the compact commit summary", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ hash: "c".repeat(40), shortHash: "ccccccc" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const copy = await screen.findByRole("button", { name: "Copy commit SHA" });
    expect(screen.getByText("Commit details", { selector: "summary" }).parentElement?.hasAttribute("open")).toBe(false);
    await user.click(copy);
    await waitFor(() => expect(githead.copyCommitShaToClipboard).toHaveBeenCalledWith({ repoPath, hash: commit.hash }));
  });

  it("loads parent commit details when a parent hash is clicked", async () => {
    const user = userEvent.setup();
    const commitHash = "c".repeat(40);
    const parentHash = "p".repeat(40);
    const commit = createCommit({
      hash: commitHash,
      shortHash: "ccccccc",
      parents: [parentHash],
      subject: "feat(ui): link parent commits"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash, {
      parents: hash === commitHash ? [parentHash] : [],
      subject: hash === commitHash ? "feat(ui): link parent commits" : "fix(ui): parent commit"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(await screen.findByText("Commit details", { selector: "summary" }));
    const parentLink = await screen.findByRole("link", { name: parentHash.slice(0, 10) });

    expect(parentLink.getAttribute("data-slot")).toBe("tooltip-trigger");

    await user.click(parentLink);

    await waitFor(() => {
      expect(githead.getCommitDetails).toHaveBeenLastCalledWith({
        repoPath,
        hash: parentHash,
        requestId: expect.any(String)
      });
    });
    const parentDescription = await screen.findByText("parent commit");
    expect(parentDescription.closest(".commit-title")).toBeTruthy();
    expect(screen.getByText("Fix").closest(".commit-summary-meta")).toBeTruthy();
    expect(screen.getAllByText("ui:").some((scope) => scope.closest(".commit-title"))).toBe(true);
  });

  it("opens commit context menu on right click and copies the full SHA", async () => {
    const user = userEvent.setup();
    const firstCommit = createCommit({
      hash: "a".repeat(40),
      shortHash: "aaaaaaa",
      subject: "feat: first commit"
    });
    const secondCommit = createCommit({
      hash: "b".repeat(40),
      shortHash: "bbbbbbb",
      subject: "fix: second commit"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([
      firstCommit,
      secondCommit
    ]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const secondRow = await screen.findByRole("option", { name: /second commit/ });

    fireEvent.contextMenu(secondRow);
    await user.click(await screen.findByRole("menuitem", { name: /Copy SHA to clipboard/ }));

    expect(secondRow.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => {
      expect(githead.copyCommitShaToClipboard).toHaveBeenCalledWith({
        repoPath,
        hash: secondCommit.hash
      });
    });
  });

  it("does not lock repository actions while a clipboard request is pending", async () => {
    const user = userEvent.setup();
    const pendingCopy = defer<GitOperationResult>();
    const commit = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      subject: "docs: copy without blocking"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));
    vi.mocked(githead.copyCommitShaToClipboard).mockReturnValueOnce(pendingCopy.promise);

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const row = await screen.findByRole("option", { name: /copy without blocking/ });
    fireEvent.contextMenu(row);
    await user.click(await screen.findByRole("menuitem", { name: /Copy SHA to clipboard/ }));
    await waitFor(() => expect(githead.copyCommitShaToClipboard).toHaveBeenCalledOnce());

    expect((screen.getByRole("button", { name: "Fetch" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Copying commit SHA")).toBeNull();

    await act(async () => {
      pendingCopy.resolve(createOperationResult({ repoPath, stdout: "Commit SHA copied to clipboard." }));
      await pendingCopy.promise;
    });
  });

  it("resets the current branch to a commit with the selected mode", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "c".repeat(40),
      shortHash: "ccccccc",
      subject: "feat: reset target"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /reset target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Reset current branch to this commit/ }));
    await user.selectOptions(await screen.findByLabelText("Using mode"), "hard");
    await user.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(githead.resetBranchToCommit).toHaveBeenCalledWith({
        repoPath,
        hash: commit.hash,
        mode: "hard",
        operationId: expect.any(String)
      });
    });
  });

  it("reverses a commit only after confirmation", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "d".repeat(40),
      shortHash: "ddddddd",
      subject: "fix: reverse target"
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /reverse target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Reverse commit/ }));

    expect(githead.revertCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => {
      expect(githead.revertCommit).toHaveBeenCalledWith({
        repoPath,
        hash: commit.hash,
        operationId: expect.any(String)
      });
    });
  });

  it("enables commit file history and blame actions for Git repositories", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [
        {
          path: "src/App.test.tsx",
          status: "M",
          additions: 3,
          deletions: 1
        }
      ]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("src/App.test.tsx", "test"));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.test\.tsx/ });

    fireEvent.contextMenu(commitFile);

    const expectedActions = [
      "Log Selected",
      "Blame Selected",
      "Reset to Commit",
      "Open Current Version",
      "Open Selected Version",
      "Copy Path to Clipboard"
    ];
    for (const action of expectedActions) {
      expect(await screen.findByRole("menuitem", { name: action })).toBeTruthy();
    }
    expect(screen.getByRole("menuitem", { name: "Log Selected" }).getAttribute("data-disabled")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Blame Selected" }).getAttribute("data-disabled")).toBeNull();
  });

  it("opens bounded File History and restores Commit History without refetching", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 3, deletions: 1 };
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: true,
      gitBehaviors: { tagPushBehavior: "all" },
      privacy: { shareAnonymousDiagnostics: true }
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff(file.path, "history-diff"));
    vi.mocked(githead.getFileHistory).mockResolvedValue({
      repoPath,
      startHash: commit.hash,
      requestedPath: file.path,
      hasMore: true,
      entries: [{ ...commit, path: file.path, status: "M" }]
    });
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.tsx/ });
    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Log Selected" }));
    expect(await screen.findByRole("region", { name: `File History for ${file.path}` })).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Wrap diff lines" })).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".diff-output.text")?.classList.contains("is-wrapped")).toBe(true);
    expect(screen.getByText("Showing the newest 200 changes for this file.")).toBeTruthy();
    expect(githead.getFileHistory).toHaveBeenCalledWith({ repoPath, startHash: commit.hash, path: file.path, limit: 200, requestId: expect.any(String) });
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("listbox", { name: "Commit history" })).toBeTruthy();
    expect(githead.getCommitHistory).toHaveBeenCalledTimes(1);
  });

  it("previews and runs a typed cherry-pick from the history context menu", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ subject: "pick this change" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: { tagPushBehavior: "all", allowCherryPickingContainedCommits: true },
      privacy: { shareAnonymousDiagnostics: true }
    });
    vi.mocked(githead.getIntegrationPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review the preview.",
      preview: {
        kind: "cherry-pick",
        repoPath,
        snapshotId: "preview-1",
        currentBranch: "main",
        headOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        clean: true,
        blockingReasons: [],
        warnings: [],
        commitOids: [commit.hash],
        mergeCommitOids: [],
        alreadyContainedCommitOids: [],
        commits: [{
          oid: commit.hash,
          shortOid: commit.shortHash,
          parentOids: commit.parents,
          subject: commit.subject,
          authorName: commit.authorName,
          authorEmail: commit.authorEmail,
          authorDate: commit.authorDate,
          files: [{ path: "src/picked.ts", status: "M", additions: 2, deletions: 1 }]
        }],
        files: [{ path: "src/picked.ts", status: "M" }]
      }
    });
    vi.mocked(githead.runIntegration).mockResolvedValue({
      ...createOperationResult({ stdout: "picked" }),
      kind: "cherry-pick",
      outcome: "completed",
      message: "Cherry-picked 1 commit.",
      previousHeadOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      headOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      completedCommitOids: [commit.hash],
      stoppedCommitOid: null,
      operationState: null,
      forceWithLease: null
    });

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    expect(screen.queryByRole("button", { name: "Cherry-pick selected…" })).toBeNull();
    fireEvent.contextMenu(await screen.findByRole("option", { name: /pick this change/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Cherry-pick commit…" }));

    expect(await screen.findByRole("heading", { name: "Cherry-pick commit" })).toBeTruthy();
    expect(await screen.findByText("src/picked.ts", { exact: false })).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /Apply without committing/ }));
    await user.click(screen.getByRole("button", { name: "Apply changes" }));

    await waitFor(() => expect(githead.runIntegration).toHaveBeenCalledWith({
      kind: "cherry-pick",
      repoPath,
      commitOids: [commit.hash],
      noCommit: true,
      allowAlreadyContained: true,
      expectedSnapshotId: "preview-1",
      operationId: expect.any(String)
    }));
  });

  it("disables cherry-pick for commits in Current history by default", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ subject: "already on this branch" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /already on this branch/ }));

    const item = await screen.findByRole("menuitem", { name: "Cherry-pick commit…" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText("Already included")).toBeNull();
    fireEvent.pointerMove(item, { pointerType: "mouse" });
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("This commit is already included in the current branch."));
    expect(githead.getIntegrationPreview).not.toHaveBeenCalled();
  });

  it("opens a virtualized Blame view for the selected commit file", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 1, deletions: 0 };
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff(file.path, "diff"));
    vi.mocked(githead.getFileBlame).mockResolvedValue({
      kind: "text", repoPath, hash: commit.hash, path: file.path, byteLength: 13,
      commits: [{ hash: commit.hash, shortHash: commit.shortHash, authorName: "Taylor", authorEmail: "t@example.test", authorDate: commit.authorDate, summary: commit.subject }],
      lines: [{ finalLine: 1, originalLine: 1, commitHash: commit.hash, originalPath: file.path, text: "const a = 1;", boundary: false }]
    });
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.tsx/ });
    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Blame Selected" }));
    expect(await screen.findByRole("region", { name: `Blame for ${file.path}` })).toBeTruthy();
    expect(screen.getByText("const a = 1;")).toBeTruthy();
    expect(githead.getFileBlame).toHaveBeenCalledWith({ repoPath, hash: commit.hash, path: file.path, requestId: expect.any(String) });
  });

  it("cancels Blame and ignores its late result after switching Repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const commit = createCommit();
    const file = { path: "src/App.tsx", status: "M", additions: 1, deletions: 0 };
    const pendingBlame = defer<Awaited<ReturnType<GitheadApi["getFileBlame"]>>>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, { files: [file] }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff(file.path, "diff"));
    vi.mocked(githead.getFileBlame).mockReturnValue(pendingBlame.promise);
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Blame Selected" }));
    await screen.findByText("Loading blame");
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    pendingBlame.resolve({
      kind: "text", repoPath, hash: commit.hash, path: file.path, byteLength: 4,
      commits: [{ hash: commit.hash, shortHash: commit.shortHash, authorName: "Stale", authorEmail: "", authorDate: "", summary: "" }],
      lines: [{ finalLine: 1, originalLine: 1, commitHash: commit.hash, originalPath: file.path, text: "stale blame", boundary: false }]
    });
    await flushRendererAsync();
    expect(screen.queryByText("stale blame")).toBeNull();
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "file-blame:1" });
  });

  it("runs commit file context menu open and copy actions through preload APIs", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [
        {
          path: "src/App.test.tsx",
          status: "M",
          additions: 3,
          deletions: 1
        }
      ]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("src/App.test.tsx", "test"));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.test\.tsx/ });

    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Open Current Version" }));
    await waitFor(() => {
      expect(githead.openFile).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.test.tsx"
      });
    });

    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Open Selected Version" }));
    await waitFor(() => {
      expect(githead.openCommitFileVersion).toHaveBeenCalledWith({
        repoPath,
        hash: commit.hash,
        path: "src/App.test.tsx",
        operationId: expect.any(String)
      });
    });

    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Copy Path to Clipboard" }));
    await waitFor(() => {
      expect(githead.copyPathToClipboard).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.test.tsx"
      });
    });
  });

  it("confirms before resetting a commit file to the selected commit", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [
        {
          path: "src/App.test.tsx",
          status: "M",
          additions: 3,
          deletions: 1
        }
      ]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("src/App.test.tsx", "test"));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.test\.tsx/ });

    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Reset to Commit" }));

    expect(await screen.findByRole("dialog", { name: "Confirm reset file contents" })).toBeTruthy();
    expect(screen.getByDisplayValue("src/App.test.tsx")).toBeTruthy();
    expect(githead.resetFilesToCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy to Clipboard" }));
    await waitFor(() => {
      expect(githead.copyTextToClipboard).toHaveBeenCalledWith({
        text: "src/App.test.tsx"
      });
    });

    await user.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => {
      expect(githead.resetFilesToCommit).toHaveBeenCalledWith({
        repoPath,
        hash: commit.hash,
        paths: [
          "src/App.test.tsx"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("cancels commit file reset without calling the reset API", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [
        {
          path: "src/App.test.tsx",
          status: "M",
          additions: 3,
          deletions: 1
        }
      ]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("src/App.test.tsx", "test"));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    const commitFile = await screen.findByRole("option", { name: /src\/App\.test\.tsx/ });

    fireEvent.contextMenu(commitFile);
    await user.click(await screen.findByRole("menuitem", { name: "Reset to Commit" }));
    await screen.findByRole("dialog", { name: "Confirm reset file contents" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Confirm reset file contents" })).toBeNull();
    });
    expect(githead.resetFilesToCommit).not.toHaveBeenCalled();
  });

  it("creates a tag for the selected commit and validates required tag names", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "e".repeat(40),
      shortHash: "eeeeeee",
      subject: "feat: tag target"
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /tag target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.click(screen.getByRole("button", { name: "Create tag" }));

    expect(await screen.findByText("Enter a tag name.")).toBeTruthy();

    await user.type(screen.getByLabelText("Tag name"), "v1.2.3");
    await user.type(screen.getByLabelText(/Message/), "Release 1.2.3");
    await user.selectOptions(screen.getByLabelText("Push after creating"), "origin");
    await user.click(screen.getByRole("button", { name: "Create tag" }));

    await waitFor(() => {
      expect(githead.createTag).toHaveBeenCalledWith({
        repoPath,
        hash: commit.hash,
        tagName: "v1.2.3",
        message: "Release 1.2.3",
        lightweight: false,
        force: false,
        pushRemote: "origin",
        operationId: expect.any(String)
      });
    });
  });

  it("creates a lightweight tag and confirms moving an existing tag", async () => {
    const user = userEvent.setup();
    const commit = createCommit({ hash: "d".repeat(40), shortHash: "ddddddd", subject: "feat: lightweight tag target" });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /lightweight tag target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.type(screen.getByLabelText("Tag name"), "latest");
    await user.click(screen.getByLabelText(/Lightweight/));
    expect(screen.queryByLabelText(/Message/)).toBeNull();
    await user.click(screen.getByLabelText(/Move an existing tag/));
    expect(screen.getByText(/different commit/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create tag" }));

    await waitFor(() => expect(githead.createTag).toHaveBeenCalledWith({
      repoPath,
      hash: commit.hash,
      tagName: "latest",
      message: "",
      lightweight: true,
      force: true,
      pushRemote: null,
      operationId: expect.any(String)
    }));
  });

  it("renders a shared tree view and stages all eligible files in a folder", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10, colorTheme: "githead", appearanceMode: "system", uiFont: "inter", codeFont: "system-mono", zoomFactor: 1, statusFileViewMode: "tree", wrapDiffLines: false, gitBehaviors: { tagPushBehavior: "all" }, privacy: { shareAnonymousDiagnostics: true }
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [
      createStatusFile("src/App.tsx", { isUnstaged: true, worktreeStatus: "M" }),
      createStatusFile("src/lib/utils.ts", { isUnstaged: true, worktreeStatus: "M" }),
      createStatusFile("README.md", { isStaged: true, indexStatus: "M" })
    ] }));

    render(<App />);

    const unstagedTree = await screen.findByRole("tree", { name: "Unstaged files" });
    const srcFolder = within(unstagedTree).getByRole("treeitem", { name: /^src$/ });
    expect(srcFolder.getAttribute("aria-expanded")).toBe("true");
    expect(within(unstagedTree).queryByRole("button", { name: "Stage folder src" })).toBeNull();
    await user.pointer({ target: srcFolder, keys: "[MouseRight]" });
    await user.click(screen.getByRole("menuitem", { name: "Stage folder" }));
    await waitFor(() => expect(githead.stageFiles).toHaveBeenCalledWith({ repoPath, paths: ["src/App.tsx", "src/lib/utils.ts"], operationId: expect.any(String) }));
    await user.click(srcFolder);
    expect(srcFolder.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("tree", { name: "Staged files" })).toBeTruthy();
  });

  it("labels the staged and unstaged file regions", async () => {
    render(<App />);

    expect(await screen.findByRole("region", { name: "Staged files" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Unstaged files" })).toBeTruthy();
  });

  it("keeps repository-wide submodule actions out of the staged file header", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ submodules: [{
      path: "vendor/lib", url: "https://example.com/lib.git", recordedCommit: "abc", checkedOutCommit: "abc", initialized: true, status: "clean"
    }] }));

    render(<App />);

    const stagedSection = await screen.findByRole("region", { name: "Staged files" });
    expect(within(stagedSection).queryByRole("button", { name: "Submodules" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Submodules" }));
    await user.click(screen.getByRole("menuitem", { name: "Sync submodule URLs" }));
    await waitFor(() => expect(githead.syncSubmodules).toHaveBeenCalledWith({ repoPath, operationId: expect.any(String) }));
  });

  it("removes an existing tag from the selected commit", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "f".repeat(40),
      shortHash: "fffffff",
      subject: "feat: remove tag target",
      refs: [
        {
          name: "v1.2.3",
          kind: "tag"
        }
      ]
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /remove tag target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.click(screen.getByRole("tab", { name: /Remove/ }));
    await user.click(screen.getByLabelText("I understand this tag reference will be removed."));
    await user.click(screen.getByRole("button", { name: "Remove tag" }));

    await waitFor(() => {
      expect(githead.deleteTag).toHaveBeenCalledWith({
        repoPath,
        tagName: "v1.2.3",
        pushRemote: null,
        operationId: expect.any(String)
      });
    });
  });

  it("requires renewed removal confirmation after changing the remote", async () => {
    const user = userEvent.setup();
    const commit = createCommit({
      hash: "c".repeat(40), shortHash: "ccccccc", subject: "feat: protected tag removal",
      refs: [{ name: "v2.0.0", kind: "tag" }]
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remotes: [{ name: "origin", url: "https://example.test/repo.git", direction: "push" }]
    }));
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /protected tag removal/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.click(screen.getByRole("tab", { name: /Remove/ }));

    const acknowledgement = screen.getByLabelText("I understand this tag reference will be removed.");
    const removeButton = screen.getByRole("button", { name: "Remove tag" });
    expect(removeButton.hasAttribute("disabled")).toBe(true);
    await user.click(acknowledgement);
    expect(removeButton.hasAttribute("disabled")).toBe(false);
    await user.selectOptions(screen.getByLabelText("Also delete from remote"), "origin");
    expect((acknowledgement as HTMLInputElement).checked).toBe(false);
    expect(removeButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/deletes it from origin/)).toBeTruthy();
  });

  it("stages the selected unstaged file through the preload API", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        file
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(screen.getByRole("button", { name: /^Stage$/ }));

    await waitFor(() => {
      expect(githead.stageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/App.tsx"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("wraps text diffs with one saved app preference", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/long-line.ts", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "x".repeat(500)));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/long-line\.ts/ }));
    const wrapButton = await screen.findByRole("button", { name: "Wrap diff lines" });
    const output = document.querySelector<HTMLElement>(".diff-output.text");
    expect(output).toBeTruthy();
    expect(wrapButton.getAttribute("aria-pressed")).toBe("false");
    expect(output?.classList.contains("is-wrapped")).toBe(false);

    await user.click(wrapButton);
    expect(wrapButton.getAttribute("aria-pressed")).toBe("true");
    expect(output?.classList.contains("is-wrapped")).toBe(true);
    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenLastCalledWith({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: true,
      gitBehaviors: { tagPushBehavior: "all" },
      privacy: { shareAnonymousDiagnostics: true }
    }));

    await user.click(wrapButton);
    expect(wrapButton.getAttribute("aria-pressed")).toBe("false");
    expect(output?.classList.contains("is-wrapped")).toBe(false);
    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      wrapDiffLines: false
    })));
  });

  it("shows a persistent Diff header status when the loaded diff changes", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/live.ts", { isUnstaged: true, worktreeStatus: "M" });
    const loadedDiff = createTextDiff(file.path, "loaded-version");
    const latestDiff = createTextDiff(file.path, "latest-version");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(loadedDiff)
      .mockResolvedValue(latestDiff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/live\.ts/ }));
    expect(await screen.findByText("loaded-version")).toBeTruthy();
    const hunkAction = screen.getByRole("button", { name: "Stage Hunk" });
    expect(hunkAction.hasAttribute("disabled")).toBe(false);

    emitRepoChanged();

    const loadLatestButton = await screen.findByRole("button", { name: "New diff available" });
    expect(screen.getByText("Loaded diff is out of date")).toBeTruthy();
    expect(document.querySelector(".diff-output")?.classList.contains("is-changed")).toBe(true);
    expect(hunkAction.hasAttribute("disabled")).toBe(true);
    expect(vi.mocked(githead.getFileDiff).mock.calls.at(-1)?.[0].requestId).toMatch(/^diff-freshness:/);

    await user.click(loadLatestButton);

    expect(await screen.findByText("latest-version")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loaded diff is out of date")).toBeNull());
    expect(screen.getByRole("button", { name: "Refresh Diff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage Hunk" }).hasAttribute("disabled")).toBe(false);
  });

  it("does not show the Diff header status for an unrelated repository change", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/stable.ts", { isUnstaged: true, worktreeStatus: "M" });
    const diff = createTextDiff(file.path, "stable-version");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(diff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/stable\.ts/ }));
    expect(await screen.findByText("stable-version")).toBeTruthy();
    emitRepoChanged();
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledTimes(2));

    expect(screen.queryByText("Loaded diff is out of date")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh Diff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage Hunk" }).hasAttribute("disabled")).toBe(false);
  });

  it("restores diff line wrap when its preference save fails", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/failure.ts", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "long-value"));
    vi.mocked(githead.saveAppSettings).mockRejectedValue(new Error("Unable to write app settings."));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/failure\.ts/ }));
    const wrapButton = await screen.findByRole("button", { name: "Wrap diff lines" });
    await user.click(wrapButton);
    await waitFor(() => expect(wrapButton.getAttribute("aria-pressed")).toBe("false"));
    expect(document.querySelector(".diff-output.text")?.classList.contains("is-wrapped")).toBe(false);
  });

  it("does not show diff line wrap for non-text diffs", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("assets/archive.bin", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue({
      path: file.path,
      side: "unstaged",
      kind: "binary",
      text: "Binary files differ."
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /assets\/archive\.bin/ }));
    expect(await screen.findByText("Binary files differ.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wrap diff lines" })).toBeNull();
  });

  it("keeps an unstaged file selected and reloads its remaining diff after staging a hunk", async () => {
    const user = userEvent.setup();
    const initialFile = createStatusFile("src/App.tsx", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    const refreshedFile = createStatusFile("src/App.tsx", {
      isStaged: true,
      isUnstaged: true,
      indexStatus: "M",
      worktreeStatus: "M"
    });
    const initialDiff = createTextDiff(initialFile.path, "first-hunk");
    const remainingDiff = createTextDiff(initialFile.path, "remaining-hunk");
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ files: [initialFile] }))
      .mockResolvedValue(createSummary({ files: [refreshedFile] }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(initialDiff)
      .mockResolvedValue(remainingDiff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: /^Stage Hunk$/ }));

    await waitFor(() => {
      expect(githead.stageHunk).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.tsx",
        side: "unstaged",
        patch: `${initialDiff.text}\n`,
        operationId: expect.any(String)
      });
    });
    expect(await screen.findByText("remaining-hunk")).toBeTruthy();
    const unstagedList = screen.getByRole("listbox", { name: "Unstaged files" });
    expect(within(unstagedList).getByRole("option", { name: /src\/App\.tsx/ }).getAttribute("aria-selected")).toBe("true");
    expect(githead.getFileDiff).toHaveBeenLastCalledWith({
      repoPath,
      path: "src/App.tsx",
      side: "unstaged",
      requestId: expect.any(String)
    });
  });

  it("keeps a staged file selected and reloads its remaining diff after unstaging a hunk", async () => {
    const user = userEvent.setup();
    const initialFile = createStatusFile("src/App.tsx", {
      isStaged: true,
      indexStatus: "M"
    });
    const refreshedFile = createStatusFile("src/App.tsx", {
      isStaged: true,
      isUnstaged: true,
      indexStatus: "M",
      worktreeStatus: "M"
    });
    const initialDiff = createTextDiff(initialFile.path, "first-hunk", "staged");
    const remainingDiff = createTextDiff(initialFile.path, "remaining-hunk", "staged");
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ files: [initialFile] }))
      .mockResolvedValue(createSummary({ files: [refreshedFile] }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(initialDiff)
      .mockResolvedValue(remainingDiff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: /^Unstage Hunk$/ }));

    await waitFor(() => {
      expect(githead.unstageHunk).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.tsx",
        side: "staged",
        patch: `${initialDiff.text}\n`,
        operationId: expect.any(String)
      });
    });
    expect(await screen.findByText("remaining-hunk")).toBeTruthy();
    const stagedList = screen.getByRole("listbox", { name: "Staged files" });
    expect(within(stagedList).getByRole("option", { name: /src\/App\.tsx/ }).getAttribute("aria-selected")).toBe("true");
    expect(githead.getFileDiff).toHaveBeenLastCalledWith({
      repoPath,
      path: "src/App.tsx",
      side: "staged",
      requestId: expect.any(String)
    });
  });

  it("stages one added line with a partial hunk patch", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", { isUnstaged: true, worktreeStatus: "M" });
    const diff = createTextDiff(file.path, "unused");
    diff.text = [
      `diff --git a/${file.path} b/${file.path}`,
      `--- a/${file.path}`,
      `+++ b/${file.path}`,
      "@@ -1,2 +1,3 @@",
      " shared",
      "-old",
      "+new",
      "+extra"
    ].join("\n");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(diff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: "Stage added line 2" }));

    await waitFor(() => expect(githead.stageHunk).toHaveBeenCalledWith({
      repoPath,
      path: file.path,
      side: "unstaged",
      patch: [
        `diff --git a/${file.path} b/${file.path}`,
        `--- a/${file.path}`,
        `+++ b/${file.path}`,
        "@@ -1,2 +1,3 @@",
        " shared",
        " old",
        "+new",
        ""
      ].join("\n"),
      operationId: expect.any(String)
    }));
  });

  it("unstages one deleted line with a partial hunk patch", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", { isStaged: true, indexStatus: "M" });
    const diff = createTextDiff(file.path, "unused", "staged");
    diff.text = [
      `diff --git a/${file.path} b/${file.path}`,
      `--- a/${file.path}`,
      `+++ b/${file.path}`,
      "@@ -1,2 +1,2 @@",
      " shared",
      "-old",
      "+new"
    ].join("\n");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(diff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: "Unstage deleted line 2" }));

    await waitFor(() => expect(githead.unstageHunk).toHaveBeenCalledWith({
      repoPath,
      path: file.path,
      side: "staged",
      patch: [
        `diff --git a/${file.path} b/${file.path}`,
        `--- a/${file.path}`,
        `+++ b/${file.path}`,
        "@@ -1,2 +1 @@",
        " shared",
        "-old",
        ""
      ].join("\n"),
      operationId: expect.any(String)
    }));
  });

  it("moves selection to the destination side after staging the final hunk", async () => {
    const user = userEvent.setup();
    const unstagedFile = createStatusFile("src/App.tsx", { isUnstaged: true, worktreeStatus: "M" });
    const stagedFile = createStatusFile("src/App.tsx", { isStaged: true, indexStatus: "M" });
    const initialDiff = createTextDiff(unstagedFile.path, "only-hunk");
    const stagedDiff = createTextDiff(stagedFile.path, "staged-version", "staged");
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ files: [unstagedFile] }))
      .mockResolvedValue(createSummary({ files: [stagedFile] }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(initialDiff)
      .mockResolvedValue(stagedDiff);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: /^Stage Hunk$/ }));

    expect(await screen.findByText("staged-version")).toBeTruthy();
    const stagedList = screen.getByRole("listbox", { name: "Staged files" });
    expect(within(stagedList).getByRole("option", { name: /src\/App\.tsx/ }).getAttribute("aria-selected")).toBe("true");
    expect(githead.getFileDiff).toHaveBeenLastCalledWith({
      repoPath,
      path: "src/App.tsx",
      side: "staged",
      requestId: expect.any(String)
    });
  });

  it("keeps the current selection and diff when staging a hunk fails", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", { isUnstaged: true, worktreeStatus: "M" });
    const initialDiff = createTextDiff(file.path, "unchanged-hunk");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(initialDiff);
    vi.mocked(githead.stageHunk).mockResolvedValue({
      repoPath,
      exitCode: 1,
      stdout: "",
      stderr: "Unable to apply hunk."
    });

    render(<App />);

    const option = await screen.findByRole("option", { name: /src\/App\.tsx/ });
    await user.click(option);
    await user.click(await screen.findByRole("button", { name: /^Stage Hunk$/ }));

    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledTimes(2));
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("unchanged-hunk")).toBeTruthy();
    expect(githead.getFileDiff).toHaveBeenCalledTimes(1);
  });

  it("does not continue a completed hunk operation into a repository selected during refresh", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Hunk-B";
    const file = createStatusFile("src/shared.ts", { isUnstaged: true, worktreeStatus: "M" });
    const pendingRepositoryARefresh = defer<RepoSummary>();
    const pendingRepositoryChoice = defer<string | null>();
    let blockRepositoryARefresh = false;
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation((requestedRepoPath) => {
      if (requestedRepoPath === repoPath && blockRepositoryARefresh) {
        return pendingRepositoryARefresh.promise;
      }
      return Promise.resolve(createSummary({ repoPath: requestedRepoPath, files: [file] }));
    });
    vi.mocked(githead.getFileDiff).mockImplementation(async ({ repoPath: requestedRepoPath, path, side }) => (
      createTextDiff(path, requestedRepoPath === repoPath ? "repository-a" : "repository-b", side)
    ));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/shared\.ts/ }));
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    blockRepositoryARefresh = true;
    await user.click(await screen.findByRole("button", { name: /^Stage Hunk$/ }));
    await waitFor(() => expect(githead.stageHunk).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(vi.mocked(githead.getRepoSummary).mock.calls.length).toBeGreaterThan(1));

    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true"));

    pendingRepositoryARefresh.resolve(createSummary({ repoPath, files: [file] }));
    await flushRendererAsync();

    expect(vi.mocked(githead.getFileDiff).mock.calls.every(([request]) => request.repoPath === repoPath)).toBe(true);
    expect(screen.queryByText("repository-b")).toBeNull();
  });
});
