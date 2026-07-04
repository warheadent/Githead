import type { GeneratePrDescriptionRequest, GitOperationResult } from "../shared/types";
import { getProviderLabel, type AiSettingsService } from "./aiSettingsService";
import { normalizeGeneratedMessage } from "./commitMessagePromptBuilder";
import { resolveAiProvider } from "./commitMessageService";
import {
  createPrDescriptionSystemPrompt,
  createPrDescriptionUserPrompt
} from "./prDescriptionPromptBuilder";
import type { GitService } from "./gitService";
import type { ProcessRunner } from "./processRunner";

/**
 * PR descriptions cover a whole branch, so they get a much larger response
 * budget than the 220-token commit message default. Generous on purpose:
 * reasoning models spend part of the budget on reasoning tokens.
 */
const PR_DESCRIPTION_MAX_TOKENS = 2_000;

type Fetch = typeof fetch;

export class PrDescriptionService {
  constructor(
    private readonly gitService: GitService,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner
  ) {}

  async generatePrDescription(request: GeneratePrDescriptionRequest): Promise<GitOperationResult> {
    try {
      const settings = await this.settingsService.getSettings();
      const selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const providerLabel = getProviderLabel(selectedProvider);
      const model = providerSettings.prDescriptionModel.trim() || providerSettings.model;

      const resolution = await resolveAiProvider(
        settings,
        model,
        this.settingsService,
        this.fetchImpl,
        this.runner
      );
      if (resolution.kind === "error") {
        return createFailure(request.repoPath, resolution.message);
      }

      const range = await this.gitService.getBranchRangeContext({
        repoPath: request.repoPath,
        baseRef: request.baseRef,
        headRef: request.headRef
      });
      if (range.diff.exitCode !== 0) {
        return range.diff;
      }
      if (range.log.exitCode !== 0) {
        return range.log;
      }

      const diff = range.diff.stdout.trim();
      const commitLog = range.log.stdout.trim();
      if (!diff && !commitLog) {
        return createFailure(
          request.repoPath,
          `No commits found between ${request.baseRef.trim()} and ${request.headRef.trim()}.`
        );
      }

      const description = normalizeGeneratedMessage(await resolution.provider.generate({
        repoPath: request.repoPath,
        model,
        systemPrompt: createPrDescriptionSystemPrompt(),
        userPrompt: createPrDescriptionUserPrompt(
          settings.prDescriptionPrompt,
          commitLog,
          diff,
          request.title
        ),
        maxTokens: PR_DESCRIPTION_MAX_TOKENS
      }));
      if (!description) {
        return createFailure(request.repoPath, `${providerLabel} returned an empty pull request description.`);
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: description,
        stderr: ""
      };
    } catch (error) {
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate pull request description."
      );
    }
  }
}

function createFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
