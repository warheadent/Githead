import { describe, expect, it } from "vite-plus/test";
import type { RepoSummary } from "../shared/types";
import { REPOSITORY_SNAPSHOT_MAX_ENTRIES, REPOSITORY_SNAPSHOT_MAX_FILES_PER_ENTRY, REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS, RepositorySnapshotCache, getRepoPathKey } from "./repositorySnapshotCache";

const summary = (repoPath: string, fileCount = 1): RepoSummary => ({
  repoPath, kind: "git", capabilities: {} as RepoSummary["capabilities"], isValid: true, branch: "main", upstream: null, branches: [], hasHead: true, remotes: [], remoteBranches: [], defaultRemoteBranch: null, commitsAheadOfDefaultBranch: null, githubRepository: null, statusLines: [], files: Array.from({ length: fileCount }, (_, index) => ({ path: `file-${index}`, indexStatus: ".", worktreeStatus: "M", isStaged: false, isUnstaged: true, isConflicted: false })), safeDirectory: null, actionsConfig: {} as RepoSummary["actionsConfig"], validationErrors: []
});

const snapshot = (repoPath: string, fileCount = 1) => ({ summary: summary(repoPath, fileCount), history: [], historyScope: "current" as const, selection: fileCount ? { path: "file-0", side: "unstaged" as const, paths: ["file-0"], anchorPath: "file-0" } : null, activeView: "status" as const });

describe("RepositorySnapshotCache", () => {
  it("normalizes equivalent Repository paths", () => {
    expect(getRepoPathKey("D:\\Repo\\")).toBe(getRepoPathKey("d:\\repo"));
  });

  it("replaces entries and marks requested sections stale", () => {
    const cache = new RepositorySnapshotCache();
    cache.set("D:\\Repo", snapshot("D:\\Repo"));
    cache.set("d:\\repo\\", snapshot("D:\\Repo", 2));
    cache.markStale("D:\\Repo", ["status"]);
    expect(cache.size).toBe(1);
    expect(cache.get("D:\\Repo")?.stale.has("status")).toBe(true);
  });

  it("preserves the history scope with cached rows", () => {
    const cache = new RepositorySnapshotCache();
    cache.set("D:\\Repo", { ...snapshot("D:\\Repo"), historyScope: "all" });
    expect(cache.get("D:\\Repo")?.historyScope).toBe("all");
  });

  it("evicts the least recently used entry", () => {
    const cache = new RepositorySnapshotCache();
    for (let index = 0; index < REPOSITORY_SNAPSHOT_MAX_ENTRIES; index += 1) cache.set(`D:\\Repo${index}`, snapshot(`D:\\Repo${index}`));
    cache.get("D:\\Repo0");
    cache.set("D:\\Newest", snapshot("D:\\Newest"));
    expect(cache.get("D:\\Repo1")).toBeNull();
    expect(cache.get("D:\\Repo0")).not.toBeNull();
  });

  it("omits oversized File Status and its selection", () => {
    const cache = new RepositorySnapshotCache();
    cache.set("D:\\Huge", snapshot("D:\\Huge", REPOSITORY_SNAPSHOT_MAX_FILES_PER_ENTRY + 1));
    expect(cache.get("D:\\Huge")?.summary.files).toHaveLength(0);
    expect(cache.get("D:\\Huge")?.selection).toBeNull();
  });

  it("keeps synthetic large snapshots within deterministic budgets", () => {
    const cache = new RepositorySnapshotCache();
    for (let index = 0; index < 8; index += 1) cache.set(`D:\\Large${index}`, snapshot(`D:\\Large${index}`, 10_000));
    expect(cache.size).toBeLessThanOrEqual(REPOSITORY_SNAPSHOT_MAX_ENTRIES);
    expect(cache.retainedItemCount).toBeLessThanOrEqual(REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS);
  });
});
