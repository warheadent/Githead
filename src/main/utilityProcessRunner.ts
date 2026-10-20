import { app, utilityProcess } from "electron";
import {
  serializeAbortReason,
  type ProcessHostRequest,
  type ProcessHostResponse,
  type SerializedRunOptions
} from "./processHostProtocol";
import type { BinaryProcessResult, ProcessOutput, ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

export interface ProcessHostConnection {
  postMessage(message: ProcessHostRequest): void;
  onMessage(listener: (message: ProcessHostResponse) => void): void;
  onExit(listener: () => void): void;
}

/** Resolves once the host can receive requests. */
export type ProcessHostFactory = () => Promise<ProcessHostConnection>;

interface PendingRun {
  host: ProcessHostConnection;
  binary: boolean;
  onOutput?: (output: ProcessOutput) => void;
  onInputReady?: ProcessRunOptions["onInputReady"];
  settle: (result: ProcessResult | BinaryProcessResult) => void;
}

const HOST_EXITED_ERROR = "Githead's process host stopped before the command finished. The command's outcome is unknown.";

/**
 * Runs commands in the process host (see processHostProtocol.ts). A host that
 * exits fails its pending commands and is replaced on the next command. If a
 * host cannot be started, commands run in this process through `fallback`.
 */
export class UtilityProcessRunner implements ProcessRunner {
  private host: Promise<ProcessHostConnection> | null = null;
  private readonly pending = new Map<number, PendingRun>();
  private readonly exitedHosts = new WeakSet<ProcessHostConnection>();
  private nextId = 0;

  constructor(
    private readonly createHost: ProcessHostFactory,
    private readonly fallback: ProcessRunner
  ) {}

  /** Starts the host ahead of the first command so that command does not wait for it. */
  start(): void {
    void this.getHost().catch(() => {});
  }

  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return this.execute(command, args, options, undefined) as Promise<ProcessResult>;
  }

  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> {
    return this.execute(command, args, options, options.maxBytes) as Promise<BinaryProcessResult>;
  }

  private getHost(): Promise<ProcessHostConnection> {
    if (!this.host) {
      const starting = this.createHost().then((host) => {
        host.onMessage((message) => this.handleMessage(message));
        host.onExit(() => this.handleExit(host, starting));
        return host;
      });
      starting.catch(() => {
        if (this.host === starting) this.host = null;
      });
      this.host = starting;
    }
    return this.host;
  }

  private async execute(
    command: string,
    args: string[],
    options: ProcessRunOptions,
    maxBytes: number | undefined
  ): Promise<ProcessResult | BinaryProcessResult> {
    let host: ProcessHostConnection;
    try {
      host = await this.getHost();
    } catch {
      return maxBytes === undefined
        ? this.fallback.run(command, args, options)
        : this.fallback.runBinary
          ? this.fallback.runBinary(command, args, { ...options, maxBytes })
          : Promise.reject(new Error("Binary process output is unavailable."));
    }

    if (this.exitedHosts.has(host)) return hostExitedResult(maxBytes !== undefined);

    const { signal, onOutput, onInputReady, ...rest } = options;
    const serialized: SerializedRunOptions = { ...rest, env: rest.env ?? { ...process.env } };
    const id = ++this.nextId;
    return new Promise((resolve) => {
      const onAbort = () => this.post(host, { type: "abort", id, reason: serializeAbortReason(signal?.reason) });
      this.pending.set(id, {
        host,
        binary: maxBytes !== undefined,
        ...(onOutput ? { onOutput } : {}),
        ...(onInputReady ? { onInputReady } : {}),
        settle: (result) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(result);
        }
      });
      if (signal && !signal.aborted) signal.addEventListener("abort", onAbort, { once: true });
      this.post(host, {
        type: "run",
        id,
        command,
        args,
        options: serialized,
        ...(maxBytes !== undefined ? { maxBytes } : {}),
        wantsOutput: Boolean(onOutput),
        wantsInput: Boolean(onInputReady),
        ...(signal?.aborted ? { abortReason: serializeAbortReason(signal.reason) } : {})
      });
    });
  }

  private post(host: ProcessHostConnection, message: ProcessHostRequest): void {
    try {
      host.postMessage(message);
    } catch {
      // The host is exiting; its exit handler fails the pending command.
    }
  }

  private handleMessage(message: ProcessHostResponse): void {
    const run = this.pending.get(message.id);
    if (!run) return;
    if (message.type === "output") {
      run.onOutput?.(message.output);
      return;
    }
    if (message.type === "inputReady") {
      const { id } = message;
      run.onInputReady?.({
        write: (data) => {
          this.post(run.host, { type: "input", id, data, end: false });
          return true;
        },
        end: (data) => this.post(run.host, { type: "input", id, ...(data !== undefined ? { data } : {}), end: true })
      });
      return;
    }

    this.pending.delete(message.id);
    const { result } = message;
    // Structured cloning turns Buffer into Uint8Array; callers decode Buffers.
    run.settle(run.binary && result.stdout instanceof Uint8Array && !Buffer.isBuffer(result.stdout)
      ? { ...result, stdout: Buffer.from(result.stdout.buffer, result.stdout.byteOffset, result.stdout.byteLength) }
      : result);
  }

  private handleExit(host: ProcessHostConnection, starting: Promise<ProcessHostConnection>): void {
    this.exitedHosts.add(host);
    if (this.host === starting) this.host = null;
    for (const [id, run] of this.pending) {
      if (run.host !== host) continue;
      this.pending.delete(id);
      run.settle(hostExitedResult(run.binary));
    }
  }
}

function hostExitedResult(binary: boolean): ProcessResult | BinaryProcessResult {
  return {
    exitCode: -1,
    stdout: binary ? new Uint8Array() : "",
    stderr: "",
    error: HOST_EXITED_ERROR,
    terminationReason: "exited"
  } as ProcessResult | BinaryProcessResult;
}

/** Starts `entryPath` as an Electron utility process once the app is ready. */
export function createUtilityProcessHostFactory(entryPath: string): ProcessHostFactory {
  return async () => {
    await app.whenReady();
    const child = utilityProcess.fork(entryPath, [], { serviceName: "Githead Process Host", stdio: "ignore" });
    await new Promise<void>((resolve, reject) => {
      const onExit = (code: number) => reject(new Error(`The process host exited during startup with code ${code}.`));
      child.once("exit", onExit);
      child.once("spawn", () => {
        child.off("exit", onExit);
        resolve();
      });
    });
    return {
      postMessage: (message) => child.postMessage(message),
      onMessage: (listener) => child.on("message", (message: ProcessHostResponse) => listener(message)),
      onExit: (listener) => child.once("exit", () => listener())
    };
  };
}
