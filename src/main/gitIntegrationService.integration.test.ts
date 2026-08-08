import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { GitIntegrationPreview, GitIntegrationPreviewRequest } from "../shared/types";
import { GitIntegrationService } from "./gitIntegrationService";
import { GitOperationRecoveryService } from "./gitOperationRecovery";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessResult } from "./processRunner";

describe("GitIntegrationService with real Git repositories", { timeout: 30_000 }, () => {
  it("fast-forwards, reports already-up-to-date, and rejects a stale source ref", async () => {
    await withRepo(async (repo) => {
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("feature.txt", "feature\n", "feature");
      const featureOid = await repo.oid("feature");
      await repo.checkout("main");

      const preview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      expect(preview).toMatchObject({ kind: "merge", canFastForward: true, behind: 1 });
      const merged = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "normal", expectedSnapshotId: preview.snapshotId });
      expect(merged).toMatchObject({ exitCode: 0, outcome: "completed", headOid: featureOid });

      const noOpPreview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      const noOp = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "normal", expectedSnapshotId: noOpPreview.snapshotId });
      expect(noOp).toMatchObject({ exitCode: 0, outcome: "no-op", message: "Already up to date." });

      await repo.checkout("feature");
      await repo.commit("later.txt", "later\n", "later");
      await repo.checkout("main");
      const stale = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "normal", expectedSnapshotId: noOpPreview.snapshotId });
      expect(stale).toMatchObject({ outcome: "stale", exitCode: -1 });
    });
  });

  it("exposes typed GitService preview/execution responses and streams activity output", async () => {
    await withRepo(async (repo) => {
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("feature.txt", "feature\n", "feature");
      await repo.checkout("main");
      const previewResult = await repo.gitService.getIntegrationPreview({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      expect(previewResult).toMatchObject({ outcome: "ready", preview: { kind: "merge" } });
      const output: string[] = [];
      const result = await repo.gitService.runIntegration({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "normal", expectedSnapshotId: previewResult.preview!.snapshotId }, (event) => output.push(event.text));
      expect(result).toMatchObject({ outcome: "completed", exitCode: 0 });
      expect(output.join("")).toContain("> git merge --no-edit");
      expect(output.join("")).toContain("revalidated under the repository mutation lock");
    });
  });

  it("creates a forced merge commit and rejects ff-only when histories diverge", async () => {
    await withRepo(async (repo) => {
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("feature.txt", "feature\n", "feature");
      await repo.checkout("main");
      await repo.commit("main.txt", "main\n", "main");

      const ffPreview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      const rejected = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "ff-only", expectedSnapshotId: ffPreview.snapshotId });
      expect(rejected).toMatchObject({ outcome: "failed", exitCode: 128, operationState: null });

      const mergePreview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      const merged = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "no-ff", expectedSnapshotId: mergePreview.snapshotId });
      expect(merged).toMatchObject({ outcome: "completed", exitCode: 0 });
      expect((await repo.run(["rev-list", "--parents", "-n", "1", "HEAD"])).stdout.trim().split(/\s+/)).toHaveLength(3);
    });
  });

  it("stages a squash without moving HEAD", async () => {
    await withRepo(async (repo) => {
      const before = await repo.oid("HEAD");
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("space ü.txt", "unicode\n", "unicode path");
      await repo.checkout("main");
      const preview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      expect(preview.files).toContainEqual(expect.objectContaining({ path: "space ü.txt" }));
      const result = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "squash", expectedSnapshotId: preview.snapshotId });
      expect(result).toMatchObject({ outcome: "staged", headOid: before });
      expect((await repo.run(["diff", "--cached", "--name-only", "-z"])).stdout.split("\0")).toContain("space ü.txt");
    });
  });

  it("cherry-picks one or multiple commits in the supplied order and supports no-commit", async () => {
    await withRepo(async (repo) => {
      await repo.branch("source");
      await repo.checkout("source");
      const first = await repo.commit("one.txt", "one\n", "one");
      const second = await repo.commit("two.txt", "two\n", "two");
      await repo.checkout("main");
      const preview = await ready(repo, { kind: "cherry-pick", repoPath: repo.path, commitOids: [first, second] });
      expect(preview.commits.map((commit) => commit.oid)).toEqual([first, second]);
      const picked = await repo.service.execute({ kind: "cherry-pick", repoPath: repo.path, commitOids: [first, second], noCommit: false, expectedSnapshotId: preview.snapshotId });
      expect(picked).toMatchObject({ outcome: "completed", completedCommitOids: [first, second] });
      expect((await repo.run(["log", "-2", "--format=%s", "--reverse"])).stdout.trim().split("\n")).toEqual(["one", "two"]);

      await repo.run(["reset", "--hard", "HEAD~2"]);
      const stagedPreview = await ready(repo, { kind: "cherry-pick", repoPath: repo.path, commitOids: [first] });
      const staged = await repo.service.execute({ kind: "cherry-pick", repoPath: repo.path, commitOids: [first], noCommit: true, expectedSnapshotId: stagedPreview.snapshotId });
      expect(staged).toMatchObject({ outcome: "staged", previousHeadOid: staged.headOid });
      expect((await repo.run(["diff", "--cached", "--name-only"])).stdout.trim()).toBe("one.txt");
    });
  });

  it("rejects merge-commit cherry-picks without a mainline parent", async () => {
    await withRepo(async (repo) => {
      await repo.branch("side");
      await repo.checkout("side");
      await repo.commit("side.txt", "side\n", "side");
      await repo.checkout("main");
      await repo.commit("main.txt", "main\n", "main");
      await repo.run(["merge", "--no-ff", "--no-edit", "side"]);
      const mergeOid = await repo.oid("HEAD");
      const result = await repo.service.preview({ kind: "cherry-pick", repoPath: repo.path, commitOids: [mergeOid] });
      expect(result).toMatchObject({ outcome: "blocked", preview: { mergeCommitOids: [mergeOid] } });
      expect(result.preview?.blockingReasons.join(" ")).toContain("mainline parent");
    });
  });

  it("preserves merge, cherry-pick, and rebase conflict state for restart recovery and abort", async () => {
    for (const kind of ["merge", "cherry-pick", "rebase"] as const) {
      await withConflictRepo(kind, async (repo, request) => {
        const preview = await ready(repo, request);
        const execution = request.kind === "merge"
          ? { ...request, mode: "normal" as const, expectedSnapshotId: preview.snapshotId }
          : request.kind === "rebase"
            ? { ...request, preserveMerges: false, expectedSnapshotId: preview.snapshotId }
            : { ...request, noCommit: false, expectedSnapshotId: preview.snapshotId };
        const result = await repo.service.execute(execution);
        expect(result).toMatchObject({ outcome: "active", operationState: { kind, hasConflicts: true } });
        const restarted = new GitOperationRecoveryService(new NodeProcessRunner());
        const state = await restarted.detect(repo.path);
        expect(state).toMatchObject({ kind, hasConflicts: true });
        await expect(restarted.runAction({ repoPath: repo.path, expectedKind: kind, expectedStateId: state!.stateId, action: "abort" })).resolves.toMatchObject({ outcome: "completed" });
      });
    }
  });

  it("reports partial multi-commit cherry-pick progress", async () => {
    await withRepo(async (repo) => {
      await repo.commit("conflict.txt", "base\n", "base conflict");
      await repo.branch("source");
      await repo.checkout("source");
      const first = await repo.commit("clean.txt", "clean\n", "clean first");
      const second = await repo.commit("conflict.txt", "source\n", "conflicting second");
      await repo.checkout("main");
      await repo.commit("conflict.txt", "main\n", "main conflict");
      const preview = await ready(repo, { kind: "cherry-pick", repoPath: repo.path, commitOids: [first, second] });
      const result = await repo.service.execute({ kind: "cherry-pick", repoPath: repo.path, commitOids: [first, second], noCommit: false, expectedSnapshotId: preview.snapshotId });
      expect(result).toMatchObject({ outcome: "active", completedCommitOids: [first], stoppedCommitOid: second, operationState: { kind: "cherry-pick" } });
    });
  });

  it("rebases successfully, warns for published branches, never pushes, and rejects detached HEAD", async () => {
    await withRepo(async (repo) => {
      const remotePath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-integration-remote-"));
      const remoteRunner = new NodeProcessRunner();
      await remoteRunner.run("git", ["init", "--bare", remotePath]);
      try {
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("feature.txt", "feature\n", "feature");
      await repo.run(["remote", "add", "origin", remotePath]);
      await repo.run(["push", "-u", "origin", "feature"]);
      const publishedOid = await repo.oid("origin/feature");
      await repo.checkout("main");
      await repo.commit("main.txt", "main\n", "main");
      await repo.checkout("feature");
      const preview = await ready(repo, { kind: "rebase", repoPath: repo.path, newBase: { kind: "local", name: "main" } });
      expect(preview).toMatchObject({ kind: "rebase", published: true, expectedRewrittenCommitCount: 1 });
      expect(preview.warnings.join(" ")).toContain("force-with-lease");
      const result = await repo.service.execute({ kind: "rebase", repoPath: repo.path, newBase: { kind: "local", name: "main" }, preserveMerges: false, expectedSnapshotId: preview.snapshotId });
      expect(result).toMatchObject({ outcome: "completed", exitCode: 0, forceWithLease: { remoteName: "origin", remoteBranchName: "feature", expectedRemoteOid: publishedOid } });
      expect((await repo.run(["merge-base", "--is-ancestor", "main", "HEAD"], true)).exitCode).toBe(0);
      expect((await remoteRunner.run("git", ["--git-dir", remotePath, "rev-parse", "refs/heads/feature"])).stdout.trim()).toBe(publishedOid);
      const published = await repo.gitService.pushWithForceLease({ repoPath: repo.path, ...result.forceWithLease! });
      expect(published.exitCode).toBe(0);
      expect((await remoteRunner.run("git", ["--git-dir", remotePath, "rev-parse", "refs/heads/feature"])).stdout.trim()).toBe(result.headOid);

      await repo.run(["checkout", "--detach", "HEAD"]);
      const detached = await repo.service.preview({ kind: "rebase", repoPath: repo.path, newBase: { kind: "local", name: "main" } });
      expect(detached).toMatchObject({ outcome: "blocked" });
      expect(detached.preview?.blockingReasons.join(" ")).toContain("detached HEAD");
      } finally {
        await fs.rm(remotePath, { recursive: true, force: true });
      }
    });
  });

  it("blocks dirty or staged working trees before any mutation", async () => {
    await withRepo(async (repo) => {
      await repo.branch("feature");
      await fs.writeFile(path.join(repo.path, "dirty.txt"), "dirty\n");
      await repo.run(["add", "dirty.txt"]);
      const result = await repo.service.preview({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      expect(result).toMatchObject({ outcome: "blocked", preview: { clean: false } });
      expect(result.preview?.blockingReasons.join(" ")).toContain("stash");
    });
  });

  it("preserves merge state when a hook rejects the final commit", async () => {
    await withRepo(async (repo) => {
      await repo.branch("feature");
      await repo.checkout("feature");
      await repo.commit("feature.txt", "feature\n", "feature");
      await repo.checkout("main");
      const hooks = (await repo.run(["rev-parse", "--git-path", "hooks"])).stdout.trim();
      const hookPath = path.join(path.resolve(repo.path, hooks), "commit-msg");
      await fs.writeFile(hookPath, "#!/bin/sh\necho rejected-by-hook >&2\nexit 1\n");
      await fs.chmod(hookPath, 0o755);
      const preview = await ready(repo, { kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" } });
      const result = await repo.service.execute({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "feature" }, mode: "no-ff", expectedSnapshotId: preview.snapshotId });
      expect(result).toMatchObject({ outcome: "active", operationState: { kind: "merge", phase: "ready-to-continue" } });
      expect(result.stderr).toContain("rejected-by-hook");
    });
  });

  it("accepts Unicode ref names and rejects impossible Git ref names containing spaces", async () => {
    await withRepo(async (repo) => {
      const unicodeBranch = "fēature/東京";
      await repo.branch(unicodeBranch);
      const preview = await repo.service.preview({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: unicodeBranch } });
      expect(preview.preview).toMatchObject({ source: { name: unicodeBranch } });
      const invalid = await repo.service.preview({ kind: "merge", repoPath: repo.path, source: { kind: "local", name: "branch with spaces" } });
      expect(invalid).toMatchObject({ outcome: "failed", preview: null });
      expect(invalid.message).toContain("invalid");
    });
  });
});

interface RepoFixture {
  path: string;
  service: GitIntegrationService;
  gitService: GitService;
  run(args: string[], allowFailure?: boolean): Promise<ProcessResult>;
  branch(name: string): Promise<void>;
  checkout(name: string): Promise<void>;
  commit(file: string, contents: string, message: string): Promise<string>;
  oid(ref: string): Promise<string>;
}

async function withRepo(callback: (repo: RepoFixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-integration-"));
  const runner = new NodeProcessRunner();
  const run = async (args: string[], allowFailure = false): Promise<ProcessResult> => {
    const result = await runner.run("git", ["-C", root, ...args]);
    if (!allowFailure && result.exitCode !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
    return result;
  };
  try {
    await runner.run("git", ["init", "-b", "main", root]);
    await run(["config", "user.name", "Githead Test"]);
    await run(["config", "user.email", "githead@example.test"]);
    const recovery = new GitOperationRecoveryService(runner);
    const fixture: RepoFixture = {
      path: root,
      service: new GitIntegrationService(runner, recovery),
      gitService: new GitService(runner, recovery),
      run,
      branch: async (name) => { await run(["branch", name]); },
      checkout: async (name) => { await run(["checkout", name]); },
      commit: async (file, contents, message) => {
        await fs.writeFile(path.join(root, file), contents);
        await run(["add", "--", file]);
        await run(["commit", "-m", message]);
        return (await run(["rev-parse", "HEAD"])).stdout.trim();
      },
      oid: async (ref) => (await run(["rev-parse", ref])).stdout.trim()
    };
    await fixture.commit("README.md", "base\n", "initial");
    await callback(fixture);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function ready(repo: RepoFixture, request: GitIntegrationPreviewRequest): Promise<GitIntegrationPreview> {
  const result = await repo.service.preview(request);
  expect(result.outcome).toBe("ready");
  expect(result.preview).not.toBeNull();
  return result.preview!;
}

async function withConflictRepo(
  kind: "merge" | "cherry-pick" | "rebase",
  callback: (repo: RepoFixture, request: GitIntegrationPreviewRequest) => Promise<void>
): Promise<void> {
  await withRepo(async (repo) => {
    await repo.commit("conflict.txt", "base\n", "base conflict");
    await repo.branch("topic");
    await repo.checkout("topic");
    const topicOid = await repo.commit("conflict.txt", "topic\n", "topic conflict");
    await repo.checkout("main");
    await repo.commit("conflict.txt", "main\n", "main conflict");
    if (kind === "rebase") await repo.checkout("topic");
    const request: GitIntegrationPreviewRequest = kind === "merge"
      ? { kind, repoPath: repo.path, source: { kind: "local", name: "topic" } }
      : kind === "rebase"
        ? { kind, repoPath: repo.path, newBase: { kind: "local", name: "main" } }
        : { kind, repoPath: repo.path, commitOids: [topicOid] };
    await callback(repo, request);
  });
}
