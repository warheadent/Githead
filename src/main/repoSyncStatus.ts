import type { RepoSyncStatus } from "../shared/types";
import { mapWithConcurrency } from "./asyncMap";

export const REPO_SYNC_STATUS_CONCURRENCY = 4;

export function mapRepoSyncStatuses(
  repoPaths: readonly string[],
  getStatus: (repoPath: string) => Promise<RepoSyncStatus>
): Promise<RepoSyncStatus[]> {
  return mapWithConcurrency(repoPaths, REPO_SYNC_STATUS_CONCURRENCY, getStatus);
}
