import { describe, expect, it } from "vitest";
import { GITHUB_REFERENCE_INPUT_LIMIT, GITHUB_REFERENCE_MATCH_LIMIT, parseGitHubReferences } from "./githubReference";

const repository = { owner: "openai", name: "githead", fullName: "openai/githead", webUrl: "https://github.com/openai/githead" };

describe("parseGitHubReferences", () => {
  it("recognizes local, explicit, and full URL forms", () => {
    const refs = parseGitHubReferences("Fix #123 GH-124 other/repo#7 https://github.COM/openai/githead/pull/8", repository);
    expect(refs.map((ref) => [ref.displayText, ref.kind, ref.targetUrl])).toEqual([
      ["#123", "issue-or-pull-request", "https://github.com/openai/githead/issues/123"],
      ["#124", "issue-or-pull-request", "https://github.com/openai/githead/issues/124"],
      ["other/repo#7", "issue-or-pull-request", "https://github.com/other/repo/issues/7"],
      ["#8", "pull-request", "https://github.com/openai/githead/pull/8"]
    ]);
  });

  it("deduplicates equivalent references", () => {
    expect(parseGitHubReferences("#1 GH-1 openai/githead#1", repository)).toHaveLength(1);
  });

  it("rejects malformed and embedded references", () => {
    const text = "#0 #-1 abc#12 deadbeef#123 user@example.com#4 /path/#5 v1.2.3 GH-9007199254740992 bad--owner/repo#3";
    expect(parseGitHubReferences(text, repository)).toEqual([]);
  });

  it("caps input and matches", () => {
    expect(parseGitHubReferences(Array.from({ length: 30 }, (_, index) => `#${index + 1}`).join(" "), repository)).toHaveLength(GITHUB_REFERENCE_MATCH_LIMIT);
    expect(parseGitHubReferences(`${"x".repeat(GITHUB_REFERENCE_INPUT_LIMIT)} #9`, repository)).toEqual([]);
  });
});
