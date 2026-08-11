import { describe, expect, it } from "vite-plus/test";
import { GitExecutableService } from "./gitExecutableService";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options: ProcessRunOptions | undefined }> = [];

  constructor(private readonly response: ProcessResult) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({ command, args, options });
    return this.response;
  }
}

describe("GitExecutableService", () => {
  it("reports the installed Git version", async () => {
    const runner = new FakeProcessRunner({
      exitCode: 0,
      stdout: "git version 2.51.0\n",
      stderr: ""
    });

    await expect(new GitExecutableService(runner).getStatus()).resolves.toEqual({
      available: true,
      version: "git version 2.51.0"
    });
    expect(runner.calls).toEqual([{
      command: "git",
      args: ["--version"],
      options: {
        timeoutMs: 2_000,
        maxOutputBytes: 4 * 1024
      }
    }]);
  });

  it("reports Git as not found when the executable cannot be spawned", async () => {
    const runner = new FakeProcessRunner({
      exitCode: -1,
      stdout: "",
      stderr: "",
      error: "spawn git ENOENT",
      terminationReason: "spawnFailed"
    });

    await expect(new GitExecutableService(runner).getStatus()).resolves.toEqual({
      available: false,
      reason: "not-found"
    });
  });

  it("distinguishes an installed executable that cannot run", async () => {
    const runner = new FakeProcessRunner({
      exitCode: 1,
      stdout: "",
      stderr: "Git failed to start."
    });

    await expect(new GitExecutableService(runner).getStatus()).resolves.toEqual({
      available: false,
      reason: "unavailable"
    });
  });
});
