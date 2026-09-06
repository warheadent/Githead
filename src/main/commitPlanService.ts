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

  async generateCommitPlan(request: GenerateCommitPlanRequest, signal?: AbortSignal): Promise<GenerateCommitPlanResult> {
    let selectedProvider: AiCommitMessageProvider | undefined;
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
      const generation = await generateCompleteText(resolution.provider, {
        repoPath: request.repoPath,
        model,
        maxTokens: COMMIT_PLAN_MAX_TOKENS,
        ...(signal ? { signal } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        systemPrompt: createCommitPlanSystemPrompt(settings.sourceControlWritingStyle),
        userPrompt: createCommitPlanUserPrompt(
          changes,
          context.text,
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
  const incompleteChangeIds = new Set<string>();
  const marker = "\n[Diff shortened; review file]";
  // Give every change a share first, then redistribute space left by small diffs.
  const sections = changes.map((change) => ({
    change,
    heading: `### ${change.id}\n`,
    budget: 0
  }));
  let remaining = Math.max(0, MAX_COMMIT_PLAN_DIFF_CHARS - sections.reduce((total, section) => total + section.heading.length + 2, 0));
  let pending = [...sections];
  while (remaining > 0 && pending.length > 0) {
    const share = Math.max(1, Math.floor(remaining / pending.length));
    for (const section of pending) {
      const amount = Math.min(share, section.change.promptText.length - section.budget, remaining);
      section.budget += amount;
      remaining -= amount;
    }
    pending = pending.filter((section) => section.budget < section.change.promptText.length);
  }
  const text = sections.map(({ change, heading, budget }) => {
    const shortened = budget < change.promptText.length;
    if (shortened || change.contextIncomplete) incompleteChangeIds.add(change.id);
    if (!shortened) return heading + change.promptText;
    const contentBudget = Math.max(0, budget - marker.length);
    return heading + change.promptText.slice(0, contentBudget) + marker.slice(0, budget - contentBudget);
  }).join("\n\n");
  return { text, incompleteChangeIds };
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
