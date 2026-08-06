import {
  AI_REASONING_EFFORTS,
  type AiCommitMessageProvider,
  type AiReasoningCapabilities,
  type AiReasoningEffort,
  type GetAiReasoningCapabilitiesRequest
} from "../shared/types";
import { isApiKeyProvider, type AiSettingsService } from "./aiSettingsService";
import { createCliProcessEnv } from "./cliEnvironment";
import { createCliInvocation } from "./cliInvocation";
import { fetchJsonWithTimeout } from "./fetchJsonWithTimeout";
import type { ProcessInput, ProcessRunner } from "./processRunner";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
const LOOKUP_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 15 * 60_000;
const CLI_LOOKUP_TIMEOUT_MS = 5_000;

type Fetch = typeof fetch;

interface CachedCapabilities {
  value: AiReasoningCapabilities;
  expiresAt: number;
}

interface OpenRouterModelsResponse {
  data?: Array<{
    id?: string;
    reasoning?: {
      supported_efforts?: string[] | null;
    };
  }>;
}

interface AnthropicModelResponse {
  capabilities?: {
    effort?: Partial<Record<AiReasoningEffort, { supported?: boolean }>> & {
      supported?: boolean;
    };
  };
}

interface CodexModelListResponse {
  data?: Array<{
    model?: string;
    supportedReasoningEfforts?: Array<{ reasoningEffort?: string }>;
  }>;
  nextCursor?: string | null;
}

interface JsonRpcResponse {
  id?: number;
  result?: CodexModelListResponse;
  error?: unknown;
}

const supported = (supportedEfforts: readonly AiReasoningEffort[] = AI_REASONING_EFFORTS): AiReasoningCapabilities => ({
  status: "supported",
  supportedEfforts: [...supportedEfforts]
});

const unsupported = (): AiReasoningCapabilities => ({
  status: "unsupported",
  supportedEfforts: []
});

const unknown = (): AiReasoningCapabilities => ({
  status: "unknown",
  supportedEfforts: []
});

const STATIC_CAPABILITIES: Partial<Record<AiCommitMessageProvider, Record<string, AiReasoningCapabilities>>> = {
  openrouter: {
    "openai/gpt-5.6-luna": supported(["low", "medium", "high", "xhigh", "max"])
  },
  openai: {
    "gpt-5.4-nano": supported(["none", "minimal", "low", "medium", "high", "xhigh"]),
    "gpt-5.4-mini": supported(["none", "minimal", "low", "medium", "high", "xhigh"]),
    "gpt-5.4": supported(["none", "minimal", "low", "medium", "high", "xhigh"])
  },
  "codex-cli": {
    "gpt-5.6-sol": supported(["low", "medium", "high", "xhigh", "max", "ultra"]),
    "gpt-5.6-terra": supported(["low", "medium", "high", "xhigh", "max", "ultra"]),
    "gpt-5.6-luna": supported(["low", "medium", "high", "xhigh", "max"]),
    "gpt-5.4-mini": supported(["low", "medium", "high", "xhigh"]),
    "gpt-5.4": supported(["low", "medium", "high", "xhigh"]),
    "gpt-5.3-codex": supported(["low", "medium", "high", "xhigh"])
  },
  anthropic: {
    "claude-haiku-4-5-20251001": unsupported(),
    "claude-haiku-4-5": unsupported()
  },
  "claude-code": {
    haiku: unsupported(),
    "claude-haiku-4-5": unsupported(),
    "claude-haiku-4-5-20251001": unsupported(),
    sonnet: supported(["low", "medium", "high", "xhigh", "max"]),
    opus: supported(["low", "medium", "high", "xhigh", "max"]),
    "claude-sonnet-4-6": supported(["low", "medium", "high", "max"]),
    "claude-opus-4-5": supported(["low", "medium", "high", "max"]),
    "claude-opus-4-6": supported(["low", "medium", "high", "max"]),
    "claude-opus-4-7": supported(["low", "medium", "high", "xhigh", "max"]),
    "claude-opus-4-8": supported(["low", "medium", "high", "xhigh", "max"])
  }
};

export class AiReasoningCapabilityService {
  private readonly cache = new Map<string, CachedCapabilities>();
  private readonly inFlight = new Map<string, Promise<AiReasoningCapabilities>>();
  private codexCatalog: { value: NonNullable<CodexModelListResponse["data"]>; expiresAt: number } | null = null;
  private codexCatalogInFlight: Promise<CodexModelListResponse["data"]> | null = null;
  private claudeEfforts: { value: AiReasoningEffort[]; expiresAt: number } | null = null;
  private claudeEffortsInFlight: Promise<AiReasoningEffort[] | null> | null = null;

  constructor(
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner,
    private readonly now: () => number = Date.now
  ) {}

  async getCapabilities(request: GetAiReasoningCapabilitiesRequest): Promise<AiReasoningCapabilities> {
    const model = request.model.trim();
    if (!model) {
      return unknown();
    }

    const key = `${request.provider}:${model.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) {
      return cached.value;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const lookup = this.resolveCapabilities(request.provider, model)
      .then((value) => {
        if (value.status !== "unknown") {
          this.cache.set(key, {
            value,
            expiresAt: this.now() + CACHE_TTL_MS
          });
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, lookup);
    return lookup;
  }

  private async resolveCapabilities(
    provider: AiCommitMessageProvider,
    model: string
  ): Promise<AiReasoningCapabilities> {
    const fallback = STATIC_CAPABILITIES[provider]?.[model.toLowerCase()];

    try {
      if (provider === "openrouter") {
        return await this.getOpenRouterCapabilities(model) ?? fallback ?? unknown();
      }
      if (provider === "anthropic") {
        return await this.getAnthropicCapabilities(model) ?? fallback ?? unknown();
      }
      if (provider === "codex-cli") {
        return await this.getCodexCliCapabilities(model) ?? fallback ?? unknown();
      }
      if (provider === "claude-code") {
        return await this.getClaudeCodeCapabilities(fallback) ?? fallback ?? unknown();
      }
      if (provider === "openai") {
        return fallback ?? inferOpenAiCapabilities(model);
      }
    } catch {
      return fallback ?? unknown();
    }

    return fallback ?? unknown();
  }

  private async getOpenRouterCapabilities(model: string): Promise<AiReasoningCapabilities | null> {
    const apiKey = await this.getOptionalApiKey("openrouter");
    const init: RequestInit = apiKey
      ? { headers: { "Authorization": `Bearer ${apiKey}` } }
      : {};
    const { response, payload } = await fetchJsonWithTimeout<OpenRouterModelsResponse>(
      this.fetchImpl,
      OPENROUTER_MODELS_URL,
      init,
      { timeoutMs: LOOKUP_TIMEOUT_MS }
    );
    if (!response.ok) {
      throw new Error(`OpenRouter model lookup failed with status ${response.status}.`);
    }

    const match = payload.data?.find((candidate) => candidate.id === model);
    if (!match) {
      return null;
    }
    if (!match.reasoning) {
      return unsupported();
    }
    return fromEffortStrings(match.reasoning.supported_efforts);
  }

  private async getAnthropicCapabilities(model: string): Promise<AiReasoningCapabilities | null> {
    const apiKey = await this.getOptionalApiKey("anthropic");
    if (!apiKey) {
      return null;
    }
    const { response, payload } = await fetchJsonWithTimeout<AnthropicModelResponse>(
      this.fetchImpl,
      `${ANTHROPIC_MODELS_URL}/${encodeURIComponent(model)}`,
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION
        }
      },
      { timeoutMs: LOOKUP_TIMEOUT_MS }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Anthropic model lookup failed with status ${response.status}.`);
    }

    const effort = payload.capabilities?.effort;
    if (!effort?.supported) {
      return unsupported();
    }
    return fromEffortStrings(AI_REASONING_EFFORTS.filter((level) => effort[level]?.supported));
  }

  private async getCodexCliCapabilities(model: string): Promise<AiReasoningCapabilities | null> {
    if (!this.runner) {
      return null;
    }
    const models = await this.getCodexCatalog();
    if (!models) {
      return null;
    }
    const match = models.find((candidate) => candidate.model?.toLowerCase() === model.toLowerCase());
    if (!match) {
      return null;
    }
    return match.supportedReasoningEfforts
      ? fromEffortStrings(match.supportedReasoningEfforts.map((option) => option.reasoningEffort ?? ""))
      : unsupported();
  }

  private async getClaudeCodeCapabilities(fallback: AiReasoningCapabilities | undefined): Promise<AiReasoningCapabilities | null> {
    if (!this.runner || !fallback || fallback.status !== "supported") {
      return null;
    }
    const advertised = await this.getClaudeEfforts();
    if (!advertised || advertised.length === 0) {
      return null;
    }
    return fromEffortStrings(fallback.supportedEfforts.filter((effort) => advertised.includes(effort)));
  }

  private async getCodexCatalog(): Promise<CodexModelListResponse["data"]> {
    if (!this.runner) return undefined;
    if (this.codexCatalog && this.codexCatalog.expiresAt > this.now()) {
      return this.codexCatalog.value;
    }
    this.codexCatalogInFlight ??= requestCodexModels(this.runner).then((value) => {
      if (value) this.codexCatalog = { value, expiresAt: this.now() + CACHE_TTL_MS };
      return value;
    }).finally(() => { this.codexCatalogInFlight = null; });
    return this.codexCatalogInFlight;
  }

  private async getClaudeEfforts(): Promise<AiReasoningEffort[] | null> {
    if (!this.runner) return null;
    if (this.claudeEfforts && this.claudeEfforts.expiresAt > this.now()) {
      return this.claudeEfforts.value;
    }
    this.claudeEffortsInFlight ??= requestClaudeEfforts(this.runner).then((value) => {
      if (value) this.claudeEfforts = { value, expiresAt: this.now() + CACHE_TTL_MS };
      return value;
    }).finally(() => { this.claudeEffortsInFlight = null; });
    return this.claudeEffortsInFlight;
  }

  private async getOptionalApiKey(provider: AiCommitMessageProvider): Promise<string | null> {
    return isApiKeyProvider(provider) ? this.settingsService.getApiKey(provider) : null;
  }
}

function fromEffortStrings(values: string[] | null | undefined): AiReasoningCapabilities {
  if (!values) {
    return supported();
  }
  const supportedEfforts = AI_REASONING_EFFORTS.filter((level) => values.includes(level));
  return supportedEfforts.length > 0 ? supported(supportedEfforts) : unsupported();
}

function inferOpenAiCapabilities(model: string): AiReasoningCapabilities {
  const normalized = model.toLowerCase();
  if (/^gpt-5\.(?:[2-9]|\d{2,})(?:-|$)/.test(normalized)) {
    return supported(["none", "minimal", "low", "medium", "high", "xhigh"]);
  }
  if (/^gpt-5\.1(?:-|$)/.test(normalized)) {
    return supported(["none", "low", "medium", "high", ...(normalized.includes("codex-max") ? ["xhigh" as const] : [])]);
  }
  if (/^(?:o1|o3|o4)(?:-|$)/.test(normalized)) {
    return normalized.includes("-pro") ? supported(["high"]) : supported(["low", "medium", "high"]);
  }
  if (/^(?:gpt-4|chatgpt-4)/.test(normalized)) {
    return unsupported();
  }
  return unknown();
}

function parseClaudeEfforts(help: string): AiReasoningEffort[] {
  const match = help.match(/--effort\s+<[^>]+>[\s\S]{0,200}?\(([^)]+)\)/i);
  return match ? AI_REASONING_EFFORTS.filter((effort) => match[1]?.split(",").map((value) => value.trim()).includes(effort)) : [];
}

async function requestClaudeEfforts(runner: ProcessRunner): Promise<AiReasoningEffort[] | null> {
  const invocation = createCliInvocation("claude", ["--help"]);
  const result = await runner.run(invocation.command, invocation.args, {
    env: createCliProcessEnv(),
    timeoutMs: CLI_LOOKUP_TIMEOUT_MS
  });
  if (result.exitCode !== 0) return null;
  const efforts = parseClaudeEfforts(`${result.stdout}\n${result.stderr}`);
  return efforts.length > 0 ? efforts : null;
}

async function requestCodexModels(runner: ProcessRunner): Promise<CodexModelListResponse["data"]> {
  const invocation = createCliInvocation("codex", ["app-server"]);
  const controller = new AbortController();
  const models: NonNullable<CodexModelListResponse["data"]> = [];
  let input: ProcessInput | undefined;
  let pending = "";
  let nextRequestId = 2;
  let complete: ((value: boolean) => void) | undefined;
  const completion = new Promise<boolean>((resolve) => { complete = resolve; });

  const send = (message: object) => input?.write(`${JSON.stringify(message)}\n`);
  const handleLine = (line: string) => {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    if (message.id === 1 && !message.error) {
      send({ method: "initialized" });
      send({ id: nextRequestId, method: "model/list", params: {} });
      return;
    }
    if (message.id !== nextRequestId || message.error || !message.result) {
      if (message.id === nextRequestId) complete?.(false);
      return;
    }
    models.push(...(message.result.data ?? []));
    if (message.result.nextCursor) {
      nextRequestId += 1;
      send({ id: nextRequestId, method: "model/list", params: { cursor: message.result.nextCursor } });
      return;
    }
    complete?.(true);
  };

  const execution = runner.run(invocation.command, invocation.args, {
    env: createCliProcessEnv(),
    signal: controller.signal,
    timeoutMs: CLI_LOOKUP_TIMEOUT_MS,
    onInputReady: (processInput) => {
      input = processInput;
      send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "githead", title: "Githead", version: "0.39.0" },
          capabilities: { experimentalApi: true }
        }
      });
    },
    onOutput: (output) => {
      if (output.stream !== "stdout") return;
      pending += output.text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
  });

  const succeeded = await Promise.race([
    completion,
    execution.then(() => false)
  ]);
  controller.abort();
  await execution;
  return succeeded ? models : undefined;
}
