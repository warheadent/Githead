import type { GitStashEntry, GitStashFile } from "../shared/types";

const STASH_RECORD_SEPARATOR = "\x1e";
const STASH_FIELD_SEPARATOR = "\x1f";
const STASH_REF_PATTERN = /^stash@\{\d+\}$/;

export const GIT_STASH_LIST_FORMAT = `%gd%x1f%H%x1f%gs%x1f%cI%x1e`;

export function parseGitStashList(output: string): GitStashEntry[] {
  return output
    .split(STASH_RECORD_SEPARATOR)
    .map((record) => record.replace(/^\r?\n|\r?\n$/g, ""))
    .filter(Boolean)
    .flatMap((record) => {
      const [stashRef = "", hash = "", subject = "", createdAt = ""] = record.split(STASH_FIELD_SEPARATOR);
      if (!isGitStashRef(stashRef) || !hash) return [];
      const parsedSubject = parseStashSubject(subject);
      return [{
        ref: stashRef,
        hash,
        message: parsedSubject.message,
        sourceBranch: parsedSubject.sourceBranch,
        createdAt
      }];
    });
}

export function parseGitStashFiles(output: string): GitStashFile[] {
  const fields = output.split("\0");
  const files: GitStashFile[] = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++] ?? "";
    if (!status) continue;
    const statusCode = status.charAt(0);
    if (statusCode === "R" || statusCode === "C") {
      const originalPath = fields[index++] ?? "";
      const path = fields[index++] ?? "";
      if (path) files.push({ path, originalPath, status });
      continue;
    }

    const path = fields[index++] ?? "";
    if (path) files.push({ path, status });
  }

  return files;
}

export function isGitStashRef(value: string): boolean {
  return STASH_REF_PATTERN.test(value);
}

function parseStashSubject(subject: string): { message: string; sourceBranch: string | null } {
  const custom = /^On ([^:]+):\s*(.*)$/.exec(subject);
  if (custom) {
    return {
      sourceBranch: normalizeSourceBranch(custom[1] ?? ""),
      message: custom[2]?.trim() || subject
    };
  }

  const automatic = /^WIP on ([^:]+):\s*[0-9a-f]+\s*(.*)$/i.exec(subject);
  if (automatic) {
    const commitSubject = automatic[2]?.trim();
    return {
      sourceBranch: normalizeSourceBranch(automatic[1] ?? ""),
      message: commitSubject ? `WIP: ${commitSubject}` : subject
    };
  }

  return { message: subject || "Untitled stash", sourceBranch: null };
}

function normalizeSourceBranch(value: string): string | null {
  const branch = value.trim();
  return !branch || branch === "(no branch)" ? null : branch;
}
