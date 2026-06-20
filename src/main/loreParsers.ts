import type { GitCommitChangedFile, GitStatusFile } from "../shared/types";

/**
 * Pure parsers for the human-readable output of the `lore` CLI (v0.8.x). Lore
 * has no porcelain/machine format, so these parse the documented stable text
 * defensively — unknown lines are ignored rather than throwing — and are
 * locked against real captured CLI output in loreParsers.test.ts.
 */

export interface LoreStatus {
  branch: string | null;
  revisionNumber: number | null;
  revisionSignature: string | null;
  files: GitStatusFile[];
}

export interface LoreRevision {
  number: number | null;
  signature: string;
  branchHash: string | null;
  date: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  files: GitCommitChangedFile[];
}

export interface LoreBranch {
  name: string;
  current: boolean;
}

const STATUS_SECTIONS: Record<string, "staged" | "unstaged" | "untracked"> = {
  "Changes staged for commit:": "staged",
  "Changes not staged for commit:": "unstaged",
  "Untracked files:": "untracked"
};

const HEADER_PATTERN = /^On branch (?<branch>\S+) revision (?<number>\d+) -> (?<signature>[0-9a-f]+)/;
const FILE_PATTERN = /^(?<status>[A-Z]) (?<path>.+)$/;
const FIELD_PATTERN = /^(?<key>Revision|Signature|Branch|Date|Creator|Committer)\s*:\s*(?<value>.*)$/;

export function parseLoreStatus(stdout: string): LoreStatus {
  let branch: string | null = null;
  let revisionNumber: number | null = null;
  let revisionSignature: string | null = null;
  let section: "staged" | "unstaged" | "untracked" | null = null;
  const byPath = new Map<string, GitStatusFile>();

  for (const raw of splitLines(stdout)) {
    const line = raw.replace(/\s+$/, "");
    if (!line) {
      continue;
    }

    const header = HEADER_PATTERN.exec(line);
    if (header?.groups) {
      branch = header.groups.branch ?? null;
      revisionNumber = Number(header.groups.number);
      revisionSignature = header.groups.signature ?? null;
      section = null;
      continue;
    }

    const nextSection = STATUS_SECTIONS[line];
    if (nextSection) {
      section = nextSection;
      continue;
    }

    if (line.startsWith("Repository ") || line.startsWith("Tracked changes:")) {
      section = null;
      continue;
    }

    const fileMatch = FILE_PATTERN.exec(line);
    if (fileMatch?.groups && section) {
      const status = fileMatch.groups.status ?? "";
      const filePath = (fileMatch.groups.path ?? "").trim();
      // Lore lists directories (trailing "/") alongside files; skip them so the
      // status reflects files only, like git.
      if (!filePath || filePath.endsWith("/")) {
        continue;
      }

      const entry = byPath.get(filePath) ?? emptyStatusFile(filePath);
      if (section === "staged") {
        entry.indexStatus = status;
        entry.isStaged = true;
      } else if (section === "unstaged") {
        entry.worktreeStatus = status;
        entry.isUnstaged = true;
      } else {
        // Untracked files surface as added ("A") in Lore; the UI shows "?".
        entry.worktreeStatus = "?";
        entry.isUnstaged = true;
      }
      byPath.set(filePath, entry);
    }
  }

  return {
    branch,
    revisionNumber: Number.isFinite(revisionNumber) ? revisionNumber : null,
    revisionSignature,
    files: [
      ...byPath.values()
    ]
  };
}

export function parseLoreHistory(stdout: string): LoreRevision[] {
  return splitBlocks(stdout)
    .map((block) => parseRevisionBlock(block))
    .filter((revision): revision is LoreRevision => revision !== null);
}

export function parseLoreRevision(stdout: string): LoreRevision | null {
  // `revision info` returns a single revision; with `--delta` the changed-file
  // list follows the header after a blank line, so parse the whole output as
  // one block rather than splitting (which would discard the delta files).
  return parseRevisionBlock(stdout);
}

export function parseLoreBranchList(stdout: string): LoreBranch[] {
  const branches: LoreBranch[] = [];

  for (const raw of splitLines(stdout)) {
    const line = raw.trimEnd();
    const match = /^(?<marker>[*]?)\s*(?<name>\S.*)$/.exec(line.trim());
    if (!match?.groups) {
      continue;
    }

    const name = (match.groups.name ?? "").trim();
    // Skip section headers and warnings ("Local branches:", "Warning: ...").
    if (!name || name.endsWith(":") || name.startsWith("Warning")) {
      continue;
    }

    branches.push({
      name,
      current: match.groups.marker === "*"
    });
  }

  return branches;
}

/**
 * Strip Lore's leading title line and blank lines so the remainder is a clean
 * unified diff (`--- … / +++ … / @@ …`) that the renderer's parseUnifiedDiff
 * consumes unchanged. Returns "" when there is no diff body (no changes).
 */
export function normalizeLoreDiff(stdout: string): string {
  const lines = splitLines(stdout);
  const start = lines.findIndex((line) => line.startsWith("--- "));
  if (start === -1) {
    return "";
  }

  return lines.slice(start).join("\n").replace(/\s+$/, "");
}

export function parseLorePerson(value: string): { name: string; email: string } {
  const match = /^(?<name>.*?)\s*<(?<email>[^>]*)>\s*$/.exec(value.trim());
  if (match?.groups) {
    return {
      name: (match.groups.name ?? "").trim(),
      email: (match.groups.email ?? "").trim()
    };
  }

  return {
    name: value.trim(),
    email: ""
  };
}

export function loreDateToIso(value: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function parseRevisionBlock(block: string): LoreRevision | null {
  let number: number | null = null;
  let signature = "";
  let branchHash: string | null = null;
  let date = "";
  let creator = "";
  let committer = "";
  const messageLines: string[] = [];
  const files: GitCommitChangedFile[] = [];

  for (const raw of splitLines(block)) {
    const field = FIELD_PATTERN.exec(raw);
    if (field?.groups) {
      const value = field.groups.value ?? "";
      switch (field.groups.key) {
        case "Revision":
          number = Number(value);
          break;
        case "Signature":
          signature = value.trim();
          break;
        case "Branch":
          branchHash = value.trim() || null;
          break;
        case "Date":
          date = value.trim();
          break;
        case "Creator":
          creator = value.trim();
          break;
        case "Committer":
          committer = value.trim();
          break;
      }
      continue;
    }

    if (/^\s+\S/.test(raw)) {
      // Indented lines are the commit message body.
      messageLines.push(raw.trim());
      continue;
    }

    const fileMatch = FILE_PATTERN.exec(raw.trim());
    if (fileMatch?.groups) {
      // Non-indented "A path" lines appear after Committer with `--delta`.
      files.push({
        path: (fileMatch.groups.path ?? "").trim(),
        status: fileMatch.groups.status ?? "",
        additions: 0,
        deletions: 0
      });
    }
  }

  if (!signature) {
    return null;
  }

  const author = parseLorePerson(creator);
  const committerPerson = committer ? parseLorePerson(committer) : author;

  return {
    number: Number.isFinite(number) ? number : null,
    signature,
    branchHash,
    date: loreDateToIso(date),
    subject: messageLines[0] ?? "",
    body: messageLines.slice(1).join("\n"),
    authorName: author.name,
    authorEmail: author.email,
    committerName: committerPerson.name,
    committerEmail: committerPerson.email,
    files: dropDirectoryEntries(files)
  };
}

/**
 * A revision delta lists directories alongside files. Unlike `status`, delta
 * directory entries have no trailing slash, so a path is treated as a directory
 * when another entry is nested beneath it (or it ends in "/"). Mirrors git's
 * file-only name-status output.
 */
function dropDirectoryEntries(files: GitCommitChangedFile[]): GitCommitChangedFile[] {
  const paths = files.map((file) => file.path);
  return files.filter((file) => {
    if (file.path.endsWith("/")) {
      return false;
    }

    const prefix = `${file.path}/`;
    return !paths.some((other) => other !== file.path && other.startsWith(prefix));
  });
}

function emptyStatusFile(path: string): GitStatusFile {
  return {
    path,
    indexStatus: "",
    worktreeStatus: "",
    isStaged: false,
    isUnstaged: false,
    isConflicted: false
  };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function splitBlocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}
