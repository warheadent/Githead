/** Folders that commonly hold third-party or generated code. */
export const DEFAULT_ANALYTICS_EXCLUDED_PATHS: readonly string[] = [
  "node_modules/",
  "vendor/",
  "third_party/",
  "third-party/",
  "ThirdParty/",
  "Pods/"
];

export const MAX_ANALYTICS_EXCLUDED_PATHS = 200;
const MAX_PATTERN_LENGTH = 300;

/** Trims, drops blank lines and comments, removes duplicates, and enforces limits. */
export function normalizeExcludedPaths(patterns: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of patterns) {
    const pattern = raw.trim().replace(/\\/g, "/");
    if (!pattern || pattern.startsWith("#") || pattern === "!" || pattern.length > MAX_PATTERN_LENGTH || seen.has(pattern)) continue;
    seen.add(pattern);
    result.push(pattern);
    if (result.length === MAX_ANALYTICS_EXCLUDED_PATHS) break;
  }
  return result;
}

/**
 * Compiles a subset of gitignore syntax into a path predicate. Later patterns
 * win, `!` re-includes a path, a trailing `/` matches folders, a pattern with
 * an inner `/` is anchored to the repository root, `*` and `?` stay inside one
 * folder, and `**` crosses folders. Matching ignores case so patterns behave
 * the same on case-insensitive file systems.
 */
export function compileExcludedPaths(patterns: readonly string[]): (path: string) => boolean {
  const rules = normalizeExcludedPaths(patterns).map(compileRule);
  if (rules.length === 0) return () => false;
  return (path) => {
    let excluded = false;
    for (const rule of rules) {
      if (rule.regex.test(path)) excluded = !rule.negate;
    }
    return excluded;
  };
}

function compileRule(pattern: string): { regex: RegExp; negate: boolean } {
  const negate = pattern.startsWith("!");
  let body = negate ? pattern.slice(1) : pattern;
  const folderOnly = body.endsWith("/");
  body = body.replace(/\/+$/, "");
  const anchored = body.startsWith("/") || body.includes("/");
  body = body.replace(/^\/+/, "");
  const prefix = anchored ? "^" : "^(?:.*/)?";
  const suffix = folderOnly ? "/" : "(?:/|$)";
  return { regex: new RegExp(prefix + globToRegex(body) + suffix, "i"), negate };
}

function globToRegex(glob: string): string {
  let out = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? "";
    if (char === "*" && glob[index + 1] === "*") {
      const slashAfter = glob[index + 2] === "/";
      out += slashAfter ? "(?:.*/)?" : ".*";
      index += slashAfter ? 2 : 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return out;
}
