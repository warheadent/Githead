import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { MAX_DIFF_CHARS } from "./commitMessagePromptBuilder";

export function createPrDescriptionSystemPrompt(): string {
  return [
    "You write GitHub pull request descriptions in Markdown.",
    "Use the provided branch names, commits, and patch as evidence.",
    "Include the headings '## Summary' and '## Testing'.",
    "Use short '-' bullet points under each heading.",
    "If the context does not confirm a test, write '- Not run' under '## Testing'.",
    "Return exactly the pull request description text that should be saved.",
    "Do not include a title, commentary, labels, markdown fences, or alternatives."
  ].join(" ");
}

export function createPrTitleSystemPrompt(): string {
  return [
    "You write concise GitHub pull request titles.",
    "Capture the primary user-visible or developer-visible branch change.",
    "Write a specific title with 72 characters or fewer and no trailing period.",
    "Return exactly one title, without labels, markdown, quotes, commentary, or alternatives.",
    "Do not include a body."
  ].join(" ");
}

export function createPrTitleUserPrompt(
  baseRef: string,
  headRef: string,
  commitLog: string,
  diff: string
): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
  const trimmedLog = commitLog.trim();

  return [
    "Write a concise and specific GitHub pull request title for these branch changes.",
    truncated ? "The diff was truncated; title only the visible changes." : "",
    `Base branch: ${baseRef}`,
    `Head branch: ${headRef}`,
    "",
    trimmedLog ? "Commits on the branch:" : "",
    trimmedLog,
    "",
    "Diff against the base branch:",
    promptDiff
  ].filter((line) => line.length > 0).join("\n");
}

export function createPrDescriptionUserPrompt(
  prDescriptionPrompt: string,
  baseRef: string,
  headRef: string,
  commitLog: string,
  diff: string,
  title?: string
): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  const promptDiff = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
  const instructions = prDescriptionPrompt.trim() || DEFAULT_PR_DESCRIPTION_PROMPT;
  const trimmedTitle = title?.trim() ?? "";
  const trimmedLog = commitLog.trim();

  return [
    instructions,
    truncated ? "The diff was truncated; summarize only the visible changes." : "",
    trimmedTitle ? `Pull request title: ${trimmedTitle}` : "",
    `Base branch: ${baseRef}`,
    `Head branch: ${headRef}`,
    "",
    trimmedLog ? "Commits on the branch:" : "",
    trimmedLog,
    "",
    "Diff against the base branch:",
    promptDiff
  ].filter((line) => line.length > 0).join("\n");
}
