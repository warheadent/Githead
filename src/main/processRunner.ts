import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface ProcessOutput { stream: "stdout" | "stderr"; text: string }
export type ProcessTerminationReason = "aborted" | "timedOut" | "spawnFailed" | "exited";
export interface ProcessResult { exitCode: number; stdout: string; stderr: string; error?: string; terminationReason?: ProcessTerminationReason }
export interface ProcessRunOptions { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string | Buffer; timeoutMs?: number; signal?: AbortSignal; onOutput?: (output: ProcessOutput) => void }
export interface BinaryProcessResult { exitCode: number; stdout: Uint8Array; stderr: string; error?: string; exceededLimit?: boolean; terminationReason?: ProcessTerminationReason }
export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
  runBinary?(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult>;
}

const DEFAULT_PROCESS_CLOSE_GRACE_MS = 1_000;

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid || child.killed) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.unref();
  } else {
    child.kill("SIGTERM");
  }
}

export class NodeProcessRunner implements ProcessRunner {
  constructor(private readonly processCloseGraceMs = DEFAULT_PROCESS_CLOSE_GRACE_MS) {}

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
      let child: ChildProcessWithoutNullStreams;
      const output = (): string | Uint8Array => binary ? Buffer.concat(stdout) : Buffer.concat(stdout).toString();
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (closeTimer) clearTimeout(closeTimer);
        options.signal?.removeEventListener("abort", onAbort);
      };
      const finish = (code: number, error?: string, reason: ProcessTerminationReason = "exited") => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ exitCode: code, stdout: output(), stderr: Buffer.concat(stderr).toString(), ...(error ? { error } : {}), terminationReason: reason, ...(exceededLimit ? { exceededLimit: true } : {}) } as ProcessResult | BinaryProcessResult);
      };
      const finishTermination = (code: number | null) => {
        const reason = requested ?? "exited";
        const error = requestedError ?? (reason === "timedOut" ? "Command timed out." : reason === "aborted" ? "Command was cancelled." : undefined);
        finish(code ?? -1, error, reason);
      };
      const stop = (reason: "aborted" | "timedOut", error?: string) => { if (requested) return; requested = reason; requestedError = error; terminateProcessTree(child); };
      const onAbort = () => {
        const abortReason = options.signal?.reason;
        const timedOut = abortReason instanceof Error && abortReason.name === "TimeoutError";
        stop(timedOut ? "timedOut" : "aborted", timedOut && abortReason instanceof Error ? abortReason.message : undefined);
      };
      try {
        child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true });
      } catch (error) {
        finish(-1, error instanceof Error ? error.message : "Unable to start command.", "spawnFailed"); return;
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.timeoutMs !== undefined) timer = setTimeout(() => stop("timedOut", `Command timed out after ${options.timeoutMs}ms.`), options.timeoutMs);
      child.stdin.end(options.stdin);
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled || exceededLimit) return;
        stdoutLength += chunk.length;
        if (maxBytes !== undefined && stdoutLength > maxBytes) { exceededLimit = true; stdout.length = 0; terminateProcessTree(child); return; }
        stdout.push(chunk);
        if (!binary) options.onOutput?.({ stream: "stdout", text: chunk.toString() });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (settled) return;
        stderr.push(chunk);
        if (!binary) options.onOutput?.({ stream: "stderr", text: chunk.toString() });
      });
      child.on("error", (error) => finish(-1, error.message, "spawnFailed"));
      child.on("exit", (code) => {
        if (settled) return;
        // Node's `close` event waits for every inherited stdio handle to close. A
        // detached helper can keep those handles alive after the command itself
        // has exited, leaving the operation and its Cancel button stuck forever.
        // Give buffered output a short drain window, then close our pipe handles
        // and settle from the confirmed process exit.
        closeTimer = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          finishTermination(code);
        }, this.processCloseGraceMs);
        closeTimer.unref();
      });
      child.on("close", finishTermination);
    });
  }
}
