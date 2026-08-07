import { getRepoPathKey } from "./repositorySnapshotCache";

export interface RepositoryRefreshRequest<Reason extends string = string> {
  readonly reason: Reason;
}

export interface RepositoryRefreshCoordinatorOptions<
  Request extends RepositoryRefreshRequest
> {
  readonly getReasonPriority: (reason: Request["reason"]) => number;
  readonly run: (
    repoPath: string,
    request: Request,
    signal: AbortSignal
  ) => Promise<void>;
  readonly onError?: (
    error: unknown,
    repoPath: string,
    request: Request
  ) => void;
  readonly onEnqueue?: (
    request: Request,
    measurement: RepositoryRefreshEnqueueMeasurement
  ) => void;
}

export interface RepositoryRefreshEnqueueMeasurement {
  readonly coalescedCount: 0 | 1;
  readonly queueDepth: 0 | 1;
}

interface PendingRefresh<Request> {
  readonly repoPath: string;
  readonly request: Request;
}

interface ActiveRefresh<Request> extends PendingRefresh<Request> {
  readonly controller: AbortController;
}

interface RepositoryRefreshState<Request> {
  active: ActiveRefresh<Request> | null;
  pending: PendingRefresh<Request> | null;
  disposing: boolean;
  readonly idleWaiters: Set<() => void>;
}

/**
 * Runs one refresh at a time for each repository.
 *
 * Requests that arrive during an active refresh become one trailing refresh.
 * The request with the highest reason priority replaces weaker trailing work.
 * A later request replaces an earlier request when their priorities are equal.
 */
export class RepositoryRefreshCoordinator<
  Request extends RepositoryRefreshRequest
> {
  private readonly states = new Map<string, RepositoryRefreshState<Request>>();
  private readonly allIdleWaiters = new Set<() => void>();

  constructor(
    private readonly options: RepositoryRefreshCoordinatorOptions<Request>
  ) {}

  enqueue(repoPath: string, request: Request): Promise<void> {
    const key = repositoryRefreshKey(repoPath);
    let state = this.states.get(key);
    if (state?.disposing) {
      throw new RepositoryRefreshDisposedError(repoPath);
    }

    if (!state) {
      state = {
        active: null,
        pending: null,
        disposing: false,
        idleWaiters: new Set()
      };
      this.states.set(key, state);
    }

    if (state.active) {
      const coalescedCount = state.pending ? 1 : 0;
      const next = { repoPath, request };
      state.pending = state.pending
        ? this.strongestRequest(state.pending, next)
        : next;
      this.reportEnqueue(request, { coalescedCount, queueDepth: 1 });
    } else {
      this.start(key, state, { repoPath, request });
      this.reportEnqueue(request, { coalescedCount: 0, queueDepth: 0 });
    }

    return this.waitForState(state);
  }

  cancel(repoPath: string): boolean {
    const state = this.states.get(repositoryRefreshKey(repoPath));
    if (!state) {
      return false;
    }

    state.pending = null;
    state.active?.controller.abort(
      new DOMException("Repository refresh was cancelled.", "AbortError")
    );
    return true;
  }

  disposeRepository(repoPath: string): Promise<void> {
    const state = this.states.get(repositoryRefreshKey(repoPath));
    if (!state) {
      return Promise.resolve();
    }

    state.disposing = true;
    state.pending = null;
    state.active?.controller.abort(
      new DOMException("Repository refresh coordinator was disposed.", "AbortError")
    );
    return this.waitForState(state);
  }

  whenIdle(repoPath?: string): Promise<void> {
    if (repoPath !== undefined) {
      const state = this.states.get(repositoryRefreshKey(repoPath));
      return state ? this.waitForState(state) : Promise.resolve();
    }

    if (this.states.size === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.allIdleWaiters.add(resolve);
    });
  }

  isActive(repoPath: string): boolean {
    return this.states.has(repositoryRefreshKey(repoPath));
  }

  private strongestRequest(
    current: PendingRefresh<Request>,
    next: PendingRefresh<Request>
  ): PendingRefresh<Request> {
    const currentPriority = this.options.getReasonPriority(current.request.reason);
    const nextPriority = this.options.getReasonPriority(next.request.reason);
    return nextPriority >= currentPriority ? next : current;
  }

  private reportEnqueue(
    request: Request,
    measurement: RepositoryRefreshEnqueueMeasurement
  ): void {
    try {
      this.options.onEnqueue?.(request, measurement);
    } catch {
      // Diagnostics must not stop a repository refresh.
    }
  }

  private start(
    key: string,
    state: RepositoryRefreshState<Request>,
    refresh: PendingRefresh<Request>
  ): void {
    const controller = new AbortController();
    const active = { ...refresh, controller };
    state.active = active;

    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) {
          return;
        }
        return this.options.run(
          active.repoPath,
          active.request,
          controller.signal
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          try {
            this.options.onError?.(error, active.repoPath, active.request);
          } catch {
            // Error reporting must not stop the coordinator.
          }
        }
      })
      .finally(() => {
        this.finish(key, state, active);
      });
  }

  private finish(
    key: string,
    state: RepositoryRefreshState<Request>,
    active: ActiveRefresh<Request>
  ): void {
    if (state.active !== active) {
      return;
    }

    state.active = null;
    if (!state.disposing && state.pending) {
      const pending = state.pending;
      state.pending = null;
      this.start(key, state, pending);
      return;
    }

    if (this.states.get(key) === state) {
      this.states.delete(key);
    }
    for (const resolve of state.idleWaiters) {
      resolve();
    }
    state.idleWaiters.clear();
    this.resolveAllIdleWaiters();
  }

  private waitForState(state: RepositoryRefreshState<Request>): Promise<void> {
    if (!state.active && !state.pending) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      state.idleWaiters.add(resolve);
    });
  }

  private resolveAllIdleWaiters(): void {
    if (this.states.size !== 0) {
      return;
    }

    for (const resolve of this.allIdleWaiters) {
      resolve();
    }
    this.allIdleWaiters.clear();
  }
}

export class RepositoryRefreshDisposedError extends Error {
  constructor(readonly repoPath: string) {
    super(`Repository refresh coordinator is being disposed: ${repoPath}`);
    this.name = "RepositoryRefreshDisposedError";
  }
}

function repositoryRefreshKey(repoPath: string): string {
  const key = getRepoPathKey(repoPath);
  if (!key) {
    throw new TypeError("Repository path is required.");
  }
  return key;
}
