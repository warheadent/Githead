// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
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
import type {
  AiSettings,
  AppUpdateState,
  AppWindowState,
  GitCommitDetails,
  GitCommitGraphRow,
  GitFileDiff,
  GitHubIssue,
  GitHubPullRequest,
  GitHubWorkflowRun,
  GitheadApi,
  GitOperationResult,
  RepoChangedEvent,
  RepoSummary
} from "../shared/types";

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
  githead = createGitheadMock();
  window.githead = githead;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximize window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close window" })).toBeTruthy();
  });

  it("renders custom window controls in the repository workspace and calls window APIs", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Maximize window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));

    expect(githead.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(githead.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(githead.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("switches the maximize control to restore when the window is maximized", async () => {
    render(<App />);

    await screen.findByText("Repository ready");
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
      subject: "feat(ai): add attack pressure cooldown"
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

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));

    await waitFor(() => expect(screen.getAllByText("Feature")).toHaveLength(2));
    const historyBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".history-row"));
    const detailBadge = screen.getAllByText("Feature").find((badge) => badge.closest(".commit-title"));
    expect(historyBadge?.className).toContain("commit-type-badge");
    expect(historyBadge?.className).toContain("type-feat");
    expect(detailBadge?.className).toContain("commit-type-badge");
    expect(detailBadge?.className).toContain("type-feat");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /tag target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.click(screen.getByRole("button", { name: "Add Tag" }));

    expect(await screen.findByText("Enter a tag name.")).toBeTruthy();

    await user.type(screen.getByLabelText("Tag Name"), "v1.2.3");
    await user.type(screen.getByLabelText("Message"), "Release 1.2.3");
    await user.selectOptions(screen.getByLabelText("Push tag"), "origin");
    await user.click(screen.getByRole("button", { name: "Add Tag" }));

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

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    fireEvent.contextMenu(await screen.findByRole("option", { name: /remove tag target/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tag$/ }));
    await user.click(screen.getByRole("tab", { name: /Remove Tag/ }));
    await user.click(screen.getByRole("button", { name: "Remove Tag" }));

    await waitFor(() => {
      expect(githead.deleteTag).toHaveBeenCalledWith({
        repoPath,
        tagName: "v1.2.3",
        pushRemote: null
      });
    });
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

  it("subscribes to git output and removes the listener on unmount", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());
    const view = render(<App />);

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");

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

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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

  it("shows GitHub tabs only for repositories with a supported GitHub origin", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    const { unmount } = render(<App />);

    await screen.findByText("Repository ready");
    expect(screen.queryByRole("tab", { name: /Workflow Runs/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Pull Requests/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /^Issues$/ })).toBeNull();

    unmount();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());

    render(<App />);

    await screen.findByRole("tab", { name: /Workflow Runs/ });
    expect(screen.getByRole("tab", { name: /Pull Requests/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Issues$/ })).toBeTruthy();
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

    await user.click(await screen.findByRole("tab", { name: /^Issues$/ }));

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

    expect(await screen.findByRole("button", { name: /^Pull \(3\)$/ })).toBeTruthy();
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

    expect(within(actionsGroup).getByRole("button", { name: /^Push \(2\)$/ })).toBeTruthy();
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

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push"
      });
    });
  });

  it("opens the Repository Actions manager without a .githead folder and saves a shared action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Repository ready");

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

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    await waitFor(() => {
      expect(githead.runConfiguredAction).toHaveBeenCalledWith({
        repoPath,
        name: "Build"
      });
    });
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
    expect(screen.getByText("Repository ready")).toBeTruthy();
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

    expect(await screen.findByText("Repository ready")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Switch to ${recentRepo}` }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` })).toBeTruthy();
    expect(screen.queryByText(otherRepo)).toBeNull();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(recentRepo);
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
    const recents = screen.getByRole("region", { name: "Recent repositories" });
    expect(within(recents).getByRole("button", { name: `Switch to ${invalidRepo}` })).toBeTruthy();
    expect(within(recents).queryByText(invalidRepo)).toBeNull();
  });

  it("switches repositories from a recent entry", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([
      repoPath,
      otherRepo
    ]);
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) => requestedRepoPath === repoPath
      ? [
          repoPath,
          otherRepo
        ]
      : [
          requestedRepoPath,
          repoPath
        ]);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));

    render(<App />);

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
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

    await screen.findByText("Repository ready");
    vi.mocked(githead.getRepoSummary).mockClear();
    await user.click(screen.getByRole("button", { name: `Remove ${otherRepo} from recent repositories` }));

    await waitFor(() => {
      expect(githead.removeRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
    expect(screen.getByRole("button", { name: `Switch to ${repoPath}` }).getAttribute("aria-current")).toBe("true");
    expect(githead.getRepoSummary).not.toHaveBeenCalledWith(otherRepo);
  });

  it("adds a browsed valid repository to recents", async () => {
    const user = userEvent.setup();
    const browsedRepo = "D:\\Work\\Browsed";
    vi.mocked(githead.chooseRepo).mockResolvedValue(browsedRepo);
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) => [
      requestedRepoPath,
      repoPath
    ]);

    render(<App />);

    await screen.findByText("Repository ready");
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${browsedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith(browsedRepo);
    });
  });

  it("does not add an invalid browsed repository to recents", async () => {
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

    await screen.findByText("Repository ready");
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Add existing" }));

    expect(await screen.findByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByText(invalidRepo)).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(invalidRepo);
  });

  it("clones a repository, validates the result, and adds it to recents", async () => {
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
    expect(await screen.findByText("Repository ready")).toBeTruthy();
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

    await screen.findByText("Repository ready");
    await user.click(screen.getByRole("button", { name: "Add repository" }));

    expect(screen.getByRole("button", { name: "Add existing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clone new" })).toBeTruthy();
    expect(screen.queryByLabelText("Repository URL or path")).toBeNull();
  });

  it("opens the clone form from the repository add popout", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Repository ready");
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
      requestedRepoPath,
      repoPath
    ]);

    render(<App />);

    await screen.findByText("Repository ready");
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

    await screen.findByText("Repository ready");
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
    vi.mocked(githead.addRepoRecent).mockImplementation(async (requestedRepoPath) => [
      requestedRepoPath,
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

    await screen.findByText("Repository ready");
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
    const savedSettings: AiSettings = {
      hasApiKey: true,
      model: "openrouter/auto",
      commitMessagePrompt: "Write concise commit messages."
    };
    vi.mocked(githead.getAiSettings).mockResolvedValue(savedSettings);
    vi.mocked(githead.saveAiSettings).mockResolvedValue(savedSettings);

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.queryByLabelText("Site URL")).toBeNull();
    expect(screen.queryByLabelText("Site Title")).toBeNull();

    const prompt = await screen.findByLabelText("Commit Message Prompt");
    expect(prompt).toBeTruthy();

    await user.clear(screen.getByLabelText("API Key"));
    await user.type(screen.getByLabelText("API Key"), "sk-or-key");
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "openrouter/auto");
    await user.clear(prompt);
    await user.type(prompt, "Write a single-line commit message.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAiSettings).toHaveBeenCalledWith({
        apiKey: "sk-or-key",
        model: "openrouter/auto",
        commitMessagePrompt: "Write a single-line commit message."
      });
    });
  });
});

function createGitheadMock(): GitheadApi {
  const okOperation: GitOperationResult = {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
  const aiSettings: AiSettings = {
    hasApiKey: true,
    model: "openai/gpt-5-mini",
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT
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
    addRepoRecent: vi.fn().mockImplementation(async (nextRepoPath: string) => [
      nextRepoPath
    ]),
    removeRepoRecent: vi.fn().mockResolvedValue([]),
    getRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    getGitHubWorkflowRuns: vi.fn().mockResolvedValue([]),
    getGitHubIssues: vi.fn().mockResolvedValue([]),
    getGitHubPullRequests: vi.fn().mockResolvedValue([]),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getCommitDetails: vi.fn(),
    getCommitFileDiff: vi.fn(),
    getFileDiff: vi.fn(),
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
    setBranchUpstream: vi.fn().mockResolvedValue(okOperation),
    getAiSettings: vi.fn().mockResolvedValue(aiSettings),
    saveAiSettings: vi.fn().mockResolvedValue(aiSettings),
    generateCommitMessage: vi.fn().mockResolvedValue(okOperation),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(okOperation),
    showInExplorer: vi.fn().mockResolvedValue(okOperation),
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
    runGitAction: vi.fn(),
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
    githubRepository: null,
    statusLines: [],
    files: [],
    validationErrors: [],
    ...overrides,
    actionsConfig
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
