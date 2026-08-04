import { describe, expect, it } from "vitest";
import {
  buildReleaseSummaryPayload,
  createFallbackReleaseNotes,
  parseAndValidateReleaseNotes,
  renderReleaseNotes,
  validateReleaseNotes
} from "./releaseNotes.mjs";

const evidence = [
  {
    shortHash: "abc1234",
    subject: "feat(diff): preserve text selections",
    body: "",
    changedFiles: "M src/diff.ts",
    patch: "+preserveSelection()"
  },
  {
    shortHash: "def5678",
    subject: "fix(history): refresh commits on tab open",
    body: "",
    changedFiles: "M src/history.ts",
    patch: "+refreshHistory()"
  }
];

describe("release-note generation contract", () => {
  it("builds a structured Luna request with balanced commit evidence", () => {
    const payload = buildReleaseSummaryPayload({
      model: "openai/gpt-5.6-luna",
      currentTag: "v1.2.3",
      previousTag: "v1.2.2",
      evidence
    });

    expect(payload.model).toBe("openai/gpt-5.6-luna");
    expect(payload).not.toHaveProperty("temperature");
    expect(payload.provider.require_parameters).toBe(true);
    expect(payload.response_format.type).toBe("json_schema");
    expect(payload.messages[0].content).toContain("Write for Git users");
    expect(payload.messages[0].content).toContain("Represent the complete release range");
    expect(payload.messages[0].content).toContain("internalChanges");
    expect(payload.response_format.json_schema.schema.required).toContain("internalChanges");
    expect(payload.messages[1].content).toContain("--- commit abc1234 ---");
    expect(payload.messages[1].content).toContain("--- commit def5678 ---");
  });

  it("parses fenced JSON and renders only nonempty sections", () => {
    const raw = [
      "```json",
      JSON.stringify({
        actionRequired: [],
        highlights: [{
          text: "Githead keeps selected diff text active while syntax colors load.",
          evidence: ["abc1234"]
        }],
        fixes: [],
        internalChanges: []
      }),
      "```"
    ].join("\n");

    const result = parseAndValidateReleaseNotes(raw, ["abc1234", "def5678"]);

    expect(result.errors).toEqual([]);
    expect(renderReleaseNotes(result.document)).toBe([
      "## Highlights",
      "",
      "- Githead keeps selected diff text active while syntax colors load."
    ].join("\n"));
  });

  it("rejects unsupported evidence, duplicate evidence, and duplicate text", () => {
    const document = {
      actionRequired: [],
      highlights: [
        { text: "Githead adds a visible feature.", evidence: ["abc1234"] },
        { text: "Githead adds a visible feature.", evidence: ["missing"] }
      ],
      fixes: [{ text: "Githead corrects a visible error.", evidence: ["abc1234"] }],
      internalChanges: []
    };

    const errors = validateReleaseNotes(document, ["abc1234"]);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicates another item"),
      expect.stringContaining("unknown commit: missing"),
      expect.stringContaining("reuses abc1234")
    ]));
  });

  it("rejects long sentences, implementation jargon, and contractions", () => {
    const document = {
      actionRequired: [],
      highlights: [{
        text: "Githead's powerful renderer now provides a very long description that contains far too many words for one clear release note sentence about a simple visible change in the application.",
        evidence: ["abc1234"]
      }],
      fixes: [],
      internalChanges: []
    };

    const errors = validateReleaseNotes(document, ["abc1234"]);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("contraction or possessive apostrophe"),
      expect.stringContaining("forbidden phrase"),
      expect.stringMatching(/\d+-word sentence/)
    ]));
  });

  it("creates an accurate fallback from user-visible conventional commits", () => {
    const body = createFallbackReleaseNotes([
      { shortHash: "abc1234", subject: "feat(diff): add line wrapping" },
      { shortHash: "def5678", subject: "fix(history): refresh commits on tab open" },
      { shortHash: "jkl3456", subject: "refactor(main): unify background task cancellation" },
      { shortHash: "ghi9012", subject: "test(history): add refresh coverage" }
    ]);

    expect(body).toContain("## Highlights");
    expect(body).toContain("- Githead now includes line wrapping.");
    expect(body).toContain("## Fixes");
    expect(body).toContain("- This release contains this change: refresh commits on tab open.");
    expect(body).toContain("## Internal changes");
    expect(body).toContain("- This release contains this change: unify background task cancellation.");
    expect(body).not.toContain("coverage");
  });
});
