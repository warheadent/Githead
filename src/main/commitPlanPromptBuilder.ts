import { createCommitWritingStyleInstructions, DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import type { CommitPlan, SourceControlWritingStyle } from "../shared/types";

export const MAX_COMMIT_PLAN_PATHS = 500;
export const MAX_COMMIT_PLAN_GROUPS = 50;
export const MAX_COMMIT_PLAN_DIFF_CHARS = 80_000;

interface RawCommitPlanGroup {
  message?: unknown;
  rationale?: unknown;
  paths?: unknown;
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
    "Use this exact shape: {\"groups\":[{\"message\":\"...\",\"rationale\":\"...\",\"paths\":[\"...\"]}],\"unassignedPaths\":[\"...\"]}.",
    "Each supplied path must appear exactly once, either in one group or in unassignedPaths.",
    "Use unassignedPaths when a safe relationship is unclear."
  ].join(" ");
}

export function createCommitPlanUserPrompt(
  paths: string[],
  diffContext: string,
  style: SourceControlWritingStyle = DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
  recentCommitSubjects: string[] = []
): string {
  const examples = style.mode === "repo_conventions"
    ? recentCommitSubjects.map((subject) => subject.trim()).filter(Boolean).slice(0, 12)
    : [];

  return [
    "Create a commit plan for these working-tree files:",
    ...paths.map((path) => `- ${path}`),
    examples.length > 0 ? "\nRecent commit subjects from this repository:" : "",
    ...examples.map((subject) => `- ${subject}`),
    "\nWorking-tree diffs:",
    diffContext
  ].filter(Boolean).join("\n");
}

export function parseCommitPlanResponse(response: string, requestedPaths: string[]): CommitPlan {
  const uniquePaths = [...new Set(requestedPaths.map((path) => path.trim()).filter(Boolean))];
  if (uniquePaths.length === 0) {
    throw new Error("Select at least one working-tree file.");
  }
  if (uniquePaths.length > MAX_COMMIT_PLAN_PATHS) {
    throw new Error(`Commit plans support up to ${MAX_COMMIT_PLAN_PATHS} files.`);
  }

  const parsed = JSON.parse(extractJsonObject(response)) as RawCommitPlan;
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups.slice(0, MAX_COMMIT_PLAN_GROUPS) : [];
  const allowedPaths = new Set(uniquePaths);
  const assignedPaths = new Set<string>();
  const groups: CommitPlan["groups"] = [];

  for (const [index, value] of rawGroups.entries()) {
    if (!value || typeof value !== "object") continue;
    const raw = value as RawCommitPlanGroup;
    const message = normalizeOneLine(raw.message);
    const rationale = normalizeOneLine(raw.rationale);
    const rawPaths = Array.isArray(raw.paths) ? raw.paths : [];
    const groupPaths = new Set<string>();
    const paths = rawPaths.flatMap((path) => {
      if (typeof path !== "string") return [];
      const normalized = path.trim();
      if (!allowedPaths.has(normalized) || assignedPaths.has(normalized) || groupPaths.has(normalized)) return [];
      groupPaths.add(normalized);
      return [normalized];
    });

    if (!message || paths.length === 0) continue;
    for (const path of paths) assignedPaths.add(path);
    groups.push({
      id: `group-${index + 1}`,
      message,
      rationale,
      paths
    });
  }

  if (groups.length === 0) {
    throw new Error("The AI provider returned no usable commit groups.");
  }

  return {
    groups,
    unassignedPaths: uniquePaths.filter((path) => !assignedPaths.has(path))
  };
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
