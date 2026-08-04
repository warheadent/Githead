import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";

export const MAX_DIFF_CHARS = 60_000;

export function createCommitMessageSystemPrompt(): string {
  return [
    "You write concise Git commit messages for git commit --file=-.",
    "Use Conventional Commits format: type(scope): subject.",
    "Use only these lowercase types: feat, fix, refactor, perf, docs, test, build, ci, chore, revert.",
    "Use the narrowest accurate type and include a scope only when the staged patch makes it obvious.",
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
  additionalContext?: string
): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
  const instructions = commitMessagePrompt.trim() || DEFAULT_COMMIT_MESSAGE_PROMPT;
  const trimmedContext = additionalContext?.trim() ?? "";

  return [
    instructions,
    truncated ? "The diff was truncated; summarize only the visible staged changes." : "",
    trimmedContext ? "Additional context from the user:" : "",
    trimmedContext,
    "",
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
