import type { CommitHistoryScope, GitCommitGraphRow, RepoSummary } from "../shared/types";

export const REPOSITORY_SNAPSHOT_MAX_ENTRIES = 4;
export const REPOSITORY_SNAPSHOT_MAX_FILES_PER_ENTRY = 10_000;
export const REPOSITORY_SNAPSHOT_MAX_HISTORY_PER_ENTRY = 200;
export const REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS = 20_000;

export type SnapshotSection = "identity" | "status" | "metadata";
export interface SnapshotSelection { path: string; side: "staged" | "unstaged"; paths: string[]; anchorPath: string }
export interface RepositorySnapshot {
  summary: RepoSummary;
  history: GitCommitGraphRow[];
  historyScope: CommitHistoryScope;
  selection: SnapshotSelection | null;
  activeView: "status" | "history";
  stale: ReadonlySet<SnapshotSection>;
}

interface StoredSnapshot extends Omit<RepositorySnapshot, "stale"> { stale: Set<SnapshotSection>; itemCount: number }

export function getRepoPathKey(repoPath: string): string {
  return repoPath.trim().replace(/[\\/]+$/, "").toLocaleLowerCase();
}

export class RepositorySnapshotCache {
  private readonly entries = new Map<string, StoredSnapshot>();
  private retainedItems = 0;

  set(repoPath: string, snapshot: Omit<RepositorySnapshot, "stale">): void {
    const key = getRepoPathKey(repoPath);
    if (!key) return;
    this.delete(repoPath);
    const retainStatus = snapshot.summary.files.length <= REPOSITORY_SNAPSHOT_MAX_FILES_PER_ENTRY;
    const files = retainStatus ? snapshot.summary.files.slice() : [];
    const history = snapshot.history.slice(0, REPOSITORY_SNAPSHOT_MAX_HISTORY_PER_ENTRY);
    const selection = retainStatus && snapshot.selection && files.some((file) => file.path === snapshot.selection?.path)
      ? { ...snapshot.selection, paths: snapshot.selection.paths.filter((path) => files.some((file) => file.path === path)) }
      : null;
    const entry: StoredSnapshot = {
      summary: { ...snapshot.summary, files, ...(retainStatus && snapshot.summary.submodules ? { submodules: snapshot.summary.submodules.slice() } : { submodules: [] }) },
      history,
      historyScope: snapshot.historyScope,
      selection,
      activeView: snapshot.activeView,
      stale: new Set<SnapshotSection>(["identity", "status", "metadata"]),
      itemCount: files.length + history.length
    };
    this.entries.set(key, entry);
    this.retainedItems += entry.itemCount;
    this.enforceBudgets();
  }

  get(repoPath: string): RepositorySnapshot | null {
    const key = getRepoPathKey(repoPath);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { ...entry, summary: { ...entry.summary, files: entry.summary.files.slice() }, history: entry.history.slice(), selection: entry.selection ? { ...entry.selection, paths: entry.selection.paths.slice() } : null, stale: new Set(entry.stale) };
  }

  markStale(repoPath: string, sections: Iterable<SnapshotSection>): void {
    const entry = this.entries.get(getRepoPathKey(repoPath));
    if (entry) for (const section of sections) entry.stale.add(section);
  }

  delete(repoPath: string): void {
    const key = getRepoPathKey(repoPath);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.retainedItems -= entry.itemCount;
    this.entries.delete(key);
  }

  get size(): number { return this.entries.size; }
  get retainedItemCount(): number { return this.retainedItems; }

  private enforceBudgets(): void {
    while (this.entries.size > REPOSITORY_SNAPSHOT_MAX_ENTRIES || this.retainedItems > REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.delete(oldest);
    }
  }
}
