import type { GitService } from "./gitService";

/**
 * The version-control operations Githead routes per repository. Defined as a
 * `Pick` of the reference `GitService` implementation so the contract can never
 * drift from Git's real method signatures: any new backend (e.g. `LoreService`)
 * that `implements VcsService` is forced to match them exactly.
 *
 * Methods listed here that a backend cannot support (e.g. hunk staging or tags
 * on Lore) must still be implemented, returning a structured "not supported"
 * failure. The renderer normally hides them via {@link RepoCapabilities}.
 */
export type VcsService = Pick<
  GitService,
  | "getRepoSummary"
  | "getRepoSyncStatus"
  | "getRepoSyncStatuses"
  | "getGitHubRepository"
  | "checkRepositoryAccess"
  | "cloneRepository"
  | "getFileDiff"
  | "fetchLfsImageVersions"
  | "getStagedDiff"
  | "getCommitHistory"
  | "getCommitDetails"
  | "getCommitFileDiff"
  | "writeCommitFileVersionToPath"
  | "resetFilesToCommit"
  | "stageFiles"
  | "unstageFiles"
  | "stageHunk"
  | "unstageHunk"
  | "commitChanges"
  | "resetBranchToCommit"
  | "revertCommit"
  | "createTag"
  | "deleteTag"
  | "switchBranch"
  | "createBranch"
  | "renameBranch"
  | "deleteBranch"
  | "setBranchUpstream"
  | "publishBranch"
  | "getRemoteConfigs"
  | "addRemote"
  | "renameRemote"
  | "setRemoteUrl"
  | "removeRemote"
  | "revertFileChanges"
  | "addPathToIgnore"
  | "addSafeDirectory"
  | "runGitAction"
  | "runConfiguredAction"
  | "saveConfiguredActions"
>;
