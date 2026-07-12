import { describe, expect, it } from "vite-plus/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { LoreService } from "./loreService";

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

    return result;
  }
}

const ok = (stdout = ""): ProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: ""
});

async function withLoreRepo<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "githead-lore-service-")));
  await fs.mkdir(path.join(dir, ".lore"));
  await fs.writeFile(path.join(dir, ".lore", "config.toml"), 'remote_url = "lore://127.0.0.1:41337"\n', "utf8");

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "githead-lore-service-")));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

const STATUS_MIXED = `Repository 019ee33ca6e07831a467dbc3dc6e148e
On branch main revision 1 -> 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Changes staged for commit:
A hello.txt
Untracked files:
A notes.md
`;

const BRANCH_LIST = `Local branches:
* main
`;

const HISTORY_TWO = `Revision  : 2
Signature : 0b939d06488b9a58aff2287684193f2676f708d5c04756d8bde6c2dc1ebb0033
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Sat, 20 Jun 2026 04:17:48 +0000
    Edit hello, add notes
Creator   : Test User <test@example.com>
Committer : Test User <test@example.com>

Revision  : 1
Signature : 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Sat, 20 Jun 2026 04:15:43 +0000
    Add hello.txt
Creator   : Test User <test@example.com>
Committer : Test User <test@example.com>
`;

describe("Lore remote management", () => {
  it("exposes the configured endpoint for inspection but rejects mutations", async () => {
    await withLoreRepo(async (repoPath) => {
      const service = new LoreService(new FakeRunner([]));

      await expect(service.getRemoteConfigs(repoPath)).resolves.toEqual([
        {
          name: "origin",
          fetchUrls: ["lore://127.0.0.1:41337"],
          pushUrls: [],
          trackedBranches: []
        }
      ]);
      const result = await service.addRemote({ repoPath, name: "backup", url: "lore://example.test:41337" });
      expect(result).toMatchObject({ exitCode: -1 });
      expect(result.stderr).toContain("not supported for Lore repositories");
    });
  });
});

const DIFF = `
hello.txt
--- hello.txt@1
+++ hello.txt
@@ -1 +1,2 @@
-hello lore
+hello lore - edited
+new line
`;

describe("LoreService", () => {
  it("builds a lore repo summary from status and branch output", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("On branch main revision 1 -> abc"),
        ok(STATUS_MIXED),
        ok(BRANCH_LIST)
      ]);
      const service = new LoreService(runner);

      const summary = await service.getRepoSummary(dir);

      expect(summary.kind).toBe("lore");
      expect(summary.isValid).toBe(true);
      expect(summary.capabilities.hunkStaging).toBe(false);
      expect(summary.branch).toBe("main");
      expect(summary.branches).toEqual([
        {
          name: "main",
          current: true,
          upstream: null
        }
      ]);
      expect(summary.remotes).toEqual([
        {
          name: "origin",
          url: "lore://127.0.0.1:41337",
          direction: "fetch"
        }
      ]);
      expect(summary.files.map((file) => file.path)).toEqual([
        "hello.txt",
        "notes.md"
      ]);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "status",
        "--scan"
      ]);
      expect(runner.calls[1]?.options?.cwd).toBe(dir);
    });
  });

  it("resolves Lore repository roots when opened from a subfolder", async () => {
    await withLoreRepo(async (dir) => {
      const nested = path.join(dir, "Content", "Maps");
      await fs.mkdir(nested, {
        recursive: true
      });
      const runner = new FakeRunner([
        ok("On branch main revision 1 -> abc"),
        ok(STATUS_MIXED),
        ok(BRANCH_LIST)
      ]);
      const service = new LoreService(runner);

      const summary = await service.getRepoSummary(nested);

      expect(summary.isValid).toBe(true);
      expect(summary.repoPath).toBe(dir);
      expect(runner.calls[0]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "status"
      ]);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "status",
        "--scan"
      ]);
    });
  });

  it("derives commit-graph parents from history order", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok(HISTORY_TWO)
      ]);
      const service = new LoreService(runner);

      const history = await service.getCommitHistory({
        repoPath: dir
      });

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        hash: "0b939d06488b9a58aff2287684193f2676f708d5c04756d8bde6c2dc1ebb0033",
        shortHash: "0b939d06",
        subject: "Edit hello, add notes",
        parents: [
          "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4"
        ]
      });
      expect(history[1]?.parents).toEqual([]);
    });
  });

  it("returns a clean unified diff for a file", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok(DIFF)
      ]);
      const service = new LoreService(runner);

      const diff = await service.getFileDiff({
        repoPath: dir,
        path: "hello.txt",
        side: "unstaged"
      });

      expect(diff.kind).toBe("text");
      expect(diff.text.startsWith("--- hello.txt@1")).toBe(true);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "diff",
        "hello.txt"
      ]);
      // `lore` resolves the relative path against CWD, so it must be the repo.
      expect(runner.calls[1]?.options?.cwd).toBe(dir);
    });
  });

  it("reports an invalid summary for a non-lore folder", async () => {
    const runner = new FakeRunner([]);
    const service = new LoreService(runner);

    const summary = await service.getRepoSummary(path.join(os.tmpdir(), "definitely-not-a-lore-repo-xyz"));

    expect(summary.kind).toBe("lore");
    expect(summary.isValid).toBe(false);
    expect(summary.validationErrors[0]).toContain("not a Lore repository");
    expect(runner.calls).toHaveLength(0);
  });

  it("stages specific files", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("Staged repository state abc")
      ]);
      const service = new LoreService(runner);

      const result = await service.stageFiles({
        repoPath: dir,
        paths: [
          "hello.txt",
          "notes.md"
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "stage",
        "hello.txt",
        "notes.md"
      ]);
    });
  });

  it("commits with the message as a positional argument", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("Commit succeeded")
      ]);
      const service = new LoreService(runner);

      const result = await service.commitChanges({
        repoPath: dir,
        message: "Add hello.txt"
      });

      expect(result.exitCode).toBe(0);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "commit",
        "Add hello.txt"
      ]);
    });
  });

  it("resets files to a specific revision", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("")
      ]);
      const service = new LoreService(runner);

      await service.resetFilesToCommit({
        repoPath: dir,
        hash: "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
        paths: [
          "hello.txt"
        ]
      });

      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "reset",
        "--revision",
        "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
        "hello.txt"
      ]);
    });
  });

  it("discards working changes with reset", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("")
      ]);
      const service = new LoreService(runner);

      await service.revertFileChanges({
        repoPath: dir,
        paths: [
          "hello.txt"
        ],
        side: "unstaged"
      });

      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "reset",
        "hello.txt"
      ]);
    });
  });

  it("clones a lore:// url into the parent directory", async () => {
    await withTempDir(async (dir) => {
      const runner = new FakeRunner([
        ok("Repository cloned.")
      ]);
      const service = new LoreService(runner);

      const result = await service.cloneRepository({
        source: "lore://127.0.0.1:41337/demo",
        parentPath: dir,
        directoryName: "demo"
      });

      expect(result.exitCode).toBe(0);
      expect(result.repoPath).toBe(path.join(dir, "demo"));
      expect(runner.calls[0]).toEqual({
        command: "lore",
        args: [
          "-P",
          "clone",
          "lore://127.0.0.1:41337/demo",
          "demo"
        ],
        options: {
          cwd: dir
        }
      });
    });
  });

  it("rejects unsafe Lore clone destinations before spawning lore", async () => {
    await withTempDir(async (dir) => {
      const nonEmptyDestination = path.join(dir, "existing");
      await fs.mkdir(nonEmptyDestination);
      await fs.writeFile(path.join(nonEmptyDestination, "file.txt"), "content", "utf8");

      const cases = [
        {
          request: {
            source: "lore://127.0.0.1:41337/demo",
            parentPath: "relative",
            directoryName: "demo"
          },
          error: "Select an absolute destination folder."
        },
        {
          request: {
            source: "lore://127.0.0.1:41337/demo",
            parentPath: dir,
            directoryName: "..\\demo"
          },
          error: "Destination folder name cannot include a path."
        },
        {
          request: {
            source: "lore://127.0.0.1:41337/demo",
            parentPath: dir,
            directoryName: "existing"
          },
          error: "Destination folder already exists and is not empty."
        }
      ];

      for (const testCase of cases) {
        const runner = new FakeRunner([]);
        const service = new LoreService(runner);
        const result = await service.cloneRepository(testCase.request);

        expect(result.exitCode).toBe(-1);
        expect(result.stderr).toBe(testCase.error);
        expect(runner.calls).toHaveLength(0);
      }
    });
  });

  it("writes a selected Lore revision file version to disk", async () => {
    await withLoreRepo(async (dir) => {
      const outputPath = path.join(dir, "version.txt");
      const runner = new FakeRunner([
        ok("ok"),
        ok("Wrote file")
      ]);
      const service = new LoreService(runner);

      const result = await service.writeCommitFileVersionToPath(
        dir,
        "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
        "hello.txt",
        outputPath
      );

      expect(result.exitCode).toBe(0);
      expect(runner.calls[1]).toEqual({
        command: "lore",
        args: [
          "--repository",
          dir,
          "-P",
          "file",
          "write",
          "--path",
          "hello.txt",
          "--revision",
          "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
          "--output",
          outputPath
        ],
        options: {
          cwd: dir
        }
      });
    });
  });

  it("maps the pull action to lore sync and push to lore push", async () => {
    await withLoreRepo(async (dir) => {
      const pullRunner = new FakeRunner([
        ok("ok"),
        ok("Synced")
      ]);
      const pullService = new LoreService(pullRunner);
      const pull = await pullService.runGitAction({
        repoPath: dir,
        action: "pull"
      });
      expect(pull.action).toBe("pull");
      expect(pull.exitCode).toBe(0);
      expect(pullRunner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "sync"
      ]);

      const pushRunner = new FakeRunner([
        ok("ok"),
        ok("Pushed")
      ]);
      const pushService = new LoreService(pushRunner);
      await pushService.runGitAction({
        repoPath: dir,
        action: "push"
      });
      expect(pushRunner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "push"
      ]);
    });
  });

  it("returns unsupported failure when publishing a branch", async () => {
    await withLoreRepo(async (dir) => {
      const service = new LoreService(new FakeRunner([]));

      const result = await service.publishBranch({
        repoPath: dir,
        branchName: "feature",
        remoteName: "origin"
      });

      expect(result.action).toBe("publish");
      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("Publishing branches is not supported for Lore repositories.");
    });
  });

  it("creates a branch and switches to it", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("Created branch feature"),
        ok("Switched to branch feature")
      ]);
      const service = new LoreService(runner);

      const result = await service.createBranch({
        repoPath: dir,
        branchName: "feature"
      });

      expect(result.exitCode).toBe(0);
      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "branch",
        "create",
        "feature"
      ]);
      expect(runner.calls[2]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "branch",
        "switch",
        "feature"
      ]);
    });
  });

  it("reverts a commit and resets a branch to a revision", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        ok("Reverted"),
        ok("ok"),
        ok("Reset")
      ]);
      const service = new LoreService(runner);

      await service.revertCommit({
        repoPath: dir,
        hash: "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4"
      });
      await service.resetBranchToCommit({
        repoPath: dir,
        hash: "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
        mode: "hard"
      });

      expect(runner.calls[1]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "revision",
        "revert",
        "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4"
      ]);
      expect(runner.calls[3]?.args).toEqual([
        "--repository",
        dir,
        "-P",
        "branch",
        "reset",
        "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4"
      ]);
    });
  });

  it("returns a notice diff for a root commit (no parent)", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([
        ok("ok"),
        // `history --revision <hash> 2` returns only the root revision -> no parent.
        ok(`Revision  : 1
Signature : 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Date      : Sat, 20 Jun 2026 04:15:43 +0000
    Init commit
Creator   : Bot <bot@example.com>
Committer : Bot <bot@example.com>
`)
      ]);
      const service = new LoreService(runner);

      const diff = await service.getCommitFileDiff({
        repoPath: dir,
        hash: "7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4",
        path: "Config/DefaultEngine.ini"
      });

      expect(diff.kind).toBe("empty");
      expect(diff.text.toLowerCase()).toContain("initial revision");
      expect(runner.calls).toHaveLength(2);
    });
  });

  it("archives a non-current branch", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([ok("ok"), ok("* main\n  feature\n"), ok("Archived")]);
      const service = new LoreService(runner);
      const result = await service.deleteBranch({ repoPath: dir, branchName: "feature", force: false });
      expect(result.exitCode).toBe(0);
      expect(runner.calls.at(-1)?.args).toEqual(["--repository", dir, "-P", "branch", "archive", "feature"]);
    });
  });

  it("refuses to archive the current Lore branch", async () => {
    await withLoreRepo(async (dir) => {
      const runner = new FakeRunner([ok("ok"), ok("* main\n  feature\n")]);
      const service = new LoreService(runner);
      const result = await service.deleteBranch({ repoPath: dir, branchName: "main", force: false });
      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toContain("Switch to another branch");
    });
  });

  it("still reports hunk staging as unsupported", async () => {
    const runner = new FakeRunner([]);
    const service = new LoreService(runner);

    const result = await service.stageHunk({
      repoPath: "D:\\Repo",
      path: "hello.txt",
      side: "unstaged",
      patch: ""
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("not supported for Lore");
  });
});
