import { AsyncLocalStorage } from "node:async_hooks";
import type { BinaryProcessResult, ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

export class CancellableProcessRunner implements ProcessRunner {
  private readonly signals = new AsyncLocalStorage<AbortSignal>();

  constructor(private readonly delegate: ProcessRunner) {}

  runWithSignal<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return this.signals.run(signal, operation);
  }

  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return this.delegate.run(command, args, this.withContextSignal(options));
  }

  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> {
    if (!this.delegate.runBinary) {
      return Promise.reject(new Error("Binary process output is unavailable."));
    }
    return this.delegate.runBinary(command, args, this.withContextSignal(options));
  }

  private withContextSignal<T extends ProcessRunOptions>(options: T): T {
    const signal = combineAbortSignals(options.signal, this.signals.getStore());
    return signal ? { ...options, signal } : options;
  }
}

function combineAbortSignals(
  explicit: AbortSignal | undefined,
  contextual: AbortSignal | undefined
): AbortSignal | undefined {
  if (!explicit) return contextual;
  if (!contextual || explicit === contextual) return explicit;
  return AbortSignal.any([explicit, contextual]);
}
