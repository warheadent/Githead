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
import properties from "highlight.js/lib/languages/properties";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

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
  ["mjs", "javascript"],
  ["php", "php"],
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

export function highlightDiffCode(filePath: string, code: string): HighlightedCode {
  if (!code) {
    return {
      kind: "plain",
      value: code
    };
  }

  const language = detectDiffLanguage(filePath);

  if (!language) {
    return {
      kind: "plain",
      value: code
    };
  }

  try {
    return {
      kind: "highlighted",
      value: hljs.highlight(code, {
        language,
        ignoreIllegals: true
      }).value
    };
  } catch {
    return {
      kind: "plain",
      value: code
    };
  }
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath;
}
