import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { NodeProcessRunner } from "./processRunner";

async function withTempDir<T>(fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-process-runner-"));
  try {
    return await fn(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

describe("NodeProcessRunner.run", () => {
  it("supports response-driven process input", async () => {
    const result = await new NodeProcessRunner().run(
      process.execPath,
      ["-e", "process.stdin.once('data', data => process.stdout.write(data.toString().toUpperCase()))"],
      {
        onInputReady: (input) => input.end("hello")
      }
    );

    expect(result).toMatchObject({ exitCode: 0, stdout: "HELLO" });
  });

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

  it("observes an abort that occurs while the child is being spawned", async () => {
    let abortedChecks = 0;
    const signal = {
      get aborted() {
        abortedChecks += 1;
        return abortedChecks > 1;
      },
      reason: undefined,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as AbortSignal;

    const result = await new NodeProcessRunner(25, 25).run(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { signal }
    );

    expect(result).toMatchObject({
      error: "Command was cancelled.",
      terminationReason: "aborted"
    });
    expect(signal.addEventListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
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

  it("streams stdout to a file without retaining it in the result", async () => {
    await withTempDir(async (directory) => {
      const outputPath = path.join(directory, "blob.bin");
      const result = await new NodeProcessRunner().run(
        process.execPath,
        ["-e", "process.stdout.write(Buffer.from([0,255,128,65]))"],
        { stdoutFilePath: outputPath }
      );

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "",
        stderr: "",
        terminationReason: "exited"
      });
      expect([...await fs.readFile(outputPath)]).toEqual([0, 255, 128, 65]);
    });
  });

  it("does not report success until a large redirected stdout payload is complete", async () => {
    await withTempDir(async (directory) => {
      const outputPath = path.join(directory, "large.bin");
      const payloadBytes = 4 * 1024 * 1024;
      const result = await new NodeProcessRunner().run(
        process.execPath,
        ["-e", `process.stdout.write(Buffer.alloc(${payloadBytes}, 113))`],
        { stdoutFilePath: outputPath }
      );

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "",
        terminationReason: "exited"
      });
      const output = await fs.readFile(outputPath);
      expect(output.byteLength).toBe(payloadBytes);
      expect(output[0]).toBe(113);
      expect(output[output.length - 1]).toBe(113);
    });
  });

  it("reports a drain error instead of success when inherited stdout prevents file-output EOF", async () => {
    await withTempDir(async (directory) => {
      const helperLifetimeMs = 1_000;
      const outputPath = path.join(directory, "partial.bin");
      const payloadBytes = 4 * 1024 * 1024;
      const script = [
        "const { spawn } = require('node:child_process');",
        `const helper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${helperLifetimeMs})'], { detached: true, stdio: ['ignore', 'inherit', 'ignore'], windowsHide: true });`,
        "helper.unref();",
        `process.stdout.write(Buffer.alloc(${payloadBytes}, 97), () => process.exit(0));`
      ].join(" ");
      const startedAt = Date.now();

      const result = await new NodeProcessRunner(25).run(process.execPath, ["-e", script], {
        stdoutFilePath: outputPath
      });

      expect(result).toMatchObject({
        exitCode: -1,
        stdout: "",
        error: "Command exited before stdout reached EOF and the output file finished draining.",
        terminationReason: "exited"
      });
      expect((await fs.stat(outputPath)).size).toBeGreaterThan(0);
      expect(Date.now() - startedAt).toBeLessThan(helperLifetimeMs);
    });
  });

  it("reports an output-file error after terminating the child", async () => {
    await withTempDir(async (directory) => {
      const outputPath = path.join(directory, "missing", "blob.bin");
      const result = await new NodeProcessRunner(25, 25).run(
        process.execPath,
        ["-e", "process.stdout.write('started'); setInterval(() => {}, 1000)"],
        { stdoutFilePath: outputPath }
      );

      expect(result.exitCode).toBe(-1);
      expect(result.error).toContain("ENOENT");
    });
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

  it("does not reclassify an exited process when aborted during detached stdio drain", async () => {
    const helperLifetimeMs = 1_000;
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener");
    const runner = new NodeProcessRunner(100);
    const script = [
      "const { spawn } = require('node:child_process');",
      `const helper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${helperLifetimeMs})'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });`,
      "helper.unref();",
      "process.stdout.write('done');"
    ].join(" ");

    const run = runner.run(process.execPath, ["-e", script], { signal: controller.signal });
    await vi.waitFor(() => expect(removeEventListener).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(run).resolves.toMatchObject({
      exitCode: 0,
      stdout: "done",
      terminationReason: "exited"
    });
  });

  it("escalates from SIGTERM to SIGKILL after the termination grace", async () => {
    if (process.platform === "win32") return;
    const controller = new AbortController();
    const runner = new NodeProcessRunner(25, 25);
    const run = runner.run(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('started'); setInterval(() => {}, 1000)"],
      {
        signal: controller.signal,
        onOutput: ({ text }) => {
          if (text.includes("started")) controller.abort();
        }
      }
    );

    await expect(run).resolves.toMatchObject({
      error: "Command was cancelled.",
      terminationReason: "aborted"
    });
  });

  it("does not complete cancellation while a descendant in the process group remains alive", async () => {
    if (process.platform === "win32") return;
    await withTempDir(async (directory) => {
      const readyPath = path.join(directory, "descendant-ready");
      const sentinelPath = path.join(directory, "descendant-survived");
      const terminationGraceMs = 75;
      const descendantScript = [
        "const fs = require('node:fs');",
        "process.on('SIGTERM', () => {});",
        `fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');`,
        `setTimeout(() => fs.writeFileSync(${JSON.stringify(sentinelPath)}, 'survived'), 250);`,
        "setInterval(() => {}, 1000);"
      ].join(" ");
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore', windowsHide: true });`,
        `const reportReady = () => fs.existsSync(${JSON.stringify(readyPath)}) ? process.stdout.write('started:' + descendant.pid + '\\n') : setTimeout(reportReady, 5);`,
        "reportReady();",
        "setInterval(() => {}, 1000);"
      ].join(" ");
      const controller = new AbortController();
      let output = "";
      let descendantPid = 0;
      let abortedAt = 0;
      const run = new NodeProcessRunner(25, terminationGraceMs).run(process.execPath, ["-e", parentScript], {
        signal: controller.signal,
        onOutput: ({ text }) => {
          output += text;
          const match = /started:(\d+)/.exec(output);
          if (!match || controller.signal.aborted) return;
          descendantPid = Number(match[1]);
          abortedAt = Date.now();
          controller.abort();
        }
      });

      try {
        await expect(run).resolves.toMatchObject({
          error: "Command was cancelled.",
          terminationReason: "aborted"
        });
        expect(descendantPid).toBeGreaterThan(0);
        expect(Date.now() - abortedAt).toBeGreaterThanOrEqual(terminationGraceMs - 20);
        expect(() => process.kill(descendantPid, 0)).toThrow();
        await new Promise((resolve) => setTimeout(resolve, 300));
        await expect(fs.access(sentinelPath)).rejects.toThrow();
      } finally {
        if (descendantPid > 0) {
          try {
            process.kill(descendantPid, "SIGKILL");
          } catch {
            // The expected path already terminated the descendant process.
          }
        }
      }
    });
  });

  it("terminates a Windows descendant before completing cancellation", async () => {
    if (process.platform !== "win32") return;
    await withTempDir(async (directory) => {
      const readyPath = path.join(directory, "descendant-ready");
      const sentinelPath = path.join(directory, "descendant-survived");
      const descendantScript = [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');`,
        `setTimeout(() => fs.writeFileSync(${JSON.stringify(sentinelPath)}, 'survived'), 750);`,
        "setInterval(() => {}, 1000);"
      ].join(" ");
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore', windowsHide: true });`,
        `const reportReady = () => fs.existsSync(${JSON.stringify(readyPath)}) ? process.stdout.write('started:' + descendant.pid + '\\n') : setTimeout(reportReady, 5);`,
        "reportReady();",
        "setInterval(() => {}, 1000);"
      ].join(" ");
      const controller = new AbortController();
      let output = "";
      let descendantPid = 0;
      const run = new NodeProcessRunner(25, 1_000).run(process.execPath, ["-e", parentScript], {
        signal: controller.signal,
        onOutput: ({ text }) => {
          output += text;
          const match = /started:(\d+)/.exec(output);
          if (!match || controller.signal.aborted) return;
          descendantPid = Number(match[1]);
          controller.abort();
        }
      });

      try {
        await expect(run).resolves.toMatchObject({
          error: "Command was cancelled.",
          terminationReason: "aborted"
        });
        expect(descendantPid).toBeGreaterThan(0);
        expect(() => process.kill(descendantPid, 0)).toThrow();
        await new Promise((resolve) => setTimeout(resolve, 800));
        await expect(fs.access(sentinelPath)).rejects.toThrow();
      } finally {
        if (descendantPid > 0) {
          try {
            process.kill(descendantPid);
          } catch {
            // The expected path already terminated the descendant process.
          }
        }
      }
    });
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
