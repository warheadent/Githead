import type {
  RepositoryOperationCoordinator,
  RepositoryOperationOptions
} from "./repositoryOperationCoordinator";

export interface OperationSignalContext {
  runWithSignal<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T>;
}

export function runCoordinatedRepositoryOperation<T>(
  coordinator: RepositoryOperationCoordinator,
  signalContext: OperationSignalContext,
  options: RepositoryOperationOptions,
  operation: (signal: AbortSignal) => Promise<T>,
  busyResult: () => T
): Promise<T> {
  // RepositoryOperationCoordinator.run registers the operation before invoking
  // the callback. Keep this call synchronous so cancellation can find the
  // operation even when the callback immediately enters an async preflight.
  return coordinator.run(
    options,
    (signal) => signalContext.runWithSignal(signal, () => operation(signal))
  ).then((result) => result.started ? result.value : busyResult());
}

export function runCoordinatedRepositoryOperationAfterPreflight<T, PreflightFailure>(
  coordinator: RepositoryOperationCoordinator,
  signalContext: OperationSignalContext,
  options: RepositoryOperationOptions,
  preflight: (signal: AbortSignal) => Promise<PreflightFailure | null>,
  operation: (signal: AbortSignal) => Promise<T>,
  preflightFailure: (failure: PreflightFailure) => T | Promise<T>,
  busyResult: () => T
): Promise<T> {
  return runCoordinatedRepositoryOperation(
    coordinator,
    signalContext,
    options,
    async (signal) => {
      signal.throwIfAborted();
      const failure = await preflight(signal);
      // The preflight may not itself be abortable (for example, a filesystem
      // trust lookup). This check is the no-side-effect boundary: once a cancel
      // arrives, the underlying mutation must never start.
      signal.throwIfAborted();
      return failure === null
        ? operation(signal)
        : preflightFailure(failure);
    },
    busyResult
  );
}
