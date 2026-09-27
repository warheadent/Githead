import { createAiInputSizeWarning } from "./aiInputSizeWarning";
import type {
  AiCommitMessageProvider,
  CommitPlanChange,
  CommitPlanValidationRequest,
  CommitPlanValidationResult,
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult,
  GitFileDiff
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

type CommitPlanSource = Pick<VcsService, "getFileDiff" | "getCommitHistory" | "getCommitPlanDiffs">;
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

  async generateCommitPlan(request: GenerateCommitPlanRequest, signal?: AbortSignal, onWarning?: (warning: string) => void): Promise<GenerateCommitPlanResult> {
    let selectedProvider: AiCommitMessageProvider | undefined;
    let inputWarning = "";
    try {
      throwIfAborted(signal);
      const paths = [...new Set(request.paths.map((path) => path.trim()).filter(Boolean))];
      if (paths.length === 0) return failure(request.repoPath, "Select at least one working-tree file.");
      if (paths.length > MAX_COMMIT_PLAN_PATHS) {
        return failure(request.repoPath, `Commit plans support up to ${MAX_COMMIT_PLAN_PATHS} files.`);
      }

      const settings = await this.settingsService.getGenerationSettings(request.repoPath);
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
        readCommitPlanDiffs(service, request.repoPath, paths, signal),
        settings.sourceControlWritingStyle.mode === "repo_conventions"
          ? service.getCommitHistory({ repoPath: request.repoPath, limit: 12, scope: "all" }).catch(() => [])
          : Promise.resolve([])
      ]);
      throwIfAborted(signal);
      assertReadableDiffs(diffs);
      const preparedChanges = createCommitPlanChanges(diffs.filter((diff) => diff.kind !== "empty"), settings.commitPlanGranularity);
      if (preparedChanges.length === 0) return failure(request.repoPath, "No working-tree changes remain in the selected files.");
      if (preparedChanges.length > MAX_COMMIT_PLAN_CHANGES) {
        return failure(
          request.repoPath,
          `Commit plans support up to ${MAX_COMMIT_PLAN_CHANGES} changes. Select fewer files or use file grouping.`
        );
      }
      const context = createDiffContext(preparedChanges);
      const changes = preparedChanges.map((change) => ({
        ...toPublicCommitPlanChange(change),
        ...(context.incompleteChangeIds.has(change.id) ? { contextIncomplete: true } : {})
      }));

      const reasoningEffort = await resolveReasoningEffort(
        this.reasoningCapabilities,
        selectedProvider,
        model,
        providerSettings.commitPlanReasoningEffort,
        signal
      );
      throwIfAborted(signal);
      const systemPrompt = createCommitPlanSystemPrompt(settings.sourceControlWritingStyle);
      const userPrompt = createCommitPlanUserPrompt(
        changes,
        context.text,
        settings.sourceControlWritingStyle,
        recentCommits.map((commit) => commit.subject)
      );
      inputWarning = await createAiInputSizeWarning(
        { provider: selectedProvider, model },
        `${systemPrompt}\n${userPrompt}`,
        this.reasoningCapabilities,
        signal
      );
      if (inputWarning) onWarning?.(inputWarning);
      const generation = await generateCompleteText(resolution.provider, {
        repoPath: request.repoPath,
        model,
        maxTokens: COMMIT_PLAN_MAX_TOKENS,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt,
        userPrompt
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
        stderr: inputWarning,
        ...(generation.retriedAfterLength ? { retriedAfterLength: true } : {})
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      reportAiGenerationFailure("commit-plan", selectedProvider, error);
      return failure(
        request.repoPath,
        [inputWarning, error instanceof Error ? error.message : "Unable to generate a commit plan."].filter(Boolean).join("\n")
      );
    }
  }

  async validateCommitPlan(
    request: CommitPlanValidationRequest,
    signal?: AbortSignal
  ): Promise<CommitPlanValidationResult> {
    try {
      throwIfAborted(signal);
      const paths = [...new Set(request.paths.map((path) => path.trim()).filter(Boolean))];
      if (
        paths.length > MAX_COMMIT_PLAN_PATHS ||
        request.changes.length > MAX_COMMIT_PLAN_CHANGES
      ) {
        return validationResult(request.repoPath, false);
      }

      const service = await this.resolveService(request.repoPath);
      const diffs = paths.length > 0 ? await readCommitPlanDiffs(service, request.repoPath, paths, signal) : [];
      assertReadableDiffs(diffs);
      throwIfAborted(signal);
      const currentChanges = createCommitPlanChanges(diffs.filter((diff) => diff.kind !== "empty"), request.granularity).map(toPublicCommitPlanChange);
      if (currentChanges.length > MAX_COMMIT_PLAN_CHANGES) {
        return validationResult(request.repoPath, false, `Commit plans support up to ${MAX_COMMIT_PLAN_CHANGES} changes. Select fewer files.`);
      }
      return { ...validationResult(request.repoPath, haveSameCommitPlanChanges(request.changes, currentChanges)), currentChanges };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      return validationResult(
        request.repoPath,
        false,
        error instanceof Error ? error.message : "Unable to validate the commit plan."
      );
    }
  }
}

function haveSameCommitPlanChanges(left: CommitPlanChange[], right: CommitPlanChange[]): boolean {
  if (left.length !== right.length) return false;
  const identities = (changes: CommitPlanChange[]): string[] => changes
    .map((change) => `${change.path}\0${change.kind}\0${change.fingerprint}`)
    .sort();
  const leftIdentities = identities(left);
  const rightIdentities = identities(right);
  return leftIdentities.every((identity, index) => identity === rightIdentities[index]);
}

function readCommitPlanDiffs(
  service: CommitPlanSource,
  repoPath: string,
  paths: string[],
  signal?: AbortSignal
): Promise<GitFileDiff[]> {
  if (service.getCommitPlanDiffs) {
    return service.getCommitPlanDiffs({
      repoPath,
      paths,
      ...(signal ? { signal } : {})
    });
  }
  return mapWithConcurrency(paths, DIFF_READ_CONCURRENCY, (path) => service.getFileDiff({
    repoPath,
    path,
    side: "unstaged"
  }));
}

function validationResult(repoPath: string, valid: boolean, stderr = ""): CommitPlanValidationResult {
  return { repoPath, valid, stderr };
}

export function createDiffContext(changes: PreparedCommitPlanChange[]): { text: string; incompleteChangeIds: Set<string> } {
  return {
    text: changes.map((change) => `### ${change.id}\n${change.promptText}`).join("\n\n"),
    incompleteChangeIds: new Set(changes.filter((change) => change.contextIncomplete).map((change) => change.id))
  };
}

function assertReadableDiffs(diffs: GitFileDiff[]): void {
  const failed = diffs.find((diff) => diff.kind === "error");
  if (failed) throw new Error(`Unable to read ${failed.path}: ${failed.text}`);
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
