import { isTechnicalFileHeader, type DiffRowGroup } from "./diffParser";

/**
 * Rows per render chunk. A chunk is the unit that mounts progressively and that the browser skips
 * with content-visibility while it is off screen, so a large diff costs layout, paint, and hit
 * testing only for the chunks near the viewport.
 */
export const DIFF_RENDER_CHUNK_ROWS = 64;
/** Matches the unwrapped .diff-row height in styles.css. */
export const DIFF_ROW_HEIGHT_PX = 20;
/** Matches the .diff-hunk-toolbar min-height in styles.css. */
export const DIFF_HUNK_TOOLBAR_HEIGHT_PX = 28;
/** Fixed columns before the code: two line numbers, the marker, and the code padding. */
export const DIFF_ROW_GUTTER_PX = 56 + 56 + 28 + 10 + 16;
const TAB_COLUMNS = 8;

/** A run of one group's visible rows inside a chunk. A hunk that spans chunks has one piece per chunk. */
export interface DiffRenderPiece {
  groupIndex: number;
  /** Indexes into the group's rows. */
  rowIndexes: readonly number[];
  /** The piece opens its hunk, so it renders the hunk toolbar. */
  startsHunk: boolean;
}

export interface DiffRenderChunk {
  index: number;
  pieces: readonly DiffRenderPiece[];
  rowCount: number;
  /** Height of the unwrapped rows and hunk toolbars, for the placeholder and the skipped chunk. */
  estimatedHeight: number;
  /** Widest code line in monospace columns, for the width of a skipped chunk. */
  columns: number;
}

export interface DiffRenderPlan {
  chunks: readonly DiffRenderChunk[];
  rowCount: number;
}

export function isVisibleDiffRow(group: DiffRowGroup, rowIndex: number): boolean {
  const row = group.rows[rowIndex];
  if (!row) return false;
  // A hunk shows its header row in the toolbar instead.
  return group.kind === "hunk" ? row.kind !== "hunk" : !isTechnicalFileHeader(row);
}

/**
 * Counts the monospace columns that a code line takes with `white-space: pre`. Wide East Asian and
 * astral characters count as two columns, which can overestimate but keeps long lines visible.
 */
export function measureDiffLineColumns(text: string): number {
  let columns = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 9) columns += TAB_COLUMNS - (columns % TAB_COLUMNS);
    else if (code >= 0xdc00 && code <= 0xdfff) continue;
    else columns += code >= 0x1100 ? 2 : 1;
  }
  return columns;
}

/** Splits the visible rows of a diff into render chunks of about `chunkRows` rows, in display order. */
export function planDiffRender(groups: readonly DiffRowGroup[], chunkRows = DIFF_RENDER_CHUNK_ROWS): DiffRenderPlan {
  const limit = Math.max(2, Math.floor(chunkRows));
  const chunks: DiffRenderChunk[] = [];
  let pieces: DiffRenderPiece[] = [];
  let piece: { groupIndex: number; rowIndexes: number[]; startsHunk: boolean } | null = null;
  // A hunk toolbar counts as one row toward the chunk size.
  let units = 0;
  let rowCount = 0;
  let totalRows = 0;
  let height = 0;
  let columns = 0;

  const flush = (): void => {
    if (pieces.length > 0) {
      chunks.push({ index: chunks.length, pieces, rowCount, estimatedHeight: height, columns });
    }
    pieces = [];
    piece = null;
    units = 0;
    rowCount = 0;
    height = 0;
    columns = 0;
  };

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    piece = null;
    if (group.kind === "hunk") {
      // Keeps a toolbar with at least its first row.
      if (units + 2 > limit) flush();
      piece = { groupIndex, rowIndexes: [], startsHunk: true };
      pieces.push(piece);
      units += 1;
      height += DIFF_HUNK_TOOLBAR_HEIGHT_PX;
    }

    for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
      if (!isVisibleDiffRow(group, rowIndex)) continue;
      if (units >= limit) flush();
      if (!piece) {
        piece = { groupIndex, rowIndexes: [], startsHunk: false };
        pieces.push(piece);
      }
      piece.rowIndexes.push(rowIndex);
      units += 1;
      rowCount += 1;
      totalRows += 1;
      height += DIFF_ROW_HEIGHT_PX;
      columns = Math.max(columns, measureDiffLineColumns(group.rows[rowIndex]!.text));
    }
  }
  flush();

  return { chunks, rowCount: totalRows };
}
