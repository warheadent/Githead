import { describe, expect, it } from "vite-plus/test";
import { groupDiffRowsByHunk, parseUnifiedDiff } from "./diffParser";
import {
  DIFF_HUNK_TOOLBAR_HEIGHT_PX,
  DIFF_ROW_HEIGHT_PX,
  measureDiffLineColumns,
  planDiffRender
} from "./diffRenderPlan";

function groupsFor(text: string) {
  return groupDiffRowsByHunk(parseUnifiedDiff(text));
}

function hunk(oldStart: number, lines: string[]): string[] {
  return [`@@ -${oldStart},${lines.length} +${oldStart},${lines.length} @@`, ...lines.map((line) => ` ${line}`)];
}

const fileHeader = ["diff --git a/file.ts b/file.ts", "index 1111111..2222222 100644", "--- a/file.ts", "+++ b/file.ts"];

describe("planDiffRender", () => {
  it("keeps every visible row once, in display order, and hides technical headers and hunk header rows", () => {
    const groups = groupsFor([...fileHeader, ...hunk(1, ["a", "b"]), ...hunk(20, ["c"])].join("\n"));
    const plan = planDiffRender(groups, 64);

    expect(plan.rowCount).toBe(3);
    expect(plan.chunks).toHaveLength(1);
    const rows = plan.chunks.flatMap((chunk) => chunk.pieces.flatMap((piece) => piece.rowIndexes.map((index) => groups[piece.groupIndex]!.rows[index]!.text)));
    expect(rows).toEqual(["a", "b", "c"]);
    expect(plan.chunks[0]!.pieces.filter((piece) => piece.startsHunk)).toHaveLength(2);
    expect(plan.chunks[0]!.estimatedHeight).toBe(3 * DIFF_ROW_HEIGHT_PX + 2 * DIFF_HUNK_TOOLBAR_HEIGHT_PX);
  });

  it("splits a long hunk across chunks and renders its toolbar only in the first piece", () => {
    const lines = Array.from({ length: 150 }, (_, index) => `line ${index}`);
    const groups = groupsFor(hunk(1, lines).join("\n"));
    const plan = planDiffRender(groups, 64);

    expect(plan.chunks.map((chunk) => chunk.rowCount)).toEqual([63, 64, 23]);
    expect(plan.chunks.map((chunk) => chunk.pieces.map((piece) => piece.startsHunk))).toEqual([[true], [false], [false]]);
    expect(plan.chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2]);
    expect(plan.chunks[1]!.pieces[0]!.rowIndexes[0]).toBe(64);
  });

  it("does not leave a hunk toolbar at the end of a chunk without its first row", () => {
    const groups = groupsFor([...hunk(1, ["a", "b"]), ...hunk(20, ["c", "d"])].join("\n"));
    const plan = planDiffRender(groups, 4);

    expect(plan.chunks.map((chunk) => chunk.pieces.map((piece) => [piece.startsHunk, piece.rowIndexes.length]))).toEqual([
      [[true, 2]],
      [[true, 2]]
    ]);
  });

  it("plans a 10,000-row diff in chunks that cover each row once", () => {
    const lines = Array.from({ length: 10_000 }, (_, index) => `+const value${index} = ${index};`);
    const groups = groupsFor(["@@ -0,0 +1,10000 @@", ...lines].join("\n"));
    const plan = planDiffRender(groups);

    expect(plan.rowCount).toBe(10_000);
    expect(plan.chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0)).toBe(10_000);
    expect(Math.max(...plan.chunks.map((chunk) => chunk.rowCount))).toBeLessThanOrEqual(64);
  });
});

describe("measureDiffLineColumns", () => {
  it("expands tabs to the next tab stop and counts wide characters as two columns", () => {
    expect(measureDiffLineColumns("abc")).toBe(3);
    expect(measureDiffLineColumns("\tx")).toBe(9);
    expect(measureDiffLineColumns("ab\tx")).toBe(9);
    expect(measureDiffLineColumns("漢字")).toBe(4);
    expect(measureDiffLineColumns("😀")).toBe(2);
  });
});
