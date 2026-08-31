import { describe, expect, it } from "vite-plus/test";
import type { AiApiKeyProvider, AiCommitMessageProvider, AiSettings } from "../shared/types";
import { CommitMessageService, type AiReasoningCapabilityResolver } from "./commitMessageService";
import { DEFAULT_AI_PROVIDER_MODELS, type AiSettingsService } from "./aiSettingsService";
import { createCliInvocation } from "./cliInvocation";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";

class FakeAiSettingsService {
  generationSettingsCalls = 0;

  constructor(
    private readonly settings: AiSettings,
    private readonly apiKeys: Partial<Record<AiApiKeyProvider, string>>
  ) {}

  async getSettings(): Promise<AiSettings> {
    return this.settings;
  }

  async getGenerationSettings(): Promise<AiSettings> {
    this.generationSettingsCalls += 1;
    return this.settings;
  }

  async getApiKey(provider: AiApiKeyProvider): Promise<string | null> {
    return this.apiKeys[provider] ?? null;
  }
}

class FakeGitService {
  private readCount = 0;

  constructor(private readonly stdout: string | string[], private readonly exitCode = 0) {}

  async getStagedDiff(repoPath: string) {
    const stdout = Array.isArray(this.stdout)
      ? this.stdout[Math.min(this.readCount, this.stdout.length - 1)] ?? ""
      : this.stdout;
    this.readCount += 1;
    return {
      repoPath,
      exitCode: this.exitCode,
      stdout,
      stderr: this.exitCode === 0 ? "" : "fatal: failed"
    };
  }

  async getStashDiff(repoPath: string) {
    return this.getStagedDiff(repoPath);
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[]; options: ProcessRunOptions | undefined }> = [];

  constructor(private readonly result: ProcessResult = {
    exitCode: 0,
    stdout: "feat: add generated commit messages",
    stderr: ""
  }) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({
      command,
      args,
      options
    });

    return this.result;
  }
}

interface FetchCall {
  url: string;
  init?: RequestInit | undefined;
}

const baseSettings: AiSettings = {
  selectedProvider: "openrouter",
  commitPlanGranularity: "file",
  providers: {
    openrouter: {
      model: "openrouter/auto",
      prDescriptionModel: "",
      reasoningEffort: "low",
      commitPlanReasoningEffort: "low",
      prDescriptionReasoningEffort: "low",
      hasApiKey: true
    },
    openai: {
      model: DEFAULT_AI_PROVIDER_MODELS.openai,
      prDescriptionModel: "",
      reasoningEffort: "low",
      commitPlanReasoningEffort: "low",
      prDescriptionReasoningEffort: "low",
      hasApiKey: true
    },
    "codex-cli": {
      model: DEFAULT_AI_PROVIDER_MODELS["codex-cli"],
      prDescriptionModel: "",
      reasoningEffort: "low",
      commitPlanReasoningEffort: "low",
      prDescriptionReasoningEffort: "low",
      hasApiKey: false
    },
    anthropic: {
      model: DEFAULT_AI_PROVIDER_MODELS.anthropic,
      prDescriptionModel: "",
      reasoningEffort: "low",
      commitPlanReasoningEffort: "low",
      prDescriptionReasoningEffort: "low",
      hasApiKey: true
    },
    "claude-code": {
      model: DEFAULT_AI_PROVIDER_MODELS["claude-code"],
      prDescriptionModel: "",
      reasoningEffort: "low",
      commitPlanReasoningEffort: "low",
      prDescriptionReasoningEffort: "low",
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
  commitMessagePrompt: [
    "Write a project-specific Git commit message.",
    "Prefer Conventional Commits."
  ].join("\n"),
  prDescriptionPrompt: "Write a pull request description.",
  sourceControlWritingStyle: { mode: "conventional_commits", customInstructions: "" }
};

function createSettings(provider: AiCommitMessageProvider, patch: Partial<AiSettings> = {}): AiSettings {
  return {
    ...baseSettings,
    selectedProvider: provider,
    ...patch
  };
}

function createFetch(
  payload: unknown,
  options: { ok?: boolean; status?: number; payloads?: unknown[] } = {}
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init
    });

    const responsePayload = options.payloads?.[calls.length - 1] ?? payload;
    return new Response(JSON.stringify(responsePayload), {
      status: options.status ?? (options.ok === false ? 400 : 200)
    });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls
  };
}

function createService(params: {
  provider?: AiCommitMessageProvider;
  settings?: AiSettings;
  diff?: string | string[];
  apiKeys?: Partial<Record<AiApiKeyProvider, string>>;
  response?: unknown;
  responses?: unknown[];
  responseOk?: boolean;
  runner?: ProcessRunner;
  reasoningCapabilities?: AiReasoningCapabilityResolver;
}): { service: CommitMessageService; calls: FetchCall[]; runner: ProcessRunner; settingsService: FakeAiSettingsService } {
  const provider = params.provider ?? "openrouter";
  const fetchState = createFetch(params.response ?? {
    choices: [
      {
        message: {
          content: "feat: add generated commit messages"
        }
      }
    ]
  }, {
    ...(params.responseOk === undefined ? {} : { ok: params.responseOk }),
    ...(params.responses ? { payloads: params.responses } : {})
  });
  const runner = params.runner ?? new FakeProcessRunner();
  const settingsService = new FakeAiSettingsService(
    params.settings ?? createSettings(provider),
    params.apiKeys ?? {
      openrouter: "sk-or-key",
      openai: "sk-openai",
      anthropic: "sk-ant"
    }
  );

  return {
    service: new CommitMessageService(
      () => new FakeGitService(params.diff ?? "diff --git a/a.ts b/a.ts\n+added\n"),
      settingsService as unknown as AiSettingsService,
      fetchState.fetch,
      runner,
      params.reasoningCapabilities ?? {
        getCapabilities: async () => ({
          status: "supported",
          supportedEfforts: ["low", "medium", "high"]
        })
      }
    ),
    calls: fetchState.calls,
    runner,
    settingsService
  };
}

describe("CommitMessageService", () => {
  it("reports whether the staged diff changed during commit message generation", async () => {
    const unchanged = createService({
      diff: ["diff --git a/a.ts b/a.ts\n+added\n", "diff --git a/a.ts b/a.ts\n+added\n"]
    });
    const changed = createService({
      diff: ["diff --git a/a.ts b/a.ts\n+before\n", "diff --git a/a.ts b/a.ts\n+after\n"]
    });

    await expect(unchanged.service.generateCommitMessage({ repoPath: "D:\\Repo" }))
      .resolves.toMatchObject({ exitCode: 0, sourceChanged: false });
    await expect(changed.service.generateCommitMessage({ repoPath: "D:\\Repo" }))
      .resolves.toMatchObject({ exitCode: 0, sourceChanged: true });
  });

  it("passes cancellation to reasoning capability lookup", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const { service } = createService({
      reasoningCapabilities: {
        getCapabilities: async (_request, signal?: AbortSignal) => {
          receivedSignal = signal;
          return { status: "supported", supportedEfforts: ["low"] };
        }
      }
    });

    await expect(service.generateCommitMessage({ repoPath: "D:\\Repo" }, controller.signal))
      .resolves.toMatchObject({ exitCode: 0 });

    expect(receivedSignal).toBe(controller.signal);
  });

  it("uses the generation settings path", async () => {
    const { service, settingsService } = createService({});

    await expect(service.generateCommitMessage({ repoPath: "D:\\Repo" }))
      .resolves.toMatchObject({ exitCode: 0 });

    expect(settingsService.generationSettingsCalls).toBe(1);
  });

  it("does not convert cancellation into a failed operation result", async () => {
    const { service } = createService({});
    const controller = new AbortController();
    const abortReason = new DOMException("Generation cancelled.", "AbortError");
    controller.abort(abortReason);

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    }, controller.signal)).rejects.toBe(abortReason);
  });

  it("builds an OpenRouter chat completion request from the staged diff", async () => {
    const { service, calls } = createService({});

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "feat: add generated commit messages"
    });
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]?.init?.headers).toMatchObject({
      "Authorization": "Bearer sk-or-key",
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/warheadent/Githead#readme",
      "X-Title": "Githead"
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      service_tier: string;
      reasoning: { effort: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("openrouter/auto");
    expect(body.service_tier).toBe("flex");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.messages.at(-1)?.content).toContain("+added");
    expect(body.messages[0]?.content).toContain("Return exactly the commit message text");
    expect(body.messages.at(-1)?.content).toContain("Write a concise Git commit message for the staged changes.");
  });

  it("builds a one-line stash message request from the selected stash scope", async () => {
    const { service, calls } = createService({
      response: { choices: [{ message: { content: "refactor cache cleanup\n\nextra text" } }] }
    });

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo",
      stashSelection: {
        scope: "selected",
        paths: ["src/cache.ts"],
        includeUntracked: false,
        keepIndex: false
      }
    });

    expect(result.stdout).toBe("refactor cache cleanup");
    const body = JSON.parse(String(calls[0]?.init?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[0]?.content).toContain("Return exactly the stash message text");
    expect(body.messages.at(-1)?.content).toContain("Write a concise Git stash message for these changes.");
    expect(body.messages.at(-1)?.content).toContain("Stash diff:");
  });

  it("retries an empty OpenRouter length response once with a larger limit", async () => {
    const { service, calls } = createService({
      responses: [
        {
          choices: [{
            finish_reason: "length",
            message: { content: "" }
          }]
        },
        {
          choices: [{
            finish_reason: "stop",
            message: { content: "fix: complete generation after retry" }
          }]
        }
      ]
    });

    await expect(service.generateCommitMessage({ repoPath: "D:\\Repo" })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "fix: complete generation after retry",
      stderr: "The first generation reached its output limit. Githead retried with a larger limit."
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ max_tokens: 1_024 });
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({ max_tokens: 2_048 });
  });

  it("rejects partial text when OpenRouter reports a length stop", async () => {
    const { service, calls } = createService({
      response: {
        choices: [{
          finish_reason: "length",
          message: { content: "fix: incomplete" }
        }]
      }
    });

    await expect(service.generateCommitMessage({ repoPath: "D:\\Repo" })).resolves.toMatchObject({
      exitCode: -1,
      stdout: "",
      stderr: "The model reached its output limit before it returned a complete result."
    });
    expect(calls).toHaveLength(1);
  });

  it("recognizes OpenAI and Anthropic output-limit responses", async () => {
    const openAi = createService({
      provider: "openai",
      response: {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "fix: incomplete"
      }
    });
    const anthropic = createService({
      provider: "anthropic",
      response: {
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "fix: incomplete" }]
      }
    });

    await expect(openAi.service.generateCommitMessage({ repoPath: "D:\\Repo" })).resolves.toMatchObject({
      exitCode: -1,
      stderr: "The model reached its output limit before it returned a complete result."
    });
    await expect(anthropic.service.generateCommitMessage({ repoPath: "D:\\Repo" })).resolves.toMatchObject({
      exitCode: -1,
      stderr: "The model reached its output limit before it returned a complete result."
    });
  });

  it("builds an OpenAI Responses request and parses output_text", async () => {
    const { service, calls } = createService({
      provider: "openai",
      response: {
        output_text: "fix: use responses api"
      }
    });

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "fix: use responses api"
    });

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.init?.headers).toMatchObject({
      "Authorization": "Bearer sk-openai"
    });
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      instructions: string;
      input: string;
      max_output_tokens: number;
      reasoning: { effort: string };
    };
    expect(body.model).toBe(DEFAULT_AI_PROVIDER_MODELS.openai);
    expect(body.instructions).toContain("Use Conventional Commits format");
    expect(body.instructions).toContain("primary user-visible or developer-visible change");
    expect(body.instructions).toContain("72 characters or fewer");
    expect(body.input).toContain("Staged diff:");
    expect(body.max_output_tokens).toBe(1_024);
    expect(body.reasoning).toEqual({ effort: "low" });
  });

  it("omits reasoning when model support is unknown", async () => {
    const { service, calls } = createService({
      provider: "openai",
      response: { output_text: "fix: preserve unknown models" },
      reasoningCapabilities: {
        getCapabilities: async () => ({ status: "unknown", supportedEfforts: [] })
      }
    });

    await service.generateCommitMessage({ repoPath: "D:\\Repo" });

    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("reasoning");
  });

  it("builds an Anthropic Messages request and parses text blocks", async () => {
    const { service, calls } = createService({
      provider: "anthropic",
      response: {
        content: [
          {
            type: "text",
            text: "chore: add anthropic provider"
          }
        ]
      }
    });

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "chore: add anthropic provider"
    });

    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.init?.headers).toMatchObject({
      "x-api-key": "sk-ant",
      "anthropic-version": "2023-06-01"
    });
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      system: string;
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      output_config: { effort: string };
    };
    expect(body.model).toBe(DEFAULT_AI_PROVIDER_MODELS.anthropic);
    expect(body.system).toContain("Return exactly the commit message text");
    expect(body.messages[0]?.content).toContain("+added");
    expect(body.max_tokens).toBe(1_024);
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it("runs Codex CLI with prompt on stdin", async () => {
    const runner = new FakeProcessRunner();
    const { service } = createService({
      provider: "codex-cli",
      runner
    });

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "feat: add generated commit messages"
    });
    const call = runner.calls[0];
    const expectedInvocation = createCliInvocation("codex", [
      "exec",
      "--model",
      DEFAULT_AI_PROVIDER_MODELS["codex-cli"],
      "--config",
      "model_reasoning_effort=\"low\"",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--ephemeral",
      "--skip-git-repo-check",
      "-"
    ], {
      ...(call?.options?.env ? { env: call.options.env } : {}),
      workingDirectory: "D:\\Repo"
    });
    expect(call?.command).toBe(expectedInvocation.command);
    expect(call?.args).toEqual(expectedInvocation.args);
    expect(call?.options?.cwd).toBe("D:\\Repo");
    expect(call?.options?.stdin).toContain("Staged diff:");
    expect(call?.options?.timeoutMs).toBe(60_000);
  });

  it("runs Claude Code with prompt on stdin", async () => {
    const runner = new FakeProcessRunner();
    const { service } = createService({
      provider: "claude-code",
      runner
    });

    await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });
    const call = runner.calls[0];
    const expectedInvocation = createCliInvocation("claude", [
      "-p",
      "--model",
      DEFAULT_AI_PROVIDER_MODELS["claude-code"],
      "--effort",
      "low",
      "--output-format",
      "text",
      "--no-session-persistence",
      "--max-turns",
      "1",
      "--tools",
      "",
      "--permission-mode",
      "default",
      "--input-format",
      "text"
    ], {
      ...(call?.options?.env ? { env: call.options.env } : {}),
      workingDirectory: "D:\\Repo"
    });
    expect(call?.command).toBe(expectedInvocation.command);
    expect(call?.args).toEqual(expectedInvocation.args);
    expect(call?.args).toContain("-p");
    expect(call?.args).toContain("--input-format");
    expect(call?.options?.stdin).toContain("Staged diff:");
    expect(call?.options?.timeoutMs).toBe(60_000);
  });

  it("uses the default prompt when saved prompt settings are blank", async () => {
    const { service, calls } = createService({
      settings: createSettings("openrouter", {
        commitMessagePrompt: ""
      })
    });

    await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.at(-1)?.content).toContain("Write a concise Git commit message for the staged changes.");
    expect(body.messages[0]?.content).toContain("Use Conventional Commits format");
  });

  it("includes additional user context in the prompt when provided", async () => {
    const { service, calls } = createService({});

    await service.generateCommitMessage({
      repoPath: "D:\\Repo",
      additionalContext: "  This preserves legacy project naming.  "
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = body.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("Additional context from the user:");
    expect(prompt).toContain("This preserves legacy project naming.");
    expect(prompt).not.toContain("  This preserves legacy project naming.  ");
  });

  it("caps large staged diffs before sending them to providers", async () => {
    const { service, calls } = createService({
      diff: `diff --git a/a.ts b/a.ts\n${"x".repeat(70_000)}`
    });

    await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = body.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("The diff was truncated");
    expect(prompt.length).toBeLessThan(61_000);
  });

  it("fails without calling providers when no staged diff exists", async () => {
    const { service, calls, runner } = createService({
      diff: ""
    });

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "Stage changes before generating a commit message."
    });
    expect(calls).toHaveLength(0);
    expect((runner as FakeProcessRunner).calls).toHaveLength(0);
  });

  it("fails without calling providers when the selected API key is missing", async () => {
    const { service, calls } = createService({
      provider: "openai",
      apiKeys: {}
    });

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "OpenAI API key is not configured."
    });
    expect(calls).toHaveLength(0);
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

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: -1,
      stderr: "Codex CLI is not authenticated."
    });
    expect(runner.calls).toHaveLength(0);
  });

  it("returns provider errors clearly", async () => {
    const { service } = createService({
      response: {
        error: {
          message: "invalid api key"
        }
      },
      responseOk: false
    });

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: -1,
      stderr: "invalid api key"
    });
  });

  it("strips markdown fences from generated messages", async () => {
    const { service } = createService({
      response: {
        choices: [
          {
            message: {
              content: "```text\nfix: normalize output\n```"
            }
          }
        ]
      }
    });

    await expect(service.generateCommitMessage({
      repoPath: "D:\\Repo"
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "fix: normalize output"
    });
  });
});
