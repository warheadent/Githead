import { describe, expect, it, vi } from "vite-plus/test";
import {
  runCoordinatedRepositoryOperationAfterPreflight,
  type OperationSignalContext
} from "./coordinatedRepositoryOperation";
import { RepositoryOperationCoordinator } from "./repositoryOperationCoordinator";

describe("runCoordinatedRepositoryOperationAfterPreflight", () => {
  it("registers before a deferred preflight and never starts the mutation after cancellation", async () => {
    const coordinator = new RepositoryOperationCoordinator();
    let finishPreflight!: (failure: string | null) => void;
    const preflight = vi.fn(() => new Promise<string | null>((resolve) => {
      finishPreflight = resolve;
    }));
    const mutation = vi.fn(async () => "mutated");
    const signalContext: OperationSignalContext = {
      runWithSignal: <T>(_signal: AbortSignal, operation: () => Promise<T>) => operation()
    };

    const pending = runCoordinatedRepositoryOperationAfterPreflight(
      coordinator,
      signalContext,
      {
        operationId: "deferred-trust",
        ownerId: "renderer-1",
        repoPath: "D:\\Repo",
        timeoutMs: 10_000
      },
      preflight,
      mutation,
      (failure) => `blocked: ${failure}`,
      () => "busy"
    );

    expect(preflight).toHaveBeenCalledOnce();
    expect(coordinator.cancel("deferred-trust", "renderer-1")).toEqual({
      accepted: true,
      state: "cancelling"
    });

    finishPreflight(null);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mutation).not.toHaveBeenCalled();
    expect(coordinator.isRunning("D:\\Repo")).toBe(false);
  });
});
