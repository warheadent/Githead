import type { GitExecutableStatus } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const GIT_EXECUTABLE_CHECK_TIMEOUT_MS = 2_000;
const GIT_EXECUTABLE_CHECK_DEADLINE_MS = 5_000;
const GIT_EXECUTABLE_CHECK_OUTPUT_LIMIT_BYTES = 4 * 1024;
const GIT_EXECUTABLE_CHECK_EXPIRED = Symbol("git-executable-check-expired");

export class GitExecutableService {
  constructor(private readonly runner: ProcessRunner) {}

  async getStatus(): Promise<GitExecutableStatus> {
    const controller = new AbortController();
    let deadline: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      this.runner.run("git", ["--version"], {
        timeoutMs: GIT_EXECUTABLE_CHECK_TIMEOUT_MS,
        maxOutputBytes: GIT_EXECUTABLE_CHECK_OUTPUT_LIMIT_BYTES,
        signal: controller.signal
      }),
      new Promise<typeof GIT_EXECUTABLE_CHECK_EXPIRED>((resolve) => {
        deadline = setTimeout(() => {
          controller.abort(new DOMException("Git executable check exceeded its deadline.", "TimeoutError"));
          resolve(GIT_EXECUTABLE_CHECK_EXPIRED);
        }, GIT_EXECUTABLE_CHECK_DEADLINE_MS);
        deadline.unref();
      })
    ]).finally(() => {
      if (deadline) clearTimeout(deadline);
    });

    if (result === GIT_EXECUTABLE_CHECK_EXPIRED) {
      return {
        available: false,
        reason: "unavailable"
      };
    }

    if (result.exitCode === 0) {
      return {
        available: true,
        version: result.stdout.trim()
      };
    }

    if (result.terminationReason === "spawnFailed") {
      return {
        available: false,
        reason: "not-found"
      };
    }

    return {
      available: false,
      reason: "unavailable"
    };
  }
}
