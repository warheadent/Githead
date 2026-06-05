export const DEFAULT_COMMIT_MESSAGE_PROMPT = [
  "Write a Git commit message for this staged diff.",
  "Use Conventional Commits style, such as type(scope): subject.",
  "Make the scope the primary module touched when one is clear.",
  "Make the subject concise and describe what changed, was added, or was removed.",
  "Add body details only when they clarify important changed behavior.",
  "When adding body details, use '-' bullet points.",
  "Keep every subject and bullet on one line; do not insert predictive word wrapping.",
  "Output only the commit message, with no explanation before or after it."
].join("\n");
