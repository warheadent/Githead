import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SERVICE_TIER,
  FLEX_SERVICE_TIER,
  generateReleaseSummary
} from "./releaseSummaryClient.mjs";

const payload = {
  model: "openai/gpt-5.6-luna",
  temperature: 0.2,
  max_tokens: 900,
  messages: []
};

describe("generateReleaseSummary", () => {
  it("uses GPT-5.6 Luna on Flex when the first request succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(successResponse("# Release notes", FLEX_SERVICE_TIER));

    const summary = await generateReleaseSummary(createOptions({ fetchImpl }));

    expect(summary).toEqual({ body: "# Release notes", serviceTier: FLEX_SERVICE_TIER });
    expect(requestTier(fetchImpl, 0)).toBe(FLEX_SERVICE_TIER);
    expect(requestModel(fetchImpl, 0)).toBe("openai/gpt-5.6-luna");
  });

  it("retries temporary Flex failures three times before succeeding", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(successResponse("# Release notes", FLEX_SERVICE_TIER));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(generateReleaseSummary(createOptions({ fetchImpl, sleep }))).resolves.toEqual({ body: "# Release notes", serviceTier: FLEX_SERVICE_TIER });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.map((_, index) => requestTier(fetchImpl, index))).toEqual([FLEX_SERVICE_TIER, FLEX_SERVICE_TIER, FLEX_SERVICE_TIER, FLEX_SERVICE_TIER]);
    expect(sleep).toHaveBeenCalledWith(5_000);
    expect(sleep).toHaveBeenCalledWith(15_000);
    expect(sleep).toHaveBeenCalledWith(45_000);
  });

  it("uses Retry-After when it fits in the Flex wait limit", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(429, { "Retry-After": "30" }))
      .mockResolvedValueOnce(successResponse("# Release notes", FLEX_SERVICE_TIER));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await generateReleaseSummary(createOptions({ fetchImpl, sleep }));

    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("uses capped backoff when Retry-After is unusable", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(503, { "Retry-After": "later" }))
      .mockResolvedValueOnce(successResponse("# Release notes", FLEX_SERVICE_TIER));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await generateReleaseSummary(createOptions({ fetchImpl, sleep }));

    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  it("falls back immediately when Retry-After exceeds the Flex wait limit", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(503, { "Retry-After": "301" }))
      .mockResolvedValueOnce(successResponse("# Release notes", DEFAULT_SERVICE_TIER));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const summary = await generateReleaseSummary(createOptions({ fetchImpl, sleep }));

    expect(summary.serviceTier).toBe(DEFAULT_SERVICE_TIER);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestTier(fetchImpl, 1)).toBe(DEFAULT_SERVICE_TIER);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("falls back once after all Flex retries fail", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(successResponse("# Release notes", DEFAULT_SERVICE_TIER));

    await expect(generateReleaseSummary(createOptions({ fetchImpl }))).resolves.toEqual({ body: "# Release notes", serviceTier: DEFAULT_SERVICE_TIER });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(requestTier(fetchImpl, 4)).toBe(DEFAULT_SERVICE_TIER);
  });

  it("falls back immediately when no endpoint accepts the Flex parameters", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(404, {}, JSON.stringify({
        error: { message: "No endpoints found that can handle the requested parameters." }
      })))
      .mockResolvedValueOnce(successResponse("# Release notes", DEFAULT_SERVICE_TIER));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(generateReleaseSummary(createOptions({ fetchImpl, sleep }))).resolves.toEqual({
      body: "# Release notes",
      serviceTier: DEFAULT_SERVICE_TIER
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestTier(fetchImpl, 1)).toBe(DEFAULT_SERVICE_TIER);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not hide an unrelated 404 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(404, {}, "Unknown model"));

    await expect(generateReleaseSummary(createOptions({ fetchImpl }))).rejects.toThrow("OpenRouter request failed with 404: Unknown model");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-temporary failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401, {}, "Invalid key"));

    await expect(generateReleaseSummary(createOptions({ fetchImpl }))).rejects.toThrow("OpenRouter request failed with 401: Invalid key");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops when the default-tier fallback fails", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse(503, { "Retry-After": "301" }))
      .mockResolvedValueOnce(errorResponse(503, {}, "No default capacity"));

    await expect(generateReleaseSummary(createOptions({ fetchImpl }))).rejects.toThrow("OpenRouter request failed with 503: No default capacity");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops when OpenRouter returns empty or invalid successful content", async () => {
    const emptyFetch = vi.fn().mockResolvedValue(successResponse("", FLEX_SERVICE_TIER));
    const invalidFetch = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(generateReleaseSummary(createOptions({ fetchImpl: emptyFetch }))).rejects.toThrow("OpenRouter returned an empty release summary.");
    await expect(generateReleaseSummary(createOptions({ fetchImpl: invalidFetch }))).rejects.toThrow("OpenRouter returned invalid JSON:");
  });
});

function createOptions(overrides = {}) {
  return {
    apiKey: "test-key",
    payload,
    referer: "https://github.com/warheadent/Githead",
    title: "Githead Release Summary",
    log: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function successResponse(content, serviceTier) {
  return new Response(JSON.stringify({
    service_tier: serviceTier,
    choices: [{ message: { content } }]
  }), { status: 200 });
}

function errorResponse(status, headers = {}, body = "Temporary failure") {
  return new Response(body, { status, headers });
}

function requestTier(fetchImpl, index) {
  return JSON.parse(fetchImpl.mock.calls[index][1].body).service_tier;
}

function requestModel(fetchImpl, index) {
  return JSON.parse(fetchImpl.mock.calls[index][1].body).model;
}
