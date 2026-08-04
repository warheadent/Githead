export const DEFAULT_PR_DESCRIPTION_PROMPT = [
  "Write a concise GitHub pull request description for the branch changes.",
  "",
  "Rules:",
  "- Use GitHub-flavored Markdown.",
  "- Include the headings `## Summary` and `## Testing`.",
  "- Under `## Summary`, use short `-` bullet points for the important changes.",
  "- Under `## Testing`, list concrete checks that the available context confirms.",
  "- If the available context does not confirm a check, write `- Not run`.",
  "- Base every claim on the commits and branch patch.",
  "- Do not invent motivation, issue references, implementation details, or test results.",
  "- Do not list each changed file or restate the patch line by line.",
  "- Output only the pull request description. Do not include the title."
].join("\n");
