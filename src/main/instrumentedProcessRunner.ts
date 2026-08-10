import type {
  PerformanceCommandKind,
  PerformanceCommandOutcome
} from "../shared/types";
import type { PerformanceDiagnostics } from "./performanceDiagnostics";
import type {
  BinaryProcessResult,
  ProcessResult,
  ProcessRunOptions,
  ProcessRunner
} from "./processRunner";
import {
  recordOperationOutcome,
  reportOperationalFailure,
  reportUnexpectedError,
  type OperationalFailureCategory
} from "./operationalErrorReporter";
import { classifyGitOperationError } from "./gitOperationFailure";

export interface InstrumentedProcessRunnerOptions {
  now?: () => number;
}

/** Records fixed labels and numbers only. Command text, arguments, and paths are never retained. */
export class InstrumentedProcessRunner implements ProcessRunner {
  private readonly now: () => number;
  private activeDepth = 0;

  constructor(
    private readonly delegate: ProcessRunner,
    private readonly diagnostics: PerformanceDiagnostics,
    options: InstrumentedProcessRunnerOptions = {}
  ) {
    this.now = options.now ?? performance.now.bind(performance);
  }

  async run(
    command: string,
    args: string[],
    options: ProcessRunOptions = {}
  ): Promise<ProcessResult> {
    const commandKind = classifyPerformanceCommand(command, args);
    return this.measure(commandKind, async () => {
      const result = await this.delegate.run(command, args, options);
      reportProcessResult(commandKind, result);
      return {
        result,
        outcome: processOutcome(result),
        outputBytes: textOutputBytes(result)
      };
    });
  }

  async runBinary(
    command: string,
    args: string[],
    options: ProcessRunOptions & { maxBytes: number }
  ): Promise<BinaryProcessResult> {
    if (!this.delegate.runBinary) {
      throw new Error("Binary process output is unavailable.");
    }
    const commandKind = classifyPerformanceCommand(command, args);
    return this.measure(commandKind, async () => {
      const result = await this.delegate.runBinary!(command, args, options);
      reportProcessResult(commandKind, result);
      return {
        result,
        outcome: processOutcome(result),
        outputBytes: result.stdout.byteLength + Buffer.byteLength(result.stderr)
      };
    });
  }

  get activeProcessDepth(): number {
    return this.activeDepth;
  }

  private async measure<T>(
    commandKind: PerformanceCommandKind,
    operation: () => Promise<{
      result: T;
      outcome: PerformanceCommandOutcome;
      outputBytes: number;
    }>
  ): Promise<T> {
    const startedAt = this.now();
    this.activeDepth += 1;
    const depthAtStart = this.activeDepth;
    this.diagnostics.recordQueueDepth(this.activeDepth);
    try {
      const measurement = await operation();
      this.diagnostics.recordCommand({
        commandKind,
        durationMs: this.now() - startedAt,
        outcome: measurement.outcome,
        outputBytes: measurement.outputBytes,
        queueDepth: depthAtStart
      });
      return measurement.result;
    } catch (error) {
      this.diagnostics.recordCommand({
        commandKind,
        durationMs: this.now() - startedAt,
        outcome: "rejected",
        outputBytes: 0,
        queueDepth: depthAtStart
      });
      reportRejectedProcess(commandKind, error);
      throw error;
    } finally {
      this.activeDepth -= 1;
      this.diagnostics.recordQueueDepth(this.activeDepth);
    }
  }
}

export function classifyPerformanceCommand(command: string, args: readonly string[]): PerformanceCommandKind {
  const executable = command.split(/[\\/]/).at(-1)?.toLocaleLowerCase().replace(/\.(?:exe|cmd|bat)$/u, "") ?? "";
  if (executable === "git") return "git";
  if (executable === "lore") return "lore";
  if (executable === "gh") return "github";
  if (executable === "codex" || executable === "claude") return "ai";
  if (executable === "cmd" && args.some((argument) => argument === "codex" || argument === "claude")) {
    return "ai";
  }
  if (executable === "cmd" || executable === "powershell" || executable === "pwsh" || executable === "bash" || executable === "sh") {
    return "configured-action";
  }
  if (executable === "node" || executable === "nodejs") return "system";
  return "other";
}

function textOutputBytes(result: ProcessResult): number {
  return Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
}

function processOutcome(result: ProcessResult | BinaryProcessResult): PerformanceCommandOutcome {
  if (result.exceededLimit || result.terminationReason === "outputLimit") return "truncated";
  if (result.terminationReason === "timedOut") return "timed-out";
  if (result.terminationReason === "aborted") return "cancelled";
  return result.exitCode === 0 ? "success" : "failure";
}

function reportProcessResult(
  commandKind: PerformanceCommandKind,
  result: ProcessResult | BinaryProcessResult
): void {
  const context = {
    subsystem: "process" as const,
    operation: "command" as const,
    commandKind,
    exitCode: result.exitCode
  };
  switch (result.terminationReason) {
    case "aborted":
      recordOperationOutcome({ ...context, outcome: "cancelled" });
      return;
    case "timedOut":
      reportOperationalFailure({ ...context, category: "timeout" }, { issue: "warning" });
      return;
    case "outputLimit":
      reportOperationalFailure({ ...context, category: "output-limit" }, { issue: "warning" });
      return;
    case "spawnFailed":
      reportOperationalFailure({ ...context, category: "spawn-failed" }, { issue: "error" });
      return;
  }
  if (result.exitCode !== 0) {
    reportOperationalFailure({
      ...context,
      category: classifyProcessFailure(commandKind, result.stderr)
    });
  }
}

export function classifyProcessFailure(
  commandKind: PerformanceCommandKind,
  stderr: string
): OperationalFailureCategory {
  if (commandKind !== "git" && commandKind !== "github" && commandKind !== "lore") {
    return "process-exit";
  }
  const kind = classifyGitOperationError(stderr);
  if (kind === "process-failure") return "process-exit";
  if (kind === "missing-author-identity" || kind === "branch-name-conflict") {
    return "validation";
  }
  return kind;
}

function reportRejectedProcess(commandKind: PerformanceCommandKind, error: unknown): void {
  const context = {
    subsystem: "process" as const,
    operation: "command" as const,
    commandKind
  };
  if (error instanceof Error && error.name === "AbortError") {
    recordOperationOutcome({ ...context, outcome: "cancelled" });
    return;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    reportOperationalFailure({ ...context, category: "timeout" }, { issue: "warning" });
    return;
  }
  reportUnexpectedError(error, context);
}
