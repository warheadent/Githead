import { describe, expect, it } from "vitest";
import type { RepoSummary } from "../shared/types";
import {
  canPush,
  getPrimaryCommitAction,
  hasStagedChanges,
  hasUnpushedCommits
} from "./commitActions";

const baseSummary: RepoSummary = {
  repoPath: "D:\\Repo",
  isValid: true,
  branch: "main",
  upstream: "origin/main",
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
    expect(getPrimaryCommitAction(summary)).toBe("push");
  });

  it("does not enable push fallback when ahead count is zero", () => {
    const summary: RepoSummary = {
      ...baseSummary,
      statusLines: [
        "# branch.ab +0 -0"
      ]
    };

    expect(hasUnpushedCommits(summary)).toBe(false);
    expect(getPrimaryCommitAction(summary)).toBeNull();
  });

  it("does not enable push fallback without an upstream or branch.ab status", () => {
    expect(hasUnpushedCommits({
      ...baseSummary,
      upstream: null,
      statusLines: [
        "# branch.ab +3 -0"
      ]
    })).toBe(false);

    expect(hasUnpushedCommits({
      ...baseSummary,
      statusLines: [
        "# branch.head main"
      ]
    })).toBe(false);
  });
});
