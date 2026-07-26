import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";

export interface ProcessOutput { stream: "stdout" | "stderr"; text: string }
export type ProcessTerminationReason = "aborted" | "timedOut" | "spawnFailed" | "exited";
export interface ProcessResult { exitCode: number; stdout: string; stderr: string; error?: string; terminationReason?: ProcessTerminationReason }
export interface ProcessRunOptions { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string | Buffer; timeoutMs?: number; signal?: AbortSignal; onOutput?: (output: ProcessOutput) => void; stdoutFilePath?: string }
export interface BinaryProcessResult { exitCode: number; stdout: Uint8Array; stderr: string; error?: string; exceededLimit?: boolean; terminationReason?: ProcessTerminationReason }
export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
  runBinary?(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult>;
}

const DEFAULT_PROCESS_CLOSE_GRACE_MS = 1_000;
const DEFAULT_PROCESS_TERMINATION_GRACE_MS = 1_000;
const WINDOWS_TASKKILL_MINIMUM_WAIT_MS = 250;
const STDOUT_DRAIN_ERROR = "Command exited before stdout reached EOF and the output file finished draining.";

function hasExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

interface ProcessTreeTermination {
  completion: Promise<void>;
  cancel: () => void;
}

function completedTermination(): ProcessTreeTermination {
  return { completion: Promise.resolve(), cancel: () => {} };
}

function terminateWindowsProcessTree(
  child: ChildProcessWithoutNullStreams,
  processId: number,
  terminationGraceMs: number
): ProcessTreeTermination {
  let cancelled = false;
  let settled = false;
  let deadline: NodeJS.Timeout | undefined;
  let resolveCompletion: () => void = () => {};
  const completion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    if (deadline) clearTimeout(deadline);
    resolveCompletion();
  };
  const killChildDirectly = () => {
    if (cancelled || hasExited(child)) return;
    try {
      child.kill();
    } catch {
      // The child may have exited between the state check and the kill request.
    }
  };

  try {
    const killer = spawn("taskkill", ["/pid", String(processId), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    const fallbackAndFinish = () => {
      killChildDirectly();
      finish();
    };
    killer.once("error", fallbackAndFinish);
    killer.once("close", (code) => {
      if (code !== 0) killChildDirectly();
      finish();
    });
    deadline = setTimeout(() => {
      killChildDirectly();
      try {
        killer.kill();
      } catch {
        // The taskkill helper may already have exited.
      }
      finish();
    }, Math.max(terminationGraceMs, WINDOWS_TASKKILL_MINIMUM_WAIT_MS));
  } catch {
    killChildDirectly();
    finish();
  }

  return {
    completion,
    cancel: () => {
      cancelled = true;
      if (deadline) clearTimeout(deadline);
      finish();
    }
  };
}

function isProcessGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-processGroupId, signal);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function terminatePosixProcessTree(
  child: ChildProcessWithoutNullStreams,
  processGroupId: number,
  terminationGraceMs: number
): ProcessTreeTermination {
  let cancelled = false;
  let settled = false;
  let escalationTimer: NodeJS.Timeout | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let resolveCompletion: () => void = () => {};
  const completion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    if (escalationTimer) clearTimeout(escalationTimer);
    if (pollTimer) clearTimeout(pollTimer);
    resolveCompletion();
  };
  const killDirectChild = (signal: NodeJS.Signals) => {
    if (cancelled || hasExited(child)) return;
    try {
      child.kill(signal);
    } catch {
      // The direct child may have exited between the state check and signal.
    }
  };
  const signalTree = (signal: NodeJS.Signals) => {
    if (cancelled) return;
    if (!signalProcessGroup(processGroupId, signal)) killDirectChild(signal);
  };
  const pollIntervalMs = Math.max(5, Math.min(25, Math.floor(terminationGraceMs / 4) || 5));
  const pollForExit = () => {
    if (cancelled || settled) return;
    if (!isProcessGroupAlive(processGroupId)) {
      finish();
      return;
    }
    pollTimer = setTimeout(pollForExit, pollIntervalMs);
  };

  signalTree("SIGTERM");
  escalationTimer = setTimeout(() => signalTree("SIGKILL"), terminationGraceMs);
  pollForExit();

  return {
    completion,
    cancel: () => {
      cancelled = true;
      finish();
    }
  };
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams, terminationGraceMs: number): ProcessTreeTermination {
  if (!child.pid) return completedTermination();
  return process.platform === "win32"
    ? terminateWindowsProcessTree(child, child.pid, terminationGraceMs)
    : terminatePosixProcessTree(child, child.pid, terminationGraceMs);
}

export class NodeProcessRunner implements ProcessRunner {
  constructor(
    private readonly processCloseGraceMs = DEFAULT_PROCESS_CLOSE_GRACE_MS,
    private readonly processTerminationGraceMs = DEFAULT_PROCESS_TERMINATION_GRACE_MS
  ) {}

  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return this.execute(command, args, options, undefined) as Promise<ProcessResult>;
  }

  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> {
    return this.execute(command, args, options, options.maxBytes) as Promise<BinaryProcessResult>;
  }

  private execute(command: string, args: string[], options: ProcessRunOptions, maxBytes: number | undefined): Promise<ProcessResult | BinaryProcessResult> {
    const binary = maxBytes !== undefined;
    const empty = binary ? new Uint8Array() : "";
    if (options.signal?.aborted) {
      const abortReason = options.signal.reason;
      const timedOut = abortReason instanceof Error && abortReason.name === "TimeoutError";
      return Promise.resolve({
        exitCode: -1,
        stdout: empty,
        stderr: "",
        error: timedOut && abortReason instanceof Error ? abortReason.message : timedOut ? "Command timed out." : "Command was cancelled.",
        terminationReason: timedOut ? "timedOut" : "aborted"
      } as ProcessResult | BinaryProcessResult);
    }
    return new Promise<ProcessResult | BinaryProcessResult>((resolve) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutLength = 0;
      let exceededLimit = false;
      let requested: "aborted" | "timedOut" | null = null;
      let requestedError: string | undefined;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let closeTimer: NodeJS.Timeout | undefined;
      let cancelTermination: (() => void) | undefined;
      let terminationStarted = false;
      let processTreeTerminationDone = true;
      let child: ChildProcessWithoutNullStreams;
      let outputSink: WriteStream | undefined;
      let outputSinkFinished = options.stdoutFilePath === undefined;
      let outputSinkClosed = options.stdoutFilePath === undefined;
      let outputSinkError: string | undefined;
      let stdoutEnded = options.stdoutFilePath === undefined;
      let processDrainDone = false;
      let frozenOutcome: { code: number; error?: string; reason: ProcessTerminationReason } | undefined;
      let acceptingTerminationRequests = true;
      const output = (): string | Uint8Array => binary ? Buffer.concat(stdout) : Buffer.concat(stdout).toString();
      const stopAcceptingTerminationRequests = () => {
        if (!acceptingTerminationRequests) return;
        acceptingTerminationRequests = false;
        if (timer) clearTimeout(timer);
        timer = undefined;
        options.signal?.removeEventListener("abort", onAbort);
      };
      const cleanup = () => {
        stopAcceptingTerminationRequests();
        if (closeTimer) clearTimeout(closeTimer);
        cancelTermination?.();
      };
      const finish = (code: number, error?: string, reason: ProcessTerminationReason = "exited") => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ exitCode: code, stdout: output(), stderr: Buffer.concat(stderr).toString(), ...(error ? { error } : {}), terminationReason: reason, ...(exceededLimit ? { exceededLimit: true } : {}) } as ProcessResult | BinaryProcessResult);
      };
      const freezeOutcome = (code: number | null, reasonOverride?: ProcessTerminationReason, errorOverride?: string) => {
        if (frozenOutcome) return;
        const reason = requested ?? "exited";
        const error = requestedError ?? (reason === "timedOut" ? "Command timed out." : reason === "aborted" ? "Command was cancelled." : undefined);
        const frozenError = errorOverride ?? error;
        frozenOutcome = {
          code: code ?? -1,
          ...(frozenError ? { error: frozenError } : {}),
          reason: reasonOverride ?? reason
        };
        stopAcceptingTerminationRequests();
      };
      const outputDrainDone = () => options.stdoutFilePath === undefined || (
        outputSinkError
          ? outputSink === undefined || outputSinkClosed
          : stdoutEnded && outputSinkFinished
      );
      const maybeFinish = () => {
        if (!frozenOutcome || !processDrainDone || !processTreeTerminationDone || !outputDrainDone()) return;
        const error = outputSinkError ?? frozenOutcome.error;
        finish(outputSinkError ? -1 : frozenOutcome.code, error, frozenOutcome.reason);
      };
      const endOutputSink = () => {
        if (!outputSink || outputSinkFinished || outputSink.writableEnded) return;
        outputSink.end();
      };
      const finishProcessDrain = () => {
        if (processDrainDone) return;
        processDrainDone = true;
        maybeFinish();
      };
      const failOutputDrain = () => {
        if (options.stdoutFilePath === undefined || outputDrainDone()) return;
        outputSinkError ??= STDOUT_DRAIN_ERROR;
        child.stdout.unpipe(outputSink);
        if (outputSink && !outputSinkClosed) outputSink.destroy();
      };
      const requestProcessTermination = () => {
        if (terminationStarted || frozenOutcome) return;
        if (hasExited(child)) {
          freezeOutcome(child.exitCode);
          return;
        }
        terminationStarted = true;
        processTreeTerminationDone = false;
        const termination = terminateProcessTree(child, this.processTerminationGraceMs);
        cancelTermination = termination.cancel;
        void termination.completion.then(() => {
          processTreeTerminationDone = true;
          maybeFinish();
        });
      };
      const stop = (reason: "aborted" | "timedOut", error?: string) => {
        if (requested || frozenOutcome) return;
        if (hasExited(child)) {
          freezeOutcome(child.exitCode);
          return;
        }
        requested = reason;
        requestedError = error;
        requestProcessTermination();
      };
      const onAbort = () => {
        const abortReason = options.signal?.reason;
        const timedOut = abortReason instanceof Error && abortReason.name === "TimeoutError";
        stop(timedOut ? "timedOut" : "aborted", timedOut && abortReason instanceof Error ? abortReason.message : undefined);
      };
      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env,
          shell: false,
          windowsHide: true,
          detached: process.platform !== "win32"
        });
      } catch (error) {
        finish(-1, error instanceof Error ? error.message : "Unable to start command.", "spawnFailed"); return;
      }
      if (options.stdoutFilePath !== undefined) {
        try {
          outputSink = createWriteStream(options.stdoutFilePath);
        } catch (error) {
          outputSinkClosed = true;
          outputSinkError = error instanceof Error ? error.message : "Unable to open stdout output file.";
          requestProcessTermination();
        }
        if (outputSink) {
          outputSink.once("finish", () => {
            outputSinkFinished = true;
            maybeFinish();
          });
          outputSink.once("error", (error) => {
            outputSinkError ??= error.message;
            requestProcessTermination();
            maybeFinish();
          });
          outputSink.once("close", () => {
            outputSinkClosed = true;
            maybeFinish();
          });
          child.stdout.pipe(outputSink);
        }
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      // The signal can become aborted after the pre-spawn check but before the
      // listener above is installed. Re-check after subscribing so that either
      // the event or this state check observes every cancellation request.
      if (options.signal?.aborted) onAbort();
      if (options.timeoutMs !== undefined) timer = setTimeout(() => stop("timedOut", `Command timed out after ${options.timeoutMs}ms.`), options.timeoutMs);
      child.stdin.end(options.stdin);
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled || exceededLimit) return;
        stdoutLength += chunk.length;
        if (maxBytes !== undefined && stdoutLength > maxBytes) {
          exceededLimit = true;
          stdout.length = 0;
          requestProcessTermination();
          return;
        }
        if (options.stdoutFilePath === undefined) stdout.push(chunk);
        if (!binary) options.onOutput?.({ stream: "stdout", text: chunk.toString() });
      });
      child.stdout.once("end", () => {
        stdoutEnded = true;
        maybeFinish();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (settled) return;
        stderr.push(chunk);
        if (!binary) options.onOutput?.({ stream: "stderr", text: chunk.toString() });
      });
      child.on("error", (error) => {
        if (child.pid && !hasExited(child)) return;
        freezeOutcome(-1, "spawnFailed", error.message);
        stdoutEnded = true;
        processDrainDone = true;
        endOutputSink();
        maybeFinish();
      });
      child.on("exit", (code) => {
        if (settled) return;
        freezeOutcome(code);
        // Node's `close` event waits for every inherited stdio handle to close. A
        // detached helper can keep those handles alive after the command itself
        // has exited, leaving the operation and its Cancel button stuck forever.
        // Give buffered output a short drain window, then close our pipe handles
        // and settle from the confirmed process exit. File-backed stdout is only
        // successful after EOF and the sink's `finish`; expiry is a hard error so
        // callers never accept a potentially truncated file.
        closeTimer = setTimeout(() => {
          failOutputDrain();
          child.stdout.unpipe(outputSink);
          child.stdout.destroy();
          child.stderr.destroy();
          finishProcessDrain();
        }, this.processCloseGraceMs);
        closeTimer.unref();
      });
      child.on("close", (code) => {
        freezeOutcome(code);
        finishProcessDrain();
      });
    });
  }
}
