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
      reportProcessResult(commandKind, result, classifyGitCommand(commandKind, args));
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
      reportProcessResult(commandKind, result, classifyGitCommand(commandKind, args));
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
  result: ProcessResult | BinaryProcessResult,
  gitCommand: string | undefined
): void {
  const context = {
    subsystem: "process" as const,
    operation: "command" as const,
    commandKind,
    ...(gitCommand ? { gitCommand } : {}),
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
      // A missing executable or working directory is the user's environment, not a defect: optional tools such as
      // gh, codex and claude are probed on every launch, and a repository action can name a shell this system lacks.
      if (result.spawnErrorCode === "ENOENT") {
        reportOperationalFailure({ ...context, category: "not-found" });
        return;
      }
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

/** Git's own subcommand names. Anything else, such as a user alias, is reported as "other". */
const GIT_COMMANDS = new Set([
  "add", "am", "apply", "archive", "bisect", "blame", "branch", "bundle", "cat-file", "check-attr", "check-ignore",
  "check-mailmap", "check-ref-format", "checkout", "cherry", "cherry-pick", "clean", "clone", "commit", "commit-graph",
  "commit-tree", "config", "count-objects", "describe", "diff", "diff-files", "diff-index", "diff-tree", "fetch",
  "for-each-ref", "format-patch", "fsck", "gc", "grep", "hash-object", "init", "lfs", "log", "ls-files", "ls-remote",
  "ls-tree", "maintenance", "merge", "merge-base", "merge-file", "merge-tree", "mv", "name-rev", "notes", "pull", "push",
  "range-diff", "read-tree", "rebase", "reflog", "remote", "repack", "replace", "reset", "restore", "rev-list",
  "rev-parse", "revert", "rm", "shortlog", "show", "show-ref", "sparse-checkout", "stash", "status", "submodule",
  "switch", "symbolic-ref", "tag", "update-index", "update-ref", "var", "verify-commit", "verify-tag", "version",
  "worktree", "write-tree"
]);
/** Global options whose value is the next argument, so it is not mistaken for the subcommand. */
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"]);

/** Names the Git subcommand from a fixed list, so a timeout can be traced to a command without reporting arguments. */
export function classifyGitCommand(commandKind: PerformanceCommandKind, args: readonly string[]): string | undefined {
  if (commandKind !== "git") return undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (GIT_OPTIONS_WITH_VALUE.has(argument)) {
      index++;
      continue;
    }
    if (argument.startsWith("-")) continue;
    return GIT_COMMANDS.has(argument) ? argument : "other";
  }
  return undefined;
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
