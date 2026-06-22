import { describe, expect, it } from "vitest";
import { AiCliStatusService } from "./aiCliStatusService";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options: ProcessRunOptions | undefined }> = [];

  constructor(private readonly responses: ProcessResult[]) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({
      command,
      args,
      options
    });

    return this.responses.shift() ?? {
      exitCode: -1,
      stdout: "",
      stderr: "",
      error: "missing response"
    };
  }
}

function result(exitCode: number): ProcessResult {
  return {
    exitCode,
    stdout: "",
    stderr: ""
  };
}

describe("AiCliStatusService", () => {
  it("detects missing executables", async () => {
    const runner = new FakeProcessRunner([
      result(-1),
      result(-1)
    ]);
    const service = new AiCliStatusService(runner);

    await expect(service.getStatus()).resolves.toMatchObject({
      "codex-cli": {
        detected: false,
        authenticated: false
      },
      "claude-code": {
        detected: false,
        authenticated: false
      }
    });
  });

  it("detects installed but unauthenticated CLIs", async () => {
    const runner = new FakeProcessRunner([
      result(0),
      result(0),
      result(1),
      result(1)
    ]);
    const service = new AiCliStatusService(runner);

    await expect(service.getStatus()).resolves.toMatchObject({
      "codex-cli": {
        detected: true,
        authenticated: false
      },
      "claude-code": {
        detected: true,
        authenticated: false
      }
    });
  });

  it("detects authenticated CLIs", async () => {
    const runner = new FakeProcessRunner([
      result(0),
      result(0),
      result(0),
      result(0)
    ]);
    const service = new AiCliStatusService(runner);

    await expect(service.getStatus()).resolves.toMatchObject({
      "codex-cli": {
        detected: true,
        authenticated: true
      },
      "claude-code": {
        detected: true,
        authenticated: true
      }
    });
  });

  it("caches status for 30 seconds", async () => {
    let now = 1_000;
    const runner = new FakeProcessRunner([
      result(0),
      result(0),
      result(0),
      result(0),
      result(-1),
      result(-1)
    ]);
    const service = new AiCliStatusService(runner, () => now);

    await service.getStatus();
    await service.getStatus();
    expect(runner.calls).toHaveLength(4);

    now += 31_000;
    await service.getStatus();
    expect(runner.calls).toHaveLength(6);
  });

  it("uses short timeouts for detection and auth checks", async () => {
    const runner = new FakeProcessRunner([
      result(0),
      result(0),
      result(0),
      result(0)
    ]);
    const service = new AiCliStatusService(runner);

    await service.getStatus();

    expect(runner.calls.every((call) => call.options?.timeoutMs === 2_000)).toBe(true);
  });
});
