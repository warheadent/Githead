import { describe, expect, it, vi } from "vite-plus/test";
import path from "node:path";
import {
  DuplicateRepositoryOperationIdError,
  RepositoryOperationCoordinator,
  repositoryOperationOwnerId
} from "./repositoryOperationCoordinator";

describe("RepositoryOperationCoordinator", () => {
  it("allows action saves alongside fetch or push, but keeps both exclusive against working-tree mutations", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const repoPath = path.resolve("Repo");
    let finishNetwork!: () => void;
    let finishSave!: () => void;
    const network = coordinator.run({ ...operationOptions("fetch", repoPath), access: "remote-sync" },
      () => new Promise<void>((resolve) => { finishNetwork = resolve; }));
    const save = coordinator.run({ ...operationOptions("save", repoPath), access: "actions-config" },
      () => new Promise<void>((resolve) => { finishSave = resolve; }));
    await expect(coordinator.run(operationOptions("checkout", repoPath), async () => "bad")).resolves.toEqual({ started: false });
    await expect(coordinator.run({ ...operationOptions("save-again", repoPath), access: "actions-config" }, async () => "bad")).resolves.toEqual({ started: false });
    finishNetwork();
    await network;
    expect(coordinator.isRunning(repoPath)).toBe(true);
    await expect(coordinator.run(operationOptions("reset", repoPath), async () => "bad")).resolves.toEqual({ started: false });
    finishSave();
    await save;
    await expect(coordinator.run(operationOptions("checkout-after", repoPath), async () => "ok")).resolves.toEqual({ started: true, value: "ok" });
  });

  it("permits snapshot reads during mutation and cancels each request by its own ID", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const repoPath = path.resolve("Repo");
    let finishMutation!: () => void;
    const mutation = coordinator.run(operationOptions("mutation", repoPath), () => new Promise<void>((resolve) => { finishMutation = resolve; }));
    const read = coordinator.run({ ...operationOptions("read", repoPath), access: "read" }, (signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    }));
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(coordinator.cancel("read", "owner-1").accepted).toBe(true);
    await rejected;
    expect(coordinator.getStates(["mutation"], "owner-1")).toEqual([{ operationId: "mutation", state: "running" }]);
    finishMutation();
    await mutation;
    expect(coordinator.isRunning(repoPath)).toBe(false);
  });

  it("applies access conflicts after resolving linked worktree scopes", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const commonDir = path.resolve("Shared", ".git");
    let finishSave!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const save = coordinator.run({ ...operationOptions("save", path.resolve("Worktree-A")), access: "actions-config", resolveScopePath: async () => commonDir }, () => new Promise<void>((resolve) => {
      finishSave = resolve;
      started();
    }));
    await ready;
    await expect(coordinator.run({ ...operationOptions("fetch", path.resolve("Worktree-B")), access: "remote-sync", resolveScopePath: async () => commonDir }, async () => "ok")).resolves.toEqual({ started: true, value: "ok" });
    await expect(coordinator.run({ ...operationOptions("checkout", path.resolve("Worktree-B")), resolveScopePath: async () => commonDir }, async () => "bad")).resolves.toEqual({ started: false });
    finishSave();
    await save;
    expect(coordinator.isRunning(commonDir)).toBe(false);
  });

  it("registers cancellation before asynchronous access classification finishes", async () => {
    const coordinator = new RepositoryOperationCoordinator(0);
    const repoPath = path.resolve("Repo");
    let finishAccess!: (access: "exclusive") => void;
    const callback = vi.fn(async () => "must not run");
    const pending = coordinator.run({ ...operationOptions("classify", repoPath), access: "remote-sync",
      resolveAccess: () => new Promise((resolve) => { finishAccess = resolve; }) }, callback);
    await Promise.resolve();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(coordinator.cancel("classify", "owner-1").accepted).toBe(true);
    await rejected;
    finishAccess("exclusive");
    await vi.waitFor(() => expect(coordinator.isRunning(repoPath)).toBe(false));
    expect(callback).not.toHaveBeenCalled();
  });

  it("builds collision-safe owner IDs from the WebContents, process, and frame IDs", () => {
    expect(repositoryOperationOwnerId(1, 23, 4)).toBe("1:23:4");
    expect(repositoryOperationOwnerId(1, 23, 4)).not.toBe(repositoryOperationOwnerId(12, 3, 4));
  });

  it("rejects overlap in one repository while allowing another repository", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const repoPath = path.resolve("Repo");
    const equivalentRepoPath = process.platform === "win32" ? `${repoPath.toLocaleLowerCase()}${path.sep}` : `${repoPath}${path.sep}`;
    const otherRepoPath = path.resolve("Other");
    let finishFirst!: () => void;
    const first = coordinator.run(operationOptions("first", repoPath), () => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));

    expect(coordinator.isRunning(equivalentRepoPath)).toBe(true);
    await expect(coordinator.run(operationOptions("same-scope", repoPath), async () => "same")).resolves.toEqual({ started: false });
    expect(coordinator.cancel("same-scope", "owner-1")).toEqual({ accepted: false, state: "not-found" });
    await expect(coordinator.run(operationOptions("other-scope", otherRepoPath), async () => "other")).resolves.toEqual({ started: true, value: "other" });

    finishFirst();
    await expect(first).resolves.toEqual({ started: true, value: undefined });
    expect(coordinator.isRunning(repoPath)).toBe(false);
  });

  it("serializes linked worktrees after both resolve to one Git common directory", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const commonDir = path.resolve("Shared", ".git");
    let finishFirst!: () => void;
    const firstMutation = vi.fn(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    const secondMutation = vi.fn(async () => "second");
    const first = coordinator.run({
      ...operationOptions("linked-first", path.resolve("Worktree-A")),
      resolveScopePath: async () => commonDir
    }, firstMutation);
    const second = coordinator.run({
      ...operationOptions("linked-second", path.resolve("Worktree-B")),
      resolveScopePath: async () => commonDir
    }, secondMutation);

    await expect(second).resolves.toEqual({ started: false });
    expect(secondMutation).not.toHaveBeenCalled();
    expect(firstMutation).toHaveBeenCalledOnce();
    finishFirst();
    await expect(first).resolves.toEqual({ started: true, value: undefined });
  });

  it("cancels during linked-worktree scope resolution without starting the mutation", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let resolveScope!: (scope: string) => void;
    const mutation = vi.fn(async () => "mutated");
    const operation = coordinator.run({
      ...operationOptions("scope-cancel", path.resolve("Worktree")),
      resolveScopePath: () => new Promise<string>((resolve) => { resolveScope = resolve; })
    }, mutation);
    await Promise.resolve();

    expect(coordinator.cancel("scope-cancel", "owner-1")).toEqual({ accepted: true, state: "cancelling" });
    resolveScope(path.resolve("Shared", ".git"));

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("aborts an operation explicitly and releases its repository", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    const operation = coordinator.run(operationOptions("cancel-me", "D:\\Repo"), (signal) => new Promise<string>((resolve) => {
      signal.addEventListener("abort", () => resolve((signal.reason as Error).name), { once: true });
    }));

    expect(coordinator.getStates(["cancel-me", "missing", "cancel-me"], "owner-1")).toEqual([
      { operationId: "cancel-me", state: "running" },
      { operationId: "missing", state: "not-found" }
    ]);
    expect(coordinator.getStates(["cancel-me"], "other-owner")).toEqual([
      { operationId: "cancel-me", state: "not-owner" }
    ]);
    expect(coordinator.cancel("cancel-me", "owner-1")).toEqual({ accepted: true, state: "cancelling" });
    expect(coordinator.getStates(["cancel-me"], "owner-1")).toEqual([
      { operationId: "cancel-me", state: "cancelling" }
    ]);
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
    expect(coordinator.getStates(["cancel-me"], "owner-1")).toEqual([
      { operationId: "cancel-me", state: "not-found" }
    ]);
    expect(coordinator.cancel("cancel-me", "owner-1")).toEqual({ accepted: false, state: "not-found" });
  });

  it("can return a structured result after cancellation while keeping the repository serialized", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let finishCancellation!: () => void;
    const operation = coordinator.run({
      ...operationOptions("partial-push", "D:\\Repo"),
      returnResultAfterAbort: true
    }, (signal) => new Promise<{ partialSuccess: true }>((resolve) => {
      signal.addEventListener("abort", () => {
        finishCancellation = () => resolve({ partialSuccess: true });
      }, { once: true });
    }));

    expect(coordinator.cancel("partial-push", "owner-1")).toEqual({ accepted: true, state: "cancelling" });
    expect(coordinator.isRunning("D:\\Repo")).toBe(true);
    await expect(coordinator.run(operationOptions("overlap-after-cancel", "D:\\Repo"), async () => "overlap"))
      .resolves.toEqual({ started: false });

    finishCancellation();
    await expect(operation).resolves.toEqual({ started: true, value: { partialSuccess: true } });
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
  });

  it("only lets the renderer that owns an operation cancel it", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let signal!: AbortSignal;
    const operation = coordinator.run(operationOptions("owned", "D:\\Repo", 10_000, "owner-41"), (operationSignal) => {
      signal = operationSignal;
      return new Promise<void>((resolve) => {
        operationSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    expect(coordinator.cancel("owned", "owner-42")).toEqual({ accepted: false, state: "not-owner" });
    expect(signal.aborted).toBe(false);
    expect(coordinator.cancel("owned", "owner-41")).toEqual({ accepted: true, state: "cancelling" });
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects after the abort grace when a timed-out operation ignores abort", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator(25);
    let signal!: AbortSignal;
    const operation = coordinator.run(operationOptions("timeout", "D:\\Repo", 50), (operationSignal) => {
      signal = operationSignal;
      return new Promise<never>(() => undefined);
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: "TimeoutError" });

    await vi.advanceTimersByTimeAsync(75);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(coordinator.isRunning("D:\\Repo")).toBe(true);
    expect(coordinator.cancel("timeout", "owner-1")).toEqual({ accepted: true, state: "already-cancelling" });
    vi.useRealTimers();
  });

  it("rejects cancellation after the grace while keeping an ignored operation quarantined", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator(25);
    const operation = coordinator.run(operationOptions("ignored-cancel", "D:\\Repo"), () => new Promise<never>(() => undefined));
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });

    expect(coordinator.cancel("ignored-cancel", "owner-1")).toEqual({ accepted: true, state: "cancelling" });
    expect(coordinator.cancel("ignored-cancel", "owner-1")).toEqual({ accepted: true, state: "already-cancelling" });
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(coordinator.isRunning("D:\\Repo")).toBe(true);
    vi.useRealTimers();
  });

  it("rejects overlapping work while an aborted callback remains quarantined", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator(25);
    const first = coordinator.run(operationOptions("quarantined", "D:\\Repo"), () => new Promise<never>(() => undefined));
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const overlapping = vi.fn(async () => "overlap");

    coordinator.cancel("quarantined", "owner-1");
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    await expect(coordinator.run(operationOptions("overlap", "D:\\Repo"), overlapping)).resolves.toEqual({ started: false });
    expect(overlapping).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("observes a late rejection and releases quarantine when the callback settles", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator(25);
    let rejectUnderlying!: (reason: unknown) => void;
    const operation = coordinator.run(operationOptions("late", "D:\\Repo"), () => new Promise<never>((_resolve, reject) => {
      rejectUnderlying = reject;
    }));
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });

    coordinator.cancel("late", "owner-1");
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(coordinator.isRunning("D:\\Repo")).toBe(true);
    await expect(coordinator.run(operationOptions("late", "D:\\Other"), async () => "duplicate")).rejects.toBeInstanceOf(DuplicateRepositoryOperationIdError);

    rejectUnderlying(new Error("late failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
    await expect(coordinator.run(operationOptions("late", "D:\\Repo"), async () => "next")).resolves.toEqual({ started: true, value: "next" });
    vi.useRealTimers();
  });

  it("cancels every operation owned by a lost renderer and releases each scope only after late settlement", async () => {
    vi.useFakeTimers();
    const coordinator = new RepositoryOperationCoordinator(25);
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    let finishOtherOwner!: () => void;
    let firstSignal!: AbortSignal;
    let secondSignal!: AbortSignal;
    let otherOwnerSignal!: AbortSignal;
    const first = coordinator.run(operationOptions("owner-first", "D:\\First", 10_000, "owner-7"), (signal) => {
      firstSignal = signal;
      return new Promise<void>((resolve) => { finishFirst = resolve; });
    });
    const second = coordinator.run(operationOptions("owner-second", "D:\\Second", 10_000, "owner-7"), (signal) => {
      secondSignal = signal;
      return new Promise<void>((resolve) => { finishSecond = resolve; });
    });
    const otherOwner = coordinator.run(operationOptions("other-owner", "D:\\Other", 10_000, "owner-8"), (signal) => {
      otherOwnerSignal = signal;
      return new Promise<void>((resolve) => { finishOtherOwner = resolve; });
    });
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const secondRejected = expect(second).rejects.toMatchObject({ name: "AbortError" });

    coordinator.cancelAll("owner-7");
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(true);
    expect(otherOwnerSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(25);
    await Promise.all([firstRejected, secondRejected]);
    expect(coordinator.isRunning("D:\\First")).toBe(true);
    expect(coordinator.isRunning("D:\\Second")).toBe(true);
    expect(coordinator.isRunning("D:\\Other")).toBe(true);

    finishFirst();
    finishSecond();
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.isRunning("D:\\First")).toBe(false);
    expect(coordinator.isRunning("D:\\Second")).toBe(false);
    expect(coordinator.isRunning("D:\\Other")).toBe(true);
    await expect(coordinator.run(operationOptions("after-owner", "D:\\First", 10_000, "owner-9"), async () => "next"))
      .resolves.toEqual({ started: true, value: "next" });

    finishOtherOwner();
    await expect(otherOwner).resolves.toEqual({ started: true, value: undefined });
    vi.useRealTimers();
  });

  it("rejects a duplicate active operation ID without invoking its callback", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let finishFirst!: () => void;
    const first = coordinator.run(operationOptions("duplicate", "D:\\Repo"), () => new Promise<void>((resolve) => {
      finishFirst = resolve;
    }));
    const duplicate = vi.fn(async () => "duplicate");

    await expect(coordinator.run(operationOptions("duplicate", "D:\\Other"), duplicate)).rejects.toBeInstanceOf(DuplicateRepositoryOperationIdError);
    expect(duplicate).not.toHaveBeenCalled();

    finishFirst();
    await expect(first).resolves.toEqual({ started: true, value: undefined });
  });
});

function operationOptions(operationId: string, repoPath: string, timeoutMs = 10_000, ownerId = "owner-1") {
  return { operationId, ownerId, repoPath, timeoutMs };
}
