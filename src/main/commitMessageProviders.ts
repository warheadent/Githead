import { createCliProcessEnv } from "./cliEnvironment";
import { createCliInvocation } from "./cliInvocation";
import { fetchJsonWithTimeout } from "./fetchJsonWithTimeout";
import type { ProcessRunner } from "./processRunner";
import type { AiReasoningEffort } from "../shared/types";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED_SERVICE_TIER = "flex";
const OPENROUTER_FALLBACK_SERVICE_TIER = "default";
const OPENROUTER_MAX_FLEX_ATTEMPTS = 2;
const OPENROUTER_SITE_URL = "https://github.com/warheadent/Githead#readme";
const OPENROUTER_SITE_TITLE = "Githead";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const API_TIMEOUT_MS = 60_000;
const CLI_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_TOKENS = 1_024;
const MIN_LENGTH_RETRY_TOKENS = 2_048;

type Fetch = typeof fetch;

export interface CommitMessageProviderInput {
  repoPath: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
  /** Response token budget for API providers; CLI providers ignore it. */
  maxTokens?: number;
  reasoningEffort?: AiReasoningEffort;
}

export interface CommitMessageProvider {
  generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult>;
}

export interface CommitMessageProviderResult {
  text: string;
  finishReason: "complete" | "length" | "unknown";
}

export interface CompleteGenerationResult {
  text: string;
  retriedAfterLength: boolean;
}

interface OpenRouterResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAiResponse {
  status?: string;
  incomplete_details?: {
    reason?: string;
  } | null;
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
  stop_reason?: string | null;
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

  async generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult> {
    for (let attempt = 0; attempt < OPENROUTER_MAX_FLEX_ATTEMPTS; attempt += 1) {
      const result = await this.sendRequest(input, OPENROUTER_PREFERRED_SERVICE_TIER);
      if (result.response.ok) {
        return extractOpenRouterResult(result.payload);
      }
      if (!isTemporaryFlexFailure(result.response.status)) {
        throw createOpenRouterError(result.response, result.payload);
      }
    }

    const fallback = await this.sendRequest(input, OPENROUTER_FALLBACK_SERVICE_TIER);
    if (!fallback.response.ok) {
      throw createOpenRouterError(fallback.response, fallback.payload);
    }

    return extractOpenRouterResult(fallback.payload);
  }

  private sendRequest(
    input: CommitMessageProviderInput,
    serviceTier: typeof OPENROUTER_PREFERRED_SERVICE_TIER | typeof OPENROUTER_FALLBACK_SERVICE_TIER
  ) {
    return fetchJsonWithTimeout<OpenRouterResponse>(this.fetchImpl, OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_SITE_TITLE
      },
      body: JSON.stringify({
        model: input.model,
        service_tier: serviceTier,
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
        ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    }, {
      timeoutMs: API_TIMEOUT_MS,
      timeoutReason: createApiTimeoutReason(),
      ...(input.signal ? { signal: input.signal } : {}),
      createJsonFallback: () => ({} as OpenRouterResponse)
    });
  }
}

export class OpenAiCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult> {
    const { response, payload } = await fetchJsonWithTimeout<OpenAiResponse>(this.fetchImpl, OPENAI_RESPONSES_URL, {
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
        ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
        max_output_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    }, {
      timeoutMs: API_TIMEOUT_MS,
      timeoutReason: createApiTimeoutReason(),
      ...(input.signal ? { signal: input.signal } : {}),
      createJsonFallback: () => ({} as OpenAiResponse)
    });
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
    }

    return {
      text: payload.output_text ?? extractOpenAiOutputText(payload),
      finishReason: payload.status === "incomplete" && payload.incomplete_details?.reason === "max_output_tokens"
        ? "length"
        : payload.status === "completed" ? "complete" : "unknown"
    };
  }
}

export class AnthropicCommitMessageProvider implements CommitMessageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult> {
    const { response, payload } = await fetchJsonWithTimeout<AnthropicResponse>(this.fetchImpl, ANTHROPIC_MESSAGES_URL, {
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
        ...(input.reasoningEffort ? { output_config: { effort: input.reasoningEffort } } : {}),
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS
      })
    }, {
      timeoutMs: API_TIMEOUT_MS,
      timeoutReason: createApiTimeoutReason(),
      ...(input.signal ? { signal: input.signal } : {}),
      createJsonFallback: () => ({} as AnthropicResponse)
    });
    if (!response.ok) {
      throw new Error(payload.error?.message || `Anthropic request failed with status ${response.status}.`);
    }

    return {
      text: payload.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n") ?? "",
      finishReason: payload.stop_reason === "max_tokens"
        ? "length"
        : payload.stop_reason === "end_turn" || payload.stop_reason === "stop_sequence" ? "complete" : "unknown"
    };
  }
}

export class CodexCliCommitMessageProvider implements CommitMessageProvider {
  constructor(private readonly runner: ProcessRunner) {}

  async generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult> {
    const invocation = createCliInvocation("codex", [
      "exec",
      "--model",
      input.model,
      ...(input.reasoningEffort ? ["--config", `model_reasoning_effort="${input.reasoningEffort}"`] : []),
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
      timeoutMs: CLI_TIMEOUT_MS,
      ...(input.signal ? { signal: input.signal } : {})
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || "Codex CLI failed to generate a commit message.");
    }

    return { text: result.stdout, finishReason: "complete" };
  }
}

export class ClaudeCodeCommitMessageProvider implements CommitMessageProvider {
  constructor(private readonly runner: ProcessRunner) {}

  async generate(input: CommitMessageProviderInput): Promise<CommitMessageProviderResult> {
    const invocation = createCliInvocation("claude", [
      "-p",
      "--model",
      input.model,
      ...(input.reasoningEffort ? ["--effort", input.reasoningEffort] : []),
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
      timeoutMs: CLI_TIMEOUT_MS,
      ...(input.signal ? { signal: input.signal } : {})
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || "Claude Code failed to generate a commit message.");
    }

    return { text: result.stdout, finishReason: "complete" };
  }
}

function createApiTimeoutReason(): DOMException {
  return new DOMException(
    `AI provider request timed out after ${API_TIMEOUT_MS}ms.`,
    "TimeoutError"
  );
}

function isTemporaryFlexFailure(status: number): boolean {
  return status === 429 || status === 503;
}

function createOpenRouterError(response: Response, payload: OpenRouterResponse): Error {
  return new Error(payload.error?.message || `OpenRouter request failed with status ${response.status}.`);
}

function extractOpenRouterResult(payload: OpenRouterResponse): CommitMessageProviderResult {
  const choice = payload.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason === "length"
      ? "length"
      : choice?.finish_reason === "stop" ? "complete" : "unknown"
  };
}

function extractOpenAiOutputText(payload: OpenAiResponse): string {
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((block) => block.type === "output_text" && block.text)
    .map((block) => block.text)
    .join("\n") ?? "";
}

export async function generateCompleteText(
  provider: CommitMessageProvider,
  input: CommitMessageProviderInput
): Promise<CompleteGenerationResult> {
  const first = await provider.generate(input);
  if (first.finishReason !== "length") {
    return { text: first.text, retriedAfterLength: false };
  }

  if (first.text.trim()) {
    throw new Error("The model reached its output limit before it returned a complete result.");
  }

  const initialMaxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const retry = await provider.generate({
    ...input,
    maxTokens: Math.max(initialMaxTokens * 2, MIN_LENGTH_RETRY_TOKENS)
  });
  if (retry.finishReason === "length") {
    throw new Error("The model reached its output limit before it returned a complete result.");
  }

  return { text: retry.text, retriedAfterLength: true };
}

function createCliPrompt(input: CommitMessageProviderInput): string {
  return [
    input.systemPrompt,
    "",
    input.userPrompt
  ].join("\n");
}
