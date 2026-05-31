import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { GitService } from "./gitService";

interface RunnerCall {
  command: string;
  args: string[];
  options?: ProcessRunOptions;
}

class FakeRunner implements ProcessRunner {
  readonly calls: RunnerCall[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    const call: RunnerCall = {
      command,
      args
    };

    if (options) {
      call.options = options;
    }

    this.calls.push(call);

    const result = this.results.shift();
    if (!result) {
      throw new Error("Fake runner has no result queued.");
    }

    if (result.stdout) {
      options?.onOutput?.({
        stream: "stdout",
        text: result.stdout
      });
    }

    if (result.stderr) {
      options?.onOutput?.({
        stream: "stderr",
        text: result.stderr
      });
    }

    return result;
  }
}

const ok = (stdout = ""): ProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: ""
});

const failure = (stderr = "fatal: failed"): ProcessResult => ({
  exitCode: 1,
  stdout: "",
  stderr
});

const oid = "0123456789abcdef0123456789abcdef01234567";

function trackedRecord(xy: string, path: string): string {
  return `1 ${xy} N... 100644 100644 100644 ${oid} ${oid} ${path}`;
}

function renamedRecord(xy: string, path: string): string {
  return `2 ${xy} N... 100644 100644 100644 ${oid} ${oid} R100 ${path}`;
}

function conflictedRecord(xy: string, path: string): string {
  return `u ${xy} N... 100644 100644 100644 ${oid} ${oid} ${oid} ${path}`;
}

function stdinText(call: RunnerCall): string {
  const stdin = call.options?.stdin;

  if (typeof stdin === "string") {
    return stdin;
  }

  return stdin?.toString("utf8") ?? "";
}

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("GitService", () => {
  it.each([
    [
      "fetch",
      [
        "-C",
        "D:\\Repo",
        "fetch",
        "--all",
        "--prune"
      ]
    ],
    [
      "pull",
      [
        "-C",
        "D:\\Repo",
        "pull",
        "--ff-only"
      ]
    ],
    [
      "push",
      [
        "-C",
        "D:\\Repo",
        "push"
      ]
    ]
  ] as const)("maps %s to the expected git command", async (action, expectedArgs) => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("done\n")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: expectedArgs
    });
  });

  it("rejects non-repository folders in summaries", async () => {
    const runner = new FakeRunner([
      failure("fatal: not a git repository")
    ]);
    const service = new GitService(runner);

    const summary = await service.getRepoSummary("D:\\NotRepo");

    expect(summary.isValid).toBe(false);
    expect(summary.validationErrors).toContain("Selected folder is not a git repository.");
    expect(runner.calls).toHaveLength(1);
  });

  it("returns structured failures without throwing", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: no upstream configured")
    ]);
    const service = new GitService(runner);
    const output: string[] = [];

    const result = await service.runGitAction(
      {
        repoPath: "D:\\Repo",
        action: "push"
      },
      (event) => output.push(event.text)
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fatal: no upstream configured");
    expect(output.join("")).toContain("git -C");
    expect(output.join("")).toContain("exited with code 1");
  });

  it("parses repo details and porcelain v2 file states", async () => {
    const status = [
      "# branch.oid abc",
      "# branch.head main",
      trackedRecord("M.", "staged.ts"),
      trackedRecord(".M", "unstaged.ts"),
      "? new file.ts",
      trackedRecord("D.", "deleted.ts"),
      renamedRecord("R.", "new-name.ts"),
      "old-name.ts",
      conflictedRecord("UU", "conflict.ts")
    ].join("\0");
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok("origin/main\n"),
      ok("origin\thttps://example.test/repo.git (fetch)\norigin\thttps://example.test/repo.git (push)\n"),
      ok(`${status}\0`),
      ok(`${oid}\n`),
      ok("main\torigin/main\t*\nfeature/nav\t\t \n")
    ]);
    const service = new GitService(runner);

    const summary = await service.getRepoSummary("D:\\Repo");

    expect(summary).toMatchObject({
      isValid: true,
      branch: "main",
      upstream: "origin/main",
      hasHead: true
    });
    expect(summary.branches).toEqual([
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
    ]);
    expect(summary.remotes).toHaveLength(2);
    expect(summary.files).toEqual([
      expect.objectContaining({
        path: "staged.ts",
        indexStatus: "M",
        worktreeStatus: ".",
        isStaged: true,
        isUnstaged: false
      }),
      expect.objectContaining({
        path: "unstaged.ts",
        indexStatus: ".",
        worktreeStatus: "M",
        isStaged: false,
        isUnstaged: true
      }),
      expect.objectContaining({
        path: "new file.ts",
        indexStatus: "?",
        worktreeStatus: "?",
        isStaged: false,
        isUnstaged: true
      }),
      expect.objectContaining({
        path: "deleted.ts",
        indexStatus: "D",
        isStaged: true
      }),
      expect.objectContaining({
        path: "new-name.ts",
        originalPath: "old-name.ts",
        indexStatus: "R",
        isStaged: true
      }),
      expect.objectContaining({
        path: "conflict.ts",
        isStaged: true,
        isUnstaged: true,
        isConflicted: true
      })
    ]);
  });

  it("loads commit history with parent hashes and refs", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\n`),
      ok([
        `\x1f${oid}\x1fad4f1df\x1fHEAD -> refs/heads/master, refs/remotes/origin/master, tag: refs/tags/v1\x1ffix(ai): combat attacks now properly loop\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-26T21:42:20-07:00\x1f2 hours ago\x1f${"1".repeat(40)} ${"2".repeat(40)}\x1e`,
        `\x1f${"1".repeat(40)}\x1f1111111\x1frefs/heads/feature\x1ffeat: add graph\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-25T10:00:00-07:00\x1fyesterday\x1f\x1e`
      ].join("\n"))
    ]);
    const service = new GitService(runner);

    const history = await service.getCommitHistory({
      repoPath: "D:\\Repo",
      limit: 200
    });

    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: expect.arrayContaining([
        "log",
        "--topo-order",
        "--parents",
        "--max-count=200",
        "--decorate=full"
      ])
    });
    expect(runner.calls.at(-1)?.args).not.toContain("--graph");
    expect(runner.calls.at(-1)?.args).toContain("--pretty=format:%x1f%H%x1f%h%x1f%D%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%ar%x1f%P%x1e");
    expect(history).toEqual([
      expect.objectContaining({
        hash: oid,
        shortHash: "ad4f1df",
        parents: [
          "1".repeat(40),
          "2".repeat(40)
        ],
        subject: "fix(ai): combat attacks now properly loop",
        refs: [
          {
            name: "master",
            kind: "branch"
          },
          {
            name: "origin/master",
            kind: "remote"
          },
          {
            name: "v1",
            kind: "tag"
          }
        ]
      }),
      expect.objectContaining({
        parents: [],
        refs: [
          {
            name: "feature",
            kind: "branch"
          }
        ]
      })
    ]);
  });

  it("returns empty commit history when HEAD does not exist", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: Needed a single revision")
    ]);
    const service = new GitService(runner);

    await expect(service.getCommitHistory({
      repoPath: "D:\\Repo"
    })).resolves.toEqual([]);
    expect(runner.calls).toHaveLength(2);
  });

  it("parses root, normal, merge, and octopus parent lists", async () => {
    const firstParent = "1".repeat(40);
    const secondParent = "2".repeat(40);
    const thirdParent = "3".repeat(40);
    const fourthParent = "4".repeat(40);
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\n`),
      ok([
        `\x1f${oid}\x1fad4f1df\x1f\x1fmerge\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-26T21:42:20-07:00\x1f2 hours ago\x1f${firstParent} ${secondParent}\x1e`,
        `\x1f${firstParent}\x1f1111111\x1f\x1fnormal\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-25T10:00:00-07:00\x1fyesterday\x1f${thirdParent}\x1e`,
        `\x1f${secondParent}\x1f2222222\x1f\x1foctopus\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-24T10:00:00-07:00\x1f2 days ago\x1f${thirdParent} ${fourthParent} ${oid}\x1e`,
        `\x1f${thirdParent}\x1f3333333\x1f\x1froot\x1fTaylor Bombay\x1ftaylor@example.test\x1f2026-05-23T10:00:00-07:00\x1f3 days ago\x1f\x1e`
      ].join("\n"))
    ]);
    const service = new GitService(runner);

    const history = await service.getCommitHistory({
      repoPath: "D:\\Repo",
      limit: 200
    });

    expect(history.map((commit) => commit.parents)).toEqual([
      [
        firstParent,
        secondParent
      ],
      [
        thirdParent
      ],
      [
        thirdParent,
        fourthParent,
        oid
      ],
      []
    ]);
  });

  it("loads commit details with changed file stats", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\x1fad4f1df\x1fHEAD -> refs/heads/master\x1fSubject\x1fTaylor\x1ftaylor@example.test\x1f2026-05-26T21:42:20-07:00\x1fTaylor\x1ftaylor@example.test\x1f2026-05-26T21:42:20-07:00\x1f${"1".repeat(40)}\x1eBody text\n`),
      ok(`M\0src/app.ts\0R100\0old.ts\0new.ts\0`),
      ok(`12\t3\tsrc/app.ts\0`)
    ]);
    const service = new GitService(runner);

    const details = await service.getCommitDetails({
      repoPath: "D:\\Repo",
      hash: oid
    });

    expect(details).toMatchObject({
      hash: oid,
      shortHash: "ad4f1df",
      body: "Body text",
      parents: [
        "1".repeat(40)
      ],
      files: [
        {
          path: "src/app.ts",
          status: "M",
          additions: 12,
          deletions: 3
        },
        {
          path: "new.ts",
          originalPath: "old.ts",
          status: "R",
          additions: 0,
          deletions: 0
        }
      ]
    });
  });

  it("loads and truncates selected commit file diffs", async () => {
    const largeDiff = `diff --git a/a.ts b/a.ts\n${"x".repeat(260_000)}`;
    const runner = new FakeRunner([
      ok("true\n"),
      ok(largeDiff)
    ]);
    const service = new GitService(runner);

    const diff = await service.getCommitFileDiff({
      repoPath: "D:\\Repo",
      hash: oid,
      path: "a.ts"
    });

    expect(diff.kind).toBe("text");
    expect(diff.truncated).toBe(true);
    expect(diff.text.length).toBe(250_000);
    expect(runner.calls.at(-1)).toMatchObject({
      args: [
        "-C",
        "D:\\Repo",
        "show",
        "--format=",
        "--no-color",
        "--no-ext-diff",
        "--find-renames",
        "--find-copies",
        oid,
        "--",
        "a.ts"
      ]
    });
  });

  it("rejects invalid commit hashes before reading commit details", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    await expect(service.getCommitDetails({
      repoPath: "D:\\Repo",
      hash: "HEAD~1"
    })).rejects.toThrow("Commit hash is invalid.");
    expect(runner.calls).toHaveLength(1);
  });

  it("stages selected files with NUL-delimited pathspec stdin", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.stageFiles({
      repoPath: "D:\\Repo",
      paths: [
        "a file.ts",
        "src/nested.ts"
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "-C",
        "D:\\Repo",
        "add",
        "--pathspec-from-file=-",
        "--pathspec-file-nul"
      ]
    });
    expect(stdinText(runner.calls.at(-1)!)).toBe("a file.ts\0src/nested.ts\0");
  });

  it("unstages with restore when HEAD exists", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\n`),
      ok()
    ]);
    const service = new GitService(runner);

    await service.unstageFiles({
      repoPath: "D:\\Repo",
      paths: [
        "staged.ts"
      ]
    });

    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "restore",
      "--staged",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("staged.ts\0");
  });

  it("unstages initial staged additions with rm --cached when HEAD is absent", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: Needed a single revision"),
      ok()
    ]);
    const service = new GitService(runner);

    await service.unstageFiles({
      repoPath: "D:\\Repo",
      paths: [
        "new.ts"
      ]
    });

    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "rm",
      "--cached",
      "-r",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("new.ts\0");
  });

  it("commits with the commit message supplied on stdin", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("[main abc123] subject\n")
    ]);
    const service = new GitService(runner);

    const result = await service.commitChanges({
      repoPath: "D:\\Repo",
      message: "subject\n\nbody\n"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "commit",
      "--file=-"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("subject\n\nbody\n");
  });

  it("switches branches without remote guessing", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/nav\n"),
      ok("Switched to branch 'feature/nav'\n")
    ]);
    const service = new GitService(runner);

    const result = await service.switchBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/nav"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "switch",
      "--no-guess",
      "feature/nav"
    ]);
  });

  it("creates and switches to a new branch", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/new\n"),
      failure(""),
      ok("Switched to a new branch 'feature/new'\n")
    ]);
    const service = new GitService(runner);

    const result = await service.createBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/new"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-2)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "show-ref",
      "--verify",
      "--quiet",
      "refs/heads/feature/new"
    ]);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "switch",
      "-c",
      "feature/new"
    ]);
  });

  it("rejects invalid branch names before switching", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: 'bad..name' is not a valid branch name")
    ]);
    const service = new GitService(runner);

    const result = await service.switchBranch({
      repoPath: "D:\\Repo",
      branchName: "bad..name"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("not a valid branch name");
    expect(runner.calls).toHaveLength(2);
  });

  it("does not overwrite existing branches", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/existing\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.createBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/existing"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "Branch already exists."
    });
    expect(runner.calls).toHaveLength(3);
  });

  it("returns the full staged diff", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("diff --git a/a.ts b/a.ts\n+added\n")
    ]);
    const service = new GitService(runner);

    const result = await service.getStagedDiff("D:\\Repo");

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "diff --git a/a.ts b/a.ts\n+added\n"
    });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff"
    ]);
  });

  it("reverts staged changes by unstaging with restore when HEAD exists", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("true\n"),
      ok(`${oid}\n`),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      path: "staged.ts",
      side: "staged"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "restore",
      "--staged",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("staged.ts\0");
  });

  it("reverts initial staged additions with rm --cached when HEAD is absent", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("true\n"),
      failure("fatal: Needed a single revision"),
      ok()
    ]);
    const service = new GitService(runner);

    await service.revertFileChanges({
      repoPath: "D:\\Repo",
      path: "new.ts",
      side: "staged"
    });

    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "rm",
      "--cached",
      "-r",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("new.ts\0");
  });

  it("reverts unstaged tracked changes with git restore --worktree", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${trackedRecord(".M", "src/file.ts")}\0`),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      path: "src/file.ts",
      side: "unstaged"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "restore",
      "--worktree",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("src/file.ts\0");
  });

  it("rejects empty paths when reverting file changes", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      path: "   ",
      side: "unstaged"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Select a file.");
  });

  it("rejects revert for untracked files", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("? new.ts\0")
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      path: "new.ts",
      side: "unstaged"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Untracked files cannot be reverted. Use Delete to remove this file.");
  });

  it("appends exact repo-relative paths to .gitignore", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.writeFile(path.join(repoRoot, ".gitignore"), "dist/\n", "utf8");
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${repoRoot}\n`)
      ]);
      const service = new GitService(runner);

      const result = await service.addPathToIgnore({
        repoPath: repoRoot,
        path: "src/file name.ts"
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.readFile(path.join(repoRoot, ".gitignore"), "utf8"))
        .resolves.toBe("dist/\nsrc/file name.ts\n");
    });
  });

  it("does not duplicate exact .gitignore lines", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.writeFile(path.join(repoRoot, ".gitignore"), "src/file.ts\n", "utf8");
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${repoRoot}\n`)
      ]);
      const service = new GitService(runner);

      const result = await service.addPathToIgnore({
        repoPath: repoRoot,
        path: "src/file.ts"
      });

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "Path is already ignored."
      });
      await expect(fs.readFile(path.join(repoRoot, ".gitignore"), "utf8"))
        .resolves.toBe("src/file.ts\n");
    });
  });

  it("creates .gitignore when adding an ignored path", async () => {
    await withTempDir(async (repoRoot) => {
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${repoRoot}\n`)
      ]);
      const service = new GitService(runner);

      const result = await service.addPathToIgnore({
        repoPath: repoRoot,
        path: "new-file.ts"
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.readFile(path.join(repoRoot, ".gitignore"), "utf8"))
        .resolves.toBe("new-file.ts\n");
    });
  });

  it("preserves .gitignore content and adds newline separation", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.writeFile(path.join(repoRoot, ".gitignore"), "# generated\nbuild", "utf8");
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${repoRoot}\n`)
      ]);
      const service = new GitService(runner);

      await service.addPathToIgnore({
        repoPath: repoRoot,
        path: "src/next.ts"
      });

      await expect(fs.readFile(path.join(repoRoot, ".gitignore"), "utf8"))
        .resolves.toBe("# generated\nbuild\nsrc/next.ts\n");
    });
  });

  it("returns staged text diffs", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("diff --git a/a.ts b/a.ts\n+added\n")
    ]);
    const service = new GitService(runner);

    const diff = await service.getFileDiff({
      repoPath: "D:\\Repo",
      path: "a.ts",
      side: "staged"
    });

    expect(diff).toMatchObject({
      kind: "text",
      text: expect.stringContaining("+added")
    });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff",
      "--",
      "a.ts"
    ]);
  });

  it("uses no-index diff for untracked files and treats exit code 1 as a diff", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("? new.ts\0"),
      {
        exitCode: 1,
        stdout: "diff --git a/new.ts b/new.ts\n+new\n",
        stderr: ""
      }
    ]);
    const service = new GitService(runner);

    const diff = await service.getFileDiff({
      repoPath: "D:\\Repo",
      path: "new.ts",
      side: "unstaged"
    });

    expect(diff.kind).toBe("text");
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "diff",
        "--no-index",
        "--no-color",
        "--",
        "/dev/null",
        "new.ts"
      ],
      options: {
        cwd: "D:\\Repo"
      }
    });
  });

  it("returns binary and error diff results distinctly", async () => {
    const binaryRunner = new FakeRunner([
      ok("true\n"),
      ok("diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n")
    ]);
    const binaryService = new GitService(binaryRunner);

    await expect(binaryService.getFileDiff({
      repoPath: "D:\\Repo",
      path: "logo.png",
      side: "staged"
    })).resolves.toMatchObject({
      kind: "binary",
      text: "Binary file diff is not available."
    });

    const errorRunner = new FakeRunner([
      ok("true\n"),
      failure("fatal: bad path")
    ]);
    const errorService = new GitService(errorRunner);

    await expect(errorService.getFileDiff({
      repoPath: "D:\\Repo",
      path: "missing.ts",
      side: "staged"
    })).resolves.toMatchObject({
      kind: "error",
      text: "fatal: bad path"
    });
  });
});
