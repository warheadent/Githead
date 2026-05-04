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
      rows.push(createRow("hunk", null, null, "", line));
      continue;
    }

    if (line.startsWith("diff --git ")) {
      hunkState = null;
      rows.push(createRow("file", null, null, "", line));
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      rows.push(createRow("meta", null, null, "", line));
      continue;
    }

    if (!hunkState) {
      rows.push(createRow("meta", null, null, "", line));
      continue;
    }

    if (line.startsWith("+")) {
      rows.push(createRow("add", null, hunkState.newLine, "+", line.slice(1)));
      hunkState.newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      rows.push(createRow("delete", hunkState.oldLine, null, "-", line.slice(1)));
      hunkState.oldLine += 1;
      continue;
    }

    if (line.startsWith("\\")) {
      rows.push(createRow("notice", null, null, "", line));
      continue;
    }

    const textLine = line.startsWith(" ") ? line.slice(1) : line;
    rows.push(createRow("context", hunkState.oldLine, hunkState.newLine, "", textLine));
    hunkState.oldLine += 1;
    hunkState.newLine += 1;
  }

  for (const notice of notices) {
    rows.push(createRow("notice", null, null, "", notice));
  }

  return rows;
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

function createRow(
  kind: DiffRowKind,
  oldLine: number | null,
  newLine: number | null,
  marker: string,
  text: string
): DiffRow {
  return {
    kind,
    oldLine,
    newLine,
    marker,
    text
  };
}
