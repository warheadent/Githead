import { describe, expect, it, vi } from "vite-plus/test";
import {
  RepositoryRefreshCoordinator,
  RepositoryRefreshDisposedError,
  type RepositoryRefreshRequest
} from "./repositoryRefreshCoordinator";

type RefreshReason = "filesystem" | "focus" | "repository" | "user";

interface TestRefresh extends RepositoryRefreshRequest<RefreshReason> {
  readonly marker: string;
}

const priorities: Record<RefreshReason, number> = {
  filesystem: 0,
  focus: 1,
  repository: 2,
  user: 3
};

describe("RepositoryRefreshCoordinator", () => {
  it("keeps one active refresh and the strongest trailing refresh", async () => {
    const runs: string[] = [];
    const measurements: Array<{ marker: string; coalescedCount: number; queueDepth: number }> = [];
    const first = deferred<void>();
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async (_repoPath, request) => {
        runs.push(request.marker);
        if (request.marker === "active") {
          await first.promise;
        }
      },
      onEnqueue: (request, measurement) => measurements.push({ marker: request.marker, ...measurement })
    });

    void coordinator.enqueue("D:\\Repo", { reason: "focus", marker: "active" });
    await nextMicrotask();
    void coordinator.enqueue("d:\\repo\\", { reason: "filesystem", marker: "weak" });
    const idle = coordinator.enqueue("D:\\Repo", { reason: "user", marker: "strong" });
    void coordinator.enqueue("D:\\Repo", { reason: "repository", marker: "later-weak" });

    expect(runs).toEqual(["active"]);
    first.resolve();
    await idle;
    expect(runs).toEqual(["active", "strong"]);
    expect(measurements).toEqual([
      { marker: "active", coalescedCount: 0, queueDepth: 0 },
      { marker: "weak", coalescedCount: 0, queueDepth: 1 },
      { marker: "strong", coalescedCount: 1, queueDepth: 1 },
      { marker: "later-weak", coalescedCount: 1, queueDepth: 1 }
    ]);
    expect(coordinator.isActive("D:\\Repo")).toBe(false);
  });

  it("uses the latest request when trailing reasons have equal priority", async () => {
    const runs: string[] = [];
    const first = deferred<void>();
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async (_repoPath, request) => {
        runs.push(request.marker);
        if (request.marker === "active") {
          await first.promise;
        }
      }
    });

    void coordinator.enqueue("D:\\Repo", { reason: "focus", marker: "active" });
    await nextMicrotask();
    void coordinator.enqueue("D:\\Repo", { reason: "repository", marker: "old" });
    const idle = coordinator.enqueue("D:\\Repo", { reason: "repository", marker: "new" });

    first.resolve();
    await idle;
    expect(runs).toEqual(["active", "new"]);
  });

  it("runs different repositories in parallel", async () => {
    const started: string[] = [];
    const finishFirst = deferred<void>();
    const finishSecond = deferred<void>();
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async (repoPath) => {
        started.push(repoPath);
        await (repoPath === "D:\\First" ? finishFirst.promise : finishSecond.promise);
      }
    });

    void coordinator.enqueue("D:\\First", { reason: "user", marker: "first" });
    void coordinator.enqueue("D:\\Second", { reason: "user", marker: "second" });
    await nextMicrotask();

    expect(started).toEqual(["D:\\First", "D:\\Second"]);
    finishFirst.resolve();
    finishSecond.resolve();
    await coordinator.whenIdle();
  });

  it("cancels active work and removes its trailing refresh", async () => {
    const runs: string[] = [];
    let receivedSignal: AbortSignal | undefined;
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: (repoPath, request, signal) => new Promise<void>((resolve) => {
        runs.push(`${repoPath}:${request.marker}`);
        receivedSignal = signal;
        signal.addEventListener("abort", () => resolve(), { once: true });
      })
    });

    void coordinator.enqueue("D:\\Repo", { reason: "filesystem", marker: "active" });
    await nextMicrotask();
    void coordinator.enqueue("D:\\Repo", { reason: "user", marker: "pending" });

    expect(coordinator.cancel("D:\\Repo")).toBe(true);
    await coordinator.whenIdle("D:\\Repo");
    expect(receivedSignal?.aborted).toBe(true);
    expect(runs).toEqual(["D:\\Repo:active"]);
    expect(coordinator.cancel("D:\\Repo")).toBe(false);
  });

  it("does not start work that is cancelled before its first microtask", async () => {
    const run = vi.fn(async () => undefined);
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run
    });

    void coordinator.enqueue("D:\\Repo", { reason: "user", marker: "cancelled" });
    coordinator.cancel("D:\\Repo");
    await coordinator.whenIdle("D:\\Repo");

    expect(run).not.toHaveBeenCalled();
  });

  it("disposes repository work and allows reuse after settlement", async () => {
    const signals: AbortSignal[] = [];
    const runs = vi.fn((_repoPath: string, _request: TestRefresh, signal: AbortSignal) => new Promise<void>((resolve) => {
      signals.push(signal);
      signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: runs
    });

    void coordinator.enqueue("D:\\Repo", { reason: "filesystem", marker: "active" });
    await nextMicrotask();
    const disposed = coordinator.disposeRepository("D:\\Repo");
    expect(() => coordinator.enqueue("D:\\Repo", { reason: "user", marker: "blocked" }))
      .toThrow(RepositoryRefreshDisposedError);
    await disposed;
    expect(signals[0]?.aborted).toBe(true);

    void coordinator.enqueue("D:\\Repo", { reason: "user", marker: "reused" });
    await nextMicrotask();
    expect(runs).toHaveBeenCalledTimes(2);
    coordinator.cancel("D:\\Repo");
    await coordinator.whenIdle("D:\\Repo");
  });

  it("waits for trailing work and for every active repository", async () => {
    const first = deferred<void>();
    const trailing = deferred<void>();
    const other = deferred<void>();
    const keyIdle = deferred<void>();
    const allIdle = deferred<void>();
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async (repoPath, request) => {
        if (repoPath === "D:\\Other") {
          await other.promise;
        } else if (request.marker === "first") {
          await first.promise;
        } else {
          await trailing.promise;
        }
      }
    });

    void coordinator.enqueue("D:\\Repo", { reason: "filesystem", marker: "first" });
    void coordinator.enqueue("D:\\Other", { reason: "filesystem", marker: "other" });
    await nextMicrotask();
    void coordinator.enqueue("D:\\Repo", { reason: "user", marker: "trailing" });
    void coordinator.whenIdle("D:\\Repo").then(keyIdle.resolve);
    void coordinator.whenIdle().then(allIdle.resolve);

    first.resolve();
    await nextMicrotask();
    expect(keyIdle.settled).toBe(false);
    trailing.resolve();
    await keyIdle.promise;
    expect(allIdle.settled).toBe(false);
    other.resolve();
    await allIdle.promise;
  });

  it("reports a failed refresh and continues with trailing work", async () => {
    const errors: unknown[] = [];
    const runs: string[] = [];
    const firstStarted = deferred<void>();
    const failFirst = deferred<void>();
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async (_repoPath, request) => {
        runs.push(request.marker);
        if (request.marker === "first") {
          firstStarted.resolve();
          await failFirst.promise;
          throw new Error("refresh failed");
        }
      },
      onError: (error) => errors.push(error)
    });

    void coordinator.enqueue("D:\\Repo", { reason: "filesystem", marker: "first" });
    await firstStarted.promise;
    const idle = coordinator.enqueue("D:\\Repo", { reason: "user", marker: "second" });
    failFirst.resolve();
    await idle;

    expect(runs).toEqual(["first", "second"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ message: "refresh failed" });
  });

  it("rejects an empty repository path", () => {
    const coordinator = new RepositoryRefreshCoordinator<TestRefresh>({
      getReasonPriority: (reason) => priorities[reason],
      run: async () => undefined
    });

    expect(() => coordinator.enqueue("  ", { reason: "user", marker: "invalid" }))
      .toThrow("Repository path is required.");
  });
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly settled: boolean;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    get settled() {
      return settled;
    },
    resolve: (value) => {
      settled = true;
      resolvePromise(value);
    }
  };
}

function nextMicrotask(): Promise<void> {
  return Promise.resolve();
}
