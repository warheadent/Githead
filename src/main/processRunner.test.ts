import { describe, expect, it, vi } from "vite-plus/test";
import { NodeProcessRunner } from "./processRunner";

describe("NodeProcessRunner.run", () => {
  it("returns an aborted result without spawning for an already-aborted signal", async () => {
    const controller = new AbortController();
    const onOutput = vi.fn();
    controller.abort();

    const result = await new NodeProcessRunner().run(process.execPath, ["-e", "process.stdout.write('unexpected')"], {
      signal: controller.signal,
      onOutput
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stdout: "",
      stderr: "",
      error: "Command was cancelled.",
      terminationReason: "aborted"
    });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it("terminates a spawned process when aborted", async () => {
    const controller = new AbortController();
    const run = new NodeProcessRunner().run(process.execPath, ["-e", "process.stdout.write('started'); setInterval(() => {}, 1000)"], {
      signal: controller.signal,
      onOutput: ({ text }) => {
        if (text.includes("started")) controller.abort();
      }
    });

    await expect(run).resolves.toMatchObject({
      error: "Command was cancelled.",
      terminationReason: "aborted"
    });
  });

  it("preserves a coordinator timeout reason from an abort signal", async () => {
    const controller = new AbortController();
    const run = new NodeProcessRunner().run(process.execPath, ["-e", "process.stdout.write('started'); setInterval(() => {}, 1000)"], {
      signal: controller.signal,
      onOutput: ({ text }) => {
        if (text.includes("started")) {
          controller.abort(new DOMException("Operation timed out after 50ms.", "TimeoutError"));
        }
      }
    });

    await expect(run).resolves.toMatchObject({
      error: "Operation timed out after 50ms.",
      terminationReason: "timedOut"
    });
  });

  it("reports timeout as the termination reason", async () => {
    const result = await new NodeProcessRunner().run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeoutMs: 50
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBe("Command timed out after 50ms.");
    expect(result.terminationReason).toBe("timedOut");
  });

  it("completes once and removes the abort listener before a late abort", async () => {
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener");

    const result = await new NodeProcessRunner().run(process.execPath, ["-e", "process.stdout.write('done')"], {
      signal: controller.signal
    });
    controller.abort();

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "done",
      terminationReason: "exited"
    });
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("settles after process exit when a detached helper keeps stdout open", async () => {
    const helperLifetimeMs = 1_000;
    const runner = new NodeProcessRunner(25);
    const script = [
      "const { spawn } = require('node:child_process');",
      `const helper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${helperLifetimeMs})'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });`,
      "helper.unref();",
      "process.stdout.write('done');"
    ].join(" ");

    const startedAt = Date.now();
    const result = await runner.run(process.execPath, ["-e", script]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "done",
      terminationReason: "exited"
    });
    expect(Date.now() - startedAt).toBeLessThan(helperLifetimeMs);
  });
});

describe("NodeProcessRunner.runBinary", () => {
  it("preserves arbitrary bytes", async () => {
    const result = await new NodeProcessRunner().runBinary(process.execPath, ["-e", "process.stdout.write(Buffer.from([0,255,128,65]))"], { maxBytes: 16 });
    expect(result.exitCode).toBe(0);
    expect([...result.stdout]).toEqual([0, 255, 128, 65]);
  });

  it("stops output beyond the configured limit", async () => {
    const result = await new NodeProcessRunner().runBinary(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(32))"], { maxBytes: 8 });
    expect(result.exceededLimit).toBe(true);
    expect(result.stdout.byteLength).toBe(0);
  });
});
