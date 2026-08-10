import type {
  AiCommitMessageProvider,
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult
} from "../shared/types";
import {
  recordAiGenerationRecovery,
  recordAiPreflightFailure,
  reportAiGenerationFailure
} from "./aiOperationReporter";
import type { AiSettingsService } from "./aiSettingsService";
import { generateCompleteText } from "./commitMessageProviders";
import {
  createCommitPlanSystemPrompt,
  createCommitPlanUserPrompt,
  MAX_COMMIT_PLAN_DIFF_CHARS,
  MAX_COMMIT_PLAN_PATHS,
  parseCommitPlanResponse
} from "./commitPlanPromptBuilder";
import {
  createCommitPlanChanges,
  MAX_COMMIT_PLAN_CHANGES,
  toPublicCommitPlanChange,
  type PreparedCommitPlanChange
} from "./commitPlanChanges";
import { resolveAiProvider, resolveReasoningEffort, type AiReasoningCapabilityResolver } from "./commitMessageService";
import { mapWithConcurrency } from "./asyncMap";
import type { ProcessRunner } from "./processRunner";
import type { VcsService } from "./vcsService";

type CommitPlanSource = Pick<VcsService, "getFileDiff" | "getCommitHistory">;
type Fetch = typeof fetch;

const DIFF_READ_CONCURRENCY = 4;
const COMMIT_PLAN_MAX_TOKENS = 16_384;

export class CommitPlanService {
  constructor(
    private readonly resolveService: (repoPath: string) => CommitPlanSource | Promise<CommitPlanSource>,
    private readonly settingsService: AiSettingsService,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner,
    private readonly reasoningCapabilities?: AiReasoningCapabilityResolver
  ) {}

  async generateCommitPlan(request: GenerateCommitPlanRequest, signal?: AbortSignal): Promise<GenerateCommitPlanResult> {
    let selectedProvider: AiCommitMessageProvider | undefined;
    try {
      throwIfAborted(signal);
      const paths = [...new Set(request.paths.map((path) => path.trim()).filter(Boolean))];
      if (paths.length === 0) return failure(request.repoPath, "Select at least one working-tree file.");
      if (paths.length > MAX_COMMIT_PLAN_PATHS) {
        return failure(request.repoPath, `Commit plans support up to ${MAX_COMMIT_PLAN_PATHS} files.`);
      }

      const settings = await this.settingsService.getSettings(request.repoPath);
      throwIfAborted(signal);
      selectedProvider = settings.selectedProvider;
      const providerSettings = settings.providers[selectedProvider];
      const model = providerSettings.commitPlanModel?.trim() || providerSettings.model;
      const resolution = await resolveAiProvider(
        settings,
        model,
        this.settingsService,
        this.fetchImpl,
        this.runner
      );
      throwIfAborted(signal);
      if (resolution.kind === "error") {
        recordAiPreflightFailure("commit-plan", selectedProvider, resolution.category);
        return failure(request.repoPath, resolution.message);
      }

      const service = await this.resolveService(request.repoPath);
      const [diffs, recentCommits] = await Promise.all([
        mapWithConcurrency(paths, DIFF_READ_CONCURRENCY, (path) => service.getFileDiff({
          repoPath: request.repoPath,
          path,
          side: "unstaged"
        })),
        settings.sourceControlWritingStyle.mode === "repo_conventions"
          ? service.getCommitHistory({ repoPath: request.repoPath, limit: 12, scope: "all" }).catch(() => [])
          : Promise.resolve([])
      ]);
      throwIfAborted(signal);
      const preparedChanges = createCommitPlanChanges(diffs, settings.commitPlanGranularity);
      if (preparedChanges.length > MAX_COMMIT_PLAN_CHANGES) {
        return failure(
          request.repoPath,
          `Commit plans support up to ${MAX_COMMIT_PLAN_CHANGES} changes. Select fewer files or use file grouping.`
        );
      }
      const changes = preparedChanges.map(toPublicCommitPlanChange);

      const reasoningEffort = await resolveReasoningEffort(
        this.reasoningCapabilities,
        selectedProvider,
        model,
        providerSettings.commitPlanReasoningEffort
      );
      throwIfAborted(signal);
      const generation = await generateCompleteText(resolution.provider, {
        repoPath: request.repoPath,
        model,
        maxTokens: COMMIT_PLAN_MAX_TOKENS,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt: createCommitPlanSystemPrompt(settings.sourceControlWritingStyle),
        userPrompt: createCommitPlanUserPrompt(
          changes,
          createDiffContext(preparedChanges),
          settings.sourceControlWritingStyle,
          recentCommits.map((commit) => commit.subject)
        )
      });
      throwIfAborted(signal);
      const plan = parseCommitPlanResponse(generation.text, changes, settings.commitPlanGranularity);

      if (generation.retriedAfterLength) {
        recordAiGenerationRecovery("commit-plan", selectedProvider);
      }

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        plan,
        stderr: "",
        ...(generation.retriedAfterLength ? { retriedAfterLength: true } : {})
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      reportAiGenerationFailure("commit-plan", selectedProvider, error);
      return failure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to generate a commit plan."
      );
    }
  }
}

function createDiffContext(changes: PreparedCommitPlanChange[]): string {
  const sections: string[] = [];
  let remaining = MAX_COMMIT_PLAN_DIFF_CHARS;

  for (const change of changes) {
    const heading = `### ${change.id}: ${change.path}${change.kind === "hunk" ? ` (${change.label})` : " (whole file)"}\n`;
    if (remaining <= heading.length) break;
    const fullSection = `${heading}${change.promptText}`;
    const section = fullSection.length <= remaining
      ? fullSection
      : `${heading}[Change diff omitted by Githead]`;
    sections.push(section);
    remaining -= section.length + 2;
    if (remaining <= 0) break;
  }

  return sections.join("\n\n");
}

function failure(repoPath: string, stderr: string): GenerateCommitPlanResult {
  return {
    repoPath,
    exitCode: -1,
    plan: null,
    stderr
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Operation was cancelled.", "AbortError");
}
