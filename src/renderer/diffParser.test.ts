import { describe, expect, it } from "vite-plus/test";
import { countDiffLineChanges, createLinePatch, groupDiffRowsByHunk, isTechnicalFileHeader, parseUnifiedDiff } from "./diffParser";

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

  it("treats lines that look like file headers inside a hunk as changed content", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/notes.md b/notes.md",
      "--- a/notes.md",
      "+++ b/notes.md",
      "@@ -1,2 +1,2 @@",
      "--- old rule",
      "+++ new rule",
      " context"
    ].join("\n"));

    expect(rows.map((row) => row.kind)).toEqual(["file", "meta", "meta", "hunk", "delete", "add", "context"]);
    expect(rows.slice(4)).toMatchObject([
      { kind: "delete", oldLine: 1, marker: "-", text: "-- old rule" },
      { kind: "add", newLine: 1, marker: "+", text: "++ new rule" },
      { kind: "context", oldLine: 2, newLine: 2, text: "context" }
    ]);
  });

  it("reads file headers after a hunk's lines are used up, also without a diff --git line", () => {
    const rows = parseUnifiedDiff([
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "\\ No newline at end of file",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1 +0,0 @@",
      "-gone"
    ].join("\n"));

    expect(rows.map((row) => row.kind)).toEqual(["meta", "meta", "hunk", "delete", "add", "notice", "meta", "meta", "hunk", "delete"]);
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

describe("groupDiffRowsByHunk", () => {
  it("groups multiple hunks separately", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "@@ -1,2 +1,2 @@",
      "-first old",
      "+first new",
      "@@ -20,2 +30,3 @@",
      " shared",
      "-second old",
      "+second new"
    ].join("\n")));

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.kind)).toEqual(["hunk", "hunk"]);
    expect(groups[0]!.rows.map((row) => row.kind)).toEqual(["hunk", "delete", "add"]);
    expect(groups[1]!.rows.map((row) => row.kind)).toEqual(["hunk", "context", "delete", "add"]);
  });

  it("keeps file metadata before the first hunk as normal rows", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n")));

    expect(groups).toHaveLength(2);
    expect(groups[0]!.kind).toBe("rows");
    expect(groups[0]!.rows.map((row) => row.kind)).toEqual(["file", "meta", "meta", "meta"]);
    expect(groups[1]!.kind).toBe("hunk");
    expect(groups[1]!.rows.map((row) => row.kind)).toEqual(["hunk", "delete", "add"]);
  });

  it("breaks hunk groups when a multi-file diff starts a new file", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "diff --git a/src/first.ts b/src/first.ts",
      "--- a/src/first.ts",
      "+++ b/src/first.ts",
      "@@ -1 +1 @@",
      "-old first",
      "+new first",
      "diff --git a/src/second.ts b/src/second.ts",
      "--- a/src/second.ts",
      "+++ b/src/second.ts",
      "@@ -5 +5 @@",
      "-old second",
      "+new second"
    ].join("\n")));

    expect(groups.map((group) => group.kind)).toEqual(["rows", "hunk", "rows", "hunk"]);
    expect(groups[2]!.rows[0]).toMatchObject({
      kind: "file",
      text: "diff --git a/src/second.ts b/src/second.ts"
    });
  });

  it("keeps no-newline and truncation notices with the active hunk", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file"
    ].join("\n"), [
      "Diff truncated."
    ]));

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("hunk");
    expect(groups[0]!.rows.map((row) => row.kind)).toEqual(["hunk", "delete", "notice", "notice"]);
    expect(groups[0]!.rows.at(-1)).toMatchObject({
      kind: "notice",
      text: "Diff truncated."
    });
  });

  it("includes file metadata and hunk lines in each hunk patch", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,2 +1,2 @@",
      " unchanged",
      "-old",
      "+new",
      "@@ -10,2 +10,3 @@",
      " shared",
      "+added"
    ].join("\n")));

    expect(groups[1]!.patch).toBe([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,2 +1,2 @@",
      " unchanged",
      "-old",
      "+new",
      ""
    ].join("\n"));
    expect(groups[2]!.patch).toBe([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -10,2 +10,3 @@",
      " shared",
      "+added",
      ""
    ].join("\n"));
  });

  it("includes no-newline markers but omits synthetic notices from hunk patches", () => {
    const groups = groupDiffRowsByHunk(parseUnifiedDiff([
      "diff --git a/readme.md b/readme.md",
      "--- a/readme.md",
      "+++ b/readme.md",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file"
    ].join("\n"), [
      "Diff truncated."
    ]));

    expect(groups[1]!.patch).toBe([
      "diff --git a/readme.md b/readme.md",
      "--- a/readme.md",
      "+++ b/readme.md",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      ""
    ].join("\n"));
  });
});

describe("createLinePatch", () => {
  const groups = groupDiffRowsByHunk(parseUnifiedDiff([
    "diff --git a/src/app.ts b/src/app.ts",
    "index 1234567..89abcde 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -10,2 +10,3 @@ render()",
    " shared",
    "-old",
    "+new",
    "+extra"
  ].join("\n")));
  const hunk = groups[1]!;

  it("keeps one addition and turns an unselected deletion into context", () => {
    expect(createLinePatch(hunk, 3)).toBe([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -10,2 +10,3 @@ render()",
      " shared",
      " old",
      "+new",
      ""
    ].join("\n"));
  });

  it("keeps one deletion and omits unselected additions", () => {
    expect(createLinePatch(hunk, 2)).toBe([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -10,2 +10 @@ render()",
      " shared",
      "-old",
      ""
    ].join("\n"));
  });

  it("keeps no-newline markers only when their preceding line is included", () => {
    const noNewlineHunk = groupDiffRowsByHunk(parseUnifiedDiff([
      "diff --git a/file.txt b/file.txt",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1 +1,2 @@",
      " same",
      "+first",
      "\\ No newline at end of file",
      "+second"
    ].join("\n")))[1]!;

    expect(createLinePatch(noNewlineHunk, 4)).not.toContain("No newline at end of file");
    expect(createLinePatch(noNewlineHunk, 2)).toContain("\\ No newline at end of file");
  });

  it("rejects metadata and context rows", () => {
    expect(createLinePatch(hunk, 0)).toBeNull();
    expect(createLinePatch(hunk, 1)).toBeNull();
    expect(createLinePatch(groups[0]!, 0)).toBeNull();
  });
});

describe("isTechnicalFileHeader", () => {
  it("hides patch bookkeeping while preserving useful non-hunk messages", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/image.png b/image.png",
      "new file mode 100644",
      "index 0000000..1234567",
      "--- /dev/null",
      "+++ b/image.png",
      "Binary files /dev/null and b/image.png differ"
    ].join("\n"));

    expect(rows.filter((row) => !isTechnicalFileHeader(row)).map((row) => row.text)).toEqual([
      "Binary files /dev/null and b/image.png differ"
    ]);
  });
});

describe("countDiffLineChanges", () => {
  it("ignores file headers and counts only hunk lines", () => {
    expect(countDiffLineChanges([
      "diff --git a/src/app.ts b/src/app.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,3 @@",
      " const unchanged = true;",
      "-const oldValue = 1;",
      "+const newValue = 2;",
      " export {};"
    ].join("\n"))).toEqual({ additions: 1, deletions: 1 });
  });

  it("counts content lines that look like file headers inside a hunk", () => {
    expect(countDiffLineChanges([
      "diff --git a/notes.md b/notes.md",
      "--- a/notes.md",
      "+++ b/notes.md",
      "@@ -1,2 +1,2 @@",
      "--- old rule",
      "+++ new rule",
      " context"
    ].join("\n"))).toEqual({ additions: 1, deletions: 1 });
  });

  it("adds up several hunks and files and skips the headers between them", () => {
    expect(countDiffLineChanges([
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1,2 @@",
      " first",
      "+second",
      "@@ -10,2 +11 @@",
      "-removed",
      " kept",
      "diff --git a/b.ts b/b.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/b.ts",
      "@@ -0,0 +1,2 @@",
      "+one",
      "+two"
    ].join("\n"))).toEqual({ additions: 3, deletions: 1 });
  });

  it("ends a hunk when its line counts are used up, also without a diff --git line", () => {
    expect(countDiffLineChanges([
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1 +0,0 @@",
      "-gone"
    ].join("\n"))).toEqual({ additions: 1, deletions: 2 });
  });

  it("ignores the no-newline marker and CRLF line endings", () => {
    expect(countDiffLineChanges([
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
      "\\ No newline at end of file",
      ""
    ].join("\r\n"))).toEqual({ additions: 1, deletions: 1 });
  });

  it("returns zero for text without hunks", () => {
    expect(countDiffLineChanges("")).toEqual({ additions: 0, deletions: 0 });
    expect(countDiffLineChanges("Binary files a/image.png and b/image.png differ\n+not a hunk line")).toEqual({ additions: 0, deletions: 0 });
  });
});
