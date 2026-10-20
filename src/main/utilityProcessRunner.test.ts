import { describe, expect, it, vi } from "vite-plus/test";
import { serveProcessRunner, type ProcessHostRequest, type ProcessHostResponse } from "./processHostProtocol";
import type { ProcessInput, ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { UtilityProcessRunner, type ProcessHostConnection } from "./utilityProcessRunner";

interface FakeHost {
  connection: ProcessHostConnection;
  exit(): void;
}

/** Connects a runner to `serveProcessRunner` through cloned, asynchronous messages, as Electron does. */
function createFakeHost(runner: ProcessRunner): FakeHost {
  const toHost: Array<(message: ProcessHostRequest) => void> = [];
  const toMain: Array<(message: ProcessHostResponse) => void> = [];
  const exitListeners: Array<() => void> = [];
  let exited = false;
  serveProcessRunner({
    postMessage: (message) => {
      const copy = structuredClone(message);
      queueMicrotask(() => { if (!exited) toMain.forEach((listener) => listener(copy)); });
    },
    onMessage: (listener) => { toHost.push(listener); }
  }, runner);
  return {
    connection: {
      postMessage: (message) => {
        if (exited) throw new Error("Host exited.");
        const copy = structuredClone(message);
        queueMicrotask(() => toHost.forEach((listener) => listener(copy)));
      },
      onMessage: (listener) => { toMain.push(listener); },
      onExit: (listener) => { exitListeners.push(listener); }
    },
    exit: () => {
      exited = true;
      exitListeners.forEach((listener) => listener());
    }
  };
}

function unusedFallback(): ProcessRunner {
  return {
    run: vi.fn().mockRejectedValue(new Error("The fallback runner must not be used.")),
    runBinary: vi.fn().mockRejectedValue(new Error("The fallback runner must not be used."))
  };
}

describe("UtilityProcessRunner", () => {
  it("runs commands in the host and forwards their output and result", async () => {
    const hostRunner: ProcessRunner = {
      run: vi.fn(async (_command: string, _args: string[], options?: ProcessRunOptions) => {
        options?.onOutput?.({ stream: "stdout", text: "line\n" });
        return { exitCode: 0, stdout: "line\n", stderr: "", terminationReason: "exited" as const };
      })
    };
    const runner = new UtilityProcessRunner(async () => createFakeHost(hostRunner).connection, unusedFallback());
    const onOutput = vi.fn();

    const result = await runner.run("git", ["status"], { cwd: "D:\\Repo", env: { PATH: "C:\\Git" }, onOutput });

    expect(result).toEqual({ exitCode: 0, stdout: "line\n", stderr: "", terminationReason: "exited" });
    expect(onOutput).toHaveBeenCalledWith({ stream: "stdout", text: "line\n" });
    expect(hostRunner.run).toHaveBeenCalledWith("git", ["status"], expect.objectContaining({
      cwd: "D:\\Repo",
      env: { PATH: "C:\\Git" },
      signal: expect.any(AbortSignal)
    }));
  });

  it("starts one host for concurrent commands", async () => {
    const hostRunner: ProcessRunner = { run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }) };
    const createHost = vi.fn(async () => createFakeHost(hostRunner).connection);
    const runner = new UtilityProcessRunner(createHost, unusedFallback());

    runner.start();
    await Promise.all([runner.run("git", ["a"]), runner.run("git", ["b"]), runner.run("git", ["c"])]);

    expect(createHost).toHaveBeenCalledTimes(1);
    expect(hostRunner.run).toHaveBeenCalledTimes(3);
  });

  it("returns binary stdout as a Buffer", async () => {
    const hostRunner: ProcessRunner = {
      run: vi.fn(),
      runBinary: vi.fn().mockResolvedValue({ exitCode: 0, stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]), stderr: "" })
    };
    const runner = new UtilityProcessRunner(async () => createFakeHost(hostRunner).connection, unusedFallback());

    const result = await runner.runBinary("git", ["show", "HEAD:image.png"], { maxBytes: 16 });

    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(Buffer.from(result.stdout).toString("hex")).toBe("89504e47");
    expect(hostRunner.runBinary).toHaveBeenCalledWith("git", ["show", "HEAD:image.png"], expect.objectContaining({ maxBytes: 16 }));
  });

  it("forwards cancellation with the abort reason name", async () => {
    let hostSignal: AbortSignal | undefined;
    const hostRunner: ProcessRunner = {
      run: vi.fn((_command: string, _args: string[], options?: ProcessRunOptions) => new Promise<ProcessResult>((resolve) => {
        hostSignal = options?.signal;
        options?.signal?.addEventListener("abort", () => resolve({ exitCode: -1, stdout: "", stderr: "", terminationReason: "timedOut" }));
      }))
    };
    const runner = new UtilityProcessRunner(async () => createFakeHost(hostRunner).connection, unusedFallback());
    const controller = new AbortController();

    const execution = runner.run("git", ["fetch"], { signal: controller.signal });
    await vi.waitFor(() => expect(hostSignal).toBeDefined());
    controller.abort(new DOMException("Fetch exceeded its deadline.", "TimeoutError"));

    await expect(execution).resolves.toMatchObject({ terminationReason: "timedOut" });
    expect(hostSignal?.reason).toMatchObject({ name: "TimeoutError", message: "Fetch exceeded its deadline." });
  });

  it("passes an already aborted signal to the host before the command starts", async () => {
    const hostRunner: ProcessRunner = {
      run: vi.fn(async (_command: string, _args: string[], options?: ProcessRunOptions) => ({
        exitCode: -1,
        stdout: "",
        stderr: "",
        error: options?.signal?.aborted ? "Command was cancelled." : "Not cancelled.",
        terminationReason: "aborted" as const
      }))
    };
    const runner = new UtilityProcessRunner(async () => createFakeHost(hostRunner).connection, unusedFallback());
    const controller = new AbortController();
    controller.abort();

    await expect(runner.run("git", ["status"], { signal: controller.signal })).resolves.toMatchObject({ error: "Command was cancelled." });
  });

  it("forwards standard input written after the host reports it ready", async () => {
    const written: string[] = [];
    const hostRunner: ProcessRunner = {
      run: vi.fn((_command: string, _args: string[], options?: ProcessRunOptions) => new Promise<ProcessResult>((resolve) => {
        const input: ProcessInput = {
          write: (data) => { written.push(String(data)); return true; },
          end: (data) => {
            if (data !== undefined) written.push(String(data));
            resolve({ exitCode: 0, stdout: "", stderr: "" });
          }
        };
        options?.onInputReady?.(input);
      }))
    };
    const runner = new UtilityProcessRunner(async () => createFakeHost(hostRunner).connection, unusedFallback());

    await runner.run("codex", ["app-server"], {
      onInputReady: (input) => {
        input.write("{\"id\":1}\n");
        input.end("bye\n");
      }
    });

    expect(written).toEqual(["{\"id\":1}\n", "bye\n"]);
  });

  it("fails pending commands when the host exits and starts a new host for later commands", async () => {
    const hosts: FakeHost[] = [];
    const hostRunner: ProcessRunner = {
      run: vi.fn()
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" })
    };
    const runner = new UtilityProcessRunner(async () => {
      const host = createFakeHost(hostRunner);
      hosts.push(host);
      return host.connection;
    }, unusedFallback());

    const pending = runner.run("git", ["log"]);
    await vi.waitFor(() => expect(hostRunner.run).toHaveBeenCalledTimes(1));
    hosts[0]!.exit();

    await expect(pending).resolves.toMatchObject({ exitCode: -1, error: expect.stringContaining("process host stopped") });
    await expect(runner.run("git", ["status"])).resolves.toMatchObject({ exitCode: 0, stdout: "ok" });
    expect(hosts).toHaveLength(2);
  });

  it("runs commands in this process when the host cannot start", async () => {
    const fallback: ProcessRunner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "fallback", stderr: "" }),
      runBinary: vi.fn().mockResolvedValue({ exitCode: 0, stdout: new Uint8Array([1]), stderr: "" })
    };
    const createHost = vi.fn().mockRejectedValue(new Error("Utility processes are unavailable."));
    const runner = new UtilityProcessRunner(createHost, fallback);

    await expect(runner.run("git", ["status"], { cwd: "D:\\Repo" })).resolves.toMatchObject({ stdout: "fallback" });
    await expect(runner.runBinary("git", ["show"], { maxBytes: 4 })).resolves.toMatchObject({ exitCode: 0 });
    expect(fallback.run).toHaveBeenCalledWith("git", ["status"], { cwd: "D:\\Repo" });
    expect(fallback.runBinary).toHaveBeenCalledWith("git", ["show"], { maxBytes: 4 });
    // A failed start is retried by the next command rather than cached.
    expect(createHost).toHaveBeenCalledTimes(2);
  });
});
