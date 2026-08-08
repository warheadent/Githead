import path from "node:path";
import type { GitOperationStateResult } from "../shared/types";

export type CoordinatedOperationResult<T> =
  | { started: false }
  | { started: true; value: T };

export interface RepositoryOperationOptions {
  operationId: string;
  ownerId: string;
  repoPath: string;
  timeoutMs: number;
  resolveScopePath?: (signal: AbortSignal) => Promise<string>;
}

export function repositoryOperationOwnerId(
  webContentsId: number,
  processId: number,
  frameId: number
): string {
  return `${webContentsId}:${processId}:${frameId}`;
}

export type RepositoryOperationCancelResult =
  | { accepted: true; state: "cancelling" | "already-cancelling" }
  | { accepted: false; state: "not-found" | "not-owner" };

interface ActiveOperation {
  operationId: string;
  ownerId: string;
  scopeKey: string;
  controller: AbortController;
  timeout?: NodeJS.Timeout;
  state: "running" | "cancelling";
}

type OperationSettlement<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

const DEFAULT_ABORT_GRACE_MS = 1_000;
const OPERATION_SCOPE_BUSY = Symbol("operation-scope-busy");

export class RepositoryOperationCoordinator {
  private readonly activeByScope = new Map<string, ActiveOperation>();
  private readonly activeById = new Map<string, ActiveOperation>();
  private readonly activeByOwner = new Map<string, Set<ActiveOperation>>();

  constructor(private readonly abortGraceMs = DEFAULT_ABORT_GRACE_MS) {}

  async run<T>(
    options: RepositoryOperationOptions,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<CoordinatedOperationResult<T>> {
    validateOperationId(options.operationId);
    if (this.activeById.has(options.operationId)) {
      throw new DuplicateRepositoryOperationIdError(options.operationId);
    }

    const scopeKey = repositoryOperationKey(options.repoPath);
    if (this.activeByScope.has(scopeKey)) {
      return { started: false };
    }

    const controller = new AbortController();
    const active: ActiveOperation = {
      operationId: options.operationId,
      ownerId: options.ownerId,
      scopeKey,
      controller,
      state: "running"
    };
    const timeout = setTimeout(() => {
      this.requestAbort(active, new DOMException(
        `Operation timed out after ${options.timeoutMs}ms.`,
        "TimeoutError"
      ));
    }, options.timeoutMs);
    timeout.unref();
    active.timeout = timeout;
    this.activeByScope.set(scopeKey, active);
    this.activeById.set(options.operationId, active);
    let ownerOperations = this.activeByOwner.get(options.ownerId);
    if (!ownerOperations) {
      ownerOperations = new Set();
      this.activeByOwner.set(options.ownerId, ownerOperations);
    }
    ownerOperations.add(active);

    let resolveAbort!: (reason: unknown) => void;
    const abortRequested = new Promise<unknown>((resolve) => {
      resolveAbort = resolve;
    });
    const onAbort = () => {
      clearTimeout(timeout);
      resolveAbort(getAbortReason(controller.signal));
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });

    const resolveScopePath = options.resolveScopePath;
    let operationPromise: Promise<T | typeof OPERATION_SCOPE_BUSY>;
    try {
      operationPromise = resolveScopePath
        ? Promise.resolve().then(async () => {
          controller.signal.throwIfAborted();
          const resolvedScopeKey = repositoryOperationKey(await resolveScopePath(controller.signal));
          controller.signal.throwIfAborted();
          if (resolvedScopeKey !== active.scopeKey) {
            const occupyingOperation = this.activeByScope.get(resolvedScopeKey);
            if (occupyingOperation && occupyingOperation !== active) {
              return OPERATION_SCOPE_BUSY;
            }
            if (this.activeByScope.get(active.scopeKey) === active) {
              this.activeByScope.delete(active.scopeKey);
            }
            active.scopeKey = resolvedScopeKey;
            this.activeByScope.set(resolvedScopeKey, active);
          }
          return operation(controller.signal);
        })
        : Promise.resolve(operation(controller.signal));
    } catch (error) {
      operationPromise = Promise.reject(error);
    }

    // Convert rejection into data immediately. If cancellation wins the public
    // race, the callback remains observed until it eventually settles and can
    // safely release the quarantined repository key.
    const settlement: Promise<OperationSettlement<T | typeof OPERATION_SCOPE_BUSY>> = operationPromise.then(
      (value): OperationSettlement<T | typeof OPERATION_SCOPE_BUSY> => ({ status: "fulfilled", value }),
      (reason: unknown): OperationSettlement<T | typeof OPERATION_SCOPE_BUSY> => ({ status: "rejected", reason })
    );
    void settlement.then(() => {
      this.release(active);
    });

    const outcome = await Promise.race([
      settlement.then((value) => ({ kind: "settled" as const, value })),
      abortRequested.then((reason) => ({ kind: "aborted" as const, reason }))
    ]);

    if (outcome.kind === "settled") {
      controller.signal.removeEventListener("abort", onAbort);
      if (controller.signal.aborted) {
        throw getAbortReason(controller.signal);
      }
      if (outcome.value.status === "rejected") {
        throw outcome.value.reason;
      }
      return outcome.value.value === OPERATION_SCOPE_BUSY
        ? { started: false }
        : { started: true, value: outcome.value.value };
    }

    await waitForSettlementOrGrace(settlement, this.abortGraceMs);
    controller.signal.removeEventListener("abort", onAbort);
    throw outcome.reason;
  }

  cancel(operationId: string, ownerId: string): RepositoryOperationCancelResult {
    const operation = this.activeById.get(operationId);
    if (!operation) {
      return { accepted: false, state: "not-found" };
    }
    if (operation.ownerId !== ownerId) {
      return { accepted: false, state: "not-owner" };
    }

    if (operation.state === "cancelling") {
      return { accepted: true, state: "already-cancelling" };
    }

    this.requestAbort(operation, new DOMException("Operation was cancelled.", "AbortError"));
    return { accepted: true, state: "cancelling" };
  }

  getStates(operationIds: string[], ownerId: string): GitOperationStateResult[] {
    return [...new Set(operationIds)].map((operationId) => {
      const operation = this.activeById.get(operationId);
      if (!operation) {
        return { operationId, state: "not-found" };
      }
      if (operation.ownerId !== ownerId) {
        return { operationId, state: "not-owner" };
      }
      return { operationId, state: operation.state };
    });
  }

  cancelAll(ownerId: string): void {
    for (const operation of this.activeByOwner.get(ownerId) ?? []) {
      this.requestAbort(operation, new DOMException("Operation owner was released.", "AbortError"));
    }
  }

  isRunning(repoPath: string): boolean {
    return this.activeByScope.has(repositoryOperationKey(repoPath));
  }

  private requestAbort(active: ActiveOperation, reason: DOMException): void {
    if (active.state === "cancelling") {
      return;
    }
    active.state = "cancelling";
    active.controller.abort(reason);
  }

  private release(active: ActiveOperation): void {
    if (active.timeout) {
      clearTimeout(active.timeout);
    }
    if (this.activeByScope.get(active.scopeKey) === active) {
      this.activeByScope.delete(active.scopeKey);
    }
    if (this.activeById.get(active.operationId) === active) {
      this.activeById.delete(active.operationId);
    }
    const ownerOperations = this.activeByOwner.get(active.ownerId);
    ownerOperations?.delete(active);
    if (ownerOperations?.size === 0) {
      this.activeByOwner.delete(active.ownerId);
    }
  }
}

export class DuplicateRepositoryOperationIdError extends Error {
  constructor(readonly operationId: string) {
    super(`Repository operation ID is already active: ${operationId}`);
    this.name = "DuplicateRepositoryOperationIdError";
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Operation was cancelled.", "AbortError");
}

function waitForSettlementOrGrace(settlement: Promise<unknown>, graceMs: number): Promise<void> {
  if (graceMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, graceMs);
    timer.unref();
    void settlement.then(finish);
  });
}

function validateOperationId(operationId: string): void {
  if (!operationId.trim()) {
    throw new TypeError("Repository operation ID is required.");
  }
}

function repositoryOperationKey(repoPath: string): string {
  const normalized = path.resolve(repoPath.trim() || ".");
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}
