import type { GitCommitChangedFile, GitFileHistoryEntry } from "../shared/types";

export interface HistoricalFileTarget {
  hash: string;
  path: string;
  originalPath?: string;
  status: string;
}

export type HistoryRoute =
  | { kind: "repository" }
  | { kind: "file"; origin: HistoricalFileTarget }
  | { kind: "blame"; target: HistoricalFileTarget; returnTo: "repository" | "file" };

export const repositoryHistoryRoute: HistoryRoute = { kind: "repository" };

export function targetFromCommitFile(hash: string, file: GitCommitChangedFile): HistoricalFileTarget {
  return { hash, path: file.path, ...(file.originalPath ? { originalPath: file.originalPath } : {}), status: file.status };
}

export function targetFromHistoryEntry(entry: GitFileHistoryEntry): HistoricalFileTarget {
  return { hash: entry.hash, path: entry.path, ...(entry.originalPath ? { originalPath: entry.originalPath } : {}), status: entry.status };
}
