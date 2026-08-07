import { describe, expect, it, vi } from "vite-plus/test";
import type { BinaryProcessResult, ProcessResult, ProcessRunner } from "./processRunner";
import { PerformanceDiagnostics } from "./performanceDiagnostics";
import {
  classifyPerformanceCommand,
  InstrumentedProcessRunner
} from "./instrumentedProcessRunner";

describe("InstrumentedProcessRunner", () => {
  it("classifies commands without returning command data", () => {
    expect(classifyPerformanceCommand("C:\\Tools\\git.exe", ["status"])).toBe("git");
    expect(classifyPerformanceCommand("lore", ["status"])).toBe("lore");
    expect(classifyPerformanceCommand("gh", ["pr", "list"])).toBe("github");
    expect(classifyPerformanceCommand("cmd.exe", ["/d", "/c", "codex", "exec"])).toBe("ai");
    expect(classifyPerformanceCommand("powershell.exe", ["-Command", "secret command"])).toBe("configured-action");
    expect(classifyPerformanceCommand("private-tool", ["private-argument"])).toBe("other");
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
