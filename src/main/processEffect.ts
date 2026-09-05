import type { Effect } from "effect";
import type {
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
