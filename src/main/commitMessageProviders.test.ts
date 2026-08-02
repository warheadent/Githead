import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProcessRunOptions, ProcessRunner } from "./processRunner";
import {
  AnthropicCommitMessageProvider,
  CodexCliCommitMessageProvider,
  OpenAiCommitMessageProvider,
  OpenRouterCommitMessageProvider,
  type CommitMessageProviderInput
} from "./commitMessageProviders";

const providerInput: CommitMessageProviderInput = {
  repoPath: "D:\\Repo",
  model: "test-model",
  systemPrompt: "System prompt",
  userPrompt: "User prompt"
};

const apiProviderFactories = [
  {
    name: "OpenRouter",
    create: (fetchImpl: typeof fetch) => new OpenRouterCommitMessageProvider("test-key", fetchImpl)
  },
  {
    name: "OpenAI",
    create: (fetchImpl: typeof fetch) => new OpenAiCommitMessageProvider("test-key", fetchImpl)
  },
  {
    name: "Anthropic",
    create: (fetchImpl: typeof fetch) => new AnthropicCommitMessageProvider("test-key", fetchImpl)
  }
] as const;

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

describe("commit message provider cancellation", () => {
  it("propagates an external abort to an in-flight API request", async () => {
    const controller = new AbortController();
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    let receivedSignal: AbortSignal | undefined;
    const fetchImpl = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      receivedSignal = init?.signal ?? undefined;
      requestStarted();
      return new Promise((_resolve, reject) => {
        receivedSignal?.addEventListener("abort", () => reject(receivedSignal?.reason), { once: true });
      });
    };
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl as typeof fetch);
    const abortReason = new DOMException("Generation cancelled.", "AbortError");

    const generation = provider.generate({ ...providerInput, signal: controller.signal });
    await started;
    controller.abort(abortReason);

    await expect(generation).rejects.toBe(abortReason);
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).not.toBe(controller.signal);
    expect(receivedSignal?.aborted).toBe(true);
    expect(receivedSignal?.reason).toBe(abortReason);
  });

  it("cleans up the external abort listener and timeout exactly once after an API request settles", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "feat: generated" } }]
    }));
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl as typeof fetch);

    await expect(provider.generate({ ...providerInput, signal: controller.signal }))
      .resolves.toEqual({ text: "feat: generated", finishReason: "complete" });

    const abortRegistration = addListener.mock.calls.find(([event]) => event === "abort");
    expect(abortRegistration).toBeDefined();
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", abortRegistration?.[1]);
    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });

  it.each(apiProviderFactories)("keeps $name cancellation active while a JSON body is stalled", async ({ create }) => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    let markBodyRead!: () => void;
    const bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve;
    });
    const fetchImpl = async () => createStalledJsonResponse(markBodyRead);
    const provider = create(fetchImpl as typeof fetch);
    const abortReason = new DOMException("Generation cancelled during body parsing.", "AbortError");

    const generation = provider.generate({ ...providerInput, signal: controller.signal });
    await bodyRead;
    controller.abort(abortReason);

    await expect(generation).rejects.toBe(abortReason);
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", addListener.mock.calls[0]?.[1]);
    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });

  it("keeps the timeout active while a JSON body is stalled and cleans up exactly once", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    let markBodyRead!: () => void;
    const bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve;
    });
    const fetchImpl = async () => createStalledJsonResponse(markBodyRead);
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl as typeof fetch);

    try {
      const generation = provider.generate({ ...providerInput, signal: controller.signal });
      await bodyRead;
      const rejection = expect(generation).rejects.toMatchObject({
        name: "TimeoutError",
        message: "AI provider request timed out after 60000ms."
      });

      await vi.advanceTimersByTimeAsync(60_000);
      await rejection;

      expect(controller.signal.aborted).toBe(false);
      expect(addListener).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith("abort", addListener.mock.calls[0]?.[1]);
      expect(clearTimeout).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the external abort signal unchanged to CLI runners", async () => {
    const controller = new AbortController();
    let receivedOptions: ProcessRunOptions | undefined;
    const runner: ProcessRunner = {
      run: async (_command, _args, options) => {
        receivedOptions = options;
        return { exitCode: 0, stdout: "feat: generated", stderr: "" };
      }
    };
    const provider = new CodexCliCommitMessageProvider(runner);

    await provider.generate({ ...providerInput, signal: controller.signal });

    expect(receivedOptions?.signal).toBe(controller.signal);
  });
});

describe("OpenRouter Flex fallback", () => {
  it("uses the default tier after two temporary Flex failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(createResponse(429, "Flex capacity is unavailable."))
      .mockResolvedValueOnce(createResponse(503, "Flex service is unavailable."))
      .mockResolvedValueOnce(createResponse(200, undefined, "feat: use the default tier"));
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl);

    await expect(provider.generate(providerInput)).resolves.toEqual({
      text: "feat: use the default tier",
      finishReason: "complete"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(getServiceTiers(fetchImpl)).toEqual(["flex", "flex", "default"]);
  });

  it("returns a successful second Flex attempt without using the default tier", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(createResponse(429, "Flex capacity is unavailable."))
      .mockResolvedValueOnce(createResponse(200, undefined, "fix: retry Flex generation"));
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl);

    await expect(provider.generate(providerInput)).resolves.toEqual({
      text: "fix: retry Flex generation",
      finishReason: "complete"
    });
    expect(getServiceTiers(fetchImpl)).toEqual(["flex", "flex"]);
  });

  it("does not retry a permanent OpenRouter failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(createResponse(400, "Invalid model."));
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl);

    await expect(provider.generate(providerInput)).rejects.toThrow("Invalid model.");
    expect(getServiceTiers(fetchImpl)).toEqual(["flex"]);
  });
});

function createResponse(status: number, error?: string, content?: string): Response {
  return new Response(JSON.stringify({
    ...(error ? { error: { message: error } } : {}),
    ...(content ? { choices: [{ finish_reason: "stop", message: { content } }] } : {})
  }), { status });
}

function getServiceTiers(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>): string[] {
  return fetchImpl.mock.calls.map(([, init]) => {
    const body = JSON.parse(String(init?.body)) as { service_tier: string };
    return body.service_tier;
  });
}
