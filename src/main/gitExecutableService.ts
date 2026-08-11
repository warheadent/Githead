import type { GitExecutableStatus } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const GIT_EXECUTABLE_CHECK_TIMEOUT_MS = 2_000;
const GIT_EXECUTABLE_CHECK_OUTPUT_LIMIT_BYTES = 4 * 1024;

export class GitExecutableService {
  constructor(private readonly runner: ProcessRunner) {}

  async getStatus(): Promise<GitExecutableStatus> {
    const result = await this.runner.run("git", ["--version"], {
      timeoutMs: GIT_EXECUTABLE_CHECK_TIMEOUT_MS,
      maxOutputBytes: GIT_EXECUTABLE_CHECK_OUTPUT_LIMIT_BYTES
    });

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
