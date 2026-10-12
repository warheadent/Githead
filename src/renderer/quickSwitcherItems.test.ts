import { describe, expect, it } from "vite-plus/test";
import {
  gitCapabilities,
  loreCapabilities,
  type AppUpdateState,
  type GitActionsConfig,
  type GitConfiguredAction,
  type GitRepositoryOperationKind,
  type GitRepositoryOperationState,
  type GitWorktree,
  type RepoSummary,
  type RepoSyncStatus,
  type RepositoryGroup
} from "../shared/types";
import { OPERATION_RUNNING_REASON, REPOSITORY_UNAVAILABLE_REASON } from "./branchOptions";
import {
  REMOTE_BRANCH_ROW_LIMIT,
  buildBranchSectionItems,
  buildCommandItems,
  buildGoToItems,
  buildQuickSwitcherSections,
  buildRepositoryActionItems,
  buildRepositoryItems,
  filterQuickSwitcherItems,
  type QuickSwitcherInput,
  type QuickSwitcherItem,
  type QuickSwitcherSection,
  type RepositoryItemsInput
} from "./quickSwitcherItems";
import { normalizeRepositoryOrganization } from "./repositoryOrganization";

const repoPath = "D:\\Githead";
const other = "D:\\Work\\Other";
const pinned = "D:\\Work\\Pinned";
const hidden = "D:\\Archive\\Hidden";
const linked = "D:\\Githead-feature";

function createSummary(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    repoPath,
    kind: "git",
    capabilities: gitCapabilities(),
    isValid: true,
    branch: "main",
    currentTag: null,
    upstream: "origin/main",
    branches: [{ name: "main", current: true, upstream: "origin/main" }],
    hasHead: true,
    remotes: [
      { name: "origin", url: "https://github.com/acme/githead.git", direction: "fetch" },
      { name: "origin", url: "https://github.com/acme/githead.git", direction: "push" }
    ],
    remoteBranches: [{ name: "origin/main", remote: "origin", branch: "main" }],
    defaultRemoteBranch: { name: "origin/main", remote: "origin", branch: "main" },
    commitsAheadOfDefaultBranch: 0,
    githubRepository: null,
    ahead: null,
    behind: null,
    files: [],
    operationState: null,
    validationErrors: [],
    safeDirectory: null,
    actionsConfig: createActionsConfig(),
    ...overrides
  };
}

function createActionsConfig(actions: GitConfiguredAction[] = [], error = ""): GitActionsConfig {
  const file = { exists: true, actions: [], error: "", writable: true, blockedReason: "" };
  return {
    hasGitheadDir: true,
    actions,
    error,
    shared: { ...file, target: "shared", fileName: "actions.json" },
    local: { ...file, target: "local", fileName: "actions.local.json" }
  };
}

function createAction(name: string, command: string, description = ""): GitConfiguredAction {
  return { name, command, description, shell: "powershell" };
}

function createOperationState(kind: GitRepositoryOperationKind): GitRepositoryOperationState {
  const action = { supported: true, enabled: true, disabledReason: null, requiresConfirmation: false };
  return {
    stateId: `${kind}-1`,
    kind,
    phase: "conflicts",
    backend: null,
    hasConflicts: true,
    conflictedPaths: ["src/App.tsx"],
    sequence: null,
    originalBranch: "main",
    currentBranch: kind === "rebase" ? null : "main",
    actions: { continue: action, skip: action, "keep-empty": action, abort: action },
    summary: `${kind} in progress`
  };
}

const MERGE_REASON = "Finish or abort the active merge first.";

function createSyncStatus(path: string, overrides: Partial<RepoSyncStatus> = {}): RepoSyncStatus {
  return { repoPath: path, kind: "git", isValid: true, ahead: 0, behind: 0, error: "", ...overrides };
}

function createWorktree(path: string, overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path,
    head: "abc",
    branch: "main",
    isMain: false,
    isBare: false,
    isDetached: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
    ...overrides
  };
}

function createGroup(overrides: Partial<RepositoryGroup> = {}): RepositoryGroup {
  return {
    id: "d:\\githead\\.git",
    kind: "git",
    anchorPath: repoPath,
    lastUsedPath: repoPath,
    recentPaths: [repoPath],
    commonDir: "D:\\Githead\\.git",
    error: "",
    worktrees: [createWorktree(repoPath, { isMain: true })],
    ...overrides
  };
}

function createAppUpdate(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    enabled: true,
    status: "idle",
    currentVersion: "1.0.0",
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false,
    ...overrides
  };
}

function repositoryInput(overrides: Partial<RepositoryItemsInput> = {}): RepositoryItemsInput {
  return {
    repoPath,
    repoRecents: [repoPath, other],
    repositoryGroups: [],
    organization: normalizeRepositoryOrganization(null),
    repoSyncStatuses: {},
    showHidden: false,
    searching: false,
    running: false,
    summary: null,
    ...overrides
  };
}

function createInput(overrides: Partial<QuickSwitcherInput> = {}): QuickSwitcherInput {
  return {
    ...repositoryInput(),
    summary: createSummary(),
    stashCount: 0,
    pullRequestCount: null,
    issueCount: null,
    activityAttention: "none",
    activeView: "status",
    branchPullRequests: [],
    hasPullRequestData: true,
    appUpdate: createAppUpdate(),
    canGoBack: false,
    canGoForward: false,
    ...overrides
  };
}

const labels = (items: readonly QuickSwitcherItem[]): string[] => items.map((item) => item.label);
const find = (items: readonly QuickSwitcherItem[], label: string | RegExp): QuickSwitcherItem => {
  const item = items.find((candidate) => typeof label === "string" ? candidate.label === label : label.test(candidate.label));
  if (!item) throw new Error(`No item named ${String(label)} in ${labels(items).join(" | ")}`);
  return item;
};
const sectionSummary = (sections: readonly QuickSwitcherSection[]): Array<[string, string]> => sections.map((section) => [section.id, section.label]);

describe("buildRepositoryItems", () => {
  it("lists pinned repositories first and drops project grouping", () => {
    const organization = normalizeRepositoryOrganization({
      version: 1,
      projects: [{ id: "tools", name: "Tools", collapsed: true }],
      repositories: {
        [pinned.toLowerCase()]: { pinned: true },
        [other.toLowerCase()]: { projectId: "tools", alias: "Builder" }
      }
    });

    const items = buildRepositoryItems(repositoryInput({ repoRecents: [repoPath, other, pinned], organization }));

    expect(labels(items)).toEqual([
      `Switch to ${pinned}`,
      `Switch to ${repoPath}`,
      `Switch to ${other}`,
      "Add or clone repository…",
      "Organize repositories…"
    ]);
    const builder = find(items, `Switch to ${other}`);
    expect(builder.title).toBe("Builder");
    expect(builder.keywords).toEqual(expect.arrayContaining(["Builder", "Tools"]));
    expect(find(items, "Add or clone repository…").kbd).toBe("Ctrl O");
  });

  it("marks the open repository current and adds sync counts to the name", () => {
    const items = buildRepositoryItems(repositoryInput({
      repoSyncStatuses: {
        [repoPath.toLowerCase()]: createSyncStatus(repoPath),
        [other.toLowerCase()]: createSyncStatus(other, { ahead: 2, behind: 1 })
      }
    }));

    const current = find(items, `Switch to ${repoPath}`);
    expect(current.current).toBe(true);
    expect(current.meta).toBe("current");
    expect(current.payload).toMatchObject({ path: repoPath, menuPath: repoPath, vcsKind: "git" });
    const behind = find(items, `Switch to ${other}, 2 commits ahead, 1 commit behind`);
    expect(behind.current).toBe(false);
    expect(behind.title).toBe("Other");
  });

  it("nests worktrees under a repository that has more than one and opens the last-used worktree from the group row", () => {
    const group = createGroup({
      lastUsedPath: linked,
      worktrees: [
        createWorktree(repoPath, { isMain: true }),
        createWorktree(linked, { branch: "feature/worktrees", locked: true })
      ]
    });

    const items = buildRepositoryItems(repositoryInput({
      repoPath: linked,
      repoRecents: [repoPath],
      repositoryGroups: [group],
      repoSyncStatuses: { [linked.toLowerCase()]: createSyncStatus(linked, { behind: 3 }) }
    }));

    expect(items.map((item) => [item.label, item.depth ?? 0, item.current ?? false])).toEqual([
      [`Switch to ${repoPath}`, 0, true],
      [`Switch to worktree main at ${repoPath}`, 1, false],
      [`Switch to worktree feature/worktrees at ${linked}, 3 commits behind`, 1, true],
      ["Add or clone repository…", 0, false],
      ["Organize repositories…", 0, false]
    ]);
    expect(items[0]?.payload).toMatchObject({ path: linked, menuPath: repoPath, group, worktree: null });
    expect(items[0]?.keywords).toEqual(expect.arrayContaining([linked, "feature/worktrees"]));
    expect(items[2]?.payload).toMatchObject({ path: linked, menuPath: linked, group, worktree: group.worktrees[1] });
    expect(items[1]?.meta).toBe("main");
    expect(items[2]?.meta).toBe("current · locked");
  });

  it("does not nest a repository with a single worktree", () => {
    const items = buildRepositoryItems(repositoryInput({ repoRecents: [repoPath], repositoryGroups: [createGroup()] }));

    expect(items.some((item) => item.depth === 1)).toBe(false);
  });

  it("hides hidden repositories until shown or searched, except the open one", () => {
    const organization = normalizeRepositoryOrganization({
      version: 1,
      projects: [],
      repositories: { [hidden.toLowerCase()]: { hidden: true }, [repoPath.toLowerCase()]: { hidden: true } }
    });
    const input = repositoryInput({ repoRecents: [repoPath, hidden], organization });

    const collapsed = buildRepositoryItems(input);
    expect(labels(collapsed)).toEqual([
      `Switch to ${repoPath}`,
      "Add or clone repository…",
      "Show hidden repositories (2)",
      "Organize repositories…"
    ]);
    expect(find(collapsed, "Show hidden repositories (2)").payload).toEqual({ showHidden: true });

    const shown = buildRepositoryItems({ ...input, showHidden: true });
    expect(labels(shown)).toContain(`Switch to ${hidden}`);
    expect(find(shown, "Hide hidden repositories").payload).toEqual({ showHidden: false });
    expect(find(shown, `Switch to ${hidden}`).payload).toMatchObject({ hidden: true });

    expect(labels(buildRepositoryItems({ ...input, searching: true }))).toContain(`Switch to ${hidden}`);
  });

  it("repairs unavailable repositories and disables every row while an operation runs", () => {
    const reason = "Selected folder is not a git repository.";
    const items = buildRepositoryItems(repositoryInput({
      running: true,
      repoSyncStatuses: { [other.toLowerCase()]: createSyncStatus(other, { isValid: false, error: reason }) }
    }));

    const repair = find(items, `Repair repository location for ${other}`);
    expect(repair.kind).toBe("repair");
    expect(repair.payload).toMatchObject({ path: other, reason });
    expect(items.filter((item) => item.kind === "repository" || item.kind === "repair" || item.kind === "add-repository").every((item) => item.disabled)).toBe(true);
    expect(find(items, `Switch to ${repoPath}`).disabledReason).toBe(OPERATION_RUNNING_REASON);
    expect(find(items, "Organize repositories…").disabled).toBeFalsy();
  });

  it("repairs a worktree group with an error and disables missing worktrees", () => {
    const items = buildRepositoryItems(repositoryInput({
      repoRecents: [repoPath],
      repositoryGroups: [createGroup({
        error: "Unable to list worktrees.",
        worktrees: [createWorktree(repoPath, { isMain: true }), createWorktree(linked, { prunable: true, prunableReason: "gitdir file points to non-existent location" })]
      })]
    }));

    expect(find(items, `Repair repository location for ${repoPath}`).payload).toMatchObject({ reason: "Unable to list worktrees." });
    const missing = find(items, /^Switch to worktree main at D:\\Githead-feature/);
    expect(missing.disabled).toBe(true);
    expect(missing.disabledReason).toBe("gitdir file points to non-existent location");
    expect(missing.meta).toBe("missing");
  });

  it("repairs a worktree group at its anchor when the last-used worktree is a linked worktree", () => {
    const worktrees = [createWorktree(repoPath, { isMain: true }), createWorktree(linked, { branch: "feature/worktrees" })];
    const groupError = buildRepositoryItems(repositoryInput({
      repoPath: linked,
      repoRecents: [repoPath],
      repositoryGroups: [createGroup({ lastUsedPath: linked, error: "Unable to list worktrees.", worktrees })]
    }));
    const syncError = buildRepositoryItems(repositoryInput({
      repoPath: "",
      repoRecents: [repoPath],
      repositoryGroups: [createGroup({ lastUsedPath: linked, worktrees })],
      repoSyncStatuses: { [repoPath.toLowerCase()]: createSyncStatus(repoPath, { isValid: false, error: "Folder moved." }) }
    }));

    const repair = find(groupError, `Repair repository location for ${repoPath}`);
    expect(repair.current).toBe(true);
    expect(repair.payload).toMatchObject({ path: repoPath, menuPath: repoPath, reason: "Unable to list worktrees." });
    expect(find(syncError, `Repair repository location for ${repoPath}`).payload).toMatchObject({ path: repoPath, menuPath: repoPath, reason: "Folder moved." });
  });

  it("tells the user to finish or abort an unfinished merge instead of waiting", () => {
    const input = repositoryInput({
      summary: createSummary({ operationState: createOperationState("merge") }),
      repoRecents: [repoPath, other],
      repositoryGroups: [createGroup({ worktrees: [createWorktree(repoPath, { isMain: true }), createWorktree(linked, { prunable: true })] })],
      repoSyncStatuses: { [other.toLowerCase()]: createSyncStatus(other, { isValid: false, error: "Folder moved." }) }
    });

    for (const items of [buildRepositoryItems(input), buildRepositoryItems({ ...input, running: true })]) {
      const blocked = items.filter((item) => item.kind === "repository" || item.kind === "repair" || item.kind === "add-repository");
      expect(blocked.map((item) => item.label)).toEqual([
        `Switch to ${repoPath}`,
        `Switch to worktree main at ${repoPath}`,
        `Switch to worktree main at ${linked}`,
        `Repair repository location for ${other}`,
        "Add or clone repository…"
      ]);
      expect(blocked.every((item) => item.disabled && item.disabledReason === MERGE_REASON)).toBe(true);
      expect(find(items, "Organize repositories…").disabled).toBeFalsy();
    }
  });
});

describe("buildBranchSectionItems", () => {
  it("keeps the branch picker names and marks local-only branches", () => {
    const sections = buildBranchSectionItems({
      repoPath,
      running: false,
      summary: createSummary({
        ahead: 2,
        branches: [
          { name: "main", current: true, upstream: "origin/main" },
          { name: "feature/nav", current: false, upstream: null },
          { name: "feature/worktrees", current: false, upstream: null, worktreePath: linked }
        ],
        remoteBranches: [
          { name: "origin/main", remote: "origin", branch: "main" },
          { name: "origin/feature/review", remote: "origin", branch: "feature/review" }
        ]
      })
    });

    expect(labels(sections["branches-local"])).toEqual([
      "main, current, 2 commits ahead",
      "feature/nav, local only",
      "feature/worktrees, Githead-feature"
    ]);
    expect(sections["branches-local"][0]?.meta).toBe("↑2");
    expect(sections["branches-local"][0]?.current).toBe(true);
    expect(labels(sections["branches-remote"])).toEqual(["feature/review, origin"]);
    expect(labels(sections["branches-local"]).some((label) => /main.*origin/.test(label))).toBe(false);
    expect(sections["branches-local"][2]?.payload).toMatchObject({ choice: { kind: "open-worktree", worktreePath: linked } });
    expect(sections["branches-remote"][0]?.payload).toMatchObject({ choice: { kind: "checkout-remote" } });
  });

  it("lists branch actions with git-only actions, upstream and remotes", () => {
    const sections = buildBranchSectionItems({ repoPath, running: false, summary: createSummary() });

    expect(labels(sections["branch-actions"])).toEqual([
      "New branch…",
      "Merge into main…",
      "Rebase main onto…",
      "Check out tag…",
      "Add worktree…",
      "Manage branches…",
      "Change upstream…, origin/main"
    ]);
    expect(find(sections["branch-actions"], "New branch…").kbd).toBe("Ctrl B");
    expect(sections["branch-actions"].every((item) => !item.disabled)).toBe(true);
    expect(labels(sections.remotes)).toEqual(["Open remote repository", "Manage remotes…, origin"]);
    expect(find(sections.remotes, "Open remote repository").payload).toEqual({ url: "https://github.com/acme/githead" });
  });

  it("disables switching and branch changes while running but keeps Manage branches and Manage remotes", () => {
    const sections = buildBranchSectionItems({
      repoPath,
      running: true,
      summary: createSummary({ remoteBranches: [{ name: "origin/feature", remote: "origin", branch: "feature" }] })
    });

    expect([...sections["branches-local"], ...sections["branches-remote"]].every((item) => item.disabled && item.disabledReason === OPERATION_RUNNING_REASON)).toBe(true);
    const actions = sections["branch-actions"];
    expect(find(actions, "Manage branches…").disabled).toBeFalsy();
    expect(find(actions, "Manage branches…").disabledReason).toBeUndefined();
    expect(find(actions, "New branch…").disabled).toBe(true);
    expect(find(actions, "Merge into main…").disabledReason).toBe(OPERATION_RUNNING_REASON);
    expect(find(actions, "Change upstream…, origin/main").disabledReason).toBe(OPERATION_RUNNING_REASON);
    expect(find(sections.remotes, /^Manage remotes…/).disabled).toBeFalsy();
  });

  it("tells the user to finish or abort an unfinished merge instead of waiting", () => {
    const sections = buildBranchSectionItems({
      repoPath,
      running: false,
      summary: createSummary({
        operationState: createOperationState("merge"),
        remoteBranches: [{ name: "origin/feature", remote: "origin", branch: "feature" }]
      })
    });

    expect([...sections["branches-local"], ...sections["branches-remote"]].every((item) => item.disabled && item.disabledReason === MERGE_REASON)).toBe(true);
    const actions = sections["branch-actions"];
    for (const label of ["New branch…", "Merge into main…", "Rebase main onto…", "Check out tag…", "Add worktree…", "Change upstream…, origin/main"]) {
      expect(find(actions, label)).toMatchObject({ disabled: true, disabledReason: MERGE_REASON });
    }
    expect(find(actions, "Manage branches…").disabled).toBeFalsy();
  });

  it("describes a detached HEAD and explains why the upstream and remote link are unavailable", () => {
    const sections = buildBranchSectionItems({
      repoPath,
      running: false,
      summary: createSummary({
        branch: null,
        upstream: null,
        branches: [],
        remoteBranches: [],
        remotes: [{ name: "origin", url: "D:\\Remotes\\githead.git", direction: "fetch" }]
      })
    });

    const actions = sections["branch-actions"];
    expect(labels(actions)).toContain("Merge into current branch…");
    expect(labels(actions)).toContain("Rebase current branch onto…");
    const upstream = find(actions, "Change upstream…, No upstream");
    expect(upstream.disabled).toBe(true);
    expect(upstream.disabledReason).toBe("Select a branch before changing its upstream");
    const open = find(sections.remotes, "Open remote repository");
    expect(open.disabled).toBe(true);
    expect(open.disabledReason).toBe("No hosted repository URL available");
  });

  it("lists Lore remotes as plain rows without git-only actions", () => {
    const sections = buildBranchSectionItems({
      repoPath,
      running: false,
      summary: createSummary({
        kind: "lore",
        capabilities: loreCapabilities(),
        upstream: null,
        remotes: [{ name: "central", url: "lore://central", direction: "fetch" }]
      })
    });

    expect(labels(sections["branch-actions"])).toEqual(["New branch…", "Manage branches…"]);
    expect(sections.remotes.map((item) => [item.kind, item.title])).toEqual([["remote", "central"]]);
  });

  it("disables branch content when the repository is invalid", () => {
    const sections = buildBranchSectionItems({ repoPath, running: false, summary: createSummary({ isValid: false }) });

    expect(find(sections["branch-actions"], "New branch…").disabledReason).toBe(REPOSITORY_UNAVAILABLE_REASON);
    expect(find(sections.remotes, "Open remote repository").disabledReason).toBe(REPOSITORY_UNAVAILABLE_REASON);
  });

  it("returns no branch content before the summary loads", () => {
    expect(buildBranchSectionItems({ repoPath, running: false, summary: null })).toEqual({
      "branches-local": [],
      "branches-remote": [],
      "branch-actions": [],
      remotes: []
    });
  });
});

describe("buildRepositoryActionItems", () => {
  const actions = [
    createAction("Typecheck", "npm run typecheck", "Check types"),
    createAction("Packaging > Package for Windows", "npm run package:win:dir")
  ];

  it("names each action by its group path and shows the command", () => {
    const items = buildRepositoryActionItems(createActionsConfig(actions), { isValid: true });

    expect(items.map((item) => [item.label, item.detail, item.meta, item.disabled ?? false])).toEqual([
      ["Typecheck", "npm run typecheck", "Run", false],
      ["Packaging › Package for Windows", "npm run package:win:dir", "Run", false]
    ]);
    expect(items[0]?.keywords).toContain("Check types");
    expect(items[1]?.payload).toEqual({ action: actions[1] });
  });

  it("disables actions on a configuration error and shows the error", () => {
    const items = buildRepositoryActionItems(createActionsConfig(actions, "actions.json is not valid JSON."), { isValid: true });

    expect(items[0]).toMatchObject({ kind: "notice", label: "actions.json is not valid JSON.", disabled: true });
    expect(items.slice(1).every((item) => item.disabled && item.disabledReason === "actions.json is not valid JSON.")).toBe(true);
  });

  it("disables actions in an invalid repository and reports an empty configuration", () => {
    expect(buildRepositoryActionItems(createActionsConfig(actions), { isValid: false }).every((item) => item.disabled)).toBe(true);
    expect(buildRepositoryActionItems(createActionsConfig(), { isValid: true }).map((item) => [item.kind, item.label])).toEqual([
      ["notice", "No configured actions"]
    ]);
  });
});

describe("buildGoToItems", () => {
  const goTo = (overrides: Partial<QuickSwitcherInput> = {}): QuickSwitcherItem[] => buildGoToItems(createInput(overrides));

  it("shows only Activity log and Settings without optional capabilities", () => {
    const summary = createSummary({ capabilities: { ...gitCapabilities(), analytics: false } });

    expect(labels(goTo({ summary, stashCount: 3 }).filter((item) => item.kind === "view" || item.kind === "settings"))).toEqual([
      "Stashes 3",
      "Activity log",
      "Settings"
    ]);
    expect(labels(goTo({ summary, stashCount: 0 }))).toEqual(["Activity log", "Settings"]);
    expect(labels(goTo({ summary: createSummary({ kind: "lore", capabilities: loreCapabilities() }), stashCount: 2 }))).toEqual(["Activity log", "Settings"]);
  });

  it("adds GitHub views with compact counts and analytics when supported", () => {
    const items = goTo({
      summary: createSummary({ githubRepository: { owner: "acme", name: "githead", fullName: "acme/githead", webUrl: "https://github.com/acme/githead" } }),
      stashCount: 2,
      pullRequestCount: "1.2k",
      issueCount: "8",
      activeView: "issues"
    });

    expect(labels(items)).toEqual([
      "Stashes 2",
      "Pull requests 1.2k open",
      "Issues 8",
      "Workflow runs",
      "Analytics",
      "Activity log",
      "Settings"
    ]);
    expect(find(items, "Pull requests 1.2k open")).toMatchObject({ title: "Pull requests", meta: "1.2k open" });
    expect(find(items, "Issues 8").current).toBe(true);
    expect(find(items, "Stashes 2").payload).toEqual({ view: "stashes" });
  });

  it("omits counts that are not loaded and analytics in an invalid repository", () => {
    const items = goTo({
      summary: createSummary({
        isValid: false,
        githubRepository: { owner: "acme", name: "githead", fullName: "acme/githead", webUrl: "https://github.com/acme/githead" }
      })
    });

    expect(labels(items)).toEqual(["Pull requests", "Issues", "Workflow runs", "Activity log", "Settings"]);
  });

  it("announces unread activity log output", () => {
    expect(labels(goTo({ activityAttention: "unread" }))).toContain("Activity log, unread output available");
    expect(labels(goTo({ activityAttention: "error" }))).toContain("Activity log, unread error details available");
  });

  it("never disables Settings", () => {
    for (const items of [goTo(), goTo({ summary: null, running: true }), goTo({ summary: createSummary({ isValid: false }) })]) {
      const settings = find(items, "Settings");
      expect(settings.disabled).toBeFalsy();
      expect(settings.kbd).toBe("Ctrl ,");
    }
  });
});

describe("buildCommandItems", () => {
  const github = { owner: "acme", name: "githead", fullName: "acme/githead", webUrl: "https://github.com/acme/githead" };

  it("lists the default commands", () => {
    const items = buildCommandItems(createInput({ canGoBack: true }));

    expect(labels(items)).toEqual([
      "Repository settings…",
      "Performance diagnostics…",
      "Go back",
      "Go forward",
      "Manage repository actions…",
      "Push to another branch…"
    ]);
    expect(find(items, "Go back")).toMatchObject({ kbd: "Alt ←", disabled: false });
    expect(find(items, "Go forward")).toMatchObject({ kbd: "Alt →", disabled: true });
    expect(find(items, "Repository settings…").payload).toEqual({ path: repoPath });
  });

  it("opens associated pull requests or offers to create one", () => {
    const pullRequest = {
      number: 42,
      title: "Add quick switcher",
      state: "OPEN",
      draft: false,
      url: "https://github.com/acme/githead/pull/42",
      baseRepositoryFullName: "acme/githead",
      headRepositoryFullName: "acme/githead",
      headBranch: "feature/switcher",
      headSha: "abc"
    };
    const summary = createSummary({ githubRepository: github, branch: "feature/switcher", commitsAheadOfDefaultBranch: 2 });

    expect(find(buildCommandItems(createInput({ summary, branchPullRequests: [pullRequest] })), "Open pull request #42 · Open").payload).toEqual({ pullRequest });
    expect(find(buildCommandItems(createInput({ summary, branchPullRequests: [{ ...pullRequest, draft: true }] })), "Open pull request #42 · Draft").detail).toBe("Add quick switcher");
    const create = find(buildCommandItems(createInput({ summary, running: true })), "Create pull request…");
    expect(create.disabled).toBe(true);
    expect(labels(buildCommandItems(createInput({ summary: createSummary({ githubRepository: github }) })))).not.toContain("Create pull request…");
  });

  it("shows the app update action only when one is available", () => {
    expect(labels(buildCommandItems(createInput({ appUpdate: createAppUpdate({ status: "idle" }) }))).some((label) => /update/i.test(label))).toBe(false);
    expect(find(buildCommandItems(createInput({ appUpdate: createAppUpdate({ status: "available", availableVersion: "2.0.0" }) })), "Update available")).toMatchObject({
      detail: "Version 2.0.0",
      disabled: false,
      payload: { action: "download" }
    });
    expect(find(buildCommandItems(createInput({ appUpdate: createAppUpdate({ status: "downloading", downloadPercent: 41.7 }) })), "Downloading 41%")).toMatchObject({ disabled: true });
    expect(find(buildCommandItems(createInput({ appUpdate: createAppUpdate({ status: "downloaded", downloadedVersion: "2.0.0" }) })), "Restart to update").payload).toEqual({ action: "install" });
    expect(find(
      buildCommandItems(createInput({ appUpdate: createAppUpdate({ status: "error", errorContext: "check", canRetry: true, message: "Network down" }) })),
      "Update check failed: Network down"
    ).payload).toEqual({ action: "check" });
  });

  it("explains why pushing to another branch is unavailable and hides it without the capability", () => {
    expect(find(buildCommandItems(createInput({ summary: createSummary({ branch: null }) })), "Push to another branch…").disabledReason).toBe("Switch to a branch before pushing.");
    expect(find(buildCommandItems(createInput({ summary: createSummary({ remotes: [] }) })), "Push to another branch…").disabledReason).toBe("Add a remote before pushing.");
    expect(labels(buildCommandItems(createInput({ summary: createSummary({ kind: "lore", capabilities: loreCapabilities() }) })))).not.toContain("Push to another branch…");
  });

  it("tells the user to finish or abort an unfinished merge before creating a pull request or pushing", () => {
    const summary = createSummary({
      githubRepository: github,
      branch: "feature/switcher",
      commitsAheadOfDefaultBranch: 2,
      operationState: createOperationState("merge")
    });

    for (const running of [false, true]) {
      const items = buildCommandItems(createInput({ summary, running }));
      expect(find(items, "Create pull request…")).toMatchObject({ disabled: true, disabledReason: MERGE_REASON });
      expect(find(items, "Push to another branch…")).toMatchObject({ disabled: true, disabledReason: MERGE_REASON });
    }
  });

  it("disables Manage repository actions in an invalid repository", () => {
    expect(find(buildCommandItems(createInput({ summary: createSummary({ isValid: false }) })), "Manage repository actions…").disabled).toBe(true);
  });
});

describe("buildQuickSwitcherSections", () => {
  it("orders the sections of the full switcher", () => {
    const sections = buildQuickSwitcherSections("all", createInput({
      summary: createSummary({ actionsConfig: createActionsConfig([createAction("Test", "npm test")]) })
    }));

    expect(sectionSummary(sections)).toEqual([
      ["repositories", "Repositories"],
      ["branches-local", "Branches"],
      ["branch-actions", "Branch actions"],
      ["remotes", "Remotes"],
      ["repository-actions", "Repository actions"],
      ["go-to", "Go to"],
      ["commands", "Commands"]
    ]);
    expect(sections.every((section) => section.items.every((item) => item.section === section.id))).toBe(true);
  });

  it("shows only branch content from the branch pill", () => {
    const sections = buildQuickSwitcherSections("branches", createInput({
      summary: createSummary({ remoteBranches: [{ name: "origin/feature", remote: "origin", branch: "feature" }] })
    }));

    expect(sectionSummary(sections)).toEqual([
      ["branches-local", "Local"],
      ["branches-remote", "Remote"],
      ["branch-actions", "Actions"],
      ["remotes", "Remotes"]
    ]);
  });

  it("shows only upstream options grouped by remote in upstream mode", () => {
    const sections = buildQuickSwitcherSections("upstream", createInput({
      summary: createSummary({
        remoteBranches: [
          { name: "origin/main", remote: "origin", branch: "main" },
          { name: "upstream/main", remote: "upstream", branch: "main" },
          { name: "origin/feature", remote: "origin", branch: "feature" }
        ]
      })
    }));

    expect(sections.map((section) => [section.key, section.label, labels(section.items)])).toEqual([
      ["upstream-remote:origin", "origin", ["origin/main, current", "origin/feature"]],
      ["upstream-remote:upstream", "upstream", ["upstream/main"]],
      ["upstream-tracking", "Tracking", ["No upstream, Stop tracking origin/main"]]
    ]);
    expect(sections[0]?.items[0]).toMatchObject({ selected: true, payload: { upstream: "origin/main" } });
    expect(sections[2]?.items[0]?.payload).toEqual({ upstream: null });
  });

  it("tells the user to finish or abort an unfinished rebase before changing the upstream", () => {
    const sections = buildQuickSwitcherSections("upstream", createInput({
      summary: createSummary({ branch: null, operationState: createOperationState("rebase") })
    }));

    const items = sections.flatMap((section) => section.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.disabled && item.disabledReason === "Finish or abort the active rebase first.")).toBe(true);
  });

  it("names a single Lore remote section 'Remote'", () => {
    const sections = buildQuickSwitcherSections("branches", createInput({
      summary: createSummary({ kind: "lore", capabilities: loreCapabilities(), remotes: [{ name: "central", url: "lore://central", direction: "fetch" }] })
    }));

    expect(sections.find((section) => section.id === "remotes")?.label).toBe("Remote");
  });
});

describe("filterQuickSwitcherItems", () => {
  const sections = buildQuickSwitcherSections("all", createInput({
    summary: createSummary({
      branches: [
        { name: "main", current: true, upstream: "origin/main" },
        { name: "feature/nav", current: false, upstream: null }
      ],
      actionsConfig: createActionsConfig([createAction("Packaging > Package for Windows", "npm run package:win:dir")])
    })
  }));

  it("keeps every section and item for an empty query", () => {
    expect(filterQuickSwitcherItems(sections, "   ")).toEqual(sections);
  });

  it("matches every token against the label, title and keywords, ignoring case", () => {
    const result = filterQuickSwitcherItems(sections, "FEATURE nav");

    expect(result.map((section) => [section.id, labels(section.items)])).toEqual([["branches-local", ["feature/nav, local only"]]]);
    expect(labels(filterQuickSwitcherItems(sections, "package win").flatMap((section) => section.items))).toEqual(["Packaging › Package for Windows"]);
    expect(labels(filterQuickSwitcherItems(sections, "theme").flatMap((section) => section.items))).toEqual(["Settings"]);
    expect(filterQuickSwitcherItems(sections, "no such thing")).toEqual([]);
  });

  it("keeps section order across matches", () => {
    const result = filterQuickSwitcherItems(sections, "re");

    const order = ["repositories", "branches-local", "branches-remote", "branch-actions", "remotes", "repository-actions", "go-to", "commands"];
    const ids = result.map((section) => section.id);
    expect(ids).toEqual([...ids].sort((left, right) => order.indexOf(left) - order.indexOf(right)));
    expect(ids).toContain("repositories");
    expect(ids).toContain("commands");
  });

  it("caps remote branch rows until the user types", () => {
    const remoteBranches = Array.from({ length: REMOTE_BRANCH_ROW_LIMIT + 25 }, (_, index) => ({
      name: `origin/topic-${index}`,
      remote: "origin",
      branch: `topic-${index}`
    }));
    const large = buildQuickSwitcherSections("branches", createInput({ summary: createSummary({ remoteBranches }) }));

    const remote = filterQuickSwitcherItems(large, "").find((section) => section.id === "branches-remote");
    expect(remote?.items).toHaveLength(REMOTE_BRANCH_ROW_LIMIT);
    expect(remote?.omittedCount).toBe(25);
    expect(remote?.items.at(-1)?.title).toBe(`topic-${REMOTE_BRANCH_ROW_LIMIT - 1}`);

    const typed = filterQuickSwitcherItems(large, "topic-12").find((section) => section.id === "branches-remote");
    expect(labels(typed?.items ?? [])).toEqual(["topic-12, origin", "topic-120, origin", "topic-121, origin", "topic-122, origin", "topic-123, origin", "topic-124, origin"]);
    expect(typed?.omittedCount).toBeUndefined();
  });
});
