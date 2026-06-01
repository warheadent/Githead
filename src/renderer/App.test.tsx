// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

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
import type {
  AiSettings,
  AppUpdateState,
  GitCommitDetails,
  GitCommitGraphRow,
  GitFileDiff,
  GitHubIssue,
  GitHubPullRequest,
  GitHubWorkflowRun,
  GitheadApi,
  GitOperationResult,
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
let gitOutputCallback: Parameters<GitheadApi["onGitOutput"]>[0] | null;
let updateStateCallback: Parameters<GitheadApi["onUpdateState"]>[0] | null;

beforeEach(() => {
  cleanupGitOutput = vi.fn<() => void>();
  cleanupUpdateState = vi.fn<() => void>();
  gitOutputCallback = null;
  updateStateCallback = null;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  githead = createGitheadMock();
  window.githead = githead;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders repository validation failures from the initial summary", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      isValid: false,
      validationErrors: [
        "Not a git repository."
      ]
    }));

    render(<App />);

    expect(await screen.findByText("Not a git repository.")).toBeTruthy();
    expect(screen.getAllByText("Select a valid repository.").length).toBeGreaterThan(0);
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
    await user.click(screen.getByRole("tab", { name: /Activity Log/ }));
    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/create mode 100644 src\/renderer\/App\.tsx/)).toBeTruthy();
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

    await user.click(screen.getByRole("tab", { name: /Activity Log/ }));
    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/fetch output/)).toBeTruthy();

    view.unmount();

    expect(cleanupGitOutput).toHaveBeenCalledTimes(1);
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
      message: "Update check failed.",
      errorContext: "check",
      canRetry: true
    }));

    render(<App />);

    expect(await screen.findByText("Update check failed.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry update check" }));

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

    await user.click(screen.getByRole("tab", { name: /Activity Log/ }));
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

    expect(await screen.findByDisplayValue(recentRepo)).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getByText(otherRepo)).toBeTruthy();
    expect(githead.getRepoSummary).toHaveBeenCalledWith(recentRepo);
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

    await screen.findByDisplayValue(repoPath);
    await user.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));

    expect(await screen.findByDisplayValue(otherRepo)).toBeTruthy();
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

    await screen.findByDisplayValue(repoPath);
    vi.mocked(githead.getRepoSummary).mockClear();
    await user.click(screen.getByRole("button", { name: `Remove ${otherRepo} from recent repositories` }));

    await waitFor(() => {
      expect(githead.removeRepoRecent).toHaveBeenCalledWith(otherRepo);
    });
    expect(screen.getByDisplayValue(repoPath)).toBeTruthy();
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

    await screen.findByDisplayValue(repoPath);
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: /Browse/ }));

    expect(await screen.findByDisplayValue(browsedRepo)).toBeTruthy();
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

    await screen.findByDisplayValue(repoPath);
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: /Browse/ }));

    expect(await screen.findByText("Selected folder is not a git repository.")).toBeTruthy();
    expect(screen.getByDisplayValue(invalidRepo)).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith(invalidRepo);
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

    await screen.findByDisplayValue(repoPath);
    await user.click(screen.getByRole("button", { name: `Switch to ${firstRepo}` }));
    await user.click(screen.getByRole("button", { name: `Switch to ${secondRepo}` }));

    secondSummary.resolve(createSummary({
      repoPath: secondRepo,
      branch: "second"
    }));
    expect(await screen.findByDisplayValue(secondRepo)).toBeTruthy();
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
    siteUrl: "",
    siteTitle: "Githead"
  };

  return {
    chooseRepo: vi.fn().mockResolvedValue(null),
    getRepoSummary: vi.fn().mockResolvedValue(createSummary()),
    getRepoRecents: vi.fn().mockResolvedValue([]),
    addRepoRecent: vi.fn().mockImplementation(async (nextRepoPath: string) => [
      nextRepoPath
    ]),
    removeRepoRecent: vi.fn().mockResolvedValue([]),
    getGitHubWorkflowRuns: vi.fn().mockResolvedValue([]),
    getGitHubIssues: vi.fn().mockResolvedValue([]),
    getGitHubPullRequests: vi.fn().mockResolvedValue([]),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getCommitDetails: vi.fn(),
    getCommitFileDiff: vi.fn(),
    getFileDiff: vi.fn(),
    stageFiles: vi.fn().mockResolvedValue(okOperation),
    unstageFiles: vi.fn().mockResolvedValue(okOperation),
    commitChanges: vi.fn().mockResolvedValue(okOperation),
    switchBranch: vi.fn().mockResolvedValue(okOperation),
    createBranch: vi.fn().mockResolvedValue(okOperation),
    getAiSettings: vi.fn().mockResolvedValue(aiSettings),
    saveAiSettings: vi.fn().mockResolvedValue(aiSettings),
    generateCommitMessage: vi.fn().mockResolvedValue(okOperation),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(okOperation),
    showInExplorer: vi.fn().mockResolvedValue(okOperation),
    copyPathToClipboard: vi.fn().mockResolvedValue(okOperation),
    deleteFile: vi.fn().mockResolvedValue(okOperation),
    revertFileChanges: vi.fn().mockResolvedValue(okOperation),
    addPathToIgnore: vi.fn().mockResolvedValue(okOperation),
    runGitAction: vi.fn(),
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
    onGitOutput: vi.fn((callback) => {
      gitOutputCallback = callback;
      return cleanupGitOutput;
    }),
    onUpdateState: vi.fn((callback) => {
      updateStateCallback = callback;
      return cleanupUpdateState;
    })
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

function createSummary(overrides: Partial<RepoSummary> = {}): RepoSummary {
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
    githubRepository: null,
    statusLines: [],
    files: [],
    validationErrors: [],
    ...overrides
  };
}

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
