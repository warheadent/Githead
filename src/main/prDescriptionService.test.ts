import { describe, expect, it } from "vitest";
import type { AiApiKeyProvider, AiCommitMessageProvider, AiSettings } from "../shared/types";
import { DEFAULT_AI_PROVIDER_MODELS, type AiSettingsService } from "./aiSettingsService";
import type { GitBranchRangeContext, GitService } from "./gitService";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { PrDescriptionService } from "./prDescriptionService";

class FakeAiSettingsService {
  constructor(
    private readonly settings: AiSettings,
    private readonly apiKeys: Partial<Record<AiApiKeyProvider, string>>
  ) {}

  async getSettings(): Promise<AiSettings> {
    return this.settings;
  }

  async getApiKey(provider: AiApiKeyProvider): Promise<string | null> {
    return this.apiKeys[provider] ?? null;
  }
}

class FakeGitService {
  readonly calls: Array<{ repoPath: string; baseRef: string; headRef: string }> = [];

  constructor(private readonly context: GitBranchRangeContext) {}

  async getBranchRangeContext(request: { repoPath: string; baseRef: string; headRef: string }): Promise<GitBranchRangeContext> {
    this.calls.push(request);
    return this.context;
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options: ProcessRunOptions | undefined }> = [];

  constructor(private readonly result: ProcessResult = {
    exitCode: 0,
    stdout: "## Summary\nGenerated from CLI.",
    stderr: ""
  }) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({ command, args, options });
    return this.result;
  }
}

interface FetchCall {
  url: string;
  init?: RequestInit | undefined;
}

const baseSettings: AiSettings = {
  selectedProvider: "openrouter",
  providers: {
    openrouter: {
      model: "openrouter/auto",
      prDescriptionModel: "",
      hasApiKey: true
    },
    openai: {
      model: DEFAULT_AI_PROVIDER_MODELS.openai,
      prDescriptionModel: "",
      hasApiKey: true
    },
    anthropic: {
      model: DEFAULT_AI_PROVIDER_MODELS.anthropic,
      prDescriptionModel: "",
      hasApiKey: true
    },
    "codex-cli": {
      model: DEFAULT_AI_PROVIDER_MODELS["codex-cli"],
      prDescriptionModel: "",
      hasApiKey: false
    },
    "claude-code": {
      model: DEFAULT_AI_PROVIDER_MODELS["claude-code"],
      prDescriptionModel: "",
      hasApiKey: false
    }
  },
  cliStatus: {
    "codex-cli": {
      detected: true,
      authenticated: true,
      message: "Codex CLI is authenticated."
    },
    "claude-code": {
      detected: true,
      authenticated: true,
      message: "Claude Code is authenticated."
    }
  },
  commitMessagePrompt: "Write a commit message.",
  prDescriptionPrompt: "Write a pull request description."
};

function createSettings(provider: AiCommitMessageProvider, patch: Partial<AiSettings> = {}): AiSettings {
  return {
    ...baseSettings,
    selectedProvider: provider,
    ...patch
  };
}

function createFetch(payload: unknown): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init
    });

    return new Response(JSON.stringify(payload), {
      status: 200
    });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls
  };
}

function createRangeContext(params: { diff?: string; log?: string } = {}): GitBranchRangeContext {
  return {
    diff: {
      repoPath: "D:\\Repo",
      exitCode: 0,
      stdout: params.diff ?? "diff --git a/a.ts b/a.ts\n+added\n",
      stderr: ""
    },
    log: {
      repoPath: "D:\\Repo",
      exitCode: 0,
      stdout: params.log ?? "- Add generated pull request descriptions\n",
      stderr: ""
    }
  };
}

function createService(params: {
  provider?: AiCommitMessageProvider;
  settings?: AiSettings;
  context?: GitBranchRangeContext;
  response?: unknown;
  runner?: ProcessRunner;
}): { service: PrDescriptionService; calls: FetchCall[]; gitService: FakeGitService; runner: ProcessRunner } {
  const provider = params.provider ?? "openrouter";
  const fetchState = createFetch(params.response ?? {
    choices: [
      {
        message: {
          content: "## Summary\nGenerated description."
        }
      }
    ]
  });
  const gitService = new FakeGitService(params.context ?? createRangeContext());
  const runner = params.runner ?? new FakeProcessRunner();

  return {
    service: new PrDescriptionService(
      gitService as unknown as GitService,
      new FakeAiSettingsService(
        params.settings ?? createSettings(provider),
        {
          openrouter: "sk-or-key",
          openai: "sk-openai",
          anthropic: "sk-ant"
        }
      ) as unknown as AiSettingsService,
      fetchState.fetch,
      runner
    ),
    calls: fetchState.calls,
    gitService,
    runner
  };
}

describe("PrDescriptionService", () => {
  it("generates a pull request title with the commit message model", async () => {
    const { service, calls } = createService({
      settings: createSettings("openrouter", {
        providers: {
          ...baseSettings.providers,
          openrouter: {
            ...baseSettings.providers.openrouter,
            model: "openrouter/commit-model",
            prDescriptionModel: "openrouter/pr-description-model"
          }
        }
      }),
      response: {
        choices: [
          {
            message: {
              content: "\"Add pull request creation\""
            }
          }
        ]
      }
    });

    await expect(service.generatePrTitle({
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "Add pull request creation"
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe("openrouter/commit-model");
    expect(body.max_tokens).toBe(120);
    expect(body.messages.at(-1)?.content).toContain("Write a clear GitHub pull request title");
    expect(body.messages.at(-1)?.content).toContain("- Add generated pull request descriptions");
    expect(body.messages.at(-1)?.content).toContain("+added");
  });

  it("uses the PR description model override when configured", async () => {
    const { service, calls, gitService } = createService({
      settings: createSettings("openrouter", {
        providers: {
          ...baseSettings.providers,
          openrouter: {
            ...baseSettings.providers.openrouter,
            prDescriptionModel: "anthropic/claude-sonnet-4"
          }
        }
      })
    });

    await expect(service.generatePrDescription({
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog",
      title: "Create pull requests"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "## Summary\nGenerated description."
    });

    expect(gitService.calls).toEqual([{
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog"
    }]);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe("anthropic/claude-sonnet-4");
    expect(body.max_tokens).toBe(2_000);
    expect(body.messages.at(-1)?.content).toContain("Pull request title: Create pull requests");
    expect(body.messages.at(-1)?.content).toContain("- Add generated pull request descriptions");
    expect(body.messages.at(-1)?.content).toContain("+added");
  });

  it("falls back to the commit message model when the PR model is blank", async () => {
    const { service, calls } = createService({});

    await service.generatePrDescription({
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog"
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as { model: string };
    expect(body.model).toBe("openrouter/auto");
  });

  it("fails before calling providers when the branch range is empty", async () => {
    const runner = new FakeProcessRunner();
    const { service, calls } = createService({
      context: createRangeContext({
        diff: "",
        log: ""
      }),
      runner
    });

    const result = await service.generatePrDescription({
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "No commits found between origin/main and feature/pr-dialog."
    });
    expect(calls).toHaveLength(0);
    expect(runner.calls).toHaveLength(0);
  });

  it("fails before spawning unauthenticated CLI providers", async () => {
    const runner = new FakeProcessRunner();
    const { service } = createService({
      provider: "codex-cli",
      settings: createSettings("codex-cli", {
        cliStatus: {
          ...baseSettings.cliStatus,
          "codex-cli": {
            detected: true,
            authenticated: false,
            message: "Codex CLI is installed but not authenticated."
          }
        }
      }),
      runner
    });

    await expect(service.generatePrDescription({
      repoPath: "D:\\Repo",
      baseRef: "origin/main",
      headRef: "feature/pr-dialog"
    })).resolves.toMatchObject({
      exitCode: -1,
      stderr: "Codex CLI is not authenticated."
    });
    expect(runner.calls).toHaveLength(0);
  });
});
