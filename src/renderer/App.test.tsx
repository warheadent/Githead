// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className, orientation }: { children: ReactNode; className?: string; orientation?: string }) => (
    <div className={className} data-resizable-panel-group data-orientation={orientation}>{children}</div>
  ),
  ResizablePanel: ({ children, className, defaultSize, minSize }: { children: ReactNode; className?: string; defaultSize?: string; minSize?: string }) => (
    <div className={className} data-resizable-panel data-default-size={defaultSize} data-min-size={minSize}>{children}</div>
  ),
  ResizableHandle: ({ "aria-label": ariaLabel, withHandle }: { "aria-label"?: string; withHandle?: boolean }) => (
    <div role="separator" aria-label={ariaLabel} data-testid="resizable-handle" data-with-handle={withHandle || undefined} />
  )
}));

import { App } from "./App";
import { gitHubQueryStore } from "./useGitHubQueries";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import type {
  AiReasoningCapabilities,
  AiSettings,
  AppSettings,
  AppUpdateState,
  AppWindowState,
  GitCommitDetails,
  GitCommitGraphRow,
  GitFileDiff,
  GitHubIssue,
  GitHubOpenCounts,
  GitHubPullRequest,
  GitHubWorkflowRun,
  GitIdentitySettings,
  GitRunResult,
  GitheadApi,
  GitOperationResult,
  RepoChangedEvent,
  RepoSyncStatus,
  RepoSummary
} from "../shared/types";
import { gitCapabilities, type AiCommitMessageProvider, type RepositoryRecent } from "../shared/types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

const repoPath = "D:\\Githead";

function repositoryRecents(...repoPaths: string[]): RepositoryRecent[] {
  return repoPaths.map((recentPath) => ({ anchorPath: recentPath, lastUsedPath: recentPath }));
}

let githead: GitheadApi;
let cleanupGitOutput: Mock<() => void>;
let cleanupUpdateState: Mock<() => void>;
let cleanupRepoChanged: Mock<() => void>;
let cleanupWindowState: Mock<() => void>;
let gitOutputCallback: Parameters<GitheadApi["onGitOutput"]>[0] | null;
let updateStateCallback: Parameters<GitheadApi["onUpdateState"]>[0] | null;
let repoChangedCallback: Parameters<GitheadApi["onRepoChanged"]>[0] | null;
let windowStateCallback: Parameters<GitheadApi["onWindowState"]>[0] | null;
let scrollIntoView: Mock<(options?: ScrollIntoViewOptions) => void>;
const nativeScrollIntoView = HTMLElement.prototype.scrollIntoView;

const defaultProviderModels: Record<AiCommitMessageProvider, string> = {
  openrouter: "openai/gpt-5.6-luna",
  openai: "gpt-5.4-nano",
  "codex-cli": "gpt-5.4-mini",
  anthropic: "claude-haiku-4-5-20251001",
  "claude-code": "haiku"
};

function createAiSettings(
  selectedProvider: AiCommitMessageProvider = "openrouter",
  patch: Partial<AiSettings> = {}
): AiSettings {
  return {
    selectedProvider,
    providers: {
      openrouter: {
        model: defaultProviderModels.openrouter,
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      openai: {
        model: defaultProviderModels.openai,
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      "codex-cli": {
        model: defaultProviderModels["codex-cli"],
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: false
      },
      anthropic: {
        model: defaultProviderModels.anthropic,
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      "claude-code": {
        model: defaultProviderModels["claude-code"],
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: false
      }
    },
    cliStatus: {
      "codex-cli": {
        detected: true,
        authenticated: true,
        message: "Codex CLI is authenticated."
      },
      "claude-code": {
        detected: false,
        authenticated: false,
        message: "Claude Code was not detected."
      }
    },
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
    prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT,
    ...patch
  };
}

beforeEach(() => {
  gitHubQueryStore.clear();
  cleanupGitOutput = vi.fn<() => void>();
  cleanupUpdateState = vi.fn<() => void>();
  cleanupRepoChanged = vi.fn<() => void>();
  cleanupWindowState = vi.fn<() => void>();
  gitOutputCallback = null;
  updateStateCallback = null;
  repoChangedCallback = null;
  windowStateCallback = null;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  githead = createGitheadMock();
  window.githead = githead;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (nativeScrollIntoView) {
    HTMLElement.prototype.scrollIntoView = nativeScrollIntoView;
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});

describe("App", () => {
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

    expect(getStatusTone(within(stagedFiles).getByRole("option", { name: /src\/added\.ts/ }))).toBe("added");
    expect(getStatusTone(within(unstagedFiles).getByRole("option", { name: /src\/modified\.ts/ }))).toBe("modified");
    expect(getStatusTone(within(unstagedFiles).getByRole("option", { name: /src\/deleted\.ts/ }))).toBe("deleted");
    expect(getStatusTone(within(unstagedFiles).getByRole("option", { name: /src\/untracked\.ts/ }))).toBe("untracked");
    expect(getStatusTone(within(stagedFiles).getByRole("option", { name: /src\/conflicted\.ts/ }))).toBe("conflict");
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
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(conventionalCommit.hash));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    await waitFor(() => expect(screen.getAllByText("Feature")).toHaveLength(2));
    const historyBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".history-row"));
    const detailBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".commit-title"));
    expect(historyBadge?.className).toContain("commit-type-badge");
    expect(historyBadge?.className).toContain("type-feat");
    expect(detailBadge?.className).toContain("commit-type-badge");
    expect(detailBadge?.className).toContain("type-feat");
    const tagRefBadge = screen.getByText("v1.2.3").closest(".ref-badge");
    const branchRefBadge = screen.getAllByText("main").find((element) => element.closest(".ref-badge"))?.closest(".ref-badge");
    expect(tagRefBadge?.className).toContain("tag");
    expect(tagRefBadge?.querySelector("svg")).toBeTruthy();
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
    expect(historyDescription?.closest(".history-description")?.getAttribute("data-slot")).toBe("tooltip-trigger");
    expect(screen.getByText("Add MeshBites Shader")).toBeTruthy();
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
    const currentButton = within(scopeControl).getByRole("button", { name: "Current" });
    const allButton = within(scopeControl).getByRole("button", { name: "All" });
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

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Loading commit history...")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Current" }));
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
    await user.click(screen.getByRole("button", { name: "All" }));
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
    await user.click(screen.getByRole("button", { name: "All" }));

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
    expect(screen.queryByText("Loading commit history...")).toBeNull();
    expect(screen.getByText("Refreshing commit history")).toBeTruthy();

    pendingHistory.resolve([newHead, firstCommit, secondCommit]);
    await screen.findByRole("option", { name: /refreshed head/ });
    await waitFor(() => expect(screen.queryByText("Refreshing commit history")).toBeNull());

    expect(screen.getByRole("option", { name: /selected commit/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /b\.ts/ })).toBeTruthy();
    expect(githead.getCommitDetails).toHaveBeenCalledTimes(detailsCallsBeforeRefreshCompletes);
    expect(githead.getCommitFileDiff).toHaveBeenCalledTimes(diffCallsBeforeRefreshCompletes);
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
    expect(screen.queryByText("Loading commit history...")).toBeNull();
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
    expect(fileHeader?.closest(".commit-meta-scroll")).toBeNull();
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
    expect(screen.getByText("Fix").closest(".commit-title")).toBeTruthy();
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
      wrapDiffLines: true
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
    await screen.findByText("Loading blame...");
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
      autoFetchIntervalMinutes: 10, colorTheme: "githead", appearanceMode: "system", uiFont: "inter", codeFont: "system-mono", zoomFactor: 1, statusFileViewMode: "tree", wrapDiffLines: false
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

  it("renders resizable staged and unstaged file groups", async () => {
    render(<App />);

    const separator = await screen.findByRole("separator", {
      name: "Resize staged and unstaged file lists"
    });
    const group = separator.parentElement;
    expect(group?.getAttribute("data-orientation")).toBe("vertical");
    expect(separator.getAttribute("data-with-handle")).toBe("true");

    const panels = group?.querySelectorAll("[data-resizable-panel]");
    expect(panels?.length).toBe(2);
    expect(panels?.[0]?.getAttribute("data-default-size")).toBe("50%");
    expect(panels?.[0]?.getAttribute("data-min-size")).toBe("96px");
    expect(panels?.[1]?.getAttribute("data-default-size")).toBe("50%");
    expect(panels?.[1]?.getAttribute("data-min-size")).toBe("96px");

    const regions = within(group!).getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "Staged files",
      "Unstaged files"
    ]);
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
      wrapDiffLines: true
    }));

    await user.click(wrapButton);
    expect(wrapButton.getAttribute("aria-pressed")).toBe("false");
    expect(output?.classList.contains("is-wrapped")).toBe(false);
    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      wrapDiffLines: false
    })));
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

  it("stages multiple ctrl-selected unstaged files through the preload API", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(secondFile.getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("button", { name: /^Stage$/ }));

    await waitFor(() => {
      expect(githead.stageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("unstages multiple ctrl-selected staged files through the preload API", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          indexStatus: "M",
          isStaged: true
        }),
        createStatusFile("src/second.ts", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(secondFile.getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("button", { name: /^Unstage$/ }));

    await waitFor(() => {
      expect(githead.unstageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("selects every unstaged file with Ctrl+A while keeping the focused file primary", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/staged.ts", {
          indexStatus: "M",
          isStaged: true
        }),
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const stagedFile = await screen.findByRole("option", { name: /src\/staged\.ts/ });
    const firstFile = screen.getByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(secondFile);
    fireEvent.keyDown(secondFile, { key: "a", ctrlKey: true });

    expect(stagedFile.getAttribute("aria-selected")).toBe("false");
    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(secondFile.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Unstaged files" }).getAttribute("aria-multiselectable")).toBe("true");

    await waitFor(() => {
      expect(githead.getFileDiff).toHaveBeenLastCalledWith({
        repoPath,
        path: "src/second.ts",
        side: "unstaged",
        requestId: expect.any(String)
      });
    });
  });

  it("selects every staged file with Cmd+A without selecting unstaged files", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          indexStatus: "M",
          isStaged: true
        }),
        createStatusFile("src/second.ts", {
          indexStatus: "M",
          isStaged: true
        }),
        createStatusFile("src/unstaged.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    const unstagedFile = screen.getByRole("option", { name: /src\/unstaged\.ts/ });
    await user.click(firstFile);
    fireEvent.keyDown(firstFile, { key: "a" });

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(secondFile.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(firstFile, { key: "A", metaKey: true });

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(secondFile.getAttribute("aria-selected")).toBe("true");
    expect(unstagedFile.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("listbox", { name: "Staged files" }).getAttribute("aria-multiselectable")).toBe("true");
  });

  it("stages a shift-selected unstaged file range through the preload API", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/a.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/b.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/c.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/a\.ts/ });
    const middleFile = screen.getByRole("option", { name: /src\/b\.ts/ });
    const lastFile = screen.getByRole("option", { name: /src\/c\.ts/ });
    await user.click(firstFile);
    fireEvent.click(lastFile, { shiftKey: true });

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(middleFile.getAttribute("aria-selected")).toBe("true");
    expect(lastFile.getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("button", { name: /^Stage$/ }));

    await waitFor(() => {
      expect(githead.stageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/a.ts",
          "src/b.ts",
          "src/c.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("keeps a 10,000-file status list viewport-proportional and selects across unmounted rows", async () => {
    const files = Array.from({ length: 10_000 }, (_, index) => createStatusFile(
      `generated/file-${index.toString().padStart(5, "0")}.ts`,
      { isUnstaged: true, worktreeStatus: "M" }
    ));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files }));

    render(<App />);

    const list = await screen.findByRole("listbox", { name: "Unstaged files" });
    const initiallyMounted = within(list).getAllByRole("option");
    expect(initiallyMounted.length).toBeLessThan(100);
    expect(initiallyMounted[0]?.getAttribute("aria-setsize")).toBe("10000");
    expect(initiallyMounted[0]?.getAttribute("aria-posinset")).toBe("1");

    fireEvent.click(initiallyMounted[0]!);
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 340 });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 500 * 34 });
    fireEvent.scroll(list);

    expect(within(list).queryByText("generated/file-00000.ts")).toBeNull();
    const target = within(list).getByRole("option", { name: /generated\/file-00500\.ts/ });
    fireEvent.click(target, { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));

    await waitFor(() => {
      const request = vi.mocked(githead.stageFiles).mock.calls.at(-1)?.[0];
      expect(request?.paths).toHaveLength(501);
      expect(request?.paths[0]).toBe("generated/file-00000.ts");
      expect(request?.paths.at(-1)).toBe("generated/file-00500.ts");
    });
  });

  it("reconciles a windowed multi-selection when a watcher refresh removes selected paths", async () => {
    const first = createStatusFile("src/first.ts", { isUnstaged: true, worktreeStatus: "M" });
    const second = createStatusFile("src/second.ts", { isUnstaged: true, worktreeStatus: "M" });
    const third = createStatusFile("src/third.ts", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({ files: [first, second, third] }))
      .mockResolvedValue(createSummary({ files: [second, third] }));

    render(<App />);

    const firstRow = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondRow = screen.getByRole("option", { name: /src\/second\.ts/ });
    fireEvent.click(firstRow);
    fireEvent.click(secondRow, { ctrlKey: true });
    emitRepoChanged();

    await waitFor(() => expect(screen.queryByRole("option", { name: /src\/first\.ts/ })).toBeNull());
    expect(screen.getByRole("option", { name: /src\/second\.ts/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await waitFor(() => expect(githead.stageFiles).toHaveBeenCalledWith({ repoPath, paths: ["src/second.ts"], operationId: expect.any(String) }));
  });

  it("stages multiple selected unstaged files from a selected row context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    fireEvent.contextMenu(secondFile);
    await user.click(await screen.findByRole("menuitem", { name: /^Stage$/ }));

    await waitFor(() => {
      expect(githead.stageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("unstages multiple selected staged files from a selected row context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          indexStatus: "M",
          isStaged: true
        }),
        createStatusFile("src/second.ts", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    fireEvent.contextMenu(firstFile);
    await user.click(await screen.findByRole("menuitem", { name: /^Unstage$/ }));

    await waitFor(() => {
      expect(githead.unstageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("deletes multiple selected files from a selected row context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    fireEvent.contextMenu(firstFile);
    await user.click(await screen.findByRole("menuitem", { name: /^Delete$/ }));

    await waitFor(() => {
      expect(githead.deleteFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("reverts multiple selected files from a selected row context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    fireEvent.contextMenu(secondFile);
    await user.click(await screen.findByRole("menuitem", { name: /^Revert changes$/ }));

    await waitFor(() => {
      expect(githead.revertFileChanges).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ],
        side: "unstaged",
        operationId: expect.any(String)
      });
    });
  });

  it("uses only an unselected context-menu row instead of the previous multi-selection", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/third.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    const thirdFile = screen.getByRole("option", { name: /src\/third\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });

    fireEvent.contextMenu(thirdFile);
    await user.click(await screen.findByRole("menuitem", { name: /^Stage$/ }));

    await waitFor(() => {
      expect(githead.stageFiles).toHaveBeenCalledWith({
        repoPath,
        paths: [
          "src/third.ts"
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("ignores stale file diff responses when selection changes quickly", async () => {
    const user = userEvent.setup();
    const firstDiff = defer<GitFileDiff>();
    const secondDiff = defer<GitFileDiff>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/first.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        }),
        createStatusFile("src/second.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.getFileDiff)
      .mockReturnValueOnce(firstDiff.promise)
      .mockReturnValueOnce(secondDiff.promise);

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/first\.ts/ }));
    await user.click(screen.getByRole("option", { name: /src\/second\.ts/ }));

    secondDiff.resolve(createTextDiff("src/second.ts", "second-value"));
    expect(await screen.findByText("second-value")).toBeTruthy();

    firstDiff.resolve(createTextDiff("src/first.ts", "first-value"));
    await waitFor(() => {
      expect(screen.queryByText("first-value")).toBeNull();
    });
  });

  it("does not refresh the selected diff when a watcher refresh finds unchanged status", async () => {
    const user = userEvent.setup();
    const summary = createSummary({
      files: [
        createStatusFile("src/app.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(summary);
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff("src/app.ts", "initial-value"));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/app\.ts/ }));
    expect(await screen.findByText("initial-value")).toBeTruthy();

    const summaryCallsBeforeWatchEvent = vi.mocked(githead.getRepoSummary).mock.calls.length;
    vi.mocked(githead.getFileDiff).mockClear();
    await act(async () => {
      emitRepoChanged();
      await flushRendererAsync();
    });

    await waitFor(() => {
      expect(githead.getRepoSummary).toHaveBeenCalledTimes(summaryCallsBeforeWatchEvent + 1);
    });
    expect(githead.getFileDiff).not.toHaveBeenCalled();
  });

  it("does not refresh the selected diff when a watcher refresh finds selected file status changed", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }))
      .mockResolvedValue(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "D"
          })
        ]
      }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(createTextDiff("src/app.ts", "initial-value"))
      .mockResolvedValue(createTextDiff("src/app.ts", "changed-value"));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/app\.ts/ }));
    expect(await screen.findByText("initial-value")).toBeTruthy();

    const summaryCallsBeforeWatchEvent = vi.mocked(githead.getRepoSummary).mock.calls.length;
    vi.mocked(githead.getFileDiff).mockClear();
    await act(async () => {
      emitRepoChanged();
      await flushRendererAsync();
    });

    await waitFor(() => {
      expect(githead.getRepoSummary).toHaveBeenCalledTimes(summaryCallsBeforeWatchEvent + 1);
    });
    expect(screen.getByText("initial-value")).toBeTruthy();
    expect(screen.queryByText("changed-value")).toBeNull();
    expect(githead.getFileDiff).not.toHaveBeenCalled();
  });

  it("refreshes the selected diff when Refresh Diff is clicked after file status changes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }))
      .mockResolvedValue(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "D"
          })
        ]
      }));
    vi.mocked(githead.getFileDiff)
      .mockResolvedValueOnce(createTextDiff("src/app.ts", "initial-value"))
      .mockResolvedValue(createTextDiff("src/app.ts", "changed-value"));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/app\.ts/ }));
    expect(await screen.findByText("initial-value")).toBeTruthy();

    await act(async () => {
      emitRepoChanged();
      await flushRendererAsync();
    });

    await user.click(screen.getByRole("button", { name: "Refresh Diff" }));

    expect(await screen.findByText("changed-value")).toBeTruthy();
    expect(githead.getFileDiff).toHaveBeenCalledTimes(2);
  });

  it("does not refresh the selected diff when a watcher refresh only changes another file", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          }),
          createStatusFile("src/other.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }))
      .mockResolvedValue(createSummary({
        files: [
          createStatusFile("src/app.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          }),
          createStatusFile("src/other.ts", {
            isUnstaged: true,
            worktreeStatus: "D"
          })
        ]
      }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff("src/app.ts", "initial-value"));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/app\.ts/ }));
    expect(await screen.findByText("initial-value")).toBeTruthy();

    const summaryCallsBeforeWatchEvent = vi.mocked(githead.getRepoSummary).mock.calls.length;
    vi.mocked(githead.getFileDiff).mockClear();
    await act(async () => {
      emitRepoChanged();
      await flushRendererAsync();
    });

    await waitFor(() => {
      expect(githead.getRepoSummary).toHaveBeenCalledTimes(summaryCallsBeforeWatchEvent + 1);
    });
    expect(githead.getFileDiff).not.toHaveBeenCalled();
  });

  it("logs commit output without rendering it as inline commit feedback", async () => {
    const user = userEvent.setup();
    const longCommitOutput = [
      "[main 1234567] feat: log commit output",
      " create mode 100644 src/renderer/App.tsx",
      " create mode 100644 src/renderer/App.test.tsx"
    ].join("\n");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: longCommitOutput,
      stderr: ""
    });

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    expect((screen.getByRole("button", { name: /^Commit$/ }) as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: log commit output");
    expect((screen.getByRole("button", { name: /^Commit$/ }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    await waitFor(() => {
      expect(githead.commitChanges).toHaveBeenCalledWith({
        repoPath,
        message: "feat: log commit output",
        operationId: expect.any(String)
      });
    });

    expect(screen.getByLabelText("Commit staged files").querySelector(".status-text")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/create mode 100644 src\/renderer\/App\.tsx/)).toBeTruthy();
  });

  it("generates a commit message from the primary Generate button", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.generateCommitMessage).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "feat: add generated context menu",
      stderr: ""
    });

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    await user.click(within(commitPanel).getByRole("button", { name: /^Generate$/ }));

    await waitFor(() => {
      expect(githead.generateCommitMessage).toHaveBeenCalledWith({
        repoPath,
        operationId: expect.any(String)
      });
    });
    expect((screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement).value).toBe("feat: add generated context menu");
  });

  it("opens Generate with Context and sends trimmed context with the request", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.generateCommitMessage).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "fix: preserve project naming",
      stderr: ""
    });

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    await user.click(within(commitPanel).getByRole("button", { name: "More generate actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Generate with Context" }));

    const dialog = await screen.findByRole("dialog", { name: "Generate with Context" });
    await user.type(within(dialog).getByLabelText("Change Context"), "  Preserve legacy project naming.  ");
    await user.click(within(dialog).getByRole("button", { name: /^Generate$/ }));

    await waitFor(() => {
      expect(githead.generateCommitMessage).toHaveBeenCalledWith({
        repoPath,
        additionalContext: "Preserve legacy project naming.",
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Generate with Context" })).toBeNull();
    });
  });

  it("keeps Generate with Context open when generation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.generateCommitMessage).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "OpenRouter request failed."
    });

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    await user.click(within(commitPanel).getByRole("button", { name: "More generate actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Generate with Context" }));

    const dialog = await screen.findByRole("dialog", { name: "Generate with Context" });
    const contextInput = within(dialog).getByLabelText("Change Context") as HTMLTextAreaElement;
    await user.type(contextInput, "Important product context");
    await user.click(within(dialog).getByRole("button", { name: /^Generate$/ }));

    await waitFor(() => {
      expect(githead.generateCommitMessage).toHaveBeenCalledWith({
        repoPath,
        additionalContext: "Important product context",
        operationId: expect.any(String)
      });
    });
    expect(await screen.findByRole("dialog", { name: "Generate with Context" })).toBeTruthy();
    expect(contextInput.value).toBe("Important product context");
  });

  it("keeps Generate with Context disabled until context is provided", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    await user.click(within(commitPanel).getByRole("button", { name: "More generate actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Generate with Context" }));

    const dialog = await screen.findByRole("dialog", { name: "Generate with Context" });
    const submitButton = within(dialog).getByRole("button", { name: /^Generate$/ });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialog).getByLabelText("Change Context"), "   ");
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialog).getByLabelText("Change Context"), "why");
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("prompts to trust a repository before committing and remembers the decision", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoTrust).mockResolvedValueOnce({
      trusted: false
    }).mockResolvedValue({
      trusted: true
    });
    vi.mocked(githead.addRepoTrust).mockResolvedValue({
      trusted: true
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: trust repo");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    expect(await screen.findByRole("dialog", { name: "Do you trust this workspace?" })).toBeTruthy();
    expect(screen.getByText("This is the first time Githead will run Git operations here that may execute configured hooks or local Git configuration.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Trust Workspace" }));

    await waitFor(() => {
      expect(githead.addRepoTrust).toHaveBeenCalledWith({
        repoPath
      });
      expect(githead.commitChanges).toHaveBeenCalledWith({
        repoPath,
        message: "feat: trust repo",
        operationId: expect.any(String)
      });
    });
  });

  it("does not run risky git operations when repository trust is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoTrust).mockResolvedValue({
      trusted: false
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: decline trust");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(githead.getRepoTrust).toHaveBeenCalledWith({
        repoPath
      });
    });
    expect(githead.addRepoTrust).not.toHaveBeenCalled();
    expect(githead.commitChanges).not.toHaveBeenCalled();
  });

  it("cancels a repository trust prompt instead of retargeting it after a repository switch", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Trust-B";
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoTrust).mockResolvedValue({ trusted: false });
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      files: [createStatusFile("src/trust.ts", { indexStatus: "M", isStaged: true })]
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/trust\.ts/ });
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: trust A");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    const trustDialog = await screen.findByRole("dialog", { name: "Do you trust this workspace?" });
    expect(within(trustDialog).getByText(repoPath)).toBeTruthy();
    pendingRepositoryChoice.resolve(otherRepo);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Do you trust this workspace?" })).toBeNull());
    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(githead.addRepoTrust).not.toHaveBeenCalled();
    expect(githead.commitChanges).not.toHaveBeenCalled();
  });

  it("prompts for Git identity when commit fails with missing author identity and retries after saving", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges)
      .mockResolvedValueOnce(createOperationResult({
        exitCode: 1,
        stderr: "Author identity unknown",
        errorKind: "missing-author-identity"
      }))
      .mockResolvedValueOnce(createOperationResult({
        stdout: "[main abc123] feat: identify author\n"
      }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: identify author");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    expect(await screen.findByRole("dialog", { name: "Set Git Author Identity" })).toBeTruthy();
    await user.type(screen.getByLabelText("Name"), "Taylor");
    await user.type(screen.getByLabelText("Email"), "taylor@example.test");
    await user.click(screen.getByRole("button", { name: "Save and Retry Commit" }));

    await waitFor(() => {
      expect(githead.saveGitIdentity).toHaveBeenCalledWith({
        repoPath,
        name: "Taylor",
        email: "taylor@example.test",
        scope: "repository",
        operationId: expect.any(String)
      });
      expect(githead.commitChanges).toHaveBeenCalledTimes(2);
      expect(githead.commitChanges).toHaveBeenLastCalledWith({
        repoPath,
        message: "feat: identify author",
        operationId: expect.any(String)
      });
    });
    expect((screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement).value).toBe("");
  });

  it("does not open an old repository identity retry after identity loading crosses a repository switch", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Identity-B";
    const pendingIdentity = defer<GitIdentitySettings>();
    const pendingRepositoryChoice = defer<string | null>();
    let waitForRepositoryAIdentity = false;
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      files: [createStatusFile(
        requestedRepoPath === repoPath ? "src/identity-a.ts" : "src/identity-b.ts",
        { indexStatus: "M", isStaged: true }
      )]
    }));
    vi.mocked(githead.getGitIdentity).mockImplementation((requestedRepoPath) => {
      if (requestedRepoPath === repoPath && waitForRepositoryAIdentity) {
        return pendingIdentity.promise;
      }
      return Promise.reject(new Error("Identity unavailable during startup."));
    });
    vi.mocked(githead.commitChanges).mockResolvedValue(createOperationResult({
      exitCode: 1,
      stderr: "Author identity unknown",
      errorKind: "missing-author-identity"
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/identity-a\.ts/ });
    await waitFor(() => expect(vi.mocked(githead.getGitIdentity).mock.calls.length).toBeGreaterThan(0));
    await flushRendererAsync();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    const identityCallsBeforeCommit = vi.mocked(githead.getGitIdentity).mock.calls.length;
    waitForRepositoryAIdentity = true;
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: identity A");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));
    await waitFor(() => expect(vi.mocked(githead.getGitIdentity).mock.calls.length).toBeGreaterThan(identityCallsBeforeCommit));

    pendingRepositoryChoice.resolve(otherRepo);
    await screen.findByRole("option", { name: /src\/identity-b\.ts/ });
    pendingIdentity.resolve({
      scope: "repository",
      name: "Repository A User",
      email: "a@example.test",
      repository: { name: "Repository A User", email: "a@example.test" },
      global: { name: "", email: "" }
    });
    await flushRendererAsync();

    expect(screen.queryByRole("dialog", { name: "Set Git Author Identity" })).toBeNull();
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
    expect(githead.commitChanges).toHaveBeenCalledTimes(1);
  });

  it("saves missing Git identity globally when selected", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges)
      .mockResolvedValueOnce(createOperationResult({
        exitCode: 1,
        stderr: "fatal: unable to auto-detect email address",
        errorKind: "missing-author-identity"
      }))
      .mockResolvedValueOnce(createOperationResult());

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: global identity");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));
    await screen.findByRole("dialog", { name: "Set Git Author Identity" });
    await user.type(screen.getByLabelText("Name"), "Taylor");
    await user.type(screen.getByLabelText("Email"), "taylor@example.test");
    await user.click(screen.getByRole("radio", { name: "Global" }));
    await user.click(screen.getByRole("button", { name: "Save and Retry Commit" }));

    await waitFor(() => {
      expect(githead.saveGitIdentity).toHaveBeenCalledWith(expect.objectContaining({
        scope: "global",
        operationId: expect.any(String)
      }));
    });
  });

  it("keeps the Git identity prompt open when saving identity fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges).mockResolvedValue(createOperationResult({
      exitCode: 1,
      stderr: "Author identity unknown",
      errorKind: "missing-author-identity"
    }));
    vi.mocked(githead.saveGitIdentity).mockRejectedValue(new Error("error: could not lock config file"));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: identity failure");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));
    await user.type(await screen.findByLabelText("Name"), "Taylor");
    await user.type(screen.getByLabelText("Email"), "taylor@example.test");
    await user.click(screen.getByRole("button", { name: "Save and Retry Commit" }));

    expect(await screen.findByText("error: could not lock config file")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Set Git Author Identity" })).toBeTruthy();
    expect(githead.commitChanges).toHaveBeenCalledTimes(1);
  });

  it("does not retry the commit when the Git identity prompt is canceled", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "A",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges).mockResolvedValue(createOperationResult({
      exitCode: 1,
      stderr: "Author identity unknown",
      errorKind: "missing-author-identity"
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: cancel identity");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Set Git Author Identity" })).toBeNull();
    });
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
    expect(githead.commitChanges).toHaveBeenCalledTimes(1);
  });

  it("pushes after a successful commit even when the old summary has no unpushed commits", async () => {
    const user = userEvent.setup();
    const pendingCommit = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: ["# branch.ab +0 -0"],
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges).mockReturnValue(pendingCommit.promise);
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push"));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: restore commit and push");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await waitFor(() => expect(githead.commitChanges).toHaveBeenCalledTimes(1));

    expect(githead.runGitAction).not.toHaveBeenCalled();

    pendingCommit.resolve(createOperationResult());

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        operationId: expect.any(String)
      });
    });
  });

  it("does not push after a failed commit", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitChanges).mockResolvedValue(createOperationResult({
      exitCode: 1,
      stderr: "Commit failed."
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: failed commit");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await waitFor(() => expect(githead.commitChanges).toHaveBeenCalledTimes(1));
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("does not push the newly selected repository when an old commit-and-push completes late", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Commit-B";
    const pendingCommit = defer<GitOperationResult>();
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      statusLines: ["# branch.ab +1 -0"],
      files: [createStatusFile(
        requestedRepoPath === repoPath ? "src/a.ts" : "src/b.ts",
        { indexStatus: "M", isStaged: true }
      )]
    }));
    vi.mocked(githead.commitChanges).mockReturnValue(pendingCommit.promise);

    render(<App />);

    await screen.findByRole("option", { name: /src\/a\.ts/ });
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: repository A");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await waitFor(() => expect(githead.commitChanges).toHaveBeenCalledWith({
      repoPath,
      message: "feat: repository A",
      operationId: expect.any(String)
    }));

    pendingCommit.resolve(createOperationResult({ repoPath }));
    pendingRepositoryChoice.resolve(otherRepo);
    await screen.findByRole("option", { name: /src\/b\.ts/ });
    const message = screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement;
    await user.clear(message);
    await user.type(message, "feat: repository B");

    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    expect(message.value).toBe("feat: repository B");
  });

  it("subscribes to git output and removes the listener on unmount", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());
    const view = render(<App />);

    await waitForRepositoryWorkspace();
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "fetch output\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/fetch output/)).toBeTruthy();

    view.unmount();

    expect(cleanupGitOutput).toHaveBeenCalledTimes(1);
    expect(cleanupRepoChanged).toHaveBeenCalledTimes(1);
    expect(cleanupUpdateState).toHaveBeenCalledTimes(1);
  });

  it("hides the app update control while no update is active", async () => {
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "idle"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();

    expect(screen.queryByRole("button", { name: /Update available/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Restart to update/ })).toBeNull();
  });

  it("downloads an available app update from the update control", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "available",
      availableVersion: "0.1.1",
      checkedAt: "2026-05-31T10:00:00Z"
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Update available" }));

    await waitFor(() => {
      expect(githead.downloadUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("renders app update download progress from update state events", async () => {
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState());

    render(<App />);

    await waitForRepositoryWorkspace();
    updateStateCallback?.(createUpdateState({
      status: "downloading",
      availableVersion: "0.1.1",
      downloadPercent: 42
    }));

    const button = await screen.findByRole("button", { name: "Downloading 42%" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("installs a downloaded app update after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "downloaded",
      availableVersion: "0.1.1",
      downloadedVersion: "0.1.1",
      downloadPercent: 100
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Restart to update" }));

    await waitFor(() => {
      expect(githead.installUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("shows app release notes in a popover beside the update version", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "downloaded",
      availableVersion: "0.1.1",
      downloadedVersion: "0.1.1",
      downloadPercent: 100,
      releaseNotes: {
        version: "0.1.1",
        url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1",
        title: "Githead 0.1.1",
        body: "## Changes\n\n- Fixed update UI\n\n<strong>hidden</strong>",
        loading: false,
        error: null
      }
    }));

    render(<App />);

    expect(await screen.findByText("Version 0.1.1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Release Notes" }));

    expect(await screen.findByRole("heading", { name: "Githead 0.1.1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Changes" })).toBeTruthy();
    expect(screen.getByText("Fixed update UI")).toBeTruthy();
    expect(document.querySelector("strong")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open on GitHub" }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({
      url: "https://github.com/warheadent/Githead/releases/tag/v0.1.1"
    });
  });

  it("shows app release notes loading state", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "available",
      availableVersion: "0.1.1",
      releaseNotes: {
        version: "0.1.1",
        url: null,
        title: null,
        body: null,
        loading: true,
        error: null
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Release Notes" }));

    expect((await screen.findByRole("status")).textContent).toBe("Loading…");
  });

  it("shows app release notes errors without hiding update actions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "available",
      availableVersion: "0.1.1",
      releaseNotes: {
        version: "0.1.1",
        url: null,
        title: null,
        body: null,
        loading: false,
        error: "Release notes are not published for this version."
      }
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Update available" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Release Notes" }));

    expect((await screen.findByRole("status")).textContent).toBe("Release notes are not published for this version.");
  });

  it("retries app update checks from an error state", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getUpdateState).mockResolvedValue(createUpdateState({
      status: "error",
      message: "Could not check for updates. The GitHub release feed is not publicly available yet.",
      errorContext: "check",
      canRetry: true
    }));

    render(
      <TooltipProvider>
        <App />
      </TooltipProvider>
    );

    const button = await screen.findByRole("button", {
      name: "Update check failed: Could not check for updates. The GitHub release feed is not publicly available yet."
    });
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Update check failed");
    expect(button.getAttribute("aria-label")).toBe(
      "Update check failed: Could not check for updates. The GitHub release feed is not publicly available yet."
    );
    expect(screen.queryByText("Could not check for updates. The GitHub release feed is not publicly available yet.")).toBeNull();
    await user.click(button);

    await waitFor(() => {
      expect(githead.checkForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  it("moves log clearing into the activity log tab", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await waitForRepositoryWorkspace();
    expect(within(screen.getByLabelText("Commit staged files")).queryByRole("button", { name: /Clear Log/ })).toBeNull();

    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "fetch output\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    expect(screen.getByText(/fetch output/)).toBeTruthy();

    const clearButton = screen.getByRole("button", { name: /Clear Log/ }) as HTMLButtonElement;
    expect(clearButton.disabled).toBe(false);

    await user.click(clearButton);

    await waitFor(() => {
      expect(screen.queryByText(/fetch output/)).toBeNull();
    });
    expect((screen.getByRole("button", { name: /Clear Log/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Empty")).toBeTruthy();
  });

  it("renders ANSI output without repeating stream labels for adjacent chunks", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await waitForRepositoryWorkspace();
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "\u001B[36mcolored ",
      timestamp: new Date().toISOString()
    });
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "output\u001B[39m\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));

    expect((await screen.findByRole("log")).textContent).toContain("colored output");
    expect(screen.queryByText(String.fromCharCode(0x1b))).toBeNull();
    expect(screen.getAllByText("stdout")).toHaveLength(1);
  });

  it("copies raw activity log output", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await waitForRepositoryWorkspace();
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "fetch output\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    await user.click(await screen.findByRole("button", { name: "Copy Raw" }));

    expect(githead.copyTextToClipboard).toHaveBeenCalledWith({
      text: "[stdout] fetch output\n"
    });
  });

  it("toggles activity log line wrapping", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await waitForRepositoryWorkspace();
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "long output\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    const wrapButton = await screen.findByRole("button", { name: "Enable line wrap" });
    expect(wrapButton.getAttribute("aria-pressed")).toBe("false");

    await user.click(wrapButton);

    expect(screen.getByRole("button", { name: "Disable line wrap" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("pauses activity log auto-scroll when the user scrolls away from the bottom", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await waitForRepositoryWorkspace();
    gitOutputCallback?.({
      runId: "run-1",
      action: "fetch",
      stream: "stdout",
      text: "fetch output\n",
      timestamp: new Date().toISOString()
    });

    await user.click(screen.getByRole("tab", { name: "Activity Log" }));
    const output = await screen.findByRole("log");
    Object.defineProperty(output, "scrollHeight", {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(output, "clientHeight", {
      configurable: true,
      value: 100
    });
    Object.defineProperty(output, "scrollTop", {
      configurable: true,
      writable: true,
      value: 100
    });

    fireEvent.scroll(output);

    expect(await screen.findByRole("button", { name: "Jump to latest" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Jump to latest" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
    });
  });

  it("shows GitHub tabs only for repositories with a supported GitHub origin", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    const { unmount } = render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.queryByRole("tab", { name: /Workflow Runs/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Pull Requests/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Issues/ })).toBeNull();

    unmount();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());

    render(<App />);

    await screen.findByRole("tab", { name: /Workflow Runs/ });
    expect(screen.getByRole("tab", { name: /Pull Requests/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Issues/ })).toBeTruthy();
  });

  it("loads GitHub open counts into pull request and issue tab titles", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue({ ok: true, data: createOpenCounts({
      issues: 17,
      pullRequests: 4
    }), rateLimit: null });

    render(<App />);

    await waitFor(() => {
      expect(githead.getGitHubOpenCounts).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    expect(await screen.findByRole("tab", { name: /Pull Requests 4/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Issues 17/ })).toBeTruthy();
    // Pull requests load eagerly (the Create PR button needs them); issues
    // still load only when their tab is opened.
    expect(githead.getGitHubIssues).not.toHaveBeenCalled();
  });

  it("compacts large GitHub open counts in tab titles", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue({ ok: true, data: createOpenCounts({
      issues: 1100,
      pullRequests: 12_000
    }), rateLimit: null });

    render(<App />);

    expect(await screen.findByRole("tab", { name: /Issues 1\.1k/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Pull Requests 12k/ })).toBeTruthy();
  });

  it("loads workflow runs from GitHub when the Workflow Runs tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubWorkflowRuns).mockResolvedValue({ ok: true, data: { items: [
      createWorkflowRun({
        name: "CI",
        conclusion: "success",
        branch: "main",
        event: "push",
        commitMessage: "feat: add workflow runs tab"
      })
    ], page: 1, nextPage: null, totalCount: 1 }, rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));

    await waitFor(() => {
      expect(githead.getGitHubWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    expect(await screen.findByText("CI")).toBeTruthy();
    expect(screen.getByText("success")).toBeTruthy();
    expect(screen.getByText("feat: add workflow runs tab")).toBeTruthy();

    await user.click(screen.getByText("CI"));

    await waitFor(() => {
      expect(githead.openExternalUrl).toHaveBeenCalledWith({
        url: "https://github.com/openai/githead/actions/runs/1"
      });
    });
  });

  it("loads open pull requests from GitHub when the Pull Requests tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubPullRequests).mockResolvedValue({ ok: true, data: { items: [
      createPullRequest({
        number: 24,
        title: "Add GitHub pull request tab",
        sourceBranch: "feature/pr-tab",
        targetBranch: "main",
        labels: [
          "ui"
        ],
        comments: 3,
        url: "https://github.com/openai/githead/pull/24"
      })
    ], page: 1, nextPage: null, totalCount: null }, rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Pull Requests/ }));

    await waitFor(() => {
      expect(githead.getGitHubPullRequests).toHaveBeenCalledWith({
        repoPath,
        page: 1,
        requestId: expect.any(String)
      });
    });
    expect(await screen.findByText("#24")).toBeTruthy();
    expect(screen.getByText("Add GitHub pull request tab")).toBeTruthy();
    expect(screen.getByText("feature/pr-tab -> main")).toBeTruthy();
    expect(screen.getByText("ui")).toBeTruthy();

    await user.click(screen.getByText("Add GitHub pull request tab"));

    await waitFor(() => {
      expect(githead.openExternalUrl).toHaveBeenCalledWith({
        url: "https://github.com/openai/githead/pull/24"
      });
    });
  });

  it("loads and merges another workflow page", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubWorkflowRuns)
      .mockResolvedValueOnce({ ok: true, data: { items: [createWorkflowRun({ id: "1", name: "First" })], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [createWorkflowRun({ id: "2", name: "Second" })], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));
    await user.click(await screen.findByRole("button", { name: "Load more workflow runs" }));

    expect(await screen.findByText("First")).toBeTruthy();
    expect(await screen.findByText("Second")).toBeTruthy();
    expect(githead.getGitHubWorkflowRuns).toHaveBeenLastCalledWith(expect.objectContaining({ repoPath, page: 2 }));
    expect(screen.queryByRole("button", { name: "Load more workflow runs" })).toBeNull();
  });

  it("downloads a missing LFS image preview only after explicit activation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("assets/image.png", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    vi.mocked(githead.getFileDiff).mockResolvedValue({
      path: "assets/image.png",
      side: "unstaged",
      kind: "image",
      text: "",
      before: { status: "lfs-missing", byteLength: 76047, fetchable: true },
      after: { status: "lfs-missing", byteLength: 76047, fetchable: true }
    });
    vi.mocked(githead.fetchLfsImageVersions).mockResolvedValue({ repoPath, exitCode: 0, stdout: "Downloaded LFS image preview.", stderr: "" });

    render(<App />);
    await user.click(await screen.findByRole("option", { name: /assets\/image\.png/ }));
    expect((await screen.findAllByText(/LFS image is not available locally/)).length).toBe(2);
    expect(githead.fetchLfsImageVersions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Download missing Git LFS image preview" }));
    await waitFor(() => expect(githead.fetchLfsImageVersions).toHaveBeenCalledWith({
      context: "status", repoPath, path: "assets/image.png", side: "unstaged", operationId: expect.any(String)
    }));
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledTimes(2));
  });

  it("generates a pull request title from the Create PR dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/pr-title",
      upstream: "origin/feature/pr-title",
      branches: [
        {
          name: "feature/pr-title",
          current: true,
          upstream: "origin/feature/pr-title"
        }
      ],
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature/pr-title",
          remote: "origin",
          branch: "feature/pr-title"
        }
      ],
      commitsAheadOfDefaultBranch: 2
    }));
    vi.mocked(githead.generatePrTitle).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "Add generated PR titles",
      stderr: ""
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));

    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Generate pull request title" }));

    await waitFor(() => {
      expect(githead.generatePrTitle).toHaveBeenCalledWith({
        repoPath,
        baseRef: "origin/main",
        headRef: "feature/pr-title",
        operationId: expect.any(String)
      });
    });
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("Add generated PR titles");
  });

  it("recovers a missing pull request creation without accepting its stale completion", async () => {
    const user = userEvent.setup();
    const pendingCreate = defer<Awaited<ReturnType<GitheadApi["createGitHubPullRequest"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/hung-pr",
      upstream: "origin/feature/hung-pr",
      branches: [{ name: "feature/hung-pr", current: true, upstream: "origin/feature/hung-pr" }],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature/hung-pr", remote: "origin", branch: "feature/hung-pr" }
      ],
      commitsAheadOfDefaultBranch: 2,
      statusLines: ["# branch.ab +0 -0"]
    }));
    vi.mocked(githead.createGitHubPullRequest).mockReturnValue(pendingCreate.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));
    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Create Pull Request" }));
    await waitFor(() => expect(githead.createGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      headBranch: "feature/hung-pr",
      operationId: expect.any(String)
    })));

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const operationId = vi.mocked(githead.createGitHubPullRequest).mock.calls[0]?.[0].operationId;
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create Pull Request" })).toBeNull());

    pendingCreate.resolve({ ok: true, data: { number: 42, url: "https://github.com/openai/githead/pull/42", title: "Late PR", draft: false }, rateLimit: null });
    await flushRendererAsync();

    expect(screen.queryByRole("dialog", { name: "Create Pull Request" })).toBeNull();
    expect(screen.queryByText(/Created pull request #42/)).toBeNull();
  });

  it("preserves outcome-unknown guidance when pull request creation throws", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/timeout-pr",
      upstream: "origin/feature/timeout-pr",
      branches: [{ name: "feature/timeout-pr", current: true, upstream: "origin/feature/timeout-pr" }],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature/timeout-pr", remote: "origin", branch: "feature/timeout-pr" }
      ],
      commitsAheadOfDefaultBranch: 2,
      statusLines: ["# branch.ab +0 -0"]
    }));
    vi.mocked(githead.createGitHubPullRequest).mockRejectedValue(new Error("Operation timed out."));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));
    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Create Pull Request" }));

    expect(await within(dialog).findByText("Operation timed out. Check GitHub before retrying; the pull request may have been created.")).toBeTruthy();
  });

  it("loads open issues from GitHub when the Issues tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockResolvedValue({ ok: true, data: { items: [
      createIssue({
        number: 12,
        title: "Add GitHub issue tab",
        labels: [
          "enhancement"
        ],
        comments: 4,
        url: "https://github.com/openai/githead/issues/12"
      })
    ], page: 1, nextPage: null, totalCount: null }, rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Issues/ }));

    await waitFor(() => {
      expect(githead.getGitHubIssues).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    expect(await screen.findByText("#12")).toBeTruthy();
    expect(screen.getByText("Add GitHub issue tab")).toBeTruthy();
    expect(screen.getByText("enhancement")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();

    await user.click(screen.getByText("Add GitHub issue tab"));

    await waitFor(() => {
      expect(githead.openExternalUrl).toHaveBeenCalledWith({
        url: "https://github.com/openai/githead/issues/12"
      });
    });
  });

  it("shows upstream commits ready to pull in the Pull action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: [
        "# branch.ab +0 -3"
      ]
    }));

    render(<App />);

    const pullButton = await screen.findByRole("button", { name: "Pull 3 commits" });
    expect(pullButton).toBeTruthy();
    expect(within(pullButton).getByText("3")).toBeTruthy();
  });

  it("does not show a zero count in the Pull action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: [
        "# branch.ab +0 -0"
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Pull$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pull \(0\)$/ })).toBeNull();
  });

  it("orders repository actions before Fetch, Pull, and Push", async () => {
    render(<App />);

    const actionsGroup = await screen.findByRole("group", { name: "Git actions" });
    const buttons = within(actionsGroup).getAllByRole("button");

    expect(buttons.slice(0, 4).map((button) => button.textContent?.trim())).toEqual([
      "Actions",
      "Fetch",
      "Pull",
      "Push"
    ]);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Repository actions");
    expect(buttons[4]?.getAttribute("aria-label")).toBe("More push actions");
  });

  it("shows upstream commits ready to push in the Push action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: [
        "# branch.ab +2 -0"
      ]
    }));

    render(<App />);

    const actionsGroup = await screen.findByRole("group", { name: "Git actions" });

    const pushButton = within(actionsGroup).getByRole("button", { name: "Push 2 commits" });
    expect(pushButton).toBeTruthy();
    expect(within(pushButton).getByText("2")).toBeTruthy();
  });

  it("shows upstream commits ready to push in the primary commit action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: [
        "# branch.ab +5 -0"
      ]
    }));

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    const pushButton = within(commitPanel).getByRole("button", { name: "Push 5 commits" });
    expect(pushButton).toBeTruthy();
    expect(within(pushButton).getByText("5")).toBeTruthy();
  });

  it("does not show a zero count in the Push action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      statusLines: [
        "# branch.ab +0 -0"
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Push$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Push \(0\)$/ })).toBeNull();
  });

  it("runs Push from the sync toolbar", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.runGitAction).mockResolvedValue({
      runId: "run-push",
      action: "push",
      repoPath,
      exitCode: 0,
      stdout: "",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        operationId: expect.any(String)
      });
    });
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Activity Log" }).getAttribute("aria-selected")).toBe("false");
  });

  it("lazily renders and caches the working Markdown preview", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("README.md", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "diff-value"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({
      path: file.path,
      text: "# Rendered heading\n\n**bold text**\n\n<script>unsafe</script>"
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /README\.md/ }));
    const previewButton = await screen.findByRole("button", { name: "Preview" });
    expect(screen.getByRole("button", { name: "Wrap diff lines" })).toBeTruthy();
    expect(githead.getFilePreview).not.toHaveBeenCalled();
    await user.click(previewButton);

    expect(await screen.findByRole("heading", { name: "Rendered heading" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wrap diff lines" })).toBeNull();
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
    expect(screen.queryByText("unsafe")).toBeNull();
    expect(githead.getFilePreview).toHaveBeenCalledWith({
      repoPath,
      path: "README.md",
      source: { kind: "working" },
      requestId: expect.stringMatching(/^file-preview:/)
    });

    await user.click(screen.getByRole("button", { name: "Show Diff" }));
    expect(screen.getByRole("button", { name: "Wrap diff lines" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(githead.getFilePreview).toHaveBeenCalledTimes(1);
  });

  it("renders GFM pipe tables as a semantic table constrained to the preview", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("README.md", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "diff-value"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({
      path: file.path,
      text: [
        "| Left | Center | Right |",
        "| :--- | :----: | ---: |",
        "| Alpha | Beta | Gamma |",
        "",
        "<table><tbody><tr><td>Unsafe HTML table</td></tr></tbody></table>"
      ].join("\n")
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /README\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Left", "Center", "Right"]);
    expect(headers.map((header) => header.style.textAlign)).toEqual(["left", "center", "right"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(table.parentElement?.classList.contains("markdown-preview-table")).toBe(true);
    expect(table.parentElement?.getAttribute("role")).toBeNull();
    expect(table.parentElement?.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByText("Unsafe HTML table")).toBeNull();
  });

  it("uses the staged source for .markdown files and hides preview for deleted targets", async () => {
    const user = userEvent.setup();
    const staged = createStatusFile("docs/guide.markdown", { isStaged: true, indexStatus: "M" });
    const deleted = createStatusFile("deleted.md", { isUnstaged: true, worktreeStatus: "D" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [staged, deleted] }));
    vi.mocked(githead.getFileDiff).mockImplementation(async ({ path, side }) => createTextDiff(path, "value", side));
    vi.mocked(githead.getFilePreview).mockImplementation(async ({ path }) => ({ path, text: "# Preview" }));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /docs\/guide\.markdown/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    await waitFor(() => expect(githead.getFilePreview).toHaveBeenCalledWith(expect.objectContaining({
      path: staged.path,
      source: { kind: "staged" }
    })));

    await user.click(screen.getByRole("option", { name: /deleted\.md/ }));
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("renders the selected commit version of a Markdown file", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: true
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [{ path: "README.md", status: "M", additions: 2, deletions: 1 }]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("README.md", "commit-diff"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({ path: "README.md", text: "# Commit preview" });

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("option", { name: /README\.md/ });
    expect((await screen.findByRole("button", { name: "Wrap diff lines" })).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".diff-output.text")?.classList.contains("is-wrapped")).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("heading", { name: "Commit preview" })).toBeTruthy();
    expect(githead.getFilePreview).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      path: "README.md",
      source: { kind: "commit", hash: commit.hash }
    }));
  });

  it("cancels and ignores a stale Markdown preview when file selection changes", async () => {
    const user = userEvent.setup();
    const firstPreview = defer<{ path: string; text: string }>();
    const files = [
      createStatusFile("first.md", { isUnstaged: true, worktreeStatus: "M" }),
      createStatusFile("second.md", { isUnstaged: true, worktreeStatus: "M" })
    ];
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files }));
    vi.mocked(githead.getFileDiff).mockImplementation(async ({ path, side }) => createTextDiff(path, "value", side));
    vi.mocked(githead.getFilePreview)
      .mockReturnValueOnce(firstPreview.promise)
      .mockResolvedValueOnce({ path: "second.md", text: "# Second preview" });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /first\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    const firstRequestId = vi.mocked(githead.getFilePreview).mock.calls[0]?.[0].requestId;
    await user.click(screen.getByRole("option", { name: /second\.md/ }));

    await waitFor(() => expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: firstRequestId }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("heading", { name: "Second preview" })).toBeTruthy();

    firstPreview.resolve({ path: "first.md", text: "# Stale first preview" });
    await flushRendererAsync();
    expect(screen.queryByRole("heading", { name: "Stale first preview" })).toBeNull();
  });

  it("pushes the current branch to a selected existing remote branch without changing upstream", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: "upstream/main",
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" },
        { name: "upstream", url: "https://example.test/upstream.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/release", remote: "origin", branch: "release" },
        { name: "upstream/main", remote: "upstream", branch: "main" },
        { name: "upstream/release", remote: "upstream", branch: "release" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push"));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));

    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    expect((within(dialog).getByLabelText("Remote") as HTMLSelectElement).value).toBe("upstream");
    expect(within(dialog).queryByRole("option", { name: "main" })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText("Destination branch"), "release");
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        pushTarget: {
          sourceBranch: "feature/source",
          remoteName: "upstream",
          destinationBranch: "release"
        },
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Push to Another Branch" })).toBeNull();
    });
    expect(githead.setBranchUpstream).not.toHaveBeenCalled();
  });

  it("can push a Publish-state branch to a new remote branch without tracking it", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: null,
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push"));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Publish branch" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));
    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    await user.selectOptions(
      within(dialog).getByLabelText("Destination branch"),
      within(dialog).getByRole("option", { name: "New branch…" })
    );
    await user.type(within(dialog).getByLabelText("New branch name"), "release/candidate");
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        pushTarget: {
          sourceBranch: "feature/source",
          remoteName: "origin",
          destinationBranch: "release/candidate"
        },
        operationId: expect.any(String)
      });
    });
    expect(githead.publishBranch).not.toHaveBeenCalled();
  });

  it("keeps the push-to-branch dialog open when the targeted push fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: "origin/main",
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/release", remote: "origin", branch: "release" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "rejected non-fast-forward"
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));
    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    await user.selectOptions(within(dialog).getByLabelText("Destination branch"), "release");
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    expect(await within(dialog).findByText("rejected non-fast-forward")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Push to Another Branch" })).toBeTruthy();
  });

  it("disables push-to-branch when no push remote exists and hides it when unsupported", async () => {
    const { unmount } = render(<App />);
    expect((await screen.findByRole("button", { name: "More push actions" }) as HTMLButtonElement).disabled).toBe(true);

    unmount();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      capabilities: {
        ...gitCapabilities(),
        pushToBranch: false
      }
    }));
    render(<App />);
    await screen.findByRole("button", { name: /^Push$/ });
    expect(screen.queryByRole("button", { name: "More push actions" })).toBeNull();
  });

  it("shows Publish instead of Push when the current branch has no upstream", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Publish branch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Push$/ })).toBeNull();
  });

  it("opens the publish dialog instead of running plain push", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));

    expect(await screen.findByRole("heading", { name: "Publish Branch" })).toBeTruthy();
    expect(screen.getAllByText("feature/publish").length).toBeGreaterThan(0);
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("publishes a branch to origin by default", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        },
        {
          name: "upstream",
          url: "https://example.test/upstream.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(githead.publishBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/publish",
        remoteName: "origin",
        operationId: expect.any(String)
      });
    });
  });

  it("lets the user choose among multiple publish remotes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        },
        {
          name: "upstream",
          url: "https://example.test/upstream.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.selectOptions(await screen.findByLabelText("Remote"), "upstream");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(githead.publishBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/publish",
        remoteName: "upstream",
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the publish dialog open when publishing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));
    vi.mocked(githead.publishBranch).mockResolvedValue(createRunResult("publish", {
      exitCode: 1,
      stderr: "fatal: rejected"
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText("fatal: rejected")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Publish Branch" })).toBeTruthy();
  });

  it("opens the publish dialog after a stale plain push no-upstream failure", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        upstream: "origin/main",
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }))
      .mockResolvedValue(createSummary({
        branch: "feature/publish",
        upstream: null,
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "fatal: The current branch feature/publish has no upstream branch."
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    expect(await screen.findByText("This branch has no upstream. Publish it to set one.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Publish Branch" })).toBeTruthy();
  });

  it("does not open the publish dialog after unrelated push failures", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        upstream: "origin/main",
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }))
      .mockResolvedValue(createSummary({
        branch: "feature/publish",
        upstream: null,
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "fatal: Authentication failed"
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        operationId: expect.any(String)
      });
    });
    expect(screen.queryByRole("heading", { name: "Publish Branch" })).toBeNull();
  });

  it("does not show Publish when set upstream is not supported", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      upstream: null,
      capabilities: {
        ...gitCapabilities(),
        setUpstream: false
      },
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Push$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish branch" })).toBeNull();
  });

  it("does not jump to the Activity Log when action trust is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoTrust).mockResolvedValue({
      trusted: false
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    await user.click(await screen.findByRole("button", { name: /^Push$/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(githead.getRepoTrust).toHaveBeenCalledWith({
        repoPath
      });
    });
    expect(githead.runGitAction).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Activity Log" }).getAttribute("aria-selected")).toBe("false");
  });

  it("opens the Repository Actions manager without a .githead folder and saves a shared action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForRepositoryWorkspace();

    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Build");
    await user.type(screen.getByLabelText(/Description/), " Compile the application ");
    await user.type(screen.getByLabelText("Command"), "npm run build");
    await user.click(screen.getByRole("button", { name: "Save Shared" }));

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Build",
            description: "Compile the application",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the Repository Actions body scrollable when many actions are configured", async () => {
    const user = userEvent.setup();
    const sharedActions = Array.from({ length: 14 }, (_, index) => ({
      name: `Action ${index + 1}`,
      description: "",
      command: `npm run action-${index + 1}`,
      shell: "powershell" as const
    }));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: sharedActions
        },
        actions: sharedActions
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));

    const actionsDialog = await screen.findByRole("dialog", { name: "Repository Actions" });
    expect(actionsDialog.className).toContain("h-[min(760px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("max-h-[min(760px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("overflow-hidden");

    const scrollArea = screen.getByTestId("repository-actions-scroll-area");
    expect(scrollArea.className).toContain("h-full");
    expect(scrollArea.className).toContain("min-h-0");
    expect(screen.getByRole("button", { name: /14Action 14powershell/ })).toBeTruthy();
  });

  it("renders and runs configured repository actions", async () => {
    const user = userEvent.setup();
    const action = {
      name: "Build",
      description: "Compile the application",
      command: "npm run build",
      shell: "powershell" as const
    };
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [
          action
        ],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockResolvedValue({
      runId: "run-build",
      action: "Build",
      repoPath,
      exitCode: 0,
      stdout: "built\n",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.hover(await screen.findByRole("menuitem", { name: "Build" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("Compile the application");
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    await waitFor(() => {
      expect(githead.runConfiguredAction).toHaveBeenCalledWith({
        repoPath,
        name: "Build",
        operationId: expect.any(String)
      });
    });
    expect(screen.getByRole("tab", { name: "Activity Log" }).getAttribute("aria-selected")).toBe("true");
  });

  it("does not retarget a configured action when the repository changes during trust lookup", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingTrust = defer<{ trusted: boolean }>();
    const action = {
      name: "Build",
      description: "",
      command: "npm run build",
      shell: "powershell" as const
    };
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      actionsConfig: {
        hasGitheadDir: true,
        actions: [action],
        error: ""
      }
    }));
    vi.mocked(githead.getRepoTrust).mockReturnValue(pendingTrust.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    await waitFor(() => expect(githead.getRepoTrust).toHaveBeenCalledWith({ repoPath }));

    fireEvent.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true"));

    pendingTrust.resolve({ trusted: true });
    await flushRendererAsync();

    expect(githead.runConfiguredAction).not.toHaveBeenCalled();
  });

  it("shows configured action running and result headings", async () => {
    const user = userEvent.setup();
    const pendingAction = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [
          {
            name: "Build",
            description: "",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(pendingAction.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    expect(await screen.findByText("Build running")).toBeTruthy();

    pendingAction.resolve({
      runId: "run-build",
      action: "Build",
      repoPath,
      exitCode: 0,
      stdout: "built\n",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });
    await flushRendererAsync();

    expect(await screen.findByText("Build complete")).toBeTruthy();
  });

  it("recovers a lost configured action result and ignores its late completion", async () => {
    const user = userEvent.setup();
    const pendingAction = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(pendingAction.promise);
    vi.mocked(githead.getGitOperationStates).mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId) => ({ operationId, state: "not-found" }))
    ));

    render(<App />);
    await flushRendererAsync();
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("menuitem", { name: "Build" }));
    await flushRendererAsync();

    expect(screen.getByText("Build running")).toBeTruthy();
    const operationId = vi.mocked(githead.runConfiguredAction).mock.calls[0]?.[0].operationId;
    vi.mocked(githead.getRepoStatus).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await flushRendererAsync();

    expect(githead.getGitOperationStates).toHaveBeenCalledWith({ operationIds: [operationId] });
    expect(screen.queryByText("Build running")).toBeNull();
    expect(githead.getRepoStatus).toHaveBeenCalled();

    pendingAction.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(screen.queryByText("Build complete")).toBeNull();
  });

  it("runs repeated configured actions concurrently and tracks each completion", async () => {
    const user = userEvent.setup();
    const first = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    const second = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<App />);

    for (let index = 0; index < 2; index += 1) {
      await user.click(await screen.findByRole("button", { name: "Repository actions" }));
      await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    }

    expect(await screen.findByText("2 actions running")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repository actions" }).textContent).toContain("Actions 2");

    first.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(await screen.findByText("Build running")).toBeTruthy();

    second.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(await screen.findByText("Build complete")).toBeTruthy();
  });

  it("allows Fetch to start while a configured action is running", async () => {
    const user = userEvent.setup();
    const configured = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    const fetch = defer<Awaited<ReturnType<GitheadApi["runGitAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(configured.promise);
    vi.mocked(githead.runGitAction).mockReturnValue(fetch.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    await user.click(await screen.findByRole("button", { name: "Fetch" }));

    expect(githead.runGitAction).toHaveBeenCalledWith({ repoPath, action: "fetch", operationId: expect.any(String) });
    expect(screen.getByRole("button", { name: "Repository actions" }).hasAttribute("disabled")).toBe(false);

    fetch.resolve(createRunResult("fetch"));
    configured.resolve(createRunResult("Build"));
    await flushRendererAsync();
  });

  it("shows configured action errors without enabling execution", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [],
        error: "actions.toml: Action \"Build\" has an invalid shell."
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));

    expect(await screen.findByText("actions.toml: Action \"Build\" has an invalid shell.")).toBeTruthy();
    expect(githead.runConfiguredAction).not.toHaveBeenCalled();
  });

  it("shows local Repository Actions that override shared actions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            }
          ]
        },
        local: {
          exists: true,
          actions: [
            {
              name: "build",
              description: "",
              command: "npm run build:local",
              shell: "cmd"
            }
          ]
        },
        actions: [
          {
            name: "build",
            description: "",
            command: "npm run build:local",
            shell: "cmd"
          }
        ]
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));

    await user.click(screen.getByRole("tab", { name: /Local/ }));
    expect(await screen.findByText("Overrides Shared")).toBeTruthy();
  });

  it("saves reordered Repository Actions in file order", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            },
            {
              name: "Test",
              description: "",
              command: "npm test",
              shell: "bash"
            }
          ]
        }
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: /2Testbash/ }));
    await user.click(await screen.findByRole("button", { name: "Move Test up" }));
    await user.click(screen.getByRole("button", { name: "Save Shared" }));

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Test",
            description: "",
            command: "npm test",
            shell: "bash"
          },
          {
            name: "Build",
            description: "",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("shows blocked Repository Action files without enabling structured edits", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        local: {
          exists: true,
          writable: false,
          blockedReason: "This file contains comments. Edit it manually to preserve them.",
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            }
          ]
        }
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("tab", { name: /Local/ }));

    expect(await screen.findByText("This file contains comments. Edit it manually to preserve them.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add local action" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save Local" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("undoes draft Repository Action deletions before saving", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }]
        },
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }]
      }
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(await screen.findByRole("button", { name: "Delete Build" }));

    expect(screen.getByText("1 action removed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByDisplayValue("Build")).toBeTruthy();
    expect(screen.queryByText("1 action removed")).toBeNull();
  });

  it("warns before closing Repository Actions with unsaved changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Build");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog", { name: "Repository Actions" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Repository Actions" })).toBeNull();
  });

  it("closes and clears a repository action draft when an open picker switches repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Actions-B";
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Repository A Draft");

    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Repository Actions" })).toBeNull());

    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    expect(screen.queryByDisplayValue("Repository A Draft")).toBeNull();
  });

  it("refreshes File Status after active repository file changes", async () => {
    const changedFile = createStatusFile("src/App.tsx", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          changedFile
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    await waitForRepositoryWorkspace();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    emitRepoChanged();
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/App\.tsx/ })).toBeTruthy();
  });

  it("does not refresh File Status on idle timers", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("auto-fetches the active repository after the default interval", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("releases an old auto-fetch owner when the native picker switches repositories", async () => {
    vi.useFakeTimers();
    const nextRepoPath = "D:\\Work\\Picked";
    const pendingPicker = defer<string | null>();
    const pendingFetch = defer<GitRunResult>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingPicker.promise);
    vi.mocked(githead.runGitAction).mockReturnValue(pendingFetch.promise);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("button", { name: "Add existing" }));
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();
    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });

    await act(async () => {
      pendingPicker.resolve(nextRepoPath);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushRendererAsync();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(nextRepoPath);
    expect(screen.getByRole("button", { name: `Switch to ${nextRepoPath}` }).getAttribute("aria-current")).toBe("true");
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);

    pendingFetch.resolve(createRunResult("fetch", { repoPath }));
    await flushRendererAsync();

    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Fetch running")).toBeNull();
  });

  it("does not auto-fetch immediately on startup", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("refreshes repository state after a successful auto-fetch", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
  });

  it("keeps the auto-fetch countdown after an intervening repository refresh", async () => {
    vi.useFakeTimers();

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    emitRepoChanged();
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).toHaveBeenCalledWith({
      repoPath,
      action: "fetch",
      operationId: expect.any(String)
    });
  });

  it("does not auto-fetch while another repository operation is running", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/pending.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("lets the user cancel a pending repository operation", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/pending.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    const operationId = vi.mocked(githead.stageFiles).mock.calls[0]?.[0].operationId;
    expect(operationId).toEqual(expect.any(String));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId });
    expect((screen.getByRole("button", { name: "Cancelling" }) as HTMLButtonElement).disabled).toBe(true);
    pendingStage.resolve(createOperationResult({ exitCode: -1, stderr: "Operation was cancelled." }));
    await flushRendererAsync();
  });

  it("recovers stale operation state when cancellation reports it missing", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/stale.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/stale\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(screen.queryByRole("button", { name: "Dismiss Stale Status" })).toBeNull();
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("recovers a lost operation result from authoritative main-process state", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/lost-result.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.getGitOperationStates).mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId) => ({ operationId, state: "not-found" }))
    ));

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/lost-result\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    const operationId = vi.mocked(githead.stageFiles).mock.calls[0]?.[0].operationId;
    vi.mocked(githead.getRepoStatus).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await flushRendererAsync();

    expect(githead.getGitOperationStates).toHaveBeenCalledWith({ operationIds: [operationId] });
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(githead.getRepoStatus).toHaveBeenCalled();

    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps an operation locked when cancellation transport fails and permits a retry", async () => {
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/retry-cancel.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);
    vi.mocked(githead.cancelGitOperation)
      .mockRejectedValueOnce(new Error("Cancellation IPC failed."))
      .mockResolvedValueOnce({ accepted: true, state: "cancelling" });

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/retry-cancel\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flushRendererAsync();

    expect(screen.getByRole("alert").textContent).toContain("Cancellation IPC failed.");
    expect((screen.getByRole("button", { name: /^Fetch$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry Cancel" }));
    await flushRendererAsync();

    expect(githead.cancelGitOperation).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("button", { name: "Cancelling" }) as HTMLButtonElement).disabled).toBe(true);

    pendingStage.resolve(createOperationResult({ exitCode: -1, stderr: "Operation was cancelled." }));
    await flushRendererAsync();
  });

  it("does not start auto-fetch if an operation begins while trust is loading", async () => {
    vi.useFakeTimers();
    const pendingTrust = defer<{ trusted: boolean }>();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoTrust).mockReturnValueOnce(pendingTrust.promise);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/race.ts", {
          isUnstaged: true,
          worktreeStatus: "M"
        })
      ]
    }));
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    fireEvent.click(screen.getByRole("option", { name: /src\/race\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    pendingTrust.resolve({
      trusted: true
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("does not auto-fetch invalid repositories", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      isValid: false,
      validationErrors: [
        "Not a git repository."
      ],
      remotes: []
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("does not auto-fetch repositories without fetch capability", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      capabilities: {
        ...gitCapabilities(),
        fetch: false
      }
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("does not auto-fetch repositories without fetch remotes", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remotes: []
    }));

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("skips untrusted repositories during auto-fetch without prompting", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getRepoTrust).mockResolvedValue({
      trusted: false
    });

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Do you trust this workspace?" })).toBeNull();
  });

  it("does not auto-fetch when the interval is disabled", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 0,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false
    });

    render(<App />);
    await flushRendererAsync();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    await flushRendererAsync();

    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("refreshes File Status when the window is refocused", async () => {
    const changedFile = createStatusFile("src/focused.ts", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          changedFile
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/focused\.ts/ })).toBeTruthy();
  });

  it("does not repeatedly refresh while the window is already focused", async () => {
    render(<App />);
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);
  });

  it("defers file change refreshes until File Status is opened", async () => {
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockResolvedValue(createSummary({
        files: [
          createStatusFile("src/deferred.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }));

    render(<App />);
    await flushRendererAsync();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Commit History/ }), {
      button: 0
    });

    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /File Status/ }), {
      button: 0
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: /src\/deferred\.ts/ })).toBeTruthy();
  });

  it("ignores file change events for stale repositories", async () => {
    render(<App />);
    await flushRendererAsync();

    emitRepoChanged({
      repoPath: "D:\\Other"
    });
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);
  });

  it("coalesces file changes during an in-flight refresh into one trailing refresh", async () => {
    const pendingRefresh = defer<RepoSummary>();
    const largeFiles = Array.from({ length: 10_000 }, (_, index) => createStatusFile(
      `generated/live-${index.toString().padStart(5, "0")}.ts`,
      { isUnstaged: true, worktreeStatus: "M" }
    ));
    const finalFile = createStatusFile("src/final.ts", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    let activeSummaryCalls = 0;
    let maxActiveSummaryCalls = 0;
    vi.mocked(githead.getRepoSummary).mockImplementation(async () => {
      const call = vi.mocked(githead.getRepoSummary).mock.calls.length;
      activeSummaryCalls += 1;
      maxActiveSummaryCalls = Math.max(maxActiveSummaryCalls, activeSummaryCalls);
      try {
        if (call === 2) {
          return await pendingRefresh.promise;
        }
        return createSummary({
          files: call === 1 ? largeFiles : call === 3 ? [finalFile] : []
        });
      } finally {
        activeSummaryCalls -= 1;
      }
    });

    render(<App />);
    await flushRendererAsync();
    expect(screen.getAllByRole("option").length).toBeLessThan(100);
    const metadataCallsBeforeLiveUpdate = vi.mocked(githead.getRepoMetadata).mock.calls.length;
    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    emitRepoChanged();
    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    pendingRefresh.resolve(createSummary());
    await flushRendererAsync();

    expect(githead.getRepoSummary).toHaveBeenCalledTimes(3);
    expect(githead.getRepoMetadata).toHaveBeenCalledTimes(metadataCallsBeforeLiveUpdate);
    expect(maxActiveSummaryCalls).toBe(1);
    expect(screen.getByRole("option", { name: /src\/final\.ts/ })).toBeTruthy();
  });

  it("keeps file changes dirty instead of refreshing during repository operations", async () => {
    vi.useFakeTimers();
    const pendingStage = defer<GitOperationResult>();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [
          createStatusFile("src/pending.ts", {
            isUnstaged: true,
            worktreeStatus: "M"
          })
        ]
      }))
      .mockResolvedValue(createSummary());
    vi.mocked(githead.stageFiles).mockReturnValue(pendingStage.promise);

    render(<App />);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("option", { name: /src\/pending\.ts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Stage$/ }));
    await flushRendererAsync();

    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(1);

    pendingStage.resolve(createOperationResult());
    await flushRendererAsync();
  });

  it("loads recent repositories and starts on the most recent repo", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: `Switch to ${recentRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` })).toBeTruthy();
    expect(screen.queryByText(otherRepo)).toBeNull();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(recentRepo);
  });

  it("groups linked worktrees and opens an occupied branch in its workspace", async () => {
    const user = userEvent.setup();
    const linked = "D:\\Githead-feature";
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [
        { path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null },
        { path: linked, head: "def", branch: "feature/worktrees", isMain: false, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }
      ]
    }]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      branch: requestedRepoPath === linked ? "feature/worktrees" : "main",
      branches: [
        { name: "main", current: requestedRepoPath === repoPath, upstream: null, worktreePath: repoPath },
        { name: "feature/worktrees", current: requestedRepoPath === linked, upstream: null, worktreePath: linked }
      ]
    }));

    render(<App />);
    await waitForRepositoryWorkspace();
    const disclosure = await screen.findByRole("button", { name: "Expand worktrees for Githead" });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("feature/worktrees")).toBeNull();
    await user.click(disclosure);
    expect(await screen.findByText("feature/worktrees")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse worktrees for Githead" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Add worktree" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("menuitem", { name: /feature\/worktrees/ }));
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(linked));
    expect(githead.switchBranch).not.toHaveBeenCalled();
  });

  it("opens a repository's last-used worktree without expanding its worktree list", async () => {
    const user = userEvent.setup();
    const linked = "D:\\Githead-feature";
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: linked,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [
        { path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null },
        { path: linked, head: "def", branch: "feature/worktrees", isMain: false, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }
      ]
    }]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.addRepoRecent).mockResolvedValue([{ anchorPath: repoPath, lastUsedPath: linked }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    const disclosure = await screen.findByRole("button", { name: "Expand worktrees for Githead" });
    expect(screen.queryByText("feature/worktrees")).toBeNull();
    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));

    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(linked));
    expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: linked, anchorPath: repoPath });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("feature/worktrees")).toBeNull();
  });

  it("creates a new worktree with the guided sibling destination", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryGroups).mockResolvedValue([{
      id: "d:\\githead\\.git",
      kind: "git",
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [{ path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }]
    }]);

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add worktree" }));
    await user.type(screen.getByLabelText("Branch"), "feature/worktrees");
    await waitFor(() => expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("D:\\Githead-feature-worktrees"));
    await user.click(screen.getByRole("button", { name: "Create Worktree" }));

    await waitFor(() => expect(githead.createWorktree).toHaveBeenCalledWith({
      repoPath,
      mode: "new-branch",
      branchName: "feature/worktrees",
      destinationPath: "D:\\Githead-feature-worktrees",
      startPoint: "HEAD",
      track: false,
      operationId: expect.any(String)
    }));
  });

  it("does not switch to a created worktree after the user moves repositories during group reload", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Worktree-B";
    const destinationPath = "D:\\Githead-feature-late";
    const pendingGroupReload = defer<Awaited<ReturnType<GitheadApi["getRepositoryGroups"]>>>();
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    const groups = [{
      id: "d:\\githead\\.git",
      kind: "git" as const,
      anchorPath: repoPath,
      lastUsedPath: repoPath,
      recentPaths: [repoPath],
      commonDir: "D:\\Githead\\.git",
      error: "",
      worktrees: [{ path: repoPath, head: "abc", branch: "main", isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null }]
    }];
    let blockGroupReload = false;
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepositoryGroups).mockImplementation(() => (
      blockGroupReload ? pendingGroupReload.promise : Promise.resolve(groups)
    ));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: "Add worktree" }));
    await user.type(screen.getByLabelText("Branch"), "feature/late");
    await user.clear(screen.getByLabelText("Destination"));
    await user.type(screen.getByLabelText("Destination"), destinationPath);
    const groupCallsBeforeCreate = vi.mocked(githead.getRepositoryGroups).mock.calls.length;
    blockGroupReload = true;
    await user.click(screen.getByRole("button", { name: "Create Worktree" }));

    await waitFor(() => expect(githead.createWorktree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(githead.getRepositoryGroups).toHaveBeenCalledTimes(groupCallsBeforeCreate + 1));
    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));

    pendingGroupReload.resolve(groups);
    await flushRendererAsync();

    expect(vi.mocked(githead.getRepoSummary).mock.calls.some(([requestedRepoPath]) => requestedRepoPath === destinationPath)).toBe(false);
  });

  it("shows local push and pull counts beside recent repositories", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: recentRepo,
        ahead: 1,
        behind: 4
      }),
      createRepoSyncStatus({
        repoPath: otherRepo,
        behind: 2
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      statusLines: [
        "# branch.ab +1 -4"
      ]
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    const recentButton = await screen.findByRole("button", { name: `Switch to ${recentRepo}, 1 commit ahead, 4 commits behind` });
    const otherButton = screen.getByRole("button", { name: `Switch to ${otherRepo}, 2 commits behind` });
    expect(recentButton).toBeTruthy();
    expect(otherButton).toBeTruthy();
    expect(within(recentButton).getByText("1 ↑").classList.contains("is-ahead")).toBe(true);
    expect(within(recentButton).getByText("4 ↓").classList.contains("is-behind")).toBe(true);
    expect(within(otherButton).getByText("2 ↓").classList.contains("is-behind")).toBe(true);
  });

  it("shows VCS icons beside recent repositories", async () => {
    const loreRepo = "D:\\Work\\Story";
    const gitRepo = "D:\\Work\\Git";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(loreRepo, gitRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(loreRepo, gitRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: loreRepo,
        kind: "lore"
      }),
      createRepoSyncStatus({
        repoPath: gitRepo
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      kind: requestedRepoPath === loreRepo ? "lore" : "git"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    const repositories = within(screen.getByRole("region", { name: "Repositories" }));
    expect(repositories.getByLabelText("Lore repository")).toBeTruthy();
    expect(repositories.getByLabelText("Git repository")).toBeTruthy();
    expect(repositories.queryByText("Lore")).toBeNull();
  });

  it("leaves recent repository names unchanged when sync counts are zero or unavailable", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(recentRepo, otherRepo));
    vi.mocked(githead.getRepoSyncStatuses).mockResolvedValue([
      createRepoSyncStatus({
        repoPath: recentRepo
      }),
      createRepoSyncStatus({
        repoPath: otherRepo,
        isValid: false,
        error: "Selected folder is not a git repository."
      })
    ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.queryByText(/\d+ ↑|\d+ ↓/)).toBeNull();
  });

  it("shows the setup screen on first run without probing the old hard-coded fallback", async () => {
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByText("Select a repository to continue.")).toBeTruthy();
    await waitFor(() => {
      expect(githead.getRepoSummary).not.toHaveBeenCalled();
    });
    expect(screen.queryByDisplayValue("D:\\Githead")).toBeNull();
  });

  it("shows the setup screen when the initial recent repository is invalid", async () => {
    const invalidRepo = "D:\\MissingRepo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(invalidRepo));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      repoPath: invalidRepo,
      isValid: false,
      validationErrors: [
        "Selected folder is not a git repository."
      ]
    }));

    render(<App />);

    expect(await screen.findByText("Select a repository to continue.")).toBeTruthy();
    expect(screen.getByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByText("MissingRepo")).toBeTruthy();
    const recents = screen.getByRole("region", { name: "Repositories" });
    expect(within(recents).getByRole("button", { name: `Switch to ${invalidRepo}` })).toBeTruthy();
    expect(within(recents).queryByText(invalidRepo)).toBeNull();
  });

  it("shows a safe.directory prompt for an initial recent repository blocked by dubious ownership", async () => {
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(blockedRepo));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    expect(await screen.findByText("Git ownership check blocked this repository.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Git Exception" })).toBeTruthy();
    expect(screen.getByText("D:/Work/Blocked")).toBeTruthy();
  });

  it("switches repositories from a recent entry", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: otherRepo });
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Switch to ${repoPath}`,
      `Switch to ${otherRepo}`
    ]);
  });

  it("restores each repository's in-session commit history scope", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.getCommitHistory).mockImplementation(async ({ repoPath: requestedRepoPath, scope }) => [createCommit({
      hash: requestedRepoPath === repoPath ? "a".repeat(40) : "b".repeat(40),
      subject: `${scope} history for ${requestedRepoPath}`,
      refs: scope === "all" ? [{ name: "origin/feature", kind: "remote" }] : []
    })]);
    vi.mocked(githead.getCommitDetails).mockImplementation(async ({ hash }) => createCommitDetails(hash));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await user.click(screen.getByRole("button", { name: "All" }));
    await screen.findByText(`all history for ${repoPath}`);

    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await screen.findByText(`current history for ${otherRepo}`);
    expect(screen.getByRole("button", { name: "Current" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));
    await screen.findByText(`all history for ${repoPath}`);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(githead.getCommitHistory).toHaveBeenLastCalledWith(expect.objectContaining({
      repoPath,
      scope: "all"
    })));
  });

  it("keeps only the active Repository summary visible during rapid A to B to A switching", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingOther = defer<RepoSummary>();
    const pendingReturn = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        files: [createStatusFile("src/initial-a.ts", { isUnstaged: true, worktreeStatus: "M" })]
      }))
      .mockReturnValueOnce(pendingOther.promise)
      .mockReturnValueOnce(pendingReturn.promise);

    render(<App />);
    await screen.findByRole("option", { name: /src\/initial-a\.ts/ });

    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await user.click(screen.getByRole("button", { name: `Switch to ${repoPath}` }));
    expect(screen.getByRole("option", { name: /src\/initial-a\.ts/ })).toBeTruthy();
    pendingReturn.resolve(createSummary({
      files: [createStatusFile("src/final-a.ts", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    await screen.findByRole("option", { name: /src\/final-a\.ts/ });

    pendingOther.resolve(createSummary({
      repoPath: otherRepo,
      files: [createStatusFile("src/stale-b.ts", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    await flushRendererAsync();

    expect(screen.getByRole("button", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("option", { name: /src\/stale-b\.ts/ })).toBeNull();
    expect(vi.mocked(githead.getRepoSummary).mock.calls.map(([path]) => path)).toEqual([
      repoPath,
      otherRepo,
      repoPath
    ]);
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "identity:1" });
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "status:1" });
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "metadata:1" });
  });

  it("renders Repository identity before deferred File Status and metadata", async () => {
    const pendingStatus = defer<Awaited<ReturnType<GitheadApi["getRepoStatus"]>>>();
    const pendingMetadata = defer<Awaited<ReturnType<GitheadApi["getRepoMetadata"]>>>();
    vi.mocked(githead.getRepoIdentity).mockResolvedValue({ repoPath, generation: 1, kind: "git", capabilities: gitCapabilities(), isValid: true, branch: "fast/identity", hasHead: true, safeDirectory: null, validationErrors: [] });
    vi.mocked(githead.getRepoStatus).mockReturnValue(pendingStatus.promise);
    vi.mocked(githead.getRepoMetadata).mockReturnValue(pendingMetadata.promise);

    render(<App />);

    expect(await screen.findByText("fast/identity")).toBeTruthy();
    expect(screen.queryByRole("option", { name: /src\/later\.ts/ })).toBeNull();
    pendingStatus.resolve({ repoPath, generation: 1, statusLines: [], files: [createStatusFile("src/later.ts", { isUnstaged: true, worktreeStatus: "M" })] });
    pendingMetadata.resolve({ repoPath, generation: 1, upstream: null, branches: [], remotes: [], remoteBranches: [], defaultRemoteBranch: null, commitsAheadOfDefaultBranch: null, githubRepository: null, actionsConfig: createActionsConfig() });
    expect(await screen.findByRole("option", { name: /src\/later\.ts/ })).toBeTruthy();
  });

  it("ignores an unresolved diff from Repository A after switching to Repository B", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingDiff = defer<GitFileDiff>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      files: [createStatusFile(
        requestedRepoPath === repoPath ? "src/a.ts" : "src/b.ts",
        { isUnstaged: true, worktreeStatus: "M" }
      )]
    }));
    vi.mocked(githead.getFileDiff).mockReturnValue(pendingDiff.promise);

    render(<App />);
    await user.click(await screen.findByRole("option", { name: /src\/a\.ts/ }));
    expect(githead.getFileDiff).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await screen.findByRole("option", { name: /src\/b\.ts/ });

    pendingDiff.resolve(createTextDiff("src/a.ts", "stale-a-diff"));
    await flushRendererAsync();

    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText(/stale-a-diff/)).toBeNull();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);
    expect(githead.getFileDiff).toHaveBeenCalledTimes(1);
    expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: "diff:1" });
  });

  it("ignores stale Git identity after switching Repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingIdentity = defer<GitIdentitySettings>();
    const identity = (name: string): GitIdentitySettings => ({
      scope: "repository",
      name,
      email: `${name.toLowerCase()}@example.test`,
      repository: { name, email: `${name.toLowerCase()}@example.test` },
      global: { name: "Global", email: "global@example.test" }
    });
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));
    vi.mocked(githead.getGitIdentity).mockImplementation(async (requestedRepoPath) => {
      if (!requestedRepoPath) return identity("Empty");
      if (requestedRepoPath === repoPath) return pendingIdentity.promise;
      return identity("Repository B");
    });

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await waitFor(() => expect(githead.getGitIdentity).toHaveBeenCalledWith(otherRepo));
    pendingIdentity.resolve(identity("Stale Repository A"));
    await flushRendererAsync();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Git Identity" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Repository B");
  });

  it("removes a recent entry without switching repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.removeRepoRecent).mockResolvedValue(repositoryRecents(repoPath));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.getRepoSummary).mockClear();
    await user.click(screen.getByRole("button", { name: `Remove ${otherRepo} from recent repositories` }));

    await waitFor(() => {
      expect(githead.removeRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
    expect(screen.getByRole("button", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("reorders repositories with the keyboard handle", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repositoryRecents(...repoPaths));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Reorder ${otherRepo}` }));
    await user.keyboard("{ArrowUp}");

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Switch to ${otherRepo}`,
      `Switch to ${repoPath}`
    ]);
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("reorders repositories with drag and drop", async () => {
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repositoryRecents(...repoPaths));

    render(<App />);

    await waitForRepositoryWorkspace();
    const dragHandle = screen.getByRole("button", { name: `Reorder ${otherRepo}` });
    const targetRow = screen.getByRole("button", { name: `Switch to ${repoPath}` }).closest(".repo-recent-row");
    if (!targetRow) {
      throw new Error("Expected repository row.");
    }

    vi.spyOn(targetRow, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 260,
      bottom: 40,
      width: 260,
      height: 40,
      toJSON: () => ({})
    });
    fireEvent.mouseDown(dragHandle);
    fireEvent.mouseUp(targetRow, { clientY: 1 });

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("rolls back repository order when reordering fails", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.reorderRepoRecents).mockRejectedValue(new Error("Unable to save order."));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Reorder ${otherRepo}` }));
    await user.keyboard("{ArrowUp}");

    await waitFor(() => {
      expect(githead.reorderRepoRecents).toHaveBeenCalledWith([
        otherRepo,
        repoPath
      ]);
    });
    await waitFor(() => {
      const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
        name: /^Switch to /
      });
      expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
        `Switch to ${repoPath}`,
        `Switch to ${otherRepo}`
      ]);
    });
  });

  it("shows a recent repository in Explorer from the context menu", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));

    render(<App />);

    await waitForRepositoryWorkspace();
    fireEvent.contextMenu(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    expect(await screen.findByText(otherRepo)).toBeTruthy();
    await user.click(await screen.findByRole("menuitem", { name: "Show in Explorer" }));

    await waitFor(() => {
      expect(githead.showRepositoryInExplorer).toHaveBeenCalledWith(otherRepo);
    });
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("adds a ninth browsed repository to the bottom and reveals its active row", async () => {
    const user = userEvent.setup();
    const browsedRepo = "D:\\Work\\Browsed";
    const existingRepos = [
      repoPath,
      ...Array.from({ length: 7 }, (_value, index) => `D:\\Work\\Existing${index + 1}`)
    ];
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(...existingRepos));
    vi.mocked(githead.chooseRepo).mockResolvedValue(browsedRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) =>
      repositoryRecents(...(request.repoPath === repoPath ? existingRepos : [...existingRepos, request.repoPath]))
    );

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    scrollIntoView.mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${browsedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: browsedRepo });
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      ...existingRepos.map((existingRepo) => `Switch to ${existingRepo}`),
      `Switch to ${browsedRepo}`
    ]);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest"
    });
  });

  it("does not add an invalid browsed repository to repositories", async () => {
    const user = userEvent.setup();
    const invalidRepo = "D:\\NotARepo";
    vi.mocked(githead.chooseRepo).mockResolvedValue(invalidRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      isValid: requestedRepoPath !== invalidRepo,
      validationErrors: requestedRepoPath === invalidRepo ? [
        "Selected folder is not a git repository."
      ] : []
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    expect(await screen.findByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByText(invalidRepo)).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(invalidRepo);
  });

  it("shows a safe.directory prompt for a browsed repository blocked by dubious ownership", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));

    expect(await screen.findByText("Git ownership check blocked this repository.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Git Exception" })).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(blockedRepo);
  });

  it("does not add a safe.directory exception when the prompt is canceled", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    expect(screen.getByRole("heading", { name: "Allow Git Ownership Exception?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(githead.addSafeDirectory).not.toHaveBeenCalled();
    });
  });

  it("recovers a stale safe.directory operation from its dialog", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    const pendingAdd = defer<GitOperationResult>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));
    vi.mocked(githead.addSafeDirectory).mockReturnValue(pendingAdd.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValue({ accepted: false, state: "not-found" });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    const operationId = vi.mocked(githead.addSafeDirectory).mock.calls[0]?.[0].operationId;
    expect(operationId).toEqual(expect.any(String));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Allow Git Ownership Exception?" })).toBeNull());

    pendingAdd.resolve(createOperationResult({ repoPath: blockedRepo }));
    await flushRendererAsync();
  });

  it("adds a safe.directory exception, refreshes, and adds the repository to recents", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSafeDirectorySummary(blockedRepo))
      .mockResolvedValueOnce(createSummary({
        repoPath: blockedRepo
      }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    await waitForRepositoryWorkspace();
    expect(githead.addSafeDirectory).toHaveBeenCalledWith({
      repoPath: "D:/Work/Blocked",
      operationId: expect.any(String)
    });
    expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: blockedRepo });
  });

  it("keeps setup visible and shows the config error when safe.directory cannot be added", async () => {
    const user = userEvent.setup();
    const blockedRepo = "D:\\Work\\Blocked";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.chooseRepo).mockResolvedValue(blockedRepo);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));
    vi.mocked(githead.addSafeDirectory).mockResolvedValue(createOperationResult({
      repoPath: "D:/Work/Blocked",
      exitCode: 1,
      stderr: "error: could not lock config file"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.click(screen.getByRole("button", { name: "Browse for Repository" }));
    await user.click(await screen.findByRole("button", { name: "Allow Git Exception" }));
    await user.click(screen.getByRole("button", { name: "Allow Exception" }));

    expect(await screen.findByText("error: could not lock config file")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(blockedRepo);
  });

  it("clones a repository, validates the result, and adds it to repositories", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: clonedRepo,
      stdout: "Repository cloned."
    }));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) => repositoryRecents(request.repoPath));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "",
        depth: null,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: clonedRepo });
    });
  });

  it("keeps the setup screen open when cloning fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo",
      exitCode: 1,
      stderr: "fatal: authentication failed"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith("D:\\Work\\repo");
  });

  it("passes branch and depth options when cloning", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "git@github.com:openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.type(screen.getByLabelText("Branch"), "main");
    await user.type(screen.getByLabelText("Depth"), "1");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "git@github.com:openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "main",
        depth: 1,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
  });

  it("checks repository access, reports success, and populates branch choices", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "https://github.com/openai/repo.git",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [
        "develop",
        "main"
      ],
      defaultBranch: "main"
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(githead.checkRepositoryAccess).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        operationId: expect.any(String)
      });
    });
    expect(await screen.findByText("Repository is accessible.")).toBeTruthy();
    expect((screen.getByLabelText("Branch") as HTMLInputElement).value).toBe("main");

    await user.click(screen.getByRole("button", { name: "Choose branch" }));
    await user.click(screen.getByText("develop"));

    expect((screen.getByLabelText("Branch") as HTMLInputElement).value).toBe("develop");
  });

  it("preserves a manually typed branch after a successful repository check", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "git@github.com:openai/repo.git",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [
        "main"
      ],
      defaultBranch: "main"
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "git@github.com:openai/repo.git");
    await user.type(screen.getByLabelText("Branch"), "release");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Repository is accessible.")).toBeTruthy();
    expect((screen.getByLabelText("Branch") as HTMLInputElement).value).toBe("release");
  });

  it("shows repository check failures and clears them when the source changes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "https://github.com/openai/private.git",
      exitCode: 1,
      stdout: "",
      stderr: "fatal: authentication failed",
      branches: [],
      defaultBranch: null
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    const sourceInput = screen.getByLabelText("Repository URL or path");
    await user.type(sourceInput, "https://github.com/openai/private.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    await user.type(sourceInput, "-copy");

    const exitingMessage = screen.getByText("fatal: authentication failed").closest(".motion-presence");
    expect(exitingMessage?.getAttribute("data-motion-state")).toBe("exiting");
    expect(exitingMessage?.getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(screen.queryByText("fatal: authentication failed")).toBeNull());
  });

  it("releases the clone latch before the cloned repository refresh settles", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    const pendingRefresh = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({ repoPath: clonedRepo }));
    vi.mocked(githead.getRepoSummary).mockImplementation((requestedRepoPath) => requestedRepoPath === clonedRepo
      ? pendingRefresh.promise
      : Promise.resolve(createSummary({ repoPath: requestedRepoPath })));

    render(<App />);
    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.getRepoSummary).toHaveBeenCalledWith(clonedRepo);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    await flushRendererAsync();
    expect((screen.getByRole("button", { name: "Add existing" }) as HTMLButtonElement).disabled).toBe(false);

    pendingRefresh.resolve(createSummary({ repoPath: clonedRepo }));
    await flushRendererAsync();
  });

  it("disables clone actions while checking repository access", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    let resolveCheck: (value: Awaited<ReturnType<GitheadApi["checkRepositoryAccess"]>>) => void = () => undefined;
    vi.mocked(githead.checkRepositoryAccess).mockReturnValue(new Promise((resolve) => {
      resolveCheck = resolve;
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect((await screen.findByRole("button", { name: "Checking" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Clone Repository" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveCheck({
        source: "https://github.com/openai/repo.git",
        exitCode: 0,
        stdout: "",
        stderr: "",
        branches: [],
        defaultBranch: null
      });
    });
  });

  it("defaults clone depth to 0 and sends a full-clone request", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    expect((screen.getByLabelText("Depth") as HTMLInputElement).value).toBe("0");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith(expect.objectContaining({
        depth: null,
        operationId: expect.any(String)
      }));
    });
  });

  it("opens repository add choices from the repository sidebar", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));

    expect(screen.getByRole("button", { name: "Add existing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clone new" })).toBeTruthy();
    expect(screen.queryByLabelText("Repository URL or path")).toBeNull();
  });

  it("opens the clone form from the repository add popout", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));

    expect(screen.getByRole("heading", { name: "Clone repository" })).toBeTruthy();
    expect(screen.getByLabelText("Repository URL or path")).toBeTruthy();
    expect(screen.getByLabelText("Destination folder")).toBeTruthy();
  });

  it("clones from the sidebar popout, switches repositories, and resets the clone draft", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: clonedRepo,
      stdout: "Repository cloned."
    }));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) => repositoryRecents(repoPath, request.repoPath));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "",
        depth: null,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: clonedRepo });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Repository URL or path")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    expect((screen.getByLabelText("Repository URL or path") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Depth") as HTMLInputElement).value).toBe("0");
  });

  it("keeps the sidebar clone popout open when cloning fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo",
      exitCode: 1,
      stderr: "fatal: authentication failed"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Clone repository" })).toBeTruthy();
    expect(screen.getByLabelText("Repository URL or path")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith("D:\\Work\\repo");
  });

  it("ignores stale repository summaries when switching quickly", async () => {
    const user = userEvent.setup();
    const firstRepo = "D:\\Work\\First";
    const secondRepo = "D:\\Work\\Second";
    const firstSummary = defer<RepoSummary>();
    const secondSummary = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, firstRepo, secondRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, firstRepo, secondRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation((requestedRepoPath) => {
      if (requestedRepoPath === firstRepo) {
        return firstSummary.promise;
      }
      if (requestedRepoPath === secondRepo) {
        return secondSummary.promise;
      }

      return Promise.resolve(createSummary({
        repoPath: requestedRepoPath,
        branch: "main"
      }));
    });

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${firstRepo}` }));
    await user.click(screen.getByRole("button", { name: `Switch to ${secondRepo}` }));

    secondSummary.resolve(createSummary({
      repoPath: secondRepo,
      branch: "second"
    }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${secondRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    expect(await screen.findByText("second")).toBeTruthy();

    firstSummary.resolve(createSummary({
      repoPath: firstRepo,
      branch: "first"
    }));
    await waitFor(() => {
      expect(screen.queryByText("first")).toBeNull();
    });
  });

  it("switches branches from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branches: [
        {
          name: "main",
          current: true,
          upstream: "origin/main"
        },
        {
          name: "feature/nav",
          current: false,
          upstream: null
        }
      ]
    }));

    render(<App />);

    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("menuitem", { name: /feature\/nav/ }));

    await waitFor(() => {
      expect(githead.switchBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/nav",
        operationId: expect.any(String)
      });
    });
  });

  it("creates a branch from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Create branch" }));
    await user.type(await screen.findByLabelText("Branch name"), "feature/new");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(githead.createBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/new",
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the branch dialog open when branch creation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.createBranch).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Branch already exists."
    });

    render(<App />);

    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Create branch" }));
    await user.type(await screen.findByLabelText("Branch name"), "main");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Branch already exists.")).toBeTruthy();
    expect(screen.getByLabelText("Branch name")).toBeTruthy();
  });

  it("changes the current branch upstream from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature",
          remote: "origin",
          branch: "feature"
        }
      ]
    }));

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("radio", { name: /origin\/feature/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.setBranchUpstream).toHaveBeenCalledWith({
        repoPath,
        branchName: "main",
        upstream: "origin/feature",
        operationId: expect.any(String)
      });
    });
  });

  it("clears the current branch upstream from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("radio", { name: /No upstream/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.setBranchUpstream).toHaveBeenCalledWith({
        repoPath,
        branchName: "main",
        upstream: null,
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the upstream dialog open when changing upstream fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature",
          remote: "origin",
          branch: "feature"
        }
      ]
    }));
    vi.mocked(githead.setBranchUpstream).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Unable to set upstream."
    });

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("radio", { name: /origin\/feature/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Unable to set upstream.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /origin\/feature/ })).toBeTruthy();
  });

  it("saves OpenRouter settings with a commit message prompt instead of site attribution fields", async () => {
    const user = userEvent.setup();
    const savedSettings = createAiSettings("openrouter", {
      providers: {
        ...createAiSettings().providers,
        openrouter: {
          model: "openrouter/auto",
          prDescriptionModel: "",
          reasoningEffort: "low",
          prDescriptionReasoningEffort: "low",
          hasApiKey: true
        }
      },
      commitMessagePrompt: "Write concise commit messages."
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(savedSettings);
    vi.mocked(githead.saveAiSettings).mockResolvedValue(savedSettings);

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.queryByLabelText("Site URL")).toBeNull();
    expect(screen.queryByLabelText("Site Title")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "AI" }));

    const prompt = await screen.findByLabelText("Commit Message Prompt");
    expect(prompt).toBeTruthy();

    await user.clear(screen.getByLabelText("OpenRouter API Key"));
    await user.type(screen.getByLabelText("OpenRouter API Key"), "sk-or-key");
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "openrouter/auto");
    await user.clear(prompt);
    await user.type(prompt, "Write a single-line commit message.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAiSettings).toHaveBeenCalledWith({
        selectedProvider: "openrouter",
        providerModels: {
          openrouter: "openrouter/auto",
          openai: defaultProviderModels.openai,
          "codex-cli": defaultProviderModels["codex-cli"],
          anthropic: defaultProviderModels.anthropic,
          "claude-code": defaultProviderModels["claude-code"]
        },
        prDescriptionModels: {
          openrouter: "",
          openai: "",
          "codex-cli": "",
          anthropic: "",
          "claude-code": ""
        },
        reasoningEfforts: {
          openrouter: "low",
          openai: "low",
          "codex-cli": "low",
          anthropic: "low",
          "claude-code": "low"
        },
        prDescriptionReasoningEfforts: {
          openrouter: "low",
          openai: "low",
          "codex-cli": "low",
          anthropic: "low",
          "claude-code": "low"
        },
        apiKeys: {
          openrouter: "sk-or-key"
        },
        clearApiKeys: {
          openrouter: false
        },
        commitMessagePrompt: "Write a single-line commit message.",
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT
      });
    });
    expect(githead.saveAppSettings).not.toHaveBeenCalled();
  });

  it("resets commit and pull request prompts to their defaults", async () => {
    const user = userEvent.setup();
    const savedSettings = createAiSettings("openrouter", {
      commitMessagePrompt: "Use a custom commit message prompt.",
      prDescriptionPrompt: "Use a custom pull request prompt."
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(savedSettings);
    vi.mocked(githead.saveAiSettings).mockResolvedValue({
      ...savedSettings,
      commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
      prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    await user.click(screen.getByRole("button", { name: "Reset commit message prompt to default" }));
    await user.click(screen.getByRole("button", { name: "Reset pr description prompt to default" }));

    expect((screen.getByLabelText("Commit Message Prompt") as HTMLTextAreaElement).value).toBe(DEFAULT_COMMIT_MESSAGE_PROMPT);
    expect((screen.getByLabelText("PR Description Prompt") as HTMLTextAreaElement).value).toBe(DEFAULT_PR_DESCRIPTION_PROMPT);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({
        commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT
      }));
    });
  });

  it("shows provider selection and CLI provider status in AI settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const provider = await screen.findByLabelText("Provider");
    expect(provider).toBeTruthy();
    await user.selectOptions(provider, "claude-code");

    expect(await screen.findByText("Claude Code status")).toBeTruthy();
    expect(screen.getByText("Claude Code was not detected.")).toBeTruthy();
  });

  it("checks out a fetched remote branch from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [{ name: "origin/feature/review", remote: "origin", branch: "feature/review" }]
    }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("menuitem", { name: /feature\/review.*origin/ }));
    await waitFor(() => expect(githead.checkoutRemoteBranch).toHaveBeenCalledWith({
      repoPath, branchName: "feature/review", remoteBranch: "origin/feature/review", operationId: expect.any(String)
    }));
  });

  it("hides only remote branches already tracked by a local branch", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branches: [
        { name: "main", current: true, upstream: "origin/main" },
        { name: "release", current: false, upstream: "upstream/release" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/release", remote: "origin", branch: "release" }
      ]
    }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    expect(screen.queryByRole("menuitem", { name: /main.*origin/ })).toBeNull();
    expect(await screen.findByRole("menuitem", { name: /release.*origin/ })).toBeTruthy();
  });

  it("manages branches and explains safe-delete refusals", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ branches: [
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/old", current: false, upstream: "origin/feature/old" }
    ] }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Branches…" }));
    expect(screen.getByRole("button", { name: "Delete main" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Rename feature/old" }));
    const input = screen.getByLabelText("New name");
    await user.clear(input);
    await user.type(input, "feature/new");
    await user.click(screen.getByRole("button", { name: "Rename Branch" }));
    await waitFor(() => expect(githead.renameBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", newBranchName: "feature/new", operationId: expect.any(String) }));
    vi.mocked(githead.deleteBranch).mockResolvedValue({
      repoPath,
      exitCode: 1,
      stdout: "",
      stderr: "error: the branch 'feature/old' is not fully merged\nhint: run git branch -D feature/old"
    });
    await user.click(await screen.findByRole("button", { name: "Delete feature/old" }));
    await user.click(screen.getByRole("button", { name: "Delete Branch" }));
    expect(githead.deleteBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", force: false, operationId: expect.any(String) });
    expect(await screen.findByText("This branch has commits that haven’t been merged. Merge them into another branch before deleting it.")).toBeTruthy();
    expect(screen.queryByText(/git branch -D/)).toBeNull();
    vi.mocked(githead.deleteBranch).mockResolvedValue({ repoPath, exitCode: 0, stdout: "", stderr: "" });
    await user.click(screen.getByRole("checkbox", { name: /Force delete/ }));
    await user.click(screen.getByRole("button", { name: "Force Delete Branch" }));
    await waitFor(() => expect(githead.deleteBranch).toHaveBeenLastCalledWith({ repoPath, branchName: "feature/old", force: true, operationId: expect.any(String) }));
  });

  it("shows model-aware reasoning controls and a separate PR description effort", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAiReasoningCapabilities).mockResolvedValue({
      status: "supported",
      supportedEfforts: ["low", "medium", "high"]
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const reasoning = await screen.findByLabelText("Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(reasoning.disabled).toBe(false));
    expect(reasoning.value).toBe("low");
    await user.selectOptions(reasoning, "medium");

    await user.type(screen.getByLabelText("PR Description Model"), "openai/gpt-5.4-nano");
    const prReasoning = await screen.findByLabelText("PR Description Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(prReasoning.disabled).toBe(false));
    await user.selectOptions(prReasoning, "high");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({
      reasoningEfforts: expect.objectContaining({ openai: "medium" }),
      prDescriptionReasoningEfforts: expect.objectContaining({ openai: "high" })
    })));
  });

  it("disables reasoning when the selected model is unsupported", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAiReasoningCapabilities).mockResolvedValue({
      status: "unsupported",
      supportedEfforts: []
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const reasoning = await screen.findByLabelText("Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText("This model does not support configurable reasoning.")).toBeTruthy());
    expect(reasoning.disabled).toBe(true);
  });

  it("ignores stale reasoning capability responses after the model changes", async () => {
    const user = userEvent.setup();
    const initial = defer<AiReasoningCapabilities>();
    const updated = defer<AiReasoningCapabilities>();
    vi.mocked(githead.getAiReasoningCapabilities).mockImplementation(({ model }) => (
      model === defaultProviderModels.openrouter ? initial.promise : updated.promise
    ));

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));
    await waitFor(() => expect(githead.getAiReasoningCapabilities).toHaveBeenCalledTimes(1));

    const model = screen.getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "vendor/new-model");
    await waitFor(() => expect(githead.getAiReasoningCapabilities).toHaveBeenCalledTimes(2));

    updated.resolve({ status: "supported", supportedEfforts: ["high"] });
    await waitFor(() => expect((screen.getByLabelText("Reasoning") as HTMLSelectElement).value).toBe("high"));
    initial.resolve({ status: "unsupported", supportedEfforts: [] });
    await act(async () => Promise.resolve());

    expect((screen.getByLabelText("Reasoning") as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByText("This model does not support configurable reasoning.")).toBeNull();
  });

  it("shows Git Identity and AI settings sections and saves identity fields", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitIdentity).mockResolvedValue({
      scope: "global",
      name: "Existing User",
      email: "existing@example.test",
      repository: {
        name: "",
        email: ""
      },
      global: {
        name: "Existing User",
        email: "existing@example.test"
      }
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await waitFor(() => {
      expect(githead.getGitIdentity).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const settingsDialog = screen.getByRole("dialog", { name: "Settings" });
    expect(settingsDialog.className).toContain("sm:max-w-[880px]");
    expect(settingsDialog.className).toContain("h-[min(780px,calc(100vh-2rem))]");
    expect(settingsDialog.className).toContain("overflow-clip");
    expect(screen.getByRole("tab", { name: "Appearance", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Git Identity", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sync", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "AI", selected: false })).toBeTruthy();
    await screen.findByText("Git Identity", {
      selector: "h2"
    });
    expect(screen.queryByText("Provider settings for generated commit messages.")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("10");
    await user.click(screen.getByRole("tab", { name: "AI" }));
    expect(await screen.findByText("Configure providers and instructions for generated Git content.")).toBeTruthy();
    const prompt = screen.getByLabelText("Commit Message Prompt");
    expect(prompt.className).toContain("field-sizing-fixed");
    expect(prompt.className).toContain("min-h-44");
    await user.click(screen.getByRole("tab", { name: "Git Identity" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Taylor");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "taylor@example.test");
    await user.click(screen.getByRole("radio", { name: "This repository" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveGitIdentity).toHaveBeenCalledWith({
        repoPath,
        name: "Taylor",
        email: "taylor@example.test",
        scope: "repository",
        operationId: expect.any(String)
      });
    });
  });

  it("saves the auto-fetch interval from Sync settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Sync" }));

    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "15");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAppSettings).toHaveBeenCalledWith({
        autoFetchIntervalMinutes: 15,
        colorTheme: "githead",
        appearanceMode: "system",
        uiFont: "inter",
        codeFont: "system-mono",
        zoomFactor: 1,
        statusFileViewMode: "list",
        wrapDiffLines: false
      });
    });
  });

  it("recovers an unregistered settings save and does not start later save phases", async () => {
    const user = userEvent.setup();
    const pendingAiSave = defer<AiSettings>();
    vi.mocked(githead.saveAiSettings).mockReturnValue(pendingAiSave.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));
    const model = screen.getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "vendor/detached-model");
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "15");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(githead.saveAiSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Cancel operation" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: expect.any(String) }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    pendingAiSave.resolve(createAiSettings());
    await flushRendererAsync();

    expect(githead.saveAppSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("owns settings trust preflight so recovery cannot start a late identity save", async () => {
    const user = userEvent.setup();
    const pendingTrust = defer<{ trusted: boolean }>();
    vi.mocked(githead.getRepoTrust).mockReturnValueOnce(pendingTrust.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const name = screen.getByLabelText("Name");
    await user.type(name, "Late Identity");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(githead.getRepoTrust).toHaveBeenCalledWith({ repoPath }));

    await user.click(screen.getByRole("button", { name: "Cancel operation" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    pendingTrust.resolve({ trusted: true });
    await flushRendererAsync();

    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
  });

  it("protects unsaved settings and keeps drafts while navigating categories", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Sync" }));
    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "20");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);

    await user.click(screen.getByRole("tab", { name: "AI" }));
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("20");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("20");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("closes settings and drops repository identity drafts when an open picker switches repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Settings-B";
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Name"), "Repository A Draft");

    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).not.toContain("Repository A Draft");
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
  });

  it("previews, restores, and saves accessible color themes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("githead"));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const themes = within(screen.getByRole("group", { name: "Color theme" })).getAllByRole("radio");
    expect(themes).toHaveLength(12);
    expect((screen.getByRole("radio", { name: /Githead/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);

    for (const theme of ["Copper", "Sakura", "Midnight"] as const) {
      await user.click(screen.getByRole("radio", { name: new RegExp(theme) }));
      expect(document.documentElement.dataset.theme).toBe(theme.toLowerCase());
      expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);
      expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    }

    await user.click(screen.getByRole("radio", { name: /Tidepool/ }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("tidepool");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(document.documentElement.dataset.theme).toBe("githead");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("radio", { name: /Ember/ }));
    await user.click(screen.getByRole("radio", { name: "Light" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith({
      autoFetchIntervalMinutes: 10,
      colorTheme: "ember",
      appearanceMode: "light",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false
    }));
  });

  it("previews, restores, and saves interface and code fonts", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const uiFont = screen.getByLabelText("Interface font") as HTMLSelectElement;
    const codeFont = screen.getByLabelText("Code font") as HTMLSelectElement;
    expect(uiFont.options).toHaveLength(4);
    expect(codeFont.options).toHaveLength(5);

    await user.selectOptions(uiFont, "ibm-plex-sans");
    await user.selectOptions(codeFont, "jetbrains-mono");
    expect(document.documentElement.dataset.uiFont).toBe("ibm-plex-sans");
    expect(document.documentElement.dataset.codeFont).toBe("jetbrains-mono");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(document.documentElement.dataset.uiFont).toBe("inter");
    expect(document.documentElement.dataset.codeFont).toBe("system-mono");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.selectOptions(screen.getByLabelText("Interface font"), "roboto");
    await user.selectOptions(screen.getByLabelText("Code font"), "source-code-pro");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith(expect.objectContaining({
      uiFont: "roboto",
      codeFont: "source-code-pro"
    })));
  });

  it("previews, restores, and saves every notched interface scale", async () => {
    const user = userEvent.setup();
    const defaultAiSettings = createAiSettings();
    const unconfiguredAiSettings = createAiSettings("openrouter", {
      providers: {
        ...defaultAiSettings.providers,
        openrouter: {
          ...defaultAiSettings.providers.openrouter,
          hasApiKey: false
        }
      }
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(unconfiguredAiSettings);
    vi.mocked(githead.saveAiSettings).mockRejectedValue(new Error("Enter an OpenRouter API key."));
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const slider = screen.getByRole("slider", { name: "Interface scale" }) as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("8");
    expect(slider.step).toBe("1");
    expect(slider.getAttribute("aria-valuetext")).toBe("100%");

    const factors = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    for (const [index, factor] of factors.entries()) {
      fireEvent.change(slider, { target: { value: String(index) } });
      await waitFor(() => expect(githead.setWindowZoomFactor).toHaveBeenLastCalledWith(factor));
    }
    expect(slider.getAttribute("aria-valuetext")).toBe("200%");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(githead.setWindowZoomFactor).toHaveBeenLastCalledWith(1));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    fireEvent.change(screen.getByRole("slider", { name: "Interface scale" }), { target: { value: "5" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith(expect.objectContaining({
      zoomFactor: 1.25
    })));
    expect(githead.saveAiSettings).not.toHaveBeenCalled();
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
  });

  it("opens remote management from the sidebar and adds a local remote without fetching", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ remotes: [], upstream: null, remoteBranches: [] }));
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));

    expect(await screen.findByRole("dialog", { name: "Manage Remotes" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add Remote" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("origin");
    await user.type(screen.getByLabelText("URL"), "https://example.test/project.git");
    await user.click(screen.getByRole("button", { name: "Add Remote" }));

    await waitFor(() => expect(githead.addRemote).toHaveBeenCalledWith({
      repoPath,
      name: "origin",
      url: "https://example.test/project.git",
      operationId: expect.any(String)
    }));
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("protects advanced remote URLs while retaining rename and remove actions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([
      {
        name: "origin",
        fetchUrls: ["https://example.test/repo.git", "https://mirror.test/repo.git"],
        pushUrls: ["git@example.test:project/repo.git"],
        trackedBranches: ["main"]
      }
    ]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));

    expect(await screen.findByText("Advanced")).toBeTruthy();
    expect(screen.getByText("https://mirror.test/repo.git")).toBeTruthy();
    expect(screen.getByText("git@example.test:project/repo.git")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit URL" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains branch and GitHub impact before removing origin", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      githubRepository: {
        owner: "warheadent",
        name: "Githead",
        fullName: "warheadent/Githead",
        webUrl: "https://github.com/warheadent/Githead"
      }
    }));
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([
      {
        name: "origin",
        fetchUrls: ["https://github.com/warheadent/Githead.git"],
        pushUrls: [],
        trackedBranches: ["main", "feature/nav"]
      }
    ]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(screen.getByText("Branch tracking will be cleared")).toBeTruthy();
    expect(screen.getByText(/branches main, feature\/nav/)).toBeTruthy();
    expect(screen.getByText("GitHub views will be disconnected")).toBeTruthy();
    expect(githead.removeRemote).not.toHaveBeenCalled();
  });
});

function createGitheadMock(): GitheadApi {
  const okOperation: GitOperationResult = {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
  const aiSettings = createAiSettings("openai", {
    providers: {
      ...createAiSettings().providers,
      openai: {
        model: "openai/gpt-5-mini",
        prDescriptionModel: "",
        reasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      }
    }
  });
  const appSettings: AppSettings = {
    autoFetchIntervalMinutes: 10,
    colorTheme: "githead",
    appearanceMode: "system",
    uiFont: "inter",
    codeFont: "system-mono",
    zoomFactor: 1,
    statusFileViewMode: "list",
    wrapDiffLines: false
  };
  const gitIdentity: GitIdentitySettings = {
    scope: "repository",
    name: "",
    email: "",
    repository: {
      name: "",
      email: ""
    },
    global: {
      name: "",
      email: ""
    }
  };
  const progressiveSummaries = new Map<string, { promise: Promise<RepoSummary>; uses: number }>();
  const progressiveSummary = (request: { repoPath: string; generation: number }): Promise<RepoSummary> => {
    const key = `${request.repoPath.toLocaleLowerCase()}\0${request.generation}`;
    let entry = progressiveSummaries.get(key);
    if (!entry) {
      entry = { promise: Promise.resolve().then(() => githead.getRepoSummary(request.repoPath)), uses: 0 };
      progressiveSummaries.set(key, entry);
    }
    entry.uses += 1;
    if (entry.uses >= 3) progressiveSummaries.delete(key);
    return entry.promise;
  };

  return {
    chooseRepo: vi.fn().mockResolvedValue(null),
    chooseCloneParent: vi.fn().mockResolvedValue(null),
    chooseWorktreeParent: vi.fn().mockResolvedValue(null),
    getRepoSummary: vi.fn().mockResolvedValue(createSummary()),
    getRepoIdentity: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, kind: summary.kind, capabilities: summary.capabilities, isValid: summary.isValid, branch: summary.branch, hasHead: summary.hasHead, safeDirectory: summary.safeDirectory, validationErrors: summary.validationErrors };
    }),
    getRepoStatus: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, statusLines: summary.statusLines, files: summary.files, ...(summary.submodules ? { submodules: summary.submodules } : {}) };
    }),
    getRepoMetadata: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, upstream: summary.upstream, branches: summary.branches, remotes: summary.remotes, remoteBranches: summary.remoteBranches, defaultRemoteBranch: summary.defaultRemoteBranch, commitsAheadOfDefaultBranch: summary.commitsAheadOfDefaultBranch, githubRepository: summary.githubRepository, actionsConfig: summary.actionsConfig };
    }),
    cancelRepositoryRead: vi.fn().mockResolvedValue(undefined),
    getGitOperationStates: vi.fn().mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId: string) => ({ operationId, state: "running" }))
    )),
    cancelGitOperation: vi.fn().mockResolvedValue({ accepted: true, state: "cancelling" }),
    watchRepoChanges: vi.fn().mockResolvedValue(undefined),
    unwatchRepoChanges: vi.fn().mockResolvedValue(undefined),
    getRepoRecents: vi.fn().mockResolvedValue(repositoryRecents(repoPath)),
    getRepoSyncStatuses: vi.fn().mockImplementation(async (repoPaths: string[]) => repoPaths.map((nextRepoPath) => createRepoSyncStatus({
      repoPath: nextRepoPath
    }))),
    addRepoRecent: vi.fn().mockImplementation(async (request) => repositoryRecents(request.repoPath)),
    removeRepoRecent: vi.fn().mockResolvedValue([]),
    reorderRepoRecents: vi.fn().mockImplementation(async (repoPaths: string[]) => repositoryRecents(...repoPaths)),
    getRepositoryGroups: vi.fn().mockResolvedValue([]),
    getRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addSafeDirectory: vi.fn().mockResolvedValue(okOperation),
    getGitHubWorkflowRuns: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: 0 }, rateLimit: null }),
    getGitHubViewer: vi.fn().mockResolvedValue({ ok: true, data: { login: "viewer", authenticated: true }, rateLimit: null }),
    getGitHubOpenCounts: vi.fn().mockResolvedValue({ ok: true, data: createOpenCounts(), rateLimit: null }),
    getGitHubIssues: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: null }, rateLimit: null }),
    getGitHubPullRequests: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: null }, rateLimit: null }),
    createGitHubPullRequest: vi.fn().mockResolvedValue({ ok: true, data: {
      number: 12,
      url: "https://github.com/warheadent/Githead/pull/12",
      title: "Update feature",
      draft: false
    }, rateLimit: null }),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getGitHubHistoryInsights: vi.fn().mockResolvedValue({ ok: true, data: { currentBranchPullRequests: [], commits: [], unavailableCommitShas: [] }, rateLimit: null }),
    getCommitDetails: vi.fn(),
    getCommitFileDiff: vi.fn(),
    getFileHistory: vi.fn().mockResolvedValue({ repoPath, startHash: "a".repeat(40), requestedPath: "", entries: [], hasMore: false }),
    getFileBlame: vi.fn(),
    getFileDiff: vi.fn(),
    getFilePreview: vi.fn(),
    fetchLfsImageVersions: vi.fn(),
    resetFilesToCommit: vi.fn().mockResolvedValue(okOperation),
    openCommitFileVersion: vi.fn().mockResolvedValue(okOperation),
    stageFiles: vi.fn().mockResolvedValue(okOperation),
    unstageFiles: vi.fn().mockResolvedValue(okOperation),
    stageHunk: vi.fn().mockResolvedValue(okOperation),
    unstageHunk: vi.fn().mockResolvedValue(okOperation),
    commitChanges: vi.fn().mockResolvedValue(okOperation),
    copyCommitShaToClipboard: vi.fn().mockResolvedValue(okOperation),
    resetBranchToCommit: vi.fn().mockResolvedValue(okOperation),
    revertCommit: vi.fn().mockResolvedValue(okOperation),
    createTag: vi.fn().mockResolvedValue(okOperation),
    deleteTag: vi.fn().mockResolvedValue(okOperation),
    switchBranch: vi.fn().mockResolvedValue(okOperation),
    checkoutRemoteBranch: vi.fn().mockResolvedValue(okOperation),
    checkoutGitHubPullRequest: vi.fn().mockResolvedValue(okOperation),
    createBranch: vi.fn().mockResolvedValue(okOperation),
    renameBranch: vi.fn().mockResolvedValue(okOperation),
    deleteBranch: vi.fn().mockResolvedValue(okOperation),
    createWorktree: vi.fn().mockResolvedValue(okOperation),
    checkWorktreeRemoval: vi.fn().mockResolvedValue({ repoPath, worktreePath: "", canRemove: true, isClean: true, reason: "" }),
    removeWorktree: vi.fn().mockResolvedValue(okOperation),
    setBranchUpstream: vi.fn().mockResolvedValue(okOperation),
    publishBranch: vi.fn().mockResolvedValue(createRunResult("publish")),
    getRemoteConfigs: vi.fn().mockResolvedValue([]),
    addRemote: vi.fn().mockResolvedValue(okOperation),
    renameRemote: vi.fn().mockResolvedValue(okOperation),
    setRemoteUrl: vi.fn().mockResolvedValue(okOperation),
    removeRemote: vi.fn().mockResolvedValue(okOperation),
    getGitIdentity: vi.fn().mockResolvedValue(gitIdentity),
    saveGitIdentity: vi.fn().mockResolvedValue({
      ...gitIdentity,
      name: "Taylor",
      email: "taylor@example.test",
      repository: {
        name: "Taylor",
        email: "taylor@example.test"
      }
    }),
    getAiSettings: vi.fn().mockResolvedValue(aiSettings),
    saveAiSettings: vi.fn().mockResolvedValue(aiSettings),
    getAiReasoningCapabilities: vi.fn().mockResolvedValue({
      status: "supported",
      supportedEfforts: ["low", "medium", "high"]
    }),
    cancelGitHubRequest: vi.fn().mockResolvedValue(undefined),
    getAppSettings: vi.fn().mockResolvedValue(appSettings),
    saveAppSettings: vi.fn().mockImplementation(async (request) => ({
      ...appSettings,
      ...request,
      statusFileViewMode: request.statusFileViewMode ?? appSettings.statusFileViewMode,
      wrapDiffLines: request.wrapDiffLines ?? appSettings.wrapDiffLines
    })),
    setWindowZoomFactor: vi.fn().mockResolvedValue(undefined),
    generateCommitMessage: vi.fn().mockResolvedValue(okOperation),
    generatePrTitle: vi.fn().mockResolvedValue(okOperation),
    generatePrDescription: vi.fn().mockResolvedValue(okOperation),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(okOperation),
    showInExplorer: vi.fn().mockResolvedValue(okOperation),
    showRepositoryInExplorer: vi.fn().mockResolvedValue(okOperation),
    copyPathToClipboard: vi.fn().mockResolvedValue(okOperation),
    copyTextToClipboard: vi.fn().mockResolvedValue(okOperation),
    deleteFile: vi.fn().mockResolvedValue(okOperation),
    deleteFiles: vi.fn().mockResolvedValue(okOperation),
    revertFileChanges: vi.fn().mockResolvedValue(okOperation),
    addPathToIgnore: vi.fn().mockResolvedValue(okOperation),
    cloneRepository: vi.fn().mockResolvedValue(okOperation),
    updateSubmodules: vi.fn().mockResolvedValue(okOperation),
    syncSubmodules: vi.fn().mockResolvedValue(okOperation),
    checkRepositoryAccess: vi.fn().mockResolvedValue({
      source: "",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [],
      defaultBranch: null
    }),
    runGitAction: vi.fn().mockResolvedValue(createRunResult("fetch")),
    runConfiguredAction: vi.fn(),
    saveConfiguredActions: vi.fn().mockResolvedValue(okOperation),
    getUpdateState: vi.fn().mockResolvedValue(createUpdateState()),
    checkForUpdates: vi.fn().mockResolvedValue({
      checked: true,
      state: createUpdateState({
        status: "up-to-date",
        checkedAt: "2026-05-31T10:00:00Z"
      })
    }),
    downloadUpdate: vi.fn().mockResolvedValue({
      accepted: true,
      completed: false,
      state: createUpdateState({
        status: "downloading",
        availableVersion: "0.1.1",
        downloadPercent: 0
      })
    }),
    installUpdate: vi.fn().mockResolvedValue({
      accepted: true,
      completed: false,
      state: createUpdateState({
        status: "downloaded",
        availableVersion: "0.1.1",
        downloadedVersion: "0.1.1",
        downloadPercent: 100
      })
    }),
    minimizeWindow: vi.fn().mockResolvedValue(createWindowState()),
    toggleMaximizeWindow: vi.fn().mockResolvedValue(createWindowState({
      isMaximized: true
    })),
    closeWindow: vi.fn().mockResolvedValue(undefined),
    getWindowState: vi.fn().mockResolvedValue(createWindowState()),
    onGitOutput: vi.fn((callback) => {
      gitOutputCallback = callback;
      return cleanupGitOutput;
    }),
    onRepoChanged: vi.fn((callback) => {
      repoChangedCallback = callback;
      return cleanupRepoChanged;
    }),
    onUpdateState: vi.fn((callback) => {
      updateStateCallback = callback;
      return cleanupUpdateState;
    }),
    onWindowState: vi.fn((callback) => {
      windowStateCallback = callback;
      return cleanupWindowState;
    })
  };
}

function createWindowState(overrides: Partial<AppWindowState> = {}): AppWindowState {
  return {
    isMaximized: false,
    ...overrides
  };
}

function createUpdateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    enabled: true,
    status: "idle",
    currentVersion: "0.1.0",
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false,
    ...overrides
  };
}

function createSummary(
  overrides: Omit<Partial<RepoSummary>, "actionsConfig"> & {
    actionsConfig?: PartialActionsConfig;
  } = {}
): RepoSummary {
  const actionsConfig = createActionsConfig(overrides.actionsConfig);

  return {
    repoPath,
    kind: "git",
    capabilities: gitCapabilities(),
    isValid: true,
    branch: "main",
    upstream: "origin/main",
    branches: [
      {
        name: "main",
        current: true,
        upstream: "origin/main"
      }
    ],
    hasHead: true,
    remotes: [
      {
        name: "origin",
        url: "https://example.test/repo.git",
        direction: "fetch"
      }
    ],
    remoteBranches: [
      {
        name: "origin/main",
        remote: "origin",
        branch: "main"
      }
    ],
    defaultRemoteBranch: {
      name: "origin/main",
      remote: "origin",
      branch: "main"
    },
    commitsAheadOfDefaultBranch: 0,
    githubRepository: null,
    statusLines: [],
    files: [],
    safeDirectory: null,
    validationErrors: [],
    ...overrides,
    actionsConfig
  };
}

function createSafeDirectorySummary(repoPath: string): RepoSummary {
  return createSummary({
    repoPath,
    isValid: false,
    branch: null,
    upstream: null,
    branches: [],
    hasHead: false,
    remotes: [],
    remoteBranches: [],
    githubRepository: null,
    statusLines: [],
    files: [],
    safeDirectory: {
      required: true,
      path: repoPath.replace(/\\/g, "/"),
      message: "Git blocked this repository because its ownership differs from your current user."
    },
    validationErrors: [
      "Git blocked this repository because its ownership differs from your current user."
    ]
  });
}

function createRepoSyncStatus(overrides: Partial<RepoSyncStatus> = {}): RepoSyncStatus {
  return {
    repoPath,
    kind: "git",
    isValid: true,
    ahead: 0,
    behind: 0,
    error: "",
    ...overrides
  };
}

function createActionsConfig(
  overrides: PartialActionsConfig = {}
): RepoSummary["actionsConfig"] {
  const shared = {
    target: "shared" as const,
    fileName: "actions.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: "",
    ...overrides.shared
  };
  const local = {
    target: "local" as const,
    fileName: "actions.local.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: "",
    ...overrides.local
  };

  return {
    hasGitheadDir: false,
    actions: [],
    error: "",
    ...overrides,
    shared,
    local
  };
}

type PartialActionsConfig = Omit<Partial<RepoSummary["actionsConfig"]>, "shared" | "local"> & {
  shared?: Partial<RepoSummary["actionsConfig"]["shared"]>;
  local?: Partial<RepoSummary["actionsConfig"]["local"]>;
};

function createGitHubSummary(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return createSummary({
    remotes: [
      {
        name: "origin",
        url: "git@github.com:openai/githead.git",
        direction: "fetch"
      }
    ],
    githubRepository: {
      owner: "openai",
      name: "githead",
      fullName: "openai/githead",
      webUrl: "https://github.com/openai/githead"
    },
    ...overrides
  });
}

function createStatusFile(path: string, overrides: Partial<RepoSummary["files"][number]> = {}): RepoSummary["files"][number] {
  return {
    path,
    indexStatus: ".",
    worktreeStatus: ".",
    isStaged: false,
    isUnstaged: false,
    isConflicted: false,
    ...overrides
  };
}

function createWorkflowRun(overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    id: "run-1",
    name: "CI",
    runNumber: 1,
    status: "completed",
    conclusion: "success",
    branch: "main",
    event: "push",
    commitSha: "abcdef1234567890",
    commitMessage: "fix: default workflow run",
    url: "https://github.com/openai/githead/actions/runs/1",
    startedAt: "2026-05-30T10:00:00Z",
    updatedAt: "2026-05-30T10:05:00Z",
    ...overrides
  };
}

function createIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Default issue",
    state: "open",
    authorLogin: "taylor",
    labels: [],
    comments: 0,
    updatedAt: "2026-05-30T10:05:00Z",
    url: "https://github.com/openai/githead/issues/1",
    ...overrides
  };
}

function createOpenCounts(overrides: Partial<GitHubOpenCounts> = {}): GitHubOpenCounts {
  return {
    issues: 0,
    pullRequests: 0,
    ...overrides
  };
}

function createPullRequest(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 1,
    title: "Default pull request",
    state: "open",
    authorLogin: "taylor",
    sourceBranch: "feature/default",
    sourceRepositoryFullName: "openai/githead",
    targetBranch: "main",
    labels: [],
    comments: 0,
    draft: false,
    updatedAt: "2026-05-30T10:05:00Z",
    url: "https://github.com/openai/githead/pull/1",
    ...overrides
  };
}

function createCommit(overrides: Partial<GitCommitGraphRow> = {}): GitCommitGraphRow {
  return {
    hash: "f".repeat(40),
    shortHash: "fffffff",
    parents: [],
    refs: [],
    subject: "fix: default test commit",
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    relativeDate: "2 hours ago",
    ...overrides
  };
}

function createCommitDetails(hash: string, overrides: Partial<GitCommitDetails> = {}): GitCommitDetails {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    refs: [],
    subject: "feat(ai): add attack pressure cooldown",
    body: "",
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    committerName: "Taylor Bombay",
    committerEmail: "taylor@example.test",
    committerDate: "2026-05-26T21:42:20-07:00",
    parents: [],
    files: [],
    ...overrides
  };
}

function createOperationResult(overrides: Partial<GitOperationResult> = {}): GitOperationResult {
  return {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: "",
    ...overrides
  };
}

function createRunResult(action: string, overrides: Partial<GitRunResult> = {}): GitRunResult {
  return {
    runId: `run-${action}`,
    action,
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: "",
    startedAt: "2026-05-31T10:00:00.000Z",
    endedAt: "2026-05-31T10:00:01.000Z",
    ...overrides
  };
}

function createTextDiff(path: string, value: string, side: GitFileDiff["side"] = "unstaged"): GitFileDiff {
  return {
    path,
    side,
    kind: "text",
    text: [
      `diff --git a/${path} b/${path}`,
      "@@ -1 +1 @@",
      `+${value}`
    ].join("\n")
  };
}

function getStatusTone(row: HTMLElement): string | null {
  return row.querySelector(".status-chip")?.getAttribute("data-status-tone") ?? null;
}

async function waitForRepositoryWorkspace(): Promise<void> {
  await screen.findByRole("complementary");
}

async function flushRendererAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function emitRepoChanged(overrides: Partial<RepoChangedEvent> = {}): void {
  if (!repoChangedCallback) {
    throw new Error("Repository change listener was not registered.");
  }

  repoChangedCallback({
    repoPath,
    changedAt: "2026-05-31T10:00:00.000Z",
    reason: "filesystem",
    ...overrides
  });
}

function defer<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined;
  let reject: Deferred<T>["reject"] | undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  if (!resolve || !reject) {
    throw new Error("Unable to create deferred promise.");
  }

  return {
    promise,
    resolve,
    reject
  };
}
