import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { configureOperationalErrorReporter, type OperationalErrorSink } from "./operationalErrorReporter";
import type { BinaryProcessResult, ProcessResult, ProcessRunner } from "./processRunner";
import { PerformanceDiagnostics } from "./performanceDiagnostics";
import {
  classifyPerformanceCommand,
  classifyProcessFailure,
  InstrumentedProcessRunner
} from "./instrumentedProcessRunner";

afterEach(() => configureOperationalErrorReporter(null));

describe("InstrumentedProcessRunner", () => {
  it("raises an issue for a spawn failure but only counts a missing executable", async () => {
    const sink: OperationalErrorSink = {
      addBreadcrumb: vi.fn(),
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      countMetric: vi.fn()
    };
    configureOperationalErrorReporter(sink);
    const spawnFailure = (spawnErrorCode: string): ProcessResult => ({
      exitCode: -1, stdout: "", stderr: "", error: `spawn ${spawnErrorCode}`, terminationReason: "spawnFailed", spawnErrorCode
    });
    const delegate: ProcessRunner = {
      run: vi.fn(async (command: string) => spawnFailure(command === "claude" ? "ENOENT" : "EACCES"))
    };
    const runner = new InstrumentedProcessRunner(delegate, new PerformanceDiagnostics({ now: () => 1 }));

    await runner.run("claude", ["--version"]);
    expect(sink.countMetric).toHaveBeenCalledWith("githead.operation.failure", expect.objectContaining({ category: "not-found", command_kind: "ai" }));
    expect(sink.captureMessage).not.toHaveBeenCalled();

    await runner.run("bash", ["-lc", "private command"]);
    expect(sink.captureMessage).toHaveBeenCalledWith("Githead operational failure", expect.objectContaining({
      level: "error",
      tags: expect.objectContaining({ category: "spawn-failed", command_kind: "configured-action" })
    }));
  });

  it("classifies commands without returning command data", () => {
    expect(classifyPerformanceCommand("C:\\Tools\\git.exe", ["status"])).toBe("git");
    expect(classifyPerformanceCommand("lore", ["status"])).toBe("lore");
    expect(classifyPerformanceCommand("gh", ["pr", "list"])).toBe("github");
    expect(classifyPerformanceCommand("cmd.exe", ["/d", "/c", "codex", "exec"])).toBe("ai");
    expect(classifyPerformanceCommand("powershell.exe", ["-Command", "secret command"])).toBe("configured-action");
    expect(classifyPerformanceCommand("private-tool", ["private-argument"])).toBe("other");
  });

  it("classifies common process failures without retaining output", () => {
    expect(classifyProcessFailure("git", "CONFLICT (content): merge conflict")).toBe("conflict");
    expect(classifyProcessFailure("git", "fatal: Authentication failed for a private remote")).toBe("authentication");
    expect(classifyProcessFailure("git", "fatal: unable to access remote: Could not resolve host")).toBe("network");
    expect(classifyProcessFailure("git", "fatal: an unusual repository failure")).toBe("process-exit");
    expect(classifyProcessFailure("configured-action", "CONFLICT private output")).toBe("process-exit");
  });

  it("records text output, outcome, duration, and active depth", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn(async (): Promise<ProcessResult> => ({
        exitCode: 0,
        stdout: "é",
        stderr: "x",
        terminationReason: "exited"
      }))
    };
    const diagnostics = new PerformanceDiagnostics({ now: () => 1 });
    const times = [10, 35];
    const runner = new InstrumentedProcessRunner(delegate, diagnostics, {
      now: () => times.shift() ?? 35
    });

    await expect(runner.run("git", ["-C", "private-path", "status"])).resolves.toMatchObject({ exitCode: 0 });

    const session = diagnostics.openSession();
    const snapshot = session.snapshot();
    session.close();
    expect(snapshot.samples).toEqual([
      expect.objectContaining({ type: "queue", queueDepth: 1 }),
      expect.objectContaining({
        type: "command",
        commandKind: "git",
        durationMs: 25,
        outcome: "success",
        outputBytes: 3,
        queueDepth: 1
      }),
      expect.objectContaining({ type: "queue", queueDepth: 0 })
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/private-path|status/);
  });

  it("records rejected and truncated operations", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn(async () => { throw new Error("failure"); }),
      runBinary: vi.fn(async (): Promise<BinaryProcessResult> => ({
        exitCode: -1,
        stdout: new Uint8Array([1, 2]),
        stderr: "x",
        exceededLimit: true,
        terminationReason: "outputLimit"
      }))
    };
    const diagnostics = new PerformanceDiagnostics({ now: () => 1 });
    const runner = new InstrumentedProcessRunner(delegate, diagnostics, { now: () => 10 });

    await expect(runner.run("private-tool", [])).rejects.toThrow("failure");
    await expect(runner.runBinary("git", [], { maxBytes: 2 })).resolves.toMatchObject({ exceededLimit: true });
    expect(runner.activeProcessDepth).toBe(0);

    const session = diagnostics.openSession();
    const commandSamples = session.snapshot().samples.filter((sample) => sample.type === "command");
    session.close();
    expect(commandSamples).toEqual([
      expect.objectContaining({ commandKind: "other", outcome: "rejected", outputBytes: 0 }),
      expect.objectContaining({ commandKind: "git", outcome: "truncated", outputBytes: 3 })
    ]);
  });
});
