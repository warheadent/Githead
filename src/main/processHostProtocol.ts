import type { BinaryProcessResult, ProcessInput, ProcessOutput, ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

/**
 * Messages between the main process and the process host. The host is an
 * Electron utility process that owns every child process, so the synchronous
 * part of process creation never runs on the main process thread. On Windows
 * that part is CreateProcess, and a burst of Git commands blocks window
 * dragging, resizing, and input for as long as it runs.
 */
export type SerializedRunOptions = Omit<ProcessRunOptions, "signal" | "onOutput" | "onInputReady">;

export interface SerializedAbortReason {
  name: string;
  message: string;
}

export type ProcessHostRequest =
  | {
    type: "run";
    id: number;
    command: string;
    args: string[];
    options: SerializedRunOptions;
    /** Present for binary reads; the value is the stdout byte limit. */
    maxBytes?: number;
    wantsOutput: boolean;
    wantsInput: boolean;
    /** Set when the caller's signal was aborted before the request was sent. */
    abortReason?: SerializedAbortReason;
  }
  | { type: "abort"; id: number; reason: SerializedAbortReason }
  | { type: "input"; id: number; data?: string | Uint8Array; end: boolean };

export type ProcessHostResponse =
  | { type: "output"; id: number; output: ProcessOutput }
  | { type: "inputReady"; id: number }
  | { type: "result"; id: number; result: ProcessResult | BinaryProcessResult };

export interface ProcessHostPort {
  postMessage(message: ProcessHostResponse): void;
  onMessage(listener: (message: ProcessHostRequest) => void): void;
}

export function serializeAbortReason(reason: unknown): SerializedAbortReason {
  return reason instanceof Error
    ? { name: reason.name, message: reason.message }
    : { name: "AbortError", message: "Command was cancelled." };
}

export function deserializeAbortReason(reason: SerializedAbortReason): Error {
  const error = new Error(reason.message);
  error.name = reason.name;
  return error;
}

/** Runs host requests with `runner`, which performs the actual spawn. */
export function serveProcessRunner(port: ProcessHostPort, runner: ProcessRunner): void {
  const active = new Map<number, { controller: AbortController; input?: ProcessInput }>();

  port.onMessage((message) => {
    if (message.type === "abort") {
      active.get(message.id)?.controller.abort(deserializeAbortReason(message.reason));
      return;
    }
    if (message.type === "input") {
      const input = active.get(message.id)?.input;
      if (!input) return;
      const data = typeof message.data === "string" || message.data === undefined ? message.data : Buffer.from(message.data);
      if (message.end) input.end(data);
      else if (data !== undefined) input.write(data);
      return;
    }

    const { id } = message;
    const controller = new AbortController();
    if (message.abortReason) controller.abort(deserializeAbortReason(message.abortReason));
    const entry: { controller: AbortController; input?: ProcessInput } = { controller };
    active.set(id, entry);
    const options: ProcessRunOptions = {
      ...message.options,
      ...(message.options.stdin instanceof Uint8Array ? { stdin: Buffer.from(message.options.stdin) } : {}),
      signal: controller.signal,
      ...(message.wantsOutput ? { onOutput: (output: ProcessOutput) => port.postMessage({ type: "output", id, output }) } : {}),
      ...(message.wantsInput ? {
        onInputReady: (input: ProcessInput) => {
          entry.input = input;
          port.postMessage({ type: "inputReady", id });
        }
      } : {})
    };

    const execution = message.maxBytes === undefined
      ? runner.run(message.command, message.args, options)
      : runner.runBinary
        ? runner.runBinary(message.command, message.args, { ...options, maxBytes: message.maxBytes })
        : Promise.reject(new Error("Binary process output is unavailable."));
    void execution
      .catch((error: unknown): ProcessResult => ({
        exitCode: -1,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : "The command could not be run.",
        terminationReason: "exited"
      }))
      .then((result) => {
        active.delete(id);
        port.postMessage({ type: "result", id, result });
      });
  });
}
