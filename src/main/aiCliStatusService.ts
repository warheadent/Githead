import type { AiCliProvider, AiCliProviderStatus } from "../shared/types";
import { createCliProcessEnv } from "./cliEnvironment";
import { createCliInvocation } from "./cliInvocation";
import type { ProcessRunner } from "./processRunner";

const CLI_STATUS_TIMEOUT_MS = 2_000;
const CLI_STATUS_CACHE_MS = 30_000;

export class AiCliStatusService {
  private cached:
    | {
        checkedAt: number;
        status: Record<AiCliProvider, AiCliProviderStatus>;
      }
    | null = null;

  constructor(
    private readonly runner: ProcessRunner,
    private readonly now: () => number = () => Date.now()
  ) {}

  async getStatus(): Promise<Record<AiCliProvider, AiCliProviderStatus>> {
    const now = this.now();
    if (this.cached && now - this.cached.checkedAt < CLI_STATUS_CACHE_MS) {
      return this.cached.status;
    }

    const [
      codex,
      claude
    ] = await Promise.all([
      this.checkCodex(),
      this.checkClaude()
    ]);
    const status = {
      "codex-cli": codex,
      "claude-code": claude
    };
    this.cached = {
      checkedAt: now,
      status
    };

    return status;
  }

  private async checkCodex(): Promise<AiCliProviderStatus> {
    return this.checkCli({
      command: "codex",
      name: "Codex CLI",
      authArgs: [
        "login",
        "status"
      ]
    });
  }

  private async checkClaude(): Promise<AiCliProviderStatus> {
    return this.checkCli({
      command: "claude",
      name: "Claude Code",
      authArgs: [
        "auth",
        "status"
      ]
    });
  }

  private async checkCli({
    command,
    name,
    authArgs
  }: {
    command: "codex" | "claude";
    name: string;
    authArgs: string[];
  }): Promise<AiCliProviderStatus> {
    const env = createCliProcessEnv();
    const versionInvocation = createCliInvocation(command, [
      "--version"
    ]);
    const version = await this.runner.run(versionInvocation.command, versionInvocation.args, {
      env,
      timeoutMs: CLI_STATUS_TIMEOUT_MS
    });

    if (version.exitCode !== 0) {
      return {
        detected: false,
        authenticated: false,
        message: `${name} was not detected.`
      };
    }

    const authInvocation = createCliInvocation(command, authArgs);
    const auth = await this.runner.run(authInvocation.command, authInvocation.args, {
      env,
      timeoutMs: CLI_STATUS_TIMEOUT_MS
    });
    if (auth.exitCode === 0) {
      return {
        detected: true,
        authenticated: true,
        message: `${name} is authenticated.`
      };
    }

    return {
      detected: true,
      authenticated: false,
      message: `${name} is installed but not authenticated.`
    };
  }
}
