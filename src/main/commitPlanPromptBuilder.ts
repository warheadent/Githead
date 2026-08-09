import { createCommitWritingStyleInstructions, DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import type { CommitPlan, CommitPlanChange, CommitPlanGranularity, SourceControlWritingStyle } from "../shared/types";
import { MAX_COMMIT_PLAN_CHANGES } from "./commitPlanChanges";

export const MAX_COMMIT_PLAN_PATHS = 500;
export const MAX_COMMIT_PLAN_GROUPS = 50;
export const MAX_COMMIT_PLAN_DIFF_CHARS = 80_000;

interface RawCommitPlanGroup {
  message?: unknown;
  rationale?: unknown;
  changeIds?: unknown;
}

interface RawCommitPlan {
  groups?: unknown;
}

export function createCommitPlanSystemPrompt(
  style: SourceControlWritingStyle = DEFAULT_SOURCE_CONTROL_WRITING_STYLE
): string {
  return [
    "You organize working-tree changes into a small ordered set of coherent Git commits.",
    "Group changes by one purpose or behavior, not only by directory or file type.",
    "Keep tests with the production change they verify unless the tests are independently useful.",
    "Do not invent files, intent, issue numbers, behavior, or test results.",
    ...createCommitWritingStyleInstructions(style),
    "Write one imperative commit subject per group with 72 characters or fewer and no trailing period.",
    "Write a concise rationale that describes the change and is suitable for the commit message body.",
    "Return valid JSON only. Do not use markdown fences or add commentary.",
    "Use this exact shape: {\"groups\":[{\"message\":\"...\",\"rationale\":\"...\",\"changeIds\":[\"...\"]}],\"unassignedChangeIds\":[\"...\"]}.",
    "Each supplied change ID must appear exactly once, either in one group or in unassignedChangeIds.",
    "Use unassignedChangeIds when a safe relationship is unclear."
  ].join(" ");
}

export function createCommitPlanUserPrompt(
  changes: CommitPlanChange[],
  diffContext: string,
  style: SourceControlWritingStyle = DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
  recentCommitSubjects: string[] = []
): string {
  const examples = style.mode === "repo_conventions"
    ? recentCommitSubjects.map((subject) => subject.trim()).filter(Boolean).slice(0, 12)
    : [];

  return [
    "Create a commit plan for these working-tree changes:",
    ...changes.map((change) => `- ${change.id}: ${change.path}${change.kind === "hunk" ? ` (${change.label})` : " (whole file)"}`),
    examples.length > 0 ? "\nRecent commit subjects from this repository:" : "",
    ...examples.map((subject) => `- ${subject}`),
    "\nWorking-tree diffs:",
    diffContext
  ].filter(Boolean).join("\n");
}

export function parseCommitPlanResponse(
  response: string,
  requestedChanges: CommitPlanChange[],
  granularity: CommitPlanGranularity
): CommitPlan {
  const changes = dedupeChanges(requestedChanges);
  if (changes.length === 0) {
    throw new Error("Select at least one working-tree change.");
  }
  if (changes.length > MAX_COMMIT_PLAN_CHANGES) {
    throw new Error(`Commit plans support up to ${MAX_COMMIT_PLAN_CHANGES} changes.`);
  }

  const parsed = JSON.parse(extractJsonObject(response)) as RawCommitPlan;
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups.slice(0, MAX_COMMIT_PLAN_GROUPS) : [];
  const allowedChangeIds = new Set(changes.map((change) => change.id));
  const assignedChangeIds = new Set<string>();
  const groups: CommitPlan["groups"] = [];

  for (const [index, value] of rawGroups.entries()) {
    if (!value || typeof value !== "object") continue;
    const raw = value as RawCommitPlanGroup;
    const message = normalizeOneLine(raw.message);
    const rationale = normalizeOneLine(raw.rationale);
    const rawChangeIds = Array.isArray(raw.changeIds) ? raw.changeIds : [];
    const groupChangeIds = new Set<string>();
    const changeIds = rawChangeIds.flatMap((changeId) => {
      if (typeof changeId !== "string") return [];
      const normalized = changeId.trim();
      if (!allowedChangeIds.has(normalized) || assignedChangeIds.has(normalized) || groupChangeIds.has(normalized)) return [];
      groupChangeIds.add(normalized);
      return [normalized];
    });

    if (!message || changeIds.length === 0) continue;
    for (const changeId of changeIds) assignedChangeIds.add(changeId);
    groups.push({
      id: `group-${index + 1}`,
      message,
      rationale,
      changeIds
    });
  }

  if (groups.length === 0) {
    throw new Error("The AI provider returned no usable commit groups.");
  }

  return {
    granularity,
    changes,
    groups,
    unassignedChangeIds: changes
      .map((change) => change.id)
      .filter((changeId) => !assignedChangeIds.has(changeId))
  };
}

function dedupeChanges(changes: CommitPlanChange[]): CommitPlanChange[] {
  const ids = new Set<string>();
  return changes.filter((change) => {
    if (!change.id || ids.has(change.id)) return false;
    ids.add(change.id);
    return true;
  });
}

function extractJsonObject(value: string): string {
  const normalized = stripAnsi(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The AI provider did not return a JSON commit plan.");
  }
  return normalized.slice(start, end + 1);
}

function normalizeOneLine(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(0x1b);
  return value.replace(new RegExp(`${escape}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g"), "");
}
