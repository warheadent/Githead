import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessResult, type ProcessRunOptions, type ProcessRunner } from "./processRunner";

const runner = new NodeProcessRunner();
const roots: string[] = [];

class CountingRunner implements ProcessRunner {
  readonly calls: string[][] = [];
  private readonly delegate = new NodeProcessRunner();

  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push(args);
    return this.delegate.run(command, args, options);
  }

  fetchCount(): number {
    return this.calls.filter((args) => args.includes("fetch") && args.includes("--prune")).length;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("GitService safe commit and push", () => {
  it("reuses one warmed remote check across several protected commits", async () => {
    const repo = await createRepositories();
    const countingRunner = new CountingRunner();
    const service = new GitService(countingRunner);

    await service.warmRemoteCheckLease(repo.local, 120_000);
    await stageLocalChange(repo.local);
    const first = await service.commitWithRemoteCheck({ repoPath: repo.local, message: "First local change" }, undefined, 120_000);
    await fs.writeFile(path.join(repo.local, "second.txt"), "second\n", "utf8");
    await runGit(repo.local, ["add", "second.txt"]);
    const second = await service.commitWithRemoteCheck({ repoPath: repo.local, message: "Second local change" }, undefined, 120_000);

    expect(first.outcome).toBe("committed");
    expect(second.outcome).toBe("committed");
    expect(countingRunner.fetchCount()).toBe(1);
  });

  it("invalidates a lease when the fetched upstream ref changes", async () => {
    const repo = await createRepositories();
    const countingRunner = new CountingRunner();
    const service = new GitService(countingRunner);
    await service.warmRemoteCheckLease(repo.local, 120_000);

    await writeAndCommit(repo.other, "remote.txt", "remote\n", "Remote advance");
    await runGit(repo.other, ["push"]);
    await runGit(repo.local, ["fetch", "origin"]);
    await stageLocalChange(repo.local);
    const result = await service.commitWithRemoteCheck({ repoPath: repo.local, message: "Local change" }, undefined, 120_000);

    expect(result.outcome).toBe("remote-ahead");
    expect(countingRunner.fetchCount()).toBe(2);
  });

  it("checks the remote before Quick Commit stages selected files", async () => {
    const repo = await createRepositories();
    await writeAndCommit(repo.other, "remote.txt", "remote\n", "Remote advance");
    await runGit(repo.other, ["push"]);
    await fs.writeFile(path.join(repo.local, "quick.txt"), "quick\n", "utf8");

    const result = await new GitService(runner).quickCommitFiles(
      { repoPath: repo.local, paths: ["quick.txt"], message: "Quick local change" },
      undefined,
      120_000
    );

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("No commit was created");
    expect(await stagedPaths(repo.local)).toEqual([]);
  });

  it("checks the remote and stops an ordinary commit when the remote is ahead", async () => {
    const repo = await createRepositories();
    await writeAndCommit(repo.other, "remote.txt", "remote\n", "Remote advance");
    await runGit(repo.other, ["push"]);
    await stageLocalChange(repo.local);
    const previousHead = await readHead(repo.local);

    const result = await new GitService(runner).commitWithRemoteCheck({
      repoPath: repo.local,
      message: "Local staged change"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      outcome: "remote-ahead",
      commitCreated: false,
      ahead: 0,
      behind: 1
    });
    expect(await readHead(repo.local)).toBe(previousHead);
    expect(await stagedPaths(repo.local)).toEqual(["local.txt"]);
  });

  it("allows an ordinary local commit when the branch has no remote upstream", async () => {
    const repo = await createRepositories();
    await runGit(repo.local, ["branch", "--unset-upstream"]);
    await stageLocalChange(repo.local);

    const result = await new GitService(runner).commitWithRemoteCheck({
      repoPath: repo.local,
      message: "Local staged change"
    });

    expect(result).toMatchObject({
      exitCode: 0,
      outcome: "committed",
      commitCreated: true,
      branchName: "master",
      ahead: null,
      behind: null
    });
    expect(await stagedPaths(repo.local)).toEqual([]);
  });

  it("fetches and stops before creating a commit when the remote is ahead", async () => {
    const repo = await createRepositories();
    await writeAndCommit(repo.other, "remote.txt", "remote\n", "Remote advance");
    await runGit(repo.other, ["push"]);
    await stageLocalChange(repo.local);
    const previousHead = await readHead(repo.local);

    const result = await new GitService(runner).commitAndPush(
      { repoPath: repo.local, message: "Local staged change" },
      undefined,
      { tagPushBehavior: "none" }
    );

    expect(result).toMatchObject({
      exitCode: -1,
      outcome: "remote-ahead",
      commitCreated: false,
      ahead: 0,
      behind: 1,
      canUndoCommit: false
    });
    expect(result.stderr).toContain("No commit was created");
    expect(await readHead(repo.local)).toBe(previousHead);
    expect(await stagedPaths(repo.local)).toEqual(["local.txt"]);
  });

  it("commits and pushes only after the remote safety check passes", async () => {
    const repo = await createRepositories();
    await stageLocalChange(repo.local);

    const result = await new GitService(runner).commitAndPush(
      { repoPath: repo.local, message: "Local staged change" },
      undefined,
      { tagPushBehavior: "none" }
    );

    expect(result).toMatchObject({
      exitCode: 0,
      outcome: "pushed",
      commitCreated: true,
      ahead: 0,
      behind: 0,
      canUndoCommit: false,
      push: { branchSucceeded: true }
    });
    expect(await readHead(repo.local)).toBe(await readBareHead(repo.remote));
    expect(await stagedPaths(repo.local)).toEqual([]);
  });

  it("offers a guarded soft reset when the remote advances after preflight", async () => {
    const repo = await createRepositories();
    await writeAndCommit(repo.other, "racing.txt", "race\n", "Race remote advance");
    await stageLocalChange(repo.local);
    const previousHead = await readHead(repo.local);
    const hookPath = path.join(repo.local, ".git", "hooks", "pre-push");
    await fs.writeFile(hookPath, `#!/bin/sh\ngit -C "${repo.other}" push origin master\n`, { mode: 0o755 });

    const service = new GitService(runner);
    const result = await service.commitAndPush(
      { repoPath: repo.local, message: "Local staged change" },
      undefined,
      { tagPushBehavior: "none" }
    );

    expect(result).toMatchObject({
      outcome: "push-failed",
      commitCreated: true,
      branchName: "master",
      previousHeadOid: previousHead
    });
    expect(result.canUndoCommit, result.stderr).toBe(true);
    expect(result.headOid).toMatch(/^[0-9a-f]{40}$/);

    const undo = await service.undoCommitAndKeepStaged({
      repoPath: repo.local,
      branchName: result.branchName!,
      expectedHeadOid: result.headOid!,
      previousHeadOid: result.previousHeadOid!
    });

    expect(undo).toMatchObject({ exitCode: 0, stdout: "Commit undone. Its changes remain staged." });
    expect(await readHead(repo.local)).toBe(previousHead);
    expect(await stagedPaths(repo.local)).toEqual(["local.txt"]);
  });
});

async function createRepositories(): Promise<{ root: string; remote: string; local: string; other: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-safe-commit-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const local = path.join(root, "local");
  const other = path.join(root, "other");
  await runGit(root, ["init", "--bare", remote]);
  await runGit(root, ["clone", remote, local]);
  await configureIdentity(local);
  await writeAndCommit(local, "seed.txt", "seed\n", "Initial commit");
  await runGit(local, ["push", "--set-upstream", "origin", "master"]);
  await runGit(root, ["clone", remote, other]);
  await configureIdentity(other);
  return { root, remote, local, other };
}

async function configureIdentity(repoPath: string): Promise<void> {
  await runGit(repoPath, ["config", "user.name", "Githead Test"]);
  await runGit(repoPath, ["config", "user.email", "githead@example.test"]);
}

async function writeAndCommit(repoPath: string, fileName: string, contents: string, message: string): Promise<void> {
  await fs.writeFile(path.join(repoPath, fileName), contents, "utf8");
  await runGit(repoPath, ["add", fileName]);
  await runGit(repoPath, ["commit", "-m", message]);
}

async function stageLocalChange(repoPath: string): Promise<void> {
  await fs.writeFile(path.join(repoPath, "local.txt"), "local\n", "utf8");
  await runGit(repoPath, ["add", "local.txt"]);
}

async function readHead(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ["rev-parse", "HEAD"])).stdout.trim();
}

async function readBareHead(repoPath: string): Promise<string> {
  const result = await runner.run("git", ["--git-dir", repoPath, "rev-parse", "refs/heads/master"]);
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
}

async function stagedPaths(repoPath: string): Promise<string[]> {
  const result = await runGit(repoPath, ["diff", "--cached", "--name-only"]);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

async function runGit(repoPath: string, args: string[]): Promise<{ stdout: string }> {
  const result = await runner.run("git", ["-C", repoPath, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr || result.error || `git ${args.join(" ")} failed`);
  return result;
}
