import { describe, expect, it } from "vitest";
import type { RepoSummary } from "../shared/types";
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
  statusLines: [],
  files: [],
  validationErrors: []
};

describe("commit action helpers", () => {
  it("uses commit as the primary action when staged files exist", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      statusLines: [
        "# branch.ab +2 -0"
      ],
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
      statusLines: [
        "# branch.ab +2 -0"
      ]
    };

    expect(canPush(summary)).toBe(true);
    expect(getPushableCommitCount(summary)).toBe(2);
    expect(getPrimaryCommitAction(summary)).toBe("push");
  });

  it("reads upstream commits ready to pull from the branch behind count", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      statusLines: [
        "# branch.ab +1 -3"
      ]
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
      statusLines: [
        "# branch.ab +0 -0"
      ]
    };

    expect(hasUnpushedCommits(summary)).toBe(false);
    expect(getPushableCommitCount(summary)).toBe(0);
    expect(getPullableCommitCount(summary)).toBe(0);
    expect(getPrimaryCommitAction(summary)).toBeNull();
  });

  it("returns zero pullable commits without an upstream or branch.ab status", () => {
    const noUpstreamSummary: RepoSummary = {
      ...baseSummary,
      upstream: null,
      statusLines: [
        "# branch.ab +3 -4"
      ]
    };

    const noAheadBehindSummary: RepoSummary = {
      ...baseSummary,
      statusLines: [
        "# branch.head main"
      ]
    };

    expect(hasUnpushedCommits(noUpstreamSummary)).toBe(false);
    expect(getPushableCommitCount(noUpstreamSummary)).toBe(0);
    expect(getPullableCommitCount(noUpstreamSummary)).toBe(0);
    expect(hasUnpushedCommits(noAheadBehindSummary)).toBe(false);
    expect(getPushableCommitCount(noAheadBehindSummary)).toBe(0);
    expect(getPullableCommitCount(noAheadBehindSummary)).toBe(0);
  });

  it("returns zero pullable commits for malformed branch.ab status", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      statusLines: [
        "# branch.ab +3"
      ]
    };

    expect(getAheadBehindCounts(summary)).toBeNull();
    expect(hasUnpushedCommits(summary)).toBe(false);
    expect(getPushableCommitCount(summary)).toBe(0);
    expect(getPullableCommitCount(summary)).toBe(0);
  });
});
