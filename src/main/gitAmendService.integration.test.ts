import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { GitAmendPreview } from "../shared/types";
import { GitService } from "./gitService";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import { NodeProcessRunner, type ProcessResult } from "./processRunner";

const TEMP_DIRECTORY_REMOVE_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
} as const;

describe("Git amend service with real Git repositories", { timeout: 30_000 }, () => {
  it("changes only the message while preserving the commit tree, index, and unstaged changes", async () => {
    await withRepo(async (repo) => {
      await repo.write("staged.txt", "base staged\n");
      await repo.write("working.txt", "base working\n");
      await repo.run(["add", "."]);
      await repo.run(["commit", "-m", "base message"]);
      await repo.write("staged.txt", "staged change\n");
      await repo.run(["add", "staged.txt"]);
      await repo.write("working.txt", "working change\n");
      const oldHead = await repo.oid("HEAD");
      const oldTree = await repo.oid("HEAD^{tree}");
      const indexTree = (await repo.run(["write-tree"])).stdout.trim();
      const workingDiff = (await repo.run(["diff", "--", "working.txt"])).stdout;

      const preview = await ready(repo, "history", "message-only");
      expect(preview.stagedFiles).toContainEqual(expect.objectContaining({ path: "staged.txt" }));
      const result = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "history",
        mode: "message-only",
        message: "new message\n\nbody",
        expectedSnapshotId: preview.snapshotId
      });

      expect(result).toMatchObject({ outcome: "completed", previousHeadOid: oldHead });
      expect(result.headOid).not.toBe(oldHead);
      expect(await repo.oid("HEAD^{tree}")).toBe(oldTree);
      expect((await repo.run(["write-tree"])).stdout.trim()).toBe(indexTree);
      expect((await repo.run(["show", "-s", "--format=%B", "HEAD"])).stdout.trim()).toBe("new message\n\nbody");
      expect((await repo.run(["diff", "--", "working.txt"])).stdout).toBe(workingDiff);
      expect((await repo.run(["status", "--short"])).stdout).toContain("M  staged.txt");
      expect((await repo.run(["status", "--short"])).stdout).toContain(" M working.txt");
    });
  });

  it("adds staged changes with a new message and leaves unstaged changes unchanged", async () => {
    await withRepo(async (repo) => {
      await repo.write("tracked.txt", "base\n");
      await repo.write("working.txt", "base\n");
      await repo.run(["add", "."]);
      await repo.run(["commit", "-m", "old message"]);
      await repo.write("tracked.txt", "staged\n");
      await repo.run(["add", "tracked.txt"]);
      await repo.write("working.txt", "unstaged\n");
      const preview = await ready(repo, "composer", "staged-edit");
      expect(preview.defaultMode).toBe("staged-edit");

      const result = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "composer",
        mode: "staged-edit",
        message: "new staged message",
        expectedSnapshotId: preview.snapshotId
      });

      expect(result.outcome).toBe("completed");
      expect((await repo.run(["show", "HEAD:tracked.txt"])).stdout).toBe("staged\n");
      expect((await repo.run(["show", "-s", "--format=%B", "HEAD"])).stdout.trim()).toBe("new staged message");
      expect((await repo.run(["diff", "--cached", "--quiet"])).exitCode).toBe(0);
      expect((await repo.run(["diff", "--", "working.txt"])).stdout).toContain("+unstaged");
    });
  });

  it("adds staged changes while keeping the full old message", async () => {
    await withRepo(async (repo) => {
      await repo.write("file.txt", "base\n");
      await repo.run(["add", "."]);
      await repo.run(["commit", "-m", "old subject", "-m", "old body"]);
      await repo.write("file.txt", "updated\n");
      await repo.run(["add", "file.txt"]);
      const preview = await ready(repo, "history", "staged-keep");

      const result = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "history",
        mode: "staged-keep",
        message: "ignored",
        expectedSnapshotId: preview.snapshotId
      });

      expect(result.outcome).toBe("completed");
      expect((await repo.run(["show", "-s", "--format=%B", "HEAD"])).stdout.trim()).toBe("old subject\n\nold body");
      expect((await repo.run(["show", "HEAD:file.txt"])).stdout).toBe("updated\n");
    });
  });

  it("preserves added, deleted, renamed, and intent-to-add index entries in message-only mode", async () => {
    await withRepo(async (repo) => {
      await repo.write("delete.txt", "delete me\n");
      await repo.write("rename.txt", "rename me\n");
      await repo.run(["add", "."]);
      await repo.run(["commit", "-m", "index base"]);
      await repo.write("added.txt", "added\n");
      await repo.write("intent.txt", "intent\n");
      await repo.run(["add", "added.txt"]);
      await repo.run(["add", "-N", "intent.txt"]);
      await repo.run(["rm", "delete.txt"]);
      await repo.run(["mv", "rename.txt", "renamed.txt"]);
      const indexBefore = (await repo.run(["ls-files", "--stage", "-v", "-z"])).stdout;
      const preview = await ready(repo, "history", "message-only");

      const result = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "index-only message", expectedSnapshotId: preview.snapshotId });

      expect(result.outcome).toBe("completed");
      expect((await repo.run(["ls-files", "--stage", "-v", "-z"])).stdout).toBe(indexBefore);
      expect((await repo.run(["status", "--short"])).stdout).toContain("intent.txt");
    });
  });

  it("supports an initial commit and detached HEAD", async () => {
    await withRepo(async (repo) => {
      const initial = await repo.oid("HEAD");
      const initialPreview = await ready(repo, "history", "message-only");
      const amended = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "history",
        mode: "message-only",
        message: "amended initial",
        expectedSnapshotId: initialPreview.snapshotId
      });
      expect(amended).toMatchObject({ outcome: "completed", previousHeadOid: initial });

      await repo.run(["checkout", "--detach", "HEAD"]);
      const detached = await ready(repo, "history", "message-only");
      expect(detached.currentBranch).toBeNull();
      const detachedResult = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "history",
        mode: "message-only",
        message: "detached message",
        expectedSnapshotId: detached.snapshotId
      });
      expect(detachedResult.outcome).toBe("completed");
      expect((await repo.run(["symbolic-ref", "--quiet", "HEAD"])).exitCode).toBe(1);
    });
  });

  it("rejects no-HEAD, empty, unchanged, stale HEAD, and stale index requests", async () => {
    const emptyPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-amend-empty-"));
    try {
      const runner = new NodeProcessRunner();
      await runner.run("git", ["-C", emptyPath, "init", "-q", "-b", "main"]);
      const emptyService = new GitService(runner);
      await expect(emptyService.getAmendPreview({ repoPath: emptyPath, source: "history" })).resolves.toMatchObject({
        outcome: "failed",
        message: expect.stringContaining("no commit to amend")
      });
    } finally {
      await fs.rm(emptyPath, TEMP_DIRECTORY_REMOVE_OPTIONS);
    }

    await withRepo(async (repo) => {
      const preview = await ready(repo, "history", "message-only");
      const empty = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: " ", expectedSnapshotId: preview.snapshotId });
      expect(empty).toMatchObject({ outcome: "failed", amendErrorKind: "invalid-message" });
      const unchanged = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: preview.message, expectedSnapshotId: preview.snapshotId });
      expect(unchanged).toMatchObject({ outcome: "failed", amendErrorKind: "invalid-message" });

      await repo.write("head.txt", "head\n");
      await repo.run(["add", "head.txt"]);
      await repo.run(["commit", "-m", "new head"]);
      const staleHead = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "stale", expectedSnapshotId: preview.snapshotId });
      expect(staleHead).toMatchObject({ outcome: "stale", amendErrorKind: "stale" });

      const indexPreview = await ready(repo, "history", "message-only");
      await repo.write("index.txt", "index\n");
      await repo.run(["add", "index.txt"]);
      const staleIndex = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "stale index", expectedSnapshotId: indexPreview.snapshotId });
      expect(staleIndex).toMatchObject({ outcome: "stale", amendErrorKind: "stale" });
    });
  });

  it("detects a fetched published ref and a local commit ahead of upstream", async () => {
    await withRepo(async (repo) => {
      await repo.run(["remote", "add", "origin", repo.path]);
      await repo.run(["update-ref", "refs/remotes/origin/main", "HEAD"]);
      await repo.run(["branch", "--set-upstream-to=origin/main", "main"]);
      const published = await ready(repo, "history", "message-only");
      expect(published).toMatchObject({ publication: "published", upstream: "origin/main" });
      expect(published.publishedRefs).toContain("origin/main");

      await repo.write("local.txt", "local\n");
      await repo.run(["add", "local.txt"]);
      await repo.run(["commit", "-m", "local ahead"]);
      const local = await ready(repo, "history", "message-only");
      expect(local.publication).toBe("local-ahead");
    });
  });

  it("classifies hook rejection, signing failure, and missing identity", async () => {
    await withRepo(async (repo) => {
      const hooks = (await repo.run(["rev-parse", "--git-path", "hooks"])).stdout.trim();
      const hookPath = path.resolve(repo.path, hooks, "commit-msg");
      await fs.writeFile(hookPath, "#!/bin/sh\necho rejected-by-hook >&2\nexit 1\n");
      await fs.chmod(hookPath, 0o755);
      let preview = await ready(repo, "history", "message-only");
      const hook = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "hook message", expectedSnapshotId: preview.snapshotId });
      expect(hook).toMatchObject({ outcome: "failed", amendErrorKind: "hook-rejected", recoveryRef: expect.stringContaining("refs/githead/amend-recovery/") });
      await fs.rm(hookPath);

      const signer = path.join(repo.path, "fail-sign.sh");
      await fs.writeFile(signer, "#!/bin/sh\necho gpg failed to sign the data >&2\nexit 1\n");
      await fs.chmod(signer, 0o755);
      await repo.run(["config", "commit.gpgSign", "true"]);
      await repo.run(["config", "gpg.program", signer]);
      preview = await ready(repo, "history", "message-only");
      const signing = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "signed message", expectedSnapshotId: preview.snapshotId });
      expect(signing).toMatchObject({ outcome: "failed", amendErrorKind: "signing-failed" });
      await repo.run(["config", "commit.gpgSign", "false"]);

      await repo.run(["config", "user.name", ""]);
      await repo.run(["config", "user.email", ""]);
      preview = await ready(repo, "history", "message-only");
      const identity = await repo.service.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "identity message", expectedSnapshotId: preview.snapshotId });
      expect(identity).toMatchObject({ outcome: "failed", amendErrorKind: "missing-author-identity" });
    });
  });

  it("keeps a durable hidden recovery ref and restores with a soft reset", async () => {
    await withRepo(async (repo) => {
      await repo.write("change.txt", "base\n");
      await repo.run(["add", "."]);
      await repo.run(["commit", "-m", "base"]);
      const oldHead = await repo.oid("HEAD");
      await repo.write("change.txt", "amended\n");
      await repo.run(["add", "change.txt"]);
      const preview = await ready(repo, "composer", "staged-keep");
      const amended = await repo.service.amendLastCommit({ repoPath: repo.path, source: "composer", mode: "staged-keep", message: "", expectedSnapshotId: preview.snapshotId });
      expect(amended.outcome).toBe("completed");
      expect((await repo.run(["show-ref", "--verify", amended.recoveryRef!])).stdout).toContain(oldHead);
      expect((await repo.run(["log", "--branches", "--remotes", "--tags", "--format=%D"])).stdout).not.toContain("githead/amend-recovery");

      const restorePreview = await ready(repo, "history", "message-only");
      const point = restorePreview.recoveryPoints.find((candidate) => candidate.ref === amended.recoveryRef);
      expect(point).toBeTruthy();
      const restored = await repo.service.restoreAmendRecovery({
        repoPath: repo.path,
        recoveryRef: point!.ref,
        expectedRestoreToken: point!.restoreToken
      });
      expect(restored).toMatchObject({ outcome: "completed", headOid: oldHead });
      expect(await repo.oid("HEAD")).toBe(oldHead);
      expect((await repo.run(["diff", "--cached", "--name-only"])).stdout.trim()).toBe("change.txt");
      expect((await repo.run(["show-ref", "--verify", restored.recoveryRef!])).stdout).toContain(amended.headOid!);
    });
  });

  it("keeps the 20 newest recovery refs after a verified amend", async () => {
    await withRepo(async (repo) => {
      const oldHead = await repo.oid("HEAD");
      for (let index = 0; index < 21; index += 1) {
        const timestamp = String(1_700_000_000_000 + index);
        const uuid = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
        await repo.run(["update-ref", `refs/githead/amend-recovery/${timestamp}-${uuid}`, oldHead]);
      }

      const preview = await ready(repo, "history", "message-only");
      const amended = await repo.service.amendLastCommit({
        repoPath: repo.path,
        source: "history",
        mode: "message-only",
        message: "retention check",
        expectedSnapshotId: preview.snapshotId
      });

      expect(amended.outcome).toBe("completed");
      const refs = (await repo.run(["for-each-ref", "--format=%(refname)", "refs/githead/amend-recovery/"]))
        .stdout.trim().split(/\r?\n/).filter(Boolean);
      expect(refs).toHaveLength(20);
      expect(refs).toContain(amended.recoveryRef);
    });
  });

  it("blocks an active Git operation and classifies cancellation and timeout without changing HEAD", async () => {
    await withRepo(async (repo) => {
      const mergeHeadPath = (await repo.run(["rev-parse", "--git-path", "MERGE_HEAD"])).stdout.trim();
      await fs.writeFile(path.resolve(repo.path, mergeHeadPath), `${await repo.oid("HEAD")}\n`);
      const blocked = await repo.service.getAmendPreview({ repoPath: repo.path, source: "history", mode: "message-only" });
      expect(blocked).toMatchObject({ outcome: "blocked", preview: { blockingReasons: [expect.stringContaining("active merge")] } });
      await fs.rm(path.resolve(repo.path, mergeHeadPath));

      const hooks = (await repo.run(["rev-parse", "--git-path", "hooks"])).stdout.trim();
      const hookPath = path.resolve(repo.path, hooks, "commit-msg");
      const hookStartedPath = path.join(repo.path, ".git", "githead-amend-hook-started");
      await fs.writeFile(hookPath, "#!/bin/sh\n: > .git/githead-amend-hook-started\nsleep 10\n");
      await fs.chmod(hookPath, 0o755);
      const oldHead = await repo.oid("HEAD");
      const cancellableRunner = new CancellableProcessRunner(new NodeProcessRunner());
      const cancellableService = new GitService(cancellableRunner);

      let preview = (await cancellableService.getAmendPreview({ repoPath: repo.path, source: "history", mode: "message-only" })).preview!;
      const cancelController = new AbortController();
      const cancelledPromise = cancellableRunner.runWithSignal(cancelController.signal, () => cancellableService.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "cancelled amend", expectedSnapshotId: preview.snapshotId }));
      await waitForFile(hookStartedPath);
      cancelController.abort(new DOMException("Cancelled", "AbortError"));
      await expect(cancelledPromise).resolves.toMatchObject({ outcome: "cancelled", amendErrorKind: "cancelled" });
      expect(await repo.oid("HEAD")).toBe(oldHead);

      await fs.rm(hookStartedPath);
      preview = (await cancellableService.getAmendPreview({ repoPath: repo.path, source: "history", mode: "message-only" })).preview!;
      const timeoutController = new AbortController();
      const timedOutPromise = cancellableRunner.runWithSignal(timeoutController.signal, () => cancellableService.amendLastCommit({ repoPath: repo.path, source: "history", mode: "message-only", message: "timed out amend", expectedSnapshotId: preview.snapshotId }));
      await waitForFile(hookStartedPath);
      timeoutController.abort(new DOMException("Timed out", "TimeoutError"));
      await expect(timedOutPromise).resolves.toMatchObject({ outcome: "timed-out", amendErrorKind: "timed-out" });
      expect(await repo.oid("HEAD")).toBe(oldHead);
    });
  });
});

interface RepoFixture {
  path: string;
  service: GitService;
  run(args: string[]): Promise<ProcessResult>;
  write(file: string, contents: string): Promise<void>;
  oid(revision: string): Promise<string>;
}

async function withRepo(test: (repo: RepoFixture) => Promise<void>): Promise<void> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-amend-"));
  const runner = new NodeProcessRunner();
  const run = (args: string[]) => runner.run("git", ["-C", repoPath, ...args]);
  try {
    await run(["init", "-q", "-b", "main"]);
    await run(["config", "user.name", "Githead Test"]);
    await run(["config", "user.email", "githead@example.test"]);
    await fs.writeFile(path.join(repoPath, "README.md"), "initial\n");
    await run(["add", "README.md"]);
    await run(["commit", "-q", "-m", "initial commit"]);
    const repo: RepoFixture = {
      path: repoPath,
      service: new GitService(runner),
      run,
      write: (file, contents) => fs.writeFile(path.join(repoPath, file), contents),
      oid: async (revision) => (await run(["rev-parse", revision])).stdout.trim()
    };
    await test(repo);
  } finally {
    await fs.rm(repoPath, TEMP_DIRECTORY_REMOVE_OPTIONS);
  }
}

async function ready(
  repo: RepoFixture,
  source: "history" | "composer",
  mode: "message-only" | "staged-edit" | "staged-keep"
): Promise<GitAmendPreview> {
  const result = await repo.service.getAmendPreview({ repoPath: repo.path, source, mode });
  expect(result.outcome).toBe("ready");
  expect(result.preview).toBeTruthy();
  return result.preview!;
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await fs.stat(filePath).then(() => true, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${filePath}.`);
}
