// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  ResizablePanel: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />
}));

import { App } from "./App";
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
import { gitCapabilities, type AiCommitMessageProvider } from "../shared/types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

const repoPath = "D:\\Githead";
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
  openrouter: "openai/gpt-5.4-nano",
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
    expect(historyDescription?.closest(".history-description")?.getAttribute("title")).toBe("feat(ai): add attack pressure cooldown");
    expect(screen.getByText("Add MeshBites Shader")).toBeTruthy();
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

    expect(parentLink.getAttribute("title")).toBe(parentHash);

    await user.click(parentLink);

    await waitFor(() => {
      expect(githead.getCommitDetails).toHaveBeenLastCalledWith({
        repoPath,
        hash: parentHash
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
        mode: "hard"
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
        hash: commit.hash
      });
    });
  });

  it("shows commit file context menu actions with log and blame disabled", async () => {
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
    expect(screen.getByRole("menuitem", { name: "Log Selected" }).getAttribute("data-disabled")).toBe("");
    expect(screen.getByRole("menuitem", { name: "Blame Selected" }).getAttribute("data-disabled")).toBe("");
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
        path: "src/App.test.tsx"
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
        ]
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
        pushRemote: "origin"
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
      pushRemote: null
    }));
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
        pushRemote: null
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
        ]
      });
    });
  });

  it("stages an unstaged hunk through the preload API", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", {
      isUnstaged: true,
      worktreeStatus: "M"
    });
    const diffText = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "index 1234567..89abcde 100644",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        file
      ]
    }));
    vi.mocked(githead.getFileDiff).mockResolvedValue({
      path: file.path,
      side: "unstaged",
      kind: "text",
      text: diffText
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: /^Stage Hunk$/ }));

    await waitFor(() => {
      expect(githead.stageHunk).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.tsx",
        side: "unstaged",
        patch: `${diffText}\n`
      });
    });
  });

  it("unstages a staged hunk through the preload API", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("src/App.tsx", {
      isStaged: true,
      indexStatus: "M"
    });
    const diffText = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "index 1234567..89abcde 100644",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        file
      ]
    }));
    vi.mocked(githead.getFileDiff).mockResolvedValue({
      path: file.path,
      side: "staged",
      kind: "text",
      text: diffText
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /src\/App\.tsx/ }));
    await user.click(await screen.findByRole("button", { name: /^Unstage Hunk$/ }));

    await waitFor(() => {
      expect(githead.unstageHunk).toHaveBeenCalledWith({
        repoPath,
        path: "src/App.tsx",
        side: "staged",
        patch: `${diffText}\n`
      });
    });
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
        ]
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
        ]
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
        side: "unstaged"
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
        ]
      });
    });
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
        ]
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
        ]
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
        ]
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
        side: "unstaged"
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
        ]
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
        message: "feat: log commit output"
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
        repoPath
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
        additionalContext: "Preserve legacy project naming."
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
        additionalContext: "Important product context"
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
        message: "feat: trust repo"
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
        scope: "repository"
      });
      expect(githead.commitChanges).toHaveBeenCalledTimes(2);
      expect(githead.commitChanges).toHaveBeenLastCalledWith({
        repoPath,
        message: "feat: identify author"
      });
    });
    expect((screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement).value).toBe("");
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
        scope: "global"
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
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue(createOpenCounts({
      issues: 17,
      pullRequests: 4
    }));

    render(<App />);

    await waitFor(() => {
      expect(githead.getGitHubOpenCounts).toHaveBeenCalledWith({
        repoPath
      });
    });
    expect(await screen.findByRole("tab", { name: /Pull Requests 4/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Issues 17/ })).toBeTruthy();
    // Pull requests load eagerly (the Create PR button needs them); issues
    // still load only when their tab is opened.
    expect(githead.getGitHubIssues).not.toHaveBeenCalled();
  });

  it("compacts large GitHub open counts in tab titles", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue(createOpenCounts({
      issues: 1100,
      pullRequests: 12_000
    }));

    render(<App />);

    expect(await screen.findByRole("tab", { name: /Issues 1\.1k/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Pull Requests 12k/ })).toBeTruthy();
  });

  it("loads workflow runs from GitHub when the Workflow Runs tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubWorkflowRuns).mockResolvedValue([
      createWorkflowRun({
        name: "CI",
        conclusion: "success",
        branch: "main",
        event: "push",
        commitMessage: "feat: add workflow runs tab"
      })
    ]);

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));

    await waitFor(() => {
      expect(githead.getGitHubWorkflowRuns).toHaveBeenCalledWith({
        repoPath
      });
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
    vi.mocked(githead.getGitHubPullRequests).mockResolvedValue([
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
    ]);

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Pull Requests/ }));

    await waitFor(() => {
      expect(githead.getGitHubPullRequests).toHaveBeenCalledWith({
        repoPath
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
      context: "status", repoPath, path: "assets/image.png", side: "unstaged"
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

    await waitFor(() => {
      expect(githead.getGitHubPullRequests).toHaveBeenCalledWith({
        repoPath
      });
    });
    await user.click(await screen.findByRole("button", { name: "Create PR" }));

    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Generate pull request title" }));

    await waitFor(() => {
      expect(githead.generatePrTitle).toHaveBeenCalledWith({
        repoPath,
        baseRef: "origin/main",
        headRef: "feature/pr-title"
      });
    });
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("Add generated PR titles");
  });

  it("loads open issues from GitHub when the Issues tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockResolvedValue([
      createIssue({
        number: 12,
        title: "Add GitHub issue tab",
        labels: [
          "enhancement"
        ],
        comments: 4,
        url: "https://github.com/openai/githead/issues/12"
      })
    ]);

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Issues/ }));

    await waitFor(() => {
      expect(githead.getGitHubIssues).toHaveBeenCalledWith({
        repoPath
      });
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

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "Actions",
      "Fetch",
      "Pull",
      "Push"
    ]);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Repository actions");
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
        action: "push"
      });
    });
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Activity Log" }).getAttribute("aria-selected")).toBe("false");
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
        remoteName: "origin"
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
        remoteName: "upstream"
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
        action: "push"
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
    await user.click(screen.getAllByRole("button", { name: "Add" })[0]!);
    await user.type(screen.getAllByLabelText("Name")[0]!, "Build");
    await user.type(screen.getAllByLabelText("Command")[0]!, "npm run build");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Build",
            command: "npm run build",
            shell: "powershell"
          }
        ]
      });
    });
  });

  it("keeps the Repository Actions body scrollable when many actions are configured", async () => {
    const user = userEvent.setup();
    const sharedActions = Array.from({ length: 14 }, (_, index) => ({
      name: `Action ${index + 1}`,
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
    expect(actionsDialog.className).toContain("h-[min(820px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("max-h-[min(820px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("overflow-hidden");

    const scrollArea = screen.getByTestId("repository-actions-scroll-area");
    expect(scrollArea.className).toContain("flex-1");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("overflow-y-auto");
    expect(screen.getByDisplayValue("Action 14")).toBeTruthy();
  });

  it("renders and runs configured repository actions", async () => {
    const user = userEvent.setup();
    const action = {
      name: "Build",
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
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    await waitFor(() => {
      expect(githead.runConfiguredAction).toHaveBeenCalledWith({
        repoPath,
        name: "Build"
      });
    });
    expect(screen.getByRole("tab", { name: "Activity Log" }).getAttribute("aria-selected")).toBe("true");
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

  it("runs repeated configured actions concurrently and tracks each completion", async () => {
    const user = userEvent.setup();
    const first = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    const second = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", command: "npm run build", shell: "powershell" }],
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
        actions: [{ name: "Build", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(configured.promise);
    vi.mocked(githead.runGitAction).mockReturnValue(fetch.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    await user.click(await screen.findByRole("button", { name: "Fetch" }));

    expect(githead.runGitAction).toHaveBeenCalledWith({ repoPath, action: "fetch" });
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
              command: "npm run build:local",
              shell: "cmd"
            }
          ]
        },
        actions: [
          {
            name: "build",
            command: "npm run build:local",
            shell: "cmd"
          }
        ]
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));

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
              command: "npm run build",
              shell: "powershell"
            },
            {
              name: "Test",
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
    await user.click(await screen.findByRole("button", { name: "Move Test up" }));
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Test",
            command: "npm test",
            shell: "bash"
          },
          {
            name: "Build",
            command: "npm run build",
            shell: "powershell"
          }
        ]
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

    expect(await screen.findByText("This file contains comments. Edit it manually to preserve them.")).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "Add" })[1] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Save" })[1] as HTMLButtonElement).disabled).toBe(true);
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
      action: "fetch"
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
      action: "fetch"
    });
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
      action: "fetch"
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
      appearanceMode: "system"
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

  it("does not start another automatic refresh while a refresh is already in flight", async () => {
    vi.useFakeTimers();
    const pendingRefresh = defer<RepoSummary>();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary())
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockResolvedValue(createSummary());

    render(<App />);
    await flushRendererAsync();
    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    emitRepoChanged();
    await flushRendererAsync();
    expect(githead.getRepoSummary).toHaveBeenCalledTimes(2);

    pendingRefresh.resolve(createSummary());
    await flushRendererAsync();
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
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

  it("shows local push and pull counts beside recent repositories", async () => {
    const recentRepo = "D:\\Work\\Recent";
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
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
    expect(within(recentButton).getByTitle("1 commit ahead")).toBeTruthy();
    expect(within(recentButton).getByTitle("4 commits behind")).toBeTruthy();
    expect(within(otherButton).getByTitle("2 commits behind")).toBeTruthy();
  });

  it("shows VCS icons beside recent repositories", async () => {
    const loreRepo = "D:\\Work\\Story";
    const gitRepo = "D:\\Work\\Git";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      loreRepo,
      gitRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      loreRepo,
      gitRepo
    ]);
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      recentRepo,
      otherRepo
    ]);
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      invalidRepo
    ]);
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      blockedRepo
    ]);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSafeDirectorySummary(blockedRepo));

    render(<App />);

    expect(await screen.findByText("Git ownership check blocked this repository.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Git Exception" })).toBeTruthy();
    expect(screen.getByText("D:/Work/Blocked")).toBeTruthy();
  });

  it("switches repositories from a recent entry", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
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
      expect(githead.addRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
    const repositories = within(screen.getByRole("region", { name: "Repositories" })).getAllByRole("button", {
      name: /^Switch to /
    });
    expect(repositories.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Switch to ${repoPath}`,
      `Switch to ${otherRepo}`
    ]);
  });

  it("removes a recent entry without switching repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.removeRepoRecent).mockResolvedValue([
      repoPath
    ]);

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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repoPaths);

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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.reorderRepoRecents).mockImplementation(async (repoPaths) => repoPaths);

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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockResolvedValue([
      repoPath,
      otherRepo
    ]);

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
    vi.mocked(githead.getRepoRecents).mockResolvedValue(existingRepos);
    vi.mocked(githead.chooseRepo).mockResolvedValue(browsedRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) =>
      requestedRepoPath === repoPath ? existingRepos : [
        ...existingRepos,
        requestedRepoPath
      ]
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
      expect(githead.addRepoRecent).toHaveBeenCalledWith(browsedRepo);
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
      repoPath: "D:/Work/Blocked"
    });
    expect(githead.addRepoRecent).toHaveBeenCalledWith(blockedRepo);
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
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) => [
      requestedRepoPath
    ]);

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
        depth: null
      });
    });
    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith(clonedRepo);
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
        depth: 1
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
        source: "https://github.com/openai/repo.git"
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

    expect(screen.queryByText("fatal: authentication failed")).toBeNull();
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
        depth: null
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
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) => [
      repoPath,
      requestedRepoPath
    ]);

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
        depth: null
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith(clonedRepo);
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
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      firstRepo,
      secondRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockImplementation(async (_requestedRepoPath) => [
      repoPath,
      firstRepo,
      secondRepo
    ]);
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
        branchName: "feature/nav"
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
        branchName: "feature/new"
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
        upstream: "origin/feature"
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
        upstream: null
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
    expect(githead.saveAppSettings).toHaveBeenCalledWith({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system"
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
    await waitFor(() => expect(githead.renameBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", newBranchName: "feature/new" }));
    vi.mocked(githead.deleteBranch).mockResolvedValue({
      repoPath,
      exitCode: 1,
      stdout: "",
      stderr: "error: the branch 'feature/old' is not fully merged\nhint: run git branch -D feature/old"
    });
    await user.click(await screen.findByRole("button", { name: "Delete feature/old" }));
    await user.click(screen.getByRole("button", { name: "Delete Branch" }));
    expect(githead.deleteBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", force: false });
    expect(await screen.findByText("This branch has commits that haven’t been merged. Merge them into another branch before deleting it.")).toBeTruthy();
    expect(screen.queryByText(/git branch -D/)).toBeNull();
    vi.mocked(githead.deleteBranch).mockResolvedValue({ repoPath, exitCode: 0, stdout: "", stderr: "" });
    await user.click(screen.getByRole("checkbox", { name: /Force delete/ }));
    await user.click(screen.getByRole("button", { name: "Force Delete Branch" }));
    await waitFor(() => expect(githead.deleteBranch).toHaveBeenLastCalledWith({ repoPath, branchName: "feature/old", force: true }));
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
    expect(settingsDialog.className).toContain("sm:max-w-[720px]");
    expect(settingsDialog.className).toContain("h-[min(760px,calc(100vh-2rem))]");
    expect(settingsDialog.className).toContain("overflow-hidden");
    expect(screen.getByRole("tab", { name: "Appearance", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Git Identity", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sync", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "AI", selected: false })).toBeTruthy();
    await screen.findByText("Git Identity", {
      selector: "h3"
    });
    expect(screen.queryByText("Provider settings for generated commit messages.")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("10");
    await user.click(screen.getByRole("tab", { name: "AI" }));
    expect(await screen.findByText("Provider settings for generated commit messages.")).toBeTruthy();
    const prompt = screen.getByLabelText("Commit Message Prompt");
    expect(prompt.className).toContain("field-sizing-fixed");
    expect(prompt.className).toContain("h-72");
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
        scope: "repository"
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
        appearanceMode: "system"
      });
    });
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

    await user.click(screen.getByRole("radio", { name: /Tidepool/ }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("tidepool");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
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
      appearanceMode: "light"
    }));
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
      url: "https://example.test/project.git"
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
    appearanceMode: "system"
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

  return {
    chooseRepo: vi.fn().mockResolvedValue(null),
    chooseCloneParent: vi.fn().mockResolvedValue(null),
    getRepoSummary: vi.fn().mockResolvedValue(createSummary()),
    watchRepoChanges: vi.fn().mockResolvedValue(undefined),
    unwatchRepoChanges: vi.fn().mockResolvedValue(undefined),
    getRepoRecents: vi.fn().mockResolvedValue([
      repoPath
    ]),
    getRepoSyncStatuses: vi.fn().mockImplementation(async (repoPaths: string[]) => repoPaths.map((nextRepoPath) => createRepoSyncStatus({
      repoPath: nextRepoPath
    }))),
    addRepoRecent: vi.fn().mockImplementation(async (nextRepoPath: string) => [
      nextRepoPath
    ]),
    removeRepoRecent: vi.fn().mockResolvedValue([]),
    reorderRepoRecents: vi.fn().mockImplementation(async (repoPaths: string[]) => repoPaths),
    getRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addSafeDirectory: vi.fn().mockResolvedValue(okOperation),
    getGitHubWorkflowRuns: vi.fn().mockResolvedValue([]),
    getGitHubOpenCounts: vi.fn().mockResolvedValue(createOpenCounts()),
    getGitHubIssues: vi.fn().mockResolvedValue([]),
    getGitHubPullRequests: vi.fn().mockResolvedValue([]),
    createGitHubPullRequest: vi.fn().mockResolvedValue({
      number: 12,
      url: "https://github.com/warheadent/Githead/pull/12",
      title: "Update feature",
      draft: false
    }),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getCommitDetails: vi.fn(),
    getCommitFileDiff: vi.fn(),
    getFileDiff: vi.fn(),
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
    createBranch: vi.fn().mockResolvedValue(okOperation),
    renameBranch: vi.fn().mockResolvedValue(okOperation),
    deleteBranch: vi.fn().mockResolvedValue(okOperation),
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
    getAppSettings: vi.fn().mockResolvedValue(appSettings),
    saveAppSettings: vi.fn().mockResolvedValue(appSettings),
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

function createTextDiff(path: string, value: string): GitFileDiff {
  return {
    path,
    side: "unstaged",
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
