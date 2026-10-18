import type { GitCommitGraphRow, GitCommitHistoryPage } from "../shared/types";

export const HISTORY_PAGE_SIZE = 200;
/**
 * Later pages grow with the loaded history, which keeps the request count
 * logarithmic for repositories without a commit-graph, where every read walks
 * the full history. The cap keeps each page far below the output limit.
 */
export const HISTORY_MAX_PAGE_SIZE = 10_000;

/**
 * How the renderer reads commit history:
 * - `full` reads the whole visible prefix from the top.
 * - `append` reads only the rows after the loaded prefix.
 * - `refresh` rereads the first page and keeps the rest when history has not moved.
 * `append` and `refresh` depend on the token of the loaded rows; when it no
 * longer matches, the caller falls back to `full`.
 */
export type HistoryRead =
  | { kind: "full"; limit: number }
  | { kind: "append"; limit: number; skip: number; tipsToken: string }
  | { kind: "refresh"; limit: number; tipsToken: string };

export interface AppliedHistoryPage {
  history: GitCommitGraphRow[];
  hasMore: boolean;
  tipsToken: string | null;
}

export function planHistoryRead(history: readonly GitCommitGraphRow[], tipsToken: string | null, loadMore: boolean): HistoryRead {
  if (!tipsToken || history.length === 0) return fullHistoryRead(history.length, loadMore);
  return loadMore
    ? { kind: "append", limit: Math.min(HISTORY_MAX_PAGE_SIZE, Math.max(HISTORY_PAGE_SIZE, history.length)), skip: history.length, tipsToken }
    : { kind: "refresh", limit: HISTORY_PAGE_SIZE, tipsToken };
}

export function fullHistoryRead(loadedCount: number, loadMore: boolean): HistoryRead {
  // Grow geometrically so repeated full reads stay logarithmic in count.
  return { kind: "full", limit: Math.max(HISTORY_PAGE_SIZE, loadedCount * (loadMore ? 2 : 1)) };
}

/** Requests one row past the page so the response shows whether more exist. */
export function historyReadRequest(read: HistoryRead): { limit: number; skip?: number; tipsToken?: string } {
  if (read.kind === "full") return { limit: read.limit + 1 };
  if (read.kind === "append") return { limit: read.limit + 1, skip: read.skip, tipsToken: read.tipsToken };
  return { limit: read.limit + 1, tipsToken: read.tipsToken };
}

/** Returns null when the page cannot extend `base`, so the caller must read the full prefix. */
export function applyHistoryPage(
  base: readonly GitCommitGraphRow[],
  baseHasMore: boolean,
  read: HistoryRead,
  page: GitCommitHistoryPage
): AppliedHistoryPage | null {
  if (page.tipsChanged) return null;
  const rows = page.rows.slice(0, read.limit);
  const pageHasMore = page.rows.length > read.limit;
  if (read.kind === "full") return { history: rows, hasMore: pageHasMore, tipsToken: page.tipsToken };
  if (page.tipsToken !== read.tipsToken) return null;
  if (read.kind === "append") return { history: [...base, ...rows], hasMore: pageHasMore, tipsToken: page.tipsToken };
  if (base.length <= read.limit) return { history: rows, hasMore: pageHasMore, tipsToken: page.tipsToken };
  // Unchanged tips produce the same listing, so the first page must match the
  // loaded prefix exactly. Anything else means the token missed a change.
  if (!pageHasMore || rows.some((row, index) => row.hash !== base[index]?.hash)) return null;
  return { history: [...rows, ...base.slice(read.limit)], hasMore: baseHasMore, tipsToken: page.tipsToken };
}
