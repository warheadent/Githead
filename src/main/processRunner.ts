import { spawn } from "node:child_process";

export interface ProcessOutput {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface ProcessRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string | Buffer;
  timeoutMs?: number;
  onOutput?: (output: ProcessOutput) => void;
}

export interface BinaryProcessResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
  error?: string;
  exceededLimit?: boolean;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
  runBinary?(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let completed = false;
      let timeout: NodeJS.Timeout | null = null;

      const finish = (result: ProcessResult) => {
        if (completed) {
          return;
        }

        completed = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        resolve(result);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env,
          shell: false,
          windowsHide: true
        });
      } catch (error) {
        finish({
          exitCode: -1,
          stdout: "",
          stderr: "",
          error: error instanceof Error ? error.message : "Unable to start command."
        });
        return;
      }

      timeout = options.timeoutMs
        ? setTimeout(() => {
            child.kill();
            finish({
              exitCode: -1,
              stdout: stdoutChunks.join(""),
              stderr: stderrChunks.join(""),
              error: `Command timed out after ${options.timeoutMs}ms.`
            });
          }, options.timeoutMs)
        : null;

      child.stdin?.end(options.stdin);

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutChunks.push(text);
        options.onOutput?.({
          stream: "stdout",
          text
        });
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrChunks.push(text);
        options.onOutput?.({
          stream: "stderr",
          text
        });
      });

      child.on("error", (error) => {
        const stderr = stderrChunks.join("");
        finish({
          exitCode: -1,
          stdout: stdoutChunks.join(""),
          stderr,
          error: error.message
        });
      });

      child.on("close", (code) => {
        finish({
          exitCode: code ?? -1,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join("")
        });
      });
    });
  }


  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> {
    return new Promise((resolve) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutLength = 0;
      let completed = false;
      let exceededLimit = false;
      let timeout: NodeJS.Timeout | null = null;
      const finish = (result: BinaryProcessResult) => {
        if (completed) return;
        completed = true;
        if (timeout) clearTimeout(timeout);
        resolve(result);
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true });
      } catch (error) {
        finish({ exitCode: -1, stdout: new Uint8Array(), stderr: "", error: error instanceof Error ? error.message : "Unable to start command." });
        return;
      }
      timeout = options.timeoutMs ? setTimeout(() => {
        child.kill();
        finish({ exitCode: -1, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks).toString("utf8"), error: `Command timed out after ${options.timeoutMs}ms.` });
      }, options.timeoutMs) : null;
      child.stdin?.end(options.stdin);
      child.stdout?.on("data", (chunk: Buffer) => {
        if (exceededLimit) return;
        stdoutLength += chunk.length;
        if (stdoutLength > options.maxBytes) {
          exceededLimit = true;
          stdoutChunks.length = 0;
          child.kill();
          return;
        }
        stdoutChunks.push(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      child.on("error", (error) => finish({ exitCode: -1, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks).toString("utf8"), error: error.message, ...(exceededLimit ? { exceededLimit: true } : {}) }));
      child.on("close", (code) => finish({ exitCode: code ?? -1, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks).toString("utf8"), ...(exceededLimit ? { exceededLimit: true } : {}) }));
    });
  }
}
