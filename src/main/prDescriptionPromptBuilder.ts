import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { MAX_DIFF_CHARS } from "./commitMessagePromptBuilder";

export function createPrDescriptionSystemPrompt(): string {
  return [
    "You write GitHub pull request descriptions in Markdown.",
    "Summarize what the branch changes do and why, based on the provided commits and diff.",
    "Return exactly the pull request description text that should be saved.",
    "Do not include a title, commentary, labels, markdown fences, or alternatives."
  ].join(" ");
}

export function createPrDescriptionUserPrompt(
  prDescriptionPrompt: string,
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
    trimmedLog ? "Commits on the branch:" : "",
    trimmedLog,
    "",
    "Diff against the base branch:",
    promptDiff
  ].filter((line) => line.length > 0).join("\n");
}
