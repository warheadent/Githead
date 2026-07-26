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
      choices: [{ message: { content: "feat: generated" } }]
    }));
    const provider = new OpenRouterCommitMessageProvider("test-key", fetchImpl as typeof fetch);

    await expect(provider.generate({ ...providerInput, signal: controller.signal }))
      .resolves.toBe("feat: generated");

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
