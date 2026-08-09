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

interface HunkHeader extends HunkState {
  suffix: string;
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

/**
 * Builds a valid patch containing one changed line from a parsed hunk. It
 * recalculates the hunk ranges and preserves enough context for Git to move
 * only the requested line between the working tree and the index.
 */
export function createLinePatch(
  group: DiffRowGroup,
  selectedRowIndex: number,
  side: "staged" | "unstaged" = "unstaged"
): string | null {
  const hunkRow = group.kind === "hunk" ? group.rows[0] : undefined;
  const selectedRow = group.rows[selectedRowIndex];
  const header = hunkRow?.patchLine ? parseHunkHeaderDetails(hunkRow.patchLine) : null;

  if (
    !group.patch
    || !hunkRow?.patchLine
    || !header
    || !selectedRow
    || (selectedRow.kind !== "add" && selectedRow.kind !== "delete")
  ) {
    return null;
  }

  const patchLines = splitDiffLines(group.patch);
  const hunkHeaderIndex = patchLines.indexOf(hunkRow.patchLine);
  if (hunkHeaderIndex < 0) return null;

  const filePatchLines = patchLines.slice(0, hunkHeaderIndex);
  const changedRowCount = group.rows.filter((row) => row.kind === "add" || row.kind === "delete").length;
  const isPartialFileChange = changedRowCount > 1;
  const isNewFile = filePatchLines.some((line) => line === "--- /dev/null" || line.startsWith("new file mode "));
  const isDeletedFile = filePatchLines.some((line) => line === "+++ /dev/null" || line.startsWith("deleted file mode "));
  const normalizeNewFile = isPartialFileChange && isNewFile && side === "staged";
  const normalizeDeletedFile = isPartialFileChange && isDeletedFile && side === "unstaged";
  const preserveOneDeletedLine = isPartialFileChange && isDeletedFile && side === "staged";

  const contentLines: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let previousLineIncluded = false;

  for (let rowIndex = 1; rowIndex < group.rows.length; rowIndex += 1) {
    const row = group.rows[rowIndex]!;

    if (row.kind === "add") {
      const isSelected = rowIndex === selectedRowIndex;
      if (isSelected) {
        if (row.patchLine) contentLines.push(row.patchLine);
        newCount += 1;
      } else if (normalizeNewFile) {
        contentLines.push(` ${row.text}`);
        oldCount += 1;
        newCount += 1;
      }
      previousLineIncluded = isSelected || normalizeNewFile;
      continue;
    }

    if (row.kind === "delete") {
      if (rowIndex === selectedRowIndex) {
        if (row.patchLine) contentLines.push(row.patchLine);
        oldCount += 1;
      } else if (!preserveOneDeletedLine) {
        contentLines.push(` ${row.text}`);
        oldCount += 1;
        newCount += 1;
      }
      previousLineIncluded = rowIndex === selectedRowIndex || !preserveOneDeletedLine;
      continue;
    }

    if (row.kind === "context") {
      if (row.patchLine) contentLines.push(row.patchLine);
      oldCount += 1;
      newCount += 1;
      previousLineIncluded = true;
      continue;
    }

    if (row.kind === "notice" && row.patchLine && previousLineIncluded) {
      contentLines.push(row.patchLine);
    }
  }

  const oldStart = normalizeNewFile ? header.newLine : preserveOneDeletedLine ? 1 : header.oldLine;
  const newStart = normalizeDeletedFile ? header.oldLine : preserveOneDeletedLine ? 0 : header.newLine;
  const normalizedFilePatchLines = normalizeNewFile
    ? normalizeWholeFileHeaders(filePatchLines, "new")
    : normalizeDeletedFile
      ? normalizeWholeFileHeaders(filePatchLines, "deleted")
      : filePatchLines;
  const partialHeader = `@@ -${formatHunkRange(oldStart, oldCount)} +${formatHunkRange(newStart, newCount)} @@${header.suffix}`;
  return createPatch([
    ...normalizedFilePatchLines,
    partialHeader,
    ...contentLines
  ]);
}

export function isTechnicalFileHeader(row: DiffRow): boolean {
  if (row.kind === "file") {
    return true;
  }

  return row.kind === "meta" && /^(?:index |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |--- |\+\+\+ )/.test(row.text);
}

function splitDiffLines(text: string): string[] {
  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === "") {
    return lines.slice(0, -1);
  }

  return lines;
}

function parseHunkHeader(line: string): HunkState | null {
  const header = parseHunkHeaderDetails(line);

  return header
    ? { oldLine: header.oldLine, newLine: header.newLine }
    : null;
}

function parseHunkHeaderDetails(line: string): HunkHeader | null {
  const match = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@(?<suffix>.*)$/.exec(line);
  const oldStart = Number(match?.groups?.oldStart);
  const newStart = Number(match?.groups?.newStart);

  if (!Number.isInteger(oldStart) || !Number.isInteger(newStart)) {
    return null;
  }

  return {
    oldLine: oldStart,
    newLine: newStart,
    suffix: match?.groups?.suffix ?? ""
  };
}

function formatHunkRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

function normalizeWholeFileHeaders(lines: string[], kind: "new" | "deleted"): string[] {
  const pathHeader = lines.find((line) => line.startsWith(kind === "new" ? "+++ " : "--- "));
  const replacement = pathHeader
    ? `${kind === "new" ? "---" : "+++"} ${swapPatchPathPrefix(pathHeader.slice(4), kind === "new" ? "b" : "a")}`
    : null;

  return lines.flatMap((line) => {
    if (line.startsWith("new file mode ") || line.startsWith("deleted file mode ") || line.startsWith("index ")) {
      return [];
    }
    if (replacement && line === (kind === "new" ? "--- /dev/null" : "+++ /dev/null")) {
      return [replacement];
    }
    return [line];
  });
}

function swapPatchPathPrefix(value: string, prefix: "a" | "b"): string {
  const nextPrefix = prefix === "a" ? "b" : "a";
  if (value.startsWith(`${prefix}/`)) return `${nextPrefix}/${value.slice(2)}`;
  if (value.startsWith(`"${prefix}/`)) return `"${nextPrefix}/${value.slice(3)}`;
  return value;
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
