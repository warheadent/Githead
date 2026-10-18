/**
 * Selects the file sections of a multi-file Git patch that write `filePath`.
 *
 * A commit diff restricted to a renamed or copied file must include the
 * original path so rename detection can pair them. The patch can then also
 * contain the original path's own change (for copies whose source changed).
 * Returns the input unchanged when it has one section or no section matches.
 */
export function selectPatchSectionsForPath(patch: string, filePath: string): string {
  const starts = [...patch.matchAll(/^diff --git /gm)].map((match) => match.index);
  if (starts.length <= 1) return patch;
  const sections = starts.map((start, index) => patch.slice(start, starts[index + 1] ?? patch.length));
  const matching = sections.filter((section) => patchSectionTargets(section, filePath));
  return matching.length ? `${patch.slice(0, starts[0])}${matching.join("")}` : patch;
}

function patchSectionTargets(section: string, filePath: string): boolean {
  let deletedTarget = false;
  for (const line of section.split("\n").slice(1)) {
    if (line.startsWith("@@") || line.startsWith("Binary files ") || line === "GIT binary patch") break;
    if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
      if (decodePatchPath(line.slice(line.indexOf(" to ") + 4)) === filePath) return true;
    } else if (line.startsWith("+++ ")) {
      const target = decodePatchPath(line.slice(4));
      if (target === "/dev/null") return deletedTarget;
      return withoutPrefix(target) === filePath || target === filePath;
    } else if (line.startsWith("--- ")) {
      const source = decodePatchPath(line.slice(4));
      deletedTarget = source !== "/dev/null" && (withoutPrefix(source) === filePath || source === filePath);
    }
  }
  return false;
}

function withoutPrefix(value: string): string {
  const slash = value.indexOf("/");
  return slash === -1 ? value : value.slice(slash + 1);
}

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, "\"": 34, "\\": 92 };

/** Decodes Git's C-style quoted path form; unquoted names drop the tab Git appends to names with spaces. */
export function decodePatchPath(value: string): string {
  if (!value.startsWith("\"")) return value.replace(/\t$/, "");
  const bytes: number[] = [];
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "\"") break;
    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf8"));
      continue;
    }
    const next = value[index + 1] ?? "";
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 4), 8));
      index += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      index += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}
