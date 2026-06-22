import type { AiApiKeyProvider, AiCommitMessageProvider, GenerateCommitMessageRequest, GitOperationResult } from "../shared/types";
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

export class CommitMessageService {
  constructor(
    private readonly resolveService: (repoPath: string) => StagedDiffProvider | Promise<StagedDiffProvider>,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner
  ) {}

  async generateCommitMessage(request: GenerateCommitMessageRequest): Promise<GitOperationResult> {
    try {
      const settings = await this.settingsService.getSettings();
      const selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const providerLabel = getProviderLabel(selectedProvider);

      if (!providerSettings.model.trim()) {
        return createFailure(request.repoPath, `${providerLabel} model is not configured.`);
      }

      const apiKey = isApiKeyProvider(selectedProvider)
        ? await this.settingsService.getApiKey(selectedProvider)
        : null;
      if (isApiKeyProvider(selectedProvider) && !apiKey) {
        return createFailure(request.repoPath, `${providerLabel} API key is not configured.`);
      }

      if (isCliProvider(selectedProvider)) {
        const status = settings.cliStatus[selectedProvider];
        if (!status.detected || !status.authenticated) {
          return createFailure(request.repoPath, `${providerLabel} is not authenticated.`);
        }
      }

      const service = await this.resolveService(request.repoPath);
      const diffResult = await service.getStagedDiff(request.repoPath);
      if (diffResult.exitCode !== 0) {
        return diffResult;
      }

      const diff = diffResult.stdout.trim();
      if (!diff) {
        return createFailure(request.repoPath, "Stage changes before generating a commit message.");
      }

      const provider = this.createProvider(selectedProvider, apiKey);
      const message = normalizeGeneratedMessage(await provider.generate({
        repoPath: request.repoPath,
        model: providerSettings.model,
        systemPrompt: createCommitMessageSystemPrompt(),
        userPrompt: createCommitMessageUserPrompt(
          settings.commitMessagePrompt,
          diff,
          request.additionalContext
        )
      }));
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
      return createFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate commit message."
      );
    }
  }

  private createProvider(provider: AiCommitMessageProvider, apiKey: string | null): CommitMessageProvider {
    switch (provider) {
      case "openrouter":
        return new OpenRouterCommitMessageProvider(requireApiKey(provider, apiKey), this.fetchImpl);
      case "openai":
        return new OpenAiCommitMessageProvider(requireApiKey(provider, apiKey), this.fetchImpl);
      case "anthropic":
        return new AnthropicCommitMessageProvider(requireApiKey(provider, apiKey), this.fetchImpl);
      case "codex-cli":
        if (!this.runner) {
          throw new Error("Codex CLI runner is not configured.");
        }
        return new CodexCliCommitMessageProvider(this.runner);
      case "claude-code":
        if (!this.runner) {
          throw new Error("Claude Code runner is not configured.");
        }
        return new ClaudeCodeCommitMessageProvider(this.runner);
    }
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
