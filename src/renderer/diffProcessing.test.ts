import { describe, expect, it } from "vite-plus/test";
import { processDiff } from "./diffProcessing";
import { processDiffPlain } from "./diffProcessingPlain";

const INPUT = {
  filePath: "src/example.ts",
  text: [
    "diff --git a/src/example.ts b/src/example.ts",
    "--- a/src/example.ts",
    "+++ b/src/example.ts",
    "@@ -1 +1 @@",
    "-const oldValue = false;",
    "+const newValue = true;"
  ].join("\n"),
  truncated: true
};

describe("diff processing", () => {
  it("keeps groups and highlighted rows aligned", () => {
    const result = processDiff(INPUT);

    expect(result.highlightedRows).toHaveLength(result.groups.length);
    result.groups.forEach((group, groupIndex) => {
      expect(result.highlightedRows[groupIndex]).toHaveLength(group.rows.length);
    });
    expect(result.highlightedRows[1]?.[1]?.kind).toBe("highlighted");
    expect(result.groups.at(-1)?.rows.at(-1)).toMatchObject({
      kind: "notice",
      text: "Diff truncated."
    });
  });

  it("creates a complete plain-text result when highlighting is unavailable", () => {
    const result = processDiffPlain(INPUT);

    expect(result.highlightedRows.flat().every((row) => row.kind === "plain")).toBe(true);
    expect(result.highlightedRows.flat().map((row) => row.value)).toEqual(
      result.groups.flatMap((group) => group.rows.map((row) => row.text))
    );
  });
});
