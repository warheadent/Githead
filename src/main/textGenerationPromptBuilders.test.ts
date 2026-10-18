import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import {
  createCommitMessageSystemPrompt,
  createCommitMessageUserPrompt,
  prepareMessageDiff
} from "./commitMessagePromptBuilder";
import {
  createPrDescriptionSystemPrompt,
  createPrDescriptionUserPrompt,
  createPrTitleSystemPrompt,
  createPrTitleUserPrompt
} from "./prDescriptionPromptBuilder";

describe("text generation prompts", () => {
  it("preserves small diffs exactly", () => {
    const diff = "diff --git a/logo.png b/logo.png\nBinary files differ";
    expect(prepareMessageDiff(diff)).toEqual({ text: diff, warning: "" });
  });

  it("keeps file names and later patch samples after a very large file", () => {
    const diff = `diff --git a/Design/skilltree.pen b/Design/skilltree.pen\nnew file mode 100644\n${"+design data\n".repeat(300_000)}diff --git a/app.ts b/app.ts\n+fixLaterFile();`;
    const result = prepareMessageDiff(diff);
    expect(result.text.length).toBeLessThanOrEqual(60_000);
    expect(result.text).toContain("Design/skilltree.pen");
    expect(result.text).toContain("new file mode 100644");
    expect(result.text).toContain("+fixLaterFile();");
    expect(result.text).toContain("Do not invent details");
    expect(result.warning).toContain("truncated");
  });

  it("falls back to bounded file names when patches cannot fit", () => {
    const diff = Array.from({ length: 2_000 }, (_, index) =>
      `diff --git a/file-${index}.ts b/file-${index}.ts\n+change\n`
    ).join("");
    const result = prepareMessageDiff(diff);
    expect(result.text.length).toBeLessThanOrEqual(60_000);
    expect(result.text).toContain("diff --git a/file-0.ts b/file-0.ts");
    expect(result.text).toContain("remaining file names omitted");
  });

  it("bounds diffs without Git headers, including a single long line", () => {
    const result = prepareMessageDiff("x".repeat(4_000_000));
    expect(result.text.length).toBeLessThanOrEqual(60_000);
    expect(result.text).toContain("The diff was truncated");
  });

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
