import hljs from "highlight.js/lib/core";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseUnifiedDiff } from "./diffParser";
import {
  detectDiffLanguage,
  highlightCode,
  highlightDiffRows,
  MAX_TOKENIZED_CODE_LENGTH,
  MAX_TOKENIZED_LINE_LENGTH
} from "./syntaxHighlighter";

describe("detectDiffLanguage", () => {
  it("maps common code file extensions to registered languages", () => {
    expect(detectDiffLanguage("src/app.ts")).toBe("typescript");
    expect(detectDiffLanguage("src/App.tsx")).toBe("typescript");
    expect(detectDiffLanguage("src/app.js")).toBe("javascript");
    expect(detectDiffLanguage("config/settings.json")).toBe("json");
    expect(detectDiffLanguage("docs/readme.md")).toBe("markdown");
    expect(detectDiffLanguage("scripts/deploy.sh")).toBe("bash");
    expect(detectDiffLanguage("src/main.cpp")).toBe("cpp");
    expect(detectDiffLanguage("src/main.cs")).toBe("csharp");
    expect(detectDiffLanguage("src/main.go")).toBe("go");
    expect(detectDiffLanguage("src/main.rs")).toBe("rust");
    expect(detectDiffLanguage("src/main.py")).toBe("python");
    expect(detectDiffLanguage("src/main.rb")).toBe("ruby");
    expect(detectDiffLanguage("db/schema.sql")).toBe("sql");
    expect(detectDiffLanguage("scripts/deploy.ps1")).toBe("powershell");
    expect(detectDiffLanguage("modules/Githead.psm1")).toBe("powershell");
    expect(detectDiffLanguage("config/Githead.psd1")).toBe("powershell");
    expect(detectDiffLanguage("types/Githead.ps1xml")).toBe("powershell");
    expect(detectDiffLanguage("scripts/Deploy.PS1")).toBe("powershell");
  });

  it("maps common extensionless configuration filenames", () => {
    expect(detectDiffLanguage("Dockerfile")).toBe("shell");
    expect(detectDiffLanguage("nested/Makefile")).toBe("shell");
    expect(detectDiffLanguage(".gitconfig")).toBe("ini");
    expect(detectDiffLanguage(".env")).toBe("properties");
  });

  it("returns null for unsupported file types", () => {
    expect(detectDiffLanguage("assets/logo.png")).toBeNull();
    expect(detectDiffLanguage("unknown.customext")).toBeNull();
  });
});

describe("highlightDiffRows", () => {
  it("only tokenizes the displayed new stream when a hunk has no deletions", () => {
    const rows = parseUnifiedDiff("@@ -1,2 +1,3 @@\n /**\n+ * added\n  */");
    const highlightSpy = vi.spyOn(hljs, "highlight");

    try {
      const result = highlightDiffRows("example.ts", rows);

      expect(result.slice(1).every((row) => row.value.includes("hljs-comment"))).toBe(true);
      expect(highlightSpy).toHaveBeenCalledTimes(1);
      expect(highlightSpy.mock.calls[0]?.[0]).toBe("/**\n * added\n */");
    } finally {
      highlightSpy.mockRestore();
    }
  });

  it("highlights supported code lines", () => {
    const rows = parseUnifiedDiff("@@ -0,0 +1 @@\n+const value = 1;");
    const result = highlightDiffRows("src/app.ts", rows);

    expect(result[1]?.kind).toBe("highlighted");
    expect(result[1]?.value).toContain("hljs-keyword");
    expect(result[1]?.value).toContain("const");
  });

  it("highlights PowerShell code lines", () => {
    const rows = parseUnifiedDiff("@@ -0,0 +1 @@\n+$service = Get-Service -Name 'Githead'");
    const result = highlightDiffRows("scripts/deploy.ps1", rows);

    expect(result[1]?.kind).toBe("highlighted");
    expect(result[1]?.value).toContain("hljs-variable");
    expect(result[1]?.value).toContain("$service");
  });

  it("keeps C++ documentation comments highlighted across added lines", () => {
    const rows = parseUnifiedDiff([
      "@@ -238,0 +238,5 @@",
      "+/**",
      "+ * Gets the current lock-on focus point for camera framing.",
      "+ * Returns false when no valid target is locked.",
      "+ */",
      "+bool GetLockOnCameraTarget() const;"
    ].join("\n"));

    const result = highlightDiffRows("Source/MyPlayerStateCharacter.h", rows);

    for (const rowIndex of [1, 2, 3, 4]) {
      expect(result[rowIndex]?.kind).toBe("highlighted");
      expect(result[rowIndex]?.value).toContain("hljs-comment");
      expect(countOccurrences(result[rowIndex]?.value ?? "", "<span")).toBe(countOccurrences(result[rowIndex]?.value ?? "", "</span>"));
    }
    expect(result[3]?.value).not.toContain("hljs-literal");
    expect(result[5]?.value).not.toContain("hljs-comment");
    expect(result[5]?.value).toContain("hljs-type");
  });

  it("uses separate syntax state for the old and new streams", () => {
    const rows = parseUnifiedDiff([
      "@@ -1,4 +1,3 @@",
      " /**",
      "- * old false",
      "- */",
      "+ */ bool added = false;",
      " bool context = false;"
    ].join("\n"));
    const highlightSpy = vi.spyOn(hljs, "highlight");

    try {
      const result = highlightDiffRows("src/example.cpp", rows);

      expect(highlightSpy).toHaveBeenCalledTimes(2);
      expect(result[2]?.value).toContain("hljs-comment");
      expect(result[3]?.value).toContain("hljs-comment");
      expect(result[4]?.value).toContain("hljs-comment");
      expect(result[4]?.value).toContain("hljs-literal");
      expect(result[5]?.value).not.toContain("hljs-comment");
      expect(result[5]?.value).toContain("hljs-literal");
    } finally {
      highlightSpy.mockRestore();
    }
  });

  it("keeps blank lines aligned with their diff rows", () => {
    const rows = parseUnifiedDiff([
      "@@ -0,0 +1,4 @@",
      "+/**",
      "+",
      "+ * false",
      "+ */"
    ].join("\n"));

    const result = highlightDiffRows("src/example.cpp", rows);

    expect(result).toHaveLength(rows.length);
    expect(result[2]?.kind).toBe("highlighted");
    expect(result[2]?.value).toContain("hljs-comment");
    expect(countOccurrences(result[2]?.value ?? "", "<span")).toBe(countOccurrences(result[2]?.value ?? "", "</span>"));
    expect(result[3]?.value).toContain("hljs-comment");
  });

  it("returns plain rows for unsupported file types", () => {
    const rows = parseUnifiedDiff("@@ -0,0 +1 @@\n+const value = false;");

    expect(highlightDiffRows("assets/logo.png", rows)).toEqual(rows.map((row) => ({
      kind: "plain",
      value: row.text
    })));
  });

  it("returns plain rows when Highlight.js fails", () => {
    const rows = parseUnifiedDiff("@@ -0,0 +1 @@\n+const value = false;");
    const highlightSpy = vi.spyOn(hljs, "highlight").mockImplementationOnce(() => {
      throw new Error("Highlight failure");
    });

    try {
      const result = highlightDiffRows("src/example.ts", rows);

      expect(result[1]).toEqual({
        kind: "plain",
        value: "const value = false;"
      });
    } finally {
      highlightSpy.mockRestore();
    }
  });

  it("keeps oversized lines plain and highlights bounded neighboring lines", () => {
    const oversizedLine = `const text = '${"x".repeat(MAX_TOKENIZED_LINE_LENGTH)}';`;
    const rows = parseUnifiedDiff([
      "@@ -0,0 +1,3 @@",
      "+const before = true;",
      `+${oversizedLine}`,
      "+const after = false;"
    ].join("\n"));
    const highlightSpy = vi.spyOn(hljs, "highlight");

    try {
      const result = highlightDiffRows("src/example.ts", rows);

      expect(result[1]?.kind).toBe("highlighted");
      expect(result[2]).toEqual({ kind: "plain", value: oversizedLine });
      expect(result[3]?.kind).toBe("highlighted");
      expect(highlightSpy).toHaveBeenCalledTimes(2);
      expect(highlightSpy.mock.calls.every(([value]) => value.length <= MAX_TOKENIZED_LINE_LENGTH)).toBe(true);
    } finally {
      highlightSpy.mockRestore();
    }
  });

  it("escapes HTML-like source text in row output", () => {
    const rows = parseUnifiedDiff("@@ -0,0 +1 @@\n+const tag = '<script>alert(1)</script>'; ");
    const result = highlightDiffRows("src/example.ts", rows);

    expect(result[1]?.value).toContain("&lt;script&gt;");
    expect(result[1]?.value).not.toContain("<script>");
    expect(result[1]?.value).not.toContain("</script>");
  });
});

describe("highlightCode", () => {
  it("preserves line alignment while highlighting a complete source file", () => {
    const result = highlightCode("src/policy.ts", "export const enabled = true;\n");

    expect(result).toHaveLength(2);
    expect(result[0]?.kind).toBe("highlighted");
    expect(result[0]?.value).toContain("hljs-keyword");
    expect(result[1]).toEqual({ kind: "highlighted", value: "" });
  });

  it("keeps large editor buffers plain to protect typing responsiveness", () => {
    const text = `const value = true;\n${"x".repeat(MAX_TOKENIZED_CODE_LENGTH)}`;

    expect(highlightCode("src/large.ts", text).every(({ kind }) => kind === "plain")).toBe(true);
  });
});

function countOccurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}
