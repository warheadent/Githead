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

  it("combines explicitly supplied and contextual subprocess signals", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
    };
    const runner = new CancellableProcessRunner(delegate);
    const context = new AbortController();
    const explicit = new AbortController();

    await runner.runWithSignal(context.signal, () => runner.run("git", ["status"], { signal: explicit.signal }));

    const signal = vi.mocked(delegate.run).mock.calls[0]?.[2]?.signal;
    expect(signal).toBeDefined();
    expect(signal).not.toBe(explicit.signal);
    expect(signal).not.toBe(context.signal);

    const reason = new DOMException("Owner released.", "AbortError");
    context.abort(reason);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(reason);
  });

  it("keeps the first reason when the explicit signal aborts first", async () => {
    const delegate: ProcessRunner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
    };
    const runner = new CancellableProcessRunner(delegate);
    const context = new AbortController();
    const explicit = new AbortController();

    await runner.runWithSignal(context.signal, () => runner.run("git", ["status"], { signal: explicit.signal }));
    const signal = vi.mocked(delegate.run).mock.calls[0]?.[2]?.signal;
    const reason = new DOMException("Request cancelled.", "AbortError");
    explicit.abort(reason);
    context.abort(new DOMException("Owner released.", "AbortError"));

    expect(signal?.reason).toBe(reason);
  });
});
