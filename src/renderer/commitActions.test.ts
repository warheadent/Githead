import { describe, expect, it } from "vite-plus/test";
import type { RepoSummary } from "../shared/types";
import { gitCapabilities } from "../shared/types";
import {
  canPush,
  getAheadBehindCounts,
  getPrimaryCommitAction,
  getPullableCommitCount,
  getPushableCommitCount,
  hasStagedChanges,
  hasUnpushedCommits
} from "./commitActions";

const baseSummary: RepoSummary = {
  repoPath: "D:\\Repo",
  kind: "git",
  capabilities: gitCapabilities(),
  isValid: true,
  branch: "main",
  upstream: "origin/main",
  branches: [
    {
      name: "main",
      current: true,
      upstream: "origin/main"
    }
  ],
  hasHead: true,
  remotes: [],
  remoteBranches: [],
  defaultRemoteBranch: null,
  commitsAheadOfDefaultBranch: null,
  githubRepository: null,
  ahead: null,
  behind: null,
  files: [],
  operationState: null,
  safeDirectory: null,
  actionsConfig: {
    hasGitheadDir: false,
    actions: [],
    error: "",
    shared: {
      target: "shared",
      fileName: "actions.toml",
      exists: false,
      actions: [],
      error: "",
      writable: true,
      blockedReason: ""
    },
    local: {
      target: "local",
      fileName: "actions.local.toml",
      exists: false,
      actions: [],
      error: "",
      writable: true,
      blockedReason: ""
    }
  },
  validationErrors: []
};

describe("commit action helpers", () => {
  it("uses commit as the primary action when staged files exist", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      ahead: 2,
      behind: 0,
      files: [
        {
          path: "staged.ts",
          indexStatus: "M",
          worktreeStatus: ".",
          isStaged: true,
          isUnstaged: false,
          isConflicted: false
        }
      ]
    };

    expect(hasStagedChanges(summary)).toBe(true);
    expect(hasUnpushedCommits(summary)).toBe(true);
    expect(getPrimaryCommitAction(summary)).toBe("commit");
  });

  it("enables push fallback when the branch is ahead of upstream", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      ahead: 2,
      behind: 0
    };

    expect(canPush(summary)).toBe(true);
    expect(getPushableCommitCount(summary)).toBe(2);
    expect(getPrimaryCommitAction(summary)).toBe("push");
  });

  it("reads upstream commits ready to pull from the branch behind count", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      ahead: 1,
      behind: 3
    };

    expect(getAheadBehindCounts(summary)).toEqual({
      ahead: 1,
      behind: 3
    });
    expect(getPullableCommitCount(summary)).toBe(3);
  });

  it("does not enable push fallback when ahead count is zero", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      ahead: 0,
      behind: 0
    };

    expect(hasUnpushedCommits(summary)).toBe(false);
    expect(getPushableCommitCount(summary)).toBe(0);
    expect(getPullableCommitCount(summary)).toBe(0);
    expect(getPrimaryCommitAction(summary)).toBeNull();
  });

  it("returns zero pullable commits without an upstream or ahead-behind data", () => {
    const noUpstreamSummary: RepoSummary = {
      ...baseSummary,
      upstream: null,
      ahead: 3,
      behind: 4
    };

    const noAheadBehindSummary: RepoSummary = {
      ...baseSummary,
      ahead: null,
      behind: null
    };

    expect(hasUnpushedCommits(noUpstreamSummary)).toBe(false);
    expect(getPushableCommitCount(noUpstreamSummary)).toBe(0);
    expect(getPullableCommitCount(noUpstreamSummary)).toBe(0);
    expect(hasUnpushedCommits(noAheadBehindSummary)).toBe(false);
    expect(getPushableCommitCount(noAheadBehindSummary)).toBe(0);
    expect(getPullableCommitCount(noAheadBehindSummary)).toBe(0);
  });

  it("returns zero pullable commits for incomplete ahead-behind data", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      ahead: 3,
      behind: null
    };

    expect(getAheadBehindCounts(summary)).toBeNull();
    expect(hasUnpushedCommits(summary)).toBe(false);
    expect(getPushableCommitCount(summary)).toBe(0);
    expect(getPullableCommitCount(summary)).toBe(0);
  });
});
