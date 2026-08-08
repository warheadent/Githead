import { act, cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vite-plus/test";
import type { Mock } from "vite-plus/test";

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className, orientation }: { children: ReactNode; className?: string; orientation?: string }) => (
    <div className={className} data-resizable-panel-group data-orientation={orientation}>{children}</div>
  ),
  ResizablePanel: ({ children, className, defaultSize, minSize }: { children: ReactNode; className?: string; defaultSize?: string; minSize?: string }) => (
    <div className={className} data-resizable-panel data-default-size={defaultSize} data-min-size={minSize}>{children}</div>
  ),
  ResizableHandle: ({ "aria-label": ariaLabel, withHandle }: { "aria-label"?: string; withHandle?: boolean }) => (
    <div role="separator" aria-label={ariaLabel} data-testid="resizable-handle" data-with-handle={withHandle || undefined} />
  )
}));

import { gitHubQueryStore } from "./useGitHubQueries";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import type {
  AiReasoningCapabilities,
  AiSettings,
  AppSettings,
  AppUpdateState,
  AppWindowState,
  GitCommitDetails,
  GitCommitGraphRow,
  GitFileDiff,
  GitHubIssue,
  GitHubOpenCounts,
  GitHubPullRequest,
  GitHubWorkflowRun,
  GitIdentitySettings,
  GitRunResult,
  GitheadApi,
  GitOperationResult,
  GitPullRecovery,
  GitRepositoryOperationKind,
  GitRepositoryOperationState,
  RepoChangedEvent,
  RepoSyncStatus,
  RepoSummary
} from "../shared/types";
import { gitCapabilities, type AiCommitMessageProvider, type RepositoryRecent } from "../shared/types";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export const repoPath = "D:\\Githead";

export function repositoryRecents(...repoPaths: string[]): RepositoryRecent[] {
  return repoPaths.map((recentPath) => ({ anchorPath: recentPath, lastUsedPath: recentPath }));
}

export let githead: GitheadApi;
export let cleanupGitOutput: Mock<() => void>;
export let cleanupUpdateState: Mock<() => void>;
export let cleanupRepoChanged: Mock<() => void>;
let cleanupWindowState: Mock<() => void>;
export let gitOutputCallback: Parameters<GitheadApi["onGitOutput"]>[0] | null;
export let updateStateCallback: Parameters<GitheadApi["onUpdateState"]>[0] | null;
export let repoChangedCallback: Parameters<GitheadApi["onRepoChanged"]>[0] | null;
export let windowStateCallback: Parameters<GitheadApi["onWindowState"]>[0] | null;
export let scrollIntoView: Mock<(options?: ScrollIntoViewOptions) => void>;
const nativeScrollIntoView = HTMLElement.prototype.scrollIntoView;

export const defaultProviderModels: Record<AiCommitMessageProvider, string> = {
  openrouter: "openai/gpt-5.6-luna",
  openai: "gpt-5.4-nano",
  "codex-cli": "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5-20251001",
  "claude-code": "haiku"
};

export function createAiSettings(
  selectedProvider: AiCommitMessageProvider = "openrouter",
  patch: Partial<AiSettings> = {}
): AiSettings {
  return {
    selectedProvider,
    providers: {
      openrouter: {
        model: defaultProviderModels.openrouter,
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      openai: {
        model: defaultProviderModels.openai,
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      "codex-cli": {
        model: defaultProviderModels["codex-cli"],
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: false
      },
      anthropic: {
        model: defaultProviderModels.anthropic,
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      },
      "claude-code": {
        model: defaultProviderModels["claude-code"],
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: false
      }
    },
    cliStatus: {
      "codex-cli": {
        detected: true,
        authenticated: true,
        message: "Codex CLI is authenticated."
      },
      "claude-code": {
        detected: false,
        authenticated: false,
        message: "Claude Code was not detected."
      }
    },
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
    prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT,
    sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE },
    ...patch
  };
}

beforeEach(() => {
  gitHubQueryStore.clear();
  cleanupGitOutput = vi.fn<() => void>();
  cleanupUpdateState = vi.fn<() => void>();
  cleanupRepoChanged = vi.fn<() => void>();
  cleanupWindowState = vi.fn<() => void>();
  gitOutputCallback = null;
  updateStateCallback = null;
  repoChangedCallback = null;
  windowStateCallback = null;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  githead = createGitheadMock();
  window.githead = githead;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (nativeScrollIntoView) {
    HTMLElement.prototype.scrollIntoView = nativeScrollIntoView;
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});


export function createGitheadMock(): GitheadApi {
  const okOperation: GitOperationResult = {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: ""
  };
  const aiSettings = createAiSettings("openai", {
    providers: {
      ...createAiSettings().providers,
      openai: {
        model: "openai/gpt-5-mini",
        prDescriptionModel: "",
        reasoningEffort: "low",
        commitPlanReasoningEffort: "low",
        prDescriptionReasoningEffort: "low",
        hasApiKey: true
      }
    }
  });
  const appSettings: AppSettings = {
    autoFetchIntervalMinutes: 10,
    colorTheme: "githead",
    appearanceMode: "system",
    uiFont: "inter",
    codeFont: "system-mono",
    zoomFactor: 1,
    statusFileViewMode: "list",
    wrapDiffLines: false,
    gitBehaviors: { tagPushBehavior: "all" }
  };
  const gitIdentity: GitIdentitySettings = {
    scope: "repository",
    repositoryOverrideEnabled: false,
    name: "",
    email: "",
    repository: {
      name: "",
      email: ""
    },
    global: {
      name: "",
      email: ""
    }
  };
  const progressiveSummaries = new Map<string, { promise: Promise<RepoSummary>; uses: number }>();
  const progressiveSummary = (request: { repoPath: string; generation: number }): Promise<RepoSummary> => {
    const key = `${request.repoPath.toLocaleLowerCase()}\0${request.generation}`;
    let entry = progressiveSummaries.get(key);
    if (!entry) {
      entry = { promise: Promise.resolve().then(() => githead.getRepoSummary(request.repoPath)), uses: 0 };
      progressiveSummaries.set(key, entry);
    }
    entry.uses += 1;
    if (entry.uses >= 3) progressiveSummaries.delete(key);
    return entry.promise;
  };

  return {
    chooseRepo: vi.fn().mockResolvedValue(null),
    chooseCloneParent: vi.fn().mockResolvedValue(null),
    chooseWorktreeParent: vi.fn().mockResolvedValue(null),
    getRepoSummary: vi.fn().mockResolvedValue(createSummary()),
    getRepoIdentity: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, kind: summary.kind, capabilities: summary.capabilities, isValid: summary.isValid, branch: summary.branch, hasHead: summary.hasHead, safeDirectory: summary.safeDirectory, validationErrors: summary.validationErrors };
    }),
    getRepoStatus: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, ahead: summary.ahead, behind: summary.behind, files: summary.files, operationState: summary.operationState, ...(summary.submodules ? { submodules: summary.submodules } : {}) };
    }),
    getRepoMetadata: vi.fn(async (request) => {
      const summary = await progressiveSummary(request);
      return { repoPath: summary.repoPath, generation: request.generation, upstream: summary.upstream, branches: summary.branches, remotes: summary.remotes, remoteBranches: summary.remoteBranches, defaultRemoteBranch: summary.defaultRemoteBranch, commitsAheadOfDefaultBranch: summary.commitsAheadOfDefaultBranch, githubRepository: summary.githubRepository, actionsConfig: summary.actionsConfig };
    }),
    getRepositoryOperationState: vi.fn().mockResolvedValue(null),
    resolveRepositoryOperation: vi.fn(),
    getIntegrationPreview: vi.fn().mockResolvedValue({ outcome: "failed", preview: null, message: "Not configured in this test." }),
    runIntegration: vi.fn(),
    pushWithForceLease: vi.fn(),
    getConflictResolution: vi.fn().mockResolvedValue({
      outcome: "failed",
      path: "",
      state: null,
      baseText: null,
      currentText: null,
      incomingText: null,
      workingText: null,
      workingHash: null,
      message: "No conflict selected."
    }),
    saveConflictResolution: vi.fn().mockResolvedValue({
      ...okOperation,
      outcome: "failed",
      state: null
    }),
    cancelRepositoryRead: vi.fn().mockResolvedValue(undefined),
    getGitOperationStates: vi.fn().mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId: string) => ({ operationId, state: "running" }))
    )),
    cancelGitOperation: vi.fn().mockResolvedValue({ accepted: true, state: "cancelling" }),
    watchRepoChanges: vi.fn().mockResolvedValue(undefined),
    unwatchRepoChanges: vi.fn().mockResolvedValue(undefined),
    getRepoRecents: vi.fn().mockResolvedValue(repositoryRecents(repoPath)),
    getRepoSyncStatuses: vi.fn().mockImplementation(async (repoPaths: string[]) => repoPaths.map((nextRepoPath) => createRepoSyncStatus({
      repoPath: nextRepoPath
    }))),
    addRepoRecent: vi.fn().mockImplementation(async (request) => repositoryRecents(request.repoPath)),
    removeRepoRecent: vi.fn().mockResolvedValue([]),
    reorderRepoRecents: vi.fn().mockImplementation(async (repoPaths: string[]) => repositoryRecents(...repoPaths)),
    getRepositoryGroups: vi.fn().mockResolvedValue([]),
    getRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addRepoTrust: vi.fn().mockResolvedValue({
      trusted: true
    }),
    addSafeDirectory: vi.fn().mockResolvedValue(okOperation),
    getGitHubWorkflowRuns: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: 0 }, rateLimit: null }),
    getGitHubViewer: vi.fn().mockResolvedValue({ ok: true, data: { login: "viewer", authenticated: true }, rateLimit: null }),
    getGitHubOpenCounts: vi.fn().mockResolvedValue({ ok: true, data: createOpenCounts(), rateLimit: null }),
    getGitHubIssues: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: null }, rateLimit: null }),
    getGitHubPullRequests: vi.fn().mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: null }, rateLimit: null }),
    createGitHubPullRequest: vi.fn().mockResolvedValue({ ok: true, data: {
      number: 12,
      url: "https://github.com/warheadent/Githead/pull/12",
      title: "Update feature",
      draft: false
    }, rateLimit: null }),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getGitHubHistoryInsights: vi.fn().mockResolvedValue({ ok: true, data: { currentBranchPullRequests: [], commits: [], unavailableCommitShas: [] }, rateLimit: null }),
    getCommitDetails: vi.fn(),
    getCommitFileDiff: vi.fn(),
    getFileHistory: vi.fn().mockResolvedValue({ repoPath, startHash: "a".repeat(40), requestedPath: "", entries: [], hasMore: false }),
    getFileBlame: vi.fn(),
    getFileDiff: vi.fn(),
    getStashes: vi.fn().mockResolvedValue([]),
    getStashDetails: vi.fn(),
    getStashFileDiff: vi.fn(),
    getFilePreview: vi.fn(),
    fetchLfsImageVersions: vi.fn(),
    resetFilesToCommit: vi.fn().mockResolvedValue(okOperation),
    openCommitFileVersion: vi.fn().mockResolvedValue(okOperation),
    stageFiles: vi.fn().mockResolvedValue(okOperation),
    unstageFiles: vi.fn().mockResolvedValue(okOperation),
    stageHunk: vi.fn().mockResolvedValue(okOperation),
    unstageHunk: vi.fn().mockResolvedValue(okOperation),
    commitChanges: vi.fn().mockResolvedValue(okOperation),
    quickCommitFiles: vi.fn().mockResolvedValue(okOperation),
    createStash: vi.fn().mockResolvedValue(okOperation),
    applyStash: vi.fn().mockResolvedValue(okOperation),
    popStash: vi.fn().mockResolvedValue(okOperation),
    dropStash: vi.fn().mockResolvedValue(okOperation),
    createBranchFromStash: vi.fn().mockResolvedValue(okOperation),
    copyCommitShaToClipboard: vi.fn().mockResolvedValue(okOperation),
    resetBranchToCommit: vi.fn().mockResolvedValue(okOperation),
    revertCommit: vi.fn().mockResolvedValue(okOperation),
    createTag: vi.fn().mockResolvedValue(okOperation),
    deleteTag: vi.fn().mockResolvedValue(okOperation),
    switchBranch: vi.fn().mockResolvedValue(okOperation),
    checkoutRemoteBranch: vi.fn().mockResolvedValue(okOperation),
    checkoutGitHubPullRequest: vi.fn().mockResolvedValue(okOperation),
    createBranch: vi.fn().mockResolvedValue(okOperation),
    renameBranch: vi.fn().mockResolvedValue(okOperation),
    deleteBranch: vi.fn().mockResolvedValue(okOperation),
    createWorktree: vi.fn().mockResolvedValue(okOperation),
    checkWorktreeRemoval: vi.fn().mockResolvedValue({ repoPath, worktreePath: "", canRemove: true, isClean: true, reason: "" }),
    removeWorktree: vi.fn().mockResolvedValue(okOperation),
    setBranchUpstream: vi.fn().mockResolvedValue(okOperation),
    publishBranch: vi.fn().mockResolvedValue(createRunResult("publish")),
    getPullRecovery: vi.fn().mockResolvedValue(null),
    resolvePullRecovery: vi.fn().mockResolvedValue({
      ...okOperation,
      outcome: "complete",
      recovery: null,
      recoveryRef: "refs/githead/recovery/main"
    }),
    getRemoteConfigs: vi.fn().mockResolvedValue([]),
    addRemote: vi.fn().mockResolvedValue(okOperation),
    renameRemote: vi.fn().mockResolvedValue(okOperation),
    setRemoteUrl: vi.fn().mockResolvedValue(okOperation),
    removeRemote: vi.fn().mockResolvedValue(okOperation),
    getGitIdentity: vi.fn().mockResolvedValue(gitIdentity),
    saveGitIdentity: vi.fn().mockResolvedValue({
      ...gitIdentity,
      name: "Taylor",
      email: "taylor@example.test",
      repository: {
        name: "Taylor",
        email: "taylor@example.test"
      }
    }),
    getAiSettings: vi.fn().mockResolvedValue(aiSettings),
    saveAiSettings: vi.fn().mockResolvedValue(aiSettings),
    getRepositoryAiSettings: vi.fn().mockResolvedValue({ repoPath, enabled: false, settings: aiSettings }),
    saveRepositoryAiSettings: vi.fn().mockImplementation(async (request) => ({ repoPath: request.repoPath, enabled: request.enabled, settings: aiSettings })),
    getRepositorySyncSettings: vi.fn().mockImplementation(async ({ repoPath: requestedRepoPath }) => ({
      repoPath: requestedRepoPath,
      enabled: false,
      autoFetchIntervalMinutes: 10
    })),
    saveRepositorySyncSettings: vi.fn().mockImplementation(async (request) => ({ ...request })),
    getAiReasoningCapabilities: vi.fn().mockResolvedValue({
      status: "supported",
      supportedEfforts: ["low", "medium", "high"]
    }),
    cancelGitHubRequest: vi.fn().mockResolvedValue(undefined),
    getAppSettings: vi.fn().mockResolvedValue(appSettings),
    saveAppSettings: vi.fn().mockImplementation(async (request) => ({
      ...appSettings,
      ...request,
      statusFileViewMode: request.statusFileViewMode ?? appSettings.statusFileViewMode,
      wrapDiffLines: request.wrapDiffLines ?? appSettings.wrapDiffLines
    })),
    setWindowZoomFactor: vi.fn().mockResolvedValue(undefined),
    generateCommitMessage: vi.fn().mockResolvedValue(okOperation),
    generateCommitPlan: vi.fn().mockResolvedValue({
      repoPath,
      exitCode: 0,
      plan: { groups: [], unassignedPaths: [] },
      stderr: ""
    }),
    generatePrTitle: vi.fn().mockResolvedValue(okOperation),
    generatePrDescription: vi.fn().mockResolvedValue(okOperation),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(okOperation),
    showInExplorer: vi.fn().mockResolvedValue(okOperation),
    showRepositoryInExplorer: vi.fn().mockResolvedValue(okOperation),
    copyPathToClipboard: vi.fn().mockResolvedValue(okOperation),
    copyTextToClipboard: vi.fn().mockResolvedValue(okOperation),
    deleteFile: vi.fn().mockResolvedValue(okOperation),
    deleteFiles: vi.fn().mockResolvedValue(okOperation),
    revertFileChanges: vi.fn().mockResolvedValue(okOperation),
    addPathToIgnore: vi.fn().mockResolvedValue(okOperation),
    cloneRepository: vi.fn().mockResolvedValue(okOperation),
    updateSubmodules: vi.fn().mockResolvedValue(okOperation),
    syncSubmodules: vi.fn().mockResolvedValue(okOperation),
    checkRepositoryAccess: vi.fn().mockResolvedValue({
      source: "",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [],
      defaultBranch: null
    }),
    runGitAction: vi.fn().mockResolvedValue(createRunResult("fetch")),
    runConfiguredAction: vi.fn(),
    saveConfiguredActions: vi.fn().mockResolvedValue(okOperation),
    getUpdateState: vi.fn().mockResolvedValue(createUpdateState()),
    checkForUpdates: vi.fn().mockResolvedValue({
      checked: true,
      state: createUpdateState({
        status: "up-to-date",
        checkedAt: "2026-05-31T10:00:00Z"
      })
    }),
    downloadUpdate: vi.fn().mockResolvedValue({
      accepted: true,
      completed: false,
      state: createUpdateState({
        status: "downloading",
        availableVersion: "0.1.1",
        downloadPercent: 0
      })
    }),
    installUpdate: vi.fn().mockResolvedValue({
      accepted: true,
      completed: false,
      state: createUpdateState({
        status: "downloaded",
        availableVersion: "0.1.1",
        downloadedVersion: "0.1.1",
        downloadPercent: 100
      })
    }),
    startPerformanceDiagnostics: vi.fn().mockResolvedValue({
      samples: [],
      processMetrics: [],
      processMetricsStatus: "unavailable",
      processMetricLimit: 64,
      droppedProcessMetricCount: 0,
      retainedSampleLimit: 512,
      droppedSampleCount: 0
    }),
    getPerformanceDiagnosticsSnapshot: vi.fn().mockResolvedValue({
      samples: [],
      processMetrics: [],
      processMetricsStatus: "unavailable",
      processMetricLimit: 64,
      droppedProcessMetricCount: 0,
      retainedSampleLimit: 512,
      droppedSampleCount: 0
    }),
    stopPerformanceDiagnostics: vi.fn().mockResolvedValue(undefined),
    recordPerformanceRefresh: vi.fn(),
    minimizeWindow: vi.fn().mockResolvedValue(createWindowState()),
    toggleMaximizeWindow: vi.fn().mockResolvedValue(createWindowState({
      isMaximized: true
    })),
    closeWindow: vi.fn().mockResolvedValue(undefined),
    getWindowState: vi.fn().mockResolvedValue(createWindowState()),
    onGitOutput: vi.fn((callback) => {
      gitOutputCallback = callback;
      return cleanupGitOutput;
    }),
    onRepoChanged: vi.fn((callback) => {
      repoChangedCallback = callback;
      return cleanupRepoChanged;
    }),
    onUpdateState: vi.fn((callback) => {
      updateStateCallback = callback;
      return cleanupUpdateState;
    }),
    onWindowState: vi.fn((callback) => {
      windowStateCallback = callback;
      return cleanupWindowState;
    })
  };
}

export function createWindowState(overrides: Partial<AppWindowState> = {}): AppWindowState {
  return {
    isMaximized: false,
    ...overrides
  };
}

export function createUpdateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    enabled: true,
    status: "idle",
    currentVersion: "0.1.0",
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

export function createSummary(
  overrides: Omit<Partial<RepoSummary>, "actionsConfig"> & {
    actionsConfig?: PartialActionsConfig;
  } = {}
): RepoSummary {
  const actionsConfig = createActionsConfig(overrides.actionsConfig);

  return {
    repoPath,
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
    remotes: [
      {
        name: "origin",
        url: "https://example.test/repo.git",
        direction: "fetch"
      }
    ],
    remoteBranches: [
      {
        name: "origin/main",
        remote: "origin",
        branch: "main"
      }
    ],
    defaultRemoteBranch: {
      name: "origin/main",
      remote: "origin",
      branch: "main"
    },
    commitsAheadOfDefaultBranch: 0,
    githubRepository: null,
    ahead: null,
    behind: null,
    files: [],
    operationState: null,
    safeDirectory: null,
    validationErrors: [],
    ...overrides,
    actionsConfig
  };
}

export function createSafeDirectorySummary(repoPath: string): RepoSummary {
  return createSummary({
    repoPath,
    isValid: false,
    branch: null,
    upstream: null,
    branches: [],
    hasHead: false,
    remotes: [],
    remoteBranches: [],
    githubRepository: null,
    ahead: null,
    behind: null,
    files: [],
    safeDirectory: {
      required: true,
      path: repoPath.replace(/\\/g, "/"),
      message: "Git blocked this repository because its ownership differs from your current user."
    },
    validationErrors: [
      "Git blocked this repository because its ownership differs from your current user."
    ]
  });
}

export function createRepoSyncStatus(overrides: Partial<RepoSyncStatus> = {}): RepoSyncStatus {
  return {
    repoPath,
    kind: "git",
    isValid: true,
    ahead: 0,
    behind: 0,
    error: "",
    ...overrides
  };
}

export function createActionsConfig(
  overrides: PartialActionsConfig = {}
): RepoSummary["actionsConfig"] {
  const shared = {
    target: "shared" as const,
    fileName: "actions.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: "",
    ...overrides.shared
  };
  const local = {
    target: "local" as const,
    fileName: "actions.local.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: "",
    ...overrides.local
  };

  return {
    hasGitheadDir: false,
    actions: [],
    error: "",
    ...overrides,
    shared,
    local
  };
}

type PartialActionsConfig = Omit<Partial<RepoSummary["actionsConfig"]>, "shared" | "local"> & {
  shared?: Partial<RepoSummary["actionsConfig"]["shared"]>;
  local?: Partial<RepoSummary["actionsConfig"]["local"]>;
};

export function createGitHubSummary(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return createSummary({
    remotes: [
      {
        name: "origin",
        url: "git@github.com:openai/githead.git",
        direction: "fetch"
      }
    ],
    githubRepository: {
      owner: "openai",
      name: "githead",
      fullName: "openai/githead",
      webUrl: "https://github.com/openai/githead"
    },
    ...overrides
  });
}

export function createStatusFile(path: string, overrides: Partial<RepoSummary["files"][number]> = {}): RepoSummary["files"][number] {
  return {
    path,
    indexStatus: ".",
    worktreeStatus: ".",
    isStaged: false,
    isUnstaged: false,
    isConflicted: false,
    ...overrides
  };
}

export function createWorkflowRun(overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    id: "run-1",
    name: "CI",
    runNumber: 1,
    status: "completed",
    conclusion: "success",
    branch: "main",
    event: "push",
    commitSha: "abcdef1234567890",
    commitMessage: "fix: default workflow run",
    url: "https://github.com/openai/githead/actions/runs/1",
    startedAt: "2026-05-30T10:00:00Z",
    updatedAt: "2026-05-30T10:05:00Z",
    ...overrides
  };
}

export function createIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Default issue",
    state: "open",
    authorLogin: "taylor",
    labels: [],
    comments: 0,
    updatedAt: "2026-05-30T10:05:00Z",
    url: "https://github.com/openai/githead/issues/1",
    ...overrides
  };
}

export function createOpenCounts(overrides: Partial<GitHubOpenCounts> = {}): GitHubOpenCounts {
  return {
    issues: 0,
    pullRequests: 0,
    ...overrides
  };
}

export function createPullRequest(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 1,
    title: "Default pull request",
    state: "open",
    authorLogin: "taylor",
    sourceBranch: "feature/default",
    sourceRepositoryFullName: "openai/githead",
    targetBranch: "main",
    labels: [],
    comments: 0,
    draft: false,
    updatedAt: "2026-05-30T10:05:00Z",
    url: "https://github.com/openai/githead/pull/1",
    ...overrides
  };
}

export function createCommit(overrides: Partial<GitCommitGraphRow> = {}): GitCommitGraphRow {
  return {
    hash: "f".repeat(40),
    shortHash: "fffffff",
    parents: [],
    refs: [],
    subject: "fix: default test commit",
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    relativeDate: "2 hours ago",
    ...overrides
  };
}

export function createCommitDetails(hash: string, overrides: Partial<GitCommitDetails> = {}): GitCommitDetails {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    refs: [],
    subject: "feat(ai): add attack pressure cooldown",
    body: "",
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    committerName: "Taylor Bombay",
    committerEmail: "taylor@example.test",
    committerDate: "2026-05-26T21:42:20-07:00",
    parents: [],
    files: [],
    ...overrides
  };
}

export function createOperationResult(overrides: Partial<GitOperationResult> = {}): GitOperationResult {
  return {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: "",
    ...overrides
  };
}

export function createRunResult(action: string, overrides: Partial<GitRunResult> = {}): GitRunResult {
  return {
    runId: `run-${action}`,
    action,
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: "",
    startedAt: "2026-05-31T10:00:00.000Z",
    endedAt: "2026-05-31T10:00:01.000Z",
    ...overrides
  };
}

export function createPullRecovery(overrides: Partial<GitPullRecovery> = {}): GitPullRecovery {
  return {
    branchName: "feature/recovery",
    upstreamName: "origin/feature/recovery",
    oldUpstreamOid: "1".repeat(40),
    newUpstreamOid: "3".repeat(40),
    originalHeadOid: "2".repeat(40),
    localCommitCount: 2,
    hasWorkingChanges: false,
    canReapply: true,
    phase: "ready",
    ...overrides
  };
}

export function createRepositoryOperationState(
  kind: GitRepositoryOperationKind = "merge",
  overrides: Partial<GitRepositoryOperationState> = {}
): GitRepositoryOperationState {
  const hasConflicts = overrides.hasConflicts ?? true;
  const skipSupported = kind !== "merge";
  return {
    stateId: `${kind}-${hasConflicts ? "conflicts" : "ready"}`,
    kind,
    phase: hasConflicts ? "conflicts" : "ready-to-continue",
    backend: kind === "rebase" ? "merge" : null,
    hasConflicts,
    conflictedPaths: hasConflicts ? ["conflict.txt"] : [],
    sequence: kind === "rebase" ? { current: 1, total: 2 } : null,
    originalBranch: "feature/recovery",
    currentBranch: kind === "rebase" ? null : "main",
    actions: {
      continue: {
        supported: true,
        enabled: !hasConflicts,
        disabledReason: hasConflicts ? "Resolve and stage all conflicted files before continuing." : null,
        requiresConfirmation: false
      },
      skip: {
        supported: skipSupported,
        enabled: skipSupported,
        disabledReason: skipSupported ? null : "Git does not support skipping a merge.",
        requiresConfirmation: skipSupported
      },
      abort: {
        supported: true,
        enabled: true,
        disabledReason: null,
        requiresConfirmation: hasConflicts
      }
    },
    summary: hasConflicts
      ? `A ${kind} is paused because one file still has unresolved conflicts.`
      : `A ${kind} is ready to continue.`,
    ...overrides
  };
}

export function createTextDiff(path: string, value: string, side: GitFileDiff["side"] = "unstaged"): GitFileDiff {
  return {
    path,
    side,
    kind: "text",
    text: [
      `diff --git a/${path} b/${path}`,
      "@@ -1 +1 @@",
      `+${value}`
    ].join("\n")
  };
}

export function getStatusTone(row: HTMLElement): string | null {
  return row.querySelector(".status-chip")?.getAttribute("data-status-tone") ?? null;
}

export async function waitForRepositoryWorkspace(): Promise<void> {
  await screen.findByRole("complementary");
}

export async function flushRendererAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

export function emitRepoChanged(overrides: Partial<RepoChangedEvent> = {}): void {
  if (!repoChangedCallback) {
    throw new Error("Repository change listener was not registered.");
  }

  repoChangedCallback({
    repoPath,
    changedAt: "2026-05-31T10:00:00.000Z",
    reason: "filesystem",
    ...overrides
  });
}

export function defer<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined;
  let reject: Deferred<T>["reject"] | undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  if (!resolve || !reject) {
    throw new Error("Unable to create deferred promise.");
  }

  return {
    promise,
    resolve,
    reject
  };
}

export type {
  AiReasoningCapabilities,
  AiSettings,
  AppSettings,
  GitCommitGraphRow,
  GitFileDiff,
  GitIdentitySettings,
  GitheadApi,
  GitOperationResult,
  GitPullRecovery,
  GitRunResult,
  RepoSummary,
  RepositoryRecent
};
