import type { AiApiKeyProvider, AiCommitMessageProvider, AiReasoningEffort, AiSettings, GenerateCommitMessageRequest, GetAiReasoningCapabilitiesRequest, GitOperationResult } from "../shared/types";
import { getProviderLabel, isApiKeyProvider, isCliProvider, type AiSettingsService } from "./aiSettingsService";
import {
  AnthropicCommitMessageProvider,
  ClaudeCodeCommitMessageProvider,
  CodexCliCommitMessageProvider,
  OpenAiCommitMessageProvider,
  OpenRouterCommitMessageProvider,
  type CommitMessageProvider
} from "./commitMessageProviders";
import {
  createCommitMessageSystemPrompt,
  createCommitMessageUserPrompt,
  normalizeGeneratedMessage
} from "./commitMessagePromptBuilder";
import type { ProcessRunner } from "./processRunner";
import type { VcsService } from "./vcsService";

/** Whichever VCS backend owns the repo supplies the staged diff for the model. */
type StagedDiffProvider = Pick<VcsService, "getStagedDiff">;

type Fetch = typeof fetch;

export interface AiReasoningCapabilityResolver {
  getCapabilities(request: GetAiReasoningCapabilitiesRequest): Promise<{
    status: "supported" | "unsupported" | "unknown";
    supportedEfforts: AiReasoningEffort[];
  }>;
}

export class CommitMessageService {
  constructor(
    private readonly resolveService: (repoPath: string) => StagedDiffProvider | Promise<StagedDiffProvider>,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner,
    private readonly reasoningCapabilities?: AiReasoningCapabilityResolver
  ) {}

  async generateCommitMessage(request: GenerateCommitMessageRequest, signal?: AbortSignal): Promise<GitOperationResult> {
    try {
      throwIfAborted(signal);
      const settings = await this.settingsService.getSettings();
      throwIfAborted(signal);
      const selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const providerLabel = getProviderLabel(selectedProvider);

      const resolution = await resolveAiProvider(
        settings,
        providerSettings.model,
        this.settingsService,
        this.fetchImpl,
        this.runner
      );
      throwIfAborted(signal);
      if (resolution.kind === "error") {
        return createFailure(request.repoPath, resolution.message);
      }

      const service = await this.resolveService(request.repoPath);
      const diffResult = await service.getStagedDiff(request.repoPath);
      throwIfAborted(signal);
      if (diffResult.exitCode !== 0) {
        return diffResult;
      }

      const diff = diffResult.stdout.trim();
      if (!diff) {
        return createFailure(request.repoPath, "Stage changes before generating a commit message.");
      }

      const reasoningEffort = await resolveReasoningEffort(
        this.reasoningCapabilities,
        selectedProvider,
        providerSettings.model,
        providerSettings.reasoningEffort
      );
      throwIfAborted(signal);
      const message = normalizeGeneratedMessage(await resolution.provider.generate({
        repoPath: request.repoPath,
        model: providerSettings.model,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt: createCommitMessageSystemPrompt(),
        userPrompt: createCommitMessageUserPrompt(
          settings.commitMessagePrompt,
          diff,
          request.additionalContext
        )
      }));
      throwIfAborted(signal);
      if (!message) {
        return createFailure(request.repoPath, `${providerLabel} returned an empty commit message.`);
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: message,
        stderr: ""
      };
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate commit message."
      );
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason ?? new DOMException("Operation was cancelled.", "AbortError");
}

export async function resolveReasoningEffort(
  resolver: AiReasoningCapabilityResolver | undefined,
  provider: AiCommitMessageProvider,
  model: string,
  effort: AiReasoningEffort
): Promise<AiReasoningEffort | undefined> {
  if (!resolver) {
    return undefined;
  }
  const capabilities = await resolver.getCapabilities({ provider, model });
  return capabilities.status === "supported" && capabilities.supportedEfforts.includes(effort)
    ? effort
    : undefined;
}

export type AiProviderResolution =
  | { kind: "ready"; provider: CommitMessageProvider }
  | { kind: "error"; message: string };

/**
 * Shared preflight for AI generation features: verifies the selected
 * provider's model, API key, and CLI authentication, then constructs the
 * provider. `model` is passed in because callers resolve it differently
 * (e.g. PR descriptions fall back to the commit message model).
 */
export async function resolveAiProvider(
  settings: AiSettings,
  model: string,
  settingsService: AiSettingsService,
  fetchImpl: Fetch,
  runner?: ProcessRunner
): Promise<AiProviderResolution> {
  const selectedProvider = settings.selectedProvider;
  const providerLabel = getProviderLabel(selectedProvider);

  if (!model.trim()) {
    return { kind: "error", message: `${providerLabel} model is not configured.` };
  }

  const apiKey = isApiKeyProvider(selectedProvider)
    ? await settingsService.getApiKey(selectedProvider)
    : null;
  if (isApiKeyProvider(selectedProvider) && !apiKey) {
    return { kind: "error", message: `${providerLabel} API key is not configured.` };
  }

  if (isCliProvider(selectedProvider)) {
    const status = settings.cliStatus[selectedProvider];
    if (!status.detected || !status.authenticated) {
      return { kind: "error", message: `${providerLabel} is not authenticated.` };
    }
  }

  return {
    kind: "ready",
    provider: createProvider(selectedProvider, apiKey, fetchImpl, runner)
  };
}

function createProvider(
  provider: AiCommitMessageProvider,
  apiKey: string | null,
  fetchImpl: Fetch,
  runner?: ProcessRunner
): CommitMessageProvider {
  switch (provider) {
    case "openrouter":
      return new OpenRouterCommitMessageProvider(requireApiKey(provider, apiKey), fetchImpl);
    case "openai":
      return new OpenAiCommitMessageProvider(requireApiKey(provider, apiKey), fetchImpl);
    case "anthropic":
      return new AnthropicCommitMessageProvider(requireApiKey(provider, apiKey), fetchImpl);
    case "codex-cli":
      if (!runner) {
        throw new Error("Codex CLI runner is not configured.");
      }
      return new CodexCliCommitMessageProvider(runner);
    case "claude-code":
      if (!runner) {
        throw new Error("Claude Code runner is not configured.");
      }
      return new ClaudeCodeCommitMessageProvider(runner);
  }
}

function requireApiKey(provider: AiApiKeyProvider, apiKey: string | null): string {
  if (!apiKey) {
    throw new Error(`${getProviderLabel(provider)} API key is not configured.`);
  }

  return apiKey;
}

function createFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
