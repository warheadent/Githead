import { Effect } from "effect";
import type {
  BinaryProcessResult,
  ProcessResult,
  ProcessRunOptions,
  ProcessRunner
} from "./processRunner";
import { tryPromise } from "../shared/effectRuntime";

export function runProcessEffect(
  runner: ProcessRunner,
  command: string,
  args: string[],
  options: ProcessRunOptions = {}
): Effect.Effect<ProcessResult, unknown> {
  return tryPromise((signal) => runner.run(command, args, {
    ...options,
    signal
  }));
}

export function runBinaryProcessEffect(
  runner: ProcessRunner,
  command: string,
  args: string[],
  options: ProcessRunOptions & { maxBytes: number }
): Effect.Effect<BinaryProcessResult, unknown> {
  if (!runner.runBinary) {
    return Effect.fail(new Error("Binary process output is unavailable."));
  }
  return tryPromise((signal) => runner.runBinary!(command, args, {
    ...options,
    signal
  }));
}
