import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import properties from "highlight.js/lib/languages/properties";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { DiffRow } from "./diffParser";

export interface HighlightedCode {
  kind: "highlighted" | "plain";
  value: string;
}

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ["bash", "bash"],
  ["c", "cpp"],
  ["cc", "cpp"],
  ["conf", "ini"],
  ["cpp", "cpp"],
  ["cs", "csharp"],
  ["css", "css"],
  ["cxx", "cpp"],
  ["go", "go"],
  ["h", "cpp"],
  ["hpp", "cpp"],
  ["htm", "xml"],
  ["html", "xml"],
  ["ini", "ini"],
  ["java", "java"],
  ["js", "javascript"],
  ["json", "json"],
  ["jsx", "javascript"],
  ["ksh", "bash"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mjs", "javascript"],
  ["php", "php"],
  ["ps1", "powershell"],
  ["ps1xml", "powershell"],
  ["psd1", "powershell"],
  ["psm1", "powershell"],
  ["properties", "properties"],
  ["py", "python"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["sh", "bash"],
  ["sql", "sql"],
  ["toml", "ini"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["xml", "xml"],
  ["yaml", "yaml"],
  ["yml", "yaml"]
]);

const LANGUAGE_BY_FILENAME = new Map<string, string>([
  [".bashrc", "bash"],
  [".env", "properties"],
  [".gitconfig", "ini"],
  [".npmrc", "ini"],
  ["dockerfile", "shell"],
  ["makefile", "shell"]
]);

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("php", php);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

export function detectDiffLanguage(filePath: string): string | null {
  const fileName = getFileName(filePath).toLowerCase();
  const fileNameMatch = LANGUAGE_BY_FILENAME.get(fileName);

  if (fileNameMatch) {
    return fileNameMatch;
  }

  if (fileName.endsWith(".d.ts")) {
    return "typescript";
  }

  const extension = fileName.includes(".") ? fileName.split(".").at(-1) ?? "" : "";
  return LANGUAGE_BY_EXTENSION.get(extension) ?? null;
}

export function highlightDiffRows(filePath: string, rows: readonly DiffRow[]): HighlightedCode[] {
  const highlightedRows = rows.map(({ text }) => createPlainCode(text));
  const language = detectDiffLanguage(filePath);

  if (!language) {
    return highlightedRows;
  }

  const oldRowIndexes = collectCodeRowIndexes(rows, "old");
  const newRowIndexes = collectCodeRowIndexes(rows, "new");
  const oldLines = highlightCodeLines(language, oldRowIndexes.map((rowIndex) => rows[rowIndex]?.text ?? ""));
  const newLines = highlightCodeLines(language, newRowIndexes.map((rowIndex) => rows[rowIndex]?.text ?? ""));

  if (oldLines) {
    oldRowIndexes.forEach((rowIndex, lineIndex) => {
      if (rows[rowIndex]?.kind === "delete") {
        highlightedRows[rowIndex] = oldLines[lineIndex] ?? highlightedRows[rowIndex]!;
      }
    });
  }

  if (newLines) {
    newRowIndexes.forEach((rowIndex, lineIndex) => {
      highlightedRows[rowIndex] = newLines[lineIndex] ?? highlightedRows[rowIndex]!;
    });
  }

  return highlightedRows;
}

function collectCodeRowIndexes(rows: readonly DiffRow[], side: "old" | "new"): number[] {
  const indexes: number[] = [];

  rows.forEach((row, rowIndex) => {
    if (row.kind === "context" || (side === "old" ? row.kind === "delete" : row.kind === "add")) {
      indexes.push(rowIndex);
    }
  });

  return indexes;
}

function highlightCodeLines(language: string, lines: readonly string[]): HighlightedCode[] | null {
  if (lines.length === 0) {
    return [];
  }

  try {
    const html = hljs.highlight(lines.join("\n"), {
      language,
      ignoreIllegals: true
    }).value;
    const lineHtml = splitHighlightedHtml(html, lines.length);
    return lineHtml.map((value) => ({ kind: "highlighted", value }));
  } catch {
    return null;
  }
}

function splitHighlightedHtml(html: string, expectedLineCount: number): string[] {
  const lines = [""];
  const openSpans: string[] = [];
  const tokenPattern = /<span class="[^"]+">|<\/span>|\n/g;
  let cursor = 0;

  for (const match of html.matchAll(tokenPattern)) {
    const tokenIndex = match.index;
    const token = match[0];
    lines[lines.length - 1] += html.slice(cursor, tokenIndex);

    if (token === "\n") {
      lines[lines.length - 1] += "</span>".repeat(openSpans.length);
      lines.push(openSpans.join(""));
    } else if (token === "</span>") {
      if (openSpans.length === 0) {
        throw new Error("Highlight.js returned unbalanced HTML.");
      }
      openSpans.pop();
      lines[lines.length - 1] += token;
    } else {
      openSpans.push(token);
      lines[lines.length - 1] += token;
    }

    cursor = tokenIndex + token.length;
  }

  lines[lines.length - 1] += html.slice(cursor);
  if (openSpans.length !== 0 || lines.length !== expectedLineCount) {
    throw new Error("Highlight.js returned invalid line markup.");
  }
  return lines;
}

function createPlainCode(value: string): HighlightedCode {
  return {
    kind: "plain",
    value
  };
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath;
}
