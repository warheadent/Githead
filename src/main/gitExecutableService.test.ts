import { describe, expect, it, vi } from "vite-plus/test";
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
      options: expect.objectContaining({
        timeoutMs: 2_000,
        maxOutputBytes: 4 * 1024
      })
    }]);
  });

  it("stops waiting when the process runner does not settle", async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn<ProcessRunner["run"]>(() => new Promise(() => {}));
      const status = new GitExecutableService({ run }).getStatus();

      await vi.advanceTimersByTimeAsync(5_000);

      await expect(status).resolves.toEqual({
        available: false,
        reason: "unavailable"
      });
      const options = run.mock.calls[0]?.[2];
      expect(options?.signal?.aborted).toBe(true);
      expect(options?.signal?.reason).toMatchObject({ name: "TimeoutError" });
    } finally {
      vi.useRealTimers();
    }
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
