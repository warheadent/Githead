import {
  AI_REASONING_EFFORTS,
  type AiCommitMessageProvider,
  type AiReasoningCapabilities,
  type AiReasoningEffort,
  type GetAiReasoningCapabilitiesRequest
} from "../shared/types";
import { isApiKeyProvider, type AiSettingsService } from "./aiSettingsService";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
const LOOKUP_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 15 * 60_000;

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
    effort?: {
      supported?: boolean;
      low?: { supported?: boolean };
      medium?: { supported?: boolean };
      high?: { supported?: boolean };
    };
  };
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
    "openai/gpt-5.4-nano": supported()
  },
  openai: {
    "gpt-5.4-nano": supported(),
    "gpt-5.4-mini": supported(),
    "gpt-5.4": supported()
  },
  "codex-cli": {
    "gpt-5.4-mini": supported(),
    "gpt-5.4": supported(),
    "gpt-5.3-codex": supported()
  },
  anthropic: {
    "claude-haiku-4-5-20251001": unsupported(),
    "claude-haiku-4-5": unsupported()
  },
  "claude-code": {
    haiku: unsupported(),
    "claude-haiku-4-5": unsupported(),
    "claude-haiku-4-5-20251001": unsupported(),
    sonnet: supported(),
    opus: supported(),
    "claude-sonnet-4-6": supported(),
    "claude-opus-4-5": supported(),
    "claude-opus-4-6": supported()
  }
};

export class AiReasoningCapabilityService {
  private readonly cache = new Map<string, CachedCapabilities>();
  private readonly inFlight = new Map<string, Promise<AiReasoningCapabilities>>();

  constructor(
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
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
    const response = await fetchWithTimeout(this.fetchImpl, OPENROUTER_MODELS_URL, init);
    if (!response.ok) {
      throw new Error(`OpenRouter model lookup failed with status ${response.status}.`);
    }

    const payload = await response.json() as OpenRouterModelsResponse;
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
    const response = await fetchWithTimeout(this.fetchImpl, `${ANTHROPIC_MODELS_URL}/${encodeURIComponent(model)}`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      }
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Anthropic model lookup failed with status ${response.status}.`);
    }

    const payload = await response.json() as AnthropicModelResponse;
    const effort = payload.capabilities?.effort;
    if (!effort?.supported) {
      return unsupported();
    }
    return supported(AI_REASONING_EFFORTS.filter((level) => effort[level]?.supported));
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

async function fetchWithTimeout(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
