export const DEFAULT_PR_DESCRIPTION_PROMPT = [
  "Write a GitHub pull request description for the branch changes below.",
  "",
  "Structure:",
  "- Start with a short paragraph summarizing what the pull request does and why.",
  "- Add a '## Changes' section with '-' bullets describing the notable changes;",
  "  group related changes and do not restate the diff line by line.",
  "- Add a '## Testing' section noting how the changes were or should be verified;",
  "  keep it brief and honest about what is untested.",
  "",
  "Output rules:",
  "- Use GitHub-flavored Markdown.",
  "- Output only the description - no commentary before or after, no title, and no",
  "  surrounding code fences or backticks."
].join("\n");
