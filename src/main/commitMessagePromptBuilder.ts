import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import {
  createCommitWritingStyleInstructions,
  DEFAULT_SOURCE_CONTROL_WRITING_STYLE
} from "../shared/sourceControlWritingStyle";
import type { SourceControlWritingStyle } from "../shared/types";

const MAX_MESSAGE_DIFF_CHARS = 60_000;
const TRUNCATION_WARNING = "The diff was truncated for message generation. Githead sent file names and limited patch samples. Add context for details that were omitted.";

/** Bound model input without changing the captured diff used to validate the index. */
export function prepareMessageDiff(diff: string): { text: string; warning: string } {
  if (diff.length <= MAX_MESSAGE_DIFF_CHARS) return { text: diff, warning: "" };

  const notice = "The diff was truncated. Use the file names and visible patch samples only. Do not invent details from omitted content.\n";
  const headers = Array.from(diff.matchAll(/^diff --git .*$/gm));
  if (headers.length === 0) {
    return {
      text: notice + diff.slice(0, MAX_MESSAGE_DIFF_CHARS - notice.length),
      warning: TRUNCATION_WARNING
    };
  }

  const files = "Changed files, listed as diff headers:\n";
  const omitted = "\n[remaining file names omitted]\n";
  const headerBudget = Math.floor(MAX_MESSAGE_DIFF_CHARS / 2);
  const allNames = headers.map((header) => header[0]).join("\n");
  const names = allNames.length > headerBudget
    ? allNames.slice(0, headerBudget - omitted.length) + omitted
    : allNames;
  const prefix = notice + files + names + "\nPatch samples:\n";
  const sampleBudget = Math.floor((MAX_MESSAGE_DIFF_CHARS - prefix.length) / headers.length);
  const samples = headers.map((header, index) => {
    if (sampleBudget < header[0].length + 2) return "";
    const end = headers[index + 1]?.index ?? diff.length;
    return diff.slice(header.index, Math.min(end, header.index + sampleBudget - 1)) + "\n";
  }).join("");
  return { text: prefix + samples, warning: TRUNCATION_WARNING };
}

export function createCommitMessageSystemPrompt(
  style: SourceControlWritingStyle = DEFAULT_SOURCE_CONTROL_WRITING_STYLE,
  target: "commit" | "stash" = "commit"
): string {
  if (target === "stash") {
    return [
      "You write concise Git stash messages.",
      "Capture the primary user-visible or developer-visible change.",
      "Write one imperative line with 72 characters or fewer and no trailing period.",
      "Return exactly the stash message text that should be saved.",
      "Do not include commentary, labels, markdown fences, or alternatives."
    ].join(" ");
  }
  return [
    "You write concise Git commit messages for git commit --file=-.",
    ...createCommitWritingStyleInstructions(style),
    "Capture the primary user-visible or developer-visible change.",
    "Write an imperative subject with 72 characters or fewer and no trailing period.",
    "Include a body only when it adds important context.",
    "Separate the subject and body with exactly one blank line.",
    "Use short '-' bullet points in the body.",
    "Return exactly the commit message text that should be saved.",
    "Do not include commentary, labels, markdown fences, or alternatives.",
    "Do not insert a manual line break in the subject."
  ].join(" ");
}

export function createCommitMessageUserPrompt(
  commitMessagePrompt: string,
  diff: string,
  additionalContext?: string,
  style?: SourceControlWritingStyle,
  recentCommitSubjects: string[] = [],
  target: "commit" | "stash" = "commit"
): string {
  const instructions = target === "stash"
    ? "Write a concise Git stash message for these changes."
    : style
    ? "Write a concise Git commit message for the staged changes."
    : commitMessagePrompt.trim() || DEFAULT_COMMIT_MESSAGE_PROMPT;
  const trimmedContext = additionalContext?.trim() ?? "";
  const conventionExamples = style?.mode === "repo_conventions"
    ? recentCommitSubjects.map((subject) => subject.trim()).filter(Boolean).slice(0, 12)
    : [];

  return [
    instructions,
    trimmedContext ? "Additional context from the user:" : "",
    trimmedContext,
    "",
    conventionExamples.length > 0 ? "Recent commit subjects from this repository:" : "",
    ...conventionExamples.map((subject) => `- ${subject}`),
    conventionExamples.length > 0 ? "" : "",
    target === "stash" ? "Stash diff:" : "Staged diff:",
    diff
  ].filter((line) => line.length > 0).join("\n");
}

export function normalizeGeneratedMessage(message: string): string {
  return stripAnsi(message)
    .trim()
    .replace(/^```(?:gitcommit|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(0x1b);
  return value.replace(new RegExp(`${escape}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g"), "");
}
