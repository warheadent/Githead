import { describe, expect, it } from "vite-plus/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { NodeProcessRunner } from "./processRunner";
import { createTerminalColorEnv, GitService, parsePorcelainStatus, parseWorktrees } from "./gitService";

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

describe("GitService progressive Repository sections", () => {
  it("loads lightweight identity without File Status, submodules, actions, or ahead counts", async () => {
    const runner = new FakeRunner([ok("true\n"), ok("feature/fast\n"), ok(`${oid}\n`)]);
    const service = new GitService(runner);

    await expect(service.getRepoIdentity({ repoPath: "D:\\Repo", generation: 7 })).resolves.toMatchObject({ branch: "feature/fast", generation: 7 });

    const commands = runner.calls.map((call) => call.args.slice(2).join(" "));
    expect(commands).not.toContain(expect.stringContaining("status --porcelain"));
    expect(commands).not.toContain(expect.stringContaining("submodule"));
    expect(commands).not.toContain(expect.stringContaining("rev-list"));
  });

  it("retains full untracked enumeration in the File Status section", async () => {
    const runner = new FakeRunner([ok("")]);
    const service = new GitService(runner);

    await service.getRepoStatus({ repoPath: "D:\\Repo", generation: 2 });

    expect(runner.calls[0]?.args).toEqual(["-C", "D:\\Repo", "--no-optional-locks", "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all"]);
  });
});

const failure = (stderr = "fatal: failed"): ProcessResult => ({
  exitCode: 1,
  stdout: "",
  stderr
});

const dubiousOwnershipError = [
  "fatal: detected dubious ownership in repository at 'D:/Repo'",
  "'D:/Repo' is owned by:",
  "\tEXAMPLE/owner (S-1-5-21-1000)",
  "but the current user is:",
  "\tEXAMPLE/current-user (S-1-5-21-2000)",
  "To add an exception for this directory, call:",
  "\tgit config --global --add safe.directory D:/Repo"
].join("\n");

const oid = "0123456789abcdef0123456789abcdef01234567";
const safeDirectoryRepoPath = path.join(path.parse(process.cwd()).root, "Repo");
const normalizedSafeDirectoryRepoPath = path.normalize(safeDirectoryRepoPath).replace(/\\/g, "/");

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

interface TerminalEnvSnapshot {
  NO_COLOR: string | undefined;
  FORCE_COLOR: string | undefined;
  TERM: string | undefined;
  COLORTERM: string | undefined;
}

function snapshotTerminalEnv(): TerminalEnvSnapshot {
  return {
    NO_COLOR: process.env.NO_COLOR,
    FORCE_COLOR: process.env.FORCE_COLOR,
    TERM: process.env.TERM,
    COLORTERM: process.env.COLORTERM
  };
}

function restoreTerminalEnv(snapshot: TerminalEnvSnapshot): void {
  for (const key of [
    "NO_COLOR",
    "FORCE_COLOR",
    "TERM",
    "COLORTERM"
  ] as const) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
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

function repoSummaryResults(repoRoot: string): ProcessResult[] {
  return [
    ok("true\n"),
    ok("main\n"),
    ok("origin/main\n"),
    ok("origin\thttps://example.test/repo.git (fetch)\norigin\thttps://example.test/repo.git (push)\n"),
    ok("\0"),
    ok(`${oid}\n`),
    ok("main\torigin/main\t*\n"),
    ok("refs/remotes/origin/main\torigin/main\t\n"),
    ok(`${repoRoot}\n`)
  ];
}

describe("GitService", () => {
  it("loads working, staged, and commit Markdown preview versions", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "README.md"), "# Working\n", "utf8");
      const runner = new FakeRunner([
        ok("true\n"), ok(`${dir}\n`),
        ok("true\n"), ok("# Staged\n"),
        ok("true\n"), ok("# Commit\n")
      ]);
      const service = new GitService(runner);

      await expect(service.getFilePreview({ repoPath: dir, path: "README.md", source: { kind: "working" } }))
        .resolves.toEqual({ path: "README.md", text: "# Working\n" });
      await expect(service.getFilePreview({ repoPath: dir, path: "README.md", source: { kind: "staged" } }))
        .resolves.toEqual({ path: "README.md", text: "# Staged\n" });
      await expect(service.getFilePreview({ repoPath: dir, path: "README.md", source: { kind: "commit", hash: oid } }))
        .resolves.toEqual({ path: "README.md", text: "# Commit\n" });

      expect(runner.calls[3]?.args).toEqual(["-C", dir, "cat-file", "blob", ":README.md"]);
      expect(runner.calls[5]?.args).toEqual(["-C", dir, "cat-file", "blob", `${oid}:README.md`]);
    });
  });

  it("rejects unsafe, missing, invalid-revision, and oversized Markdown previews", async () => {
    const oversized = "x".repeat(1_000_001);
    const runner = new FakeRunner([
      ok("true\n"),
      ok("true\n"),
      ok("true\n"), failure("fatal: not found"),
      ok("true\n"), ok(oversized)
    ]);
    const service = new GitService(runner);

    await expect(service.getFilePreview({ repoPath: "D:\\Repo", path: "../README.md", source: { kind: "staged" } }))
      .rejects.toThrow("inside the repository");
    await expect(service.getFilePreview({ repoPath: "D:\\Repo", path: "README.md", source: { kind: "commit", hash: "HEAD~1" } }))
      .rejects.toThrow("Commit hash is invalid");
    await expect(service.getFilePreview({ repoPath: "D:\\Repo", path: "README.md", source: { kind: "staged" } }))
      .rejects.toThrow("fatal: not found");
    await expect(service.getFilePreview({ repoPath: "D:\\Repo", path: "README.md", source: { kind: "staged" } }))
      .rejects.toThrow("larger than 1 MB");
  });

  it("parses NUL-delimited worktree records and preserves worktree state", () => {
    const parsed = parseWorktrees([
      "worktree D:/Repo", `HEAD ${oid}`, "branch refs/heads/main", "",
      "worktree D:/Repo feature", `HEAD ${oid}`, "branch refs/heads/feature/nav", "locked portable drive", "",
      "worktree D:/Missing", `HEAD ${oid}`, "detached", "prunable gitdir file points to non-existent location", ""
    ].join("\0"));

    expect(parsed).toEqual([
      expect.objectContaining({ path: path.normalize("D:/Repo"), branch: "main", isMain: true, isBare: false }),
      expect.objectContaining({ path: path.normalize("D:/Repo feature"), branch: "feature/nav", isMain: false, locked: true, lockReason: "portable drive" }),
      expect.objectContaining({ path: path.normalize("D:/Missing"), branch: null, isDetached: true, prunable: true, prunableReason: "gitdir file points to non-existent location" })
    ]);
  });

  it("parses bare and reasonless locked worktrees", () => {
    expect(parseWorktrees(["worktree D:/Bare.git", "bare", "", "worktree D:/Linked", `HEAD ${oid}`, "detached", "locked", ""].join("\0"))).toEqual([
      expect.objectContaining({ isMain: false, isBare: true }),
      expect.objectContaining({ isMain: false, isDetached: true, locked: true, lockReason: null })
    ]);
  });

  it("retries transient status failures before checking worktree removal", async () => {
    const repo = path.resolve("D:/Repo");
    const linked = path.resolve("D:/Repo-feature");
    const worktrees = [
      `worktree ${repo}`,
      `HEAD ${oid}`,
      "branch refs/heads/main",
      "",
      `worktree ${linked}`,
      `HEAD ${oid}`,
      "branch refs/heads/feature",
      ""
    ].join("\0");
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${path.join(repo, ".git")}\n`),
      ok(worktrees),
      failure("fatal: transient status failure"),
      ok("? dirty.txt\0")
    ]);
    const service = new GitService(runner);

    await expect(service.checkWorktreeRemoval({ repoPath: repo, worktreePath: linked })).resolves.toMatchObject({
      canRemove: false,
      canForceRemove: true,
      isClean: false,
      reason: "Worktree has uncommitted or untracked files."
    });
    expect(runner.calls.filter((call) => call.args.includes("status"))).toHaveLength(2);
  });

  it("matches a worktree request through a filesystem path alias", async () => {
    await withTempDir(async (dir) => {
      const repo = path.join(dir, "Repo");
      const linked = path.join(dir, "Repo-feature");
      const linkedAlias = path.join(dir, "Repo-feature-alias");
      await fs.mkdir(repo);
      await fs.mkdir(linked);
      await fs.symlink(linked, linkedAlias, process.platform === "win32" ? "junction" : "dir");
      const worktrees = [
        `worktree ${repo}`,
        `HEAD ${oid}`,
        "branch refs/heads/main",
        "",
        `worktree ${linked}`,
        `HEAD ${oid}`,
        "branch refs/heads/feature",
        ""
      ].join("\0");
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${path.join(repo, ".git")}\n`),
        ok(worktrees),
        ok("? dirty.txt\0")
      ]);
      const service = new GitService(runner);

      await expect(service.checkWorktreeRemoval({ repoPath: repo, worktreePath: linkedAlias })).resolves.toMatchObject({
        canRemove: false,
        canForceRemove: true,
        isClean: false,
        reason: "Worktree has uncommitted or untracked files."
      });
    });
  });

  it("creates, discovers, checks, and safely removes a linked worktree", async () => {
    await withTempDir(async (dir) => {
      const repo = path.join(dir, "Repo");
      const linked = path.join(dir, "Repo-feature");
      const runner = new NodeProcessRunner();
      const run = async (args: string[]): Promise<void> => {
        const result = await runner.run("git", args);
        expect(result.exitCode, result.stderr).toBe(0);
      };
      await run(["init", "-b", "main", repo]);
      await run(["-C", repo, "config", "user.name", "Githead Test"]);
      await run(["-C", repo, "config", "user.email", "githead@example.test"]);
      await fs.writeFile(path.join(repo, "README.md"), "test\n", "utf8");
      await run(["-C", repo, "add", "README.md"]);
      await run(["-C", repo, "commit", "-m", "Initial"]);
      await run(["-C", repo, "branch", "feature"]);

      const service = new GitService(runner);
      await expect(service.createWorktree({ repoPath: repo, destinationPath: linked, mode: "existing-branch", branchName: "feature" })).resolves.toMatchObject({ exitCode: 0 });
      const canonicalLinkedPath = await fs.realpath(linked);
      await expect(service.getWorktrees(repo)).resolves.toMatchObject({ worktrees: [expect.objectContaining({ isMain: true, branch: "main" }), expect.objectContaining({ path: path.normalize(canonicalLinkedPath), branch: "feature" })] });

      await fs.writeFile(path.join(linked, "dirty.txt"), "dirty\n", "utf8");
      await expect(service.checkWorktreeRemoval({ repoPath: repo, worktreePath: linked })).resolves.toMatchObject({ canRemove: false, canForceRemove: true, isClean: false });
      await expect(service.removeWorktree({ repoPath: repo, worktreePath: linked })).resolves.toMatchObject({ exitCode: -1, stderr: "Worktree has uncommitted or untracked files." });
      await expect(service.removeWorktree({ repoPath: repo, worktreePath: linked, force: true })).resolves.toMatchObject({ exitCode: 0 });
      await expect(fs.stat(linked)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("parses porcelain v2 submodule commit and dirty flags", () => {
    const parsed = parsePorcelainStatus([
      `1 .M S.MU 160000 160000 160000 ${oid} ${oid} vendor/engine`,
      ""
    ].join("\0"));

    expect(parsed.files[0]).toMatchObject({
      path: "vendor/engine",
      isUnstaged: true,
      submodule: {
        commitChanged: false,
        trackedChanges: true,
        untrackedChanges: true,
        canStage: false
      }
    });
  });

  it("runs recursive recorded-commit submodule lifecycle commands", async () => {
    const runner = new FakeRunner([ok("true\n"), ok(), ok("true\n"), ok()]);
    const service = new GitService(runner);

    await expect(service.updateSubmodules({ repoPath: "D:\\Repo", path: "vendor/engine" })).resolves.toMatchObject({ exitCode: 0 });
    await expect(service.syncSubmodules({ repoPath: "D:\\Repo" })).resolves.toMatchObject({ exitCode: 0 });
    expect(runner.calls[1]?.args).toEqual(["-C", "D:\\Repo", "submodule", "update", "--init", "--recursive", "--", "vendor/engine"]);
    expect(runner.calls[3]?.args).toEqual(["-C", "D:\\Repo", "submodule", "sync", "--recursive"]);
  });

  it("creates terminal color env with sensible defaults", () => {
    expect(createTerminalColorEnv({})).toMatchObject({
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    });
  });

  it("preserves existing terminal color env values", () => {
    expect(createTerminalColorEnv({
      FORCE_COLOR: "3",
      TERM: "xterm-direct",
      COLORTERM: "24bit"
    })).toMatchObject({
      FORCE_COLOR: "3",
      TERM: "xterm-direct",
      COLORTERM: "24bit"
    });
  });

  it("honors NO_COLOR when creating terminal color env", () => {
    expect(createTerminalColorEnv({
      NO_COLOR: "1"
    })).toBeUndefined();
  });

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

  it("pushes commits before pushing tags", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("branch pushed\n"),
      ok("tags pushed\n")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action: "push"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("branch pushed\ntags pushed\n");
    expect(runner.calls.slice(1)).toMatchObject([
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "push"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "push",
          "--tags"
        ]
      }
    ]);
  });

  it("does not push tags when pushing commits fails", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: no upstream configured")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action: "push"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fatal: no upstream configured");
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "-C",
        "D:\\Repo",
        "push"
      ]
    });
  });

  it("pushes HEAD to a selected remote branch before pushing tags to that remote", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/source\n"),
      ok("origin\nupstream\n"),
      ok("release/candidate\n"),
      ok("branch pushed\n"),
      ok("tags pushed\n")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action: "push",
      pushTarget: {
        sourceBranch: "feature/source",
        remoteName: "upstream",
        destinationBranch: "release/candidate"
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("branch pushed\ntags pushed\n");
    expect(runner.calls.slice(1)).toMatchObject([
      { args: ["-C", "D:\\Repo", "branch", "--show-current"] },
      { args: ["-C", "D:\\Repo", "remote"] },
      { args: ["-C", "D:\\Repo", "check-ref-format", "--branch", "release/candidate"] },
      { args: ["-C", "D:\\Repo", "push", "upstream", "HEAD:refs/heads/release/candidate"] },
      { args: ["-C", "D:\\Repo", "push", "upstream", "--tags"] }
    ]);
  });

  it("rejects a targeted push when the current branch changed", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/other\n")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action: "push",
      pushTarget: {
        sourceBranch: "feature/source",
        remoteName: "origin",
        destinationBranch: "release/candidate"
      }
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Current branch changed before pushing. Refresh and try again.");
    expect(runner.calls).toHaveLength(2);
  });

  it("rejects targeted pushes to missing remotes and invalid branch names", async () => {
    const missingRemoteRunner = new FakeRunner([
      ok("true\n"),
      ok("feature/source\n"),
      ok("origin\n")
    ]);
    const missingRemoteResult = await new GitService(missingRemoteRunner).runGitAction({
      repoPath: "D:\\Repo",
      action: "push",
      pushTarget: {
        sourceBranch: "feature/source",
        remoteName: "missing",
        destinationBranch: "release/candidate"
      }
    });
    expect(missingRemoteResult.exitCode).toBe(-1);
    expect(missingRemoteResult.stderr).toBe("Remote is invalid.");

    const invalidBranchRunner = new FakeRunner([
      ok("true\n"),
      ok("feature/source\n"),
      ok("origin\n"),
      failure("fatal: invalid branch name")
    ]);
    const invalidBranchResult = await new GitService(invalidBranchRunner).runGitAction({
      repoPath: "D:\\Repo",
      action: "push",
      pushTarget: {
        sourceBranch: "feature/source",
        remoteName: "origin",
        destinationBranch: "invalid branch"
      }
    });
    expect(invalidBranchResult.exitCode).toBe(-1);
    expect(invalidBranchResult.stderr).toBe("fatal: invalid branch name");
    expect(invalidBranchRunner.calls).toHaveLength(4);
  });

  it("does not push targeted tags when the branch push fails", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/source\n"),
      ok("origin\n"),
      ok("release/candidate\n"),
      failure("rejected non-fast-forward")
    ]);
    const service = new GitService(runner);

    const result = await service.runGitAction({
      repoPath: "D:\\Repo",
      action: "push",
      pushTarget: {
        sourceBranch: "feature/source",
        remoteName: "origin",
        destinationBranch: "release/candidate"
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("rejected non-fast-forward");
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "push",
      "origin",
      "HEAD:refs/heads/release/candidate"
    ]);
  });

  it("publishes a branch with upstream before pushing tags to the same remote", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("origin\n"),
      ok("feature/x\n"),
      ok("branch published\n"),
      ok("tags pushed\n")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "origin"
    });

    expect(result.action).toBe("publish");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("branch published\ntags pushed\n");
    expect(runner.calls).toMatchObject([
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "rev-parse",
          "--is-inside-work-tree"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "check-ref-format",
          "--branch",
          "feature/x"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "show-ref",
          "--verify",
          "--quiet",
          "refs/heads/feature/x"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "remote"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "branch",
          "--show-current"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "push",
          "--set-upstream",
          "origin",
          "feature/x"
        ]
      },
      {
        command: "git",
        args: [
          "-C",
          "D:\\Repo",
          "push",
          "origin",
          "--tags"
        ]
      }
    ]);
  });

  it("does not push tags when publishing a branch fails", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("origin\n"),
      ok("feature/x\n"),
      failure("fatal: rejected")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "origin"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fatal: rejected");
    expect(runner.calls).toHaveLength(6);
  });

  it("reports tag push failure after a branch is published", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("upstream\norigin\n"),
      ok("feature/x\n"),
      ok("branch published\n"),
      failure("fatal: tag rejected")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "upstream"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("branch published\n");
    expect(result.stderr).toBe("fatal: tag rejected");
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "-C",
        "D:\\Repo",
        "push",
        "upstream",
        "--tags"
      ]
    });
  });

  it("rejects invalid publish remotes", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("origin\n")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "missing"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Remote is invalid.");
    expect(runner.calls).toHaveLength(4);
  });

  it("rejects publishing when the current branch changed", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("origin\n"),
      ok("main\n")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "origin"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Current branch changed before publishing. Refresh and try again.");
    expect(runner.calls).toHaveLength(5);
  });

  it("rejects publishing from detached HEAD", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("feature/x\n"),
      ok(""),
      ok("origin\n"),
      ok("")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "feature/x",
      remoteName: "origin"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Current branch changed before publishing. Refresh and try again.");
    expect(runner.calls).toHaveLength(5);
  });

  it("rejects publish branch names that start with a dash", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.publishBranch({
      repoPath: "D:\\Repo",
      branchName: "-bad",
      remoteName: "origin"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Branch name cannot start with a dash.");
    expect(runner.calls).toHaveLength(1);
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

  it("adds terminal color environment hints to visible git action output", async () => {
    const original = snapshotTerminalEnv();
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    delete process.env.TERM;
    delete process.env.COLORTERM;

    try {
      const runner = new FakeRunner([
        ok("true\n"),
        ok("done\n")
      ]);
      const service = new GitService(runner);

      await service.runGitAction({
        repoPath: "D:\\Repo",
        action: "fetch"
      });

      expect(runner.calls.at(-1)?.options?.env).toMatchObject({
        FORCE_COLOR: "1",
        TERM: "xterm-256color",
        COLORTERM: "truecolor"
      });
    } finally {
      restoreTerminalEnv(original);
    }
  });

  it("does not add terminal color environment hints to parsed summary commands", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok("origin/main\n"),
      ok(""),
      ok("\0"),
      ok(`${oid}\n`),
      ok("main\torigin/main\t*\n"),
      ok(""),
      ok("D:\\Repo\n")
    ]);
    const service = new GitService(runner);

    await service.getRepoSummary("D:\\Repo");

    expect(runner.calls.some((call) => Boolean(call.options?.env))).toBe(false);
  });

  it("reports dubious ownership as a safe.directory requirement", async () => {
    const runner = new FakeRunner([
      failure(dubiousOwnershipError)
    ]);
    const service = new GitService(runner);

    const summary = await service.getRepoSummary("D:\\Repo");

    expect(summary.isValid).toBe(false);
    expect(summary.validationErrors).toContain("Git blocked this repository because its ownership differs from your current user.");
    expect(summary.validationErrors).not.toContain("Selected folder is not a git repository.");
    expect(summary.safeDirectory).toEqual({
      required: true,
      path: "D:/Repo",
      message: "Git blocked this repository because its ownership differs from your current user."
    });
  });

  it("rejects blank safe.directory requests before spawning git", async () => {
    const runner = new FakeRunner([]);
    const service = new GitService(runner);

    const result = await service.addSafeDirectory({
      repoPath: " "
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Select a repository folder.");
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects relative safe.directory requests before spawning git", async () => {
    const runner = new FakeRunner([]);
    const service = new GitService(runner);

    const result = await service.addSafeDirectory({
      repoPath: "Repo"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Repository folder must be an absolute path.");
    expect(runner.calls).toHaveLength(0);
  });

  it("adds a safe.directory exception through global git config", async () => {
    const runner = new FakeRunner([
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.addSafeDirectory({
      repoPath: safeDirectoryRepoPath
    });

    expect(result).toEqual({
      repoPath: normalizedSafeDirectoryRepoPath,
      exitCode: 0,
      stdout: "",
      stderr: ""
    });
    expect(runner.calls).toEqual([
      {
        command: "git",
        args: [
          "config",
          "--global",
          "--add",
          "safe.directory",
          normalizedSafeDirectoryRepoPath
        ]
      }
    ]);
  });

  it("returns safe.directory config failures without throwing", async () => {
    const runner = new FakeRunner([
      failure("error: could not lock config file")
    ]);
    const service = new GitService(runner);

    const result = await service.addSafeDirectory({
      repoPath: safeDirectoryRepoPath
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error: could not lock config file");
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

  it("clones repositories with safe argv construction and advanced options", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok("")
      ]);
      const service = new GitService(runner);

      const result = await service.cloneRepository({
        source: "git@github.com:openai/repo.git",
        parentPath: dir,
        directoryName: "repo",
        branchName: "main",
        depth: 1
      });

      expect(result.exitCode).toBe(0);
      expect(result.repoPath).toBe(path.join(dir, "repo"));
      expect(runner.calls).toHaveLength(1);
      expect(runner.calls[0]).toMatchObject({
        command: "git",
        args: [
          "clone",
          "--progress",
          "--branch",
          "main",
          "--depth",
          "1",
          "--",
          "git@github.com:openai/repo.git",
          path.join(dir, "repo")
        ],
        options: {
          cwd: dir
        }
      });
    });
  });

  it("checks repository access and parses branch details", async () => {
    const stdout = [
      "ref: refs/heads/main\tHEAD",
      "0123456789abcdef0123456789abcdef01234567\tHEAD",
      "0123456789abcdef0123456789abcdef01234567\trefs/heads/main",
      "abcdef0123456789abcdef0123456789abcdef01\trefs/heads/feature/demo"
    ].join("\n");
    const runner = new FakeRunner([
      ok(stdout)
    ]);
    const service = new GitService(runner);

    const result = await service.checkRepositoryAccess({
      source: "https://example.test/repo.git"
    });

    expect(result).toMatchObject({
      source: "https://example.test/repo.git",
      exitCode: 0,
      branches: [
        "feature/demo",
        "main"
      ],
      defaultBranch: "main"
    });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toMatchObject({
      command: "git",
      args: [
        "ls-remote",
        "--symref",
        "--",
        "https://example.test/repo.git",
        "HEAD",
        "refs/heads/*"
      ]
    });
    expect(runner.calls.at(0)?.options?.timeoutMs).toBeGreaterThan(0);
  });

  it("rejects empty repository access checks before spawning git", async () => {
    const runner = new FakeRunner([]);
    const service = new GitService(runner);

    const result = await service.checkRepositoryAccess({
      source: "   "
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Enter a repository URL or path.");
    expect(result.branches).toEqual([]);
    expect(result.defaultBranch).toBeNull();
    expect(runner.calls).toHaveLength(0);
  });

  it("returns failed repository access checks without branch details", async () => {
    const runner = new FakeRunner([
      failure("fatal: Authentication failed")
    ]);
    const service = new GitService(runner);

    const result = await service.checkRepositoryAccess({
      source: "git@example.test:owner/private.git"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("fatal: Authentication failed");
    expect(result.branches).toEqual([]);
    expect(result.defaultBranch).toBeNull();
  });

  it("redacts credentials from repository access check output", async () => {
    const source = "https://user:token@example.test/repo.git";
    const runner = new FakeRunner([
      failure(`fatal: Authentication failed for '${source}'`)
    ]);
    const service = new GitService(runner);

    const result = await service.checkRepositoryAccess({
      source
    });

    expect(result.stderr).toContain("https://***@example.test/repo.git");
    expect(result.stderr).not.toContain("user:token");
  });

  it("passes through repository access check timeouts as failures", async () => {
    const runner = new FakeRunner([
      {
        exitCode: -1,
        stdout: "",
        stderr: "",
        error: "Command timed out after 30000ms."
      }
    ]);
    const service = new GitService(runner);

    const result = await service.checkRepositoryAccess({
      source: "https://example.test/repo.git"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Command timed out after 30000ms.");
    expect(result.branches).toEqual([]);
  });

  it("treats clone depth 0 as a full clone", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok("")
      ]);
      const service = new GitService(runner);

      const result = await service.cloneRepository({
        source: "https://example.test/repo.git",
        parentPath: dir,
        directoryName: "repo",
        branchName: "",
        depth: 0
      });

      expect(result.exitCode).toBe(0);
      expect(runner.calls.at(0)?.args).not.toContain("--depth");
    });
  });

  it("rejects unsafe or unavailable clone destinations before spawning git", async () => {
    await withTempDir(async (dir) => {
      const nonEmptyDestination = path.join(dir, "existing");
      await fs.mkdir(nonEmptyDestination);
      await fs.writeFile(path.join(nonEmptyDestination, "file.txt"), "content", "utf8");

      const cases = [
        {
          request: {
            source: "",
            parentPath: dir,
            directoryName: "repo"
          },
          error: "Enter a repository URL or path."
        },
        {
          request: {
            source: "https://example.test/repo.git",
            parentPath: "relative",
            directoryName: "repo"
          },
          error: "Select an absolute destination folder."
        },
        {
          request: {
            source: "https://example.test/repo.git",
            parentPath: dir,
            directoryName: "..\\repo"
          },
          error: "Destination folder name cannot include a path."
        },
        {
          request: {
            source: "https://example.test/repo.git",
            parentPath: dir,
            directoryName: "existing"
          },
          error: "Destination folder already exists and is not empty."
        }
      ];

      for (const testCase of cases) {
        const runner = new FakeRunner([]);
        const service = new GitService(runner);
        const result = await service.cloneRepository({
          branchName: "",
          depth: null,
          ...testCase.request
        });

        expect(result.exitCode).toBe(-1);
        expect(result.stderr).toBe(testCase.error);
        expect(runner.calls).toHaveLength(0);
      }
    });
  });

  it("allows cloning into an empty existing destination folder", async () => {
    await withTempDir(async (dir) => {
      const destination = path.join(dir, "empty");
      await fs.mkdir(destination);
      const runner = new FakeRunner([
        ok("")
      ]);
      const service = new GitService(runner);

      const result = await service.cloneRepository({
        source: "https://example.test/repo.git",
        parentPath: dir,
        directoryName: "empty",
        branchName: "",
        depth: null
      });

      expect(result.exitCode).toBe(0);
      expect(runner.calls).toHaveLength(1);
    });
  });

  it("redacts credentials from clone output", async () => {
    await withTempDir(async (dir) => {
      const source = "https://user:token@example.test/repo.git";
      const runner = new FakeRunner([
        failure(`fatal: Authentication failed for '${source}'`)
      ]);
      const service = new GitService(runner);

      const result = await service.cloneRepository({
        source,
        parentPath: dir,
        directoryName: "repo",
        branchName: "",
        depth: null
      });

      expect(result.stderr).toContain("https://***@example.test/repo.git");
      expect(result.stderr).not.toContain("user:token");
    });
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
      ok(`${oid}\n`),
      ok(`${status}\0`),
      ok("origin/main\n"),
      ok("origin\thttps://example.test/repo.git (fetch)\norigin\thttps://example.test/repo.git (push)\n"),
      ok("main\torigin/main\t*\nfeature/nav\t\t \n"),
      ok([
        "refs/remotes/origin/HEAD\torigin\trefs/remotes/origin/main",
        "refs/remotes/origin/main\torigin/main\t",
        "refs/remotes/origin/feature/nav\torigin/feature/nav\t"
      ].join("\n")),
      ok("D:\\Repo\n"),
      ok("3\n")
    ]);
    const service = new GitService(runner);

    const summary = await service.getRepoSummary("D:\\Repo");

    expect(summary).toMatchObject({
      isValid: true,
      branch: "main",
      upstream: "origin/main",
      hasHead: true,
      githubRepository: null
    });
    expect(summary.defaultRemoteBranch).toEqual({
      name: "origin/main",
      remote: "origin",
      branch: "main"
    });
    expect(summary.commitsAheadOfDefaultBranch).toBe(3);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "rev-list",
      "--count",
      "origin/main..HEAD"
    ]);
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
    expect(summary.remoteBranches).toEqual([
      {
        name: "origin/feature/nav",
        remote: "origin",
        branch: "feature/nav"
      },
      {
        name: "origin/main",
        remote: "origin",
        branch: "main"
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

  it("reads local ahead and behind counts for a repository", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok([
        "# branch.oid 0123456789abcdef0123456789abcdef01234567",
        "# branch.head main",
        "# branch.upstream origin/main",
        "# branch.ab +1 -4"
      ].join("\0"))
    ]);
    const service = new GitService(runner);

    const status = await service.getRepoSyncStatus("D:\\Repo");

    expect(status).toEqual({
      repoPath: "D:\\Repo",
      kind: "git",
      isValid: true,
      ahead: 1,
      behind: 4,
      error: ""
    });
    expect(runner.calls[1]).toMatchObject({
      command: "git",
      args: [
        "-C",
        "D:\\Repo",
        "--no-optional-locks",
        "status",
        "--porcelain=v2",
        "-z",
        "--branch",
        "--untracked-files=no"
      ]
    });
  });

  it("returns zero sync counts when a repository has no ahead-behind status", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok([
        "# branch.oid 0123456789abcdef0123456789abcdef01234567",
        "# branch.head main"
      ].join("\0"))
    ]);
    const service = new GitService(runner);

    await expect(service.getRepoSyncStatus("D:\\Repo")).resolves.toEqual({
      repoPath: "D:\\Repo",
      kind: "git",
      isValid: true,
      ahead: 0,
      behind: 0,
      error: ""
    });
  });

  it("returns an invalid sync status without throwing for non-repositories", async () => {
    const runner = new FakeRunner([
      failure("fatal: not a git repository")
    ]);
    const service = new GitService(runner);

    await expect(service.getRepoSyncStatus("D:\\Missing")).resolves.toEqual({
      repoPath: "D:\\Missing",
      kind: "git",
      isValid: false,
      ahead: 0,
      behind: 0,
      error: "Selected folder is not a git repository."
    });
    expect(runner.calls).toHaveLength(1);
  });

  it("reports no configured actions without a .githead folder", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner(repoSummaryResults(dir));
      const service = new GitService(runner);

      const summary = await service.getRepoSummary(dir);

      expect(summary.actionsConfig).toMatchObject({
        hasGitheadDir: false,
        actions: [],
        error: "",
        shared: {
          exists: false,
          actions: [],
          writable: true
        },
        local: {
          exists: false,
          actions: [],
          writable: true
        }
      });
    });
  });

  it("loads configured actions and lets local actions override shared actions", async () => {
    await withTempDir(async (dir) => {
      const githeadDir = path.join(dir, ".githead");
      await fs.mkdir(githeadDir);
      await fs.writeFile(path.join(githeadDir, "actions.toml"), [
        "[[actions]]",
        "name = \"Build\"",
        "command = \"npm run build\"",
        "shell = \"powershell\"",
        "",
        "[[actions]]",
        "name = \"Test\"",
        "command = \"npm test\"",
        "shell = \"bash\"",
        ""
      ].join("\n"), "utf8");
      await fs.writeFile(path.join(githeadDir, "actions.local.toml"), [
        "[[actions]]",
        "name = \"test\"",
        "command = \"npm run test:local\"",
        "shell = \"cmd\"",
        "",
        "[[actions]]",
        "name = \"Lint\"",
        "command = \"npm run lint\"",
        "shell = \"powershell\"",
        ""
      ].join("\n"), "utf8");
      const runner = new FakeRunner(repoSummaryResults(dir));
      const service = new GitService(runner);

      const summary = await service.getRepoSummary(dir);

      expect(summary.actionsConfig).toMatchObject({
        hasGitheadDir: true,
        error: "",
        actions: [
          {
            name: "Build",
            command: "npm run build",
            shell: "powershell"
          },
          {
            name: "test",
            command: "npm run test:local",
            shell: "cmd"
          },
          {
            name: "Lint",
            command: "npm run lint",
            shell: "powershell"
          }
        ],
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
        },
        local: {
          exists: true,
          actions: [
            {
              name: "test",
              command: "npm run test:local",
              shell: "cmd"
            },
            {
              name: "Lint",
              command: "npm run lint",
              shell: "powershell"
            }
          ]
        }
      });
    });
  });

  it("fails configured actions closed for invalid config", async () => {
    await withTempDir(async (dir) => {
      const githeadDir = path.join(dir, ".githead");
      await fs.mkdir(githeadDir);
      await fs.writeFile(path.join(githeadDir, "actions.toml"), [
        "[[actions]]",
        "name = \"Build\"",
        "command = \"npm run build\"",
        "shell = \"zsh\"",
        ""
      ].join("\n"), "utf8");
      const runner = new FakeRunner(repoSummaryResults(dir));
      const service = new GitService(runner);

      const summary = await service.getRepoSummary(dir);

      expect(summary.actionsConfig).toMatchObject({
        hasGitheadDir: true,
        actions: [],
        error: "actions.toml: Action \"Build\" has an invalid shell.",
        shared: {
          exists: true,
          error: "actions.toml: Action \"Build\" has an invalid shell."
        }
      });
    });
  });

  it.each([
    {
      shell: "powershell",
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "npm run build"
      ]
    },
    {
      shell: "cmd",
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npm run build"
      ]
    },
    {
      shell: "bash",
      command: "bash",
      args: [
        "-lc",
        "npm run build"
      ]
    }
  ] as const)("runs configured $shell actions from the repository root", async ({ shell, command, args }) => {
    await withTempDir(async (dir) => {
      const githeadDir = path.join(dir, ".githead");
      await fs.mkdir(githeadDir);
      await fs.writeFile(path.join(githeadDir, "actions.toml"), [
        "[[actions]]",
        "name = \"Build\"",
        "command = \"npm run build\"",
        `shell = "${shell}"`,
        ""
      ].join("\n"), "utf8");
      const runner = new FakeRunner([
        ok("true\n"),
        ok(`${dir}\n`),
        ok("done\n")
      ]);
      const service = new GitService(runner);

      const result = await service.runConfiguredAction({
        repoPath: path.join(dir, "subdir"),
        name: "build"
      });

      expect(result).toMatchObject({
        action: "Build",
        exitCode: 0,
        stdout: "done\n"
      });
      expect(runner.calls.at(-1)).toMatchObject({
        command,
        args,
        options: expect.objectContaining({
          cwd: dir
        })
      });
    });
  });

  it("detects a supported GitHub origin in repository summaries", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok(`${oid}\n`),
      ok("\0"),
      ok("origin/main\n"),
      ok("origin\tgit@github.com:openai/githead.git (fetch)\norigin\tgit@github.com:openai/githead.git (push)\n"),
      ok("main\torigin/main\t*\n"),
      ok("refs/remotes/origin/main\torigin/main\t\n"),
      ok("D:\\Repo\n")
    ]);
    const service = new GitService(runner);

    const summary = await service.getRepoSummary("D:\\Repo");

    expect(summary.githubRepository).toEqual({
      owner: "openai",
      name: "githead",
      fullName: "openai/githead",
      webUrl: "https://github.com/openai/githead"
    });
  });

  it("loads the supported GitHub origin without reading the full summary", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("https://github.com/openai/githead.git\n")
    ]);
    const service = new GitService(runner);

    await expect(service.getGitHubRepository("D:\\Repo")).resolves.toEqual({
      owner: "openai",
      name: "githead",
      fullName: "openai/githead",
      webUrl: "https://github.com/openai/githead"
    });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "remote",
      "get-url",
      "origin"
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
    expect(runner.calls.at(-1)?.args).not.toContain("--branches");
    expect(runner.calls.at(-1)?.args).not.toContain("--remotes");
    expect(runner.calls.at(-1)?.args).not.toContain("--tags");
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

  it("loads all local, remote-tracking, and tag histories without contacting remotes", async () => {
    const remoteOid = "f".repeat(40);
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\n`),
      ok([
        `\x1f${remoteOid}\x1fffffff\x1frefs/remotes/origin/feature\x1ffeat: remote only\x1fTaylor\x1ftaylor@example.test\x1f2026-05-27T10:00:00-07:00\x1f1 hour ago\x1f\x1e`,
        `\x1f${oid}\x1fad4f1df\x1fHEAD -> refs/heads/master\x1ffeat: current\x1fTaylor\x1ftaylor@example.test\x1f2026-05-26T10:00:00-07:00\x1fyesterday\x1f\x1e`
      ].join("\n"))
    ]);
    const service = new GitService(runner);

    const history = await service.getCommitHistory({
      repoPath: "D:\\Repo",
      limit: 200,
      scope: "all"
    });

    expect(runner.calls.at(-1)?.args).toEqual(expect.arrayContaining([
      "log",
      "HEAD",
      "--branches",
      "--remotes",
      "--tags"
    ]));
    expect(runner.calls.at(-1)?.args).not.toContain("--all");
    expect(history[0]).toMatchObject({
      hash: remoteOid,
      refs: [{ name: "origin/feature", kind: "remote" }]
    });
  });

  it("loads fetched remote history in all scope when local HEAD is missing", async () => {
    const remoteOid = "f".repeat(40);
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: Needed a single revision"),
      ok(`${remoteOid}\n`),
      ok(`\x1f${remoteOid}\x1fffffff\x1frefs/remotes/origin/main\x1ffeat: fetched remote\x1fTaylor\x1ftaylor@example.test\x1f2026-05-27T10:00:00-07:00\x1f1 hour ago\x1f\x1e`)
    ]);
    const service = new GitService(runner);

    await expect(service.getCommitHistory({ repoPath: "D:\\Repo", scope: "all" })).resolves.toEqual([
      expect.objectContaining({ hash: remoteOid })
    ]);
    expect(runner.calls[2]?.args).toEqual([
      "-C",
      "D:\\Repo",
      "for-each-ref",
      "--count=1",
      "--format=%(objectname)",
      "refs/heads",
      "refs/remotes",
      "refs/tags"
    ]);
    expect(runner.calls.at(-1)?.args).not.toContain("HEAD");
  });

  it("returns empty all-scope history when HEAD and relevant refs do not exist", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: Needed a single revision"),
      ok("")
    ]);
    const service = new GitService(runner);

    await expect(service.getCommitHistory({ repoPath: "D:\\Repo", scope: "all" })).resolves.toEqual([]);
    expect(runner.calls).toHaveLength(3);
  });

  it("keeps explicit current scope on the HEAD-only history path", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${oid}\n`),
      ok(`\x1f${oid}\x1fad4f1df\x1fHEAD -> refs/heads/master\x1ffeat: current\x1fTaylor\x1ftaylor@example.test\x1f2026-05-26T10:00:00-07:00\x1fyesterday\x1f\x1e`)
    ]);
    const service = new GitService(runner);

    await service.getCommitHistory({ repoPath: "D:\\Repo", scope: "current" });

    expect(runner.calls.at(-1)?.args).not.toContain("--branches");
    expect(runner.calls.at(-1)?.args).not.toContain("--remotes");
    expect(runner.calls.at(-1)?.args).not.toContain("--tags");
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
        "--no-textconv",
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
      ok(),
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

  it("uses lock-free status reads before staging without changing git add locking", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      ok()
    ]);
    const service = new GitService(runner);

    await service.stageFiles({
      repoPath: "D:\\Repo",
      paths: ["src/app.ts"]
    });

    expect(runner.calls[1]?.args).toEqual([
      "-C",
      "D:\\Repo",
      "--no-optional-locks",
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--",
      "src/app.ts"
    ]);
    expect(runner.calls[2]?.args).toEqual([
      "-C",
      "D:\\Repo",
      "add",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
  });

  it("explains index lock failures without removing the lock", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      failure("fatal: Unable to create 'D:/Repo/.git/index.lock': File exists.\n")
    ]);
    const service = new GitService(runner);

    const result = await service.stageFiles({
      repoPath: "D:\\Repo",
      paths: ["src/app.ts"]
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unable to create 'D:/Repo/.git/index.lock'");
    expect(result.stderr).toContain("Another Git process may still be using this repository.");
    expect(result.stderr).toContain("remove the stale .git/index.lock file and retry");
    expect(result.stderr).toContain("Githead will not remove it automatically");
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

  it("stages a hunk by applying the patch to the index", async () => {
    const patch = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      ""
    ].join("\n");
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.stageHunk({
      repoPath: "D:\\Repo",
      path: "src/app.ts",
      side: "unstaged",
      patch
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)).toMatchObject({
      command: "git",
      args: [
        "-C",
        "D:\\Repo",
        "apply",
        "--cached",
        "--whitespace=nowarn",
        "-"
      ]
    });
    expect(stdinText(runner.calls.at(-1)!)).toBe(patch);
  });

  it("unstages a hunk by reverse-applying the patch to the index", async () => {
    const patch = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      ""
    ].join("\n");
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    await service.unstageHunk({
      repoPath: "D:\\Repo",
      path: "src/app.ts",
      side: "staged",
      patch
    });

    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "apply",
      "--cached",
      "--reverse",
      "--whitespace=nowarn",
      "-"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe(patch);
  });

  it("rejects empty hunk patches before applying", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.stageHunk({
      repoPath: "D:\\Repo",
      path: "src/app.ts",
      side: "unstaged",
      patch: " \n"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "Select a hunk to apply."
    });
    expect(runner.calls).toHaveLength(1);
  });

  it.each([
    ["soft", "--soft"],
    ["mixed", "--mixed"],
    ["hard", "--hard"]
  ] as const)("resets the current branch to a commit with %s mode", async (mode, flag) => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.resetBranchToCommit({
      repoPath: "D:\\Repo",
      hash: oid,
      mode
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "reset",
      flag,
      oid
    ]);
  });

  it("rejects invalid reset requests before running reset", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.resetBranchToCommit({
      repoPath: "D:\\Repo",
      hash: "HEAD~1",
      mode: "mixed"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Commit hash is invalid.");
    expect(runner.calls).toHaveLength(1);
  });

  it("resets selected files to a commit with NUL-delimited pathspec stdin", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.resetFilesToCommit({
      repoPath: "D:\\Repo",
      hash: oid,
      paths: [
        "src/a file.ts",
        "src/nested.ts"
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "restore",
      "--worktree",
      `--source=${oid}`,
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ]);
    expect(stdinText(runner.calls.at(-1)!)).toBe("src/a file.ts\0src/nested.ts\0");
  });

  it("rejects invalid commit hashes before resetting selected files", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.resetFilesToCommit({
      repoPath: "D:\\Repo",
      hash: "HEAD~1",
      paths: [
        "src/app.ts"
      ]
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Commit hash is invalid.");
    expect(runner.calls).toHaveLength(1);
  });

  it("rejects empty paths before resetting selected files", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.resetFilesToCommit({
      repoPath: "D:\\Repo",
      hash: oid,
      paths: [
        " "
      ]
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Select at least one file.");
    expect(runner.calls).toHaveLength(1);
  });

  it("reverts a commit without opening an editor", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.revertCommit({
      repoPath: "D:\\Repo",
      hash: oid
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "revert",
      "--no-edit",
      oid
    ]);
  });

  it("creates an annotated tag on a selected commit", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.createTag({
      repoPath: "D:\\Repo",
      hash: oid,
      tagName: "v1.2.3",
      message: "Release 1.2.3",
      lightweight: false,
      force: false,
      pushRemote: null
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "tag",
      "-a",
      "-m",
      "Release 1.2.3",
      "v1.2.3",
      oid
    ]);
  });

  it("creates and pushes a forced lightweight tag", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      ok(),
      ok("origin\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.createTag({
      repoPath: "D:\\Repo",
      hash: oid,
      tagName: "v1.2.3",
      message: "",
      lightweight: true,
      force: true,
      pushRemote: "origin"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-3)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "tag",
      "-f",
      "v1.2.3",
      oid
    ]);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "push",
      "origin",
      "refs/tags/v1.2.3"
    ]);
  });

  it("does not push a tag when local tag creation fails", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      failure("fatal: tag already exists")
    ]);
    const service = new GitService(runner);

    const result = await service.createTag({
      repoPath: "D:\\Repo",
      hash: oid,
      tagName: "v1.2.3",
      message: "",
      lightweight: true,
      force: false,
      pushRemote: "origin"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("fatal: tag already exists");
    expect(runner.calls).toHaveLength(3);
  });

  it("deletes a tag and optionally pushes the remote delete", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      ok(),
      ok("origin\n"),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.deleteTag({
      repoPath: "D:\\Repo",
      tagName: "v1.2.3",
      pushRemote: "origin"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-3)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "tag",
      "-d",
      "v1.2.3"
    ]);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "push",
      "origin",
      ":refs/tags/v1.2.3"
    ]);
  });

  it("rejects invalid tag names before creating a tag", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.createTag({
      repoPath: "D:\\Repo",
      hash: oid,
      tagName: "",
      message: "",
      lightweight: true,
      force: false,
      pushRemote: null
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Enter a tag name.");
    expect(runner.calls).toHaveLength(1);
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

  it("marks missing author identity commit failures", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure([
        "Author identity unknown",
        "",
        "*** Please tell me who you are.",
        "fatal: unable to auto-detect email address"
      ].join("\n"))
    ]);
    const service = new GitService(runner);

    const result = await service.commitChanges({
      repoPath: "D:\\Repo",
      message: "subject"
    });

    expect(result).toMatchObject({
      exitCode: 1,
      errorKind: "missing-author-identity"
    });
  });

  it("leaves normal commit failures unclassified", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: cannot lock ref")
    ]);
    const service = new GitService(runner);

    const result = await service.commitChanges({
      repoPath: "D:\\Repo",
      message: "subject"
    });

    expect(result.errorKind).toBeUndefined();
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

  it("sets a branch upstream to a fetched remote branch", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok(),
      ok("origin\thttps://example.test/repo.git (fetch)\n"),
      ok("refs/remotes/origin/main\torigin/main\t\n"),
      ok("branch 'main' set up to track 'origin/main'.\n")
    ]);
    const service = new GitService(runner);

    const result = await service.setBranchUpstream({
      repoPath: "D:\\Repo",
      branchName: "main",
      upstream: "origin/main"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "branch",
      "--set-upstream-to=origin/main",
      "main"
    ]);
  });

  it("checks out a fetched remote branch with tracking", async () => {
    const runner = new FakeRunner([
      ok("true\n"), ok("feature/nav\n"),
      ok("origin\thttps://github.com/openai/githead.git (fetch)\n"),
      ok("refs/remotes/origin/feature/nav\torigin/feature/nav\t\n"),
      failure(""), ok("Switched to a new branch 'feature/nav'\n")
    ]);
    const result = await new GitService(runner).checkoutRemoteBranch({ repoPath: "D:\\Repo", branchName: "feature/nav", remoteBranch: "origin/feature/nav" });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual(["-C", "D:\\Repo", "switch", "-c", "feature/nav", "--track", "origin/feature/nav"]);
  });

  it("classifies a remote checkout name collision", async () => {
    const runner = new FakeRunner([
      ok("true\n"), ok("feature/nav\n"),
      ok("origin\thttps://github.com/openai/githead.git (fetch)\n"),
      ok("refs/remotes/origin/feature/nav\torigin/feature/nav\t\n"),
      ok(""), failure("fatal: no upstream")
    ]);
    const result = await new GitService(runner).checkoutRemoteBranch({ repoPath: "D:\\Repo", branchName: "feature/nav", remoteBranch: "origin/feature/nav" });
    expect(result.errorKind).toBe("branch-name-conflict");
  });

  it("fetches a GitHub pull request head without adding a fork remote", async () => {
    const runner = new FakeRunner([
      ok("true\n"), ok("feature/fork\n"), ok("true\n"), ok("https://github.com/openai/githead.git\n"),
      failure(""), ok("fetched\n"), ok("switched\n")
    ]);
    const result = await new GitService(runner).checkoutGitHubPullRequest({ repoPath: "D:\\Repo", branchName: "feature/fork", pullRequestNumber: 42, sourceBranch: "feature/fork", sourceRepositoryFullName: "contributor/githead" });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-2)?.args).toEqual(["-C", "D:\\Repo", "fetch", "origin", "refs/pull/42/head"]);
    expect(runner.calls.at(-1)?.args).toEqual(["-C", "D:\\Repo", "switch", "-c", "feature/fork", "FETCH_HEAD"]);
  });

  it("renames a local branch without force", async () => {
    const runner = new FakeRunner([ok("true\n"), ok("feature/old\n"), ok("feature/new\n"), ok(), failure(""), ok()]);
    const service = new GitService(runner);
    const result = await service.renameBranch({ repoPath: "D:\\Repo", branchName: "feature/old", newBranchName: "feature/new" });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual(["-C", "D:\\Repo", "branch", "-m", "feature/old", "feature/new"]);
  });

  it("safely deletes only a local branch", async () => {
    const runner = new FakeRunner([ok("true\n"), ok("feature/old\n"), ok(), ok()]);
    const service = new GitService(runner);
    const result = await service.deleteBranch({ repoPath: "D:\\Repo", branchName: "feature/old", force: false });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual(["-C", "D:\\Repo", "branch", "-d", "feature/old"]);
  });

  it("force deletes a local branch only when requested", async () => {
    const runner = new FakeRunner([ok("true\n"), ok("feature/old\n"), ok(), ok()]);
    const service = new GitService(runner);
    const result = await service.deleteBranch({ repoPath: "D:\\Repo", branchName: "feature/old", force: true });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual(["-C", "D:\\Repo", "branch", "-D", "feature/old"]);
  });

  it("loads detailed remotes with all URLs and tracked branches", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("origin\nupstream\n"),
      ok("feature/nav\torigin\nmain\tupstream\nlocal\t.\n"),
      ok("https://example.test/fetch.git\nhttps://mirror.test/fetch.git\n"),
      ok("https://example.test/push.git\n"),
      ok("git@example.test:project/repo.git\n"),
      failure("missing pushurl")
    ]);
    const service = new GitService(runner);

    await expect(service.getRemoteConfigs("D:\\Repo")).resolves.toEqual([
      {
        name: "origin",
        fetchUrls: ["https://example.test/fetch.git", "https://mirror.test/fetch.git"],
        pushUrls: ["https://example.test/push.git"],
        trackedBranches: ["feature/nav"]
      },
      {
        name: "upstream",
        fetchUrls: ["git@example.test:project/repo.git"],
        pushUrls: [],
        trackedBranches: ["main"]
      }
    ]);
    expect(runner.calls.map((call) => call.args.slice(2))).toContainEqual([
      "config",
      "--get-all",
      "remote.origin.url"
    ]);
  });

  it("adds a remote without contacting it", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(),
      ok(),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.addRemote({
      repoPath: "D:\\Repo With Spaces",
      name: "origin",
      url: "C:\\Remote Repositories\\project.git"
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo With Spaces",
      "remote",
      "add",
      "origin",
      "C:\\Remote Repositories\\project.git"
    ]);
    expect(runner.calls.some((call) => call.args.includes("fetch"))).toBe(false);
  });

  it("rejects duplicate remote names before mutation", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("origin\n"),
      ok(),
      ok("https://example.test/repo.git\n"),
      failure("missing pushurl")
    ]);
    const service = new GitService(runner);

    const result = await service.addRemote({ repoPath: "D:\\Repo", name: "origin", url: "https://other.test/repo.git" });

    expect(result).toMatchObject({ exitCode: -1, stderr: "A remote with this name already exists." });
    expect(runner.calls.at(-1)?.args).toContain("remote.origin.pushurl");
  });

  it("renames and removes existing remotes with native Git commands", async () => {
    const renameRunner = new FakeRunner([
      ok("true\n"), ok("origin\n"), ok(), ok("https://example.test/repo.git\n"), failure(), ok()
    ]);
    const renameService = new GitService(renameRunner);
    expect((await renameService.renameRemote({ repoPath: "D:\\Repo", currentName: "origin", newName: "upstream" })).exitCode).toBe(0);
    expect(renameRunner.calls.at(-1)?.args.slice(2)).toEqual(["remote", "rename", "origin", "upstream"]);

    const removeRunner = new FakeRunner([
      ok("true\n"), ok("upstream\n"), ok("main\tupstream\n"), ok("https://example.test/repo.git\n"), failure(), ok()
    ]);
    const removeService = new GitService(removeRunner);
    expect((await removeService.removeRemote({ repoPath: "D:\\Repo", name: "upstream" })).exitCode).toBe(0);
    expect(removeRunner.calls.at(-1)?.args.slice(2)).toEqual(["remote", "remove", "upstream"]);
  });

  it("edits only conventional single-URL remotes", async () => {
    const runner = new FakeRunner([
      ok("true\n"), ok("origin\n"), ok(), ok("https://example.test/old.git\n"), failure(), ok()
    ]);
    const service = new GitService(runner);
    const result = await service.setRemoteUrl({ repoPath: "D:\\Repo", name: "origin", url: "https://example.test/new.git" });
    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args.slice(2)).toEqual(["remote", "set-url", "origin", "https://example.test/new.git"]);
  });

  it("protects advanced remote URLs from editing", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("origin\n"),
      ok(),
      ok("https://example.test/fetch.git\nhttps://mirror.test/fetch.git\n"),
      failure()
    ]);
    const service = new GitService(runner);
    const result = await service.setRemoteUrl({ repoPath: "D:\\Repo", name: "origin", url: "https://example.test/new.git" });
    expect(result).toMatchObject({ exitCode: -1 });
    expect(result.stderr).toContain("advanced URL configuration");
    expect(runner.calls.some((call) => call.args.includes("set-url"))).toBe(false);
  });

  it("clears a branch upstream", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok(),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.setBranchUpstream({
      repoPath: "D:\\Repo",
      branchName: "main",
      upstream: null
    });

    expect(result.exitCode).toBe(0);
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "branch",
      "--unset-upstream",
      "main"
    ]);
  });

  it("rejects invalid branch names before changing upstream", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      failure("fatal: 'bad..name' is not a valid branch name")
    ]);
    const service = new GitService(runner);

    const result = await service.setBranchUpstream({
      repoPath: "D:\\Repo",
      branchName: "bad..name",
      upstream: "origin/main"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("not a valid branch name");
    expect(runner.calls).toHaveLength(2);
  });

  it("rejects upstreams that are not fetched remote branches", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("main\n"),
      ok(),
      ok("origin\thttps://example.test/repo.git (fetch)\n"),
      ok("refs/remotes/origin/main\torigin/main\t\n")
    ]);
    const service = new GitService(runner);

    const result = await service.setBranchUpstream({
      repoPath: "D:\\Repo",
      branchName: "main",
      upstream: "origin/missing"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "Upstream must be a fetched remote branch."
    });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "for-each-ref",
      "--format=%(refname)%09%(refname:short)%09%(symref)",
      "refs/remotes"
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
      "--no-ext-diff",
      "--no-textconv"
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
      paths: [
        "staged.ts"
      ],
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
      paths: [
        "new.ts"
      ],
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

  it("reverts multiple staged changes by unstaging with one pathspec", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("true\n"),
      ok(`${oid}\n`),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      paths: [
        "src/first.ts",
        "src/second.ts"
      ],
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
    expect(stdinText(runner.calls.at(-1)!)).toBe("src/first.ts\0src/second.ts\0");
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
      paths: [
        "src/file.ts"
      ],
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

  it("reverts multiple unstaged tracked changes with one pathspec", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${trackedRecord(".M", "src/first.ts")}\0${trackedRecord(".M", "src/second.ts")}\0`),
      ok()
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      paths: [
        "src/first.ts",
        "src/second.ts"
      ],
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
    expect(stdinText(runner.calls.at(-1)!)).toBe("src/first.ts\0src/second.ts\0");
  });

  it("rejects empty paths when reverting file changes", async () => {
    const runner = new FakeRunner([
      ok("true\n")
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      paths: [
        "   "
      ],
      side: "unstaged"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Select at least one file.");
  });

  it("rejects revert for untracked files", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok("? new.ts\0")
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      paths: [
        "new.ts"
      ],
      side: "unstaged"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Untracked files cannot be reverted. Use Delete to remove this file.");
  });

  it("rejects multi-file revert when any selected file is untracked", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(`${trackedRecord(".M", "tracked.ts")}\0? new.ts\0`)
    ]);
    const service = new GitService(runner);

    const result = await service.revertFileChanges({
      repoPath: "D:\\Repo",
      paths: [
        "tracked.ts",
        "new.ts"
      ],
      side: "unstaged"
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Untracked files cannot be reverted. Use Delete to remove this file.");
    expect(runner.calls).toHaveLength(2);
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
      "--submodule=short",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--",
      "a.ts"
    ]);
  });

  it("returns unstaged tracked text diffs without textconv helpers", async () => {
    const runner = new FakeRunner([
      ok("true\n"),
      ok(trackedRecord(" M", "a.ts")),
      ok("diff --git a/a.ts b/a.ts\n+changed\n")
    ]);
    const service = new GitService(runner);

    const diff = await service.getFileDiff({
      repoPath: "D:\\Repo",
      path: "a.ts",
      side: "unstaged"
    });

    expect(diff).toMatchObject({
      kind: "text",
      text: expect.stringContaining("+changed")
    });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-C",
      "D:\\Repo",
      "diff",
      "--submodule=short",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
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
