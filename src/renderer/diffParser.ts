export type DiffRowKind =
  | "file"
  | "meta"
  | "hunk"
  | "add"
  | "delete"
  | "context"
  | "notice";

export interface DiffRow {
  kind: DiffRowKind;
  oldLine: number | null;
  newLine: number | null;
  marker: string;
  text: string;
  patchLine: string | null;
}

export type DiffRowGroupKind = "rows" | "hunk";

export interface DiffRowGroup {
  kind: DiffRowGroupKind;
  rows: DiffRow[];
  patch: string | null;
}

interface HunkState {
  oldLine: number;
  newLine: number;
}

export function parseUnifiedDiff(text: string, notices: string[] = []): DiffRow[] {
  const rows: DiffRow[] = [];
  let hunkState: HunkState | null = null;

  for (const line of splitDiffLines(text)) {
    const hunk = parseHunkHeader(line);
    if (hunk) {
      hunkState = hunk;
      rows.push(createRow("hunk", null, null, "", line, line));
      continue;
    }

    if (line.startsWith("diff --git ")) {
      hunkState = null;
      rows.push(createRow("file", null, null, "", line, line));
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      rows.push(createRow("meta", null, null, "", line, line));
      continue;
    }

    if (!hunkState) {
      rows.push(createRow("meta", null, null, "", line, line));
      continue;
    }

    if (line.startsWith("+")) {
      rows.push(createRow("add", null, hunkState.newLine, "+", line.slice(1), line));
      hunkState.newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      rows.push(createRow("delete", hunkState.oldLine, null, "-", line.slice(1), line));
      hunkState.oldLine += 1;
      continue;
    }

    if (line.startsWith("\\")) {
      rows.push(createRow("notice", null, null, "", line, line));
      continue;
    }

    const textLine = line.startsWith(" ") ? line.slice(1) : line;
    rows.push(createRow("context", hunkState.oldLine, hunkState.newLine, "", textLine, line));
    hunkState.oldLine += 1;
    hunkState.newLine += 1;
  }

  for (const notice of notices) {
    rows.push(createRow("notice", null, null, "", notice, null));
  }

  return rows;
}

export function groupDiffRowsByHunk(rows: DiffRow[]): DiffRowGroup[] {
  const groups: DiffRowGroup[] = [];
  let currentRows: DiffRowGroup | null = null;
  let currentHunk: DiffRowGroup | null = null;
  let filePatchLines: string[] = [];

  for (const row of rows) {
    if (row.kind === "file") {
      filePatchLines = row.patchLine ? [row.patchLine] : [];
    } else if (!currentHunk && row.kind === "meta" && row.patchLine) {
      filePatchLines.push(row.patchLine);
    }

    if (row.kind === "hunk") {
      const patchLines = [
        ...filePatchLines,
        ...(row.patchLine ? [row.patchLine] : [])
      ];
      currentHunk = {
        kind: "hunk",
        rows: [row],
        patch: createPatch(patchLines)
      };
      currentRows = null;
      groups.push(currentHunk);
      continue;
    }

    if (currentHunk && isHunkContentRow(row)) {
      currentHunk.rows.push(row);
      if (row.patchLine) {
        currentHunk.patch = appendPatchLine(currentHunk.patch, row.patchLine);
      }
      continue;
    }

    currentHunk = null;

    if (!currentRows) {
      currentRows = {
        kind: "rows",
        rows: [],
        patch: null
      };
      groups.push(currentRows);
    }

    currentRows.rows.push(row);
  }

  return groups;
}

function splitDiffLines(text: string): string[] {
  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === "") {
    return lines.slice(0, -1);
  }

  return lines;
}

function parseHunkHeader(line: string): HunkState | null {
  const match = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/.exec(line);
  const oldStart = Number(match?.groups?.oldStart);
  const newStart = Number(match?.groups?.newStart);

  if (!Number.isInteger(oldStart) || !Number.isInteger(newStart)) {
    return null;
  }

  return {
    oldLine: oldStart,
    newLine: newStart
  };
}

function isHunkContentRow(row: DiffRow): boolean {
  return row.kind === "add"
    || row.kind === "delete"
    || row.kind === "context"
    || row.kind === "notice";
}

function createRow(
  kind: DiffRowKind,
  oldLine: number | null,
  newLine: number | null,
  marker: string,
  text: string,
  patchLine: string | null
): DiffRow {
  return {
    kind,
    oldLine,
    newLine,
    marker,
    text,
    patchLine
  };
}

function createPatch(lines: string[]): string | null {
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

function appendPatchLine(patch: string | null, line: string): string {
  return `${patch ?? ""}${line}\n`;
}
