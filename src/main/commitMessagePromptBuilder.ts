import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import {
  createCommitWritingStyleInstructions,
  DEFAULT_SOURCE_CONTROL_WRITING_STYLE
} from "../shared/sourceControlWritingStyle";
import type { SourceControlWritingStyle } from "../shared/types";

export const MAX_DIFF_CHARS = 60_000;

export function createCommitMessageSystemPrompt(
  style: SourceControlWritingStyle = DEFAULT_SOURCE_CONTROL_WRITING_STYLE
): string {
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
  recentCommitSubjects: string[] = []
): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
  const instructions = style
    ? "Write a concise Git commit message for the staged changes."
    : commitMessagePrompt.trim() || DEFAULT_COMMIT_MESSAGE_PROMPT;
  const trimmedContext = additionalContext?.trim() ?? "";
  const conventionExamples = style?.mode === "repo_conventions"
    ? recentCommitSubjects.map((subject) => subject.trim()).filter(Boolean).slice(0, 12)
    : [];

  return [
    instructions,
    truncated ? "The diff was truncated; summarize only the visible staged changes." : "",
    trimmedContext ? "Additional context from the user:" : "",
    trimmedContext,
    "",
    conventionExamples.length > 0 ? "Recent commit subjects from this repository:" : "",
    ...conventionExamples.map((subject) => `- ${subject}`),
    conventionExamples.length > 0 ? "" : "",
    "Staged diff:",
    promptDiff
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
