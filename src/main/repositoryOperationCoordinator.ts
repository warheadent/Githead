import path from "node:path";

export type CoordinatedOperationResult<T> =
  | { started: false }
  | { started: true; value: T };

interface ActiveOperation {
  controller: AbortController;
  timeout: NodeJS.Timeout;
}

export class RepositoryOperationCoordinator {
  private readonly active = new Map<string, ActiveOperation>();

  async run<T>(
    repoPath: string,
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<CoordinatedOperationResult<T>> {
    const key = repositoryOperationKey(repoPath);
    if (this.active.has(key)) {
      return { started: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new DOMException(
        `Operation timed out after ${timeoutMs}ms.`,
        "TimeoutError"
      ));
    }, timeoutMs);
    timeout.unref();
    const active = { controller, timeout };
    this.active.set(key, active);

    try {
      return {
        started: true,
        value: await operation(controller.signal)
      };
    } finally {
      clearTimeout(timeout);
      if (this.active.get(key) === active) {
        this.active.delete(key);
      }
    }
  }

  cancel(repoPath: string): boolean {
    const operation = this.active.get(repositoryOperationKey(repoPath));
    if (!operation) {
      return false;
    }

    operation.controller.abort(new DOMException("Operation was cancelled.", "AbortError"));
    return true;
  }

  isRunning(repoPath: string): boolean {
    return this.active.has(repositoryOperationKey(repoPath));
  }
}

function repositoryOperationKey(repoPath: string): string {
  const normalized = path.resolve(repoPath.trim() || ".");
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}
