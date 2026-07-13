import { describe, expect, it, vi } from "vite-plus/test";
import { CancellableProcessRunner } from "./cancellableProcessRunner";
import type { ProcessRunner } from "./processRunner";

describe("CancellableProcessRunner", () => {
  it("forwards one contextual signal to nested text and binary processes", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
      runBinary: vi.fn().mockResolvedValue({ exitCode: 0, stdout: new Uint8Array(), stderr: "" })
    };
    const runner = new CancellableProcessRunner(delegate);
    const controller = new AbortController();

    await runner.runWithSignal(controller.signal, async () => {
      await Promise.all([
        runner.run("git", ["status"]),
        runner.runBinary("git", ["show"], { maxBytes: 10 })
      ]);
    });

    expect(delegate.run).toHaveBeenCalledWith("git", ["status"], { signal: controller.signal });
    expect(delegate.runBinary).toHaveBeenCalledWith("git", ["show"], { maxBytes: 10, signal: controller.signal });
  });

  it("preserves an explicitly supplied subprocess signal", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
    };
    const runner = new CancellableProcessRunner(delegate);
    const context = new AbortController();
    const explicit = new AbortController();

    await runner.runWithSignal(context.signal, () => runner.run("git", ["status"], { signal: explicit.signal }));

    expect(delegate.run).toHaveBeenCalledWith("git", ["status"], { signal: explicit.signal });
  });
});
