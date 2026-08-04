export const DEFAULT_COMMIT_MESSAGE_PROMPT = [
  "Write a concise Git commit message for the staged changes.",
  "",
  "Rules:",
  "- Use Conventional Commits format: `type(scope): subject`.",
  "- Use the narrowest accurate type.",
  "- Include a scope only when the staged patch makes it obvious.",
  "- Capture the primary user-visible or developer-visible change.",
  "- Write an imperative subject with 72 characters or fewer.",
  "- Do not end the subject with a period.",
  "- Use a body only when it adds important context.",
  "- Use short `-` bullet points in the body.",
  "- Base the message only on the staged patch.",
  "- Do not invent intent, issue numbers, implementation details, or test results.",
  "- Output only the commit message."
].join("\n");
