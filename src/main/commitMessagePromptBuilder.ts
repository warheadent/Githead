import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";

export const MAX_DIFF_CHARS = 60_000;

export function createCommitMessageSystemPrompt(): string {
  return [
    "You write concise Git commit messages for git commit --file=-.",
    "Follow Conventional Commits format: type(scope): subject.",
    "Use only these lowercase types: feat, fix, refactor, perf, docs, test, build, ci, chore, revert.",
    "Set scope to the primary module only when one clearly dominates; otherwise omit scope and parentheses.",
    "Write the subject in imperative mood, aim for under 50 characters, and use no trailing period.",
    "Include a body only when it clarifies important behavior or explains why the change was made.",
    "Separate the subject and body with exactly one blank line.",
    "Use '-' bullets for body details, and keep each bullet on one line.",
    "For breaking changes, append '!' after the type/scope and add a BREAKING CHANGE: footer.",
    "Return exactly the commit message text that should be saved.",
    "Do not include commentary, labels, markdown fences, or alternatives.",
    "Do not insert manual line breaks within the subject or within any bullet."
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
