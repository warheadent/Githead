import { describe, expect, it } from "vite-plus/test";
import { classifyChangedLines, createConflictCodeLines } from "./conflictCodePresentation";

describe("classifyChangedLines", () => {
  it("keeps shared context neutral around replacements and insertions", () => {
    expect(classifyChangedLines(
      "export const policy = {\n  retries: 2,\n  enabled: true\n};\n",
      "export const policy = {\n  retries: 4,\n  timeout: 30,\n  enabled: true\n};\n"
    )).toEqual([false, true, true, false, false, false]);
  });

  it("falls back safely for a missing base version", () => {
    expect(classifyChangedLines(null, "one\ntwo")).toEqual([true, true]);
  });
});

describe("createConflictCodeLines", () => {
  it("combines existing syntax highlighting with current-side diff styling", () => {
    const lines = createConflictCodeLines({
      filePath: "src/policy.ts",
      baseText: "export const retries = 2;\n",
      text: "export const retries = 4;\n",
      tone: "current"
    });

    expect(lines[0]).toMatchObject({ kind: "delete", marker: "-", number: 1 });
    expect(lines[0]?.highlighted.kind).toBe("highlighted");
    expect(lines[0]?.highlighted.value).toContain("hljs-keyword");
    expect(lines[1]).toMatchObject({ kind: "context", marker: "", number: 2 });
  });

  it("styles conflict markers and both conflict sections in the editable result", () => {
    const lines = createConflictCodeLines({
      filePath: "src/policy.ts",
      baseText: "const retries = 2;\n",
      text: [
        "<<<<<<< HEAD",
        "const retries = 4;",
        "=======",
        "const retries = 6;",
        ">>>>>>> topic",
        ""
      ].join("\n"),
      tone: "result"
    });

    expect(lines.map(({ kind }) => kind)).toEqual([
      "marker",
      "delete",
      "marker",
      "add",
      "marker",
      "context"
    ]);
    expect(lines.map(({ marker }) => marker)).toEqual(["!", "-", "!", "+", "!", ""]);
  });
});
