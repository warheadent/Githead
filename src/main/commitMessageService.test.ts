import { describe, expect, it } from "vitest";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import type { AiSettings } from "../shared/types";
import { CommitMessageService } from "./commitMessageService";
import type { AiSettingsService } from "./aiSettingsService";

class FakeAiSettingsService {
  constructor(
    private readonly settings: AiSettings,
    private readonly apiKey: string | null
  ) {}

  async getSettings(): Promise<AiSettings> {
    return this.settings;
  }

  async getApiKey(): Promise<string | null> {
    return this.apiKey;
  }
}

class FakeGitService {
  constructor(private readonly stdout: string, private readonly exitCode = 0) {}

  async getStagedDiff(repoPath: string) {
    return {
      repoPath,
      exitCode: this.exitCode,
      stdout: this.stdout,
      stderr: this.exitCode === 0 ? "" : "fatal: failed"
    };
  }
}

interface FetchCall {
  url: string;
  init?: RequestInit | undefined;
}

const settings: AiSettings = {
  hasApiKey: true,
  model: "openrouter/auto",
  commitMessagePrompt: [
    "Write a project-specific Git commit message.",
    "Prefer Conventional Commits."
  ].join("\n")
};

function createFetch(
  payload: unknown,
  options: { ok?: boolean; status?: number } = {}
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init
    });

    return new Response(JSON.stringify(payload), {
      status: options.status ?? (options.ok === false ? 400 : 200)
    });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls
  };
}

function createService(params: {
  diff: string;
  apiKey?: string | null;
  response?: unknown;
  responseOk?: boolean;
}): { service: CommitMessageService; calls: FetchCall[] } {
  const fetchState = createFetch(params.response ?? {
    choices: [
      {
        message: {
          content: "feat: add generated commit messages"
        }
      }
    ]
  }, params.responseOk === undefined ? {} : {
    ok: params.responseOk
  });

  return {
    service: new CommitMessageService(
      () => new FakeGitService(params.diff),
      new FakeAiSettingsService(
        settings,
        Object.hasOwn(params, "apiKey") ? params.apiKey ?? null : "sk-or-key"
      ) as unknown as AiSettingsService,
      fetchState.fetch
    ),
    calls: fetchState.calls
  };
}

describe("CommitMessageService", () => {
  it("builds an OpenRouter chat completion request from the staged diff", async () => {
    const { service, calls } = createService({
      diff: "diff --git a/a.ts b/a.ts\n+added\n"
    });

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "feat: add generated commit messages"
    });
    expect(calls).toHaveLength(1);
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
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("openrouter/auto");
    expect(body.service_tier).toBe("flex");
    expect(body.messages.at(-1)?.content).toContain("+added");
    expect(body.messages[0]?.content).toContain("Return exactly the commit message text");
    expect(body.messages[0]?.content).toContain("Follow Conventional Commits format");
    expect(body.messages[0]?.content).toContain("feat, fix, refactor, perf, docs, test, build, ci, chore, revert");
    expect(body.messages[0]?.content).toContain("Set scope to the primary module only when one clearly dominates");
    expect(body.messages[0]?.content).toContain("imperative mood, aim for under 50 characters");
    expect(body.messages[0]?.content).toContain("BREAKING CHANGE: footer");
    expect(body.messages[0]?.content).toContain("Do not insert manual line breaks");
    expect(body.messages.at(-1)?.content).toContain("Write a project-specific Git commit message.");
    expect(body.messages.at(-1)?.content).toContain("Prefer Conventional Commits.");
    expect(body.messages.at(-1)?.content).toContain("Staged diff:");
  });

  it("uses the default prompt when saved prompt settings are blank", async () => {
    const fetchState = createFetch({
      choices: [
        {
          message: {
            content: "fix: normalize defaults"
          }
        }
      ]
    });
    const service = new CommitMessageService(
      () => new FakeGitService("diff --git a/a.ts b/a.ts\n+added\n"),
      new FakeAiSettingsService({
        ...settings,
        commitMessagePrompt: ""
      }, "sk-or-key") as unknown as AiSettingsService,
      fetchState.fetch
    );

    await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    const body = JSON.parse(String(fetchState.calls[0]?.init?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.at(-1)?.content).toContain(DEFAULT_COMMIT_MESSAGE_PROMPT);
  });

  it("caps large staged diffs before sending them to OpenRouter", async () => {
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

  it("fails without calling OpenRouter when no staged diff exists", async () => {
    const { service, calls } = createService({
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
  });

  it("fails without calling OpenRouter when the API key is missing", async () => {
    const { service, calls } = createService({
      diff: "diff --git a/a.ts b/a.ts\n+added\n",
      apiKey: null
    });

    const result = await service.generateCommitMessage({
      repoPath: "D:\\Repo"
    });

    expect(result).toMatchObject({
      exitCode: -1,
      stderr: "OpenRouter API key is not configured."
    });
    expect(calls).toHaveLength(0);
  });

  it("returns OpenRouter errors clearly", async () => {
    const { service } = createService({
      diff: "diff --git a/a.ts b/a.ts\n+added\n",
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
      diff: "diff --git a/a.ts b/a.ts\n+added\n",
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
