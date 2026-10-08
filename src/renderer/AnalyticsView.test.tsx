// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AnalyticsRange, GitHubWorkflowAnalytics, RepositoryAnalytics } from "../shared/types";
import { emitRepoChanged, githead, repoPath } from "./AppTestHarness";
import { AnalyticsView, daysInWindow, findDurationDrop, mailmapEntries, type AnalyticsViewProps } from "./AnalyticsView";

const NOW = Math.floor(new Date(2026, 9, 8, 12).getTime() / 1000);
const DAY = 86_400;

function range(overrides: Partial<AnalyticsRange> = {}): AnalyticsRange {
  const bins = Array.from({ length: 10 }, (_, index) => NOW - (9 - index) * DAY);
  return {
    unit: "day",
    from: bins[0]!,
    to: NOW,
    bins,
    commits: bins.map((_, index) => [index % 3, index === 9 ? 1 : 0, 0]),
    lines: bins.map((_, index) => [index * 10, index * 3]),
    punchCard: Array.from({ length: 168 }, (_, index) => (index === 50 ? 6 : index % 17 === 0 ? 1 : 0)),
    commitSizes: [2, 3, 1, 0, 1, 0],
    kpis: { commits: 10, previousCommits: 5, activeDays: 7, previousActiveDays: 7, linesAdded: 450, linesRemoved: 135, assetRevisions: 4, contributors: 2 },
    contributors: [
      { person: 0, commits: 9, activeDays: 6, linesAdded: 400, linesRemoved: 100, assetRevisions: 1, firstCommitAt: NOW - 9 * DAY, lastCommitAt: NOW },
      { person: 1, commits: 1, activeDays: 1, linesAdded: 50, linesRemoved: 35, assetRevisions: 3, firstCommitAt: NOW, lastCommitAt: NOW }
    ],
    hotspots: [
      { path: "Source/Game/Player.cpp", commits: 6, linesAdded: 120, linesRemoved: 40, authors: 2 },
      { path: "Config/DefaultGame.ini", commits: 3, linesAdded: 10, linesRemoved: 2, authors: 1 }
    ],
    ownership: [
      { folder: "Source/Game", revisions: [20, 0, 0] },
      { folder: "Content/Characters", revisions: [1, 19, 0] }
    ],
    coupling: [{ pathA: "Source/Game/Player.cpp", pathB: "Source/Game/Camera.cpp", together: 4, commitsA: 6, commitsB: 5 }],
    ...overrides
  };
}

function analytics(overrides: Partial<RepositoryAnalytics> = {}): RepositoryAnalytics {
  return {
    repoPath,
    headHash: "a".repeat(40),
    branch: "main",
    generatedAt: NOW,
    excludePaths: true,
    excludedPathPatterns: ["Plugins/"],
    history: { commits: 120, firstCommitAt: NOW - 400 * DAY, lastCommitAt: NOW, truncated: false },
    people: [
      { name: "Taylor", commits: 110, identities: [{ name: "Taylor", email: "taylor@example.test", commits: 110 }] },
      { name: "aida", commits: 10, identities: [{ name: "aida", email: "aiquiti@example.test", commits: 7 }, { name: "aidan", email: "aidan@example.test", commits: 3 }] }
    ],
    personSlots: 2,
    ranges: { d90: range(), y1: range(), all: range({ unit: "month" }) },
    tags: [{ name: "v1.0", time: NOW - 2 * DAY }],
    assets: {
      treeFiles: 100,
      lfsFiles: 40,
      lfsBytes: 2_000_000_000,
      gitBytes: 50_000_000,
      packedBytes: 400_000_000,
      types: [{ extension: ".uasset", files: 40, lfsFiles: 40, lfsBytes: 2_000_000_000, gitBytes: 0 }, { extension: ".cpp", files: 50, lfsFiles: 0, lfsBytes: 0, gitBytes: 40_000_000 }],
      otherTypes: null,
      lfsGrowth: [{ month: NOW - 60 * DAY, bytes: 1_000_000_000 }, { month: NOW - 30 * DAY, bytes: 0 }, { month: NOW, bytes: 2_000_000_000 }],
      lfsHistoryBytes: 3_000_000_000,
      binaryHotspots: [{ path: "Content/Hero.uasset", revisions: 12, lfsBytes: 600_000_000 }],
      binaryTypesOutsideLfs: [{ extension: ".webp", files: 45, lfsFiles: 0, lfsBytes: 0, gitBytes: 8_000_000, example: "Docs/shot.webp" }],
      largeFilesOutsideLfs: [{ path: "Docs/archive.rar", bytes: 4_000_000 }],
      largeFilesOutsideLfsCount: 1
    },
    branches: {
      base: "origin/main",
      truncated: false,
      branches: [
        { name: "main", remote: false, current: true, lastCommitAt: NOW, ahead: 0, behind: 3 },
        { name: "origin/feature/combat", remote: true, current: false, lastCommitAt: NOW - DAY, ahead: 7, behind: 20 },
        { name: "origin/old-work", remote: true, current: false, lastCommitAt: NOW - 200 * DAY, ahead: 0, behind: 300 }
      ]
    },
    ...overrides
  };
}

function workflowAnalytics(): GitHubWorkflowAnalytics {
  const bins = Array.from({ length: 6 }, (_, index) => NOW - (5 - index) * 7 * DAY);
  return {
    unit: "week",
    from: bins[0]!,
    to: NOW,
    bins,
    outcomes: bins.map(() => [5, 2, 1]),
    workflows: [
      { name: "Build", runs: 30, failures: 6, medianDurationSeconds: 300, medianDurations: [300, 310, 290, 305, 300, 320] },
      { name: "Tests", runs: 18, failures: 6, medianDurationSeconds: 280, medianDurations: [300, 290, 310, 300, 10, 9] }
    ],
    passed: 30,
    failed: 12,
    cancelled: 6,
    successRate: 30 / 42,
    previousSuccessRate: 0.6,
    reruns: 2,
    failingBranches: [{ branch: "refactor/combat", failed: 9, passed: 0, runs: 12 }],
    sampled: false
  };
}

function renderView(props: Partial<AnalyticsViewProps> = {}) {
  const handlers = {
    onOpenFileHistory: vi.fn(),
    onOpenBranchManager: vi.fn(),
    onOpenWorkflowRuns: vi.fn(),
    renderGitHubFailure: vi.fn((failure: { message: string }) => <div role="alert">{failure.message}</div>)
  };
  const view = render(
    <AnalyticsView active repoPath={repoPath} enabled githubAvailable={false} canOpenFileHistory {...handlers} {...props} />,
    { wrapper: TooltipProvider }
  );
  return { ...view, ...handlers };
}

describe("AnalyticsView", () => {
  it("loads activity analytics with progress and shows the key figures", async () => {
    let resolve: (value: RepositoryAnalytics) => void = () => undefined;
    let progress: Parameters<typeof githead.onRepositoryAnalyticsProgress>[0] = () => undefined;
    vi.mocked(githead.onRepositoryAnalyticsProgress).mockImplementation((callback) => {
      progress = callback;
      return () => undefined;
    });
    vi.mocked(githead.getRepositoryAnalytics).mockImplementation(() => new Promise((next) => { resolve = next; }));
    renderView();

    expect(await screen.findByText("Analyzing repository history")).not.toBeNull();
    const request = vi.mocked(githead.getRepositoryAnalytics).mock.calls[0]![0];
    expect(request).toMatchObject({ repoPath, excludePaths: true });
    act(() => progress({ requestId: request.requestId!, phase: "history", processedCommits: 40, totalCommits: 120 }));
    expect(screen.getByText("Read 40 of 120 commits.")).not.toBeNull();

    await act(async () => resolve(analytics()));
    const commits = screen.getByRole("region", { name: "Commits" });
    expect(within(commits).getByText("10")).not.toBeNull();
    expect(within(commits).getByText(/\+100% vs previous 12 months/)).not.toBeNull();
    expect(screen.getByRole("img", { name: "Commits per day" })).not.toBeNull();
    expect(screen.getByText(/commits under 2 identities across 2 emails/)).not.toBeNull();
  });

  it("shows chart data as a table and copies .mailmap entries", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    renderView();
    const card = (await screen.findByRole("heading", { name: "Commit activity" })).closest("section")!;
    await user.click(within(card).getByRole("button", { name: "Table" }));
    expect(within(card).getAllByRole("row").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Copy .mailmap entries" }));
    expect(githead.copyTextToClipboard).toHaveBeenCalledWith({ text: "aida <aiquiti@example.test> aidan <aidan@example.test>" });
  });

  it("opens file history from hotspots and reloads when vendored paths are included", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockImplementation(async (request) => analytics({ excludePaths: request.excludePaths }));
    const { onOpenFileHistory } = renderView();
    await screen.findByRole("heading", { name: "Commit activity" });
    await user.click(screen.getByRole("tab", { name: "Code" }));
    await user.click(screen.getByRole("button", { name: "Open file history for Source/Game/Player.cpp" }));
    expect(onOpenFileHistory).toHaveBeenCalledWith("Source/Game/Player.cpp", "a".repeat(40));
    expect(screen.getByText(/mostly someone else's work/)).not.toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Exclude vendored paths" }));
    await waitFor(() => expect(githead.getRepositoryAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ excludePaths: false })));
  });

  it("refreshes after ref changes but not after working tree edits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
      renderView();
      await screen.findByRole("heading", { name: "Commit activity" });
      act(() => emitRepoChanged({ reason: "filesystem" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(githead.getRepositoryAnalytics).toHaveBeenCalledTimes(1);
      act(() => emitRepoChanged({ reason: "filesystem-metadata" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(githead.getRepositoryAnalytics).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not load while inactive", async () => {
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    renderView({ active: false });
    await act(async () => { await Promise.resolve(); });
    expect(githead.getRepositoryAnalytics).not.toHaveBeenCalled();
  });

  it("summarizes assets with LFS rules to copy", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    const { onOpenFileHistory } = renderView();
    await screen.findByRole("heading", { name: "Commit activity" });
    await user.click(screen.getByRole("tab", { name: "Assets" }));
    expect(within(screen.getByRole("region", { name: "LFS across history" })).getByText("33% is older versions")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Copy LFS rules" }));
    expect(githead.copyTextToClipboard).toHaveBeenCalledWith({ text: "*.webp filter=lfs diff=lfs merge=lfs -text" });
    await user.click(screen.getByRole("button", { name: "Open file history for Content/Hero.uasset" }));
    expect(onOpenFileHistory).toHaveBeenCalledWith("Content/Hero.uasset", "a".repeat(40));
  });

  it("lists branch drift and opens branch management", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    const { onOpenBranchManager } = renderView();
    await screen.findByRole("heading", { name: "Commit activity" });
    await user.click(screen.getByRole("tab", { name: "Branches" }));
    const rows = within(screen.getByRole("table", { name: "Branch drift" })).getAllByRole("row");
    expect(rows[1]!.textContent).toContain("origin/feature/combat");
    expect(screen.getByText(/2 branches are fully merged/)).not.toBeNull();
    expect(screen.getByText(/main is 3 commits behind/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage branches" }));
    expect(onOpenBranchManager).toHaveBeenCalled();
  });

  it("shows CI health only for GitHub repositories and links failing branches", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    vi.mocked(githead.getGitHubWorkflowAnalytics).mockResolvedValue({ ok: true, data: workflowAnalytics(), rateLimit: null });
    const { rerender, onOpenWorkflowRuns, renderGitHubFailure, onOpenFileHistory, onOpenBranchManager } = renderView();
    await screen.findByRole("heading", { name: "Commit activity" });
    expect(screen.queryByRole("tab", { name: "CI" })).toBeNull();

    rerender(<AnalyticsView active repoPath={repoPath} enabled githubAvailable canOpenFileHistory onOpenFileHistory={onOpenFileHistory} onOpenBranchManager={onOpenBranchManager} onOpenWorkflowRuns={onOpenWorkflowRuns} renderGitHubFailure={renderGitHubFailure} />);
    await user.click(screen.getByRole("tab", { name: "CI" }));
    expect(await screen.findByText("71.4%")).not.toBeNull();
    expect(githead.getGitHubWorkflowAnalytics).toHaveBeenCalledWith(expect.objectContaining({ repoPath, range: "d30" }));
    expect(screen.getByText(/Tests dropped from 5m 00s to 10s/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Show workflow runs for refactor/combat" }));
    expect(onOpenWorkflowRuns).toHaveBeenCalledWith("refactor/combat");
  });

  it("renders GitHub failures through the shared failure state", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    vi.mocked(githead.getGitHubWorkflowAnalytics).mockResolvedValue({ ok: false, error: { kind: "authentication", message: "Sign in to GitHub", retryable: false, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null } });
    renderView({ githubAvailable: true });
    await screen.findByRole("heading", { name: "Commit activity" });
    await user.click(screen.getByRole("tab", { name: "CI" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Sign in to GitHub");
  });

  it("edits excluded path patterns and reanalyzes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    vi.mocked(githead.getRepositoryAnalyticsSettings).mockResolvedValue({ repoPath, excludedPaths: ["vendor/"] });
    renderView();
    await screen.findByRole("heading", { name: "Commit activity" });
    await user.click(screen.getByRole("button", { name: "Edit excluded paths" }));
    const field = await screen.findByLabelText("Patterns, one per line");
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe("vendor/"));
    await user.clear(field);
    await user.type(field, "Plugins/{enter}!Plugins/Game/");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(githead.saveRepositoryAnalyticsSettings).toHaveBeenCalledWith({ repoPath, excludedPaths: ["Plugins/", "!Plugins/Game/"] });
    await waitFor(() => expect(githead.getRepositoryAnalytics).toHaveBeenCalledTimes(2));
  });

  it("offers a retry when analysis fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockRejectedValueOnce(new Error("Repository is busy")).mockResolvedValue(analytics());
    renderView();
    expect(await screen.findByText("Repository is busy")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Commit activity" })).not.toBeNull();
  });
});

describe("analytics helpers", () => {
  it("finds a sustained collapse in median duration", () => {
    expect(findDurationDrop([300, 310, 290, 305, 10, 9])).toEqual({ index: 4, baseline: 300, value: 10 });
    expect(findDurationDrop([300, 310, 10, 305, 300, 320])).toBeNull();
    expect(findDurationDrop([20, 25, 3, 2])).toBeNull();
  });

  it("counts calendar days in a window including today", () => {
    const today = new Date(2026, 9, 8, 15).getTime() / 1000;
    const start = new Date(2026, 6, 11).getTime() / 1000;
    expect(daysInWindow(start, today)).toBe(90);
  });

  it("maps secondary identities to the primary one", () => {
    expect(mailmapEntries({ name: "Ada", commits: 3, identities: [{ name: "Ada", email: "ada@x.test", commits: 2 }, { name: "ada", email: "old@x.test", commits: 1 }] }))
      .toBe("Ada <ada@x.test> ada <old@x.test>");
  });
});
