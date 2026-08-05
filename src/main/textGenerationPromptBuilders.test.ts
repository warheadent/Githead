import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import {
  createCommitMessageSystemPrompt,
  createCommitMessageUserPrompt
} from "./commitMessagePromptBuilder";
import {
  createPrDescriptionSystemPrompt,
  createPrDescriptionUserPrompt,
  createPrTitleSystemPrompt,
  createPrTitleUserPrompt
} from "./prDescriptionPromptBuilder";

describe("text generation prompts", () => {
  it("uses the staged patch and concise commit rules", () => {
    const systemPrompt = createCommitMessageSystemPrompt();
    const userPrompt = createCommitMessageUserPrompt("", "diff --git a/a.ts b/a.ts");

    expect(systemPrompt).toContain("72 characters or fewer");
    expect(systemPrompt).toContain("primary user-visible or developer-visible change");
    expect(systemPrompt).toContain("Use Conventional Commits format");
    expect(userPrompt).toContain(DEFAULT_COMMIT_MESSAGE_PROMPT);
    expect(userPrompt).toContain("Staged diff:\ndiff --git a/a.ts b/a.ts");
  });

  it("gives branch context to pull request title generation", () => {
    const systemPrompt = createPrTitleSystemPrompt();
    const userPrompt = createPrTitleUserPrompt(
      "main",
      "feature/prompts",
      "- Improve prompts",
      "diff --git a/a.ts b/a.ts"
    );

    expect(systemPrompt).toContain("specific title with 72 characters or fewer");
    expect(systemPrompt).toContain("Use Conventional Commits format: type(scope): subject");
    expect(systemPrompt).toContain("Use only these lowercase types");
    expect(userPrompt).toContain("Base branch: main");
    expect(userPrompt).toContain("Head branch: feature/prompts");
  });

  it("uses summary and testing sections for pull request descriptions", () => {
    const systemPrompt = createPrDescriptionSystemPrompt();
    const userPrompt = createPrDescriptionUserPrompt(
      "",
      "main",
      "feature/prompts",
      "- Improve prompts",
      "diff --git a/a.ts b/a.ts",
      "Improve generated text"
    );

    expect(systemPrompt).toContain("'## Summary' and '## Testing'");
    expect(systemPrompt).toContain("'- Not run'");
    expect(systemPrompt).not.toContain("Use Conventional Commits format");
    expect(userPrompt).toContain(DEFAULT_PR_DESCRIPTION_PROMPT);
    expect(userPrompt).toContain("Pull request title: Improve generated text");
    expect(userPrompt).toContain("Base branch: main");
    expect(userPrompt).toContain("Head branch: feature/prompts");
  });

  it("uses recent commit subjects for repository conventions", () => {
    const style = { mode: "repo_conventions" as const, customInstructions: "" };
    const systemPrompt = createCommitMessageSystemPrompt(style);
    const userPrompt = createCommitMessageUserPrompt(
      DEFAULT_COMMIT_MESSAGE_PROMPT,
      "diff --git a/a.ts b/a.ts",
      undefined,
      style,
      ["Add source control settings", "Fix settings migration"]
    );

    expect(systemPrompt).toContain("repository's established commit message style");
    expect(systemPrompt).not.toContain("Use Conventional Commits format");
    expect(userPrompt).toContain("Recent commit subjects from this repository:");
    expect(userPrompt).toContain("- Fix settings migration");
  });

  it("applies custom instructions to commit and pull request generation", () => {
    const style = {
      mode: "custom" as const,
      customInstructions: "Use sentence case and lead with user impact."
    };

    expect(createCommitMessageSystemPrompt(style)).toContain(style.customInstructions);
    expect(createPrTitleSystemPrompt(style)).toContain(style.customInstructions);
    expect(createPrDescriptionSystemPrompt(style)).toContain(style.customInstructions);
  });
});
