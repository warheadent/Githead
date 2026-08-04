import { describe, expect, it } from "vitest";
import { getEvidenceStats, trimPatch } from "./releaseEvidence.mjs";

describe("release evidence", () => {
  it("keeps complete file patches when they fit the limit", () => {
    const patch = [
      "diff --git a/a.ts b/a.ts\n+a\n",
      "diff --git a/b.ts b/b.ts\n+b\n",
      "diff --git a/c.ts b/c.ts\n+c\n"
    ].join("");

    const result = trimPatch(patch, 65);

    expect(result.patchTruncated).toBe(true);
    expect(result.patch).toContain("a/a.ts");
    expect(result.patch).toContain("a/b.ts");
    expect(result.patch).not.toContain("a/c.ts");
    expect(result.patch).toContain("patch limited to 65 characters");
  });

  it("reports evidence size and truncation", () => {
    expect(getEvidenceStats([
      {
        subject: "subject",
        body: "body",
        changedFiles: "files",
        patch: "patch",
        patchTruncated: true
      }
    ])).toEqual({
      commitCount: 1,
      evidenceChars: 21,
      truncatedCommitCount: 1
    });
  });

  it("keeps the start of the first file when one file exceeds the limit", () => {
    const firstFile = `diff --git a/large.ts b/large.ts\n${"+content\n".repeat(20)}`;
    const secondFile = "diff --git a/small.ts b/small.ts\n+small\n";

    const result = trimPatch(`${firstFile}${secondFile}`, 80);

    expect(result.patch).toContain("a/large.ts");
    expect(result.patch).not.toContain("a/small.ts");
  });
});
