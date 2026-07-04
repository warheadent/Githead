import { describe, expect, it } from "vite-plus/test";
import { detectDiffLanguage, highlightDiffCode } from "./syntaxHighlighter";

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

describe("highlightDiffCode", () => {
  it("highlights supported code lines", () => {
    const result = highlightDiffCode("src/app.ts", "const value = 1;");

    expect(result.kind).toBe("highlighted");
    expect(result.value).toContain("hljs-keyword");
    expect(result.value).toContain("const");
  });

  it("returns plain code for unsupported file types and empty lines", () => {
    expect(highlightDiffCode("assets/logo.png", "const value = 1;")).toEqual({
      kind: "plain",
      value: "const value = 1;"
    });
    expect(highlightDiffCode("src/app.ts", "")).toEqual({
      kind: "plain",
      value: ""
    });
  });

  it("escapes HTML-like source text in highlighted output", () => {
    const result = highlightDiffCode("src/app.ts", "const tag = '<script>alert(1)</script>';");

    expect(result.kind).toBe("highlighted");
    expect(result.value).toContain("&lt;script&gt;");
    expect(result.value).not.toContain("<script>");
    expect(result.value).not.toContain("</script>");
  });
});
