import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NodeProcessRunner, type ProcessInput, type ProcessRunOptions } from "./processRunner";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function createChild() {
  return Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true)
  });
}

function writeError(code = "EOF") {
  return Object.assign(new Error(`write ${code}`), { code, syscall: "write" });
}

describe("NodeProcessRunner stdin lifecycle", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  let child: ReturnType<typeof createChild>;
  let killer: ReturnType<typeof createChild>;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    child = createChild();
    killer = createChild();
    vi.mocked(spawn).mockReset()
      .mockReturnValueOnce(child as unknown as ChildProcessWithoutNullStreams)
      .mockReturnValue(killer as unknown as ChildProcessWithoutNullStreams);
  });

  afterEach(() => {
    for (const process of [child, killer]) {
      process.stdin.destroy();
      process.stdout.destroy();
      process.stderr.destroy();
    }
    Object.defineProperty(process, "platform", platform);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function exitChild(code = 0) {
    child.exitCode = code;
    child.emit("exit", code);
    child.emit("close", code);
  }

  function start(options: ProcessRunOptions = {}) {
    return new NodeProcessRunner(25, 25).run("git", ["status"], options);
  }

  it.each(["EOF", "EPIPE", "ECONNRESET"])("reports unexpected %s before exit and stops the child", async (code) => {
    const controller = new AbortController();
    const run = start({ signal: controller.signal });
    child.stdin.emit("error", writeError(code));
    expect(spawn).toHaveBeenLastCalledWith("taskkill", ["/pid", "123", "/T", "/F"], {
      windowsHide: true, stdio: "ignore"
    });
    // A later cancellation must not hide the earlier write failure.
    controller.abort();
    exitChild();
    child.stdin.emit("close");
    killer.emit("close", 0);

    await expect(run).resolves.toMatchObject({
      exitCode: -1,
      terminationReason: "exited",
      error: `Command stdin failed: write ${code}`
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for stdin errors after process close before reporting success", async () => {
    const run = start();
    const completed = vi.fn();
    void run.then(completed);
    exitChild();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    child.stdin.emit("error", writeError());
    child.stdin.emit("close");
    await expect(run).resolves.toMatchObject({
      exitCode: -1, terminationReason: "exited", error: "Command stdin failed: write EOF"
    });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it.each(["before exit", "after process close", "after settlement"])("preserves cancellation with EOF %s and taskkill exit 128", async (timing) => {
    const controller = new AbortController();
    const run = start({ signal: controller.signal });
    const completed = vi.fn();
    void run.then(completed);
    controller.abort();
    if (timing === "before exit") child.stdin.emit("error", writeError());
    exitChild();
    if (timing === "after process close") child.stdin.emit("error", writeError());
    child.stdin.emit("close");
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    killer.emit("close", 128);
    const result = await run;
    if (timing === "after settlement") child.stdin.emit("error", writeError());

    expect(result).toMatchObject({
      exitCode: 0, terminationReason: "aborted", error: "Command was cancelled."
    });
    expect(child.kill).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a timeout when killing the child breaks a pending write", async () => {
    const run = start({ timeoutMs: 10 });
    vi.advanceTimersByTime(10);
    child.stdin.emit("error", writeError());
    killer.emit("close", 128);
    expect(child.kill).toHaveBeenCalledTimes(1);
    exitChild();
    child.stdin.emit("close");

    await expect(run).resolves.toMatchObject({
      terminationReason: "timedOut", error: "Command timed out after 10ms."
    });
  });

  it("preserves output-limit failure when stdin subsequently fails", async () => {
    const run = start({ maxOutputBytes: 1 });
    child.stdout.emit("data", Buffer.from("too much"));
    child.stdin.emit("error", writeError());
    exitChild();
    child.stdin.emit("close");
    killer.emit("close", 0);

    await expect(run).resolves.toMatchObject({
      exitCode: -1, terminationReason: "outputLimit", exceededLimit: true,
      error: expect.stringContaining("stdout exceeded")
    });
  });

  it("preserves the spawn error when closing stdin also fails", async () => {
    const run = start({ stdin: "data" });
    child.exitCode = -2;
    child.emit("error", new Error("spawn git ENOENT"));
    child.stdin.emit("error", writeError());
    child.stdin.emit("close");

    await expect(run).resolves.toMatchObject({
      exitCode: -1, terminationReason: "spawnFailed", error: "spawn git ENOENT"
    });
  });

  it("handles an error from the initial buffered input", async () => {
    vi.spyOn(child.stdin, "end").mockImplementation(() => {
      child.stdin.emit("error", writeError());
      return child.stdin;
    });
    const run = start({ stdin: "payload" });
    exitChild();
    child.stdin.emit("close");
    killer.emit("close", 0);

    await expect(run).resolves.toMatchObject({
      exitCode: -1, error: "Command stdin failed: write EOF"
    });
  });

  it("handles stdin errors for binary output too", async () => {
    const run = new NodeProcessRunner().runBinary("git", ["cat-file"], { maxBytes: 10, stdin: "data" });
    exitChild();
    child.stdin.emit("error", writeError());
    child.stdin.emit("close");

    await expect(run).resolves.toMatchObject({
      exitCode: -1, stdout: Buffer.alloc(0), error: "Command stdin failed: write EOF"
    });
  });

  it("stops response-driven writes on cancellation and after settlement", async () => {
    const controller = new AbortController();
    let input!: ProcessInput;
    const run = start({ signal: controller.signal, onInputReady: (ready) => { input = ready; } });
    const write = vi.spyOn(child.stdin, "write");
    const end = vi.spyOn(child.stdin, "end");
    controller.abort();
    expect(input.write("late response")).toBe(false);
    input.end("late response");
    exitChild();
    child.stdin.emit("close");
    killer.emit("close", 0);
    await run;
    expect(input.write("later response")).toBe(false);
    input.end("later response");
    expect(write).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
