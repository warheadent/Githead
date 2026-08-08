import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { GitRepositoryOperationKind } from "../shared/types";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import { GitOperationRecoveryService } from "./gitOperationRecovery";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessResult, type ProcessRunner, type ProcessRunOptions } from "./processRunner";

describe("GitOperationRecoveryService with real Git repositories", { timeout: 20_000 }, () => {
  it("includes durable operation state in a normal repository status refresh", async () => {
    await withConflict("merge", async ({ repoPath }) => {
      const status = await new GitService(new NodeProcessRunner()).getRepoStatus({
        repoPath,
        generation: 17
      });

      expect(status).toMatchObject({
        repoPath,
        generation: 17,
        operationState: {
          kind: "merge",
          phase: "conflicts",
          conflictedPaths: ["conflict.txt"]
        }
      });
    });
  });

  it.each(["merge", "rebase", "cherry-pick", "revert"] satisfies GitRepositoryOperationKind[])(
    "recovers a pre-existing %s conflict after a simulated restart",
    async (kind) => withConflict(kind, async ({ repoPath }) => {
      const restartedService = new GitOperationRecoveryService(new NodeProcessRunner());
      const state = await restartedService.detect(repoPath);

      expect(state).toMatchObject({ kind, phase: "conflicts", conflictedPaths: ["conflict.txt"] });
      const result = await restartedService.runAction({
        repoPath,
        expectedKind: kind,
        expectedStateId: state!.stateId,
        action: "abort"
      });
      expect(result).toMatchObject({ exitCode: 0, outcome: "completed", state: null });
      await expect(restartedService.detect(repoPath)).resolves.toBeNull();
    })
  );

  it("continues a merge only after the conflict is resolved and staged", async () => {
    await withConflict("merge", async ({ repoPath, run }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const conflicted = await service.detect(repoPath);
      const blocked = await service.runAction({ repoPath, expectedKind: "merge", expectedStateId: conflicted!.stateId, action: "continue" });
      expect(blocked).toMatchObject({ outcome: "failed", state: { kind: "merge", hasConflicts: true } });

      await fs.writeFile(path.join(repoPath, "conflict.txt"), "resolved\n");
      await run(["-C", repoPath, "add", "conflict.txt"]);
      const resolved = await service.detect(repoPath);
      expect(resolved).toMatchObject({ phase: "ready-to-continue", hasConflicts: false });
      const continued = await service.runAction({ repoPath, expectedKind: "merge", expectedStateId: resolved!.stateId, action: "continue" });
      expect(continued).toMatchObject({ exitCode: 0, outcome: "completed", state: null });
    });
  });

  it("loads both conflict stages and explicitly saves and stages an edited result", async () => {
    await withConflict("merge", async ({ repoPath, run }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const state = await service.detect(repoPath);
      const conflict = await service.readConflict({
        repoPath,
        path: "conflict.txt",
        expectedKind: "merge",
        expectedStateId: state!.stateId
      });

      expect(conflict).toMatchObject({
        outcome: "ready",
        currentText: "main\n",
        incomingText: "topic\n"
      });
      expect(conflict.workingText).toContain("<<<<<<< HEAD");

      const unresolved = await service.saveConflict({
        repoPath,
        path: "conflict.txt",
        expectedKind: "merge",
        expectedStateId: state!.stateId,
        expectedWorkingHash: conflict.workingHash!,
        resolvedText: conflict.workingText!
      });
      expect(unresolved).toMatchObject({ outcome: "failed", state: { hasConflicts: true } });
      expect(unresolved.stderr).toContain("conflict marker");

      const saved = await service.saveConflict({
        repoPath,
        path: "conflict.txt",
        expectedKind: "merge",
        expectedStateId: state!.stateId,
        expectedWorkingHash: conflict.workingHash!,
        resolvedText: "main and topic\n"
      });

      expect(saved).toMatchObject({ exitCode: 0, outcome: "staged", state: { phase: "ready-to-continue", hasConflicts: false } });
      await expect(fs.readFile(path.join(repoPath, "conflict.txt"), "utf8")).resolves.toBe("main and topic\n");
      expect((await run(["-C", repoPath, "diff", "--name-only", "--diff-filter=U"])).stdout).toBe("");
    });
  });

  it("does not overwrite conflict work changed after the editor loaded", async () => {
    await withConflict("merge", async ({ repoPath }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const state = await service.detect(repoPath);
      const conflict = await service.readConflict({
        repoPath,
        path: "conflict.txt",
        expectedKind: "merge",
        expectedStateId: state!.stateId
      });
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "newer external edit\n");

      const saved = await service.saveConflict({
        repoPath,
        path: "conflict.txt",
        expectedKind: "merge",
        expectedStateId: state!.stateId,
        expectedWorkingHash: conflict.workingHash!,
        resolvedText: "stale editor result\n"
      });

      expect(saved).toMatchObject({ outcome: "stale", state: { kind: "merge", hasConflicts: true } });
      expect(saved.stderr).toContain("working file changed");
      await expect(fs.readFile(path.join(repoPath, "conflict.txt"), "utf8")).resolves.toBe("newer external edit\n");
    });
  });

  it.each(["rebase", "cherry-pick", "revert"] satisfies GitRepositoryOperationKind[])(
    "skips the current %s commit where Git supports it",
    async (kind) => withConflict(kind, async ({ repoPath }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const state = await service.detect(repoPath);
      const result = await service.runAction({ repoPath, expectedKind: kind, expectedStateId: state!.stateId, action: "skip" });
      expect(result).toMatchObject({ exitCode: 0, outcome: "completed", state: null });
    })
  );

  it.each(["cherry-pick", "revert"] as const)(
    "detects and skips within a multi-commit %s sequence",
    async (kind) => withMultiCommitSequenceConflict(kind, async ({ repoPath }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const state = await service.detect(repoPath);

      expect(state).toMatchObject({
        kind,
        phase: "conflicts",
        currentBranch: "main",
        conflictedPaths: ["conflict.txt"],
        actions: { skip: { supported: true, enabled: true } }
      });
      const result = await service.runAction({
        repoPath,
        expectedKind: kind,
        expectedStateId: state!.stateId,
        action: "skip"
      });
      expect(result).toMatchObject({ exitCode: 0, outcome: "completed", state: null });
    })
  );

  it("rejects a stale action after conflict-resolution state changes", async () => {
    await withConflict("merge", async ({ repoPath, run }) => {
      const service = new GitOperationRecoveryService(new NodeProcessRunner());
      const stale = await service.detect(repoPath);
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "resolved\n");
      await run(["-C", repoPath, "add", "conflict.txt"]);

      const result = await service.runAction({ repoPath, expectedKind: "merge", expectedStateId: stale!.stateId, action: "abort" });

      expect(result).toMatchObject({ outcome: "stale", state: { kind: "merge", phase: "ready-to-continue" } });
      await expect(service.detect(repoPath)).resolves.toMatchObject({ kind: "merge" });
    });
  });

  it("reports a failed recovery command without losing the active operation", async () => {
    await withConflict("merge", async ({ repoPath }) => {
      const delegate = new NodeProcessRunner();
      const runner = interceptRecoveryCommand(delegate, async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "simulated abort failure"
      }));
      const service = new GitOperationRecoveryService(runner);
      const state = await service.detect(repoPath);

      const result = await service.runAction({
        repoPath,
        expectedKind: "merge",
        expectedStateId: state!.stateId,
        action: "abort"
      });

      expect(result).toMatchObject({
        exitCode: 1,
        outcome: "active",
        stderr: "simulated abort failure",
        state: { kind: "merge", hasConflicts: true }
      });
    });
  });

  it("treats cancellation during recovery as potentially leaving the operation active", async () => {
    await withConflict("merge", async ({ repoPath }) => {
      let signalActionStarted!: () => void;
      const actionStarted = new Promise<void>((resolve) => { signalActionStarted = resolve; });
      const delegate = new NodeProcessRunner();
      const cancellableRunner = new CancellableProcessRunner(interceptRecoveryCommand(
        delegate,
        (_command, _args, options) => new Promise<ProcessResult>((resolve) => {
          signalActionStarted();
          const finish = () => resolve({
            exitCode: -1,
            stdout: "",
            stderr: "Operation was cancelled.",
            terminationReason: "aborted"
          });
          if (options?.signal?.aborted) finish();
          else options?.signal?.addEventListener("abort", finish, { once: true });
        })
      ));
      const service = new GitOperationRecoveryService(cancellableRunner);
      const state = await service.detect(repoPath);
      const controller = new AbortController();
      const action = cancellableRunner.runWithSignal(controller.signal, () => service.runAction({
        repoPath,
        expectedKind: "merge",
        expectedStateId: state!.stateId,
        action: "abort"
      }));

      await actionStarted;
      controller.abort(new DOMException("Operation was cancelled.", "AbortError"));
      const result = await action;

      expect(result.outcome).not.toBe("completed");
      await expect(new GitOperationRecoveryService(delegate).detect(repoPath)).resolves.toMatchObject({
        kind: "merge",
        hasConflicts: true
      });
    });
  });
});

interface ConflictFixture {
  repoPath: string;
  run(args: string[], allowFailure?: boolean): Promise<ProcessResult>;
}

async function withConflict(
  kind: GitRepositoryOperationKind,
  callback: (fixture: ConflictFixture) => Promise<void>
): Promise<void> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), `githead-${kind}-integration-`));
  const runner = new NodeProcessRunner();
  const run = async (args: string[], allowFailure = false): Promise<ProcessResult> => {
    const result = await runner.run("git", args);
    if (!allowFailure) expect(result.exitCode, result.stderr).toBe(0);
    return result;
  };
  try {
    await run(["init", "-b", "main", repoPath]);
    await run(["-C", repoPath, "config", "user.name", "Githead Test"]);
    await run(["-C", repoPath, "config", "user.email", "githead@example.test"]);
    await fs.writeFile(path.join(repoPath, "conflict.txt"), "base\n");
    await run(["-C", repoPath, "add", "conflict.txt"]);
    await run(["-C", repoPath, "commit", "-m", "base"]);

    if (kind === "revert") {
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "target\n");
      await run(["-C", repoPath, "commit", "-am", "target"]);
      const target = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "later\n");
      await run(["-C", repoPath, "commit", "-am", "later"]);
      expect((await run(["-C", repoPath, "revert", target], true)).exitCode).not.toBe(0);
    } else {
      await run(["-C", repoPath, "switch", "-c", "topic"]);
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "topic\n");
      await run(["-C", repoPath, "commit", "-am", "topic"]);
      const topic = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await run(["-C", repoPath, "switch", "main"]);
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "main\n");
      await run(["-C", repoPath, "commit", "-am", "main"]);
      if (kind === "rebase") {
        await run(["-C", repoPath, "switch", "topic"]);
        expect((await run(["-C", repoPath, "rebase", "main"], true)).exitCode).not.toBe(0);
      } else {
        const command = kind === "merge" ? ["merge", "topic"] : ["cherry-pick", topic];
        expect((await run(["-C", repoPath, ...command], true)).exitCode).not.toBe(0);
      }
    }
    await callback({ repoPath, run });
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

async function withMultiCommitSequenceConflict(
  kind: "cherry-pick" | "revert",
  callback: (fixture: ConflictFixture) => Promise<void>
): Promise<void> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), `githead-${kind}-sequence-integration-`));
  const runner = new NodeProcessRunner();
  const run = async (args: string[], allowFailure = false): Promise<ProcessResult> => {
    const result = await runner.run("git", args);
    if (!allowFailure) expect(result.exitCode, result.stderr).toBe(0);
    return result;
  };
  try {
    await run(["init", "-b", "main", repoPath]);
    await run(["-C", repoPath, "config", "user.name", "Githead Test"]);
    await run(["-C", repoPath, "config", "user.email", "githead@example.test"]);
    await fs.writeFile(path.join(repoPath, "conflict.txt"), "base\n");
    await run(["-C", repoPath, "add", "conflict.txt"]);
    await run(["-C", repoPath, "commit", "-m", "base"]);

    if (kind === "cherry-pick") {
      await run(["-C", repoPath, "switch", "-c", "topic"]);
      await fs.writeFile(path.join(repoPath, "first.txt"), "first\n");
      await run(["-C", repoPath, "add", "first.txt"]);
      await run(["-C", repoPath, "commit", "-m", "first"]);
      const first = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "topic\n");
      await run(["-C", repoPath, "commit", "-am", "conflict"]);
      const conflict = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "last.txt"), "last\n");
      await run(["-C", repoPath, "add", "last.txt"]);
      await run(["-C", repoPath, "commit", "-m", "last"]);
      const last = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await run(["-C", repoPath, "switch", "main"]);
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "main\n");
      await run(["-C", repoPath, "commit", "-am", "main"]);
      expect((await run(["-C", repoPath, "cherry-pick", first, conflict, last], true)).exitCode).not.toBe(0);
    } else {
      await fs.writeFile(path.join(repoPath, "first.txt"), "first\n");
      await run(["-C", repoPath, "add", "first.txt"]);
      await run(["-C", repoPath, "commit", "-m", "first"]);
      const first = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "target\n");
      await run(["-C", repoPath, "commit", "-am", "conflict"]);
      const conflict = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "last.txt"), "last\n");
      await run(["-C", repoPath, "add", "last.txt"]);
      await run(["-C", repoPath, "commit", "-m", "last"]);
      const last = (await run(["-C", repoPath, "rev-parse", "HEAD"])).stdout.trim();
      await fs.writeFile(path.join(repoPath, "conflict.txt"), "later\n");
      await run(["-C", repoPath, "commit", "-am", "later"]);
      expect((await run(["-C", repoPath, "revert", last, conflict, first], true)).exitCode).not.toBe(0);
    }

    await callback({ repoPath, run });
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

function interceptRecoveryCommand(
  delegate: ProcessRunner,
  handler: (command: string, args: string[], options?: ProcessRunOptions) => Promise<ProcessResult>
): ProcessRunner {
  return {
    run(command, args, options) {
      return args.at(-2) === "merge" && args.at(-1) === "--abort"
        ? handler(command, args, options)
        : delegate.run(command, args, options);
    }
  };
}
