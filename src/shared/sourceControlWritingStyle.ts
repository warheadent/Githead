import type { SourceControlWritingStyle, SourceControlWritingStyleMode } from "./types";

export const DEFAULT_SOURCE_CONTROL_WRITING_STYLE: SourceControlWritingStyle = {
  mode: "conventional_commits",
  customInstructions: ""
};

export const SOURCE_CONTROL_WRITING_STYLE_OPTIONS: Record<
  SourceControlWritingStyleMode,
  { label: string; description: string }
> = {
  repo_conventions: {
    label: "Repository conventions",
    description: "Matches recent commit messages in each repository."
  },
  conventional_commits: {
    label: "Conventional Commits",
    description: "Uses Conventional Commit prefixes for commit messages; pull request titles and descriptions stay concise."
  },
  custom: {
    label: "Custom instructions",
    description: "Applies your instructions to commit messages and pull request titles and descriptions."
  }
};

export function createCommitWritingStyleInstructions(style: SourceControlWritingStyle): string[] {
  switch (style.mode) {
    case "repo_conventions":
      return ["Follow the repository's established commit message style when recent examples are available."];
    case "conventional_commits":
      return [
        "Use Conventional Commits format: type(scope): subject.",
        "Use only these lowercase types: feat, fix, refactor, perf, docs, test, build, ci, chore, revert.",
        "Use the narrowest accurate type and include a scope only when the staged patch makes it obvious."
      ];
    case "custom":
      return style.customInstructions.trim() ? [style.customInstructions.trim()] : [];
  }
}

export function createPullRequestWritingStyleInstructions(style: SourceControlWritingStyle): string[] {
  switch (style.mode) {
    case "repo_conventions":
      return ["Follow the repository's established writing style when recent commit examples are available."];
    case "conventional_commits":
      return ["Keep the pull request title and description concise. Do not force Conventional Commit syntax into the title."];
    case "custom":
      return style.customInstructions.trim() ? [style.customInstructions.trim()] : [];
  }
}
