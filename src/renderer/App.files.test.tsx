// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createOperationResult,
  createStatusFile,
  createSummary,
  createTextDiff,
  createUpdateState,
  cleanupGitOutput,
  cleanupRepoChanged,
  cleanupUpdateState,
  defer,
  emitRepoChanged,
  flushRendererAsync,
  gitOutputCallback,
  githead,
  repoPath,
  repositoryRecents,
  updateStateCallback,
  waitForRepositoryWorkspace,
  type GitFileDiff,
  type GitIdentitySettings,
  type GitCommitAndPushResult,
} from "./AppTestHarness";
import { App } from "./App";

describe("App", { timeout: 10_000 }, () => {
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

  it("keeps a 10,000-file status tree viewport-proportional during file selection", async () => {
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10, colorTheme: "githead", appearanceMode: "system", uiFont: "inter", codeFont: "system-mono", zoomFactor: 1, statusFileViewMode: "tree", wrapDiffLines: false, gitBehaviors: { tagPushBehavior: "all" }
    });
    const files = Array.from({ length: 10_000 }, (_, index) => createStatusFile(
      `generated/file-${index.toString().padStart(5, "0")}.ts`,
      { isUnstaged: true, worktreeStatus: "M" }
    ));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files }));

    render(<App />);

    const tree = await screen.findByRole("tree", { name: "Unstaged files" });
    expect(within(tree).getAllByRole("treeitem").length).toBeLessThan(100);
    expect(within(tree).queryByText("file-00500.ts")).toBeNull();

    const firstFile = within(tree).getByRole("treeitem", { name: /file-00000\.ts/ });
    expect(firstFile.style.position).toBe("absolute");
    expect(firstFile.style.top).toBe("34px");
    fireEvent.click(firstFile);

    expect(firstFile.getAttribute("aria-selected")).toBe("true");
    expect(within(tree).getAllByRole("treeitem").length).toBeLessThan(100);
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledWith(expect.objectContaining({ path: "generated/file-00000.ts" })));
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

  it("opens the stash composer from the selected-file context menu", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/cache",
      files: [
        createStatusFile("src/first.ts", { isUnstaged: true, worktreeStatus: "M" }),
        createStatusFile("src/second.ts", { isUnstaged: true, worktreeStatus: "M" })
      ]
    }));

    render(<App />);

    const firstFile = await screen.findByRole("option", { name: /src\/first\.ts/ });
    const secondFile = screen.getByRole("option", { name: /src\/second\.ts/ });
    await user.click(firstFile);
    fireEvent.click(secondFile, { ctrlKey: true });
    fireEvent.contextMenu(firstFile);
    await user.click(await screen.findByRole("menuitem", { name: "Stash selected files..." }));

    const stashDialog = await screen.findByRole("dialog", { name: "New stash" });
    expect(stashDialog).toBeTruthy();
    expect(screen.getByText("Source branch: feature/cache")).toBeTruthy();
    expect(screen.getByText("Selected files (2)")).toBeTruthy();
    await user.type(screen.getByLabelText("Message"), "cache cleanup");
    await user.click(screen.getByRole("button", { name: "Create stash" }));

    await waitFor(() => {
      expect(githead.createStash).toHaveBeenCalledWith({
        repoPath,
        message: "cache cleanup",
        scope: "selected",
        paths: ["src/first.ts", "src/second.ts"],
        includeUntracked: false,
        keepIndex: false,
        operationId: expect.any(String)
      });
    });
  });

  it("generates a message for the selected stash files", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("src/cache.ts", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    vi.mocked(githead.generateCommitMessage).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "Refactor cache cleanup",
      stderr: ""
    });

    render(<App />);
    const file = await screen.findByRole("option", { name: /src\/cache\.ts/ });
    fireEvent.contextMenu(file);
    await user.click(await screen.findByRole("menuitem", { name: "Stash selected files..." }));
    const dialog = await screen.findByRole("dialog", { name: "New stash" });
    await user.click(within(dialog).getByRole("button", { name: "Generate stash message" }));

    await waitFor(() => expect(githead.generateCommitMessage).toHaveBeenCalledWith({
      repoPath,
      stashSelection: {
        scope: "selected",
        paths: ["src/cache.ts"],
        includeUntracked: false,
        keepIndex: false
      },
      operationId: expect.any(String)
    }));
    expect((within(dialog).getByLabelText("Message") as HTMLInputElement).value).toBe("Refactor cache cleanup");
  });

  it("shows saved stashes in the Stashes workspace", async () => {
    const user = userEvent.setup();
    const stash = {
      ref: "stash@{0}",
      hash: "a".repeat(40),
      message: "cache cleanup",
      sourceBranch: "feature/cache",
      createdAt: "2026-08-04T20:00:00-07:00"
    };
    vi.mocked(githead.getStashes).mockResolvedValue([stash]);
    vi.mocked(githead.getStashDetails).mockResolvedValue({ stash, files: [{ path: "src/cache.ts", status: "M" }] });
    vi.mocked(githead.getStashFileDiff).mockResolvedValue(createTextDiff("src/cache.ts", "cached-change"));

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Stashes 1" }));

    expect(await screen.findByRole("option", { name: /cache cleanup/ })).toBeTruthy();
    expect(await screen.findByText("cached-change")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(githead.applyStash).toHaveBeenCalledWith({ repoPath, stashRef: "stash@{0}", operationId: expect.any(String) }));
  });

  it("hides the Stashes tab when the repository has no stashes", async () => {
    render(<App />);

    await waitFor(() => expect(githead.getStashes).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "Stashes" })).toBeNull();
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

  it("keeps the selected diff current when a watcher comparison finds unchanged content", async () => {
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
    expect(githead.getFileDiff).toHaveBeenCalledOnce();
    expect(vi.mocked(githead.getFileDiff).mock.calls[0]?.[0].requestId).toMatch(/^diff-freshness:/);
    expect(screen.queryByText("Loaded diff is out of date")).toBeNull();
  });

  it("keeps stale content visible when a watcher comparison finds a changed diff", async () => {
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
    expect(githead.getFileDiff).toHaveBeenCalledOnce();
    expect(await screen.findByText("Loaded diff is out of date")).toBeTruthy();
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

    await user.click(await screen.findByRole("button", { name: "New diff available" }));

    expect(await screen.findByText("changed-value")).toBeTruthy();
    expect(githead.getFileDiff).toHaveBeenCalledTimes(3);
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
    expect(githead.getFileDiff).toHaveBeenCalledOnce();
    expect(screen.queryByText("Loaded diff is out of date")).toBeNull();
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

    const commitButton = screen.getByRole("button", { name: /^Commit$/ });
    await user.click(commitButton);

    await waitFor(() => {
      expect(githead.commitChanges).toHaveBeenCalledWith({
        repoPath,
        message: "feat: log commit output",
        operationId: expect.any(String)
      });
    });

    await waitFor(() => {
      expect(commitButton.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("success");
    });

    expect(screen.getByLabelText("Commit staged files").querySelector(".status-text")).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));
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
    expect(within(dialog).getByRole("alert").textContent).toBe("OpenRouter request failed.");
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
      repositoryOverrideEnabled: true,
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

  it("uses the optional upstream safety check for an ordinary commit", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: {
        tagPushBehavior: "all",
        requireUpToDateUpstreamBeforeCommit: true
      }
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("src/safe.ts", { indexStatus: "M", isStaged: true })]
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/safe\.ts/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: safe commit");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    await waitFor(() => expect(githead.commitWithRemoteCheck).toHaveBeenCalledWith({
      repoPath,
      message: "fix: safe commit",
      operationId: expect.any(String)
    }));
    expect(githead.commitChanges).not.toHaveBeenCalled();
  });

  it("keeps the staged commit ready when the optional upstream check finds remote commits", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: {
        tagPushBehavior: "all",
        requireUpToDateUpstreamBeforeCommit: true
      }
    });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("src/safe.ts", { indexStatus: "M", isStaged: true })]
    }));
    vi.mocked(githead.commitWithRemoteCheck).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "The remote branch has 1 new commit. Pull or rebase before committing. No commit was created.",
      outcome: "remote-ahead",
      commitCreated: false,
      branchName: "main",
      ahead: 0,
      behind: 1
    });

    render(<App />);

    await screen.findByRole("option", { name: /src\/safe\.ts/ });
    const message = screen.getByPlaceholderText("Summarize staged changes...");
    await user.type(message, "fix: safe commit");
    await user.click(screen.getByRole("button", { name: /^Commit$/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("No commit was created");
    expect((message as HTMLTextAreaElement).value).toBe("fix: safe commit");
    expect(githead.commitChanges).not.toHaveBeenCalled();
  });

  it("uses one coordinated safety check, commit, and push operation", async () => {
    const user = userEvent.setup();
    const pendingCommit = defer<GitCommitAndPushResult>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 0,
      behind: 0,
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitAndPush).mockReturnValue(pendingCommit.promise);

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: restore commit and push");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await waitFor(() => expect(githead.commitAndPush).toHaveBeenCalledWith({
      repoPath,
      message: "fix: restore commit and push",
      operationId: expect.any(String)
    }));
    expect(githead.commitChanges).not.toHaveBeenCalled();
    expect(githead.runGitAction).not.toHaveBeenCalled();

    pendingCommit.resolve({
      ...createOperationResult(),
      outcome: "pushed",
      commitCreated: true,
      branchName: "main",
      ahead: 0,
      behind: 0,
      previousHeadOid: "a".repeat(40),
      headOid: "b".repeat(40),
      canUndoCommit: false
    });
    await waitFor(() => expect((screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement).value).toBe(""));
  });

  it("shows a safety warning without creating a commit when the fetched remote is ahead", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [
        createStatusFile("src/renderer/App.tsx", {
          indexStatus: "M",
          isStaged: true
        })
      ]
    }));
    vi.mocked(githead.commitAndPush).mockResolvedValue({
      ...createOperationResult({ exitCode: -1, stderr: "The remote branch has 2 new commits. Pull or rebase before committing and pushing. No commit was created." }),
      outcome: "remote-ahead",
      commitCreated: false,
      branchName: "main",
      ahead: 0,
      behind: 2,
      previousHeadOid: null,
      headOid: null,
      canUndoCommit: false
    });

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: failed commit");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No commit was created");
    expect(githead.commitAndPush).toHaveBeenCalledTimes(1);
    expect(githead.commitChanges).not.toHaveBeenCalled();
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("asks the user to publish an untracked branch before creating the commit", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      upstream: null,
      ahead: null,
      behind: null,
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "fetch" },
        { name: "origin", url: "https://example.test/repo.git", direction: "push" }
      ],
      files: [createStatusFile("src/renderer/App.tsx", { indexStatus: "M", isStaged: true })]
    }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: publish safely");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));

    expect(await screen.findByRole("dialog", { name: "Publish Branch" })).toBeTruthy();
    expect(screen.getByText(/No commit has been created/)).toBeTruthy();
    expect(githead.commitAndPush).not.toHaveBeenCalled();
    expect(githead.commitChanges).not.toHaveBeenCalled();
  });

  it("offers and runs the guarded undo after a non-fast-forward race", async () => {
    const user = userEvent.setup();
    const previousHeadOid = "a".repeat(40);
    const headOid = "b".repeat(40);
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("src/renderer/App.tsx", { indexStatus: "M", isStaged: true })]
    }));
    vi.mocked(githead.commitAndPush).mockResolvedValue({
      ...createOperationResult({ exitCode: 1, stderr: "The remote changed after the safety check. You can undo the new commit and keep its changes staged." }),
      outcome: "push-failed",
      commitCreated: true,
      branchName: "main",
      ahead: 0,
      behind: 0,
      previousHeadOid,
      headOid,
      canUndoCommit: true
    });
    vi.mocked(githead.undoCommitAndKeepStaged).mockResolvedValue(createOperationResult({ stdout: "Commit undone. Its changes remain staged." }));

    render(<App />);

    await screen.findByRole("option", { name: /src\/renderer\/App\.tsx/ });
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "fix: raced push");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await user.click(await screen.findByRole("button", { name: "Undo commit" }));

    await waitFor(() => expect(githead.undoCommitAndKeepStaged).toHaveBeenCalledWith({
      repoPath,
      branchName: "main",
      expectedHeadOid: headOid,
      previousHeadOid,
      operationId: expect.any(String)
    }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo commit" })).toBeNull());
  });

  it("does not apply a late commit-and-push result to a newly selected repository", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Commit-B";
    const pendingCommit = defer<GitCommitAndPushResult>();
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      ahead: 1,
      behind: 0,
      files: [createStatusFile(
        requestedRepoPath === repoPath ? "src/a.ts" : "src/b.ts",
        { indexStatus: "M", isStaged: true }
      )]
    }));
    vi.mocked(githead.commitAndPush).mockReturnValue(pendingCommit.promise);

    render(<App />);

    await screen.findByRole("option", { name: /src\/a\.ts/ });
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText("Summarize staged changes..."), "feat: repository A");
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit & Push" }));
    await waitFor(() => expect(githead.commitAndPush).toHaveBeenCalledWith({
      repoPath,
      message: "feat: repository A",
      operationId: expect.any(String)
    }));

    pendingCommit.resolve({
      ...createOperationResult({ repoPath }),
      outcome: "pushed",
      commitCreated: true,
      branchName: "main",
      ahead: 0,
      behind: 0,
      previousHeadOid: "a".repeat(40),
      headOid: "b".repeat(40),
      canUndoCommit: false
    });
    pendingRepositoryChoice.resolve(otherRepo);
    await screen.findByRole("option", { name: /src\/b\.ts/ });
    const message = screen.getByPlaceholderText("Summarize staged changes...") as HTMLTextAreaElement;
    await user.clear(message);
    await user.type(message, "feat: repository B");

    await flushRendererAsync();

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

    const activityLogTab = await waitFor(() => screen.getByRole("tab", { name: "Activity Log, unread output available" }));
    expect(activityLogTab.getAttribute("data-attention")).toBe("unread");
    await user.click(activityLogTab);
    await waitFor(() => expect(activityLogTab.getAttribute("data-attention")).toBe("none"));
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
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeTruthy();
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

    expect((await screen.findByRole("status")).textContent).toBe("Loading release notes");
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

    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));
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

    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));

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

    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));
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

    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));
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

    await user.click(screen.getByRole("tab", { name: /^Activity Log/ }));
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
});
