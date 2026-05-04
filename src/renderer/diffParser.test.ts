import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./diffParser";

describe("parseUnifiedDiff", () => {
  it("classifies file headers and metadata", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts"
    ].join("\n"));

    expect(rows.map((row) => row.kind)).toEqual([
      "file",
      "meta",
      "meta",
      "meta"
    ]);
  });

  it("classifies context, deleted, and added lines inside a hunk", () => {
    const rows = parseUnifiedDiff([
      "@@ -10,3 +10,4 @@ export function run() {",
      " const unchanged = true;",
      "-const oldValue = 1;",
      "+const newValue = 2;",
      "+const addedValue = 3;"
    ].join("\n"));

    expect(rows.slice(1)).toMatchObject([
      {
        kind: "context",
        oldLine: 10,
        newLine: 10,
        marker: "",
        text: "const unchanged = true;"
      },
      {
        kind: "delete",
        oldLine: 11,
        newLine: null,
        marker: "-",
        text: "const oldValue = 1;"
      },
      {
        kind: "add",
        oldLine: null,
        newLine: 11,
        marker: "+",
        text: "const newValue = 2;"
      },
      {
        kind: "add",
        oldLine: null,
        newLine: 12,
        marker: "+",
        text: "const addedValue = 3;"
      }
    ]);
  });

  it("computes line numbers across multiple hunks", () => {
    const rows = parseUnifiedDiff([
      "@@ -1,2 +1,2 @@",
      "-first old",
      "+first new",
      "@@ -20,2 +30,3 @@",
      " shared",
      "-second old",
      "+second new",
      "+second added"
    ].join("\n"));

    expect(rows).toMatchObject([
      { kind: "hunk", oldLine: null, newLine: null },
      { kind: "delete", oldLine: 1, newLine: null },
      { kind: "add", oldLine: null, newLine: 1 },
      { kind: "hunk", oldLine: null, newLine: null },
      { kind: "context", oldLine: 20, newLine: 30 },
      { kind: "delete", oldLine: 21, newLine: null },
      { kind: "add", oldLine: null, newLine: 31 },
      { kind: "add", oldLine: null, newLine: 32 }
    ]);
  });

  it("does not treat file path metadata as added or deleted lines", () => {
    const rows = parseUnifiedDiff([
      "--- a/readme.md",
      "+++ b/readme.md",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n"));

    expect(rows[0]).toMatchObject({ kind: "meta", text: "--- a/readme.md" });
    expect(rows[1]).toMatchObject({ kind: "meta", text: "+++ b/readme.md" });
    expect(rows[3]).toMatchObject({ kind: "delete", text: "old" });
    expect(rows[4]).toMatchObject({ kind: "add", text: "new" });
  });

  it("adds notice rows for no-newline markers and caller notices", () => {
    const rows = parseUnifiedDiff([
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file"
    ].join("\n"), [
      "Diff truncated."
    ]);

    expect(rows.at(-2)).toMatchObject({
      kind: "notice",
      text: "\\ No newline at end of file"
    });
    expect(rows.at(-1)).toMatchObject({
      kind: "notice",
      text: "Diff truncated."
    });
  });
});
