import { describe, expect, it } from "vite-plus/test";
import type { GitBranch, GitRemoteBranch } from "../shared/types";
import {
  LOCAL_BRANCH_GROUP,
  OPERATION_RUNNING_REASON,
  REMOTE_BRANCH_GROUP,
  REPOSITORY_UNAVAILABLE_REASON,
  UPSTREAM_TRACKING_GROUP,
  buildBranchItems,
  buildUpstreamItems,
  getOperationBlockedReason,
  getUpstreamDisabledReason,
  resolveBranchChoice
} from "./branchOptions";

const repoPath = "D:\\Githead";
const linkedWorktree = "D:\\Githead-feature";

function remote(name: string): GitRemoteBranch {
  const [remoteName = "", ...rest] = name.split("/");
  return { name, remote: remoteName, branch: rest.join("/") };
}

describe("buildBranchItems", () => {
  it("lists the current branch first, then other local branches, then remote branches", () => {
    const branches: GitBranch[] = [
      { name: "feature/local", current: false, upstream: null },
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/review", current: false, upstream: "origin/feature/review" }
    ];

    const items = buildBranchItems({
      repoPath,
      currentBranch: "main",
      branches,
      remoteBranches: [remote("origin/main"), remote("origin/feature/review"), remote("upstream/release")]
    });

    expect(items.map(({ value, label, detail, group, icon, current }) => ({ value, label, detail, group, icon, current }))).toEqual([
      { value: "local:main", label: "main", detail: "current", group: LOCAL_BRANCH_GROUP, icon: "branch", current: true },
      { value: "local:feature/local", label: "feature/local", detail: undefined, group: LOCAL_BRANCH_GROUP, icon: "branch", current: false },
      { value: "local:feature/review", label: "feature/review", detail: "origin/feature/review", group: LOCAL_BRANCH_GROUP, icon: "branch", current: false },
      { value: "remote:upstream/release", label: "release", detail: "upstream", group: REMOTE_BRANCH_GROUP, icon: "remote", current: false }
    ]);
    expect("detail" in items[1]!).toBe(false);
  });

  it("keeps the current branch detail free of its upstream", () => {
    const [current] = buildBranchItems({
      repoPath,
      currentBranch: "main",
      branches: [{ name: "main", current: true, upstream: "origin/main" }],
      remoteBranches: []
    });

    expect(`${current?.label} ${current?.detail}`).toMatch(/main.*current/);
    expect(`${current?.label} ${current?.detail}`).not.toMatch(/main.*origin/);
  });

  it("hides only remote branches that a local branch already tracks", () => {
    const items = buildBranchItems({
      repoPath,
      currentBranch: "main",
      branches: [
        { name: "main", current: true, upstream: "origin/main" },
        { name: "release", current: false, upstream: "upstream/release" }
      ],
      remoteBranches: [remote("origin/main"), remote("origin/release")]
    });

    expect(items.filter((item) => item.kind === "remote").map((item) => [item.label, item.detail])).toEqual([["release", "origin"]]);
  });

  it("names the worktree that has a branch checked out and opens it instead of switching", () => {
    const items = buildBranchItems({
      repoPath,
      currentBranch: "main",
      branches: [
        { name: "main", current: true, upstream: null, worktreePath: repoPath },
        { name: "feature/worktrees", current: false, upstream: "origin/feature/worktrees", worktreePath: linkedWorktree }
      ],
      remoteBranches: []
    });
    const occupied = items.find((item) => item.label === "feature/worktrees")!;

    expect(occupied.detail).toBe("Githead-feature");
    expect(occupied.icon).toBe("worktree");
    expect(resolveBranchChoice(occupied)).toEqual({
      kind: "open-worktree",
      branchName: "feature/worktrees",
      worktreePath: linkedWorktree
    });
  });

  it("switches to a branch whose worktree path is the open repository", () => {
    const [, branch] = buildBranchItems({
      repoPath: "d:\\githead\\",
      currentBranch: "main",
      branches: [
        { name: "main", current: true, upstream: null },
        { name: "develop", current: false, upstream: null, worktreePath: repoPath }
      ],
      remoteBranches: []
    });

    expect(branch?.icon).toBe("branch");
    expect(resolveBranchChoice(branch!)).toEqual({ kind: "switch", branchName: "develop" });
  });

  it("resolves remote branches to a checkout and the current branch to nothing", () => {
    const items = buildBranchItems({
      repoPath,
      currentBranch: "main",
      branches: [{ name: "main", current: true, upstream: null }],
      remoteBranches: [remote("origin/feature/review")]
    });

    expect(resolveBranchChoice(items[0]!)).toBeNull();
    expect(resolveBranchChoice(items[1]!)).toEqual({ kind: "checkout-remote", remoteBranch: remote("origin/feature/review") });
  });

  it("marks the branch flagged current on a detached summary", () => {
    const items = buildBranchItems({
      repoPath,
      currentBranch: null,
      branches: [
        { name: "main", current: false, upstream: null },
        { name: "topic", current: true, upstream: null }
      ],
      remoteBranches: []
    });

    expect(items.map((item) => [item.label, item.current])).toEqual([["topic", true], ["main", false]]);
  });
});

describe("buildUpstreamItems", () => {
  it("groups remote branches by remote and ends with 'No upstream'", () => {
    const items = buildUpstreamItems(
      [remote("origin/main"), remote("upstream/main"), remote("origin/feature")],
      "origin/main"
    );

    expect(items.map(({ value, upstream, label, detail, group, selected }) => ({ value, upstream, label, detail, group, selected }))).toEqual([
      { value: "origin/main", upstream: "origin/main", label: "origin/main", detail: "main", group: "origin", selected: true },
      { value: "origin/feature", upstream: "origin/feature", label: "origin/feature", detail: "feature", group: "origin", selected: false },
      { value: "upstream/main", upstream: "upstream/main", label: "upstream/main", detail: "main", group: "upstream", selected: false },
      { value: "", upstream: null, label: "No upstream", detail: "Stop tracking origin/main", group: UPSTREAM_TRACKING_GROUP, selected: false }
    ]);
  });

  it("selects 'No upstream' when the branch tracks nothing", () => {
    expect(buildUpstreamItems([], null)).toEqual([{
      value: "",
      upstream: null,
      label: "No upstream",
      detail: "Do not track a remote branch",
      group: UPSTREAM_TRACKING_GROUP,
      selected: true
    }]);
  });
});

describe("getOperationBlockedReason", () => {
  it("tells the user to wait only while an operation runs", () => {
    expect(getOperationBlockedReason({ running: false, operationState: null })).toBeNull();
    expect(getOperationBlockedReason({ running: true, operationState: null })).toBe(OPERATION_RUNNING_REASON);
  });

  it("tells the user to finish or abort an unfinished operation, also while another operation runs", () => {
    expect(getOperationBlockedReason({ running: false, operationState: { kind: "merge" } })).toBe("Finish or abort the active merge first.");
    expect(getOperationBlockedReason({ running: true, operationState: { kind: "cherry-pick" } })).toBe("Finish or abort the active cherry-pick first.");
  });
});

describe("getUpstreamDisabledReason", () => {
  const base = {
    currentBranch: "main",
    upstream: null,
    remoteBranches: [remote("origin/main")],
    running: false,
    operationState: null,
    isValid: true
  };

  it("allows a change on a branch with remote branches or an upstream", () => {
    expect(getUpstreamDisabledReason(base)).toBeNull();
    expect(getUpstreamDisabledReason({ ...base, remoteBranches: [], upstream: "origin/main" })).toBeNull();
  });

  it("explains each blocked state", () => {
    expect(getUpstreamDisabledReason({ ...base, currentBranch: null })).toBe("Select a branch before changing its upstream");
    expect(getUpstreamDisabledReason({ ...base, remoteBranches: [] })).toBe("Add a remote before setting an upstream");
    expect(getUpstreamDisabledReason({ ...base, running: true })).toBe(OPERATION_RUNNING_REASON);
    expect(getUpstreamDisabledReason({ ...base, isValid: false })).toBe(REPOSITORY_UNAVAILABLE_REASON);
  });

  it("tells the user to finish or abort an unfinished merge or rebase instead of waiting", () => {
    expect(getUpstreamDisabledReason({ ...base, operationState: { kind: "merge" } })).toBe("Finish or abort the active merge first.");
    // A rebase detaches HEAD, but selecting a branch is not possible until the rebase ends.
    expect(getUpstreamDisabledReason({ ...base, currentBranch: null, running: true, operationState: { kind: "rebase" } }))
      .toBe("Finish or abort the active rebase first.");
    expect(getUpstreamDisabledReason({ ...base, isValid: false, operationState: { kind: "merge" } })).toBe(REPOSITORY_UNAVAILABLE_REASON);
  });
});
