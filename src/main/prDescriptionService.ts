import type { AiCommitMessageProvider, GeneratePrDescriptionRequest, GeneratePrTitleRequest, GitOperationResult } from "../shared/types";
import {
  recordAiGenerationRecovery,
  recordAiPreflightFailure,
  reportAiEmptyResponse,
  reportAiGenerationFailure
} from "./aiOperationReporter";
import type { AiSettingsService } from "./aiSettingsService";
import { getAiProviderLabel } from "../shared/aiProvider";
import { normalizeGeneratedMessage } from "./commitMessagePromptBuilder";
import { generateCompleteText } from "./commitMessageProviders";
import { resolveAiProvider, resolveReasoningEffort, type AiReasoningCapabilityResolver } from "./commitMessageService";
import {
  createPrDescriptionSystemPrompt,
  createPrDescriptionUserPrompt,
  createPrTitleSystemPrompt,
  createPrTitleUserPrompt
} from "./prDescriptionPromptBuilder";
import type { GitService } from "./gitService";
import type { ProcessRunner } from "./processRunner";

/**
 * PR descriptions cover a whole branch, so they get a much larger response
 * budget than the 220-token commit message default. Generous on purpose:
 * reasoning models spend part of the budget on reasoning tokens.
 */
const PR_DESCRIPTION_MAX_TOKENS = 2_000;
const PR_TITLE_MAX_TOKENS = 120;

type Fetch = typeof fetch;

export class PrDescriptionService {
  constructor(
    private readonly gitService: GitService,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner,
    private readonly reasoningCapabilities?: AiReasoningCapabilityResolver
  ) {}

  async generatePrTitle(request: GeneratePrTitleRequest, signal?: AbortSignal): Promise<GitOperationResult> {
    let selectedProvider: AiCommitMessageProvider | undefined;
    try {
      throwIfAborted(signal);
      const settings = await this.settingsService.getGenerationSettings(request.repoPath);
      throwIfAborted(signal);
      selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const providerLabel = getAiProviderLabel(selectedProvider);
      const model = providerSettings.model;

      const resolution = await resolveAiProvider(
        settings,
        model,
        this.settingsService,
        this.fetchImpl,
        this.runner
      );
      throwIfAborted(signal);
      if (resolution.kind === "error") {
        recordAiPreflightFailure("pull-request-title", selectedProvider, resolution.category);
        return createFailure(request.repoPath, resolution.message);
      }

      const range = await this.getRangeContext(
        request,
        signal,
        settings.sourceControlWritingStyle.mode === "repo_conventions"
      );
      if ("failure" in range) {
        return range.failure;
      }

      const reasoningEffort = await resolveReasoningEffort(
        this.reasoningCapabilities,
        selectedProvider,
        model,
        providerSettings.reasoningEffort,
        signal
      );
      throwIfAborted(signal);
      const generation = await generateCompleteText(resolution.provider, {
        repoPath: request.repoPath,
        model,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt: createPrTitleSystemPrompt(settings.sourceControlWritingStyle),
        userPrompt: createPrTitleUserPrompt(
          request.baseRef.trim(),
          request.headRef.trim(),
          range.commitLog,
          range.diff,
          range.recentCommitSubjects
        ),
        maxTokens: PR_TITLE_MAX_TOKENS
      });
      const title = normalizeGeneratedPrTitle(generation.text);
      throwIfAborted(signal);
      if (!title) {
        reportAiEmptyResponse("pull-request-title", selectedProvider);
        return createFailure(request.repoPath, `${providerLabel} returned an empty pull request title.`);
      }

      if (generation.retriedAfterLength) {
        recordAiGenerationRecovery("pull-request-title", selectedProvider);
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: title,
        stderr: generation.retriedAfterLength
          ? "The first generation reached its output limit. Githead retried with a larger limit."
          : ""
      };
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }
      reportAiGenerationFailure("pull-request-title", selectedProvider, error);
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate pull request title."
      );
    }
  }

  async generatePrDescription(request: GeneratePrDescriptionRequest, signal?: AbortSignal): Promise<GitOperationResult> {
    let selectedProvider: AiCommitMessageProvider | undefined;
    try {
      throwIfAborted(signal);
      const settings = await this.settingsService.getGenerationSettings(request.repoPath);
      throwIfAborted(signal);
      selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const providerLabel = getAiProviderLabel(selectedProvider);
      const model = providerSettings.prDescriptionModel.trim() || providerSettings.model;

      const resolution = await resolveAiProvider(
        settings,
        model,
        this.settingsService,
        this.fetchImpl,
        this.runner
      );
      throwIfAborted(signal);
      if (resolution.kind === "error") {
        recordAiPreflightFailure("pull-request-description", selectedProvider, resolution.category);
        return createFailure(request.repoPath, resolution.message);
      }

      const range = await this.getRangeContext(
        request,
        signal,
        settings.sourceControlWritingStyle.mode === "repo_conventions"
      );
      if ("failure" in range) {
        return range.failure;
      }

      const reasoningEffort = await resolveReasoningEffort(
        this.reasoningCapabilities,
        selectedProvider,
        model,
        providerSettings.prDescriptionReasoningEffort,
        signal
      );
      throwIfAborted(signal);
      const generation = await generateCompleteText(resolution.provider, {
        repoPath: request.repoPath,
        model,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt: createPrDescriptionSystemPrompt(settings.sourceControlWritingStyle),
        userPrompt: createPrDescriptionUserPrompt(
          settings.prDescriptionPrompt,
          request.baseRef.trim(),
          request.headRef.trim(),
          range.commitLog,
          range.diff,
          request.title,
          settings.sourceControlWritingStyle,
          range.recentCommitSubjects
        ),
        maxTokens: PR_DESCRIPTION_MAX_TOKENS
      });
      const description = normalizeGeneratedMessage(generation.text);
      throwIfAborted(signal);
      if (!description) {
        reportAiEmptyResponse("pull-request-description", selectedProvider);
        return createFailure(request.repoPath, `${providerLabel} returned an empty pull request description.`);
      }

      if (generation.retriedAfterLength) {
        recordAiGenerationRecovery("pull-request-description", selectedProvider);
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: description,
        stderr: generation.retriedAfterLength
          ? "The first generation reached its output limit. Githead retried with a larger limit."
          : ""
      };
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }
      reportAiGenerationFailure("pull-request-description", selectedProvider, error);
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate pull request description."
      );
    }
  }

  private async getRangeContext(
    request: GeneratePrDescriptionRequest | GeneratePrTitleRequest,
    signal?: AbortSignal,
    includeRecentCommitSubjects = false
  ): Promise<
    | { diff: string; commitLog: string; recentCommitSubjects: string[] }
    | { failure: GitOperationResult }
  > {
    throwIfAborted(signal);
    const recentCommitSubjectsPromise = includeRecentCommitSubjects
      ? this.gitService.getCommitHistory({
          repoPath: request.repoPath,
          limit: 12,
          scope: "all"
        }).then((commits) => commits.map((commit) => commit.subject)).catch(() => [])
      : Promise.resolve([] as string[]);
    const range = await this.gitService.getBranchRangeContext({
      repoPath: request.repoPath,
      baseRef: request.baseRef,
      headRef: request.headRef
    });
    throwIfAborted(signal);
    if (range.diff.exitCode !== 0) {
      return { failure: range.diff };
    }
    if (range.log.exitCode !== 0) {
      return { failure: range.log };
    }

    const diff = range.diff.stdout.trim();
    const commitLog = range.log.stdout.trim();
    if (!diff && !commitLog) {
      return {
        failure: createFailure(
          request.repoPath,
          `No commits found between ${request.baseRef.trim()} and ${request.headRef.trim()}.`
        )
      };
    }

    const recentCommitSubjects = await recentCommitSubjectsPromise;

    return { diff, commitLog, recentCommitSubjects };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason ?? new DOMException("Operation was cancelled.", "AbortError");
}

function normalizeGeneratedPrTitle(message: string): string {
  return normalizeGeneratedMessage(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.replace(/^["']|["']$/g, "")
    .trim()
    ?? "";
}

function createFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
