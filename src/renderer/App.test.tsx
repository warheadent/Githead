// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  GitFileDiff,
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
let gitOutputCallback: Parameters<GitheadApi["onGitOutput"]>[0] | null;

beforeEach(() => {
  cleanupGitOutput = vi.fn<() => void>();
  gitOutputCallback = null;
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
    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/create mode 100644 src\/renderer\/App\.tsx/)).toBeTruthy();
  });

  it("subscribes to git output and removes the listener on unmount", async () => {
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

    expect(await screen.findByText("Output Available")).toBeTruthy();
    expect(screen.getByText(/fetch output/)).toBeTruthy();

    view.unmount();

    expect(cleanupGitOutput).toHaveBeenCalledTimes(1);
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
    openFile: vi.fn().mockResolvedValue(okOperation),
    showInExplorer: vi.fn().mockResolvedValue(okOperation),
    copyPathToClipboard: vi.fn().mockResolvedValue(okOperation),
    deleteFile: vi.fn().mockResolvedValue(okOperation),
    revertFileChanges: vi.fn().mockResolvedValue(okOperation),
    addPathToIgnore: vi.fn().mockResolvedValue(okOperation),
    runGitAction: vi.fn(),
    onGitOutput: vi.fn((callback) => {
      gitOutputCallback = callback;
      return cleanupGitOutput;
    })
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
    statusLines: [],
    files: [],
    validationErrors: [],
    ...overrides
  };
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
