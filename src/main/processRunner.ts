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
  stdin?: string | Buffer;
  onOutput?: (output: ProcessOutput) => void;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let completed = false;

      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true
      });

      child.stdin?.end(options.stdin);

      const finish = (result: ProcessResult) => {
        if (completed) {
          return;
        }

        completed = true;
        resolve(result);
      };

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
}
