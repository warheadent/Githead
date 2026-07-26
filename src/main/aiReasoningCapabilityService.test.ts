import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AiApiKeyProvider } from "../shared/types";
import { AiReasoningCapabilityService } from "./aiReasoningCapabilityService";
import type { AiSettingsService } from "./aiSettingsService";

function createSettingsService(keys: Partial<Record<AiApiKeyProvider, string>> = {}): AiSettingsService {
  return {
    getApiKey: async (provider: AiApiKeyProvider) => keys[provider] ?? null
  } as AiSettingsService;
}

function createStalledJsonResponse(onBodyRead: () => void): Response {
  return new Response(new ReadableStream<Uint8Array>({
    pull: () => {
      onBodyRead();
      return new Promise<void>(() => undefined);
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AiReasoningCapabilityService", () => {
  it("uses static capabilities for known OpenAI and CLI models", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new AiReasoningCapabilityService(createSettingsService(), fetchImpl);

    await expect(service.getCapabilities({ provider: "openai", model: "gpt-5.4-nano" })).resolves.toEqual({
      status: "supported",
      supportedEfforts: ["low", "medium", "high"]
    });
    await expect(service.getCapabilities({ provider: "claude-code", model: "haiku" })).resolves.toEqual({
      status: "unsupported",
      supportedEfforts: []
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads and filters OpenRouter reasoning metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "vendor/reasoning-model",
        reasoning: { supported_efforts: ["minimal", "low", "high", "xhigh"] }
      }]
    })));
    const service = new AiReasoningCapabilityService(createSettingsService({ openrouter: "sk-or" }), fetchImpl);

    await expect(service.getCapabilities({
      provider: "openrouter",
      model: "vendor/reasoning-model"
    })).resolves.toEqual({
      status: "supported",
      supportedEfforts: ["low", "high"]
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", expect.objectContaining({
      headers: { "Authorization": "Bearer sk-or" }
    }));
  });

  it("reports OpenRouter models without reasoning metadata as unsupported", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "vendor/plain-model" }]
    })));
    const service = new AiReasoningCapabilityService(createSettingsService(), fetchImpl);

    await expect(service.getCapabilities({ provider: "openrouter", model: "vendor/plain-model" }))
      .resolves.toEqual({ status: "unsupported", supportedEfforts: [] });
  });

  it("reads Anthropic effort capabilities", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      capabilities: {
        effort: {
          supported: true,
          low: { supported: true },
          medium: { supported: false },
          high: { supported: true }
        }
      }
    })));
    const service = new AiReasoningCapabilityService(createSettingsService({ anthropic: "sk-ant" }), fetchImpl);

    await expect(service.getCapabilities({ provider: "anthropic", model: "claude-custom" })).resolves.toEqual({
      status: "supported",
      supportedEfforts: ["low", "high"]
    });
  });

  it("deduplicates in-flight lookups and caches successful results", async () => {
    let now = 1_000;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "vendor/cached", reasoning: { supported_efforts: ["low"] } }]
    })));
    const service = new AiReasoningCapabilityService(createSettingsService(), fetchImpl, () => now);
    const request = { provider: "openrouter" as const, model: "vendor/cached" };

    const [first, second] = await Promise.all([
      service.getCapabilities(request),
      service.getCapabilities(request)
    ]);
    expect(first).toEqual(second);
    await service.getCapabilities(request);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 16 * 60_000;
    await service.getCapabilities(request);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns unknown on lookup failure and does not cache it", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const service = new AiReasoningCapabilityService(createSettingsService(), fetchImpl);
    const request = { provider: "openrouter" as const, model: "vendor/custom" };

    await expect(service.getCapabilities(request)).resolves.toEqual({
      status: "unknown",
      supportedEfforts: []
    });
    await service.getCapabilities(request);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled JSON body and releases the in-flight lookup", async () => {
    vi.useFakeTimers();
    let markBodyRead!: () => void;
    let bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve;
    });
    const receivedSignals: AbortSignal[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      receivedSignals.push(init?.signal as AbortSignal);
      const markThisBodyRead = markBodyRead;
      return createStalledJsonResponse(markThisBodyRead);
    });
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    const service = new AiReasoningCapabilityService(createSettingsService(), fetchImpl);
    const request = { provider: "openrouter" as const, model: "vendor/stalled" };

    const first = service.getCapabilities(request);
    await bodyRead;
    const firstResult = expect(first).resolves.toEqual({
      status: "unknown",
      supportedEfforts: []
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await firstResult;

    expect(receivedSignals[0]?.aborted).toBe(true);
    expect(receivedSignals[0]?.reason).toMatchObject({ name: "TimeoutError" });
    expect(clearTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve;
    });
    const second = service.getCapabilities(request);
    await bodyRead;
    const secondResult = expect(second).resolves.toEqual({
      status: "unknown",
      supportedEfforts: []
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await secondResult;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(receivedSignals[1]?.aborted).toBe(true);
    expect(clearTimeout).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
