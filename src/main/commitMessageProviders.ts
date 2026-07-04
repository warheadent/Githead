import { createCliProcessEnv } from "./cliEnvironment";
import { createCliInvocation } from "./cliInvocation";
import type { ProcessRunner } from "./processRunner";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED_SERVICE_TIER = "flex";
const OPENROUTER_SITE_URL = "https://github.com/warheadent/Githead#readme";
const OPENROUTER_SITE_TITLE = "Githead";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const API_TIMEOUT_MS = 60_000;
const CLI_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 220;

type Fetch = typeof fetch;

export interface CommitMessageProviderInput {
  repoPath: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Response token budget for API providers; CLI providers ignore it. */
  maxTokens?: number;
}

export interface CommitMessageProvider {
  generate(input: CommitMessageProviderInput): Promise<string>;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

export class OpenRouterCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generate(input: CommitMessageProviderInput): Promise<string> {
    const response = await fetchWithTimeout(this.fetchImpl, OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_SITE_TITLE
      },
      body: JSON.stringify({
        model: input.model,
        service_tier: OPENROUTER_PREFERRED_SERVICE_TIER,
        messages: [
          {
            role: "system",
            content: input.systemPrompt
          },
          {
            role: "user",
            content: input.userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    });
    const payload = await parseJson<OpenRouterResponse>(response);
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenRouter request failed with status ${response.status}.`);
    }

    return payload.choices?.[0]?.message?.content ?? "";
  }
}

export class OpenAiCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generate(input: CommitMessageProviderInput): Promise<string> {
    const response = await fetchWithTimeout(this.fetchImpl, OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.systemPrompt,
        input: input.userPrompt,
        temperature: 0.2,
        max_output_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    });
    const payload = await parseJson<OpenAiResponse>(response);
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
    }

    return payload.output_text ?? extractOpenAiOutputText(payload);
  }
}

export class AnthropicCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generate(input: CommitMessageProviderInput): Promise<string> {
    const response = await fetchWithTimeout(this.fetchImpl, ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        system: input.systemPrompt,
        messages: [
          {
            role: "user",
            content: input.userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    });
    const payload = await parseJson<AnthropicResponse>(response);
    if (!response.ok) {
      throw new Error(payload.error?.message || `Anthropic request failed with status ${response.status}.`);
    }

    return payload.content
      ?.filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n") ?? "";
  }
}

export class CodexCliCommitMessageProvider implements CommitMessageProvider {
  constructor(private readonly runner: ProcessRunner) {}

  async generate(input: CommitMessageProviderInput): Promise<string> {
    const invocation = createCliInvocation("codex", [
      "exec",
      "--model",
      input.model,
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--ephemeral",
      "--skip-git-repo-check",
      "-"
    ]);
    const result = await this.runner.run(invocation.command, invocation.args, {
      cwd: input.repoPath,
      env: createCliProcessEnv(),
      stdin: createCliPrompt(input),
      timeoutMs: CLI_TIMEOUT_MS
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || "Codex CLI failed to generate a commit message.");
    }

    return result.stdout;
  }
}

export class ClaudeCodeCommitMessageProvider implements CommitMessageProvider {
  constructor(private readonly runner: ProcessRunner) {}

  async generate(input: CommitMessageProviderInput): Promise<string> {
    const invocation = createCliInvocation("claude", [
      "-p",
      "--model",
      input.model,
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
    ]);
    const result = await this.runner.run(invocation.command, invocation.args, {
      cwd: input.repoPath,
      env: createCliProcessEnv(),
      stdin: createCliPrompt(input),
      timeoutMs: CLI_TIMEOUT_MS
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || "Claude Code failed to generate a commit message.");
    }

    return result.stdout;
  }
}

async function fetchWithTimeout(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT_MS);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function extractOpenAiOutputText(payload: OpenAiResponse): string {
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((block) => block.type === "output_text" && block.text)
    .map((block) => block.text)
    .join("\n") ?? "";
}

function createCliPrompt(input: CommitMessageProviderInput): string {
  return [
    input.systemPrompt,
    "",
    input.userPrompt
  ].join("\n");
}
