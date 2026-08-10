import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FolderOpen,
  Folder,
  GitFork,
  GitCommitHorizontal,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  GripVertical,
  History,
  ListTree,
  List,
  Loader2,
  MapPinned,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SearchX,
  Settings,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  WrapText,
  Workflow,
  X
} from "lucide-react";
import {
  Fragment,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import { LoadingState } from "./LoadingState";
import {
  createOperationButtonFeedbackEvent,
  OperationButtonFeedback,
  type OperationButtonFeedbackSurface,
  type OperationButtonFeedbackEvent
} from "./OperationButtonFeedback";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "motion/react";
import { TagDialog, type TagDialogState } from "./TagDialog";
import { MotionPresence, MotionSwap } from "./motion";
import {
  RepositoryActionsDialog,
  type RepositoryActionDraft,
  type RepositoryActionManagerDraft
} from "./RepositoryActionsDialog";
import { SettingsDialog as RedesignedSettingsDialog, type SettingsCategory, type SettingsDraft as SettingsDialogDraft } from "./SettingsDialog";
import { publishTelemetryPreference } from "./telemetryPreference";
import { RepositorySettingsDialog } from "./RepositorySettingsDialog";
import { ReferencePicker, type ReferencePickerOption } from "./ReferencePicker";
import { GitIdentityFields } from "./GitIdentityFields";
import { getAiProviderLabel, isApiKeyProvider, isCliProvider } from "./aiProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTarget,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import { GITHUB_APP_INSTALL_URL } from "../shared/githubApp";
import type {
  AiCommitMessageProvider,
  AiReasoningEffort,
  AiSettings,
  AppAppearanceMode,
  AppCodeFont,
  AppSettings,
  AppUiFont,
  AppUpdateState,
  CommitHistoryScope,
  GenerateCommitPlanResult,
  GitBranch,
  GitAction,
  GitAmendEntryPoint,
  GitAmendExecuteRequest,
  GitAmendRestoreRequest,
  GitAmendRestoreResult,
  GitAmendResult,
  GitConfiguredActionFile,
  GitConfiguredAction,
  GitConfiguredActionFileConfig,
  GitConflictResolutionSaveRequest,
  GitCommitChangedFile,
  GitCommitAndPushResult,
  GitCommitWithRemoteCheckResult,
  GitCommitDetails,
  GitCommitGraphRow,
  GitDiffSide,
  GitFileDiff,
  GitFileHistoryEntry,
  GitFileBlameResult,
  GitFilePreviewSource,
  GitForceWithLeaseOffer,
  GitImageSide,
  GitHubIssue,
  GitHubIssueQuery,
  GitHubConnectionStatus,
  GitHubDeviceFlow,
  GitHubFailure,
  GitHubCommitAssociation,
  GitHubPullRequestAssociation,
  GitHubRepository,
  GitHubPullRequest,
  GitHubPullRequestQuery,
  GitHubWorkflowRun,
  GitHubWorkflowRunQuery,
  AppWindowState,
  GitIdentityScope,
  GitIdentitySettings,
  GitIntegrationExecuteRequest,
  GitIntegrationResult,
  GitOperationResult,
  GitQuickCommitChange,
  GitRepositoryOperationAction,
  GitRepositoryOperationActionResult,
  GitPullRecovery,
  GitPullRecoveryAction,
  GitPullRecoveryResult,
  GitWorktree,
  GitWorktreeCreateDraft,
  GitWorktreeCreateRequest,
  GitWorktreeRemovalCheck,
  GitOutputEvent,
  GitRemoteConfig,
  GitRemoteBranch,
  GitResetMode,
  GitRepositoryAccessCheckResult,
  GitPushTarget,
  GitRunResult,
  GitSafeDirectoryInfo,
  GitStatusFile,
  GitStashSelection,
  GitUndoCommitRequest,
  RepoSyncStatus,
  RepositorySyncSettings,
  RepoIdentitySection,
  RepoTrustResult,
  RepoSummary,
  RepositoryGroup,
  StatusFileViewMode
} from "../shared/types";
import { AI_COMMIT_MESSAGE_PROVIDERS, DEFAULT_COMMIT_PLAN_GRANULARITY, DEFAULT_REMOTE_CHECK_LEASE_SECONDS, DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS, DEFAULT_TAG_PUSH_BEHAVIOR, GIT_CONFIGURED_ACTION_SHELLS, gitCapabilities } from "../shared/types";
import { isMarkdownPath } from "../shared/filePreview";
import { parseCommitSubject } from "../shared/commitSubject";
import { parseGitHubReferences } from "../shared/githubReference";
import { getRepositoryWebUrl } from "../shared/remoteWebUrl";
import { ActivityLogPanel } from "./ActivityLogPanel";
import { CommitPlanView } from "./CommitPlanView";
import { BranchManagementDialog } from "./BranchManagementDialog";
import { GitIntegrationDialog } from "./GitIntegrationDialog";
import { AmendDialog } from "./AmendDialog";
import { WorktreeCreateDialog, WorktreeRemoveDialog } from "./WorktreeDialogs";
import { PullRecoveryDialog } from "./PullRecoveryDialog";
import { GitOperationRecoveryBanner } from "./GitOperationRecoveryBanner";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
import { emptyPushToBranchDialog, type PushToBranchDialogState } from "./pushToBranchState";
import { gitHubQueryStore, useGitHubQueries } from "./useGitHubQueries";
import { GitHubQueryToolbar } from "./GitHubQueryToolbar";
import { CreateIssueDialog, type CreateIssueDraft } from "./CreateIssueDialog";
import { WorkflowRunConsole } from "./WorkflowRunConsole";
import { DEFAULT_ISSUE_QUERY, DEFAULT_PULL_REQUEST_QUERY, DEFAULT_WORKFLOW_QUERY, filterLoadedWorkflowRuns, sortLoadedWorkflowRuns } from "./githubViewQuery";
import { useGitHubHistoryInsights } from "./useGitHubHistoryInsights";
import {
  AdjustableColumnHeader,
  ColumnVisibilityMenu,
  OrderedCells,
  usePersistentColumnLayout,
  type ColumnDefinition
} from "./columnLayout";
import { RepositorySnapshotCache, getRepoPathKey } from "./repositorySnapshotCache";
import {
  RepositoryRefreshCoordinator,
  RepositoryRefreshDisposedError,
  type RepositoryRefreshRequest
} from "./repositoryRefreshCoordinator";
import { createCommitAssociationMap } from "./githubHistorySelectors";
import { ActivityLogStore } from "./activityLogStore";
import {
  PersistentWorkspaceTabsContent,
  WorkspacePanelStateProvider,
  WorkspacePanelStateStore,
  usePersistentWorkspacePanelState
} from "./workspacePanelState";
import { getAheadBehindCounts, getPrimaryCommitAction, getPullableCommitCount, getPushableCommitCount, hasStagedChanges, hasUnpushedCommits } from "./commitActions";
import { buildCommitGraphLayout, COMMIT_GRAPH_ROW_HEIGHT, type CommitGraphLayout } from "./commitGraph";
import { createLinePatch, isTechnicalFileHeader, type DiffRow, type DiffRowGroup } from "./diffParser";
import { createDiffProcessingSession, type ProcessedDiff } from "./diffProcessingClient";
import { areFileDiffsEqual } from "./diffFreshness";
import { getCommitFileStatusVisuals, getFileStatusVisuals } from "./fileStatusVisuals";
import { FileStatusChip } from "./FileStatusChip";
import { FixedSizeVirtualList, type VirtualRowProps } from "./FixedSizeVirtualList";
import type { HighlightedCode } from "./syntaxHighlighter";
import { buildStatusFileTree, fileName, flattenStatusFileTree, type StatusFileTreeFolder } from "./statusFileTree";
import { applyColorTheme } from "./themes";
import { OptionalFeatureBoundary } from "./OptionalFeatureBoundary";

const PerformanceDiagnosticsDialog = lazy(() => import("./PerformanceDiagnosticsDialog.js").then((module) => ({
  default: module.PerformanceDiagnosticsDialog
})));
import { StashComposerDialog, type StashCreateDraft } from "./StashComposerDialog";
import { StashesView } from "./StashesView";
import { StartupScreen } from "./StartupScreen";
import { useGitStashes } from "./useGitStashes";
import { useSelectionSafeValue } from "./useSelectionSafeValue";
import { repositoryHistoryRoute, targetFromCommitFile, targetFromHistoryEntry, type HistoricalFileTarget, type HistoryRoute } from "./historyNavigation";
import gitIconUrl from "./assets/git-icon-white.svg";
import loreIconUrl from "./assets/lore-icon-white.svg";

const BasicMarkdown = lazy(() => import("./BasicMarkdown.js").then((module) => ({ default: module.BasicMarkdown })));
const BlameView = lazy(() => import("./BlameView.js").then((module) => ({ default: module.BlameView })));
const FileHistoryView = lazy(() => import("./FileHistoryView.js").then((module) => ({ default: module.FileHistoryView })));
const MarkdownPreview = lazy(() => import("./MarkdownPreview.js").then((module) => ({ default: module.MarkdownPreview })));
const PushToBranchDialog = lazy(() => import("./PushToBranchDialog.js").then((module) => ({ default: module.PushToBranchDialog })));
const RemoteManagementDialog = lazy(() => import("./RemoteManagementDialog.js").then((module) => ({ default: module.RemoteManagementDialog })));
const ReviewConsole = lazy(() => import("./ReviewConsole.js").then((module) => ({ default: module.ReviewConsole })));

const HISTORY_LIMIT = 200;

type HistoryColumnId = "graph" | "description" | "date" | "author" | "commit" | "references" | "pullRequest" | "checks";

type WorkspaceView = "status" | "stashes" | "history" | "workflows" | "pullRequests" | "issues" | "activity";
type IntegrationDialogState = { kind: "merge" | "rebase" | "cherry-pick"; commitHash?: string } | null;

interface FileSelection {
  path: string;
  side: GitDiffSide;
  paths: string[];
  anchorPath: string;
}

interface FileSelectionModifiers {
  extendRange: boolean;
  selectAll: boolean;
  toggle: boolean;
}

type SettingsDraft = SettingsDialogDraft;

interface GitIdentityPromptState {
  open: boolean;
  repoPath: string;
  name: string;
  email: string;
  scope: GitIdentityScope;
  error: string;
  retryMessage: string;
}

interface RepositoryActionManagerState {
  open: boolean;
  draft: RepositoryActionManagerDraft;
  savingTarget: GitConfiguredActionFile | null;
  error: string;
}

interface CloneDraft {
  source: string;
  parentPath: string;
  directoryName: string;
  branchName: string;
  depth: string;
  recurseSubmodules: boolean;
}

interface ResetCommitDialogState {
  open: boolean;
  hash: string;
  mode: GitResetMode;
  error: string;
}

interface RevertCommitDialogState {
  open: boolean;
  hash: string;
  error: string;
}

interface ResetCommitFileDialogState {
  open: boolean;
  hash: string;
  paths: string[];
  error: string;
}

interface GenerateContextDialogState {
  open: boolean;
  context: string;
}

interface CreatePrDialogState {
  open: boolean;
  /** Branch captured when the dialog opened; submit bails if it changed. */
  headBranch: string;
  title: string;
  body: string;
  baseBranch: string;
  draft: boolean;
  step: "idle" | "pushing" | "creating";
  generating: "title" | "description" | null;
  error: string;
  failure: GitHubFailure | null;
  unknownOutcomeReviewed: boolean;
}

interface AppState {
  startupStatus: "loading" | "ready";
  repoPath: string;
  repoRecents: string[];
  repositoryGroups: RepositoryGroup[];
  repoSyncStatuses: Record<string, RepoSyncStatus>;
  repoLoading: boolean;
  showSetup: boolean;
  setupError: string;
  safeDirectoryDialogOpen: boolean;
  safeDirectoryRunning: boolean;
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  clonePanelOpen: boolean;
  summary: RepoSummary | null;
  branchDialogOpen: boolean;
  branchManagerOpen: boolean;
  branchNameDraft: string;
  branchError: string;
  branchCheckoutTarget: { kind: "remote"; remoteBranch: string } | { kind: "pullRequest"; pullRequest: GitHubPullRequest } | null;
  worktreeDialogOpen: boolean;
  worktreeRemoveTarget: GitWorktree | null;
  worktreeRemovalCheck: GitWorktreeRemovalCheck | null;
  worktreeRemovalChecking: boolean;
  upstreamError: string;
  publishDialogOpen: boolean;
  publishRemoteDraft: string;
  publishError: string;
  pushToBranchDialog: PushToBranchDialogState;
  createPrDialog: CreatePrDialogState;
  runningAction: string | null;
  configuredActionRuns: ConfiguredActionRun[];
  runningOperation: string | null;
  activeOperation: ActiveRendererOperation | null;
  lastResult: GitRunResult | null;
  lastOperationResult: GitOperationResult | null;
  operationButtonFeedback: OperationButtonFeedbackEvent | null;
  pullRecovery: GitPullRecovery | null;
  pullRecoveryOpen: boolean;
  pullRecoveryError: string;
  repositoryOperationError: string;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  diffChanged: boolean;
  commitMessage: string;
  commitPushSafetyNotice: CommitPushSafetyNotice | null;
  commitMessageGenerationError: string;
  generateContextDialog: GenerateContextDialogState;
  aiSettings: AiSettings | null;
  appSettings: AppSettings | null;
  repositorySyncSettings: RepositorySyncSettings | null;
  gitIdentity: GitIdentitySettings | null;
  settingsOpen: boolean;
  settingsCategory: SettingsCategory;
  settingsDraft: SettingsDraft;
  settingsError: string;
  settingsSaving: boolean;
  githubConnection: GitHubConnectionStatus | null;
  githubConnectionLoading: boolean;
  githubConnecting: boolean;
  githubDeviceFlow: GitHubDeviceFlow | null;
  githubConnectionError: string;
  gitIdentityPrompt: GitIdentityPromptState;
  gitIdentitySaving: boolean;
  actionManager: RepositoryActionManagerState;
  remoteManager: RemoteManagerState;
  activeView: WorkspaceView;
  historyScope: CommitHistoryScope;
  history: GitCommitGraphRow[];
  historyLoading: boolean;
  historyLoaded: boolean;
  historyError: string;
  selectedCommitHash: string | null;
  resetCommitDialog: ResetCommitDialogState;
  revertCommitDialog: RevertCommitDialogState;
  resetCommitFileDialog: ResetCommitFileDialogState;
  tagDialog: TagDialogState;
  commitDetails: GitCommitDetails | null;
  commitDetailsLoading: boolean;
  commitDetailsError: string;
  selectedCommitFilePath: string | null;
  commitFileDiff: GitFileDiff | null;
  commitFileDiffLoading: boolean;
  commitFileDiffError: string;
  historyRoute: HistoryRoute;
  fileHistoryOrigin: HistoricalFileTarget | null;
  fileHistoryEntries: GitFileHistoryEntry[];
  fileHistoryLoading: boolean;
  fileHistoryError: string;
  fileHistoryHasMore: boolean;
  selectedFileHistoryHash: string | null;
  fileHistoryDiff: GitFileDiff | null;
  fileHistoryDiffLoading: boolean;
  fileHistoryDiffError: string;
  fileBlame: GitFileBlameResult | null;
  fileBlameLoading: boolean;
  fileBlameError: string;
  appUpdate: AppUpdateState;
}

interface CommitPushSafetyNotice {
  message: string;
  undoRequest: GitUndoCommitRequest | null;
}

type AppStateUpdater = Partial<AppState> | ((state: AppState) => AppState);
type RepositoryRefreshReason = "filesystem" | "focus" | "repository-change" | "operation" | "user";

interface AppRepositoryRefreshRequest extends RepositoryRefreshRequest<RepositoryRefreshReason> {
  addToRecents?: boolean;
  preserveWorkspaceOnFailure?: boolean;
  recentAnchorPath?: string;
  silent?: boolean;
  statusOnly?: boolean;
}

const REPOSITORY_REFRESH_PRIORITIES: Record<RepositoryRefreshReason, number> = {
  filesystem: 0,
  focus: 1,
  "repository-change": 2,
  operation: 3,
  user: 4
};

type RepositoryReadKind = "summary" | "identity" | "status" | "metadata" | "history" | "commit-details" | "commit-file-diff" | "file-history" | "file-history-diff" | "file-blame" | "diff" | "diff-freshness" | "file-preview";

function repositoryReadRequestId(kind: RepositoryReadKind, generation: number): string {
  return `${kind}:${generation}`;
}

function cancelRepositoryRead(kind: RepositoryReadKind, generation: number): void {
  if (generation <= 0) return;
  void window.githead.cancelRepositoryRead({
    requestId: repositoryReadRequestId(kind, generation)
  }).catch(() => undefined);
}

interface RequestIds {
  repo: number;
  repoSyncStatuses: number;
  repositorySyncSettings: number;
  diff: number;
  diffFreshness: number;
  history: number;
  commitDetails: number;
  commitFileDiff: number;
  fileHistory: number;
  fileHistoryDiff: number;
  fileBlame: number;
  identity: number;
  remoteConfigs: number;
}

interface ConfiguredActionRun {
  id: number;
  operationId: string;
  name: string;
  repoPath: string;
  cancelStatus: OperationCancelStatus;
  cancelError: string;
}

type RendererCancellationTarget =
  | { kind: "active"; token: number; operationId: string }
  | { kind: "configured"; id: number; operationId: string };

type OperationCancelStatus = "idle" | "canceling" | "error";

type ActiveRendererOperationKind =
  | "action"
  | "repo-operation"
  | "clone"
  | "clone-check"
  | "safe-directory"
  | "action-save"
  | "identity-save"
  | "settings-save"
  | "pr-generation"
  | "pr-push"
  | "pr-create";

interface ActiveRendererOperation {
  token: number;
  operationId: string;
  label: string;
  repoPath: string;
  kind: ActiveRendererOperationKind;
  cancellable: boolean;
  coordinated: boolean;
  cancelStatus: OperationCancelStatus;
  cancelError: string;
}

interface PendingTrustConfirmation {
  repoPath: string;
  promise: Promise<boolean>;
  resolve(trusted: boolean): void;
}

function createRendererOperationId(token: number): string {
  const uniquePart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${token.toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `renderer-${uniquePart}`;
}

function clearActiveRendererOperation(state: AppState, operation: ActiveRendererOperation): AppState {
  const next: AppState = {
    ...state,
    activeOperation: null
  };

  if (operation.kind === "action") {
    next.runningAction = null;
  } else if (operation.kind === "repo-operation") {
    next.runningOperation = null;
  } else if (operation.kind === "clone") {
    next.cloneRunning = false;
  } else if (operation.kind === "clone-check") {
    next.cloneCheckRunning = false;
  } else if (operation.kind === "safe-directory") {
    next.safeDirectoryRunning = false;
  } else if (operation.kind === "action-save") {
    next.actionManager = {
      ...next.actionManager,
      savingTarget: null
    };
  } else if (operation.kind === "identity-save") {
    next.gitIdentitySaving = false;
  } else if (operation.kind === "settings-save") {
    next.settingsSaving = false;
  } else if (operation.kind === "pr-generation") {
    next.runningOperation = null;
    next.createPrDialog = {
      ...next.createPrDialog,
      generating: null
    };
  } else if (operation.kind === "pr-push") {
    next.runningAction = null;
    next.createPrDialog = {
      ...next.createPrDialog,
      step: next.createPrDialog.open ? "idle" : next.createPrDialog.step
    };
  } else if (operation.kind === "pr-create") {
    next.runningOperation = null;
    next.createPrDialog = {
      ...next.createPrDialog,
      step: next.createPrDialog.open ? "idle" : next.createPrDialog.step
    };
  }

  return next;
}

interface RemoteManagerState {
  open: boolean;
  loading: boolean;
  remotes: GitRemoteConfig[];
  error: string;
}

const emptySettingsDraft: SettingsDraft = {
  selectedProvider: "openrouter",
  commitPlanGranularity: DEFAULT_COMMIT_PLAN_GRANULARITY,
  providerModels: {
    openrouter: "",
    openai: "",
    "codex-cli": "",
    anthropic: "",
    "claude-code": ""
  },
  commitPlanModels: {
    openrouter: "",
    openai: "",
    "codex-cli": "",
    anthropic: "",
    "claude-code": ""
  },
  commitPlanReasoningEfforts: createDefaultReasoningEfforts(),
  prDescriptionModels: {
    openrouter: "",
    openai: "",
    "codex-cli": "",
    anthropic: "",
    "claude-code": ""
  },
  reasoningEfforts: createDefaultReasoningEfforts(),
  prDescriptionReasoningEfforts: createDefaultReasoningEfforts(),
  apiKeys: {},
  clearApiKeys: {},
  commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
  prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT,
  sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE },
  autoFetchIntervalMinutes: "10",
  colorTheme: "githead",
  appearanceMode: "system",
  uiFont: "inter",
  codeFont: "system-mono",
  zoomFactor: 1,
  tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR,
  requireUpToDateUpstreamBeforeCommit: false,
  remoteCheckLeaseSeconds: DEFAULT_REMOTE_CHECK_LEASE_SECONDS,
  allowCherryPickingContainedCommits: false,
  shareAnonymousDiagnostics: DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS,
  gitIdentityName: "",
  gitIdentityEmail: "",
  gitIdentityScope: "repository"
};

const emptyGitIdentityPrompt: GitIdentityPromptState = {
  open: false,
  repoPath: "",
  name: "",
  email: "",
  scope: "repository",
  error: "",
  retryMessage: ""
};

const emptyActionManager: RepositoryActionManagerState = {
  open: false,
  draft: {
    shared: [],
    local: []
  },
  savingTarget: null,
  error: ""
};

const emptyCloneDraft: CloneDraft = {
  source: "",
  parentPath: "",
  directoryName: "",
  branchName: "",
  depth: "0",
  recurseSubmodules: true
};

const emptyResetCommitDialog: ResetCommitDialogState = {
  open: false,
  hash: "",
  mode: "mixed",
  error: ""
};

const emptyRevertCommitDialog: RevertCommitDialogState = {
  open: false,
  hash: "",
  error: ""
};

const emptyResetCommitFileDialog: ResetCommitFileDialogState = {
  open: false,
  hash: "",
  paths: [],
  error: ""
};

const emptyTagDialog: TagDialogState = {
  open: false,
  hash: "",
  tab: "add",
  tagName: "",
  message: "",
  lightweight: false,
  force: false,
  pushRemote: null,
  deleteTagName: "",
  deletePushRemote: null,
  deleteConfirmed: false,
  error: ""
};

const emptyGenerateContextDialog: GenerateContextDialogState = {
  open: false,
  context: ""
};

const emptyCreatePrDialog: CreatePrDialogState = {
  open: false,
  headBranch: "",
  title: "",
  body: "",
  baseBranch: "",
  draft: false,
  step: "idle",
  generating: null,
  error: "",
  failure: null,
  unknownOutcomeReviewed: false
};

const emptyRemoteManager: RemoteManagerState = {
  open: false,
  loading: false,
  remotes: [],
  error: ""
};

const emptyStashComposer: StashComposerState = {
  open: false,
  paths: []
};

const TRUST_WORKSPACE_TITLE = "Do you trust this workspace?";
const TRUST_WORKSPACE_DESCRIPTION = "This is the first time Githead will run Git operations here that may execute configured hooks or local Git configuration.";
const OPERATION_RECONCILE_INITIAL_DELAY_MS = 3_000;
const OPERATION_RECONCILE_INTERVAL_MS = 10_000;

const initialState: AppState = {
  startupStatus: "loading",
  repoPath: "",
  repoRecents: [],
  repositoryGroups: [],
  repoSyncStatuses: {},
  repoLoading: false,
  showSetup: true,
  setupError: "",
  safeDirectoryDialogOpen: false,
  safeDirectoryRunning: false,
  cloneDraft: emptyCloneDraft,
  cloneError: "",
  cloneRunning: false,
  cloneCheckRunning: false,
  cloneCheckStatus: "idle",
  cloneCheckMessage: "",
  cloneBranches: [],
  clonePanelOpen: false,
  summary: null,
  branchDialogOpen: false,
  branchManagerOpen: false,
  branchNameDraft: "",
  branchError: "",
  branchCheckoutTarget: null,
  worktreeDialogOpen: false,
  worktreeRemoveTarget: null,
  worktreeRemovalCheck: null,
  worktreeRemovalChecking: false,
  upstreamError: "",
  publishDialogOpen: false,
  publishRemoteDraft: "",
  publishError: "",
  pushToBranchDialog: emptyPushToBranchDialog,
  createPrDialog: emptyCreatePrDialog,
  runningAction: null,
  configuredActionRuns: [],
  runningOperation: null,
  activeOperation: null,
  lastResult: null,
  lastOperationResult: null,
  operationButtonFeedback: null,
  pullRecovery: null,
  pullRecoveryOpen: false,
  pullRecoveryError: "",
  repositoryOperationError: "",
  selection: null,
  diff: null,
  diffLoading: false,
  diffChanged: false,
  commitMessage: "",
  commitPushSafetyNotice: null,
  commitMessageGenerationError: "",
  generateContextDialog: emptyGenerateContextDialog,
  aiSettings: null,
  appSettings: null,
  repositorySyncSettings: null,
  gitIdentity: null,
  settingsOpen: false,
  settingsCategory: "git-identity",
  settingsDraft: emptySettingsDraft,
  settingsError: "",
  settingsSaving: false,
  githubConnection: null,
  githubConnectionLoading: false,
  githubConnecting: false,
  githubDeviceFlow: null,
  githubConnectionError: "",
  gitIdentityPrompt: emptyGitIdentityPrompt,
  gitIdentitySaving: false,
  actionManager: emptyActionManager,
  remoteManager: emptyRemoteManager,
  activeView: "status",
  historyScope: "current",
  history: [],
  historyLoading: false,
  historyLoaded: false,
  historyError: "",
  selectedCommitHash: null,
  resetCommitDialog: emptyResetCommitDialog,
  revertCommitDialog: emptyRevertCommitDialog,
  resetCommitFileDialog: emptyResetCommitFileDialog,
  tagDialog: emptyTagDialog,
  commitDetails: null,
  commitDetailsLoading: false,
  commitDetailsError: "",
  selectedCommitFilePath: null,
  commitFileDiff: null,
  commitFileDiffLoading: false,
  commitFileDiffError: "",
  historyRoute: repositoryHistoryRoute,
  fileHistoryOrigin: null,
  fileHistoryEntries: [],
  fileHistoryLoading: false,
  fileHistoryError: "",
  fileHistoryHasMore: false,
  selectedFileHistoryHash: null,
  fileHistoryDiff: null,
  fileHistoryDiffLoading: false,
  fileHistoryDiffError: "",
  fileBlame: null,
  fileBlameLoading: false,
  fileBlameError: "",
  appUpdate: createInitialRendererUpdateState()
};

const initialWindowState: AppWindowState = {
  isMaximized: false
};

export function App(): ReactNode {
  const [state, setState] = useState<AppState>(initialState);
  const [activityLogStore] = useState(() => new ActivityLogStore());
  const activityLogAttention = useSyncExternalStore(
    activityLogStore.subscribeAttention,
    activityLogStore.getAttentionSnapshot,
    activityLogStore.getAttentionSnapshot
  );
  const [workspacePanelStateStore] = useState(() => new WorkspacePanelStateStore());
  const [performanceDiagnosticsOpen, setPerformanceDiagnosticsOpen] = useState(false);
  const [conflictResolverPath, setConflictResolverPath] = useState<string | null>(null);
  const [statusWorkspaceMode, setStatusWorkspaceMode] = useState<"files" | "plan">("files");
  const [workingTreeChangeVersion, setWorkingTreeChangeVersion] = useState(0);
  const [stashComposer, setStashComposer] = useState<StashComposerState>(emptyStashComposer);
  const [repositorySettingsPath, setRepositorySettingsPath] = useState("");
  const [integrationDialog, setIntegrationDialog] = useState<IntegrationDialogState>(null);
  const [amendDialogSource, setAmendDialogSource] = useState<GitAmendEntryPoint | null>(null);
  const amendReturnFocusRef = useRef<HTMLElement | null>(null);
  const [forceLeaseOffer, setForceLeaseOffer] = useState<GitForceWithLeaseOffer | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState<GitHubWorkflowRunQuery>({ ...DEFAULT_WORKFLOW_QUERY });
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [workflowPreset, setWorkflowPreset] = useState("all");
  const [pullRequestQuery, setPullRequestQuery] = useState<GitHubPullRequestQuery>({ ...DEFAULT_PULL_REQUEST_QUERY });
  const [pullRequestPreset, setPullRequestPreset] = useState("all");
  const [issueQuery, setIssueQuery] = useState<GitHubIssueQuery>({ ...DEFAULT_ISSUE_QUERY });
  const [issuePreset, setIssuePreset] = useState("all");
  const githubRepository = state.summary?.isValid && state.summary.githubRepository
    ? { repoPath: state.repoPath, githubFullName: state.summary.githubRepository.fullName }
    : null;
  const activeGitHubResource = state.activeView === "workflows"
    ? "workflowRuns"
    : state.activeView === "pullRequests" || state.activeView === "issues"
      ? state.activeView
      : null;
  const github = useGitHubQueries(
    githubRepository,
    { workflows: workflowQuery, pullRequests: pullRequestQuery, issues: issueQuery },
    activeGitHubResource
  );
  const stashWorkspace = useGitStashes(
    state.repoPath,
    Boolean(state.summary?.isValid && state.summary.capabilities.stashes),
    state.activeView === "stashes"
  );
  const historyInsights = useGitHubHistoryInsights({
    repoPath: githubRepository?.repoPath ?? "",
    githubFullName: githubRepository?.githubFullName ?? "",
    currentBranch: state.summary?.branch ?? null,
    headSha: getCurrentHistoryHeadSha(state.history, state.historyScope, state.summary?.branch ?? null),
    commitShas: state.history.map((commit) => commit.hash),
    enabled: state.activeView === "history" && state.historyRoute.kind === "repository" && state.historyLoaded && Boolean(githubRepository)
  });
  const [windowState, setWindowState] = useState<AppWindowState>(initialWindowState);
  const appearanceMode = state.settingsOpen
    ? state.settingsDraft.appearanceMode
    : state.appSettings?.appearanceMode ?? "system";
  useAppearanceModeClass(appearanceMode);
  const uiFont = state.settingsOpen ? state.settingsDraft.uiFont : state.appSettings?.uiFont ?? "inter";
  const codeFont = state.settingsOpen ? state.settingsDraft.codeFont : state.appSettings?.codeFont ?? "system-mono";
  useFontPreferences(uiFont, codeFont);
  const stateRef = useRef(state);
  const githubConnectionGenerationRef = useRef(0);
  const appSettingsSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const appSettingsPreferenceSaveId = useRef(0);
  const requestIds = useRef<RequestIds>({
    repo: 0,
    repoSyncStatuses: 0,
    repositorySyncSettings: 0,
    diff: 0,
    diffFreshness: 0,
    history: 0,
    commitDetails: 0,
    commitFileDiff: 0,
    fileHistory: 0,
    fileHistoryDiff: 0,
    fileBlame: 0,
    identity: 0,
    remoteConfigs: 0
  });
  const repositorySnapshots = useRef(new RepositorySnapshotCache());
  const lastRepositoryRefreshRef = useRef<{ repoPath: string; succeeded: boolean } | null>(null);
  const runRepoRefreshRef = useRef<(
    repoPath: string,
    request: AppRepositoryRefreshRequest,
    signal: AbortSignal
  ) => Promise<void>>(async () => undefined);
  const [repositoryRefreshCoordinator] = useState(() => new RepositoryRefreshCoordinator<AppRepositoryRefreshRequest>({
    getReasonPriority: (reason) => REPOSITORY_REFRESH_PRIORITIES[reason],
    run: (repoPath, request, signal) => runRepoRefreshRef.current(repoPath, request, signal),
    onEnqueue: (request, measurement) => {
      window.githead.recordPerformanceRefresh({
        refreshKind: request.statusOnly ? "status" : "snapshot",
        requestCount: 1,
        coalescedCount: measurement.coalescedCount,
        queueDepth: measurement.queueDepth
      });
    }
  }));
  const pendingTrustConfirmationRef = useRef<PendingTrustConfirmation | null>(null);
  const repoRefreshInFlightRef = useRef(false);
  const autoFetchInFlightRef = useRef(false);
  const rendererOperationTokenRef = useRef(0);
  const actionManagerSaveTokenRef = useRef(0);
  const configuredActionRunIdRef = useRef(0);
  const fileStatusGenerationRef = useRef(0);
  const acknowledgedFileStatusGenerationRef = useRef(0);
  const startupStartedRef = useRef(false);
  const refreshDirtyFileStatusRef = useRef<() => Promise<void>>(async () => undefined);
  const windowFocusedRef = useRef(true);
  const [trustDialogRepoPath, setTrustDialogRepoPath] = useState<string | null>(null);

  const updateState = useCallback((updater: AppStateUpdater): void => {
    const current = stateRef.current;
    const next = typeof updater === "function" ? updater(current) : {
      ...current,
      ...updater
    };
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!state.summary?.isValid || state.summary.kind !== "git") return;
    const repoPath = state.repoPath;
    let cancelled = false;
    void window.githead.getPullRecovery(repoPath).then((recovery) => {
      if (cancelled || !recovery || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
      updateState({
        pullRecovery: recovery,
        pullRecoveryOpen: true,
        pullRecoveryError: ""
      });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [state.repoPath, state.summary?.isValid, state.summary?.kind, updateState]);

  const saveAppSettingsPreference = useCallback((
    patch: Partial<Pick<AppSettings, "statusFileViewMode" | "wrapDiffLines">>,
    failureMessage: string
  ): void => {
    const previous = stateRef.current.appSettings;
    if (!previous) return;
    const desired = { ...previous, ...patch };
    if (
      desired.statusFileViewMode === previous.statusFileViewMode
      && desired.wrapDiffLines === previous.wrapDiffLines
    ) return;

    const saveId = ++appSettingsPreferenceSaveId.current;
    updateState({ appSettings: desired });
    appSettingsSaveQueue.current = appSettingsSaveQueue.current.then(async () => {
      try {
        const appSettings = await window.githead.saveAppSettings(desired);
        if (saveId === appSettingsPreferenceSaveId.current) updateState({ appSettings });
      } catch (error) {
        if (saveId === appSettingsPreferenceSaveId.current) updateState({
          appSettings: previous,
          lastOperationResult: {
            repoPath: stateRef.current.repoPath,
            exitCode: -1,
            stdout: "",
            stderr: error instanceof Error ? error.message : failureMessage
          }
        });
      }
    });
  }, [updateState]);

  const setWrapDiffLines = useCallback((wrapDiffLines: boolean): void => {
    saveAppSettingsPreference({ wrapDiffLines }, "Unable to save the diff line wrap preference.");
  }, [saveAppSettingsPreference]);

  const closeTrustDialog = useCallback((trusted: boolean): void => {
    const pending = pendingTrustConfirmationRef.current;
    pendingTrustConfirmationRef.current = null;
    setTrustDialogRepoPath(null);
    pending?.resolve(trusted);
  }, []);

  const confirmWorkspaceTrust = useCallback((repoPath: string): Promise<boolean> => {
    const pending = pendingTrustConfirmationRef.current;
    if (pending) {
      return isSameRepoPath(pending.repoPath, repoPath)
        ? pending.promise
        : Promise.resolve(false);
    }

    let resolvePending: (trusted: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((resolve) => {
      resolvePending = resolve;
    });
    pendingTrustConfirmationRef.current = {
      repoPath,
      promise,
      resolve: resolvePending
    };
    setTrustDialogRepoPath(repoPath);
    return promise;
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    activityLogStore.setViewing(state.activeView === "activity");
  }, [activityLogStore, state.activeView]);

  const appendLog = useCallback((event: GitOutputEvent): void => {
    activityLogStore.append(event);
  }, [activityLogStore]);

  const appendSystemLine = useCallback((
    text: string,
    source: { runId?: string; action?: string } = {}
  ): void => {
    appendLog({
      runId: source.runId ?? "renderer",
      action: source.action ?? stateRef.current.runningAction ?? "fetch",
      stream: "system",
      text: `${text}\n`,
      timestamp: new Date().toISOString()
    });
  }, [appendLog]);

  const appendOperationLog = useCallback((label: string, result: GitOperationResult): void => {
    activityLogStore.appendOperationResult(label, result);
  }, [activityLogStore]);

  const copyActivityLogRawText = useCallback(async (): Promise<void> => {
    const text = activityLogStore.getRawText();
    if (text.trim().length === 0) {
      return;
    }

    await window.githead.copyTextToClipboard({
      text
    });
  }, [activityLogStore]);

  useEffect(() => {
    return window.githead.onGitOutput(appendLog);
  }, [appendLog]);

  useEffect(() => {
    let cancelled = false;
    const cleanupUpdateState = window.githead.onUpdateState((appUpdate) => {
      updateState({
        appUpdate
      });
    });

    void window.githead.getUpdateState()
      .then((appUpdate) => {
        if (!cancelled) {
          updateState({
            appUpdate
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          updateState((current) => markAppUpdateError(current, "check", error));
        }
      });

    return () => {
      cancelled = true;
      cleanupUpdateState();
    };
  }, [updateState]);

  useEffect(() => {
    let cancelled = false;
    const cleanupWindowState = window.githead.onWindowState((nextWindowState) => {
      setWindowState(nextWindowState);
    });

    void window.githead.getWindowState()
      .then((nextWindowState) => {
        if (!cancelled) {
          setWindowState(nextWindowState);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cleanupWindowState();
    };
  }, []);

  const loadCommitFileDiff = useCallback(async (hash: string, filePath: string): Promise<void> => {
    cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
    const requestId = requestIds.current.commitFileDiff + 1;
    requestIds.current.commitFileDiff = requestId;
    updateState({
      commitFileDiffLoading: true,
      commitFileDiffError: "",
      commitFileDiff: null
    });

    try {
      const originalPath = stateRef.current.commitDetails?.files.find((file) => file.path === filePath)?.originalPath;
      const diff = await window.githead.getCommitFileDiff({
        repoPath: stateRef.current.repoPath,
        hash,
        path: filePath,
        requestId: repositoryReadRequestId("commit-file-diff", requestId),
        ...(originalPath ? { originalPath } : {})
      });

      if (requestId === requestIds.current.commitFileDiff) {
        updateState({
          commitFileDiff: diff
        });
      }
    } catch (error) {
      if (requestId === requestIds.current.commitFileDiff) {
        updateState({
          commitFileDiffError: error instanceof Error ? error.message : "Unable to read commit diff."
        });
      }
    } finally {
      if (requestId === requestIds.current.commitFileDiff) {
        updateState({
          commitFileDiffLoading: false
        });
      }
    }
  }, [updateState]);

  const loadCommitDetails = useCallback(async (hash: string): Promise<void> => {
    cancelRepositoryRead("commit-details", requestIds.current.commitDetails);
    const requestId = requestIds.current.commitDetails + 1;
    requestIds.current.commitDetails = requestId;
    const previousFilePath = stateRef.current.selectedCommitFilePath;
    updateState({
      commitDetailsLoading: true,
      commitDetailsError: "",
      commitDetails: null,
      selectedCommitFilePath: null,
      commitFileDiff: null,
      commitFileDiffError: ""
    });

    try {
      const details = await window.githead.getCommitDetails({
        repoPath: stateRef.current.repoPath,
        hash,
        requestId: repositoryReadRequestId("commit-details", requestId)
      });

      if (requestId !== requestIds.current.commitDetails) {
        return;
      }

      const selectedCommitFilePath = details.files.some((file) => file.path === previousFilePath)
        ? previousFilePath
        : details.files[0]?.path ?? null;

      updateState({
        commitDetails: details,
        selectedCommitFilePath
      });
    } catch (error) {
      if (requestId === requestIds.current.commitDetails) {
        updateState({
          commitDetailsError: error instanceof Error ? error.message : "Unable to read commit details.",
          commitDetails: null,
          selectedCommitFilePath: null
        });
      }
    } finally {
      if (requestId === requestIds.current.commitDetails) {
        updateState({
          commitDetailsLoading: false
        });
      }
    }

    const latest = stateRef.current;
    if (latest.selectedCommitHash === hash && latest.selectedCommitFilePath) {
      await loadCommitFileDiff(hash, latest.selectedCommitFilePath);
    }
  }, [loadCommitFileDiff, updateState]);

  const loadCommitHistory = useCallback(async (force: boolean): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.summary?.isValid) {
      updateState({
        history: [],
        historyLoaded: false,
        historyError: current.summary?.validationErrors.join(" ") ?? ""
      });
      return false;
    }

    if (current.historyLoaded && !force) {
      return true;
    }

    const repoPath = current.repoPath;
    const scope = current.historyScope;

    cancelRepositoryRead("history", requestIds.current.history);
    const requestId = requestIds.current.history + 1;
    requestIds.current.history = requestId;
    updateState({
      historyLoading: true,
      historyError: ""
    });

    let commitHashToLoad: string | null = null;

    try {
      const loadedHistory = await window.githead.getCommitHistory({
        repoPath,
        limit: HISTORY_LIMIT,
        scope,
        requestId: repositoryReadRequestId("history", requestId)
      });

      if (requestId !== requestIds.current.history) {
        return false;
      }

      const latest = stateRef.current;
      const history = reuseCommitHistoryRows(latest.history, loadedHistory);
      const selectedCommitHash = history.some((commit) => commit.hash === latest.selectedCommitHash)
        ? latest.selectedCommitHash
        : history[0]?.hash ?? null;
      const selectionChanged = selectedCommitHash !== latest.selectedCommitHash;
      const detailsNeedLoading = Boolean(selectedCommitHash) && latest.commitDetails?.hash !== selectedCommitHash;

      updateState(selectionChanged ? {
        history,
        historyLoaded: true,
        historyError: "",
        selectedCommitHash,
        commitDetails: null,
        commitDetailsError: "",
        selectedCommitFilePath: null,
        commitFileDiff: null,
        commitFileDiffError: ""
      } : {
        history,
        historyLoaded: true,
        historyError: ""
      });

      if (selectionChanged || detailsNeedLoading) {
        commitHashToLoad = selectedCommitHash;
      }
    } catch (error) {
      if (requestId === requestIds.current.history) {
        const historyError = error instanceof Error ? error.message : "Unable to read commit history.";
        if (stateRef.current.history.length > 0) {
          updateState({
            historyLoaded: true,
            historyError
          });
        } else {
          updateState({
            history: [],
            historyLoaded: false,
            historyError,
            selectedCommitHash: null,
            commitDetails: null,
            selectedCommitFilePath: null,
            commitFileDiff: null
          });
        }
      }
      return false;
    } finally {
      if (requestId === requestIds.current.history) {
        updateState({
          historyLoading: false
        });
      }
    }

    if (commitHashToLoad) {
      await loadCommitDetails(commitHashToLoad);
    }
    return true;
  }, [loadCommitDetails, updateState]);

  const changeHistoryScope = useCallback((scope: CommitHistoryScope): void => {
    const current = stateRef.current;
    if (current.historyScope === scope || current.summary?.kind !== "git") {
      return;
    }

    cancelRepositoryRead("commit-details", requestIds.current.commitDetails);
    cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
    requestIds.current.commitDetails += 1;
    requestIds.current.commitFileDiff += 1;
    updateState({
      historyScope: scope,
      history: [],
      historyLoading: false,
      historyLoaded: false,
      historyError: "",
      commitDetails: null,
      commitDetailsLoading: false,
      commitDetailsError: "",
      selectedCommitFilePath: null,
      commitFileDiff: null,
      commitFileDiffLoading: false,
      commitFileDiffError: ""
    });
    void loadCommitHistory(false);
  }, [loadCommitHistory, updateState]);

  const loadSelectedDiff = useCallback(async (selectionOverride?: FileSelection): Promise<void> => {
    const selection = selectionOverride ?? stateRef.current.selection;
    cancelRepositoryRead("diff-freshness", requestIds.current.diffFreshness);
    requestIds.current.diffFreshness += 1;
    if (!selection || !stateRef.current.summary?.isValid) {
      updateState({
        diff: null,
        diffLoading: false,
        diffChanged: false
      });
      return;
    }

    cancelRepositoryRead("diff", requestIds.current.diff);
    const requestId = requestIds.current.diff + 1;
    requestIds.current.diff = requestId;
    updateState({
      diffLoading: true
    });

    try {
      const diff = await window.githead.getFileDiff({
        repoPath: stateRef.current.repoPath,
        path: selection.path,
        side: selection.side,
        requestId: repositoryReadRequestId("diff", requestId)
      });

      if (requestId === requestIds.current.diff) {
        updateState({
          diff,
          diffChanged: false
        });
      }
    } catch (error) {
      if (requestId === requestIds.current.diff) {
        updateState({
          diff: {
            path: selection.path,
            side: selection.side,
            kind: "error",
            text: error instanceof Error ? error.message : "Unable to read diff."
          }
        });
      }
    } finally {
      if (requestId === requestIds.current.diff) {
        updateState({
          diffLoading: false
        });
      }
    }
  }, [updateState]);

  const checkSelectedDiffFreshness = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const selection = current.selection;
    const loadedDiff = current.diff;
    if (
      current.activeView !== "status" ||
      !current.summary?.isValid ||
      !selection ||
      !loadedDiff ||
      current.diffLoading ||
      current.diffChanged ||
      isOperationRunning(current)
    ) {
      return;
    }

    cancelRepositoryRead("diff-freshness", requestIds.current.diffFreshness);
    const requestId = requestIds.current.diffFreshness + 1;
    requestIds.current.diffFreshness = requestId;
    const repoPath = current.repoPath;

    try {
      const latestDiff = await window.githead.getFileDiff({
        repoPath,
        path: selection.path,
        side: selection.side,
        requestId: repositoryReadRequestId("diff-freshness", requestId)
      });
      const latest = stateRef.current;
      if (
        requestId !== requestIds.current.diffFreshness ||
        !isSameRepoPath(repoPath, latest.repoPath) ||
        latest.selection?.path !== selection.path ||
        latest.selection.side !== selection.side ||
        latest.diff !== loadedDiff
      ) {
        return;
      }
      if (!areFileDiffsEqual(loadedDiff, latestDiff)) {
        updateState({ diffChanged: true });
      }
    } catch {
      // A failed background comparison must not replace the loaded diff.
    }
  }, [updateState]);

  const loadRepoSyncStatuses = useCallback(async (repoPathsOverride?: string[]): Promise<void> => {
    const repoPaths = repoPathsOverride ?? getRepositoryWorkspacePaths(stateRef.current.repositoryGroups, stateRef.current.repoRecents);
    const requestId = requestIds.current.repoSyncStatuses + 1;
    requestIds.current.repoSyncStatuses = requestId;

    if (repoPaths.length === 0) {
      updateState({
        repoSyncStatuses: {}
      });
      return;
    }

    try {
      const statuses = await window.githead.getRepoSyncStatuses(repoPaths);
      if (requestId !== requestIds.current.repoSyncStatuses) {
        return;
      }

      updateState((current) => ({
        ...current,
        repoSyncStatuses: createRepoSyncStatusMap(repoPaths, statuses, current.repoSyncStatuses)
      }));
    } catch {
      if (requestId === requestIds.current.repoSyncStatuses) {
        updateState((current) => ({
          ...current,
          repoSyncStatuses: pruneRepoSyncStatusMap(repoPaths, current.repoSyncStatuses)
        }));
      }
    }
  }, [updateState]);

  const loadRepositoryGroups = useCallback(async (repoPathsOverride?: string[]): Promise<void> => {
    const repoPaths = repoPathsOverride ?? stateRef.current.repoRecents;
    if (!repoPaths.length) {
      updateState({ repositoryGroups: [] });
      return;
    }
    try {
      const groups = await window.githead.getRepositoryGroups({
        repoPaths,
        activeRepoPath: stateRef.current.repoPath || null
      });
      if (!groups.length) {
        updateState({ repositoryGroups: [] });
        return;
      }
      const anchors = groups.map((group) => group.anchorPath);
      updateState((current) => ({
        ...current,
        repositoryGroups: groups,
        repoRecents: anchors,
        repoSyncStatuses: pruneRepoSyncStatusMap(getRepositoryWorkspacePaths(groups, anchors), current.repoSyncStatuses)
      }));
      void loadRepoSyncStatuses(getRepositoryWorkspacePaths(groups, anchors));
    } catch {
      updateState({ repositoryGroups: [] });
    }
  }, [loadRepoSyncStatuses, updateState]);

  const runRepoRefresh = useCallback(async (
    repoPath: string,
    options: AppRepositoryRefreshRequest,
    signal: AbortSignal
  ): Promise<void> => {
    const requestId = requestIds.current.repo + 1;
    requestIds.current.repo = requestId;
    const fileStatusGeneration = fileStatusGenerationRef.current;
    let refreshSucceeded = false;
    lastRepositoryRefreshRef.current = { repoPath, succeeded: false };
    repoRefreshInFlightRef.current = true;

    const cancelRefreshReads = (): void => {
      cancelRepositoryRead("identity", requestId);
      cancelRepositoryRead("status", requestId);
      cancelRepositoryRead("metadata", requestId);
    };
    signal.addEventListener("abort", cancelRefreshReads, { once: true });
    if (signal.aborted) {
      cancelRefreshReads();
      signal.removeEventListener("abort", cancelRefreshReads);
      repoRefreshInFlightRef.current = false;
      return;
    }

    if (!options.silent) {
      updateState({
        repoLoading: true
      });
    }

    try {
      if (options.statusOnly) {
        const status = await window.githead.getRepoStatus({ repoPath, generation: requestId, requestId: repositoryReadRequestId("status", requestId) });
        if (requestId !== requestIds.current.repo || !isSameRepoPath(status.repoPath, stateRef.current.repoPath)) return;
        acknowledgedFileStatusGenerationRef.current = Math.max(acknowledgedFileStatusGenerationRef.current, fileStatusGeneration);
        refreshSucceeded = true;
        updateState((current) => current.summary ? reconcileSelection({ ...current, summary: { ...current.summary, ...status } }) : current);
        return;
      }

      const identity = await window.githead.getRepoIdentity({ repoPath, generation: requestId, requestId: repositoryReadRequestId("identity", requestId) });
      if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return;
      }

      if (!identity.isValid) repositorySnapshots.current.delete(repoPath);
      const identitySummary = stateRef.current.summary?.isValid
        ? { ...stateRef.current.summary, ...identity }
        : createSummaryFromIdentity(identity);
      updateState((current) => ({ ...current, summary: identitySummary, showSetup: !identity.isValid, setupError: identity.validationErrors.join(" ") }));
      if (!identity.isValid) return;

      const [statusResult, metadataResult] = await Promise.allSettled([
        window.githead.getRepoStatus({ repoPath, generation: requestId, requestId: repositoryReadRequestId("status", requestId) }),
        window.githead.getRepoMetadata({ repoPath, generation: requestId, requestId: repositoryReadRequestId("metadata", requestId) })
      ]);
      if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
      const status = statusResult.status === "fulfilled" && statusResult.value.generation === requestId && isSameRepoPath(statusResult.value.repoPath, repoPath) ? statusResult.value : null;
      const metadata = metadataResult.status === "fulfilled" && metadataResult.value.generation === requestId && isSameRepoPath(metadataResult.value.repoPath, repoPath) ? metadataResult.value : null;
      const summary = { ...identitySummary, ...status, ...metadata };

      acknowledgedFileStatusGenerationRef.current = Math.max(
        acknowledgedFileStatusGenerationRef.current,
        fileStatusGeneration
      );
      refreshSucceeded = Boolean(status);
      lastRepositoryRefreshRef.current = { repoPath, succeeded: Boolean(status && metadata) };
      updateState((current) => reconcileGitHubUiState(reconcileSelection({
        ...current,
        summary,
        repoSyncStatuses: {
          ...current.repoSyncStatuses,
          [getRepoPathKey(summary.repoPath)]: createRepoSyncStatusFromSummary(summary)
        },
        showSetup: !summary.isValid,
        setupError: summary.isValid ? "" : summary.validationErrors.join(" ")
      }), current.summary));

      if (!status || !metadata) {
        const error = statusResult.status === "rejected" ? statusResult.reason : metadataResult.status === "rejected" ? metadataResult.reason : null;
        updateState((current) => ({ ...current, lastOperationResult: error ? { repoPath, exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : "Unable to load a Repository section." } : current.lastOperationResult }));
      }

      if (options.addToRecents && summary.isValid) {
        try {
          const recents = await window.githead.addRepoRecent({
            repoPath: summary.repoPath,
            ...(options.recentAnchorPath ? { anchorPath: options.recentAnchorPath } : {})
          });
          const repoRecents = recents.map((recent) => recent.anchorPath);
          if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
            const previousRepoRecents = stateRef.current.repoRecents;
            updateState((current) => ({
              ...current,
              repoRecents,
              repositoryGroups: current.repositoryGroups.map((group) =>
                isSameRepoPath(group.anchorPath, options.recentAnchorPath ?? summary.repoPath)
                  ? { ...group, lastUsedPath: summary.repoPath }
                  : group)
            }));
            if (!areRepoPathListsEqual(previousRepoRecents, repoRecents)) {
              void loadRepoSyncStatuses(repoRecents);
            }
          }
        } catch (error) {
          if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
            updateState((current) => ({
              ...current,
              lastOperationResult: {
                repoPath,
                exitCode: -1,
                stdout: "",
                stderr: error instanceof Error ? error.message : "Unable to save recent repository."
              }
            }));
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        lastRepositoryRefreshRef.current = { repoPath, succeeded: false };
        if (options.preserveWorkspaceOnFailure && stateRef.current.summary?.isValid) {
          updateState((current) => ({
            ...current,
            lastOperationResult: {
              repoPath,
              exitCode: -1,
              stdout: "",
              stderr: error instanceof Error ? error.message : "Unable to refresh the repository view."
            }
          }));
          return;
        }
        if (options.statusOnly && stateRef.current.summary?.isValid) {
          updateState((current) => ({ ...current, lastOperationResult: { repoPath, exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : "Unable to refresh File Status." } }));
          return;
        }
        const summary = createInvalidSummary(
          stateRef.current.repoPath,
          error instanceof Error ? error.message : "Unable to read repository state."
        );
        updateState((current) => ({
          ...current,
          summary,
          repoSyncStatuses: {
            ...current.repoSyncStatuses,
            [getRepoPathKey(summary.repoPath)]: createRepoSyncStatusFromSummary(summary)
          },
          showSetup: true,
          setupError: error instanceof Error ? error.message : "Unable to read repository state.",
          selection: null,
          diff: null,
          diffChanged: false
        }));
      }
    } finally {
      signal.removeEventListener("abort", cancelRefreshReads);
      if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        repoRefreshInFlightRef.current = false;
        if (!options.silent) {
          updateState({
            repoLoading: false
          });
        }
        if (
          refreshSucceeded &&
          acknowledgedFileStatusGenerationRef.current < fileStatusGenerationRef.current
        ) {
          queueMicrotask(() => void refreshDirtyFileStatusRef.current());
        }
      }
    }

    if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    const latest = stateRef.current;
    if (latest.activeView === "history" && latest.historyRoute.kind === "repository") {
      await loadCommitHistory(true);
    }
  }, [loadCommitHistory, loadRepoSyncStatuses, updateState]);

  runRepoRefreshRef.current = runRepoRefresh;

  const refreshRepo = useCallback(async (
    options: Omit<AppRepositoryRefreshRequest, "reason"> & { reason?: RepositoryRefreshReason } = {}
  ): Promise<void> => {
    const repoPath = stateRef.current.repoPath;
    if (!repoPath) return;
    const request: AppRepositoryRefreshRequest = {
      ...options,
      reason: options.reason ?? "user"
    };
    while (isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      try {
        await repositoryRefreshCoordinator.enqueue(repoPath, request);
        return;
      } catch (error) {
        if (!(error instanceof RepositoryRefreshDisposedError)) return;
        await repositoryRefreshCoordinator.whenIdle(repoPath);
      }
    }
  }, [repositoryRefreshCoordinator]);

  const refreshDirtyFileStatus = useCallback(async (options: {
    force?: boolean;
    reason?: "filesystem" | "focus" | "user";
  } = {}): Promise<void> => {
    if (
      options.force &&
      acknowledgedFileStatusGenerationRef.current === fileStatusGenerationRef.current
    ) {
      fileStatusGenerationRef.current += 1;
    }

    const current = stateRef.current;
    if (acknowledgedFileStatusGenerationRef.current === fileStatusGenerationRef.current) {
      return;
    }

    if (current.activeView !== "status") {
      return;
    }

    if (
      !current.summary?.isValid ||
      isOperationRunning(current)
    ) {
      return;
    }

    await refreshRepo({
      reason: options.reason ?? "filesystem",
      silent: true,
      statusOnly: true
    });
  }, [refreshRepo]);
  refreshDirtyFileStatusRef.current = refreshDirtyFileStatus;

  useEffect(() => {
    const cleanupRepoChanged = window.githead.onRepoChanged((event) => {
      if (!isSameRepoPath(event.repoPath, stateRef.current.repoPath)) {
        return;
      }

      fileStatusGenerationRef.current += 1;
      if (event.reason === "filesystem") {
        setWorkingTreeChangeVersion((current) => current + 1);
      }
      repositorySnapshots.current.markStale(event.repoPath, event.reason === "filesystem" ? ["status"] : ["identity", "status", "metadata"]);
      void checkSelectedDiffFreshness();
      if (event.reason === "filesystem") {
        void refreshDirtyFileStatus({ reason: "filesystem" });
      } else {
        void refreshRepo({ reason: "repository-change", silent: true });
        void loadRepositoryGroups();
      }
    });

    return cleanupRepoChanged;
  }, [checkSelectedDiffFreshness, loadRepositoryGroups, refreshDirtyFileStatus, refreshRepo]);

  useEffect(() => {
    setWorkflowQuery({ ...DEFAULT_WORKFLOW_QUERY });
    setWorkflowSearch("");
    setWorkflowPreset("all");
    setPullRequestQuery({ ...DEFAULT_PULL_REQUEST_QUERY });
    setPullRequestPreset("all");
    setIssueQuery({ ...DEFAULT_ISSUE_QUERY });
    setIssuePreset("all");
  }, [githubRepository?.repoPath, githubRepository?.githubFullName]);

  useEffect(() => {
    if (githubRepository) {
      void github.ensure("openCounts");
      void github.ensure("viewer");
      if (state.activeView === "workflows") void github.ensure("workflowRuns");
      if (state.activeView === "pullRequests") void github.ensure("pullRequests");
      if (state.activeView === "issues") void github.ensure("issues");
    }
  }, [github.ensure, githubRepository?.repoPath, githubRepository?.githubFullName, state.activeView]);

  useEffect(() => {
    const handleWindowBlur = (): void => {
      windowFocusedRef.current = false;
    };

    const handleWindowFocus = (): void => {
      if (windowFocusedRef.current) {
        return;
      }

      windowFocusedRef.current = true;
      void refreshDirtyFileStatus({
        force: true,
        reason: "focus"
      });
      void loadRepoSyncStatuses();
      void loadRepositoryGroups();
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [loadRepoSyncStatuses, loadRepositoryGroups, refreshDirtyFileStatus]);

  const switchRepo = useCallback(async (repoPath: string, options: { addToRecents?: boolean; recentAnchorPath?: string } = {}): Promise<void> => {
    const nextRepoPath = repoPath.trim();
    if (!nextRepoPath) {
      return;
    }

    const leaving = stateRef.current;
    if (leaving.summary?.isValid && leaving.repoPath) {
      repositorySnapshots.current.set(leaving.repoPath, {
        summary: leaving.summary,
        history: leaving.history,
        historyScope: leaving.historyScope,
        selection: leaving.selection,
        activeView: leaving.activeView === "history" ? "history" : "status"
      });
    }
    const cached = repositorySnapshots.current.get(nextRepoPath);
    const changingRepositories = !isSameRepoPath(leaving.repoPath, nextRepoPath);
    if (changingRepositories) setStashComposer(emptyStashComposer);
    if (changingRepositories && leaving.repoPath) {
      void repositoryRefreshCoordinator.disposeRepository(leaving.repoPath);
    }

    if (changingRepositories && leaving.settingsOpen) {
      applyColorTheme(leaving.appSettings?.colorTheme ?? "githead");
      void window.githead.setWindowZoomFactor(leaving.appSettings?.zoomFactor ?? 1).catch(() => undefined);
    }

    const pendingTrust = pendingTrustConfirmationRef.current;
    if (pendingTrust && !isSameRepoPath(pendingTrust.repoPath, nextRepoPath)) {
      closeTrustDialog(false);
    }

    const detachedOperation = leaving.activeOperation;
    if (
      detachedOperation?.cancellable &&
      detachedOperation.repoPath &&
      isSameRepoPath(detachedOperation.repoPath, leaving.repoPath) &&
      !isSameRepoPath(detachedOperation.repoPath, nextRepoPath)
    ) {
      void window.githead.cancelGitOperation({ operationId: detachedOperation.operationId }).catch(() => undefined);
    }

    cancelRepositoryRead("diff", requestIds.current.diff);
    cancelRepositoryRead("diff-freshness", requestIds.current.diffFreshness);
    cancelRepositoryRead("history", requestIds.current.history);
    cancelRepositoryRead("commit-details", requestIds.current.commitDetails);
    cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
    cancelRepositoryRead("file-history", requestIds.current.fileHistory);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    requestIds.current.diff += 1;
    requestIds.current.diffFreshness += 1;
    requestIds.current.history += 1;
    requestIds.current.commitDetails += 1;
    requestIds.current.commitFileDiff += 1;
    requestIds.current.fileHistory += 1;
    requestIds.current.fileHistoryDiff += 1;
    requestIds.current.fileBlame += 1;
    requestIds.current.remoteConfigs += 1;
    fileStatusGenerationRef.current = 0;
    acknowledgedFileStatusGenerationRef.current = 0;

    updateState((current) => {
      const operation = current.activeOperation;
      const operationBelongsToLeavingRepo = Boolean(
        operation?.repoPath &&
        isSameRepoPath(operation.repoPath, current.repoPath) &&
        !isSameRepoPath(operation.repoPath, nextRepoPath)
      );
      const base = operationBelongsToLeavingRepo && operation
        ? clearActiveRendererOperation(current, operation)
        : current;
      const reset = resetGitHubUiState(resetHistoryState({
      ...base,
      repoPath: nextRepoPath,
      repoLoading: true,
      showSetup: false,
      setupError: "",
      safeDirectoryDialogOpen: false,
      safeDirectoryRunning: false,
      cloneError: "",
      clonePanelOpen: false,
      summary: cached?.summary ?? null,
      branchDialogOpen: false,
      branchManagerOpen: false,
      branchNameDraft: "",
      branchError: "",
      branchCheckoutTarget: null,
      worktreeDialogOpen: false,
      worktreeRemoveTarget: null,
      worktreeRemovalCheck: null,
      worktreeRemovalChecking: false,
      upstreamError: "",
      publishDialogOpen: false,
      publishRemoteDraft: "",
      publishError: "",
      pushToBranchDialog: emptyPushToBranchDialog,
      lastResult: null,
      lastOperationResult: null,
      operationButtonFeedback: null,
      pullRecovery: null,
      pullRecoveryOpen: false,
      pullRecoveryError: "",
      repositoryOperationError: "",
      commitPushSafetyNotice: null,
      commitMessageGenerationError: "",
      repositorySyncSettings: null,
      gitIdentity: null,
      gitIdentityPrompt: emptyGitIdentityPrompt,
      gitIdentitySaving: false,
      settingsOpen: changingRepositories ? false : base.settingsOpen,
      settingsDraft: changingRepositories ? emptySettingsDraft : base.settingsDraft,
      settingsError: changingRepositories ? "" : base.settingsError,
      settingsSaving: changingRepositories ? false : base.settingsSaving,
      actionManager: changingRepositories ? emptyActionManager : base.actionManager,
      remoteManager: emptyRemoteManager,
      activeView: cached?.activeView ?? (isGitHubView(current.activeView) || current.activeView === "stashes" ? "status" : current.activeView),
      selection: cached?.selection ?? null,
      diff: null,
      diffLoading: false,
      diffChanged: false
      }));
      return cached ? { ...reset, history: cached.history, historyScope: cached.historyScope, historyLoaded: cached.history.length > 0, selection: cached.selection } : reset;
    });

    await refreshRepo({
      reason: "repository-change",
      addToRecents: options.addToRecents ?? false,
      ...(options.recentAnchorPath ? { recentAnchorPath: options.recentAnchorPath } : {})
    });
  }, [closeTrustDialog, refreshRepo, repositoryRefreshCoordinator, updateState]);

  const initializeRepository = useCallback(async (): Promise<void> => {
    let repoRecents: Awaited<ReturnType<typeof window.githead.getRepoRecents>> = [];

    try {
      repoRecents = await window.githead.getRepoRecents();
    } catch (error) {
      updateState((current) => ({
        ...current,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to load recent repositories."
        }
      }));
      throw error;
    }

    updateState((current) => ({
      ...current,
      repoPath: repoRecents[0]?.lastUsedPath ?? "",
      repoRecents: repoRecents.map((recent) => recent.anchorPath),
      repoSyncStatuses: pruneRepoSyncStatusMap(repoRecents.map((recent) => recent.anchorPath), current.repoSyncStatuses),
      showSetup: repoRecents.length === 0,
      setupError: repoRecents.length === 0 ? "" : current.setupError
    }));

    void loadRepoSyncStatuses(repoRecents.map((recent) => recent.anchorPath));

    if (repoRecents.length > 0) {
      void refreshRepo({
        reason: "repository-change",
        addToRecents: false
      });
    }
  }, [loadRepoSyncStatuses, refreshRepo, updateState]);

  const loadAiSettings = useCallback(async (): Promise<void> => {
    try {
      const aiSettings = await window.githead.getAiSettings();
      updateState({
        aiSettings
      });
    } catch (error) {
      updateState((current) => ({
        ...current,
        aiSettings: null,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to load AI settings."
        }
      }));
    }
  }, [updateState]);

  const loadAppSettings = useCallback(async (): Promise<void> => {
    try {
      const appSettings = await window.githead.getAppSettings();
      publishTelemetryPreference(appSettings.privacy.shareAnonymousDiagnostics);
      updateState({
        appSettings
      });
    } catch (error) {
      updateState((current) => ({
        ...current,
        appSettings: {
          autoFetchIntervalMinutes: 10,
          colorTheme: "githead",
          appearanceMode: "system",
          uiFont: "inter",
          codeFont: "system-mono",
          zoomFactor: 1,
          statusFileViewMode: "list",
          wrapDiffLines: false,
          gitBehaviors: { tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR },
          privacy: { shareAnonymousDiagnostics: DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS }
        },
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to load app settings."
        }
      }));
    }
  }, [updateState]);

  const loadGitIdentity = useCallback(async (repoPath: string): Promise<GitIdentitySettings | null> => {
    const requestId = requestIds.current.identity + 1;
    requestIds.current.identity = requestId;
    try {
      const gitIdentity = await window.githead.getGitIdentity(repoPath);
      if (requestId !== requestIds.current.identity || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      updateState({
        gitIdentity
      });
      return gitIdentity;
    } catch (error) {
      if (requestId !== requestIds.current.identity || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      updateState((current) => ({
        ...current,
        gitIdentity: null,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to load Git identity."
        }
      }));
      return null;
    }
  }, [updateState]);

  const loadRepositorySyncSettings = useCallback(async (repoPath: string): Promise<RepositorySyncSettings | null> => {
    const requestId = requestIds.current.repositorySyncSettings + 1;
    requestIds.current.repositorySyncSettings = requestId;
    if (!repoPath) {
      updateState({ repositorySyncSettings: null });
      return null;
    }
    try {
      const repositorySyncSettings = await window.githead.getRepositorySyncSettings({ repoPath });
      if (requestId !== requestIds.current.repositorySyncSettings || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      updateState({ repositorySyncSettings });
      return repositorySyncSettings;
    } catch (error) {
      if (requestId !== requestIds.current.repositorySyncSettings || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      updateState((current) => ({
        ...current,
        repositorySyncSettings: null,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to load repository sync settings."
        }
      }));
      return null;
    }
  }, [updateState]);

  const handleRepositorySettingsSaved = useCallback((repoPath: string): void => {
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    void loadGitIdentity(repoPath);
    void loadRepositorySyncSettings(repoPath);
  }, [loadGitIdentity, loadRepositorySyncSettings]);

  const initializeApp = useCallback(async (): Promise<void> => {
    await Promise.all([
      initializeRepository(),
      loadAppSettings()
    ]);
    updateState({ startupStatus: "ready" });
  }, [initializeRepository, loadAppSettings, updateState]);

  useEffect(() => {
    if (startupStartedRef.current) return;
    startupStartedRef.current = true;
    void initializeApp().catch((error: unknown) => {
      updateState({
        startupStatus: "ready",
        showSetup: true,
        setupError: error instanceof Error ? error.message : "Unable to load recent repositories."
      });
    });
    void loadAiSettings();
  }, [initializeApp, loadAiSettings, updateState]);

  useEffect(() => {
    void loadRepositoryGroups();
  }, [loadRepositoryGroups, state.repoRecents.join("\0")]);

  useEffect(() => {
    if (!state.settingsOpen && state.appSettings) {
      applyColorTheme(state.appSettings.colorTheme);
    }
  }, [state.appSettings, state.settingsOpen]);

  useEffect(() => {
    void loadGitIdentity(state.repoPath);
    void loadRepositorySyncSettings(state.repoPath);
  }, [loadGitIdentity, loadRepositorySyncSettings, state.repoPath]);

  useEffect(() => () => {
    if (stateRef.current.repoPath) {
      void repositoryRefreshCoordinator.disposeRepository(stateRef.current.repoPath);
    }
    cancelRepositoryRead("diff", requestIds.current.diff);
    cancelRepositoryRead("history", requestIds.current.history);
    cancelRepositoryRead("commit-details", requestIds.current.commitDetails);
    cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
    cancelRepositoryRead("file-history", requestIds.current.fileHistory);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    const pendingTrust = pendingTrustConfirmationRef.current;
    pendingTrustConfirmationRef.current = null;
    pendingTrust?.resolve(false);
  }, [repositoryRefreshCoordinator]);

  const createActiveOperation = useCallback((
    label: string,
    repoPath: string,
    kind: ActiveRendererOperationKind,
    options: { cancellable?: boolean; coordinated?: boolean } = {}
  ): ActiveRendererOperation => {
    const token = ++rendererOperationTokenRef.current;
    return {
      token,
      operationId: createRendererOperationId(token),
      label,
      repoPath,
      kind,
      cancellable: options.cancellable ?? true,
      coordinated: options.coordinated ?? true,
      cancelStatus: "idle",
      cancelError: ""
    };
  }, []);

  const isActiveOperationCurrent = useCallback((token: number): boolean => (
    stateRef.current.activeOperation?.token === token
  ), []);

  const finishActiveOperation = useCallback((
    token: number,
    updater: (state: AppState) => AppState = (current) => current
  ): void => {
    updateState((current) => {
      const operation = current.activeOperation;
      if (!operation || operation.token !== token) {
        return current;
      }

      return clearActiveRendererOperation(updater(current), operation);
    });
  }, [updateState]);

  const recoverMissingOperations = useCallback((operationIds: readonly string[]): void => {
    const missingIds = new Set(operationIds);
    if (missingIds.size === 0) return;

    let refreshCurrentRepository = false;
    updateState((current) => {
      let next = current;
      const belongsToCurrentRepository = (repoPath: string): boolean => Boolean(
        repoPath && current.repoPath && isSameRepoPath(repoPath, current.repoPath)
      );
      const active = current.activeOperation;
      if (active && missingIds.has(active.operationId)) {
        refreshCurrentRepository ||= belongsToCurrentRepository(active.repoPath);
        next = clearActiveRendererOperation(next, active);
      }

      const configuredActionRuns = next.configuredActionRuns.filter((run) => {
        const missing = missingIds.has(run.operationId);
        if (missing) {
          refreshCurrentRepository ||= belongsToCurrentRepository(run.repoPath);
        }
        return !missing;
      });
      if (configuredActionRuns.length !== next.configuredActionRuns.length) {
        next = {
          ...next,
          configuredActionRuns
        };
      }

      return refreshCurrentRepository ? invalidateHistory(next) : next;
    });

    if (refreshCurrentRepository) {
      repositorySnapshots.current.delete(stateRef.current.repoPath);
      void refreshRepo({ reason: "operation", silent: true });
      void loadRepoSyncStatuses();
    }
  }, [loadRepoSyncStatuses, refreshRepo, updateState]);

  const coordinatedOperationKey = [
    ...(state.activeOperation?.coordinated ? [state.activeOperation.operationId] : []),
    ...state.configuredActionRuns.map((run) => run.operationId)
  ].join("\0");

  useEffect(() => {
    if (!coordinatedOperationKey) return;
    const operationIds = coordinatedOperationKey.split("\0");

    let stopped = false;
    let timer: number | undefined;
    const checkOperationStates = async (): Promise<void> => {
      try {
        const states = await window.githead.getGitOperationStates({
          operationIds
        });
        if (stopped) return;
        const missingIds = states
          .filter((result) => result.state === "not-found")
          .map((result) => result.operationId);
        recoverMissingOperations(missingIds);
      } catch {
        // The invoke result remains the primary completion path. A failed state
        // check must not release an operation that can still mutate the repository.
      } finally {
        if (!stopped) {
          timer = window.setTimeout(checkOperationStates, OPERATION_RECONCILE_INTERVAL_MS);
        }
      }
    };

    timer = window.setTimeout(checkOperationStates, OPERATION_RECONCILE_INITIAL_DELAY_MS);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [coordinatedOperationKey, recoverMissingOperations]);

  useEffect(() => {
    if (!state.summary?.isValid) {
      acknowledgedFileStatusGenerationRef.current = fileStatusGenerationRef.current;
      void window.githead.unwatchRepoChanges(state.repoPath).catch(() => undefined);
      return;
    }

    const watchedRepoPath = state.summary.repoPath;
    void window.githead.watchRepoChanges(watchedRepoPath).catch(() => {
      fileStatusGenerationRef.current += 1;
    });

    return () => {
      void window.githead.unwatchRepoChanges(watchedRepoPath).catch(() => undefined);
    };
  }, [state.repoPath, state.summary?.isValid, state.summary?.repoPath]);

  const chooseRepo = useCallback(async (): Promise<void> => {
    const repoPath = await window.githead.chooseRepo(stateRef.current.repoPath);
    if (!repoPath) {
      return;
    }

    await switchRepo(repoPath, {
      addToRecents: true
    });
  }, [switchRepo]);

  const openSafeDirectoryDialog = useCallback((): void => {
    const safeDirectory = stateRef.current.summary?.safeDirectory;
    if (!safeDirectory?.required || isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      safeDirectoryDialogOpen: true,
      setupError: ""
    });
  }, [updateState]);

  const closeSafeDirectoryDialog = useCallback((): void => {
    if (stateRef.current.safeDirectoryRunning) {
      return;
    }

    updateState({
      safeDirectoryDialogOpen: false
    });
  }, [updateState]);

  const allowSafeDirectory = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const safeDirectory = current.summary?.safeDirectory;
    if (!safeDirectory?.required || current.safeDirectoryRunning) {
      return;
    }

    const operation = createActiveOperation(
      "Adding safe directory",
      safeDirectory.path,
      "safe-directory"
    );
    updateState({
      activeOperation: operation,
      safeDirectoryRunning: true,
      setupError: ""
    });

    try {
      const result = await window.githead.addSafeDirectory({
        repoPath: safeDirectory.path,
        operationId: operation.operationId
      });

      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }

      if (result.exitCode !== 0) {
        finishActiveOperation(operation.token, (latest) => ({
          ...latest,
          safeDirectoryDialogOpen: false,
          setupError: getOperationFailureMessage(result, "Unable to add Git safe.directory exception.")
        }));
        return;
      }

      finishActiveOperation(operation.token, (latest) => ({
        ...latest,
        safeDirectoryDialogOpen: false
      }));
      void refreshRepo({ reason: "operation", addToRecents: true });
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      finishActiveOperation(operation.token, (latest) => ({
        ...latest,
        safeDirectoryDialogOpen: false,
        setupError: error instanceof Error ? error.message : "Unable to add Git safe.directory exception."
      }));
    }
  }, [createActiveOperation, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

  const chooseCloneParent = useCallback(async (): Promise<void> => {
    const parentPath = await window.githead.chooseCloneParent(stateRef.current.cloneDraft.parentPath);
    if (!parentPath) {
      return;
    }

    updateState((current) => ({
      ...current,
      cloneDraft: {
        ...current.cloneDraft,
        parentPath
      },
      cloneError: ""
    }));
  }, [updateState]);

  const updateCloneDraft = useCallback((cloneDraft: CloneDraft): void => {
    updateState({
      cloneDraft,
      cloneError: ""
    });
  }, [updateState]);

  const resetCloneCheckState = useCallback((): void => {
    updateState({
      cloneCheckStatus: "idle",
      cloneCheckMessage: "",
      cloneBranches: []
    });
  }, [updateState]);

  const setClonePanelOpen = useCallback((clonePanelOpen: boolean): void => {
    const current = stateRef.current;
    if (!clonePanelOpen && (current.cloneRunning || current.cloneCheckRunning)) {
      return;
    }

    updateState({
      clonePanelOpen
    });
  }, [updateState]);

  const checkRepositoryAccess = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (isOperationRunning(current)) {
      return;
    }

    const source = current.cloneDraft.source;
    const operation = createActiveOperation(
      "Checking repository access",
      current.repoPath,
      "clone-check"
    );

    updateState({
      activeOperation: operation,
      cloneCheckRunning: true,
      cloneCheckStatus: "idle",
      cloneCheckMessage: "",
      cloneBranches: [],
      cloneError: ""
    });

    try {
      const result = await window.githead.checkRepositoryAccess({
        source,
        operationId: operation.operationId
      });

      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }

      if (result.exitCode !== 0) {
        updateState({
          cloneCheckStatus: "error",
          cloneCheckMessage: getRepositoryAccessCheckFailureMessage(result),
          cloneBranches: []
        });
        return;
      }

      updateState((latest) => ({
        ...latest,
        cloneDraft: {
          ...latest.cloneDraft,
          branchName: latest.cloneDraft.branchName.trim() || result.defaultBranch || latest.cloneDraft.branchName
        },
        cloneCheckStatus: "success",
        cloneCheckMessage: "Repository is accessible.",
        cloneBranches: result.branches
      }));
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      updateState({
        cloneCheckStatus: "error",
        cloneCheckMessage: error instanceof Error ? error.message : "Unable to check repository access.",
        cloneBranches: []
      });
    } finally {
      finishActiveOperation(operation.token);
    }
  }, [createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const cloneRepository = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (isOperationRunning(current)) {
      return;
    }

    const depthText = current.cloneDraft.depth.trim();
    const requestedDepth = depthText ? Number(depthText) : null;
    if (requestedDepth !== null && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
      updateState({
        cloneError: "Clone depth must be 0 or a positive whole number."
      });
      return;
    }
    const depth = requestedDepth && requestedDepth > 0 ? requestedDepth : null;
    const submittedDraft = current.cloneDraft;
    const operation = createActiveOperation(
      "Cloning repository",
      current.repoPath,
      "clone"
    );

    updateState({
      activeOperation: operation,
      cloneRunning: true,
      cloneError: "",
      lastOperationResult: null
    });

    try {
      const result = await window.githead.cloneRepository({
        source: current.cloneDraft.source,
        parentPath: current.cloneDraft.parentPath,
        directoryName: current.cloneDraft.directoryName,
        branchName: current.cloneDraft.branchName,
        depth,
        recurseSubmodules: current.cloneDraft.recurseSubmodules,
        operationId: operation.operationId
      });
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      updateState({
        lastOperationResult: result
      });
      appendOperationLog("Cloning repository", result);

      if (result.exitCode !== 0) {
        updateState({
          cloneError: getOperationFailureMessage(result, "Unable to clone repository.")
        });
        return;
      }

      finishActiveOperation(operation.token);

      await switchRepo(result.repoPath, {
        addToRecents: true
      });
      updateState((latest) => {
        const draftStillBelongsToThisClone =
          latest.cloneDraft.source === submittedDraft.source &&
          latest.cloneDraft.parentPath === submittedDraft.parentPath &&
          latest.cloneDraft.directoryName === submittedDraft.directoryName &&
          latest.cloneDraft.branchName === submittedDraft.branchName &&
          latest.cloneDraft.depth === submittedDraft.depth &&
          latest.cloneDraft.recurseSubmodules === submittedDraft.recurseSubmodules;
        if (!isSameRepoPath(latest.repoPath, result.repoPath) || !draftStillBelongsToThisClone) {
          return latest;
        }
        return {
          ...latest,
          cloneDraft: emptyCloneDraft,
          cloneError: "",
          cloneCheckStatus: "idle",
          cloneCheckMessage: "",
          cloneBranches: [],
          clonePanelOpen: false
        };
      });
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      const result: GitOperationResult = {
        repoPath: stateRef.current.cloneDraft.parentPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unable to clone repository."
      };
      updateState({
        lastOperationResult: result,
        cloneError: result.stderr
      });
      appendOperationLog("Cloning repository", result);
    } finally {
      finishActiveOperation(operation.token);
    }
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, switchRepo, updateState]);

  const selectRecentRepo = useCallback(async (repoPath: string): Promise<void> => {
    if (isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    const group = stateRef.current.repositoryGroups.find((candidate) =>
      isSameRepoPath(candidate.anchorPath, repoPath)
      || isSameRepoPath(candidate.lastUsedPath, repoPath)
      || candidate.worktrees.some((worktree) => isSameRepoPath(worktree.path, repoPath)));
    await switchRepo(repoPath, {
      addToRecents: true,
      ...(group ? { recentAnchorPath: group.anchorPath } : {})
    });
  }, [switchRepo]);

  const removeRecentRepo = useCallback(async (repoPath: string): Promise<void> => {
    try {
      const recents = await window.githead.removeRepoRecent(repoPath);
      const repoRecents = recents.map((recent) => recent.anchorPath);
      updateState({
        repoRecents,
        repoSyncStatuses: pruneRepoSyncStatusMap(repoRecents, stateRef.current.repoSyncStatuses)
      });
      void loadRepoSyncStatuses(repoRecents);
    } catch (error) {
      updateState((current) => ({
        ...current,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to remove recent repository."
        }
      }));
    }
  }, [updateState]);

  const recoverRecentRepo = useCallback(async (repoPath: string): Promise<RepositoryRecoveryResult> => {
    try {
      const replacementRepoPath = await window.githead.chooseRepo(repoPath);
      if (!replacementRepoPath) {
        return { status: "cancelled" };
      }

      const [replacementStatus] = await window.githead.getRepoSyncStatuses([replacementRepoPath]);
      if (!replacementStatus?.isValid) {
        return {
          status: "error",
          message: replacementStatus?.error || "The selected folder is not a valid repository."
        };
      }

      const recents = await window.githead.replaceRepoRecent({
        repoPath,
        replacementRepoPath
      });
      const repoRecents = recents.map((recent) => recent.anchorPath);
      updateState((current) => ({
        ...current,
        repoRecents,
        repoSyncStatuses: createRepoSyncStatusMap(repoRecents, [replacementStatus], current.repoSyncStatuses)
      }));
      void loadRepoSyncStatuses(repoRecents);
      await switchRepo(replacementRepoPath);
      return { status: "success" };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to update the repository location."
      };
    }
  }, [loadRepoSyncStatuses, switchRepo, updateState]);

  const reorderRepositories = useCallback(async (repoPaths: string[]): Promise<void> => {
    const previousRepoRecents = stateRef.current.repoRecents;
    updateState({
      repoRecents: repoPaths
    });

    try {
      const recents = await window.githead.reorderRepoRecents(repoPaths);
      const repoRecents = recents.map((recent) => recent.anchorPath);
      updateState({
        repoRecents,
        repoSyncStatuses: pruneRepoSyncStatusMap(repoRecents, stateRef.current.repoSyncStatuses)
      });
      void loadRepoSyncStatuses(repoRecents);
    } catch (error) {
      updateState((current) => ({
        ...current,
        repoRecents: previousRepoRecents,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to reorder repositories."
        }
      }));
    }
  }, [updateState]);

  const createTrustFailure = useCallback((repoPath: string): GitOperationResult => ({
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr: `${TRUST_WORKSPACE_TITLE} ${TRUST_WORKSPACE_DESCRIPTION}`
  }), []);

  const ensureTrustedRepo = useCallback(async (
    expectedRepoPath?: string,
    isRequestCurrent: () => boolean = () => true,
    requireActiveRepository = true
  ): Promise<boolean> => {
    const repoPath = expectedRepoPath ?? stateRef.current.repoPath;
    const requestIsCurrent = (): boolean => isRequestCurrent()
      && (!requireActiveRepository || isSameRepoPath(repoPath, stateRef.current.repoPath));
    if (!repoPath.trim() || !requestIsCurrent()) {
      return false;
    }

    try {
      const existingTrust = await window.githead.getRepoTrust({ repoPath });
      if (!requestIsCurrent()) {
        return false;
      }
      if (existingTrust.trusted) {
        return true;
      }

      if (!(await confirmWorkspaceTrust(repoPath))) {
        if (requestIsCurrent()) {
          updateState({
            lastOperationResult: createTrustFailure(repoPath)
          });
        }
        return false;
      }

      if (!requestIsCurrent()) {
        return false;
      }

      const nextTrust: RepoTrustResult = await window.githead.addRepoTrust({ repoPath });
      if (!requestIsCurrent()) {
        return false;
      }
      if (nextTrust.trusted) {
        return true;
      }

      updateState({
        lastOperationResult: createTrustFailure(repoPath)
      });
      return false;
    } catch (error) {
      if (requestIsCurrent()) {
        updateState({
          lastOperationResult: {
            repoPath,
            exitCode: -1,
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unable to update repository trust."
          }
        });
      }
      return false;
    }
  }, [confirmWorkspaceTrust, createTrustFailure, updateState]);

  const saveRepositoryGitIdentity = useCallback(async (
    request: Parameters<typeof window.githead.saveGitIdentity>[0]
  ): Promise<GitIdentitySettings> => {
    if (!(await ensureTrustedRepo(request.repoPath, () => true, false))) {
      throw new Error("Trust this repository before changing its Git identity.");
    }
    return window.githead.saveGitIdentity(request);
  }, [ensureTrustedRepo]);

  const isInvocationCurrent = useCallback((repoPath: string, predicate?: (state: AppState) => boolean): boolean => {
    const latest = stateRef.current;
    return isSameRepoPath(repoPath, latest.repoPath)
      && Boolean(latest.summary?.isValid)
      && !isOperationRunning(latest)
      && (predicate?.(latest) ?? true);
  }, []);

  const runAction = useCallback(async (
    action: GitAction,
    pushTarget?: GitPushTarget,
    feedbackSurface: OperationButtonFeedbackSurface = "action-bar"
  ): Promise<GitRunResult | null> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return null;
    }

    if (action === "push" && !pushTarget && shouldPublishInsteadOfPush(current.summary)) {
      updateState({
        publishDialogOpen: true,
        publishRemoteDraft: getDefaultPublishRemote(current.summary),
        publishError: ""
      });
      return null;
    }

    const repoPath = current.repoPath;

    if (!(await ensureTrustedRepo(repoPath))) {
      return null;
    }

    const latestBeforeStart = stateRef.current;
    if (
      !isSameRepoPath(repoPath, latestBeforeStart.repoPath) ||
      !latestBeforeStart.summary?.isValid ||
      isOperationRunning(latestBeforeStart)
    ) {
      return null;
    }

    let completedResult: GitRunResult | null = null;
    const operation = createActiveOperation(capitalize(action), repoPath, "action");
    if (!hasProcessRunInFlight(latestBeforeStart)) activityLogStore.clear();
    updateState((latest) => ({
      ...latest,
      activeOperation: operation,
      runningAction: action,
      lastResult: null,
      operationButtonFeedback: null
    }));

    try {
      const request = action === "push"
        ? pushTarget
          ? { repoPath, action, pushTarget, operationId: operation.operationId }
          : { repoPath, action, operationId: operation.operationId }
        : { repoPath, action, operationId: operation.operationId };
      const lastResult = await window.githead.runGitAction(request);
      if (!isActiveOperationCurrent(operation.token)) {
        return completedResult;
      }
      activityLogStore.markOperationOutcome(lastResult.exitCode !== 0);
      updateState({
        lastResult,
        operationButtonFeedback: createOperationButtonFeedbackEvent(
          action,
          operation.operationId,
          repoPath,
          feedbackSurface,
          lastResult.exitCode === 0 ? "success" : "error"
        ),
        ...(lastResult.pullRecovery ? {
          pullRecovery: lastResult.pullRecovery,
          pullRecoveryOpen: true,
          pullRecoveryError: ""
        } : {})
      });
      completedResult = lastResult;
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token)) {
        return completedResult;
      }
      const message = error instanceof Error ? error.message : "Git command failed.";
      const rendererResult: GitRunResult = {
        runId: "renderer-error",
        action,
        repoPath: stateRef.current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: message,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString()
      };
      completedResult = rendererResult;
      activityLogStore.markOperationOutcome(true);
      updateState((latest) => ({
        ...latest,
        lastResult: {
          ...rendererResult,
          repoPath: latest.repoPath
        },
        operationButtonFeedback: createOperationButtonFeedbackEvent(
          action,
          operation.operationId,
          repoPath,
          feedbackSurface,
          "error"
        )
      }));
      appendSystemLine(message);
    } finally {
      finishActiveOperation(operation.token, invalidateHistory);
      if (isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        await refreshRepo({ reason: "operation" });
      }
      if (
        isSameRepoPath(repoPath, stateRef.current.repoPath) &&
        action === "push" &&
        !pushTarget &&
        completedResult &&
        completedResult.exitCode !== 0 &&
        shouldOfferPublishAfterFailedPush(completedResult, stateRef.current.summary)
      ) {
        const summary = stateRef.current.summary;
        updateState({
          publishDialogOpen: true,
          publishRemoteDraft: summary ? getDefaultPublishRemote(summary) : "",
          publishError: "This branch has no upstream. Publish it to set one."
        });
      }
    }
    return isSameRepoPath(repoPath, stateRef.current.repoPath) ? completedResult : null;
  }, [activityLogStore, appendSystemLine, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

  const runAutomaticFetch = useCallback(async (): Promise<void> => {
    if (autoFetchInFlightRef.current) {
      return;
    }

    autoFetchInFlightRef.current = true;
    let repoPath = "";
    let fetchStarted = false;
    let operation: ActiveRendererOperation | null = null;
    let completedResult: GitRunResult | null = null;
    try {
      const current = stateRef.current;
      const summary = current.summary;
      if (
        !summary?.isValid ||
        !summary.capabilities.fetch ||
        !hasFetchRemote(summary) ||
        isOperationRunning(current) ||
        repoRefreshInFlightRef.current
      ) {
        return;
      }

      repoPath = summary.repoPath;
      const trust = await window.githead.getRepoTrust({
        repoPath
      });
      const latest = stateRef.current;
      if (
        !trust.trusted ||
        !isSameRepoPath(repoPath, latest.summary?.repoPath ?? "") ||
        isOperationRunning(latest) ||
        repoRefreshInFlightRef.current
      ) {
        return;
      }

      operation = createActiveOperation("Fetch", repoPath, "action");
      updateState({
        activeOperation: operation,
        runningAction: "fetch"
      });
      fetchStarted = true;

      const lastResult = await window.githead.runGitAction({
        repoPath,
        action: "fetch",
        operationId: operation.operationId
      });
      completedResult = lastResult;
      if (
        isActiveOperationCurrent(operation.token) &&
        isSameRepoPath(repoPath, stateRef.current.summary?.repoPath ?? "")
      ) {
        updateState({
          lastResult
        });
      }
    } catch (error) {
      if (
        operation &&
        isActiveOperationCurrent(operation.token) &&
        isSameRepoPath(repoPath, stateRef.current.summary?.repoPath ?? "")
      ) {
        const message = error instanceof Error ? error.message : "Git command failed.";
        updateState((latest) => ({
          ...latest,
          lastResult: {
            runId: "renderer-error",
            action: "fetch",
            repoPath: latest.repoPath,
            exitCode: -1,
            stdout: "",
            stderr: message,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString()
          }
        }));
      }
    } finally {
      autoFetchInFlightRef.current = false;
      if (fetchStarted && operation) {
        finishActiveOperation(
          operation.token,
          completedResult?.exitCode === 0 ? invalidateHistory : (latest) => latest
        );
      }
      if (fetchStarted && repoPath && isSameRepoPath(repoPath, stateRef.current.summary?.repoPath ?? "")) {
        await refreshRepo({
          reason: "operation",
          silent: true
        });
        void loadRepoSyncStatuses();
      }
    }
  }, [createActiveOperation, finishActiveOperation, isActiveOperationCurrent, loadRepoSyncStatuses, refreshRepo, updateState]);

  const autoFetchRepoPath = state.summary?.isValid && state.summary.capabilities.fetch && hasFetchRemote(state.summary)
    ? state.summary.repoPath
    : "";

  useEffect(() => {
    const intervalMinutes = state.repositorySyncSettings?.enabled
      ? state.repositorySyncSettings.autoFetchIntervalMinutes
      : state.appSettings?.autoFetchIntervalMinutes;
    if (intervalMinutes === undefined || intervalMinutes <= 0 || !autoFetchRepoPath) {
      return;
    }

    const timer = window.setInterval(() => {
      void runAutomaticFetch();
    }, intervalMinutes * 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    autoFetchRepoPath,
    runAutomaticFetch,
    state.appSettings?.autoFetchIntervalMinutes,
    state.repositorySyncSettings?.autoFetchIntervalMinutes,
    state.repositorySyncSettings?.enabled
  ]);

  const runConfiguredAction = useCallback(async (action: GitConfiguredAction): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid) {
      return;
    }

    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      return;
    }

    if (!isInvocationCurrent(repoPath)) {
      return;
    }
    const invocation: ConfiguredActionRun = {
      id: ++configuredActionRunIdRef.current,
      name: action.name,
      repoPath,
      operationId: createRendererOperationId(++rendererOperationTokenRef.current),
      cancelStatus: "idle",
      cancelError: ""
    };
    if (!hasProcessRunInFlight(current)) activityLogStore.clear();
    updateState((latest) => ({
      ...latest,
      configuredActionRuns: [...latest.configuredActionRuns, invocation],
      lastResult: null,
      activeView: "activity"
    }));
    const invocationIsTracked = (): boolean => stateRef.current.configuredActionRuns.some((run) => (
      run.id === invocation.id && run.operationId === invocation.operationId
    ));

    try {
      const lastResult = await window.githead.runConfiguredAction({
        repoPath,
        name: action.name,
        operationId: invocation.operationId
      });
      if (!invocationIsTracked()) return;
      updateState((latest) => isSameRepoPath(repoPath, latest.repoPath) ? {
        ...latest,
        lastResult
      } : latest);
    } catch (error) {
      if (!invocationIsTracked()) return;
      const message = error instanceof Error ? error.message : "Configured action failed.";
      updateState((latest) => isSameRepoPath(repoPath, latest.repoPath) ? {
        ...latest,
        lastResult: {
          runId: "renderer-error",
          action: action.name,
          repoPath,
          exitCode: -1,
          stdout: "",
          stderr: message,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString()
        }
      } : latest);
      appendSystemLine(message, {
        runId: `renderer-${invocation.id}`,
        action: action.name
      });
    } finally {
      const completionIsTracked = invocationIsTracked();
      if (completionIsTracked) {
        updateState((latest) => {
          const next = {
            ...latest,
            configuredActionRuns: latest.configuredActionRuns.filter((run) => run.id !== invocation.id)
          };
          return isSameRepoPath(repoPath, latest.repoPath) ? invalidateHistory(next) : next;
        });
        if (isSameRepoPath(repoPath, stateRef.current.repoPath)) {
          void refreshRepo({ reason: "operation" });
        }
      }
    }
  }, [activityLogStore, appendSystemLine, ensureTrustedRepo, isInvocationCurrent, refreshRepo, updateState]);

  const openActionManager = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid) {
      return;
    }

    updateState({
      actionManager: {
        open: true,
        draft: createRepositoryActionManagerDraft(current.summary),
        savingTarget: null,
        error: ""
      }
    });
  }, [updateState]);

  const closeActionManager = useCallback((): void => {
    if (stateRef.current.actionManager.savingTarget) {
      return;
    }

    updateState({
      actionManager: emptyActionManager
    });
  }, [updateState]);

  const updateActionManagerDraft = useCallback((
    target: GitConfiguredActionFile,
    index: number,
    patch: Partial<GitConfiguredAction>
  ): void => {
    updateState((current) => ({
      ...current,
      actionManager: {
        ...current.actionManager,
        error: "",
        draft: {
          ...current.actionManager.draft,
          [target]: current.actionManager.draft[target].map((action, actionIndex) => (
            actionIndex === index
              ? {
                  ...action,
                  ...patch
                }
              : action
          ))
        }
      }
    }));
  }, [updateState]);

  const addRepositoryAction = useCallback((target: GitConfiguredActionFile): void => {
    updateState((current) => ({
      ...current,
      actionManager: {
        ...current.actionManager,
        error: "",
        draft: {
          ...current.actionManager.draft,
          [target]: [
            ...current.actionManager.draft[target],
            createEmptyRepositoryActionDraft()
          ]
        }
      }
    }));
  }, [updateState]);

  const deleteRepositoryAction = useCallback((target: GitConfiguredActionFile, index: number): void => {
    updateState((current) => ({
      ...current,
      actionManager: {
        ...current.actionManager,
        error: "",
        draft: {
          ...current.actionManager.draft,
          [target]: current.actionManager.draft[target].filter((_, actionIndex) => actionIndex !== index)
        }
      }
    }));
  }, [updateState]);

  const restoreRepositoryAction = useCallback((
    target: GitConfiguredActionFile,
    index: number,
    action: RepositoryActionDraft
  ): void => {
    updateState((current) => {
      const actions = [...current.actionManager.draft[target]];
      actions.splice(Math.min(index, actions.length), 0, action);
      return {
        ...current,
        actionManager: {
          ...current.actionManager,
          error: "",
          draft: {
            ...current.actionManager.draft,
            [target]: actions
          }
        }
      };
    });
  }, [updateState]);

  const moveRepositoryAction = useCallback((target: GitConfiguredActionFile, index: number, direction: -1 | 1): void => {
    updateState((current) => {
      const actions = [
        ...current.actionManager.draft[target]
      ];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= actions.length) {
        return current;
      }

      const [action] = actions.splice(index, 1);
      if (!action) {
        return current;
      }

      actions.splice(nextIndex, 0, action);
      return {
        ...current,
        actionManager: {
          ...current.actionManager,
          error: "",
          draft: {
            ...current.actionManager.draft,
            [target]: actions
          }
        }
      };
    });
  }, [updateState]);

  const saveRepositoryActions = useCallback(async (target: GitConfiguredActionFile): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || current.actionManager.savingTarget) {
      return;
    }

    const actions = stripRepositoryActionDrafts(current.actionManager.draft[target]);
    const validationError = validateRepositoryActionDrafts(target, actions);
    if (validationError) {
      updateState({
        actionManager: {
          ...current.actionManager,
          error: validationError
        }
      });
      return;
    }

    const saveToken = ++actionManagerSaveTokenRef.current;
    const operation = createActiveOperation(
      `Saving ${target} actions`,
      current.repoPath,
      "action-save"
    );

    updateState({
      activeOperation: operation,
      actionManager: {
        ...current.actionManager,
        savingTarget: target,
        error: ""
      }
    });

    try {
      const result = await window.githead.saveConfiguredActions({
        repoPath: current.repoPath,
        target,
        actions,
        operationId: operation.operationId
      });
      if (saveToken !== actionManagerSaveTokenRef.current || !isActiveOperationCurrent(operation.token)) {
        return;
      }
      if (result.exitCode !== 0) {
        finishActiveOperation(operation.token, (latest) => ({
          ...latest,
          actionManager: {
            ...latest.actionManager,
            error: result.stderr || "Unable to save Repository Actions."
          }
        }));
        return;
      }

      finishActiveOperation(operation.token, (latest) => ({
        ...latest,
        actionManager: {
          ...latest.actionManager,
          error: ""
        }
      }));
      void refreshRepo({ reason: "operation" });
    } catch (error) {
      if (saveToken !== actionManagerSaveTokenRef.current || !isActiveOperationCurrent(operation.token)) {
        return;
      }
      finishActiveOperation(operation.token, (latest) => ({
        ...latest,
        actionManager: {
          ...latest.actionManager,
          error: error instanceof Error ? error.message : "Unable to save Repository Actions."
        }
      }));
    }
  }, [createActiveOperation, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

  const runRepoOperation = useCallback(async (
    label: string,
    nextSelection: FileSelection | null | undefined,
    operation: (operationId: string) => Promise<GitOperationResult>,
    options: {
      requireValidRepo?: boolean;
      cancellable?: boolean;
      successFeedback?: { action: "commit" | "push"; surface: OperationButtonFeedbackSurface };
      refreshAfter?: boolean;
    } = {}
  ): Promise<GitOperationResult | null> => {
    const current = stateRef.current;
    if ((options.requireValidRepo ?? true) && !current.summary?.isValid) {
      return null;
    }
    if (isOperationRunning(current)) {
      return null;
    }

    repositorySnapshots.current.delete(current.repoPath);
    const repoPath = current.repoPath;
    const activeOperation = createActiveOperation(label, repoPath, "repo-operation", {
      cancellable: options.cancellable ?? true
    });

    let operationResult: GitOperationResult | null = null;

    updateState({
      activeOperation,
      runningOperation: label,
      lastOperationResult: null,
      ...(options.successFeedback ? { operationButtonFeedback: null } : {})
    });

    try {
      const lastOperationResult = await operation(activeOperation.operationId);
      if (
        !isActiveOperationCurrent(activeOperation.token) ||
        !isSameRepoPath(repoPath, stateRef.current.repoPath)
      ) {
        return null;
      }
      operationResult = lastOperationResult;
      updateState({
        lastOperationResult,
        ...(options.successFeedback ? {
          operationButtonFeedback: createOperationButtonFeedbackEvent(
            options.successFeedback.action,
            activeOperation.operationId,
            repoPath,
            options.successFeedback.surface,
            lastOperationResult.exitCode === 0 ? "success" : "error"
          )
        } : {})
      });
      appendOperationLog(label, lastOperationResult);
    } catch (error) {
      if (
        !isActiveOperationCurrent(activeOperation.token) ||
        !isSameRepoPath(repoPath, stateRef.current.repoPath)
      ) {
        return null;
      }
      const lastOperationResult: GitOperationResult = {
        repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : `${label} failed.`
      };
      operationResult = lastOperationResult;
      updateState({
        lastOperationResult,
        ...(options.successFeedback ? {
          operationButtonFeedback: createOperationButtonFeedbackEvent(
            options.successFeedback.action,
            activeOperation.operationId,
            repoPath,
            options.successFeedback.surface,
            "error"
          )
        } : {})
      });
      appendOperationLog(label, lastOperationResult);
    } finally {
      const completionIsCurrent = isActiveOperationCurrent(activeOperation.token) &&
        isSameRepoPath(repoPath, stateRef.current.repoPath);
      if (completionIsCurrent) finishActiveOperation(activeOperation.token, (latest) => {
        let next = latest;

        if (operationResult?.exitCode === 0 && nextSelection !== undefined) {
          next = {
            ...next,
            selection: nextSelection,
            diff: null,
            diffChanged: false
          };
        }

        if (operationResult?.exitCode === 0) {
          next = invalidateHistory(next);
        }

        return next;
      });
      if (completionIsCurrent && options.refreshAfter !== false) {
        void refreshRepo({ reason: "operation" });
      }
    }
    return operationResult;
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

  const runIntegration = useCallback(async (request: GitIntegrationExecuteRequest): Promise<GitIntegrationResult | null> => {
    const current = stateRef.current;
    const repoPath = current.repoPath;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return null;
    if (!(await ensureTrustedRepo(repoPath))) return null;
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    const label = request.kind === "merge" ? "Merging branch" : request.kind === "rebase" ? "Rebasing branch" : "Cherry-picking commit";
    const result = await runRepoOperation(label, undefined, (operationId) => window.githead.runIntegration({ ...request, operationId })) as GitIntegrationResult | null;
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return result;
    if (result.operationState) {
      updateState((latest) => ({
        ...latest,
        summary: latest.summary ? { ...latest.summary, operationState: result.operationState } : latest.summary,
        repositoryOperationError: ""
      }));
    }
    if (result.forceWithLease) setForceLeaseOffer(result.forceWithLease);
    if (result.outcome === "staged") updateState({ activeView: "status" });
    return result;
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const publishRebasedBranch = useCallback(async (): Promise<void> => {
    const offer = forceLeaseOffer;
    const repoPath = stateRef.current.repoPath;
    if (!offer || isOperationRunning(stateRef.current)) return;
    const result = await runRepoOperation("Publishing rewritten branch with force-with-lease", undefined, (operationId) => window.githead.pushWithForceLease({
      repoPath,
      ...offer,
      operationId
    }));
    if (result?.exitCode === 0) setForceLeaseOffer(null);
  }, [forceLeaseOffer, runRepoOperation]);

  const createStash = useCallback(async (draft: StashCreateDraft): Promise<string | null> => {
    const current = stateRef.current;
    const repoPath = current.repoPath;
    if (!current.summary?.isValid || !current.summary.capabilities.stashes) return "Select a Git repository first.";
    if (isOperationRunning(current)) return "Wait for the current repository operation to finish.";
    if (!(await ensureTrustedRepo(repoPath))) return "Repository trust is required before creating a stash.";
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return "The active repository changed.";

    const result = await runRepoOperation("Creating stash", null, (operationId) => window.githead.createStash({
      repoPath,
      ...draft,
      operationId
    }));
    if (result?.exitCode !== 0) return getOperationFailureMessage(result, "Unable to create the stash.");
    setStashComposer(emptyStashComposer);
    await stashWorkspace.refresh();
    return null;
  }, [ensureTrustedRepo, runRepoOperation, stashWorkspace.refresh]);

  const runStashMutation = useCallback(async (
    label: string,
    operation: (repoPath: string, operationId: string) => Promise<GitOperationResult>
  ): Promise<string | null> => {
    const current = stateRef.current;
    const repoPath = current.repoPath;
    if (!current.summary?.isValid || !current.summary.capabilities.stashes) return "Select a Git repository first.";
    if (isOperationRunning(current)) return "Wait for the current repository operation to finish.";
    if (!(await ensureTrustedRepo(repoPath))) return `Repository trust is required before ${label.toLowerCase()}.`;
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return "The active repository changed.";
    const result = await runRepoOperation(label, undefined, (operationId) => operation(repoPath, operationId));
    if (result?.exitCode !== 0) return getOperationFailureMessage(result, `${label} failed.`);
    await stashWorkspace.refresh();
    return null;
  }, [ensureTrustedRepo, runRepoOperation, stashWorkspace.refresh]);

  const applyStash = useCallback((stashRef: string): void => {
    void runStashMutation("Applying stash", (repoPath, operationId) => window.githead.applyStash({ repoPath, stashRef, operationId }));
  }, [runStashMutation]);

  const popStash = useCallback((stashRef: string): void => {
    void runStashMutation("Popping stash", (repoPath, operationId) => window.githead.popStash({ repoPath, stashRef, operationId }));
  }, [runStashMutation]);

  const dropStash = useCallback((stashRef: string): Promise<string | null> =>
    runStashMutation("Deleting stash", (repoPath, operationId) => window.githead.dropStash({ repoPath, stashRef, operationId })), [runStashMutation]);

  const createBranchFromStash = useCallback((stashRef: string, branchName: string): Promise<string | null> =>
    runStashMutation("Creating branch from stash", (repoPath, operationId) => window.githead.createBranchFromStash({ repoPath, stashRef, branchName, operationId })), [runStashMutation]);

  const resolvePullRecovery = useCallback(async (action: GitPullRecoveryAction): Promise<void> => {
    const current = stateRef.current;
    const recovery = current.pullRecovery;
    if (!recovery || isOperationRunning(current)) return;
    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) return;
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath) || stateRef.current.pullRecovery?.branchName !== recovery.branchName) return;

    updateState({ pullRecoveryError: "" });
    const result = await runRepoOperation(
      action === "continue" ? "Continuing pull recovery" : action === "abort" ? "Aborting pull recovery" : "Resolving remote history",
      undefined,
      (operationId) => window.githead.resolvePullRecovery({
        repoPath,
        branchName: recovery.branchName,
        action,
        operationId
      })
    ) as GitPullRecoveryResult | null;
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;

    updateState((latest) => ({
      ...latest,
      pullRecovery: result.recovery,
      pullRecoveryOpen: result.outcome !== "complete",
      pullRecoveryError: result.exitCode === 0 ? "" : result.stderr.trim() || "Unable to resolve the remote history change."
    }));
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const resolveRepositoryOperation = useCallback(async (action: GitRepositoryOperationAction): Promise<void> => {
    const current = stateRef.current;
    const operationState = current.summary?.operationState;
    if (!operationState || isOperationRunning(current)) return;
    const availability = operationState.actions[action];
    if (!availability.supported || !availability.enabled) return;
    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) return;
    if (
      !isSameRepoPath(repoPath, stateRef.current.repoPath) ||
      stateRef.current.summary?.operationState?.stateId !== operationState.stateId
    ) return;

    updateState({ repositoryOperationError: "" });
    const actionLabel = action === "continue"
      ? "Continuing"
      : action === "skip"
        ? "Skipping"
        : action === "keep-empty"
          ? "Keeping empty commit for"
          : "Aborting";
    const result = await runRepoOperation(
      `${actionLabel} ${operationState.kind}`,
      undefined,
      (operationId) => window.githead.resolveRepositoryOperation({
        repoPath,
        expectedKind: operationState.kind,
        expectedStateId: operationState.stateId,
        action,
        operationId
      })
    ) as GitRepositoryOperationActionResult | null;
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;

    let pullRecovery = stateRef.current.pullRecovery;
    if (operationState.kind === "rebase") {
      pullRecovery = await window.githead.getPullRecovery(repoPath).catch(() => pullRecovery);
      if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    }
    updateState((latest) => ({
      ...latest,
      summary: latest.summary && (result.state || result.outcome === "completed")
        ? { ...latest.summary, operationState: result.state }
        : latest.summary,
      repositoryOperationError: result.outcome === "completed"
        ? ""
        : result.stderr.trim() || "Git could not complete the recovery action. The operation may still be active.",
      ...(operationState.kind === "rebase" ? {
        pullRecovery,
        pullRecoveryOpen: Boolean(pullRecovery)
      } : {})
    }));
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const openWorktreeDialog = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || !current.summary.capabilities.worktrees || isOperationRunning(current)) return;
    updateState({ worktreeDialogOpen: true });
  }, [updateState]);

  const closeWorktreeDialog = useCallback((): void => {
    if (!isOperationRunning(stateRef.current)) updateState({ worktreeDialogOpen: false });
  }, [updateState]);

  const createWorktree = useCallback(async (request: GitWorktreeCreateDraft): Promise<string | null> => {
    const repoPath = stateRef.current.repoPath;
    const repositoryGroup = stateRef.current.repositoryGroups.find((group) =>
      group.worktrees.some((worktree) => isSameRepoPath(worktree.path, repoPath)));
    if (!(await ensureTrustedRepo(repoPath))) return "Trust this workspace before creating a worktree.";
    if (!isInvocationCurrent(repoPath, (latest) => latest.worktreeDialogOpen)) return "The active repository changed. Reopen Add Worktree and try again.";
    const result = await runRepoOperation("Creating worktree", undefined, (operationId) => window.githead.createWorktree({ ...request, repoPath, operationId } as GitWorktreeCreateRequest & { operationId: string }));
    if (!result) return "Another repository operation is already running.";
    if (result.exitCode !== 0) return result.stderr || "Unable to create worktree.";
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return "The active repository changed. Reopen Add Worktree and try again.";
    updateState({ worktreeDialogOpen: false });
    await loadRepositoryGroups();
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    await switchRepo(request.destinationPath, {
      addToRecents: true,
      ...(repositoryGroup ? { recentAnchorPath: repositoryGroup.anchorPath } : {})
    });
    return null;
  }, [ensureTrustedRepo, isInvocationCurrent, loadRepositoryGroups, runRepoOperation, switchRepo, updateState]);

  const openWorktreeRemoval = useCallback(async (worktree: GitWorktree): Promise<void> => {
    const repoPath = stateRef.current.repoPath;
    updateState({ worktreeRemoveTarget: worktree, worktreeRemovalCheck: null, worktreeRemovalChecking: true });
    try {
      const check = await window.githead.checkWorktreeRemoval({ repoPath, worktreePath: worktree.path });
      if (!isSameRepoPath(repoPath, stateRef.current.repoPath) || !isSameRepoPath(worktree.path, stateRef.current.worktreeRemoveTarget?.path ?? "")) return;
      updateState({ worktreeRemovalCheck: check, worktreeRemovalChecking: false });
    } catch (error) {
      if (isSameRepoPath(worktree.path, stateRef.current.worktreeRemoveTarget?.path ?? "")) {
        updateState({
          worktreeRemovalCheck: { repoPath, worktreePath: worktree.path, canRemove: false, canForceRemove: false, isClean: false, reason: error instanceof Error ? error.message : "Unable to check worktree." },
          worktreeRemovalChecking: false
        });
      }
    }
  }, [updateState]);

  const closeWorktreeRemoval = useCallback((): void => {
    if (!isOperationRunning(stateRef.current)) updateState({ worktreeRemoveTarget: null, worktreeRemovalCheck: null, worktreeRemovalChecking: false });
  }, [updateState]);

  const removeWorktree = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const target = current.worktreeRemoveTarget;
    const removalCheck = current.worktreeRemovalCheck;
    if (!target || (!removalCheck?.canRemove && !removalCheck?.canForceRemove) || !(await ensureTrustedRepo(current.repoPath))) return;
    if (!isInvocationCurrent(current.repoPath, (latest) => (
      isSameRepoPath(latest.worktreeRemoveTarget?.path ?? "", target.path) &&
      latest.worktreeRemovalCheck === removalCheck
    ))) return;
    const result = await runRepoOperation("Removing worktree", undefined, (operationId) => window.githead.removeWorktree({ repoPath: current.repoPath, worktreePath: target.path, force: !removalCheck.canRemove, operationId }));
    if (result?.exitCode === 0) {
      repositorySnapshots.current.delete(target.path);
      updateState({ worktreeRemoveTarget: null, worktreeRemovalCheck: null, worktreeRemovalChecking: false });
      await loadRepositoryGroups();
    } else if (result) {
      updateState({ worktreeRemovalCheck: { ...removalCheck, canRemove: false, reason: result.stderr || "Unable to remove worktree." } });
    }
  }, [ensureTrustedRepo, isInvocationCurrent, loadRepositoryGroups, runRepoOperation, updateState]);

  const downloadStatusLfsPreview = useCallback(async (): Promise<void> => {
    const snapshot = stateRef.current.selection;
    if (!snapshot) return;
    const result = await runRepoOperation("Downloading LFS image preview", undefined, (operationId) => window.githead.fetchLfsImageVersions({
      context: "status", repoPath: stateRef.current.repoPath, path: snapshot.path, side: snapshot.side, operationId
    }));
    const latest = stateRef.current.selection;
    if (result?.exitCode === 0 && latest?.path === snapshot.path && latest.side === snapshot.side) await loadSelectedDiff(snapshot);
  }, [loadSelectedDiff, runRepoOperation]);

  const downloadCommitLfsPreview = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const hash = current.selectedCommitHash;
    const filePath = current.selectedCommitFilePath;
    if (!hash || !filePath) return;
    const originalPath = current.commitDetails?.files.find((file) => file.path === filePath)?.originalPath;
    const result = await runRepoOperation("Downloading LFS image preview", undefined, (operationId) => window.githead.fetchLfsImageVersions({
      context: "commit", repoPath: current.repoPath, hash, path: filePath, ...(originalPath ? { originalPath } : {}), operationId
    }));
    const latest = stateRef.current;
    if (result?.exitCode === 0 && latest.selectedCommitHash === hash && latest.selectedCommitFilePath === filePath) await loadCommitFileDiff(hash, filePath);
  }, [loadCommitFileDiff, runRepoOperation]);

  const loadRemoteConfigs = useCallback(async (repoPath = stateRef.current.repoPath): Promise<GitRemoteConfig[] | null> => {
    const requestId = ++requestIds.current.remoteConfigs;
    updateState((current) => ({
      ...current,
      remoteManager: {
        ...current.remoteManager,
        loading: true,
        error: ""
      }
    }));

    try {
      const remotes = await window.githead.getRemoteConfigs(repoPath);
      if (requestIds.current.remoteConfigs !== requestId || stateRef.current.repoPath !== repoPath) {
        return null;
      }
      updateState((current) => ({
        ...current,
        remoteManager: {
          ...current.remoteManager,
          loading: false,
          remotes,
          error: ""
        }
      }));
      return remotes;
    } catch (error) {
      if (requestIds.current.remoteConfigs !== requestId || stateRef.current.repoPath !== repoPath) {
        return null;
      }
      updateState((current) => ({
        ...current,
        remoteManager: {
          ...current.remoteManager,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load remotes."
        }
      }));
      return null;
    }
  }, [updateState]);

  const openRemoteManager = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || !current.summary.capabilities.manageRemotes || isOperationRunning(current)) {
      return;
    }
    updateState((latest) => ({
      ...latest,
      remoteManager: {
        ...emptyRemoteManager,
        open: true,
        loading: true
      }
    }));
    void loadRemoteConfigs(current.repoPath);
  }, [loadRemoteConfigs, updateState]);

  const closeRemoteManager = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }
    requestIds.current.remoteConfigs += 1;
    updateState({ remoteManager: emptyRemoteManager });
  }, [updateState]);

  const runRemoteOperation = useCallback(async (
    label: string,
    operation: (repoPath: string, operationId: string) => Promise<GitOperationResult>
  ): Promise<string | null> => {
    const repoPath = stateRef.current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      return "Trust this workspace before changing remotes.";
    }
    if (stateRef.current.repoPath !== repoPath || !stateRef.current.remoteManager.open) {
      return "The active repository changed. Reopen Manage Remotes and try again.";
    }
    const result = await runRepoOperation(label, undefined, (operationId) => operation(repoPath, operationId));
    if (!result) {
      return "Another repository operation is already running.";
    }
    if (result.exitCode !== 0) {
      return result.stderr || `${label} failed.`;
    }
    if (stateRef.current.repoPath === repoPath && stateRef.current.remoteManager.open) {
      await loadRemoteConfigs(repoPath);
    }
    return null;
  }, [ensureTrustedRepo, loadRemoteConfigs, runRepoOperation]);

  const showRecentRepositoryInExplorer = useCallback(async (repoPath: string): Promise<void> => {
    await runRepoOperation(
      "Showing repository in Explorer",
      undefined,
      () => window.githead.showRepositoryInExplorer(repoPath),
      {
        requireValidRepo: false,
        cancellable: false
      }
    );
  }, [runRepoOperation]);

  const openBranchDialog = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }

    updateState({
      branchDialogOpen: true,
      branchNameDraft: "",
      branchError: "",
      branchCheckoutTarget: null
    });
  }, [updateState]);

  const closeBranchDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      branchDialogOpen: false,
      branchError: "",
      branchCheckoutTarget: null
    });
  }, [updateState]);

  const openBranchManager = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) return;
    updateState({ branchManagerOpen: true });
  }, [updateState]);

  const closeBranchManager = useCallback((): void => {
    if (!isOperationRunning(stateRef.current)) updateState({ branchManagerOpen: false });
  }, [updateState]);

  const runBranchOperation = useCallback(async (action: "rename" | "remove", label: string, branchName: string, operation: (repoPath: string, operationId: string) => Promise<GitOperationResult>): Promise<string | null> => {
    const snapshot = stateRef.current;
    const repoPath = snapshot.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) return "Trust this workspace before changing branches.";
    const latest = stateRef.current;
    if (latest.repoPath !== repoPath || !latest.branchManagerOpen) return "The active repository changed. Reopen Manage Branches and try again.";
    if (action === "remove" && latest.summary?.branch === branchName) return "Switch to another branch before removing this branch.";
    const result = await runRepoOperation(label, undefined, (operationId) => operation(repoPath, operationId));
    if (!result) return "Another repository operation is already running.";
    if (result.exitCode === 0) return null;
    if (action === "remove" && /not fully merged/i.test(result.stderr)) {
      return "This branch has commits that haven’t been merged. Merge them into another branch before deleting it.";
    }
    return result.stderr.trim() || `${label} failed.`;
  }, [ensureTrustedRepo, runRepoOperation]);

  const closePublishDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      publishDialogOpen: false,
      publishError: ""
    });
  }, [updateState]);

  const loadFileHistoryDiff = useCallback(async (entry: GitFileHistoryEntry): Promise<void> => {
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    const requestId = requestIds.current.fileHistoryDiff + 1;
    requestIds.current.fileHistoryDiff = requestId;
    const repoPath = stateRef.current.repoPath;
    updateState({ selectedFileHistoryHash: entry.hash, fileHistoryDiff: null, fileHistoryDiffLoading: true, fileHistoryDiffError: "" });
    try {
      const diff = await window.githead.getCommitFileDiff({
        repoPath,
        hash: entry.hash,
        path: entry.path,
        requestId: repositoryReadRequestId("file-history-diff", requestId),
        ...(entry.originalPath ? { originalPath: entry.originalPath } : {})
      });
      if (requestId !== requestIds.current.fileHistoryDiff || !isSameRepoPath(repoPath, stateRef.current.repoPath) || stateRef.current.historyRoute.kind !== "file") return;
      updateState({ fileHistoryDiff: diff });
    } catch (error) {
      if (requestId === requestIds.current.fileHistoryDiff && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        updateState({ fileHistoryDiffError: error instanceof Error ? error.message : "Unable to read the historical file diff." });
      }
    } finally {
      if (requestId === requestIds.current.fileHistoryDiff) updateState({ fileHistoryDiffLoading: false });
    }
  }, [updateState]);

  const loadFileHistory = useCallback(async (target: HistoricalFileTarget): Promise<void> => {
    cancelRepositoryRead("file-history", requestIds.current.fileHistory);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    requestIds.current.fileHistoryDiff += 1;
    requestIds.current.fileBlame += 1;
    const requestId = requestIds.current.fileHistory + 1;
    requestIds.current.fileHistory = requestId;
    const repoPath = stateRef.current.repoPath;
    updateState({
      activeView: "history",
      historyRoute: { kind: "file", origin: target },
      fileHistoryOrigin: target,
      fileHistoryEntries: [],
      fileHistoryLoading: true,
      fileHistoryError: "",
      fileHistoryHasMore: false,
      selectedFileHistoryHash: null,
      fileHistoryDiff: null,
      fileHistoryDiffLoading: false,
      fileHistoryDiffError: "",
      fileBlame: null,
      fileBlameLoading: false,
      fileBlameError: ""
    });
    try {
      const result = await window.githead.getFileHistory({ repoPath, startHash: target.hash, path: target.path, limit: HISTORY_LIMIT, requestId: repositoryReadRequestId("file-history", requestId) });
      const route = stateRef.current.historyRoute;
      if (requestId !== requestIds.current.fileHistory || !isSameRepoPath(repoPath, stateRef.current.repoPath) || route.kind !== "file" || route.origin.hash !== target.hash || route.origin.path !== target.path) return;
      const first = result.entries[0] ?? null;
      updateState({ fileHistoryEntries: result.entries, fileHistoryHasMore: result.hasMore, selectedFileHistoryHash: first?.hash ?? null });
      if (first) await loadFileHistoryDiff(first);
    } catch (error) {
      if (requestId === requestIds.current.fileHistory && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        updateState({ fileHistoryError: error instanceof Error ? error.message : "Unable to read file history." });
      }
    } finally {
      if (requestId === requestIds.current.fileHistory) updateState({ fileHistoryLoading: false });
    }
  }, [loadFileHistoryDiff, updateState]);

  const loadFileBlame = useCallback(async (target: HistoricalFileTarget, returnTo: "repository" | "file"): Promise<void> => {
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    requestIds.current.fileHistoryDiff += 1;
    const requestId = requestIds.current.fileBlame + 1;
    requestIds.current.fileBlame = requestId;
    const repoPath = stateRef.current.repoPath;
    updateState({ activeView: "history", historyRoute: { kind: "blame", target, returnTo }, fileBlame: null, fileBlameLoading: true, fileBlameError: "" });
    try {
      const result = await window.githead.getFileBlame({ repoPath, hash: target.hash, path: target.path, requestId: repositoryReadRequestId("file-blame", requestId) });
      const route = stateRef.current.historyRoute;
      if (requestId !== requestIds.current.fileBlame || !isSameRepoPath(repoPath, stateRef.current.repoPath) || route.kind !== "blame" || route.target.hash !== target.hash || route.target.path !== target.path) return;
      updateState({ fileBlame: result });
    } catch (error) {
      if (requestId === requestIds.current.fileBlame && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        updateState({ fileBlameError: error instanceof Error ? error.message : "Unable to read blame." });
      }
    } finally {
      if (requestId === requestIds.current.fileBlame) updateState({ fileBlameLoading: false });
    }
  }, [updateState]);

  const openPushToBranchDialog = useCallback((): void => {
    const current = stateRef.current;
    const summary = current.summary;
    if (
      !summary?.isValid ||
      !summary.capabilities.pushToBranch ||
      !summary.branch ||
      getPushRemotes(summary).length === 0 ||
      isOperationRunning(current)
    ) {
      return;
    }

    updateState({
      pushToBranchDialog: {
        ...emptyPushToBranchDialog,
        open: true,
        sourceBranch: summary.branch,
        remoteName: getDefaultPushRemote(summary)
      }
    });
  }, [updateState]);

  const closePushToBranchDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }
    updateState({
      pushToBranchDialog: emptyPushToBranchDialog
    });
  }, [updateState]);

  const switchBranch = useCallback(async (branchName: string): Promise<void> => {
    const current = stateRef.current;
    const nextBranchName = branchName.trim();

    if (!current.summary?.isValid || isOperationRunning(current) || !nextBranchName || nextBranchName === current.summary.branch) {
      return;
    }

    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => latest.summary?.branch !== nextBranchName)) {
      return;
    }

    await runRepoOperation(`Switching branch to ${nextBranchName}`, null, (operationId) =>
      window.githead.switchBranch({
        repoPath,
        branchName: nextBranchName,
        operationId
      })
    );
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation]);

  const setBranchUpstream = useCallback(async (upstream: string | null): Promise<void> => {
    const current = stateRef.current;
    const summary = current.summary;

    if (!summary?.isValid || isOperationRunning(current) || !summary.branch) {
      return;
    }

    const branchName = summary.branch;
    if (upstream === summary.upstream) {
      return;
    }

    if (upstream !== null && !summary.remoteBranches.some((remoteBranch) => remoteBranch.name === upstream)) {
      return;
    }

    updateState({ upstreamError: "" });
    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.summary?.branch === branchName
    ))) return;

    const label = upstream ? `Changing upstream to ${upstream}` : "Clearing upstream";
    const result = await runRepoOperation(label, null, (operationId) =>
      window.githead.setBranchUpstream({
        repoPath,
        branchName,
        upstream,
        operationId
      })
    );
    if (result?.exitCode !== 0 && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      updateState({ upstreamError: getOperationFailureMessage(result, "Unable to change upstream.") });
    }
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const publishBranch = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const summary = current.summary;

    if (!summary?.isValid || isOperationRunning(current) || !summary.branch) {
      return;
    }

    const pushRemotes = getPushRemotes(summary);
    const remoteName = current.publishRemoteDraft.trim();
    if (!remoteName || !pushRemotes.includes(remoteName)) {
      updateState({
        publishError: pushRemotes.length === 0 ? "No push remote is configured." : "Select a push remote."
      });
      return;
    }

    if (!(await ensureTrustedRepo(current.repoPath))) {
      if (isSameRepoPath(current.repoPath, stateRef.current.repoPath) && stateRef.current.publishDialogOpen) {
        updateState({
          publishError: "Repository trust is required before publishing branches."
        });
      }
      return;
    }

    if (!isInvocationCurrent(current.repoPath, (latest) => (
      latest.publishDialogOpen &&
      latest.publishRemoteDraft.trim() === remoteName &&
      latest.summary?.branch === summary.branch
    ))) {
      return;
    }

    let completedResult: GitRunResult | null = null;
    const activeOperation = createActiveOperation("Publish", current.repoPath, "action");
    if (!hasProcessRunInFlight(current)) activityLogStore.clear();
    updateState({
      activeOperation,
      runningAction: "publish",
      lastResult: null,
      publishError: ""
    });

    try {
      const lastResult = await window.githead.publishBranch({
        repoPath: current.repoPath,
        branchName: summary.branch,
        remoteName,
        operationId: activeOperation.operationId
      });
      completedResult = lastResult;
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      updateState({
        lastResult
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish branch.";
      completedResult = {
        runId: "renderer-error",
        action: "publish",
        repoPath: current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: message,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString()
      };
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      updateState({
        lastResult: completedResult
      });
      appendSystemLine(message);
    } finally {
      finishActiveOperation(activeOperation.token, invalidateHistory);
      if (isSameRepoPath(current.repoPath, stateRef.current.repoPath)) {
        void refreshRepo({ reason: "operation" });
      }
    }

    if (completedResult?.exitCode === 0) {
      updateState({
        publishDialogOpen: false,
        publishRemoteDraft: "",
        publishError: ""
      });
      return;
    }

    updateState({
      publishError: completedResult?.stderr.trim() || "Unable to publish branch."
    });
  }, [activityLogStore, appendSystemLine, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, isInvocationCurrent, refreshRepo, updateState]);

  const pushToBranch = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const summary = current.summary;
    const dialog = current.pushToBranchDialog;
    if (
      !dialog.open ||
      !summary?.isValid ||
      !summary.capabilities.pushToBranch ||
      !summary.branch ||
      isOperationRunning(current)
    ) {
      return;
    }

    if (summary.branch !== dialog.sourceBranch) {
      updateState({
        pushToBranchDialog: {
          ...dialog,
          error: "Current branch changed. Refresh and try again."
        }
      });
      return;
    }

    const pushRemotes = getPushRemotes(summary);
    const remoteName = dialog.remoteName.trim();
    if (!remoteName || !pushRemotes.includes(remoteName)) {
      updateState({
        pushToBranchDialog: {
          ...dialog,
          error: pushRemotes.length === 0 ? "No push remote is configured." : "Select a push remote."
        }
      });
      return;
    }

    const destinationBranch = (
      dialog.destinationMode === "new" ? dialog.newBranchName : dialog.destinationBranch
    ).trim();
    if (!destinationBranch) {
      updateState({
        pushToBranchDialog: {
          ...dialog,
          error: dialog.destinationMode === "new" ? "Enter a destination branch name." : "Select a destination branch."
        }
      });
      return;
    }
    if (
      dialog.destinationMode === "existing" &&
      !summary.remoteBranches.some((remoteBranch) =>
        remoteBranch.remote === remoteName && remoteBranch.branch === destinationBranch
      )
    ) {
      updateState({
        pushToBranchDialog: {
          ...dialog,
          error: "Select a fetched remote branch."
        }
      });
      return;
    }

    const repoPath = current.repoPath;
    updateState({
      pushToBranchDialog: {
        ...dialog,
        error: ""
      }
    });
    if (!(await ensureTrustedRepo(repoPath))) {
      const latest = stateRef.current;
      if (latest.repoPath === repoPath && latest.pushToBranchDialog.open) {
        updateState({
          pushToBranchDialog: {
            ...latest.pushToBranchDialog,
            error: "Repository trust is required before pushing branches."
          }
        });
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (candidate) => (
      candidate.pushToBranchDialog.open &&
      candidate.pushToBranchDialog.sourceBranch === dialog.sourceBranch &&
      candidate.pushToBranchDialog.remoteName === dialog.remoteName &&
      candidate.pushToBranchDialog.destinationBranch === dialog.destinationBranch
    ))) {
      return;
    }

    const completedResult = await runAction("push", {
      sourceBranch: dialog.sourceBranch,
      remoteName,
      destinationBranch
    });
    if (completedResult?.exitCode === 0) {
      updateState({
        pushToBranchDialog: emptyPushToBranchDialog
      });
      return;
    }

    const afterPush = stateRef.current;
    if (afterPush.repoPath === repoPath && afterPush.pushToBranchDialog.open) {
      updateState({
        pushToBranchDialog: {
          ...afterPush.pushToBranchDialog,
          error: completedResult?.stderr.trim() || "Unable to push to the selected branch."
        }
      });
    }
  }, [ensureTrustedRepo, isInvocationCurrent, runAction, updateState]);

  const openCreatePrDialog = useCallback((): void => {
    const current = stateRef.current;
    const summary = current.summary;
    if (!summary?.isValid || !summary.branch || isOperationRunning(current)) {
      return;
    }

    const defaultBranch = getRemoteDefaultBranch(summary);
    const latestCommitSubject = current.history[0]?.subject.trim() ?? "";
    updateState({
      createPrDialog: {
        ...emptyCreatePrDialog,
        open: true,
        headBranch: summary.branch,
        title: latestCommitSubject || summary.branch,
        baseBranch: defaultBranch?.branch ?? ""
      }
    });
  }, [updateState]);

  const closeCreatePrDialog = useCallback((): void => {
    const dialog = stateRef.current.createPrDialog;
    if (dialog.step !== "idle" || dialog.generating !== null) {
      return;
    }

    updateState({
      createPrDialog: emptyCreatePrDialog
    });
  }, [updateState]);

  const generatePrDescriptionForDialog = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.createPrDialog;
    const summary = current.summary;

    if (!dialog.open || dialog.generating !== null || dialog.step !== "idle" || isOperationRunning(current)) {
      return;
    }

    if (!summary?.isValid || !summary.branch || summary.branch !== dialog.headBranch) {
      return;
    }

    if (!dialog.baseBranch) {
      updateState((latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          error: "Select a base branch."
        }
      }));
      return;
    }

    const remoteName = getRemoteDefaultBranch(summary)?.remote ?? "origin";
    const trimmedTitle = dialog.title.trim();
    const activeOperation = createActiveOperation(
      "Generating pull request description",
      current.repoPath,
      "pr-generation"
    );
    updateState((latest) => ({
      ...latest,
      activeOperation,
      runningOperation: "Generating pull request description",
      createPrDialog: {
        ...latest.createPrDialog,
        generating: "description",
        error: ""
      }
    }));

    try {
      const result = await window.githead.generatePrDescription({
        repoPath: current.repoPath,
        baseRef: `${remoteName}/${dialog.baseBranch}`,
        headRef: summary.branch,
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
        operationId: activeOperation.operationId
      });
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      appendOperationLog("Generating pull request description", result);
      updateState((latest) => ({
        ...latest,
        createPrDialog: !latest.createPrDialog.open
          ? latest.createPrDialog
          : result.exitCode === 0
          ? {
              ...latest.createPrDialog,
              body: result.stdout.trim()
            }
          : {
              ...latest.createPrDialog,
              error: result.stderr.trim() || "Unable to generate pull request description."
            }
      }));
    } catch (error) {
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      updateState((latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          error: error instanceof Error ? error.message : "Unable to generate pull request description."
        }
      }));
    } finally {
      finishActiveOperation(activeOperation.token, (latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          generating: null
        }
      }));
    }
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const generatePrTitleForDialog = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.createPrDialog;
    const summary = current.summary;

    if (!dialog.open || dialog.generating !== null || dialog.step !== "idle" || isOperationRunning(current)) {
      return;
    }

    if (!summary?.isValid || !summary.branch || summary.branch !== dialog.headBranch) {
      return;
    }

    if (!dialog.baseBranch) {
      updateState((latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          error: "Select a base branch."
        }
      }));
      return;
    }

    const remoteName = getRemoteDefaultBranch(summary)?.remote ?? "origin";
    const activeOperation = createActiveOperation(
      "Generating pull request title",
      current.repoPath,
      "pr-generation"
    );
    updateState((latest) => ({
      ...latest,
      activeOperation,
      runningOperation: "Generating pull request title",
      createPrDialog: {
        ...latest.createPrDialog,
        generating: "title",
        error: ""
      }
    }));

    try {
      const result = await window.githead.generatePrTitle({
        repoPath: current.repoPath,
        baseRef: `${remoteName}/${dialog.baseBranch}`,
        headRef: summary.branch,
        operationId: activeOperation.operationId
      });
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      appendOperationLog("Generating pull request title", result);
      updateState((latest) => ({
        ...latest,
        createPrDialog: !latest.createPrDialog.open
          ? latest.createPrDialog
          : result.exitCode === 0
          ? {
              ...latest.createPrDialog,
              title: result.stdout.trim()
            }
          : {
              ...latest.createPrDialog,
              error: result.stderr.trim() || "Unable to generate pull request title."
            }
      }));
    } catch (error) {
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return;
      }
      updateState((latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          error: error instanceof Error ? error.message : "Unable to generate pull request title."
        }
      }));
    } finally {
      finishActiveOperation(activeOperation.token, (latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          generating: null
        }
      }));
    }
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const submitCreatePullRequest = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.createPrDialog;
    const summary = current.summary;

    if (!dialog.open || dialog.step !== "idle" || dialog.generating !== null || isOperationRunning(current)) {
      return;
    }

    if (dialog.failure?.outcomeUnknown && !dialog.unknownOutcomeReviewed) {
      return;
    }

    if (!summary?.isValid || !summary.branch) {
      return;
    }

    const setDialogError = (error: string): void => {
      updateState((latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          step: "idle",
          error
        }
      }));
    };

    if (summary.branch !== dialog.headBranch) {
      setDialogError("The current branch changed. Close this dialog and try again.");
      return;
    }

    const title = dialog.title.trim();
    if (!title) {
      setDialogError("Enter a pull request title.");
      return;
    }

    if (!dialog.baseBranch) {
      setDialogError("Select a base branch.");
      return;
    }

    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.createPrDialog.open) {
        setDialogError("Repository trust is required before creating a pull request.");
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.createPrDialog.open &&
      latest.createPrDialog.step === "idle" &&
      latest.createPrDialog.generating === null &&
      latest.createPrDialog.headBranch === dialog.headBranch &&
      latest.createPrDialog.baseBranch === dialog.baseBranch &&
      latest.createPrDialog.title.trim() === title &&
      latest.createPrDialog.body === dialog.body &&
      latest.createPrDialog.draft === dialog.draft
    ))) {
      return;
    }

    const needsPublish = shouldPublishInsteadOfPush(summary);
    const needsPush = !needsPublish && hasUnpushedCommits(summary);

    if (needsPublish || needsPush) {
      const pushOperation = createActiveOperation(
        needsPublish ? "Publish" : "Push",
        repoPath,
        "pr-push"
      );
      if (!hasProcessRunInFlight(current)) activityLogStore.clear();
      updateState((latest) => ({
        ...latest,
        activeOperation: pushOperation,
        runningAction: needsPublish ? "publish" : "push",
        lastResult: null,
        createPrDialog: {
          ...latest.createPrDialog,
          step: "pushing",
          error: ""
        }
      }));

      let pushResult: GitRunResult;
      try {
        pushResult = needsPublish
          ? await window.githead.publishBranch({
              repoPath,
              branchName: summary.branch,
              remoteName: getDefaultPublishRemote(summary),
              operationId: pushOperation.operationId
            })
          : await window.githead.runGitAction({
              repoPath,
              action: "push",
              operationId: pushOperation.operationId
            });
        if (!isActiveOperationCurrent(pushOperation.token)) {
          return;
        }
        updateState({
          lastResult: pushResult
        });
      } catch (error) {
        if (!isActiveOperationCurrent(pushOperation.token)) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to push branch.";
        appendSystemLine(message);
        finishActiveOperation(pushOperation.token, invalidateHistory);
        void refreshRepo({ reason: "operation" });
        setDialogError(message);
        return;
      }

      finishActiveOperation(pushOperation.token, invalidateHistory);
      void refreshRepo({ reason: "operation" });

      if (pushResult.exitCode !== 0) {
        setDialogError(pushResult.stderr.trim() || "Unable to push branch.");
        return;
      }

      if (!isSameRepoPath(repoPath, stateRef.current.repoPath) || !stateRef.current.createPrDialog.open) {
        return;
      }
    }

    const createOperation = createActiveOperation(
      "Creating pull request",
      repoPath,
      "pr-create"
    );
    updateState((latest) => ({
      ...latest,
      activeOperation: createOperation,
      runningOperation: "Creating pull request",
      createPrDialog: {
        ...latest.createPrDialog,
        step: "creating",
        error: "",
        failure: null
      }
    }));

    try {
      const result = await window.githead.createGitHubPullRequest({
        repoPath,
        title,
        body: dialog.body,
        baseBranch: dialog.baseBranch,
        headBranch: summary.branch,
        draft: dialog.draft,
        operationId: createOperation.operationId
      });

      if (
        !isActiveOperationCurrent(createOperation.token) ||
        !isSameRepoPath(repoPath, stateRef.current.repoPath)
      ) {
        return;
      }

      if (!result.ok) {
        const errorMessage = result.error.outcomeUnknown
          ? `${result.error.message} Check GitHub before retrying; the pull request may have been created.`
          : result.error.message;
        finishActiveOperation(createOperation.token, (latest) => ({
          ...latest,
          createPrDialog: {
            ...latest.createPrDialog,
            step: "idle",
            error: errorMessage,
            failure: result.error,
            unknownOutcomeReviewed: !result.error.outcomeUnknown
          }
        }));
        return;
      }

      finishActiveOperation(createOperation.token, (latest) => ({
        ...latest,
        createPrDialog: emptyCreatePrDialog,
        lastOperationResult: {
          repoPath,
          exitCode: 0,
          stdout: `Created pull request #${result.data.number}: ${result.data.url}`,
          stderr: ""
        }
      }));
      github.invalidate("pullRequests");
      github.invalidate("openCounts");
      void github.ensure("pullRequests");
      void github.ensure("openCounts");
    } catch (error) {
      if (!isActiveOperationCurrent(createOperation.token)) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unable to create pull request.";
      const failure: GitHubFailure = {
        kind: "unexpected",
        message,
        retryable: false,
        retryAfterAt: null,
        outcomeUnknown: true,
        source: "combined",
        rateLimit: null
      };
      finishActiveOperation(createOperation.token, (latest) => ({
        ...latest,
        createPrDialog: {
          ...latest.createPrDialog,
          step: "idle",
          error: `${message} Check GitHub before retrying; the pull request may have been created.`,
          failure,
          unknownOutcomeReviewed: false
        }
      }));
    }
  }, [activityLogStore, appendSystemLine, createActiveOperation, ensureTrustedRepo, finishActiveOperation, github, isActiveOperationCurrent, isInvocationCurrent, refreshRepo, updateState]);

  const createBranch = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const branchName = current.branchNameDraft.trim();

    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }

    if (!branchName) {
      updateState({
        branchError: "Enter a branch name."
      });
      return;
    }

    updateState({
      branchError: ""
    });

    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.branchDialogOpen) {
        updateState({
          branchError: "Repository trust is required before creating branches."
        });
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.branchDialogOpen &&
      latest.branchNameDraft.trim() === branchName &&
      latest.branchCheckoutTarget === current.branchCheckoutTarget
    ))) return;

    const target = current.branchCheckoutTarget;
    const label = target?.kind === "remote" ? `Checking out ${target.remoteBranch}`
      : target?.kind === "pullRequest" ? `Checking out pull request #${target.pullRequest.number}`
      : `Creating branch ${branchName}`;
    const result = await runRepoOperation(label, null, (operationId) => target?.kind === "remote"
      ? window.githead.checkoutRemoteBranch({ repoPath, branchName, remoteBranch: target.remoteBranch, operationId })
      : target?.kind === "pullRequest"
        ? window.githead.checkoutGitHubPullRequest({ repoPath, branchName, pullRequestNumber: target.pullRequest.number, sourceBranch: target.pullRequest.sourceBranch, sourceRepositoryFullName: target.pullRequest.sourceRepositoryFullName, operationId })
        : window.githead.createBranch({ repoPath, branchName, operationId }));

    if (result?.exitCode === 0) {
      updateState({
        branchDialogOpen: false,
        branchNameDraft: "",
        branchError: "",
        branchCheckoutTarget: null
      });
      return;
    }

    updateState({
      branchError: getOperationFailureMessage(result, target ? "Unable to check out branch." : "Unable to create branch.")
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const checkoutRemoteBranch = useCallback((remoteBranch: GitRemoteBranch): void => {
    const current = stateRef.current;
    const summary = current.summary;
    if (!summary?.isValid || isOperationRunning(current)) return;
    const repoPath = current.repoPath;
    const local = summary.branches.find((branch) => branch.name === remoteBranch.branch);
    if (local && local.upstream !== remoteBranch.name) {
      updateState({ branchDialogOpen: true, branchNameDraft: remoteBranch.branch, branchError: "A different local branch already uses this name. Enter another name.", branchCheckoutTarget: { kind: "remote", remoteBranch: remoteBranch.name } });
      return;
    }
    void (async () => {
      if (!(await ensureTrustedRepo(repoPath)) || !isInvocationCurrent(repoPath)) return;
      await runRepoOperation(`Checking out ${remoteBranch.name}`, null, (operationId) => window.githead.checkoutRemoteBranch({ repoPath, branchName: remoteBranch.branch, remoteBranch: remoteBranch.name, operationId }));
    })();
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const checkoutPullRequest = useCallback((pullRequest: GitHubPullRequest): void => {
    const current = stateRef.current;
    const summary = current.summary;
    if (!summary?.isValid || isOperationRunning(current) || !pullRequest.sourceBranch) return;
    const repoPath = current.repoPath;
    if (summary.branches.some((branch) => branch.name === pullRequest.sourceBranch)) {
      updateState({ branchDialogOpen: true, branchNameDraft: pullRequest.sourceBranch, branchError: "A local branch already uses this name. Enter another name.", branchCheckoutTarget: { kind: "pullRequest", pullRequest } });
      return;
    }
    void (async () => {
      if (!(await ensureTrustedRepo(repoPath)) || !isInvocationCurrent(repoPath)) return;
      const result = await runRepoOperation(`Checking out pull request #${pullRequest.number}`, null, (operationId) => window.githead.checkoutGitHubPullRequest({ repoPath, branchName: pullRequest.sourceBranch, pullRequestNumber: pullRequest.number, sourceBranch: pullRequest.sourceBranch, sourceRepositoryFullName: pullRequest.sourceRepositoryFullName, operationId }));
      if (result?.errorKind === "branch-name-conflict" && isSameRepoPath(repoPath, stateRef.current.repoPath)) updateState({ branchDialogOpen: true, branchNameDraft: pullRequest.sourceBranch, branchError: getOperationFailureMessage(result, "Choose another branch name."), branchCheckoutTarget: { kind: "pullRequest", pullRequest } });
    })();
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const stageFiles = useCallback(async (paths: string[], nextSelection?: FileSelection): Promise<void> => {
    await runRepoOperation("Staging files", nextSelection, (operationId) =>
      window.githead.stageFiles({
        repoPath: stateRef.current.repoPath,
        paths,
        operationId
      })
    );
  }, [runRepoOperation]);

  const unstageFiles = useCallback(async (paths: string[], nextSelection?: FileSelection): Promise<void> => {
    await runRepoOperation("Unstaging files", nextSelection, (operationId) =>
      window.githead.unstageFiles({
        repoPath: stateRef.current.repoPath,
        paths,
        operationId
      })
    );
  }, [runRepoOperation]);

  const applySelectedHunk = useCallback(async (patch: string): Promise<void> => {
    const current = stateRef.current;
    const selection = current.selection;
    if (!selection || current.diffChanged) {
      return;
    }
    const repoPath = current.repoPath;

    const result = selection.side === "unstaged"
      ? await runRepoOperation("Staging hunk", selection, (operationId) =>
          window.githead.stageHunk({
            repoPath,
            path: selection.path,
            side: selection.side,
            patch,
            operationId
          })
        )
      : await runRepoOperation("Unstaging hunk", selection, (operationId) =>
          window.githead.unstageHunk({
            repoPath,
            path: selection.path,
            side: selection.side,
            patch,
            operationId
          })
        );

    if (result?.exitCode !== 0 || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    await refreshRepo({ reason: "operation" });
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }
    const nextSelection = resolvePostHunkSelection(stateRef.current.summary, selection);
    updateState({
      selection: nextSelection,
      diff: null,
      diffChanged: false
    });

    if (nextSelection) {
      await loadSelectedDiff(nextSelection);
    }
  }, [loadSelectedDiff, refreshRepo, runRepoOperation, updateState]);

  const openGitIdentityPrompt = useCallback(async (repoPath: string, retryMessage: string): Promise<void> => {
    const current = stateRef.current;
    if (!isSameRepoPath(repoPath, current.repoPath) || !current.summary?.isValid) {
      return;
    }

    const gitIdentity = current.gitIdentity ?? await loadGitIdentity(repoPath);
    const latest = stateRef.current;
    if (!isSameRepoPath(repoPath, latest.repoPath) || !latest.summary?.isValid) {
      return;
    }

    updateState({
      gitIdentityPrompt: {
        open: true,
        repoPath,
        name: gitIdentity?.name ?? "",
        email: gitIdentity?.email ?? "",
        scope: gitIdentity?.scope ?? "repository",
        error: "",
        retryMessage
      }
    });
  }, [loadGitIdentity, updateState]);

  const commitChanges = useCallback(async (): Promise<GitOperationResult | null> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canCommit(current)) {
      return null;
    }

    const repoPath = current.repoPath;
    const message = current.commitMessage;
    if (!(await ensureTrustedRepo(repoPath)) || !isInvocationCurrent(repoPath, (latest) => latest.commitMessage === message && canCommit(latest))) {
      return null;
    }

    const requireRemoteCheck = current.summary.kind === "git"
      && current.appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true;
    updateState({ commitPushSafetyNotice: null });

    const result = await runRepoOperation(
      requireRemoteCheck ? "Checking remote and committing changes" : "Committing changes",
      null,
      (operationId) => requireRemoteCheck
        ? window.githead.commitWithRemoteCheck({ repoPath, message, operationId })
        : window.githead.commitChanges({ repoPath, message, operationId }),
      { successFeedback: { action: "commit", surface: "commit-panel" } }
    ) as GitOperationResult | GitCommitWithRemoteCheckResult | null;

    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return null;
    }

    if (result.exitCode === 0) {
      updateState({
        commitMessage: "",
        commitPushSafetyNotice: null
      });
      return result;
    }

    if (result.errorKind === "missing-author-identity") {
      await openGitIdentityPrompt(repoPath, message);
    }
    if (requireRemoteCheck && "commitCreated" in result && !result.commitCreated && result.outcome !== "commit-failed") {
      updateState({
        commitPushSafetyNotice: {
          message: result.stderr.trim() || "The remote safety check failed. No commit was created.",
          undoRequest: null
        }
      });
    }
    return result;
  }, [ensureTrustedRepo, isInvocationCurrent, openGitIdentityPrompt, runRepoOperation, updateState]);

  const openAmendDialog = useCallback((source: GitAmendEntryPoint, commitHash?: string): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || current.summary.kind !== "git" || !current.summary.hasHead) return;
    amendReturnFocusRef.current = source === "history" && commitHash
      ? document.querySelector<HTMLElement>(`[data-commit-hash="${commitHash}"]`)
      : document.querySelector<HTMLElement>("[data-amend-composer-trigger]");
    setAmendDialogSource(source);
  }, []);

  const refreshAfterAmend = useCallback(async (repoPath: string): Promise<boolean> => {
    await refreshRepo({ reason: "operation", preserveWorkspaceOnFailure: true });
    const secondaryResults = await Promise.allSettled([
      loadCommitHistory(true),
      loadGitIdentity(repoPath)
    ]);
    const primaryRefresh = lastRepositoryRefreshRef.current;
    return Boolean(
      isSameRepoPath(repoPath, stateRef.current.repoPath)
      && stateRef.current.summary?.isValid
      && primaryRefresh
      && isSameRepoPath(primaryRefresh.repoPath, repoPath)
      && primaryRefresh.succeeded
      && secondaryResults.every((result) => result.status === "fulfilled" && Boolean(result.value))
    );
  }, [loadCommitHistory, loadGitIdentity, refreshRepo]);

  const amendLastCommit = useCallback(async (request: GitAmendExecuteRequest): Promise<GitAmendResult | null> => {
    const current = stateRef.current;
    const repoPath = current.repoPath;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return null;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    const result = await runRepoOperation(
      "Amending last commit",
      undefined,
      (operationId) => window.githead.amendLastCommit({ ...request, operationId }),
      { refreshAfter: false }
    ) as GitAmendResult | null;
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return result;
    const refreshed = await refreshAfterAmend(repoPath);
    if (result.amendErrorKind === "missing-author-identity") {
      await openGitIdentityPrompt(repoPath, request.message);
    }
    return result.outcome === "completed" && !refreshed
      ? { ...result, viewRefreshWarning: "The commit was amended, but Githead could not refresh every view. The view may be stale. Reopen the repository before you retry any operation." }
      : result;
  }, [ensureTrustedRepo, openGitIdentityPrompt, refreshAfterAmend, runRepoOperation]);

  const restoreAmendRecovery = useCallback(async (request: GitAmendRestoreRequest): Promise<GitAmendRestoreResult | null> => {
    const current = stateRef.current;
    const repoPath = current.repoPath;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return null;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    const result = await runRepoOperation(
      "Restoring amend recovery point",
      undefined,
      (operationId) => window.githead.restoreAmendRecovery({ ...request, operationId }),
      { refreshAfter: false }
    ) as GitAmendRestoreResult | null;
    if (result && isSameRepoPath(repoPath, stateRef.current.repoPath)) await refreshAfterAmend(repoPath);
    return result;
  }, [ensureTrustedRepo, refreshAfterAmend, runRepoOperation]);

  const generateCommitPlan = useCallback(async (paths: string[]): Promise<GenerateCommitPlanResult | null> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return null;
    const repoPath = current.repoPath;
    if (
      current.appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true
      && (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath))
    ) {
      return null;
    }
    let generated: GenerateCommitPlanResult | null = null;
    const operationResult = await runRepoOperation("Generating commit plan", undefined, async (operationId) => {
      generated = await window.githead.generateCommitPlan({ repoPath, paths, operationId });
      return {
        repoPath,
        exitCode: generated.exitCode,
        stdout: "",
        stderr: generated.stderr
      };
    });
    return operationResult ? generated : null;
  }, [ensureTrustedRepo, runRepoOperation]);

  const quickCommitPlannedFiles = useCallback(async (changes: GitQuickCommitChange[], message: string): Promise<GitOperationResult | null> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return null;
    if (getStagedFiles(current.summary).length > 0) {
      return {
        repoPath: current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: "Unstage existing files before using Quick Commit."
      };
    }
    const availablePaths = new Set(getUnstagedFiles(current.summary).filter(canStageStatusFile).map((file) => file.path));
    if (changes.length === 0 || changes.some((change) => !availablePaths.has(change.path))) {
      return {
        repoPath: current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: "The working-tree files changed. Generate the commit plan again."
      };
    }

    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    const operationLabel = current.appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true
      ? "Checking remote and creating quick commit"
      : "Creating quick commit";
    const result = await runRepoOperation(operationLabel, null, (operationId) => window.githead.quickCommitFiles({
      repoPath,
      changes,
      message,
      operationId
    }));
    if (result?.errorKind === "missing-author-identity") {
      await openGitIdentityPrompt(repoPath, message);
    }
    return result;
  }, [ensureTrustedRepo, openGitIdentityPrompt, runRepoOperation]);

  const commitAndPush = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canCommit(current)) {
      return;
    }

    if (current.summary.kind !== "git") {
      const result = await commitChanges();
      if (result?.exitCode === 0) await runAction("push", undefined, "commit-panel");
      return;
    }

    if (shouldPublishInsteadOfPush(current.summary)) {
      updateState({
        publishDialogOpen: true,
        publishRemoteDraft: getDefaultPublishRemote(current.summary),
        publishError: "Publish this branch before committing and pushing staged changes. No commit has been created."
      });
      return;
    }

    const repoPath = current.repoPath;
    const message = current.commitMessage;
    if (!(await ensureTrustedRepo(repoPath)) || !isInvocationCurrent(repoPath, (latest) => latest.commitMessage === message && canCommit(latest))) {
      return;
    }
    updateState({ commitPushSafetyNotice: null });
    const result = await runRepoOperation(
      "Checking remote, committing, and pushing",
      null,
      (operationId) => window.githead.commitAndPush({ repoPath, message, operationId }),
      { cancellable: true, successFeedback: { action: "push", surface: "commit-panel" } }
    ) as GitCommitAndPushResult | null;
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;

    if (result.exitCode === 0) {
      updateState({ commitMessage: "", commitPushSafetyNotice: null });
      return;
    }
    if (result.errorKind === "missing-author-identity") {
      await openGitIdentityPrompt(repoPath, message);
    }
    if (result.commitCreated) void loadCommitHistory(true);
    const undoRequest = result.canUndoCommit && result.branchName && result.headOid && result.previousHeadOid
      ? {
          repoPath,
          branchName: result.branchName,
          expectedHeadOid: result.headOid,
          previousHeadOid: result.previousHeadOid
        }
      : null;
    updateState({
      ...(result.push?.branchSucceeded ? { commitMessage: "" } : {}),
      commitPushSafetyNotice: {
        message: result.stderr.trim() || "Commit & Push did not complete.",
        undoRequest
      }
    });
  }, [commitChanges, ensureTrustedRepo, isInvocationCurrent, loadCommitHistory, openGitIdentityPrompt, runAction, runRepoOperation, updateState]);

  const undoFailedCommitPush = useCallback(async (): Promise<void> => {
    const notice = stateRef.current.commitPushSafetyNotice;
    if (!notice?.undoRequest || isOperationRunning(stateRef.current)) return;
    const request = notice.undoRequest;
    const result = await runRepoOperation(
      "Undoing commit and restoring staged changes",
      null,
      (operationId) => window.githead.undoCommitAndKeepStaged({ ...request, operationId })
    );
    if (result?.exitCode === 0 && isSameRepoPath(request.repoPath, stateRef.current.repoPath)) {
      updateState({ commitPushSafetyNotice: null });
    }
  }, [runRepoOperation, updateState]);

  const generateCommitMessage = useCallback(async (additionalContext?: string): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canGenerateCommitMessage(current)) {
      return false;
    }

    const activeOperation = createActiveOperation(
      "Generating commit message",
      current.repoPath,
      "repo-operation"
    );
    updateState({
      activeOperation,
      runningOperation: "Generating commit message",
      lastOperationResult: null,
      commitMessageGenerationError: ""
    });

    try {
      const trimmedContext = additionalContext?.trim();
      const result = await window.githead.generateCommitMessage({
        repoPath: current.repoPath,
        ...(trimmedContext ? { additionalContext: trimmedContext } : {}),
        operationId: activeOperation.operationId
      });
      if (!isActiveOperationCurrent(activeOperation.token)) {
        return false;
      }
      const generatedMessage = result.exitCode === 0 ? result.stdout.trim() : stateRef.current.commitMessage;
      updateState({
        lastOperationResult: result.exitCode === 0
          ? {
              ...result,
              stdout: "Commit message generated."
            }
          : result,
        commitMessage: generatedMessage,
        commitMessageGenerationError: result.exitCode === 0
          ? ""
          : result.stderr.trim() || "Unable to generate a commit message."
      });
      appendOperationLog("Generating commit message", result);
      return result.exitCode === 0;
    } catch (error) {
      const lastOperationResult: GitOperationResult = {
        repoPath: current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unable to generate commit message."
      };

      if (!isActiveOperationCurrent(activeOperation.token)) {
        return false;
      }
      updateState({
        lastOperationResult,
        commitMessageGenerationError: lastOperationResult.stderr
      });
      appendOperationLog("Generating commit message", lastOperationResult);
      return false;
    } finally {
      finishActiveOperation(activeOperation.token);
    }
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const generateStashMessage = useCallback(async (stashSelection: GitStashSelection): Promise<GitOperationResult> => {
    const current = stateRef.current;
    const failure = (message: string): GitOperationResult => ({
      repoPath: current.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: message
    });
    if (!current.summary?.isValid || isOperationRunning(current)) return failure("Another repository operation is in progress.");
    if (!canUseSelectedAiProvider(current.aiSettings)) return failure(getStashGenerateMessageTitle(current));

    const activeOperation = createActiveOperation("Generating stash message", current.repoPath, "repo-operation");
    updateState({ activeOperation, runningOperation: "Generating stash message", lastOperationResult: null });

    try {
      const result = await window.githead.generateCommitMessage({
        repoPath: current.repoPath,
        stashSelection,
        operationId: activeOperation.operationId
      });
      if (!isActiveOperationCurrent(activeOperation.token)) return failure("Stash message generation was cancelled.");
      updateState({
        lastOperationResult: result.exitCode === 0 ? { ...result, stdout: "Stash message generated." } : result
      });
      appendOperationLog("Generating stash message", result);
      return result;
    } catch (error) {
      const result = failure(error instanceof Error ? error.message : "Unable to generate a stash message.");
      if (isActiveOperationCurrent(activeOperation.token)) {
        updateState({ lastOperationResult: result });
        appendOperationLog("Generating stash message", result);
      }
      return result;
    } finally {
      finishActiveOperation(activeOperation.token);
    }
  }, [appendOperationLog, createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const loadGitHubConnection = useCallback(async (): Promise<void> => {
    const generation = ++githubConnectionGenerationRef.current;
    const current = stateRef.current;
    updateState({ githubConnectionLoading: true, githubConnectionError: "" });
    try {
      const connection = await window.githead.getGitHubConnection(
        current.summary?.isValid ? { repoPath: current.repoPath } : {}
      );
      if (githubConnectionGenerationRef.current !== generation) return;
      updateState({ githubConnection: connection, githubConnectionLoading: false });
    } catch (error) {
      if (githubConnectionGenerationRef.current !== generation) return;
      updateState({
        githubConnectionLoading: false,
        githubConnectionError: error instanceof Error ? error.message : "Unable to check the GitHub connection."
      });
    }
  }, [updateState]);

  const connectGitHub = useCallback(async (): Promise<void> => {
    const generation = ++githubConnectionGenerationRef.current;
    updateState({ githubConnecting: true, githubDeviceFlow: null, githubConnectionError: "" });
    try {
      let flow = await window.githead.beginGitHubDeviceFlow();
      if (githubConnectionGenerationRef.current !== generation) return;
      updateState({ githubDeviceFlow: flow });
      void window.githead.openExternalUrl({ url: flow.verificationUri });
      while (githubConnectionGenerationRef.current === generation) {
        await waitForMilliseconds(flow.intervalSeconds * 1_000);
        if (githubConnectionGenerationRef.current !== generation) return;
        const result = await window.githead.pollGitHubDeviceFlow(flow);
        if (githubConnectionGenerationRef.current !== generation) return;
        if (result.state === "pending") {
          flow = { ...flow, intervalSeconds: result.intervalSeconds };
          updateState({ githubDeviceFlow: flow });
          continue;
        }
        if (result.state === "error") {
          updateState({ githubConnecting: false, githubDeviceFlow: null, githubConnectionError: result.message });
          return;
        }
        gitHubQueryStore.clear();
        updateState({ githubConnection: result.connection, githubDeviceFlow: null });
        const current = stateRef.current;
        const connection = await window.githead.getGitHubConnection(
          current.summary?.isValid ? { repoPath: current.repoPath } : {}
        );
        if (githubConnectionGenerationRef.current !== generation) return;
        updateState({ githubConnection: connection, githubConnecting: false, githubConnectionError: "" });
        return;
      }
    } catch (error) {
      if (githubConnectionGenerationRef.current !== generation) return;
      updateState({
        githubConnecting: false,
        githubDeviceFlow: null,
        githubConnectionError: error instanceof Error ? error.message : "Unable to connect GitHub."
      });
    }
  }, [updateState]);

  const disconnectGitHub = useCallback(async (): Promise<void> => {
    const generation = ++githubConnectionGenerationRef.current;
    updateState({ githubConnecting: true, githubDeviceFlow: null, githubConnectionError: "" });
    try {
      const connection = await window.githead.disconnectGitHub();
      if (githubConnectionGenerationRef.current !== generation) return;
      gitHubQueryStore.clear();
      updateState({ githubConnection: connection, githubConnecting: false });
    } catch (error) {
      if (githubConnectionGenerationRef.current !== generation) return;
      updateState({
        githubConnecting: false,
        githubConnectionError: error instanceof Error ? error.message : "Unable to disconnect GitHub."
      });
    }
  }, [updateState]);

  const openSettingsDialog = useCallback((category: SettingsCategory = "git-identity"): void => {
    const settings = stateRef.current.aiSettings;
    const appSettings = stateRef.current.appSettings;
    const gitIdentity = stateRef.current.gitIdentity;
    updateState({
      settingsOpen: true,
      settingsCategory: category,
      settingsError: "",
      settingsDraft: {
        selectedProvider: settings?.selectedProvider ?? "openrouter",
        commitPlanGranularity: settings?.commitPlanGranularity ?? DEFAULT_COMMIT_PLAN_GRANULARITY,
        providerModels: createSettingsDraftProviderModels(settings),
        commitPlanModels: createSettingsDraftCommitPlanModels(settings),
        commitPlanReasoningEfforts: createSettingsDraftReasoningEfforts(settings, "commitPlan"),
        prDescriptionModels: createSettingsDraftPrDescriptionModels(settings),
        reasoningEfforts: createSettingsDraftReasoningEfforts(settings, "commit"),
        prDescriptionReasoningEfforts: createSettingsDraftReasoningEfforts(settings, "prDescription"),
        apiKeys: {},
        clearApiKeys: {},
        commitMessagePrompt: settings?.commitMessagePrompt ?? DEFAULT_COMMIT_MESSAGE_PROMPT,
        prDescriptionPrompt: settings?.prDescriptionPrompt ?? DEFAULT_PR_DESCRIPTION_PROMPT,
        sourceControlWritingStyle: settings?.sourceControlWritingStyle ?? { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE },
        autoFetchIntervalMinutes: String(appSettings?.autoFetchIntervalMinutes ?? 10),
        colorTheme: appSettings?.colorTheme ?? "githead",
        appearanceMode: appSettings?.appearanceMode ?? "system",
        uiFont: appSettings?.uiFont ?? "inter",
        codeFont: appSettings?.codeFont ?? "system-mono",
        zoomFactor: appSettings?.zoomFactor ?? 1,
        tagPushBehavior: appSettings?.gitBehaviors?.tagPushBehavior ?? DEFAULT_TAG_PUSH_BEHAVIOR,
        requireUpToDateUpstreamBeforeCommit: appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit ?? false,
        remoteCheckLeaseSeconds: appSettings?.gitBehaviors?.remoteCheckLeaseSeconds ?? DEFAULT_REMOTE_CHECK_LEASE_SECONDS,
        allowCherryPickingContainedCommits: appSettings?.gitBehaviors?.allowCherryPickingContainedCommits ?? false,
        shareAnonymousDiagnostics: appSettings?.privacy.shareAnonymousDiagnostics ?? DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS,
        gitIdentityName: gitIdentity?.global.name ?? "",
        gitIdentityEmail: gitIdentity?.global.email ?? "",
        gitIdentityScope: "global"
      }
    });
    void loadGitHubConnection();
  }, [loadGitHubConnection, updateState]);

  const closeSettingsDialog = useCallback((): void => {
    if (stateRef.current.settingsSaving) {
      return;
    }

    githubConnectionGenerationRef.current += 1;
    updateState({
      settingsOpen: false,
      settingsError: "",
      githubConnecting: false,
      githubDeviceFlow: null,
      githubConnectionError: ""
    });
    applyColorTheme(stateRef.current.appSettings?.colorTheme ?? "githead");
    void window.githead.setWindowZoomFactor(stateRef.current.appSettings?.zoomFactor ?? 1).catch(() => undefined);
  }, [updateState]);

  const saveSettings = useCallback(async (): Promise<void> => {
    const initial = stateRef.current;
    if (initial.settingsSaving) {
      return;
    }

    const draft = initial.settingsDraft;
    const repoPath = initial.repoPath;
    // Settings can remain in renderer-only preflight and preference writes for
    // their full lifetime, so the repository coordinator cannot track them.
    const operation = createActiveOperation("Saving settings", repoPath, "settings-save", {
      coordinated: false
    });
    updateState({
      activeOperation: operation,
      settingsError: "",
      settingsSaving: true
    });

    const isSaveCurrent = (): boolean => (
      isActiveOperationCurrent(operation.token) &&
      isSameRepoPath(repoPath, stateRef.current.repoPath)
    );

    try {
      const shouldSaveAiSettings = hasAiSettingsChanges(draft, initial.aiSettings);
      const shouldSaveAppSettings = hasAppSettingsChanges(draft, initial.appSettings);
      const hasGitIdentityValues = draft.gitIdentityName.trim().length > 0 || draft.gitIdentityEmail.trim().length > 0;
      const shouldSaveGitIdentity = hasGitIdentityValues && hasGitIdentityChanges(draft, initial.gitIdentity);
      let gitIdentity = initial.gitIdentity;
      let aiSettings = initial.aiSettings;
      let appSettings = initial.appSettings;

      if (shouldSaveGitIdentity) {
        gitIdentity = await window.githead.saveGitIdentity({
          repoPath,
          name: draft.gitIdentityName,
          email: draft.gitIdentityEmail,
          scope: "global",
          operationId: operation.operationId
        });
        if (!isSaveCurrent()) {
          return;
        }
      }

      if (shouldSaveAiSettings) {
        if (!isSaveCurrent()) return;
        aiSettings = await window.githead.saveAiSettings({
          selectedProvider: draft.selectedProvider,
          commitPlanGranularity: draft.commitPlanGranularity,
          providerModels: draft.providerModels,
          commitPlanModels: draft.commitPlanModels,
          commitPlanReasoningEfforts: draft.commitPlanReasoningEfforts,
          prDescriptionModels: draft.prDescriptionModels,
          reasoningEfforts: draft.reasoningEfforts,
          prDescriptionReasoningEfforts: draft.prDescriptionReasoningEfforts,
          apiKeys: draft.apiKeys,
          clearApiKeys: draft.clearApiKeys,
          commitMessagePrompt: draft.commitMessagePrompt,
          prDescriptionPrompt: draft.prDescriptionPrompt,
          sourceControlWritingStyle: draft.sourceControlWritingStyle
        });
        if (!isSaveCurrent()) return;
      }
      if (shouldSaveAppSettings) {
        if (!isSaveCurrent()) return;
        appSettings = await window.githead.saveAppSettings({
          autoFetchIntervalMinutes: parseAutoFetchIntervalDraft(draft.autoFetchIntervalMinutes),
          colorTheme: draft.colorTheme,
          appearanceMode: draft.appearanceMode,
          uiFont: draft.uiFont,
          codeFont: draft.codeFont,
          zoomFactor: draft.zoomFactor,
          statusFileViewMode: initial.appSettings?.statusFileViewMode ?? "list",
          wrapDiffLines: initial.appSettings?.wrapDiffLines ?? false,
          gitBehaviors: {
            tagPushBehavior: draft.tagPushBehavior,
            requireUpToDateUpstreamBeforeCommit: draft.requireUpToDateUpstreamBeforeCommit,
            remoteCheckLeaseSeconds: draft.remoteCheckLeaseSeconds,
            allowCherryPickingContainedCommits: draft.allowCherryPickingContainedCommits
          },
          privacy: { shareAnonymousDiagnostics: draft.shareAnonymousDiagnostics }
        });
        if (!isSaveCurrent()) return;
        publishTelemetryPreference(appSettings.privacy.shareAnonymousDiagnostics);
      }
      if (!isSaveCurrent()) return;
      updateState({
        gitIdentity,
        aiSettings,
        appSettings,
        settingsOpen: false
      });
    } catch (error) {
      if (!isSaveCurrent()) return;
      updateState({
        settingsError: error instanceof Error ? error.message : "Unable to save settings."
      });
    } finally {
      finishActiveOperation(operation.token);
    }
  }, [createActiveOperation, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const closeGitIdentityPrompt = useCallback((): void => {
    if (stateRef.current.gitIdentitySaving) {
      return;
    }

    updateState({
      gitIdentityPrompt: emptyGitIdentityPrompt
    });
  }, [updateState]);

  const saveGitIdentityPrompt = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const prompt = current.gitIdentityPrompt;
    if (!prompt.open || current.gitIdentitySaving) {
      return;
    }

    const repoPath = prompt.repoPath;
    if (!repoPath || !isSameRepoPath(repoPath, current.repoPath) || !current.summary?.isValid) {
      return;
    }
    if (prompt.scope === "repository" && !(await ensureTrustedRepo(repoPath))) {
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.gitIdentityPrompt.open
      && isSameRepoPath(latest.gitIdentityPrompt.repoPath, repoPath)
      && latest.gitIdentityPrompt.name === prompt.name
      && latest.gitIdentityPrompt.email === prompt.email
      && latest.gitIdentityPrompt.scope === prompt.scope
      && latest.gitIdentityPrompt.retryMessage === prompt.retryMessage
    ))) {
      return;
    }

    const operation = createActiveOperation("Saving Git identity", repoPath, "identity-save");

    updateState({
      activeOperation: operation,
      gitIdentitySaving: true,
      gitIdentityPrompt: {
        ...prompt,
        error: ""
      }
    });

    try {
      const gitIdentity = await window.githead.saveGitIdentity({
        repoPath,
        name: prompt.name,
        email: prompt.email,
        scope: prompt.scope,
        operationId: operation.operationId
      });
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      const retryMessage = prompt.retryMessage;

      finishActiveOperation(operation.token, (latest) => ({
        ...latest,
        gitIdentity,
        gitIdentityPrompt: emptyGitIdentityPrompt
      }));

      if (!isInvocationCurrent(repoPath)) {
        return;
      }

      const result = await runRepoOperation("Committing changes", null, (operationId) =>
        window.githead.commitChanges({
          repoPath,
          message: retryMessage,
          operationId
        })
      );

      if (result?.exitCode === 0) {
        updateState({
          commitMessage: ""
        });
      }
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token)) {
        return;
      }
      updateState((latest) => ({
        ...latest,
        gitIdentityPrompt: {
          ...latest.gitIdentityPrompt,
          error: error instanceof Error ? error.message : "Unable to save Git identity."
        }
      }));
    } finally {
      finishActiveOperation(operation.token);
    }
  }, [createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, isInvocationCurrent, runRepoOperation, updateState]);

  const openExternalUrl = useCallback((url: string): void => {
    void window.githead.openExternalUrl({
      url
    }).catch((error) => {
      updateState((current) => ({
        ...current,
        lastOperationResult: {
          repoPath: current.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to open link."
        }
      }));
    });
  }, [updateState]);

  const setWorkspaceView = useCallback((view: WorkspaceView): void => {
    if (stateRef.current.activeView === view) {
      return;
    }

    if (isGitHubView(view) && !stateRef.current.summary?.githubRepository) {
      return;
    }
    if (view === "stashes" && !stateRef.current.summary?.capabilities.stashes) {
      return;
    }

    activityLogStore.setViewing(view === "activity");
    updateState({
      activeView: view,
      ...(view === "activity" ? { operationButtonFeedback: null } : {})
    });
    if (view !== "status") setStashComposer(emptyStashComposer);

    const latest = stateRef.current;
    if (view === "status") {
      void refreshDirtyFileStatus({ reason: "user" });
    }
    if (view === "history" && !latest.historyLoading) {
      void loadCommitHistory(true);
    }
    if (view === "stashes") void stashWorkspace.refresh();
    if (view === "workflows") void github.ensure("workflowRuns");
    if (view === "pullRequests") void github.ensure("pullRequests");
    if (view === "issues") void github.ensure("issues");
  }, [activityLogStore, github.ensure, loadCommitHistory, refreshDirtyFileStatus, stashWorkspace.refresh, updateState]);

  useEffect(() => {
    if (
      state.activeView !== "stashes" ||
      stashWorkspace.state.loading ||
      stashWorkspace.state.entries.length > 0
    ) {
      return;
    }

    setWorkspaceView("status");
  }, [
    setWorkspaceView,
    stashWorkspace.state.entries.length,
    stashWorkspace.state.loading,
    state.activeView
  ]);

  const selectFile = useCallback((file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers): void => {
    const selection = buildFileSelection(
      stateRef.current.selection,
      getFilesForSide(stateRef.current.summary, side),
      file.path,
      side,
      modifiers
    );

    if (!selection) {
      requestIds.current.diff += 1;
      updateState({
        selection: null,
        diff: null,
        diffLoading: false,
        diffChanged: false
      });
      return;
    }

    updateState({
      selection,
      diff: null,
      diffChanged: false
    });
    void loadSelectedDiff(selection);
  }, [loadSelectedDiff, updateState]);

  const selectRepositoryOperationConflict = useCallback((filePath: string): void => {
    const file = stateRef.current.summary?.files.find((candidate) => candidate.path === filePath);
    if (!file) return;
    setWorkspaceView("status");
    setStatusWorkspaceMode("files");
    selectFile(file, file.isUnstaged ? "unstaged" : "staged", {
      extendRange: false,
      selectAll: false,
      toggle: false
    });
  }, [selectFile, setWorkspaceView]);

  const openRepositoryOperationConflict = useCallback((filePath: string): void => {
    const operation = stateRef.current.summary?.operationState;
    if (!operation?.conflictedPaths.includes(filePath)) return;
    selectRepositoryOperationConflict(filePath);
    setConflictResolverPath(filePath);
  }, [selectRepositoryOperationConflict]);

  const openRepositoryOperationConflictFile = useCallback((filePath: string): void => {
    const current = stateRef.current;
    if (!current.summary?.operationState || !current.summary.files.some((file) => file.path === filePath)) return;
    selectRepositoryOperationConflict(filePath);
    void runRepoOperation(`Opening conflicted file ${filePath}`, undefined, () => window.githead.openFile({
      repoPath: current.repoPath,
      path: filePath
    }), { cancellable: false });
  }, [runRepoOperation, selectRepositoryOperationConflict]);

  const saveRepositoryOperationConflict = useCallback(async (request: GitConflictResolutionSaveRequest): Promise<string | null> => {
    const result = await runRepoOperation(`Resolving ${request.path}`, undefined, (operationId) =>
      window.githead.saveConflictResolution({ ...request, operationId }));
    if (!result || result.exitCode !== 0) {
      return getOperationFailureMessage(result, "Unable to save and stage the conflict resolution.");
    }
    return null;
  }, [runRepoOperation]);

  const selectCommit = useCallback((hash: string): void => {
    if (!hash || hash === stateRef.current.selectedCommitHash) {
      return;
    }

    updateState({
      selectedCommitHash: hash,
      commitDetails: null,
      commitDetailsError: "",
      selectedCommitFilePath: null,
      commitFileDiff: null,
      commitFileDiffError: ""
    });
    void loadCommitDetails(hash);
  }, [loadCommitDetails, updateState]);

  const selectCommitFile = useCallback((filePath: string): void => {
    const current = stateRef.current;
    if (!filePath || !current.selectedCommitHash || filePath === current.selectedCommitFilePath) {
      return;
    }

    updateState({
      selectedCommitFilePath: filePath,
      commitFileDiff: null,
      commitFileDiffError: ""
    });
    void loadCommitFileDiff(current.selectedCommitHash, filePath);
  }, [loadCommitFileDiff, updateState]);

  const openTagDialog = useCallback((commit: GitCommitGraphRow): void => {
    const commitTag = getCommitTags(commit)[0]?.name ?? "";

    updateState({
      tagDialog: {
        ...emptyTagDialog,
        open: true,
        hash: commit.hash,
        deleteTagName: commitTag
      }
    });
  }, [updateState]);

  const closeTagDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      tagDialog: emptyTagDialog
    });
  }, [updateState]);

  const openResetCommitDialog = useCallback((commit: GitCommitGraphRow): void => {
    updateState({
      resetCommitDialog: {
        ...emptyResetCommitDialog,
        open: true,
        hash: commit.hash
      }
    });
  }, [updateState]);

  const closeResetCommitDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      resetCommitDialog: emptyResetCommitDialog
    });
  }, [updateState]);

  const openRevertCommitDialog = useCallback((commit: GitCommitGraphRow): void => {
    updateState({
      revertCommitDialog: {
        ...emptyRevertCommitDialog,
        open: true,
        hash: commit.hash
      }
    });
  }, [updateState]);

  const closeRevertCommitDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      revertCommitDialog: emptyRevertCommitDialog
    });
  }, [updateState]);

  const openResetCommitFileDialog = useCallback((file: GitCommitChangedFile): void => {
    const hash = stateRef.current.selectedCommitHash;
    if (!hash) {
      return;
    }

    updateState({
      resetCommitFileDialog: {
        ...emptyResetCommitFileDialog,
        open: true,
        hash,
        paths: [
          file.path
        ]
      }
    });
  }, [updateState]);

  const closeResetCommitFileDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      resetCommitFileDialog: emptyResetCommitFileDialog
    });
  }, [updateState]);

  const copyCommitShaToClipboard = useCallback(async (commit: GitCommitGraphRow): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }
    const repoPath = current.repoPath;

    try {
      const lastOperationResult = await window.githead.copyCommitShaToClipboard({
        repoPath,
        hash: commit.hash
      });
      if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return;
      }
      updateState({
        lastOperationResult
      });
      appendOperationLog("Copying commit SHA", lastOperationResult);
    } catch (error) {
      if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return;
      }
      const lastOperationResult: GitOperationResult = {
        repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Copying commit SHA failed."
      };
      updateState({
        lastOperationResult
      });
      appendOperationLog("Copying commit SHA", lastOperationResult);
    }
  }, [appendOperationLog, updateState]);

  const runCommitContextAction = useCallback((commit: GitCommitGraphRow, action: CommitContextActionKind): void => {
    if (commit.hash !== stateRef.current.selectedCommitHash) {
      selectCommit(commit.hash);
    }

    if (action === "tag") {
      openTagDialog(commit);
      return;
    }

    if (action === "reset") {
      openResetCommitDialog(commit);
      return;
    }

    if (action === "revert") {
      openRevertCommitDialog(commit);
      return;
    }

    if (action === "cherry-pick") {
      setIntegrationDialog({ kind: "cherry-pick", commitHash: commit.hash });
      return;
    }

    if (action === "amend") {
      openAmendDialog("history", commit.hash);
      return;
    }

    void copyCommitShaToClipboard(commit);
  }, [copyCommitShaToClipboard, openAmendDialog, openResetCommitDialog, openRevertCommitDialog, openTagDialog, selectCommit]);

  const runCommitFileContextAction = useCallback((file: GitCommitChangedFile, action: CommitFileContextActionKind): void => {
    const repoPath = stateRef.current.repoPath;
    const hash = stateRef.current.selectedCommitHash;
    if (!repoPath || !hash) {
      return;
    }

    if (action === "log") {
      if (stateRef.current.summary?.capabilities.fileHistory) void loadFileHistory(targetFromCommitFile(hash, file));
      return;
    }

    if (action === "blame") {
      if (file.status !== "D" && stateRef.current.summary?.capabilities.blame) void loadFileBlame(targetFromCommitFile(hash, file), "repository");
      return;
    }

    if (file.path !== stateRef.current.selectedCommitFilePath) {
      selectCommitFile(file.path);
    }

    if (action === "reset") {
      openResetCommitFileDialog(file);
      return;
    }

    if (action === "open-current") {
      void runRepoOperation("Opening current file version", undefined, () =>
        window.githead.openFile({
          repoPath,
          path: file.path
        }),
        { cancellable: false }
      );
      return;
    }

    if (action === "open-selected") {
      void runRepoOperation("Opening selected file version", undefined, (operationId) =>
        window.githead.openCommitFileVersion({
          repoPath,
          hash,
          path: file.path,
          operationId
        })
      );
      return;
    }

    void runRepoOperation("Copying path", undefined, () =>
      window.githead.copyPathToClipboard({
        repoPath,
        path: file.path
      }),
      { cancellable: false }
    );
  }, [loadFileBlame, loadFileHistory, openResetCommitFileDialog, runRepoOperation, selectCommitFile]);

  const createTag = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.tagDialog;
    const tagName = dialog.tagName.trim();
    const repoPath = current.repoPath;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    if (!tagName) {
      updateState({
        tagDialog: {
          ...dialog,
          error: "Enter a tag name."
        }
      });
      return;
    }

    updateState({
      tagDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.tagDialog.hash === dialog.hash) {
        updateState((latest) => ({
          ...latest,
          tagDialog: {
            ...latest.tagDialog,
            error: "Repository trust is required before creating tags."
          }
        }));
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.tagDialog.hash === dialog.hash && latest.tagDialog.tagName.trim() === tagName
    ))) return;

    const result = await runRepoOperation(`Creating tag ${tagName}`, null, (operationId) =>
      window.githead.createTag({
        repoPath,
        hash: dialog.hash,
        tagName,
        message: dialog.message,
        lightweight: dialog.lightweight,
        force: dialog.force,
        pushRemote: dialog.pushRemote,
        operationId
      })
    );

    if (result?.exitCode === 0) {
      updateState({
        tagDialog: emptyTagDialog
      });
      return;
    }

    updateState({
      tagDialog: {
        ...stateRef.current.tagDialog,
        error: getOperationFailureMessage(result, "Unable to create tag.")
      }
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const deleteTag = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.tagDialog;
    const tagName = dialog.deleteTagName.trim();
    const repoPath = current.repoPath;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    if (!tagName) {
      updateState({
        tagDialog: {
          ...dialog,
          error: "Select a tag to remove."
        }
      });
      return;
    }

    if (!dialog.deleteConfirmed) {
      updateState({
        tagDialog: {
          ...dialog,
          error: "Confirm that you understand this tag will be removed."
        }
      });
      return;
    }

    updateState({
      tagDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.tagDialog.hash === dialog.hash) {
        updateState((latest) => ({
          ...latest,
          tagDialog: {
            ...latest.tagDialog,
            error: "Repository trust is required before removing tags."
          }
        }));
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.tagDialog.hash === dialog.hash &&
      latest.tagDialog.deleteTagName.trim() === tagName &&
      latest.tagDialog.deleteConfirmed
    ))) return;

    const result = await runRepoOperation(`Removing tag ${tagName}`, null, (operationId) =>
      window.githead.deleteTag({
        repoPath,
        tagName,
        pushRemote: dialog.deletePushRemote,
        operationId
      })
    );

    if (result?.exitCode === 0) {
      updateState({
        tagDialog: emptyTagDialog
      });
      return;
    }

    updateState({
      tagDialog: {
        ...stateRef.current.tagDialog,
        error: getOperationFailureMessage(result, "Unable to remove tag.")
      }
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const resetBranchToCommit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.resetCommitDialog;
    const repoPath = current.repoPath;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    updateState({
      resetCommitDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.resetCommitDialog.hash === dialog.hash) {
        updateState((latest) => ({
          ...latest,
          resetCommitDialog: {
            ...latest.resetCommitDialog,
            error: "Repository trust is required before resetting branches."
          }
        }));
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.resetCommitDialog.hash === dialog.hash && latest.resetCommitDialog.mode === dialog.mode
    ))) return;

    const result = await runRepoOperation("Resetting branch to commit", null, (operationId) =>
      window.githead.resetBranchToCommit({
        repoPath,
        hash: dialog.hash,
        mode: dialog.mode,
        operationId
      })
    );

    if (result?.exitCode === 0) {
      updateState({
        resetCommitDialog: emptyResetCommitDialog
      });
      return;
    }

    updateState({
      resetCommitDialog: {
        ...stateRef.current.resetCommitDialog,
        error: getOperationFailureMessage(result, "Unable to reset branch.")
      }
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const resetFilesToCommit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.resetCommitFileDialog;
    const repoPath = current.repoPath;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash || dialog.paths.length === 0) {
      return;
    }

    updateState({
      resetCommitFileDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.resetCommitFileDialog.hash === dialog.hash) {
        updateState((latest) => ({
          ...latest,
          resetCommitFileDialog: {
            ...latest.resetCommitFileDialog,
            error: "Repository trust is required before resetting files."
          }
        }));
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => (
      latest.resetCommitFileDialog.hash === dialog.hash &&
      latest.resetCommitFileDialog.paths.join("\n") === dialog.paths.join("\n")
    ))) return;

    const result = await runRepoOperation(
      dialog.paths.length === 1 ? "Resetting file to commit" : "Resetting files to commit",
      null,
      (operationId) => window.githead.resetFilesToCommit({
        repoPath,
        hash: dialog.hash,
        paths: dialog.paths,
        operationId
      })
    );

    if (result?.exitCode === 0) {
      updateState({
        resetCommitFileDialog: emptyResetCommitFileDialog
      });
      return;
    }

    updateState({
      resetCommitFileDialog: {
        ...stateRef.current.resetCommitFileDialog,
        error: getOperationFailureMessage(result, "Unable to reset file.")
      }
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const copyResetCommitFileDialogPaths = useCallback(async (): Promise<void> => {
    const paths = stateRef.current.resetCommitFileDialog.paths;
    if (paths.length === 0) {
      return;
    }

    await window.githead.copyTextToClipboard({
      text: paths.join("\n")
    }).catch((error) => {
      updateState((current) => ({
        ...current,
        resetCommitFileDialog: {
          ...current.resetCommitFileDialog,
          error: error instanceof Error ? error.message : "Unable to copy file paths."
        }
      }));
    });
  }, [updateState]);

  const revertCommit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.revertCommitDialog;
    const repoPath = current.repoPath;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    updateState({
      revertCommitDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo(repoPath))) {
      if (isSameRepoPath(repoPath, stateRef.current.repoPath) && stateRef.current.revertCommitDialog.hash === dialog.hash) {
        updateState((latest) => ({
          ...latest,
          revertCommitDialog: {
            ...latest.revertCommitDialog,
            error: "Repository trust is required before reversing commits."
          }
        }));
      }
      return;
    }

    if (!isInvocationCurrent(repoPath, (latest) => latest.revertCommitDialog.hash === dialog.hash)) return;

    const result = await runRepoOperation("Reversing commit", null, (operationId) =>
      window.githead.revertCommit({
        repoPath,
        hash: dialog.hash,
        operationId
      })
    );

    if (result?.exitCode === 0) {
      updateState({
        revertCommitDialog: emptyRevertCommitDialog
      });
      return;
    }

    updateState({
      revertCommitDialog: {
        ...stateRef.current.revertCommitDialog,
        error: getOperationFailureMessage(result, "Unable to reverse commit.")
      }
    });
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

  const runContextFileOperation = useCallback(async (
    file: GitStatusFile,
    side: GitDiffSide,
    kind: ContextActionKind,
    explicitPaths?: string[]
  ): Promise<void> => {
    if (
      stateRef.current.summary?.operationState &&
      kind !== "toggle-stage" &&
      kind !== "open" &&
      kind !== "show" &&
      kind !== "copy"
    ) return;
    const paths = explicitPaths ?? getContextActionPaths(stateRef.current.selection, file, side);

    if (kind === "stash") {
      setStashComposer({ open: true, paths });
      return;
    }

    if (kind === "toggle-stage") {
      if (side === "unstaged") {
        await stageFiles(paths, {
          path: paths.includes(file.path) ? file.path : paths[0]!,
          side: "staged",
          paths,
          anchorPath: getContextActionAnchorPath(stateRef.current.selection, paths, file.path)
        });
      } else {
        await unstageFiles(paths, {
          path: paths.includes(file.path) ? file.path : paths[0]!,
          side: "unstaged",
          paths,
          anchorPath: getContextActionAnchorPath(stateRef.current.selection, paths, file.path)
        });
      }
      return;
    }

    const repoPath = stateRef.current.repoPath;
    if (kind === "update-submodule") {
      await runRepoOperation(`Updating submodule ${file.path}`, undefined, (operationId) =>
        window.githead.updateSubmodules({ repoPath, path: file.path, operationId })
      );
      return;
    }
    if (kind === "open") {
      if (file.submodule) {
        await switchRepo(`${repoPath.replace(/[\\/]+$/, "")}/${file.path}`, { addToRecents: true });
        return;
      }
      await runRepoOperation("Opening file", undefined, () =>
        window.githead.openFile({
          repoPath,
          path: file.path
        }),
        { cancellable: false }
      );
      return;
    }
    if (kind === "show") {
      await runRepoOperation("Showing file in Explorer", undefined, () =>
        window.githead.showInExplorer({
          repoPath,
          path: file.path
        }),
        { cancellable: false }
      );
      return;
    }
    if (kind === "copy") {
      await runRepoOperation("Copying path", undefined, () =>
        window.githead.copyPathToClipboard({
          repoPath,
          path: file.path
        }),
        { cancellable: false }
      );
      return;
    }
    if (kind === "delete") {
      await runRepoOperation(paths.length === 1 ? "Deleting file" : "Deleting files", null, (operationId) =>
        window.githead.deleteFiles({
          repoPath,
          paths,
          operationId
        })
      );
      return;
    }
    if (kind === "revert") {
      await runRepoOperation(paths.length === 1 ? "Reverting changes" : "Reverting selected changes", null, (operationId) =>
        window.githead.revertFileChanges({
          repoPath,
          paths,
          side,
          operationId
        })
      );
      return;
    }

    await runRepoOperation("Adding to ignore", undefined, (operationId) =>
      window.githead.addPathToIgnore({
        repoPath,
        path: file.path,
        operationId
      })
    );
  }, [runRepoOperation, stageFiles, switchRepo, unstageFiles]);

  const updateSubmodules = useCallback(async (path?: string): Promise<void> => {
    await runRepoOperation(path ? `Updating submodule ${path}` : "Updating submodules", undefined, (operationId) =>
      window.githead.updateSubmodules({ repoPath: stateRef.current.repoPath, ...(path ? { path } : {}), operationId })
    );
  }, [runRepoOperation]);

  const syncSubmodules = useCallback(async (): Promise<void> => {
    await runRepoOperation("Synchronizing submodule URLs", undefined, (operationId) =>
      window.githead.syncSubmodules({ repoPath: stateRef.current.repoPath, operationId })
    );
  }, [runRepoOperation]);

  const checkForAppUpdates = useCallback(async (): Promise<void> => {
    try {
      const result = await window.githead.checkForUpdates();
      updateState({
        appUpdate: result.state
      });
    } catch (error) {
      updateState((current) => markAppUpdateError(current, "check", error));
    }
  }, [updateState]);

  const downloadAppUpdate = useCallback(async (): Promise<void> => {
    try {
      const result = await window.githead.downloadUpdate();
      updateState({
        appUpdate: result.state
      });
    } catch (error) {
      updateState((current) => markAppUpdateError(current, "download", error));
    }
  }, [updateState]);

  const installAppUpdate = useCallback(async (): Promise<void> => {
    try {
      const result = await window.githead.installUpdate();
      updateState({
        appUpdate: result.state
      });
    } catch (error) {
      updateState((current) => markAppUpdateError(current, "install", error));
    }
  }, [updateState]);

  const minimizeWindow = useCallback((): void => {
    void window.githead.minimizeWindow()
      .then(setWindowState)
      .catch(() => undefined);
  }, []);

  const toggleMaximizeWindow = useCallback((): void => {
    void window.githead.toggleMaximizeWindow()
      .then(setWindowState)
      .catch(() => undefined);
  }, []);

  const closeWindow = useCallback((): void => {
    void window.githead.closeWindow().catch(() => undefined);
  }, []);

  const cancelRunningOperation = useCallback(async (
    requestedTarget?: RendererCancellationTarget,
    onMissing?: () => void
  ): Promise<void> => {
    const current = stateRef.current;
    const active = current.activeOperation?.cancellable ? current.activeOperation : null;
    const hasUnrelatedOwner = Boolean(
      current.activeOperation || current.runningAction || current.runningOperation ||
      current.cloneRunning || current.cloneCheckRunning || current.safeDirectoryRunning ||
      current.settingsSaving || current.gitIdentitySaving || current.actionManager.savingTarget
    );
    const configured = active || hasUnrelatedOwner ? null : current.configuredActionRuns.at(-1) ?? null;
    const target = requestedTarget ?? (active
      ? { kind: "active" as const, token: active.token, operationId: active.operationId }
      : configured
        ? { kind: "configured" as const, id: configured.id, operationId: configured.operationId }
        : null);
    if (!target) return;

    const targetStillExists = target.kind === "active"
      ? current.activeOperation?.token === target.token && current.activeOperation.operationId === target.operationId
      : current.configuredActionRuns.some((run) => run.id === target.id && run.operationId === target.operationId);
    if (!targetStillExists) return;

    updateState((latest) => target.kind === "active"
      ? latest.activeOperation?.token === target.token
        ? {
            ...latest,
            activeOperation: {
              ...latest.activeOperation,
              cancelStatus: "canceling",
              cancelError: ""
            }
          }
        : latest
      : {
          ...latest,
          configuredActionRuns: latest.configuredActionRuns.map((run) => run.id === target.id
            ? { ...run, cancelStatus: "canceling", cancelError: "" }
            : run)
        });

    try {
      const result = await window.githead.cancelGitOperation({ operationId: target.operationId });
      if (result.accepted) {
        return;
      }

      if (result.state === "not-found") {
        recoverMissingOperations([target.operationId]);
        onMissing?.();
        return;
      }

      const cancelError = "This operation belongs to another app session and cannot be canceled here.";
      updateState((latest) => target.kind === "active"
        ? latest.activeOperation?.token === target.token
          ? {
              ...latest,
              activeOperation: {
                ...latest.activeOperation,
                cancelStatus: "error",
                cancelError
              }
            }
          : latest
        : {
            ...latest,
            configuredActionRuns: latest.configuredActionRuns.map((run) => run.id === target.id
              ? { ...run, cancelStatus: "error", cancelError }
              : run)
          });
    } catch (error) {
      const cancelError = error instanceof Error ? error.message : "Unable to request cancellation.";
      updateState((latest) => target.kind === "active"
        ? latest.activeOperation?.token === target.token
          ? {
              ...latest,
              activeOperation: {
                ...latest.activeOperation,
                cancelStatus: "error",
                cancelError
              }
            }
          : latest
        : {
            ...latest,
            configuredActionRuns: latest.configuredActionRuns.map((run) => run.id === target.id
              ? { ...run, cancelStatus: "error", cancelError }
              : run)
          });
    }
  }, [recoverMissingOperations, updateState]);

  const requestModalClose = useCallback((
    operationKinds: readonly ActiveRendererOperationKind[],
    close: () => void
  ): void => {
    const active = stateRef.current.activeOperation;
    if (!active || !operationKinds.includes(active.kind)) {
      close();
      return;
    }

    if (active.cancellable) {
      void cancelRunningOperation({
        kind: "active",
        token: active.token,
        operationId: active.operationId
      }, close);
    }
  }, [cancelRunningOperation]);

  const stagedFiles = useMemo(() => getStagedFiles(state.summary), [state.summary]);
  const unstagedFiles = useMemo(() => getUnstagedFiles(state.summary), [state.summary]);
  const running = isOperationRunning(state);
  const isValid = state.summary?.isValid ?? false;
  const disableActions = running || !isValid;
  const repositoryOperationActive = Boolean(state.summary?.operationState);
  const disableUnrelatedMutations = disableActions || repositoryOperationActive;
  const primaryCommitAction = getPrimaryCommitAction(state.summary);
  const actionHeading = getActionHeading(state);
  const cancellationTarget = state.activeOperation
    ? state.activeOperation.cancellable ? state.activeOperation : null
    : state.runningAction || state.runningOperation || state.cloneRunning || state.cloneCheckRunning ||
      state.safeDirectoryRunning || state.settingsSaving || state.gitIdentitySaving || state.actionManager.savingTarget
      ? null
      : state.configuredActionRuns.at(-1) ?? null;
  const cancellationRequestTarget: RendererCancellationTarget | null = cancellationTarget
    ? "token" in cancellationTarget
      ? { kind: "active", token: cancellationTarget.token, operationId: cancellationTarget.operationId }
      : { kind: "configured", id: cancellationTarget.id, operationId: cancellationTarget.operationId }
    : null;
  const cloneCancellation = state.activeOperation?.kind === "clone" || state.activeOperation?.kind === "clone-check"
    ? state.activeOperation
    : null;
  const cloneCancellationRequestTarget: RendererCancellationTarget | null = cloneCancellation
    ? { kind: "active", token: cloneCancellation.token, operationId: cloneCancellation.operationId }
    : null;
  const showGitHubTabs = Boolean(state.summary?.githubRepository);
  const showStashesTab = Boolean(
    state.summary?.capabilities.stashes && stashWorkspace.state.entries.length > 0
  );
  const pullRequestTabCount = github.counts.data ? formatCompactCount(github.counts.data.pullRequests) : null;
  const issueTabCount = github.counts.data ? formatCompactCount(github.counts.data.issues) : null;
  const activityLogAttentionState = state.activeView === "activity" ? "none" : activityLogAttention;
  const hasUnreadActivityLog = activityLogAttentionState !== "none";
  const hasUnviewedOperationError = activityLogAttentionState === "error";

  if (state.startupStatus === "loading") {
    return (
      <AppChrome
        isMaximized={windowState.isMaximized}
        onMinimize={minimizeWindow}
        onToggleMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
      >
        <StartupScreen repositoryName={getRepoDisplayName(state.repoPath)} />
      </AppChrome>
    );
  }

  if (state.showSetup) {
    return (
      <AppChrome
        isMaximized={windowState.isMaximized}
        onMinimize={minimizeWindow}
        onToggleMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
      >
        <RepositorySetupScreen
          repoRecents={state.repoRecents}
          repoSyncStatuses={state.repoSyncStatuses}
          selectedRepoPath={state.repoPath}
          setupError={state.setupError}
          safeDirectory={state.summary?.safeDirectory ?? null}
          safeDirectoryRunning={state.safeDirectoryRunning}
          cloneDraft={state.cloneDraft}
          cloneError={state.cloneError}
          cloneRunning={state.cloneRunning}
          cloneCheckRunning={state.cloneCheckRunning}
          cloneCheckStatus={state.cloneCheckStatus}
          cloneCheckMessage={state.cloneCheckMessage}
          cloneBranches={state.cloneBranches}
          cancelStatus={cloneCancellation?.cancelStatus ?? "idle"}
          cancelError={cloneCancellation?.cancelError ?? ""}
          running={running}
          onChooseRepo={() => {
            void chooseRepo();
          }}
          onOpenSafeDirectoryDialog={openSafeDirectoryDialog}
          onSelectRecent={(repoPath) => {
            void selectRecentRepo(repoPath);
          }}
          onRemoveRecent={(repoPath) => {
            void removeRecentRepo(repoPath);
          }}
          onRecoverRecent={recoverRecentRepo}
          onReorderRepositories={(repoPaths) => {
            void reorderRepositories(repoPaths);
          }}
          onShowInExplorer={(repoPath) => {
            void showRecentRepositoryInExplorer(repoPath);
          }}
          onOpenRepositorySettings={setRepositorySettingsPath}
          onCloneDraftChange={updateCloneDraft}
          onCloneSourceChange={(draft) => {
            updateCloneDraft(draft);
            resetCloneCheckState();
          }}
          onChooseCloneParent={() => {
            void chooseCloneParent();
          }}
          onCheckRepositoryAccess={() => {
            void checkRepositoryAccess();
          }}
          onClone={(event) => {
            event.preventDefault();
            void cloneRepository();
          }}
          onCancelOperation={() => {
            if (cloneCancellationRequestTarget) void cancelRunningOperation(cloneCancellationRequestTarget);
          }}
        />
        <SafeDirectoryDialog
          open={state.safeDirectoryDialogOpen}
          safeDirectory={state.summary?.safeDirectory ?? null}
          saving={state.safeDirectoryRunning}
          onCancel={() => requestModalClose(["safe-directory"], closeSafeDirectoryDialog)}
          onAllow={() => {
            void allowSafeDirectory();
          }}
        />
        <RepositorySettingsDialog open={Boolean(repositorySettingsPath)} repoPath={repositorySettingsPath} onOpenChange={(open) => { if (!open) setRepositorySettingsPath(""); }} onSaved={handleRepositorySettingsSaved} onSaveGitIdentity={saveRepositoryGitIdentity} />
      </AppChrome>
    );
  }

  const selectedFileHistoryEntry = state.fileHistoryEntries.find((entry) => entry.hash === state.selectedFileHistoryHash) ?? null;

  return (
    <AppChrome
      isMaximized={windowState.isMaximized}
      onMinimize={minimizeWindow}
      onToggleMaximize={toggleMaximizeWindow}
      onClose={closeWindow}
    >
      <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
        <ResizablePanel defaultSize="27%" minSize="292px" maxSize="460px" className="min-w-[292px]">
          <RepositoryPanel
            repoPath={state.repoPath}
            repoRecents={state.repoRecents}
            repositoryGroups={state.repositoryGroups}
            repoSyncStatuses={state.repoSyncStatuses}
            summary={state.summary}
            upstreamError={state.upstreamError}
            running={running || repositoryOperationActive}
            appUpdate={state.appUpdate}
            clonePanelOpen={state.clonePanelOpen}
            cloneDraft={state.cloneDraft}
            cloneError={state.cloneError}
            cloneRunning={state.cloneRunning}
            cloneCheckRunning={state.cloneCheckRunning}
            cloneCheckStatus={state.cloneCheckStatus}
            cloneCheckMessage={state.cloneCheckMessage}
            cloneBranches={state.cloneBranches}
            cancelStatus={cloneCancellation?.cancelStatus ?? "idle"}
            cancelError={cloneCancellation?.cancelError ?? ""}
            onClonePanelOpenChange={setClonePanelOpen}
            onChooseRepo={() => {
              void chooseRepo();
            }}
            onSelectRecent={(repoPath) => {
              void selectRecentRepo(repoPath);
            }}
            onRemoveRecent={(repoPath) => {
              void removeRecentRepo(repoPath);
            }}
            onRecoverRecent={recoverRecentRepo}
            onReorderRepositories={(repoPaths) => {
              void reorderRepositories(repoPaths);
            }}
            onShowInExplorer={(repoPath) => {
              void showRecentRepositoryInExplorer(repoPath);
            }}
            onOpenRepositorySettings={setRepositorySettingsPath}
            onAddWorktree={openWorktreeDialog}
            onRemoveWorktree={(worktree) => { void openWorktreeRemoval(worktree); }}
            onSwitchBranch={(branchName) => {
              void switchBranch(branchName);
            }}
            onCheckoutRemoteBranch={checkoutRemoteBranch}
            onOpenBranchDialog={openBranchDialog}
            onOpenBranchManager={openBranchManager}
            onOpenMerge={() => setIntegrationDialog({ kind: "merge" })}
            onOpenRebase={() => setIntegrationDialog({ kind: "rebase" })}
            onChangeUpstream={(upstream) => {
              void setBranchUpstream(upstream);
            }}
            onOpenRemoteManager={openRemoteManager}
            onOpenExternalUrl={openExternalUrl}
            onOpenSettings={() => openSettingsDialog()}
            onCloneDraftChange={updateCloneDraft}
            onCloneSourceChange={(draft) => {
              updateCloneDraft(draft);
              resetCloneCheckState();
            }}
            onChooseCloneParent={() => {
              void chooseCloneParent();
            }}
            onCheckRepositoryAccess={() => {
              void checkRepositoryAccess();
            }}
            onClone={(event) => {
              event.preventDefault();
              void cloneRepository();
            }}
            onCancelOperation={() => {
              if (cloneCancellationRequestTarget) void cancelRunningOperation(cloneCancellationRequestTarget);
            }}
            onCheckForUpdates={() => {
              void checkForAppUpdates();
            }}
            onDownloadUpdate={() => {
              void downloadAppUpdate();
            }}
            onInstallUpdate={() => {
              void installAppUpdate();
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="520px">
          <section className="flex h-full min-w-0 flex-col overflow-hidden">
            <ActionBar
              heading={actionHeading}
              summary={state.summary}
              runningAction={state.runningAction}
              feedbackEvent={state.operationButtonFeedback?.repoPath === state.repoPath ? state.operationButtonFeedback : null}
              configuredActionRuns={state.configuredActionRuns}
              disabled={disableUnrelatedMutations}
              cancellable={Boolean(cancellationTarget)}
              cancelStatus={cancellationTarget?.cancelStatus ?? "idle"}
              cancelError={cancellationTarget?.cancelError ?? ""}
              showCreatePullRequest={shouldShowCreatePullRequest(state.summary, historyInsights.data.currentBranchPullRequests, historyInsights.loaded)}
              branchPullRequests={historyInsights.data.currentBranchPullRequests}
              pullRecovery={state.pullRecovery}
              onOpenExternalUrl={openExternalUrl}
              onRunAction={(action) => {
                if (action === "pull" && stateRef.current.pullRecovery) {
                  updateState({ pullRecoveryOpen: true, pullRecoveryError: "" });
                } else {
                  void runAction(action, undefined, "action-bar");
                }
              }}
              onOpenPushToBranch={openPushToBranchDialog}
              onRunConfiguredAction={(action) => {
                void runConfiguredAction(action);
              }}
              onManageActions={openActionManager}
              onCreatePullRequest={openCreatePrDialog}
              onCancel={() => {
                if (cancellationRequestTarget) void cancelRunningOperation(cancellationRequestTarget);
              }}
            />

            {state.summary?.operationState ? (
              <GitOperationRecoveryBanner
                state={state.summary.operationState}
                busy={running}
                cancellable={Boolean(cancellationRequestTarget)}
                error={state.repositoryOperationError}
                onAction={(action) => { void resolveRepositoryOperation(action); }}
                onOpenConflict={openRepositoryOperationConflict}
                onOpenConflictFile={openRepositoryOperationConflictFile}
                onCancel={() => {
                  if (cancellationRequestTarget) void cancelRunningOperation(cancellationRequestTarget);
                }}
              />
            ) : null}

            <WorkspacePanelStateProvider
              key={getRepoPathKey(state.repoPath) || "setup"}
              store={workspacePanelStateStore}
              namespace={getRepoPathKey(state.repoPath) || "setup"}
            >
              <Tabs
                value={state.activeView}
                onValueChange={(value) => {
                  setWorkspaceView(value as WorkspaceView);
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
              <div className="workspace-tabs-bar border-b bg-card px-6 pt-2">
                <TabsList variant="line" className="h-9 w-max min-w-full bg-transparent p-0">
                  <TabsTrigger value="status" className="workspace-tab-trigger h-9 rounded-none">
                    <ListTree />
                    File Status
                  </TabsTrigger>
                  {showStashesTab ? (
                    <TabsTrigger
                      value="stashes"
                      aria-label={stashWorkspace.state.entries.length ? `Stashes ${stashWorkspace.state.entries.length}` : "Stashes"}
                      className="workspace-tab-trigger h-9 rounded-none"
                    >
                      <Archive />
                      Stashes
                      {stashWorkspace.state.entries.length ? <span className="workspace-tab-count">{stashWorkspace.state.entries.length}</span> : null}
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="history" className="workspace-tab-trigger h-9 rounded-none">
                    <History />
                    Commit History
                  </TabsTrigger>
                  {showGitHubTabs ? (
                    <>
                      <TabsTrigger value="workflows" className="workspace-tab-trigger h-9 rounded-none">
                        <Workflow />
                        Workflow Runs
                      </TabsTrigger>
                      <TabsTrigger
                        value="pullRequests"
                        aria-label={pullRequestTabCount ? `Pull Requests ${pullRequestTabCount}` : "Pull Requests"}
                        className="workspace-tab-trigger h-9 rounded-none"
                      >
                        <GitPullRequest />
                        Pull Requests
                        {pullRequestTabCount ? <span className="workspace-tab-count">{pullRequestTabCount}</span> : null}
                      </TabsTrigger>
                      <TabsTrigger
                        value="issues"
                        aria-label={issueTabCount ? `Issues ${issueTabCount}` : "Issues"}
                        className="workspace-tab-trigger h-9 rounded-none"
                      >
                        <CircleDot />
                        Issues
                        {issueTabCount ? <span className="workspace-tab-count">{issueTabCount}</span> : null}
                      </TabsTrigger>
                    </>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value="activity"
                        aria-label={hasUnviewedOperationError
                          ? "Activity Log, unread error details available"
                          : hasUnreadActivityLog ? "Activity Log, unread output available" : "Activity Log"}
                        className="workspace-tab-trigger workspace-tab-trigger-end activity-log-tab h-9 rounded-none"
                        data-attention={hasUnviewedOperationError ? "error" : hasUnreadActivityLog ? "unread" : "none"}
                      >
                        <Clipboard />
                        <span className="activity-log-attention-indicator" aria-hidden="true" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{hasUnviewedOperationError
                      ? "View unread error details in Activity Log"
                      : hasUnreadActivityLog ? "View unread Activity Log output" : "Activity Log"}</TooltipContent>
                  </Tooltip>
                </TabsList>
              </div>

              <PersistentWorkspaceTabsContent panelKey="status" active={state.activeView === "status"} value="status" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <StatusView
                  stagedFiles={stagedFiles}
                  unstagedFiles={unstagedFiles}
                  summary={state.summary}
                  selection={state.selection}
                  diff={state.diff}
                  diffLoading={state.diffLoading}
                  diffChanged={state.diffChanged}
                  disabled={disableActions}
                  recoveryMode={repositoryOperationActive}
                  workspaceMode={statusWorkspaceMode}
                  onWorkspaceModeChange={setStatusWorkspaceMode}
                  viewMode={state.appSettings?.statusFileViewMode ?? "list"}
                  onViewModeChange={(statusFileViewMode) => saveAppSettingsPreference(
                    { statusFileViewMode },
                    "Unable to save the file view preference."
                  )}
                  wrapLines={state.appSettings?.wrapDiffLines ?? false}
                  onWrapLinesChange={setWrapDiffLines}
                  onSelectFile={selectFile}
                  onStageFiles={(paths, selection) => {
                    void stageFiles(paths, selection);
                  }}
                  onUnstageFiles={(paths, selection) => {
                    void unstageFiles(paths, selection);
                  }}
                  onRefreshDiff={() => {
                    void loadSelectedDiff();
                  }}
                  onDownloadImage={() => { void downloadStatusLfsPreview(); }}
                  onApplyHunk={(patch) => {
                    void applySelectedHunk(patch);
                  }}
                  onContextAction={(file, side, kind, paths) => {
                    void runContextFileOperation(file, side, kind, paths);
                  }}
                  onUpdateSubmodules={(path) => { void updateSubmodules(path); }}
                  onSyncSubmodules={() => { void syncSubmodules(); }}
                  canGeneratePlan={canUseSelectedAiProvider(state.aiSettings)}
                  generatePlanTitle={getCommitPlanGenerateTitle(state)}
                  repositoryChangeVersion={workingTreeChangeVersion}
                  onGeneratePlan={generateCommitPlan}
                  onQuickCommit={quickCommitPlannedFiles}
                  composer={stashComposer.open ? (
                    <StashComposerDialog
                      open
                      branch={state.summary?.branch ?? null}
                      files={state.summary?.files ?? []}
                      selectedPaths={stashComposer.paths}
                      disabled={disableUnrelatedMutations}
                      canGenerateMessage={canUseSelectedAiProvider(state.aiSettings)}
                      generateTitle={getStashGenerateMessageTitle(state)}
                      onClose={() => setStashComposer(emptyStashComposer)}
                      onManage={() => setWorkspaceView("stashes")}
                      onCreate={createStash}
                      onGenerateMessage={generateStashMessage}
                    />
                  ) : null}
                />
              </PersistentWorkspaceTabsContent>

              {showStashesTab ? (
                <PersistentWorkspaceTabsContent panelKey="stashes" active={state.activeView === "stashes"} value="stashes" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                  <StashesView
                    entries={stashWorkspace.state.entries}
                    loading={stashWorkspace.state.loading}
                    error={stashWorkspace.state.error}
                    selectedRef={stashWorkspace.state.selectedRef}
                    details={stashWorkspace.state.details}
                    detailsLoading={stashWorkspace.state.detailsLoading}
                    detailsError={stashWorkspace.state.detailsError}
                    selectedFilePath={stashWorkspace.state.selectedFilePath}
                    disabled={disableUnrelatedMutations}
                    diffContent={
                      <DiffPanel
                        title={stashWorkspace.state.selectedFilePath ?? "Select a file"}
                        eyebrow="Stash diff"
                        diff={stashWorkspace.state.diff}
                        filePath={stashWorkspace.state.selectedFilePath ?? ""}
                        loading={stashWorkspace.state.diffLoading}
                        emptyMessage={stashWorkspace.state.diffError || "Select a file to view its diff"}
                        repoPath={state.repoPath}
                        wrapLines={state.appSettings?.wrapDiffLines ?? false}
                        onWrapLinesChange={setWrapDiffLines}
                      />
                    }
                    onRefresh={() => { void stashWorkspace.refresh(); }}
                    onSelect={(stashRef) => { void stashWorkspace.select(stashRef); }}
                    onSelectFile={stashWorkspace.selectFile}
                    onApply={applyStash}
                    onPop={popStash}
                    onDrop={dropStash}
                    onCreateBranch={createBranchFromStash}
                  />
                </PersistentWorkspaceTabsContent>
              ) : null}

              <PersistentWorkspaceTabsContent panelKey="history" active={state.activeView === "history"} preserveMount value="history" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                {state.historyRoute.kind === "file" ? (
                  <OptionalFeatureBoundary name="file history">
                  <FileHistoryView
                    path={state.historyRoute.origin.path}
                    entries={state.fileHistoryEntries}
                    selectedHash={state.selectedFileHistoryHash}
                    loading={state.fileHistoryLoading}
                    error={state.fileHistoryError}
                    hasMore={state.fileHistoryHasMore}
                    onBack={() => {
                      cancelRepositoryRead("file-history", requestIds.current.fileHistory);
                      cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
                      requestIds.current.fileHistory += 1;
                      requestIds.current.fileHistoryDiff += 1;
                      updateState({ historyRoute: repositoryHistoryRoute });
                    }}
                    onRetry={() => { void loadFileHistory(state.historyRoute.kind === "file" ? state.historyRoute.origin : state.fileHistoryOrigin!); }}
                    onSelect={(entry) => { void loadFileHistoryDiff(entry); }}
                    onBlame={(entry) => { void loadFileBlame(targetFromHistoryEntry(entry), "file"); }}
                    diffContent={
                      <DiffPanel
                        title={selectedFileHistoryEntry?.path ?? state.historyRoute.origin.path}
                        eyebrow="File history diff"
                        diff={state.fileHistoryDiff}
                        filePath={selectedFileHistoryEntry?.path ?? state.historyRoute.origin.path}
                        loading={state.fileHistoryDiffLoading}
                        emptyMessage={state.fileHistoryDiffError || "Select a change to view its diff"}
                        repoPath={state.repoPath}
                        wrapLines={state.appSettings?.wrapDiffLines ?? false}
                        onWrapLinesChange={setWrapDiffLines}
                      />
                    }
                  />
                  </OptionalFeatureBoundary>
                ) : state.historyRoute.kind === "blame" ? (
                  <OptionalFeatureBoundary name="blame view">
                  <BlameView
                    path={state.historyRoute.target.path}
                    result={state.fileBlame}
                    loading={state.fileBlameLoading}
                    error={state.fileBlameError}
                    backLabel={state.historyRoute.returnTo === "file" ? "Back to File History" : "Back"}
                    onBack={() => {
                      cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
                      requestIds.current.fileBlame += 1;
                      updateState({ historyRoute: state.historyRoute.kind === "blame" && state.historyRoute.returnTo === "file" && state.fileHistoryOrigin ? { kind: "file", origin: state.fileHistoryOrigin } : repositoryHistoryRoute });
                    }}
                    onRetry={() => { if (state.historyRoute.kind === "blame") void loadFileBlame(state.historyRoute.target, state.historyRoute.returnTo); }}
                    onOpenCommit={(hash) => {
                      cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
                      requestIds.current.fileBlame += 1;
                      updateState({ historyRoute: repositoryHistoryRoute });
                      selectCommit(hash);
                    }}
                  />
                  </OptionalFeatureBoundary>
                ) : <HistoryView
                  summary={state.summary}
                  historyScope={state.historyScope}
                  history={state.history}
                  historyLoading={state.historyLoading}
                  historyError={state.historyError}
                  selectedCommitHash={state.selectedCommitHash}
                  commitDetails={state.commitDetails}
                  commitDetailsLoading={state.commitDetailsLoading}
                  commitDetailsError={state.commitDetailsError}
                  selectedCommitFilePath={state.selectedCommitFilePath}
                  commitFileDiff={state.commitFileDiff}
                  commitFileDiffLoading={state.commitFileDiffLoading}
                  commitFileDiffError={state.commitFileDiffError}
                  wrapLines={state.appSettings?.wrapDiffLines ?? false}
                  allowCherryPickingContainedCommits={state.appSettings?.gitBehaviors?.allowCherryPickingContainedCommits ?? false}
                  disabled={disableUnrelatedMutations}
                  insights={historyInsights.data}
                  insightsLoading={historyInsights.loading}
                  insightsError={historyInsights.error}
                  onRetryInsights={historyInsights.retry}
                  onOpenExternalUrl={openExternalUrl}
                  onHistoryScopeChange={changeHistoryScope}
                  onSelectCommit={selectCommit}
                  onSelectCommitFile={selectCommitFile}
                  onCommitContextAction={runCommitContextAction}
                  currentHeadHash={getCurrentHistoryHeadSha(state.history, state.historyScope, state.summary?.branch ?? null)}
                  amendDisabledReason={getAmendDisabledReason(state)}
                  onCommitFileContextAction={runCommitFileContextAction}
                  onDownloadImage={() => { void downloadCommitLfsPreview(); }}
                  onWrapLinesChange={setWrapDiffLines}
                />}
              </PersistentWorkspaceTabsContent>

              {showGitHubTabs ? (
                <>
                  <PersistentWorkspaceTabsContent panelKey="workflows" active={state.activeView === "workflows"} value="workflows" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <WorkflowRunsView
                      active={state.activeView === "workflows"}
                      summary={state.summary}
                      workflowRuns={github.workflows.data ?? []}
                      loading={github.workflows.status === "loading"}
                      busy={github.workflows.status === "refreshing"}
                      loaded={github.workflows.data !== undefined}
                      error={github.workflows.error}
                      failure={github.workflows.failure}
                      nextPage={github.workflows.nextPage}
                      loadingMore={github.workflows.loadingMore}
                      totalCount={github.workflows.totalCount}
                      query={workflowQuery}
                      search={workflowSearch}
                      preset={workflowPreset}
                      onQueryChange={setWorkflowQuery}
                      onSearchChange={setWorkflowSearch}
                      onPresetChange={setWorkflowPreset}
                      onLoadMore={github.workflows.loadMore}
                      onOpenExternalUrl={openExternalUrl}
                      onRefresh={() => {
                        void github.refresh("workflowRuns");
                      }}
                      onConnectGitHub={() => openSettingsDialog("integrations")}
                      onReviewAccess={() => { void window.githead.openExternalUrl({ url: GITHUB_APP_INSTALL_URL }); }}
                      onCheckRemote={openRemoteManager}
                    />
                  </PersistentWorkspaceTabsContent>

                  <PersistentWorkspaceTabsContent panelKey="pullRequests" active={state.activeView === "pullRequests"} value="pullRequests" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <PullRequestsView
                      active={state.activeView === "pullRequests"}
                      summary={state.summary}
                      pullRequests={github.pullRequests.data ?? []}
                      openCount={github.counts.data?.pullRequests ?? null}
                      loading={github.pullRequests.status === "loading"}
                      busy={github.pullRequests.status === "refreshing"}
                      loaded={github.pullRequests.data !== undefined}
                      error={github.pullRequests.error}
                      failure={github.pullRequests.failure}
                      nextPage={github.pullRequests.nextPage}
                      loadingMore={github.pullRequests.loadingMore}
                      totalCount={github.pullRequests.totalCount}
                      query={pullRequestQuery}
                      preset={pullRequestPreset}
                      viewerLogin={github.viewer.data?.login ?? null}
                      onQueryChange={setPullRequestQuery}
                      onPresetChange={setPullRequestPreset}
                      onLoadMore={github.pullRequests.loadMore}
                      onOpenExternalUrl={openExternalUrl}
                      onCheckout={checkoutPullRequest}
                      onRefresh={() => {
                        void Promise.allSettled([github.refresh("pullRequests"), github.refresh("openCounts")]);
                      }}
                      onMerged={() => {
                        github.invalidate("pullRequests");
                        github.invalidate("openCounts");
                        void Promise.allSettled([github.refresh("pullRequests"), github.refresh("openCounts")]);
                      }}
                      onConnectGitHub={() => openSettingsDialog("integrations")}
                      onReviewAccess={() => { void window.githead.openExternalUrl({ url: GITHUB_APP_INSTALL_URL }); }}
                      onCheckRemote={openRemoteManager}
                    />
                  </PersistentWorkspaceTabsContent>

                  <PersistentWorkspaceTabsContent panelKey="issues" active={state.activeView === "issues"} value="issues" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <IssuesView
                      active={state.activeView === "issues"}
                      summary={state.summary}
                      issues={github.issues.data ?? []}
                      openCount={github.counts.data?.issues ?? null}
                      loading={github.issues.status === "loading"}
                      busy={github.issues.status === "refreshing"}
                      loaded={github.issues.data !== undefined}
                      error={github.issues.error}
                      failure={github.issues.failure}
                      nextPage={github.issues.nextPage}
                      loadingMore={github.issues.loadingMore}
                      totalCount={github.issues.totalCount}
                      query={issueQuery}
                      preset={issuePreset}
                      viewerLogin={github.viewer.data?.login ?? null}
                      onQueryChange={setIssueQuery}
                      onPresetChange={setIssuePreset}
                      onLoadMore={github.issues.loadMore}
                      onOpenExternalUrl={openExternalUrl}
                      onRefresh={() => {
                        void Promise.allSettled([github.refresh("issues"), github.refresh("openCounts")]);
                      }}
                      onConnectGitHub={() => openSettingsDialog("integrations")}
                      onReviewAccess={() => { void window.githead.openExternalUrl({ url: GITHUB_APP_INSTALL_URL }); }}
                      onCheckRemote={openRemoteManager}
                    />
                  </PersistentWorkspaceTabsContent>
                </>
              ) : null}

              <PersistentWorkspaceTabsContent panelKey="activity" active={state.activeView === "activity"} value="activity" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <ActivityLogPanel
                  store={activityLogStore}
                  operationStatus={getActivityLogOperationStatus(state)}
                  onCopyRawLog={copyActivityLogRawText}
                />
              </PersistentWorkspaceTabsContent>
              </Tabs>
            </WorkspacePanelStateProvider>

            {state.activeView === "status" && statusWorkspaceMode === "files" && !repositoryOperationActive ? (
              <CommitPanel
                commitMessage={state.commitMessage}
                commitPushSafetyNotice={state.commitPushSafetyNotice}
                generationError={state.commitMessageGenerationError}
                disabled={disableUnrelatedMutations}
                primaryCommitAction={primaryCommitAction}
                pushableCommitCount={getPushableCommitCount(state.summary)}
                feedbackEvent={state.operationButtonFeedback?.repoPath === state.repoPath ? state.operationButtonFeedback : null}
                canCommit={canCommit(state)}
                canGenerateCommitMessage={canGenerateCommitMessage(state)}
                generateTitle={getGenerateMessageTitle(state)}
                onCommit={() => {
                  if (primaryCommitAction === "commit") {
                    void commitChanges();
                  } else if (primaryCommitAction === "push") {
                    void runAction("push", undefined, "commit-panel");
                  }
                }}
                onCommitAndPush={() => {
                  void commitAndPush();
                }}
                onUndoFailedCommitPush={() => {
                  void undoFailedCommitPush();
                }}
                showAmendAction={state.summary?.kind === "git"}
                canAmend={Boolean(state.summary?.kind === "git" && state.summary.hasHead)}
                amendDisabled={disableUnrelatedMutations}
                amendDisabledReason={getAmendDisabledReason(state)}
                onOpenAmend={() => openAmendDialog("composer")}
                onGenerateMessage={() => {
                  void generateCommitMessage();
                }}
                onOpenGenerateWithContext={() => {
                  updateState({
                    generateContextDialog: {
                      open: true,
                      context: ""
                    }
                  });
                }}
                onCommitMessageChange={(commitMessage) => {
                  updateState({
                    commitMessage,
                    commitMessageGenerationError: ""
                  });
                }}
              />
            ) : null}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      <GenerateWithContextDialog
        open={state.generateContextDialog.open}
        context={state.generateContextDialog.context}
        generating={state.runningOperation === "Generating commit message"}
        error={state.commitMessageGenerationError}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], () => updateState({
              generateContextDialog: emptyGenerateContextDialog
            }));
          }
        }}
          onContextChange={(context) => {
            updateState({
              commitMessageGenerationError: "",
              generateContextDialog: {
              ...stateRef.current.generateContextDialog,
              context
            }
          });
        }}
        onGenerate={async (event) => {
          event.preventDefault();
          const context = stateRef.current.generateContextDialog.context.trim();
          if (!context) {
            return;
          }

          const generated = await generateCommitMessage(context);
          if (generated) {
            updateState({
              generateContextDialog: emptyGenerateContextDialog
            });
          }
        }}
      />

      {amendDialogSource ? (
        <AmendDialog
          open
          repoPath={state.repoPath}
          source={amendDialogSource}
          busy={running}
          returnFocusRef={amendReturnFocusRef}
          onOpenChange={(open) => {
            if (!open) requestModalClose(["repo-operation"], () => setAmendDialogSource(null));
          }}
          onRun={amendLastCommit}
          onRestore={restoreAmendRecovery}
        />
      ) : null}

      <RedesignedSettingsDialog
        open={state.settingsOpen}
        initialCategory={state.settingsCategory}
        draft={state.settingsDraft}
        aiSettings={state.aiSettings}
        saving={state.settingsSaving}
        error={state.settingsError}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["settings-save"], closeSettingsDialog);
          }
        }}
        onDraftChange={(settingsDraft) => {
          applyColorTheme(settingsDraft.colorTheme);
          if (settingsDraft.zoomFactor !== stateRef.current.settingsDraft.zoomFactor) {
            void window.githead.setWindowZoomFactor(settingsDraft.zoomFactor).catch(() => undefined);
          }
          updateState({
            settingsDraft
          });
        }}
        onSave={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
        onOpenPerformanceDiagnostics={() => setPerformanceDiagnosticsOpen(true)}
        githubConnection={state.githubConnection}
        githubConnectionLoading={state.githubConnectionLoading}
        githubConnecting={state.githubConnecting}
        githubDeviceFlow={state.githubDeviceFlow}
        githubConnectionError={state.githubConnectionError}
        githubRepository={state.summary?.githubRepository ?? null}
        onConnectGitHub={() => { void connectGitHub(); }}
        onDisconnectGitHub={() => { void disconnectGitHub(); }}
        onRetryGitHubConnection={() => { void loadGitHubConnection(); }}
        onReviewGitHubAccess={() => { void window.githead.openExternalUrl({ url: GITHUB_APP_INSTALL_URL }); }}
        onManageRemotes={openRemoteManager}
        onOpenGitHubRepository={() => {
          const url = stateRef.current.summary?.githubRepository?.webUrl;
          if (url) void window.githead.openExternalUrl({ url });
        }}
      />
      {performanceDiagnosticsOpen ? (
        <OptionalFeatureBoundary name="performance diagnostics">
          <PerformanceDiagnosticsDialog
            open
            onOpenChange={setPerformanceDiagnosticsOpen}
          />
        </OptionalFeatureBoundary>
      ) : null}
      <RepositorySettingsDialog open={Boolean(repositorySettingsPath)} repoPath={repositorySettingsPath} onOpenChange={(open) => { if (!open) setRepositorySettingsPath(""); }} onSaved={handleRepositorySettingsSaved} onSaveGitIdentity={saveRepositoryGitIdentity} />

      {state.remoteManager.open ? (
      <OptionalFeatureBoundary name="remote management">
      <RemoteManagementDialog
        open={state.remoteManager.open}
        repoPath={state.repoPath}
        remotes={state.remoteManager.remotes}
        loading={state.remoteManager.loading}
        busy={running}
        loadError={state.remoteManager.error}
        hasGitHubOrigin={Boolean(state.summary?.githubRepository)}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeRemoteManager);
          }
        }}
        onReload={() => {
          void loadRemoteConfigs();
        }}
        onRefreshRemote={async (name) => {
          const remotes = await loadRemoteConfigs();
          return remotes?.find((remote) => remote.name === name) ?? null;
        }}
        onAdd={(name, url) => runRemoteOperation(
          `Adding remote ${name.trim()}`,
          (repoPath, operationId) => window.githead.addRemote({ repoPath, name, url, operationId })
        )}
        onRename={(currentName, newName) => runRemoteOperation(
          `Renaming remote ${currentName}`,
          (repoPath, operationId) => window.githead.renameRemote({ repoPath, currentName, newName, operationId })
        )}
        onSetUrl={(name, url) => runRemoteOperation(
          `Updating remote ${name}`,
          (repoPath, operationId) => window.githead.setRemoteUrl({ repoPath, name, url, operationId })
        )}
        onRemove={(name) => runRemoteOperation(
          `Removing remote ${name}`,
          (repoPath, operationId) => window.githead.removeRemote({ repoPath, name, operationId })
        )}
      />
      </OptionalFeatureBoundary>
      ) : null}

      <BranchManagementDialog
        open={state.branchManagerOpen}
        repoPath={state.repoPath}
        kind={state.summary?.kind ?? "git"}
        capabilities={state.summary?.capabilities ?? gitCapabilities()}
        branches={state.summary?.branches ?? []}
        busy={running}
        onOpenChange={(open) => { if (!open) requestModalClose(["repo-operation"], closeBranchManager); }}
        onRename={(branchName, newBranchName) => runBranchOperation("rename", `Renaming branch ${branchName}`, branchName, (repoPath, operationId) => window.githead.renameBranch({ repoPath, branchName, newBranchName, operationId }))}
        onRemove={(branchName, force) => runBranchOperation("remove", `${force ? "Force deleting" : "Removing"} branch ${branchName}`, branchName, (repoPath, operationId) => window.githead.deleteBranch({ repoPath, branchName, force, operationId }))}
      />

      {integrationDialog ? (
        <GitIntegrationDialog
          open
          kind={integrationDialog.kind}
          repoPath={state.repoPath}
          currentBranch={state.summary?.branch ?? null}
          branches={state.summary?.branches ?? []}
          remoteBranches={state.summary?.remoteBranches ?? []}
          commit={integrationDialog.commitHash ? getCommitByHash(state.history, integrationDialog.commitHash) : null}
          allowAlreadyContainedCherryPick={state.appSettings?.gitBehaviors?.allowCherryPickingContainedCommits ?? false}
          busy={running}
          onOpenChange={(open) => { if (!open && !running) setIntegrationDialog(null); }}
          onRun={runIntegration}
        />
      ) : null}

      <Dialog open={Boolean(forceLeaseOffer)} onOpenChange={(open) => { if (!open && !running) setForceLeaseOffer(null); }}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Rebase complete</p>
            <DialogTitle>Publish rewritten history?</DialogTitle>
            <DialogDescription>
              The rebased branch no longer fast-forwards its upstream. Publishing is a separate, explicit action and uses force-with-lease so Git refuses if the remote changed.
            </DialogDescription>
          </DialogHeader>
          {forceLeaseOffer ? <div className="rounded-md border border-amber-500/45 bg-amber-500/10 p-3 text-sm"><p className="font-medium">{forceLeaseOffer.branchName} → {forceLeaseOffer.remoteName}/{forceLeaseOffer.remoteBranchName}</p><p className="mt-1 text-muted-foreground">Plain force is never used. No push has happened yet.</p></div> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={running} onClick={() => setForceLeaseOffer(null)}>Not now</Button>
            <Button type="button" variant="destructive" disabled={running || !forceLeaseOffer} onClick={() => { void publishRebasedBranch(); }}>{running ? <Loader2 className="animate-spin" /> : <Upload />}Publish with force-with-lease</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictResolutionDialog
        open={Boolean(conflictResolverPath)}
        repoPath={state.repoPath}
        initialPath={conflictResolverPath}
        operation={state.summary?.operationState ?? null}
        busy={running}
        onOpenChange={(open) => { if (!open) setConflictResolverPath(null); }}
        onOpenFile={openRepositoryOperationConflictFile}
        onSave={saveRepositoryOperationConflict}
      />

      <PullRecoveryDialog
        recovery={state.pullRecovery}
        open={state.pullRecoveryOpen}
        busy={running}
        error={state.pullRecoveryError}
        onOpenChange={(open) => updateState({ pullRecoveryOpen: open, ...(open ? {} : { pullRecoveryError: "" }) })}
        onAction={(action) => { void resolvePullRecovery(action); }}
        onReview={() => {
          updateState({ pullRecoveryOpen: false });
          setWorkspaceView("history");
          void changeHistoryScope("all");
        }}
        onOpenFileStatus={() => {
          updateState({ pullRecoveryOpen: false });
          setWorkspaceView("status");
        }}
        onOpenActivityLog={() => {
          updateState({ pullRecoveryOpen: false });
          setWorkspaceView("activity");
        }}
        onCancel={() => {
          if (cancellationRequestTarget) void cancelRunningOperation(cancellationRequestTarget);
        }}
      />

      <WorktreeCreateDialog
        open={state.worktreeDialogOpen}
        group={findRepositoryGroup(state.repositoryGroups, state.repoPath)}
        branches={state.summary?.branches ?? []}
        remoteBranches={state.summary?.remoteBranches ?? []}
        busy={running}
        onOpenChange={(open) => { if (!open) requestModalClose(["repo-operation"], closeWorktreeDialog); }}
        onChooseParent={(defaultPath) => window.githead.chooseWorktreeParent(defaultPath)}
        onCreate={createWorktree}
      />

      <WorktreeRemoveDialog
        target={state.worktreeRemoveTarget}
        check={state.worktreeRemovalCheck}
        checking={state.worktreeRemovalChecking}
        busy={running}
        onClose={() => requestModalClose(["repo-operation"], closeWorktreeRemoval)}
        onRemove={() => { void removeWorktree(); }}
      />

      <GitIdentityDialog
        open={state.gitIdentityPrompt.open}
        state={state.gitIdentityPrompt}
        saving={state.gitIdentitySaving}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["identity-save"], closeGitIdentityPrompt);
          }
        }}
        onStateChange={(gitIdentityPrompt) => {
          updateState({
            gitIdentityPrompt
          });
        }}
        onSave={(event) => {
          event.preventDefault();
          void saveGitIdentityPrompt();
        }}
      />

      <RepositoryActionsDialog
        open={state.actionManager.open}
        summary={state.summary}
        draft={state.actionManager.draft}
        savingTarget={state.actionManager.savingTarget}
        error={state.actionManager.error}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["action-save"], closeActionManager);
          }
        }}
        onDraftChange={updateActionManagerDraft}
        onAddAction={addRepositoryAction}
        onDeleteAction={deleteRepositoryAction}
        onRestoreAction={restoreRepositoryAction}
        onMoveAction={moveRepositoryAction}
        onSave={(target) => {
          void saveRepositoryActions(target);
        }}
      />

      <BranchDialog
        open={state.branchDialogOpen}
        branchName={state.branchNameDraft}
        checkout={state.branchCheckoutTarget !== null}
        saving={state.branchDialogOpen && state.runningOperation !== null}
        error={state.branchError}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeBranchDialog);
          }
        }}
        onBranchNameChange={(branchNameDraft) => {
          updateState({
            branchNameDraft,
            branchError: ""
          });
        }}
        onCreate={(event) => {
          event.preventDefault();
          void createBranch();
        }}
      />

      <PublishBranchDialog
        open={state.publishDialogOpen}
        branchName={state.summary?.branch ?? null}
        remotes={getPushRemotes(state.summary)}
        remote={state.publishRemoteDraft}
        saving={state.runningAction === "publish"}
        error={state.publishError}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["action"], closePublishDialog);
          }
        }}
        onRemoteChange={(publishRemoteDraft) => {
          updateState({
            publishRemoteDraft,
            publishError: ""
          });
        }}
        onPublish={(event) => {
          event.preventDefault();
          void publishBranch();
        }}
      />

      {state.pushToBranchDialog.open ? (
      <OptionalFeatureBoundary name="push to branch">
      <PushToBranchDialog
        state={state.pushToBranchDialog}
        remotes={getPushRemotes(state.summary)}
        remoteBranches={state.summary?.remoteBranches ?? []}
        currentUpstream={state.summary?.upstream ?? null}
        saving={state.runningAction === "push" && state.pushToBranchDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["action"], closePushToBranchDialog);
          }
        }}
        onStateChange={(pushToBranchDialog) => {
          updateState({ pushToBranchDialog });
        }}
        onPush={(event) => {
          event.preventDefault();
          void pushToBranch();
        }}
      />
      </OptionalFeatureBoundary>
      ) : null}

      <CreatePullRequestDialog
        state={state.createPrDialog}
        baseBranches={getCreatePrBaseBranches(state.summary)}
        needsPush={shouldPublishInsteadOfPush(state.summary) || hasUnpushedCommits(state.summary)}
        canGenerate={canUseSelectedAiProvider(state.aiSettings)}
        generateTitle={getGeneratePrDescriptionTitle(state)}
        onGenerateTitle={() => {
          void generatePrTitleForDialog();
        }}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["pr-generation", "pr-push", "pr-create"], closeCreatePrDialog);
          }
        }}
        onStateChange={(createPrDialog) => {
          updateState({
            createPrDialog
          });
        }}
        onGenerate={() => {
          void generatePrDescriptionForDialog();
        }}
        onReviewUnknownOutcome={() => {
          const repository = stateRef.current.summary?.githubRepository;
          if (repository) void window.githead.openExternalUrl({ url: `${repository.webUrl}/pulls` });
          updateState((latest) => ({
            ...latest,
            createPrDialog: { ...latest.createPrDialog, unknownOutcomeReviewed: true }
          }));
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void submitCreatePullRequest();
        }}
      />

      <TagDialog
        state={state.tagDialog}
        commit={getCommitByHash(state.history, state.tagDialog.hash)}
        remotes={getPushRemotes(state.summary)}
        saving={Boolean(state.runningOperation?.startsWith("Creating tag ") || state.runningOperation?.startsWith("Removing tag "))}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeTagDialog);
          }
        }}
        onStateChange={(tagDialog) => {
          updateState({
            tagDialog
          });
        }}
        onCreate={(event) => {
          event.preventDefault();
          void createTag();
        }}
        onDelete={(event) => {
          event.preventDefault();
          void deleteTag();
        }}
      />

      <ResetCommitDialog
        state={state.resetCommitDialog}
        commit={getCommitByHash(state.history, state.resetCommitDialog.hash)}
        branchName={state.summary?.branch ?? null}
        saving={state.runningOperation === "Resetting branch to commit"}
        resetModesEnabled={state.summary?.capabilities.resetModes ?? true}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeResetCommitDialog);
          }
        }}
        onStateChange={(resetCommitDialog) => {
          updateState({
            resetCommitDialog
          });
        }}
        onReset={(event) => {
          event.preventDefault();
          void resetBranchToCommit();
        }}
      />

      <ResetCommitFileDialog
        state={state.resetCommitFileDialog}
        saving={state.runningOperation === "Resetting file to commit" || state.runningOperation === "Resetting files to commit"}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeResetCommitFileDialog);
          }
        }}
        onCopy={() => {
          void copyResetCommitFileDialogPaths();
        }}
        onReset={(event) => {
          event.preventDefault();
          void resetFilesToCommit();
        }}
      />

      <RevertCommitDialog
        state={state.revertCommitDialog}
        commit={getCommitByHash(state.history, state.revertCommitDialog.hash)}
        saving={state.runningOperation === "Reversing commit"}
        onOpenChange={(open) => {
          if (!open) {
            requestModalClose(["repo-operation"], closeRevertCommitDialog);
          }
        }}
        onReverse={(event) => {
          event.preventDefault();
          void revertCommit();
        }}
      />

      <TrustWorkspaceDialog
        open={trustDialogRepoPath !== null}
        repoPath={trustDialogRepoPath ?? ""}
        onCancel={() => {
          closeTrustDialog(false);
        }}
        onTrust={() => {
          closeTrustDialog(true);
        }}
      />
    </AppChrome>
  );
}

interface AppChromeProps {
  children: ReactNode;
  isMaximized: boolean;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
}

function AppChrome({
  children,
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: AppChromeProps): ReactNode {
  return (
    <TooltipProvider>
      <main className="app-shell bg-background text-foreground">
        <header className="window-chrome" data-maximized={isMaximized ? "true" : "false"}>
          <div className="window-title">
            <div className="window-title-mark" aria-hidden="true">G</div>
            <span>Githead</span>
          </div>
          <WindowControls
            isMaximized={isMaximized}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onClose}
          />
        </header>
        <section className="app-content">
          {children}
        </section>
      </main>
    </TooltipProvider>
  );
}

interface WindowControlsProps {
  isMaximized: boolean;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
}

function WindowControls({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: WindowControlsProps): ReactNode {
  const maximizeLabel = isMaximized ? "Restore window" : "Maximize window";
  const MaximizeIcon = isMaximized ? Copy : Maximize2;

  return (
    <div className="window-controls" aria-label="Window controls">
      <WindowControlButton label="Minimize window" onClick={onMinimize}>
        <Minus />
      </WindowControlButton>
      <WindowControlButton label={maximizeLabel} onClick={onToggleMaximize}>
        <MaximizeIcon />
      </WindowControlButton>
      <WindowControlButton label="Close window" destructive onClick={onClose}>
        <X />
      </WindowControlButton>
    </div>
  );
}

interface WindowControlButtonProps {
  children: ReactNode;
  destructive?: boolean;
  label: string;
  onClick(): void;
}

function WindowControlButton({
  children,
  destructive = false,
  label,
  onClick
}: WindowControlButtonProps): ReactNode {
  const [open, setOpen] = useState(false);

  const closeTooltip = (): void => {
    setOpen(false);
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={destructive ? "window-control window-control-close" : "window-control"}
          aria-label={label}
          onBlur={closeTooltip}
          onClick={onClick}
          onMouseLeave={closeTooltip}
          onPointerLeave={closeTooltip}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RepositorySetupScreen({
  repoRecents,
  repoSyncStatuses,
  selectedRepoPath,
  setupError,
  safeDirectory,
  safeDirectoryRunning,
  cloneDraft,
  cloneError,
  cloneRunning,
  cloneCheckRunning,
  cloneCheckStatus,
  cloneCheckMessage,
  cloneBranches,
  cancelStatus,
  cancelError,
  running,
  onChooseRepo,
  onOpenSafeDirectoryDialog,
  onSelectRecent,
  onRemoveRecent,
  onRecoverRecent,
  onReorderRepositories,
  onShowInExplorer,
  onOpenRepositorySettings,
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone,
  onCancelOperation
}: {
  repoRecents: string[];
  repoSyncStatuses: Record<string, RepoSyncStatus>;
  selectedRepoPath: string;
  setupError: string;
  safeDirectory: GitSafeDirectoryInfo | null;
  safeDirectoryRunning: boolean;
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  cancelStatus: OperationCancelStatus;
  cancelError: string;
  running: boolean;
  onChooseRepo: () => void;
  onOpenSafeDirectoryDialog: () => void;
  onSelectRecent: (repoPath: string) => void;
  onRemoveRecent: (repoPath: string) => void;
  onRecoverRecent: (repoPath: string) => Promise<RepositoryRecoveryResult>;
  onReorderRepositories: (repoPaths: string[]) => void;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
  onCancelOperation: () => void;
}): ReactNode {
  return (
    <section className="setup-screen">
      <div className="setup-header">
        <div className="setup-logo">G</div>
        <div className="min-w-0">
          <h1>Githead</h1>
          <p>Select a repository to continue.</p>
        </div>
      </div>

      <div className="setup-grid">
        <section className="setup-panel">
          <div className="setup-panel-heading">
            <FolderOpen />
            <div>
              <h2>Open existing repository</h2>
              <p>Locate a folder that already contains a Git working tree.</p>
            </div>
          </div>
          <Button type="button" className="w-full justify-center" onClick={onChooseRepo} disabled={running}>
            <FolderOpen />
            Browse for Repository
          </Button>
          {setupError ? (
            <p className="setup-error selectable-text" role="alert">{setupError}</p>
          ) : null}
          {safeDirectory?.required ? (
            <div className="setup-safe-directory" role="status">
              <div className="setup-safe-directory-heading">
                <ShieldAlert />
                <span>Git ownership check blocked this repository.</span>
              </div>
              <p>Allow an exception for this folder to add it to Git's global safe.directory list.</p>
              <p className="setup-safe-directory-path selectable-text">{safeDirectory.path}</p>
              <Button
                type="button"
                variant="outline"
                className="justify-center"
                onClick={onOpenSafeDirectoryDialog}
                disabled={running || safeDirectoryRunning}
              >
                {safeDirectoryRunning ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
                {safeDirectoryRunning ? "Adding Exception" : "Allow Git Exception"}
              </Button>
            </div>
          ) : null}
          {selectedRepoPath ? (
            <p className="setup-selected-path selectable-text">{selectedRepoPath}</p>
          ) : null}
        </section>

        <section className="setup-panel">
          <CloneRepositoryForm
            idPrefix="clone"
            cloneDraft={cloneDraft}
            cloneError={cloneError}
            cloneRunning={cloneRunning}
            cloneCheckRunning={cloneCheckRunning}
            cloneCheckStatus={cloneCheckStatus}
            cloneCheckMessage={cloneCheckMessage}
            cloneBranches={cloneBranches}
            cancelStatus={cancelStatus}
            cancelError={cancelError}
            onCloneDraftChange={onCloneDraftChange}
            onCloneSourceChange={onCloneSourceChange}
            onChooseCloneParent={onChooseCloneParent}
            onCheckRepositoryAccess={onCheckRepositoryAccess}
            onClone={onClone}
            onCancelOperation={onCancelOperation}
          />
        </section>
      </div>

      {repoRecents.length > 0 ? (
        <RepositoryList
          className="setup-recents"
          repoPath=""
          repoPaths={repoRecents}
          syncStatuses={repoSyncStatuses}
          disabled={running}
          onSelect={onSelectRecent}
          onRemove={onRemoveRecent}
          onRecover={onRecoverRecent}
          onReorder={onReorderRepositories}
          onShowInExplorer={onShowInExplorer}
          onOpenRepositorySettings={onOpenRepositorySettings}
        />
      ) : null}
    </section>
  );
}

interface RepositoryListProps {
  className?: string;
  disabled: boolean;
  headingAction?: ReactNode;
  repoPath: string;
  repoPaths: string[];
  groups?: RepositoryGroup[];
  syncStatuses: Record<string, RepoSyncStatus>;
  onSelect: (repoPath: string) => void;
  onRemove: (repoPath: string) => void;
  onRecover: (repoPath: string) => Promise<RepositoryRecoveryResult>;
  onReorder: (repoPaths: string[]) => void;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
  onRemoveWorktree?: (worktree: GitWorktree) => void;
}

interface RecentRepositoryRowProps {
  active?: boolean;
  disabled: boolean;
  dropPosition: RepositoryDropPosition | null;
  dragging: boolean;
  repoPath: string;
  rowRef: (element: HTMLDivElement | null) => void;
  syncStatus: RepoSyncStatus | null;
  unavailableReason: string;
  layoutDependency: string;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, repoPath: string) => void;
  onPointerDragStart: (repoPath: string) => void;
  onKeyboardMove: (repoPath: string, direction: RepositoryMoveDirection) => void;
  onSelect: (repoPath: string) => void;
  onRemove: (repoPath: string) => void;
  onRecover: (repoPath: string, reason: string) => void;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
}

type RepositoryDropPosition = "before" | "after";
type RepositoryMoveDirection = "up" | "down";
type RepositoryRecoveryResult =
  | { status: "success" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function RepositoryList({
  className = "repo-recents",
  disabled,
  headingAction,
  repoPath,
  repoPaths,
  groups,
  syncStatuses,
  onSelect,
  onRemove,
  onRecover,
  onReorder,
  onShowInExplorer,
  onOpenRepositorySettings,
  onRemoveWorktree
}: RepositoryListProps): ReactNode {
  const draggedRepoPathRef = useRef<string | null>(null);
  const repositoryRowsRef = useRef(new Map<string, HTMLDivElement>());
  const [draggedRepoPath, setDraggedRepoPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ repoPath: string; position: RepositoryDropPosition } | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<{ repoPath: string; reason: string } | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const repositoryOrderDependency = (groups?.length
    ? groups.map((group) => getRepoPathKey(group.anchorPath))
    : repoPaths.map(getRepoPathKey)).join("\u0000");
  useEffect(() => {
    const activeKey = repoPath ? getRepoPathKey(repoPath) : null;
    if (!activeKey) {
      return;
    }

    repositoryRowsRef.current.get(activeKey)?.scrollIntoView?.({
      block: "nearest"
    });
  }, [repoPath, repoPaths]);

  const moveRepository = useCallback((fromRepoPath: string, toRepoPath: string, position: RepositoryDropPosition): void => {
    if (disabled || isSameRepoPath(fromRepoPath, toRepoPath)) {
      return;
    }

    const next = moveRepoPath(repoPaths, fromRepoPath, toRepoPath, position);
    if (!areRepoPathListsEqual(repoPaths, next)) {
      onReorder(next);
    }
  }, [disabled, onReorder, repoPaths]);

  const moveRepositoryByKeyboard = useCallback((moveRepoPathValue: string, direction: RepositoryMoveDirection): void => {
    if (disabled) {
      return;
    }

    const index = repoPaths.findIndex((candidate) => isSameRepoPath(candidate, moveRepoPathValue));
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= repoPaths.length) {
      return;
    }

    const next = [...repoPaths];
    const [moved] = next.splice(index, 1);
    if (!moved) {
      return;
    }

    next.splice(targetIndex, 0, moved);
    onReorder(next);
  }, [disabled, onReorder, repoPaths]);

  const startDrag = (event: DragEvent<HTMLButtonElement>, dragRepoPath: string): void => {
    if (disabled) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragRepoPath);
    draggedRepoPathRef.current = dragRepoPath;
    setDraggedRepoPath(dragRepoPath);
  };

  const startPointerDrag = (dragRepoPath: string): void => {
    if (disabled) {
      return;
    }

    draggedRepoPathRef.current = dragRepoPath;
    setDraggedRepoPath(dragRepoPath);
  };

  const getDragTarget = (event: DragEvent<HTMLElement> | MouseEvent<HTMLElement>): { repoPath: string; element: HTMLElement } | null => {
    const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-repo-path]");
    const targetRepoPath = element?.dataset.repoPath;
    return element && targetRepoPath
      ? {
          repoPath: targetRepoPath,
          element
        }
      : null;
  };

  const updateDropTarget = (event: DragEvent<HTMLElement>, targetRepoPath: string, targetElement: HTMLElement): void => {
    const sourceRepoPath = draggedRepoPathRef.current ?? draggedRepoPath ?? event.dataTransfer.getData("text/plain");
    if (disabled || !sourceRepoPath || isSameRepoPath(sourceRepoPath, targetRepoPath)) {
      return;
    }

    event.preventDefault();
    const position = getDropPosition(event.clientY, targetElement);
    event.dataTransfer.dropEffect = "move";
    setDropTarget({
      repoPath: targetRepoPath,
      position
    });
  };

  const dropRepository = (event: DragEvent<HTMLElement>, targetRepoPath: string, targetElement: HTMLElement): void => {
    const sourceRepoPath = draggedRepoPathRef.current ?? draggedRepoPath ?? event.dataTransfer.getData("text/plain");
    draggedRepoPathRef.current = null;
    setDraggedRepoPath(null);
    setDropTarget(null);
    if (!sourceRepoPath) {
      return;
    }

    event.preventDefault();
    moveRepository(sourceRepoPath, targetRepoPath, getDropPosition(event.clientY, targetElement));
  };

  const finishPointerDrag = (event: MouseEvent<HTMLElement>): void => {
    const sourceRepoPath = draggedRepoPathRef.current;
    const target = getDragTarget(event);
    draggedRepoPathRef.current = null;
    setDraggedRepoPath(null);
    setDropTarget(null);
    if (!sourceRepoPath || !target) {
      return;
    }

    moveRepository(sourceRepoPath, target.repoPath, getDropPosition(event.clientY, target.element));
  };

  return (
    <>
    <section className={className} aria-label="Repositories">
      <div className="repo-recents-heading">
        <p className="repo-recents-label">Repositories</p>
        {headingAction}
      </div>
      <div
        className="repo-recents-list"
        onMouseUp={finishPointerDrag}
        onDragOver={(event) => {
          const target = getDragTarget(event);
          if (target) {
            updateDropTarget(event, target.repoPath, target.element);
          }
        }}
        onDrop={(event) => {
          const target = getDragTarget(event);
          if (target) {
            dropRepository(event, target.repoPath, target.element);
          }
        }}
      >
        {groups?.length ? groups.map((group) => {
          const key = getRepoPathKey(group.anchorPath);
          const active = group.worktrees.some((worktree) => isSameRepoPath(worktree.path, repoPath)) || isSameRepoPath(group.anchorPath, repoPath);
          const currentDropPosition = dropTarget && isSameRepoPath(dropTarget.repoPath, group.anchorPath) ? dropTarget.position : null;
          return <RepositoryGroupRow
            key={group.id}
            group={group}
            activeRepoPath={repoPath}
            active={active}
            expanded={expandedGroupIds.has(group.id)}
            disabled={disabled}
            dragging={Boolean(draggedRepoPath && isSameRepoPath(draggedRepoPath, group.anchorPath))}
            dropPosition={currentDropPosition}
            syncStatuses={syncStatuses}
            layoutDependency={repositoryOrderDependency}
            rowRef={(element) => { if (element) repositoryRowsRef.current.set(key, element); else repositoryRowsRef.current.delete(key); }}
            onToggle={() => setExpandedGroupIds((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}
            onDragStart={startDrag}
            onPointerDragStart={startPointerDrag}
            onDragEnd={() => { draggedRepoPathRef.current = null; setDraggedRepoPath(null); setDropTarget(null); }}
            onKeyboardMove={moveRepositoryByKeyboard}
            onSelect={onSelect}
            onRemove={() => setRemoveTarget(group.anchorPath)}
            onRecover={(reason) => {
              setRecoveryError("");
              setRecoveryTarget({ repoPath: group.anchorPath, reason });
            }}
            onShowInExplorer={onShowInExplorer}
            onOpenRepositorySettings={onOpenRepositorySettings}
            {...(onRemoveWorktree ? { onRemoveWorktree } : {})}
          />;
        }) : repoPaths.map((recentRepoPath) => {
          const key = getRepoPathKey(recentRepoPath);
          const active = repoPath ? isSameRepoPath(recentRepoPath, repoPath) : false;
          const currentDropPosition = dropTarget && isSameRepoPath(dropTarget.repoPath, recentRepoPath)
            ? dropTarget.position
            : null;

          return (
            <RecentRepositoryRow
              key={key}
              repoPath={recentRepoPath}
              rowRef={(element) => {
                if (element) {
                  repositoryRowsRef.current.set(key, element);
                } else {
                  repositoryRowsRef.current.delete(key);
                }
              }}
              syncStatus={syncStatuses[key] ?? null}
              unavailableReason={syncStatuses[key]?.isValid === false ? syncStatuses[key]?.error ?? "" : ""}
              layoutDependency={repositoryOrderDependency}
              active={active}
              disabled={disabled}
              dragging={Boolean(draggedRepoPath && isSameRepoPath(draggedRepoPath, recentRepoPath))}
              dropPosition={currentDropPosition}
              onDragStart={startDrag}
              onPointerDragStart={startPointerDrag}
              onDragEnd={() => {
                draggedRepoPathRef.current = null;
                setDraggedRepoPath(null);
                setDropTarget(null);
              }}
              onKeyboardMove={moveRepositoryByKeyboard}
              onSelect={onSelect}
              onRemove={setRemoveTarget}
              onRecover={(targetRepoPath, reason) => {
                setRecoveryError("");
                setRecoveryTarget({ repoPath: targetRepoPath, reason });
              }}
              onShowInExplorer={onShowInExplorer}
              onOpenRepositorySettings={onOpenRepositorySettings}
            />
          );
        })}
      </div>
    </section>
    <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Remove Repository?</DialogTitle>
          <DialogDescription>
            This repository will no longer be tracked by Githead. The repository and all of its files will remain on disk.
          </DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-md border bg-muted/30 p-3 text-sm">{removeTarget}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => {
            if (!removeTarget) return;
            onRemove(removeTarget);
            setRemoveTarget(null);
          }}><Trash2 />Remove Repository</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(recoveryTarget)} onOpenChange={(open) => {
      if (!open && !recoveryRunning) {
        setRecoveryTarget(null);
        setRecoveryError("");
      }
    }}>
      <DialogContent className="min-w-0 overflow-hidden sm:max-w-[480px]" showCloseButton={!recoveryRunning}>
        <DialogHeader className="min-w-0">
          <DialogTitle>Repository Unavailable</DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            Githead cannot open this saved repository. Choose its new location if it still exists, or remove it from Githead.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-md border bg-muted/30 p-3 text-sm">
          <p className="break-all font-medium">{recoveryTarget?.repoPath}</p>
          <p className="break-words text-destructive">{recoveryTarget?.reason}</p>
        </div>
        {recoveryError ? <p className="text-sm text-destructive" role="alert">{recoveryError}</p> : null}
        <DialogFooter className="min-w-0 sm:flex-wrap">
          <Button type="button" variant="outline" disabled={recoveryRunning} onClick={() => {
            setRecoveryTarget(null);
            setRecoveryError("");
          }}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={recoveryRunning} onClick={() => {
            if (!recoveryTarget) return;
            onRemove(recoveryTarget.repoPath);
            setRecoveryTarget(null);
            setRecoveryError("");
          }}><Trash2 />Remove Repository</Button>
          <Button type="button" disabled={recoveryRunning} onClick={() => {
            if (!recoveryTarget) return;
            setRecoveryRunning(true);
            setRecoveryError("");
            void onRecover(recoveryTarget.repoPath).then((result) => {
              if (result.status === "success") {
                setRecoveryTarget(null);
              } else if (result.status === "error") {
                setRecoveryError(result.message);
              }
            }).finally(() => setRecoveryRunning(false));
          }}>
            {recoveryRunning ? <Loader2 className="animate-spin" /> : <FolderOpen />}
            {recoveryRunning ? "Checking Location" : "Choose New Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function RepositoryGroupRow({ group, activeRepoPath, active, expanded, disabled, dragging, dropPosition, syncStatuses, layoutDependency, rowRef, onToggle, onDragStart, onPointerDragStart, onDragEnd, onKeyboardMove, onSelect, onRemove, onRecover, onShowInExplorer, onOpenRepositorySettings, onRemoveWorktree }: {
  group: RepositoryGroup;
  activeRepoPath: string;
  active: boolean;
  expanded: boolean;
  disabled: boolean;
  dragging: boolean;
  dropPosition: RepositoryDropPosition | null;
  syncStatuses: Record<string, RepoSyncStatus>;
  layoutDependency: string;
  rowRef: (element: HTMLDivElement | null) => void;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, repoPath: string) => void;
  onPointerDragStart: (repoPath: string) => void;
  onDragEnd: () => void;
  onKeyboardMove: (repoPath: string, direction: RepositoryMoveDirection) => void;
  onSelect: (repoPath: string) => void;
  onRemove: () => void;
  onRecover: (reason: string) => void;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
  onRemoveWorktree?: (worktree: GitWorktree) => void;
}): ReactNode {
  const worktreeListId = useId();
  const worktrees = group.worktrees.length ? group.worktrees : [{ path: group.anchorPath, head: null, branch: null, isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null } satisfies GitWorktree];
  const displayName = getRepoDisplayName(group.anchorPath);
  const navigationWorktree = worktrees.find((worktree) => isSameRepoPath(worktree.path, group.lastUsedPath));
  const navigationUnavailable = Boolean(navigationWorktree?.isBare || navigationWorktree?.prunable);
  const syncStatus = syncStatuses[getRepoPathKey(group.anchorPath)] ?? null;
  const unavailableReason = (syncStatus?.isValid === false ? syncStatus.error : "") || group.error;
  const navigationActive = isSameRepoPath(group.lastUsedPath, activeRepoPath);
  const rowClassName = ["repo-group", active ? "is-active" : "", dragging ? "is-dragging" : "", dropPosition ? `is-drop-${dropPosition}` : ""].filter(Boolean).join(" ");
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onKeyboardMove(group.anchorPath, event.key === "ArrowUp" ? "up" : "down");
    }
  };
  return <motion.div ref={rowRef} layout="position" layoutDependency={layoutDependency} transition={{ layout: { duration: 0.12, ease: "easeOut" } }} className={rowClassName} data-repo-path={group.anchorPath}>
    <ContextMenu><ContextMenuTrigger asChild><div className="repo-group-heading">
      <button type="button" className="repo-recent-drag-handle" draggable={!disabled} disabled={disabled} onDragStart={(event) => onDragStart(event, group.anchorPath)} onMouseDown={() => onPointerDragStart(group.anchorPath)} onDragEnd={onDragEnd} onKeyDown={handleKeyDown} aria-label={`Reorder ${group.anchorPath}`}><GripVertical /></button>
      <button type="button" className="repo-group-toggle" disabled={disabled} onClick={onToggle} aria-expanded={expanded} aria-controls={worktreeListId} aria-label={`${expanded ? "Collapse" : "Expand"} worktrees for ${displayName}`}><ChevronRight className="repo-group-chevron" /></button>
      <button type="button" className="repo-group-main" disabled={disabled || navigationActive || navigationUnavailable || Boolean(unavailableReason)} onClick={() => onSelect(group.lastUsedPath)} aria-current={navigationActive ? "true" : undefined} aria-label={`Switch to ${group.anchorPath}`}><RecentRepositoryVcsIcon kind={group.kind} /><span className="repo-recent-title">{displayName}</span></button>
      {unavailableReason ? <RepositoryUnavailableButton repoPath={group.anchorPath} reason={unavailableReason} disabled={disabled} onClick={() => onRecover(unavailableReason)} /> : null}
    </div></ContextMenuTrigger><ContextMenuContent className="w-72"><ContextMenuLabel className="repo-recent-menu-path">{group.anchorPath}</ContextMenuLabel><ContextMenuSeparator /><ContextMenuItem disabled={disabled || navigationUnavailable} onSelect={() => onOpenRepositorySettings(group.lastUsedPath)}><Settings />Repository Settings…</ContextMenuItem><ContextMenuItem disabled={navigationUnavailable} onSelect={() => onShowInExplorer(group.anchorPath)}><MapPinned />Show in Explorer</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem variant="destructive" disabled={disabled} onSelect={onRemove}><Trash2 />Remove Repository</ContextMenuItem></ContextMenuContent></ContextMenu>
    <MotionPresence present={expanded} id={worktreeListId} className="repo-worktree-list" initialY={-2}>{worktrees.map((worktree) => {
      const workspaceActive = isSameRepoPath(worktree.path, activeRepoPath);
      const unavailable = worktree.isBare || worktree.prunable;
      const status = syncStatuses[getRepoPathKey(worktree.path)] ?? null;
      return <ContextMenu key={getRepoPathKey(worktree.path)}><ContextMenuTrigger asChild><div className={`repo-worktree-row ${workspaceActive ? "is-active" : ""}`}><button type="button" className="repo-worktree-main" disabled={disabled || workspaceActive || unavailable} onClick={() => onSelect(worktree.path)} aria-current={workspaceActive ? "true" : undefined}><GitBranchIcon /><span className="min-w-0 flex-1"><span className="repo-worktree-branch">{worktree.branch ?? (worktree.isDetached ? "Detached HEAD" : getRepoDisplayName(worktree.path))}</span><span className="repo-worktree-path">{getRepoDisplayName(worktree.path)}</span></span>{worktree.isMain ? <Badge variant="outline">Main</Badge> : null}{worktree.locked ? <Badge variant="outline">Locked</Badge> : null}{worktree.prunable ? <Badge variant="destructive">Missing</Badge> : null}<RepoSyncStatusChips status={status} /></button></div></ContextMenuTrigger><ContextMenuContent className="w-72"><ContextMenuLabel className="repo-recent-menu-path">{worktree.path}</ContextMenuLabel><ContextMenuSeparator /><ContextMenuItem disabled={disabled || unavailable} onSelect={() => onOpenRepositorySettings(worktree.path)}><Settings />Repository Settings…</ContextMenuItem><ContextMenuItem disabled={unavailable} onSelect={() => onShowInExplorer(worktree.path)}><MapPinned />Show in Explorer</ContextMenuItem>{!worktree.isMain && !workspaceActive && onRemoveWorktree ? <ContextMenuItem disabled={disabled || unavailable || worktree.locked} onSelect={() => onRemoveWorktree(worktree)}><Trash2 />Remove Worktree…</ContextMenuItem> : null}</ContextMenuContent></ContextMenu>;
    })}{group.error ? <p className="px-3 py-2 text-xs text-destructive">{group.error}</p> : null}</MotionPresence>
  </motion.div>;
}

function RecentRepositoryRow({
  active = false,
  disabled,
  dropPosition,
  dragging,
  repoPath,
  rowRef,
  syncStatus,
  unavailableReason,
  layoutDependency,
  onDragEnd,
  onDragStart,
  onPointerDragStart,
  onKeyboardMove,
  onSelect,
  onRemove,
  onRecover,
  onShowInExplorer,
  onOpenRepositorySettings
}: RecentRepositoryRowProps): ReactNode {
  const displayName = getRepoDisplayName(repoPath);
  const syncDescription = formatRepoSyncStatusDescription(syncStatus);
  const rowClassName = [
    "repo-recent-row",
    active ? "is-active" : "",
    dragging ? "is-dragging" : "",
    dropPosition ? `is-drop-${dropPosition}` : ""
  ].filter(Boolean).join(" ");

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onKeyboardMove(repoPath, "up");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onKeyboardMove(repoPath, "down");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          ref={rowRef}
          layout="position"
          layoutDependency={layoutDependency}
          transition={{ layout: { duration: 0.12, ease: "easeOut" } }}
          className={rowClassName}
          data-repo-path={repoPath}
        >
          <TooltipTarget content="Reorder repository">
            <button
              type="button"
              className="repo-recent-drag-handle"
              draggable={!disabled}
              onDragStart={(event) => {
                onDragStart(event, repoPath);
              }}
              onMouseDown={() => {
                onPointerDragStart(repoPath);
              }}
              onDragEnd={onDragEnd}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              aria-label={`Reorder ${repoPath}`}
            >
              <GripVertical />
            </button>
          </TooltipTarget>
          <button
            type="button"
            className="repo-recent-main"
            onClick={() => {
              onSelect(repoPath);
            }}
            disabled={disabled || active || Boolean(unavailableReason)}
            aria-current={active ? "true" : undefined}
            aria-label={syncDescription ? `Switch to ${repoPath}, ${syncDescription}` : `Switch to ${repoPath}`}
          >
            <span className="repo-recent-name">
              {syncStatus?.isValid ? <RecentRepositoryVcsIcon kind={syncStatus.kind} /> : null}
              <span className="repo-recent-title">{displayName}</span>
              <RepoSyncStatusChips status={syncStatus} />
            </span>
          </button>
          {unavailableReason ? <RepositoryUnavailableButton repoPath={repoPath} reason={unavailableReason} disabled={disabled} onClick={() => onRecover(repoPath, unavailableReason)} /> : null}
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-72">
        <TooltipTarget content={repoPath}>
          <ContextMenuLabel className="repo-recent-menu-path">{repoPath}</ContextMenuLabel>
        </TooltipTarget>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled} onSelect={() => onOpenRepositorySettings(repoPath)}>
          <Settings />
          Repository Settings…
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onShowInExplorer(repoPath)}>
          <MapPinned />
          Show in Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={disabled} onSelect={() => onRemove(repoPath)}>
          <Trash2 />
          Remove Repository
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RepositoryUnavailableButton({ repoPath, reason, disabled, onClick }: {
  repoPath: string;
  reason: string;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <TooltipTarget content={reason} contentProps={{ className: "max-w-80" }}>
      <button
        type="button"
        className="repo-recent-recovery"
        aria-disabled={disabled ? "true" : undefined}
        aria-label={`Repair repository location for ${repoPath}`}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        <TriangleAlert />
      </button>
    </TooltipTarget>
  );
}

function RecentRepositoryVcsIcon({ kind }: { kind: RepoSyncStatus["kind"] }): ReactNode {
  const icon = kind === "lore"
    ? {
      label: "Lore repository",
      src: loreIconUrl
    }
    : {
      label: "Git repository",
      src: gitIconUrl
    };

  return (
    <TooltipTarget content={icon.label}>
      <span
        className={`repo-recent-vcs-icon ${kind === "lore" ? "is-lore" : "is-git"}`}
        role="img"
        aria-label={icon.label}
      >
        <img src={icon.src} alt="" aria-hidden="true" />
      </span>
    </TooltipTarget>
  );
}

function SyncCountChip({
  children,
  className = "",
  title
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}): ReactNode {
  const classNames = ["sync-count-chip", className].filter(Boolean).join(" ");

  return (
    <TooltipTarget content={title}>
      <span className={classNames} aria-hidden="true">{children}</span>
    </TooltipTarget>
  );
}

function RepoSyncStatusChips({ status }: { status: RepoSyncStatus | null }): ReactNode {
  if (!status?.isValid || (status.ahead <= 0 && status.behind <= 0)) {
    return null;
  }

  return (
    <span className="repo-recent-sync" aria-hidden="true">
      {status.ahead > 0 ? (
        <SyncCountChip className="is-ahead" title={formatCommitCountLabel(status.ahead, "ahead")}>
          {status.ahead} ↑
        </SyncCountChip>
      ) : null}
      {status.behind > 0 ? (
        <SyncCountChip className="is-behind" title={formatCommitCountLabel(status.behind, "behind")}>
          {status.behind} ↓
        </SyncCountChip>
      ) : null}
    </span>
  );
}

interface CloneRepositoryFormProps {
  idPrefix: string;
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  cancelStatus: OperationCancelStatus;
  cancelError: string;
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
  onCancelOperation: () => void;
}

function CloneRepositoryForm({
  idPrefix,
  cloneDraft,
  cloneError,
  cloneRunning,
  cloneCheckRunning,
  cloneCheckStatus,
  cloneCheckMessage,
  cloneBranches,
  cancelStatus,
  cancelError,
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone,
  onCancelOperation
}: CloneRepositoryFormProps): ReactNode {
  const cloneBusy = cloneRunning || cloneCheckRunning;
  const sourceId = `${idPrefix}-source`;
  const parentId = `${idPrefix}-parent`;
  const directoryId = `${idPrefix}-directory`;
  const branchId = `${idPrefix}-branch`;
  const depthId = `${idPrefix}-depth`;

  const updateSource = (source: string): void => {
    const previousInferredName = inferCloneDirectoryName(cloneDraft.source);
    const nextInferredName = inferCloneDirectoryName(source);
    const shouldUpdateDirectory = !cloneDraft.directoryName.trim() || cloneDraft.directoryName === previousInferredName;

    onCloneSourceChange({
      ...cloneDraft,
      source,
      directoryName: shouldUpdateDirectory ? nextInferredName : cloneDraft.directoryName
    });
  };

  return (
    <form className="setup-clone-form" onSubmit={onClone}>
      <div className="setup-panel-heading">
        <GitFork />
        <div>
          <h2>Clone repository</h2>
          <p>Clone from a Git (HTTPS, SSH, or local) or Lore (lore://) source.</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={sourceId}>Repository URL or path</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            id={sourceId}
            value={cloneDraft.source}
            disabled={cloneBusy}
            placeholder="https://github.com/owner/repo.git"
            onChange={(event) => {
              updateSource(event.target.value);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onCheckRepositoryAccess}
            disabled={cloneBusy || !cloneDraft.source.trim()}
          >
            {cloneCheckRunning ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {cloneCheckRunning ? "Checking" : "Check"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={parentId}>Destination folder</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            id={parentId}
            value={cloneDraft.parentPath}
            disabled={cloneRunning}
            placeholder="Choose a parent folder"
            onChange={(event) => {
              onCloneDraftChange({
                ...cloneDraft,
                parentPath: event.target.value
              });
            }}
          />
          <Button type="button" variant="outline" onClick={onChooseCloneParent} disabled={cloneRunning}>
            <FolderOpen />
            Browse
          </Button>
        </div>
      </div>

      <div className="setup-clone-options">
        <div className="grid gap-2">
          <Label htmlFor={directoryId}>Folder name</Label>
          <Input
            id={directoryId}
            value={cloneDraft.directoryName}
            disabled={cloneRunning}
            onChange={(event) => {
              onCloneDraftChange({
                ...cloneDraft,
                directoryName: event.target.value
              });
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={branchId}>Branch</Label>
          <ReferencePicker
            id={branchId}
            value={cloneDraft.branchName}
            {...(cloneDraft.branchName ? { displayValue: cloneDraft.branchName } : {})}
            options={[
              { value: "", label: "Default branch", icon: <GitBranchIcon /> },
              ...cloneBranches.map((branch) => ({ value: branch, label: branch, icon: <GitBranchIcon /> }))
            ]}
            disabled={cloneRunning}
            ariaLabel="Choose branch"
            placeholder="Optional"
            searchPlaceholder="Search or enter a branch..."
            emptyMessage="No branches found."
            triggerIcon={<GitBranchIcon />}
            customValueLabel={(query) => `Use branch “${query}”`}
            onValueChange={(branchName) => onCloneDraftChange({ ...cloneDraft, branchName })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={depthId}>Depth</Label>
          <Input
            id={depthId}
            type="number"
            min="0"
            step="1"
            value={cloneDraft.depth}
            disabled={cloneRunning}
            placeholder="Optional"
            onChange={(event) => {
              onCloneDraftChange({
                ...cloneDraft,
                depth: event.target.value
              });
            }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cloneDraft.recurseSubmodules}
          disabled={cloneRunning}
          onChange={(event) => onCloneDraftChange({ ...cloneDraft, recurseSubmodules: event.target.checked })}
        />
        Initialize submodules recursively
      </label>

      {cloneError ? (
        <p className="setup-error selectable-text" role="alert">{cloneError}</p>
      ) : null}
      <MotionSwap
        item={cloneCheckMessage ? {
          key: `${cloneCheckStatus}:${cloneCheckMessage}`,
          content: (
            <p className={`${cloneCheckStatus === "success" ? "setup-success" : "setup-error"} selectable-text`} role={cloneCheckStatus === "error" ? "alert" : "status"}>
              {cloneCheckMessage}
            </p>
          )
        } : null}
        className="clone-check-message-swap"
        presenceClassName="clone-check-message-presence"
        initialY={-2}
      />

      <Button type="submit" className="w-full justify-center" disabled={cloneBusy}>
        {cloneRunning ? <Loader2 className="animate-spin" /> : <Download />}
        {cloneRunning ? "Cloning" : "Clone Repository"}
      </Button>
      {cloneBusy ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full justify-center"
          disabled={cancelStatus === "canceling"}
          onClick={onCancelOperation}
        >
          {cancelStatus === "canceling" ? <Loader2 className="animate-spin" /> : <X />}
          {cancelStatus === "canceling"
            ? "Cancelling"
            : cloneCheckRunning
              ? "Cancel Check"
              : "Cancel Clone"}
        </Button>
      ) : null}
      {cancelError ? (
        <p className="setup-error selectable-text" role="alert">{cancelError}</p>
      ) : null}
    </form>
  );
}

function RepositoryPanel({
  repoPath,
  repoRecents,
  repositoryGroups,
  repoSyncStatuses,
  summary,
  upstreamError,
  running,
  appUpdate,
  clonePanelOpen,
  cloneDraft,
  cloneError,
  cloneRunning,
  cloneCheckRunning,
  cloneCheckStatus,
  cloneCheckMessage,
  cloneBranches,
  cancelStatus,
  cancelError,
  onClonePanelOpenChange,
  onChooseRepo,
  onSelectRecent,
  onRemoveRecent,
  onRecoverRecent,
  onReorderRepositories,
  onShowInExplorer,
  onOpenRepositorySettings,
  onAddWorktree,
  onRemoveWorktree,
  onSwitchBranch,
  onCheckoutRemoteBranch,
  onOpenBranchDialog,
  onOpenBranchManager,
  onOpenMerge,
  onOpenRebase,
  onChangeUpstream,
  onOpenRemoteManager,
  onOpenExternalUrl,
  onOpenSettings,
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone,
  onCancelOperation,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate
}: {
  repoPath: string;
  repoRecents: string[];
  repositoryGroups: RepositoryGroup[];
  repoSyncStatuses: Record<string, RepoSyncStatus>;
  summary: RepoSummary | null;
  upstreamError: string;
  running: boolean;
  appUpdate: AppUpdateState;
  clonePanelOpen: boolean;
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  cancelStatus: OperationCancelStatus;
  cancelError: string;
  onClonePanelOpenChange: (open: boolean) => void;
  onChooseRepo: () => void;
  onSelectRecent: (repoPath: string) => void;
  onRemoveRecent: (repoPath: string) => void;
  onRecoverRecent: (repoPath: string) => Promise<RepositoryRecoveryResult>;
  onReorderRepositories: (repoPaths: string[]) => void;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
  onAddWorktree: () => void;
  onRemoveWorktree: (worktree: GitWorktree) => void;
  onSwitchBranch: (branchName: string) => void;
  onCheckoutRemoteBranch: (remoteBranch: GitRemoteBranch) => void;
  onOpenBranchDialog: () => void;
  onOpenBranchManager: () => void;
  onOpenMerge: () => void;
  onOpenRebase: () => void;
  onChangeUpstream: (upstream: string | null) => void;
  onOpenRemoteManager: () => void;
  onOpenExternalUrl: (url: string) => void;
  onOpenSettings: () => void;
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
  onCancelOperation: () => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
}): ReactNode {
  const [addMode, setAddMode] = useState<"choice" | "clone">("choice");
  const remotes = summary?.remotes.length
    ? [...new Set(summary.remotes.map((remote) => remote.name))].join(", ")
    : "-";
  const repositoryUrl = getRepositoryWebUrl(summary?.remotes ?? []);
  const addBusy = cloneRunning || cloneCheckRunning;

  const updateAddPopoverOpen = (open: boolean): void => {
    if (!open && addBusy) {
      return;
    }

    setAddMode("choice");
    onClonePanelOpenChange(open);
  };

  const chooseExistingRepo = (): void => {
    if (running) {
      return;
    }

    setAddMode("choice");
    onClonePanelOpenChange(false);
    onChooseRepo();
  };

  return (
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-auto border-r bg-sidebar p-6 text-sidebar-foreground">
      <RepositoryList
        repoPath={repoPath}
        repoPaths={repoRecents}
        groups={repositoryGroups}
        syncStatuses={repoSyncStatuses}
        disabled={running}
        onSelect={onSelectRecent}
        onRemove={onRemoveRecent}
        onRecover={onRecoverRecent}
        onReorder={onReorderRepositories}
        onShowInExplorer={onShowInExplorer}
        onOpenRepositorySettings={onOpenRepositorySettings}
        onRemoveWorktree={onRemoveWorktree}
        headingAction={(
          <Popover open={clonePanelOpen} onOpenChange={updateAddPopoverOpen}>
          <PopoverTrigger asChild>
            <TooltipButton
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Add repository"
              tooltip="Add repository"
            >
              <Plus />
            </TooltipButton>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="right"
            sideOffset={12}
            collisionPadding={12}
            className={addMode === "clone" ? "clone-popout-content" : "repo-add-popout-content"}
          >
            {addMode === "clone" ? (
              <CloneRepositoryForm
                idPrefix="sidebar-clone"
                cloneDraft={cloneDraft}
                cloneError={cloneError}
                cloneRunning={cloneRunning}
                cloneCheckRunning={cloneCheckRunning}
                cloneCheckStatus={cloneCheckStatus}
                cloneCheckMessage={cloneCheckMessage}
                cloneBranches={cloneBranches}
                cancelStatus={cancelStatus}
                cancelError={cancelError}
                onCloneDraftChange={onCloneDraftChange}
                onCloneSourceChange={onCloneSourceChange}
                onChooseCloneParent={onChooseCloneParent}
                onCheckRepositoryAccess={onCheckRepositoryAccess}
                onClone={onClone}
                onCancelOperation={onCancelOperation}
              />
            ) : (
              <div className="repo-add-menu" aria-label="Add repository">
                <p className="repo-add-title">Add repository</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="repo-add-option"
                  onClick={chooseExistingRepo}
                  disabled={running}
                >
                  <FolderOpen />
                  <span>Add existing</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="repo-add-option"
                  onClick={() => {
                    setAddMode("clone");
                  }}
                  disabled={running}
                >
                  <GitFork />
                  <span>Clone new</span>
                </Button>
              </div>
            )}
          </PopoverContent>
          </Popover>
        )}
      />

      <dl className="repo-facts">
        <BranchFact
          repoPath={repoPath}
          currentBranch={summary?.branch ?? null}
          branches={summary?.branches ?? []}
          remoteBranches={summary?.remoteBranches ?? []}
          integrationEnabled={summary?.kind === "git"}
          disabled={running || !summary?.isValid}
          onSwitchBranch={onSwitchBranch}
          onOpenWorktree={onSelectRecent}
          onCheckoutRemoteBranch={onCheckoutRemoteBranch}
          onCreateBranch={onOpenBranchDialog}
          onCreateWorktree={onAddWorktree}
          onManageBranches={onOpenBranchManager}
          onMerge={onOpenMerge}
          onRebase={onOpenRebase}
        />
        {(summary?.capabilities.setUpstream ?? true) ? (
          <UpstreamFact
            upstream={summary?.upstream ?? null}
            error={upstreamError}
            currentBranch={summary?.branch ?? null}
            remoteBranches={summary?.remoteBranches ?? []}
            disabled={running || !summary?.isValid}
            onChangeUpstream={onChangeUpstream}
          />
        ) : null}
        {(summary?.capabilities.manageRemotes ?? false) ? (
          <RemoteFact
            remotes={remotes}
            repositoryUrl={repositoryUrl}
            disabled={running || !summary?.isValid}
            onOpen={onOpenExternalUrl}
            onManage={onOpenRemoteManager}
          />
        ) : (
          <Fact label={(summary?.capabilities.multipleRemotes ?? true) ? "Remotes" : "Remote"} value={remotes} />
        )}
      </dl>

      <div className="mt-auto grid gap-2">
        <AppUpdateControl
          state={appUpdate}
          onCheck={onCheckForUpdates}
          onDownload={onDownloadUpdate}
          onInstall={onInstallUpdate}
        />
        <Button type="button" variant="secondary" onClick={onOpenSettings} disabled={running}>
          <Settings />
          Settings
        </Button>
      </div>
    </aside>
  );
}

function BranchFact({
  repoPath,
  currentBranch,
  branches,
  remoteBranches,
  integrationEnabled,
  disabled,
  onSwitchBranch,
  onOpenWorktree,
  onCheckoutRemoteBranch,
  onCreateBranch,
  onCreateWorktree,
  onManageBranches,
  onMerge,
  onRebase
}: {
  repoPath: string;
  currentBranch: string | null;
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  integrationEnabled: boolean;
  disabled: boolean;
  onSwitchBranch: (branchName: string) => void;
  onOpenWorktree: (repoPath: string) => void;
  onCheckoutRemoteBranch: (remoteBranch: GitRemoteBranch) => void;
  onCreateBranch: () => void;
  onCreateWorktree: () => void;
  onManageBranches: () => void;
  onMerge: () => void;
  onRebase: () => void;
}): ReactNode {
  const switchableBranches = branches.filter((branch) => !branch.current && branch.name !== currentBranch);
  const activeBranch = branches.find((branch) => branch.current || branch.name === currentBranch) ?? null;
  const localUpstreams = new Set(branches.flatMap((branch) => branch.upstream ? [branch.upstream] : []));
  const checkoutableRemoteBranches = remoteBranches.filter((remoteBranch) => !localUpstreams.has(remoteBranch.name));
  const activeBranchValue = currentBranch ? `local:${currentBranch}` : "";
  const branchOptions: ReferencePickerOption[] = [
    ...(activeBranch ? [{
      value: `local:${activeBranch.name}`,
      label: activeBranch.name,
      detail: "current",
      group: "Local branches",
      icon: <GitBranchIcon />
    }] : []),
    ...switchableBranches.map((branch) => {
      const occupiedElsewhere = Boolean(branch.worktreePath && !isSameRepoPath(branch.worktreePath, repoPath));
      return {
        value: `local:${branch.name}`,
        label: branch.name,
        ...(occupiedElsewhere
          ? { detail: getRepoDisplayName(branch.worktreePath ?? "") }
          : branch.upstream ? { detail: branch.upstream } : {}),
        group: "Local branches",
        icon: occupiedElsewhere ? <FolderOpen /> : <GitBranchIcon />
      };
    }),
    ...checkoutableRemoteBranches.map((remoteBranch) => ({
      value: `remote:${remoteBranch.name}`,
      label: remoteBranch.branch,
      detail: remoteBranch.remote,
      group: "Remote branches",
      icon: <Download />
    }))
  ];

  return (
    <div className="repo-branch-fact">
      <dt>Branch</dt>
      <dd>
        <ReferencePicker
          value={activeBranchValue}
          options={branchOptions}
          disabled={disabled}
          ariaLabel="Switch branch"
          placeholder={currentBranch ?? "-"}
          searchPlaceholder="Search branches..."
          emptyMessage="No branches found."
          triggerIcon={<GitBranchIcon />}
          compact
          onValueChange={(value) => {
            if (value.startsWith("local:")) {
              const name = value.slice("local:".length);
              const branch = branches.find((candidate) => candidate.name === name);
              if (!branch || branch.name === currentBranch) return;
              const occupiedElsewhere = Boolean(branch.worktreePath && !isSameRepoPath(branch.worktreePath, repoPath));
              if (occupiedElsewhere && branch.worktreePath) onOpenWorktree(branch.worktreePath);
              else onSwitchBranch(branch.name);
              return;
            }
            const remoteBranch = remoteBranches.find((candidate) => `remote:${candidate.name}` === value);
            if (remoteBranch) onCheckoutRemoteBranch(remoteBranch);
          }}
          actions={[
            { label: "New Branch", icon: <Plus />, onSelect: onCreateBranch },
            ...(integrationEnabled ? [
              { label: "Add Worktree…", icon: <GitFork />, onSelect: onCreateWorktree },
              { label: "Merge Branch…", icon: <GitFork />, onSelect: onMerge },
              { label: "Rebase Branch…", icon: <History />, onSelect: onRebase }
            ] : []),
            { label: "Manage Branches…", icon: <Settings />, onSelect: onManageBranches }
          ]}
        />
        <span className="repo-branch-actions">
          <TooltipButton
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={disabled}
            onClick={onCreateBranch}
            aria-label="Create branch"
            tooltip="Create branch"
          >
            <Plus />
          </TooltipButton>
        </span>
      </dd>
    </div>
  );
}

function UpstreamFact({
  upstream,
  error,
  currentBranch,
  remoteBranches,
  disabled,
  onChangeUpstream
}: {
  upstream: string | null;
  error: string;
  currentBranch: string | null;
  remoteBranches: GitRemoteBranch[];
  disabled: boolean;
  onChangeUpstream: (upstream: string | null) => void;
}): ReactNode {
  const canChange = !disabled && Boolean(currentBranch) && (remoteBranches.length > 0 || Boolean(upstream));
  const options: ReferencePickerOption[] = [
    ...remoteBranches.map((remoteBranch) => ({
      value: remoteBranch.name,
      label: remoteBranch.name,
      detail: remoteBranch.branch,
      group: remoteBranch.remote,
      icon: <GitBranchIcon />
    })),
    {
      value: "",
      label: "No upstream",
      detail: upstream ? `Stop tracking ${upstream}` : "Do not track a remote branch",
      group: "Tracking",
      icon: <Minus />
    }
  ];

  return (
    <div className="repo-upstream-fact">
      <dt>Upstream</dt>
      <dd>
        <TooltipTarget content={!canChange
          ? !currentBranch
            ? "Select a branch before changing its upstream"
            : "Add a remote before setting an upstream"
          : upstream}>
          <span className="min-w-0">
            <ReferencePicker
              value={upstream ?? ""}
              options={options}
              disabled={!canChange}
              ariaLabel="Change upstream"
              placeholder="-"
              searchPlaceholder="Search remote branches..."
              emptyMessage="No remote branches found."
              triggerIcon={<GitBranchIcon />}
              compact
              onValueChange={(value) => onChangeUpstream(value || null)}
            />
          </span>
        </TooltipTarget>
        {error ? <p className="repo-upstream-error" role="alert">{error}</p> : null}
      </dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AppUpdateControl({
  state,
  onCheck,
  onDownload,
  onInstall
}: {
  state: AppUpdateState;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}): ReactNode {
  const action = resolveAppUpdateAction(state);
  const present = action !== "none";
  const visibleStateRef = useRef(state);
  if (present) {
    visibleStateRef.current = state;
  }
  const visibleState = present ? state : visibleStateRef.current;
  const visibleAction = resolveAppUpdateAction(visibleState);
  const version = visibleState.downloadedVersion ?? visibleState.availableVersion;
  const label = getAppUpdateButtonLabel(visibleState);
  const disabled = visibleState.status === "checking" || visibleState.status === "downloading";
  const icon = visibleState.status === "downloaded"
    ? <RotateCcw />
    : visibleState.status === "checking" || visibleState.status === "downloading"
      ? <Loader2 className="animate-spin" />
      : visibleAction === "check"
        ? <RefreshCw />
        : <Download />;

  const runAction = (): void => {
    if (visibleAction === "check") {
      onCheck();
      return;
    }

    if (visibleAction === "download") {
      onDownload();
      return;
    }

    if (window.confirm("Restart Githead now to install the downloaded update?")) {
      onInstall();
    }
  };

  return (
    <MotionPresence
      present={present}
      className={`app-update-control is-${visibleState.status}`}
      element="section"
      ariaLabel="App update"
      enterDuration={200}
      initialY={4}
    >
      {visibleState.message ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={visibleState.status === "error" ? "outline" : "secondary"}
              disabled={disabled}
              onClick={runAction}
              aria-label={`${label}: ${visibleState.message}`}
            >
              {icon}
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            {visibleState.message}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant={visibleState.status === "error" ? "outline" : "secondary"}
          disabled={disabled}
          onClick={runAction}
        >
          {icon}
          {label}
        </Button>
      )}
      {version ? (
        <div className="app-update-version-row">
          <p className="app-update-version">Version {version}</p>
          {visibleState.releaseNotes ? <AppUpdateReleaseNotesPopover state={visibleState} /> : null}
        </div>
      ) : null}
    </MotionPresence>
  );
}

function AppUpdateReleaseNotesPopover({ state }: { state: AppUpdateState }): ReactNode {
  const releaseNotes = state.releaseNotes;
  if (!releaseNotes) {
    return null;
  }

  const openReleaseNotes = (): void => {
    if (releaseNotes.url) {
      void window.githead.openExternalUrl({ url: releaseNotes.url });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="app-update-release-notes-trigger">
          Release Notes
        </Button>
      </PopoverTrigger>
      <PopoverContent className="app-update-release-notes-popover" align="end">
        <div className="app-update-release-notes-header">
          <div className="min-w-0">
            <p className="eyebrow">Release</p>
            <h3>{releaseNotes.title || `Version ${releaseNotes.version}`}</h3>
          </div>
          {releaseNotes.url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={openReleaseNotes}
            >
              <ExternalLink />
              Open on GitHub
            </Button>
          ) : null}
        </div>
        {releaseNotes.loading ? (
          <LoadingState label="Loading release notes" className="min-h-10 p-2" />
        ) : releaseNotes.error ? (
          <p className="app-update-release-notes-error" role="status" aria-live="polite">{releaseNotes.error}</p>
        ) : releaseNotes.body ? (
          <div className="app-update-release-notes-body selectable-text">
            <OptionalFeatureBoundary name="release notes">
              <BasicMarkdown>{releaseNotes.body}</BasicMarkdown>
            </OptionalFeatureBoundary>
          </div>
        ) : (
          <p className="app-update-release-notes-status">No release notes published for this version.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ActionBar({
  heading,
  summary,
  runningAction,
  feedbackEvent,
  configuredActionRuns,
  disabled,
  cancellable,
  cancelStatus,
  cancelError,
  showCreatePullRequest,
  branchPullRequests,
  pullRecovery,
  onRunAction,
  onOpenPushToBranch,
  onRunConfiguredAction,
  onManageActions,
  onCreatePullRequest,
  onCancel,
  onOpenExternalUrl
}: {
  heading: string;
  summary: RepoSummary | null;
  runningAction: string | null;
  feedbackEvent: OperationButtonFeedbackEvent | null;
  configuredActionRuns: ConfiguredActionRun[];
  disabled: boolean;
  cancellable: boolean;
  cancelStatus: OperationCancelStatus;
  cancelError: string;
  showCreatePullRequest: boolean;
  branchPullRequests: GitHubPullRequestAssociation[];
  pullRecovery: GitPullRecovery | null;
  onRunAction: (action: GitAction) => void;
  onOpenPushToBranch: () => void;
  onRunConfiguredAction: (action: GitConfiguredAction) => void;
  onManageActions: () => void;
  onCreatePullRequest: () => void;
  onCancel: () => void;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  const capabilities = summary?.capabilities ?? null;
  // Lore is centralized: it has no "fetch", and "pull" maps to `lore sync`.
  const showFetch = capabilities?.fetch ?? true;
  const usesSync = capabilities?.sync ?? false;
  const pullableCommitCount = getPullableCommitCount(summary);
  const pullLabel = pullRecovery ? "Resolve" : usesSync ? "Sync" : "Pull";
  const pullAriaLabel = pullRecovery
    ? "Resolve remote history change"
    : !usesSync && pullableCommitCount > 0
    ? formatActionCountLabel("Pull", pullableCommitCount)
    : undefined;
  const publishInsteadOfPush = shouldPublishInsteadOfPush(summary);
  const pushableCommitCount = getPushableCommitCount(summary);
  const pushAriaLabel = publishInsteadOfPush
    ? "Publish branch"
    : pushableCommitCount > 0
    ? formatActionCountLabel("Push", pushableCommitCount)
    : undefined;
  const showPushMenu = capabilities?.pushToBranch ?? false;
  const pushMenuDisabled = disabled || !summary?.branch || getPushRemotes(summary).length === 0;
  const actionsConfig = summary?.actionsConfig;
  const configuredActions = actionsConfig?.actions ?? [];
  const actionsConfigError = actionsConfig?.error.trim() ?? "";
  const hasConfiguredActions = configuredActions.length > 0;
  const runningConfiguredAction = configuredActionRuns.length > 0;
  const actionsMenuDisabled = !summary?.isValid;

  return (
    <header className="flex items-center justify-between gap-5 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <p className="eyebrow">Sync</p>
        <h2 className="truncate text-base font-semibold">{heading}</h2>
        {cancelError ? <p className="mt-1 max-w-xl text-xs text-destructive" role="alert">{cancelError}</p> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Git actions">
        {cancellable ? (
          <Button type="button" variant="destructive" disabled={cancelStatus === "canceling"} onClick={onCancel}>
            {cancelStatus === "canceling" ? <Loader2 className="animate-spin" /> : <X />}
            {cancelStatus === "canceling" ? "Cancelling" : cancelStatus === "error" ? "Retry Cancel" : "Cancel"}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={runningConfiguredAction ? "secondary" : "outline"}
              disabled={actionsMenuDisabled}
              aria-label="Repository actions"
              className="min-w-28"
            >
              {runningConfiguredAction ? <Loader2 className="animate-spin" /> : <Workflow />}
              Actions
              {configuredActionRuns.length > 1 ? ` ${configuredActionRuns.length}` : null}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actionsConfigError ? (
              <DropdownMenuItem disabled className="max-w-80 whitespace-normal">
                {actionsConfigError}
              </DropdownMenuItem>
            ) : hasConfiguredActions ? (
              configuredActions.map((action) => {
                const item = (
                  <DropdownMenuItem onSelect={() => onRunConfiguredAction(action)}>
                    <Workflow />
                    {action.name}
                  </DropdownMenuItem>
                );
                return action.description ? (
                  <Tooltip key={action.name}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="left">{action.description}</TooltipContent>
                  </Tooltip>
                ) : <Fragment key={action.name}>{item}</Fragment>;
              })
            ) : (
              <DropdownMenuItem disabled>
                No configured actions
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onManageActions}>
              <Settings />
              Manage Repository Actions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {showFetch ? (
          <Button
            type="button"
            variant={runningAction === "fetch" ? "secondary" : "outline"}
            disabled={disabled}
            onClick={() => onRunAction("fetch")}
            className="min-w-24"
          >
            <OperationButtonFeedback
              action="fetch"
              event={feedbackEvent}
              successLabel="Fetched"
              surface="action-bar"
            >
              {runningAction === "fetch" ? <Loader2 className="animate-spin" /> : <Download />}
              Fetch
            </OperationButtonFeedback>
          </Button>
        ) : null}
        <Button
          type="button"
          variant={runningAction === "pull" ? "secondary" : "outline"}
          disabled={disabled}
          onClick={() => onRunAction("pull")}
          aria-label={pullAriaLabel}
          className="min-w-24"
        >
          <OperationButtonFeedback
            action="pull"
            event={feedbackEvent}
            successLabel={usesSync ? "Synced" : "Pulled"}
            surface="action-bar"
          >
            {runningAction === "pull" ? <Loader2 className="animate-spin" /> : pullRecovery ? <ShieldAlert /> : <Download />}
            {pullLabel}
            {!pullRecovery && !usesSync && pullableCommitCount > 0 ? (
              <SyncCountChip title={formatCommitCountLabel(pullableCommitCount, "behind")}>
                {pullableCommitCount}
              </SyncCountChip>
            ) : null}
          </OperationButtonFeedback>
        </Button>
        <div className="flex items-stretch">
          <Button
            type="button"
            variant={runningAction === "push" ? "secondary" : "outline"}
            disabled={disabled}
            onClick={() => onRunAction("push")}
            aria-label={pushAriaLabel}
            className={`min-w-24 ${showPushMenu ? "rounded-r-none" : ""}`}
          >
            <OperationButtonFeedback
              action="push"
              event={feedbackEvent}
              successLabel="Pushed"
              surface="action-bar"
            >
              {runningAction === "push" ? <Loader2 className="animate-spin" /> : <Upload />}
              {publishInsteadOfPush ? "Publish" : "Push"}
              {!publishInsteadOfPush && pushableCommitCount > 0 ? (
                <SyncCountChip title={formatCommitCountLabel(pushableCommitCount, "ahead")}>
                  {pushableCommitCount}
                </SyncCountChip>
              ) : null}
            </OperationButtonFeedback>
          </Button>
          {showPushMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={runningAction === "push" ? "secondary" : "outline"}
                  disabled={pushMenuDisabled}
                  aria-label="More push actions"
                  className="rounded-l-none border-l-border px-2"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onOpenPushToBranch}>
                  <GitBranchIcon />
                  Push to another branch…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {branchPullRequests.length === 1 ? (
          <Button type="button" variant="outline" onClick={() => onOpenExternalUrl(branchPullRequests[0]!.url)} className="min-w-24">
            <GitPullRequest />
            PR #{branchPullRequests[0]!.number} · {formatPullRequestAssociationState(branchPullRequests[0]!)}
          </Button>
        ) : branchPullRequests.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline"><GitPullRequest />Multiple pull requests<ChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {branchPullRequests.map((pullRequest) => (
                <DropdownMenuItem key={`${pullRequest.headRepositoryFullName}:${pullRequest.number}`} onSelect={() => onOpenExternalUrl(pullRequest.url)}>
                  {pullRequest.headRepositoryFullName ?? pullRequest.baseRepositoryFullName} #{pullRequest.number} · {formatPullRequestAssociationState(pullRequest)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : showCreatePullRequest ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onCreatePullRequest}
            className="min-w-24"
          >
            <GitPullRequest />
            Create PR
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function StatusView({
  stagedFiles,
  unstagedFiles,
  summary,
  selection,
  diff,
  diffLoading,
  diffChanged,
  disabled,
  recoveryMode,
  workspaceMode,
  onWorkspaceModeChange,
  viewMode,
  onViewModeChange,
  wrapLines,
  onWrapLinesChange,
  onSelectFile,
  onStageFiles,
  onUnstageFiles,
  onRefreshDiff,
  onDownloadImage,
  onApplyHunk,
  onContextAction,
  onUpdateSubmodules,
  onSyncSubmodules,
  canGeneratePlan,
  generatePlanTitle,
  repositoryChangeVersion,
  onGeneratePlan,
  onQuickCommit,
  composer
}: {
  stagedFiles: GitStatusFile[];
  unstagedFiles: GitStatusFile[];
  summary: RepoSummary | null;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  diffChanged: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  workspaceMode: "files" | "plan";
  onWorkspaceModeChange: (mode: "files" | "plan") => void;
  viewMode: StatusFileViewMode;
  onViewModeChange: (mode: StatusFileViewMode) => void;
  wrapLines: boolean;
  onWrapLinesChange: (wrap: boolean) => void;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onStageFiles: (paths: string[], selection?: FileSelection) => void;
  onUnstageFiles: (paths: string[], selection?: FileSelection) => void;
  onRefreshDiff: () => void;
  onDownloadImage: () => void;
  onApplyHunk: (patch: string) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
  onUpdateSubmodules: (path?: string) => void;
  onSyncSubmodules: () => void;
  canGeneratePlan: boolean;
  generatePlanTitle: string;
  repositoryChangeVersion: number;
  onGeneratePlan: (paths: string[]) => Promise<GenerateCommitPlanResult | null>;
  onQuickCommit: (changes: GitQuickCommitChange[], message: string) => Promise<GitOperationResult | null>;
  composer?: ReactNode;
}): ReactNode {
  const stagedSelectionPaths = selection?.side === "staged" ? getSelectionPaths(selection) : [];
  const unstagedSelectionPaths = selection?.side === "unstaged" ? getSelectionPaths(selection) : [];
  const selectedFile = selection
    ? getFilesForSide(summary, selection.side).find((file) => file.path === selection.path) ?? null
    : null;
  const canApplyHunks = Boolean(
    selection &&
    diff?.kind === "text" &&
    !diff.truncated &&
    !selectedFile?.isConflicted &&
    (summary?.capabilities.hunkStaging ?? true)
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 bg-background">
      <ResizablePanel defaultSize="38%" minSize="300px" className="min-w-[300px]">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r bg-card">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b px-4 py-1.5">
            {(summary?.submodules?.length ?? 0) > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={disabled || recoveryMode}>
                    <GitFork />
                    Submodules
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => onUpdateSubmodules()}>
                    <RefreshCw />
                    Update all submodules
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onSyncSubmodules}>
                    <GitFork />
                    Sync submodule URLs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <div className="ml-auto inline-flex rounded-md border p-0.5" role="group" aria-label="Changed file view mode">
              <TooltipButton type="button" variant={workspaceMode === "files" && viewMode === "list" ? "secondary" : "ghost"} size="icon-xs" aria-pressed={workspaceMode === "files" && viewMode === "list"} aria-label="List view" tooltip="Show files as a list" onClick={() => { onWorkspaceModeChange("files"); onViewModeChange("list"); }}><List /></TooltipButton>
              <TooltipButton type="button" variant={workspaceMode === "files" && viewMode === "tree" ? "secondary" : "ghost"} size="icon-xs" aria-pressed={workspaceMode === "files" && viewMode === "tree"} aria-label="Tree view" tooltip="Show files as a tree" onClick={() => { onWorkspaceModeChange("files"); onViewModeChange("tree"); }}><ListTree /></TooltipButton>
              <TooltipButton type="button" variant={workspaceMode === "plan" ? "secondary" : "ghost"} size="icon-xs" aria-pressed={workspaceMode === "plan"} aria-label="Commit plan view" tooltip="Group files into planned commits" disabled={recoveryMode} onClick={() => onWorkspaceModeChange("plan")}><Sparkles /></TooltipButton>
            </div>
          </div>
          {workspaceMode === "plan" ? (
            <CommitPlanView
              repoPath={summary?.repoPath ?? ""}
              files={unstagedFiles}
              stagedCount={stagedFiles.length}
              selectedPath={selection?.side === "unstaged" ? selection.path : null}
              disabled={disabled || recoveryMode}
              supported={summary?.kind === "git"}
              canGenerate={canGeneratePlan}
              generateTitle={generatePlanTitle}
              repositoryChangeVersion={repositoryChangeVersion}
              onSelectFile={(file) => onSelectFile(file, "unstaged", { extendRange: false, selectAll: false, toggle: false })}
              onGenerate={onGeneratePlan}
              onQuickCommit={onQuickCommit}
            />
          ) : (
          <ResizablePanelGroup id="status-file-groups" orientation="vertical" className="min-h-0">
            <ResizablePanel id="staged-file-group" defaultSize="50%" minSize="96px">
              <FileGroup
                title="Staged files"
                side="staged"
                files={stagedFiles}
                summary={summary}
                selection={selection}
                disabled={disabled}
                recoveryMode={recoveryMode}
                viewMode={viewMode}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || stagedFiles.length === 0}
                      onClick={() => onUnstageFiles(stagedFiles.map((file) => file.path))}
                    >
                      Unstage All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || stagedSelectionPaths.length === 0}
                      onClick={() => {
                        if (selection?.side === "staged" && stagedSelectionPaths.length > 0) {
                          onUnstageFiles(
                            stagedSelectionPaths,
                            createFileSelection("unstaged", stagedSelectionPaths, selection.path, selection.anchorPath)
                          );
                        }
                      }}
                    >
                      Unstage
                    </Button>
                  </>
                }
                onSelectFile={onSelectFile}
                onContextAction={onContextAction}
              />
            </ResizablePanel>
            <ResizableHandle withHandle aria-label="Resize staged and unstaged file lists" />
            <ResizablePanel id="unstaged-file-group" defaultSize="50%" minSize="96px">
              <FileGroup
                title="Unstaged files"
                side="unstaged"
                files={unstagedFiles}
                summary={summary}
                selection={selection}
                disabled={disabled}
                recoveryMode={recoveryMode}
                viewMode={viewMode}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || !unstagedFiles.some(canStageStatusFile)}
                      onClick={() => onStageFiles(unstagedFiles.filter(canStageStatusFile).map((file) => file.path))}
                    >
                      Stage All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || unstagedSelectionPaths.length === 0 || !unstagedSelectionPaths.some((path) => unstagedFiles.find((file) => file.path === path && canStageStatusFile(file)))}
                      onClick={() => {
                        if (selection?.side === "unstaged" && unstagedSelectionPaths.length > 0) {
                          onStageFiles(
                            unstagedSelectionPaths.filter((path) => unstagedFiles.find((file) => file.path === path && canStageStatusFile(file))),
                            createFileSelection("staged", unstagedSelectionPaths, selection.path, selection.anchorPath)
                          );
                        }
                      }}
                    >
                      Stage
                    </Button>
                  </>
                }
                onSelectFile={onSelectFile}
                onContextAction={onContextAction}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel minSize="240px">
        <DiffPanel
          title={selection?.path ?? "Select a file"}
          eyebrow={selection ? `${capitalize(selection.side)} diff` : "Diff"}
          diff={diff}
          filePath={selection?.path ?? ""}
          loading={diffLoading}
          emptyMessage={selection ? "Refresh the diff to view this file." : "Select a file to view the diff"}
          onDownloadImage={onDownloadImage}
          imageDownloadLoading={disabled}
          repoPath={summary?.repoPath ?? ""}
          previewSource={selection && selectedFile && !selectedFile.submodule && isMarkdownPath(selection.path) && !isDeletedOnSide(selectedFile, selection.side)
            ? { kind: selection.side === "staged" ? "staged" : "working" }
            : undefined}
          hunkAction={canApplyHunks && selection ? {
            side: selection.side,
            disabled: disabled || diffChanged,
            onApply: onApplyHunk
          } : undefined}
          onRefresh={selection ? onRefreshDiff : undefined}
          refreshDisabled={disabled}
          changed={diffChanged}
          wrapLines={wrapLines}
          onWrapLinesChange={onWrapLinesChange}
        />
      </ResizablePanel>
      {composer}
    </ResizablePanelGroup>
  );
}

type ContextActionKind = "open" | "show" | "copy" | "toggle-stage" | "stash" | "delete" | "revert" | "ignore" | "update-submodule";
type CommitContextActionKind = "amend" | "tag" | "reset" | "revert" | "cherry-pick" | "copy";
type CommitFileContextActionKind = "log" | "blame" | "reset" | "open-current" | "open-selected" | "copy";

function FileGroup({
  title,
  side,
  files,
  summary,
  selection,
  disabled,
  recoveryMode,
  viewMode,
  actions,
  onSelectFile,
  onContextAction
}: {
  title: string;
  side: GitDiffSide;
  files: GitStatusFile[];
  summary: RepoSummary | null;
  selection: FileSelection | null;
  disabled: boolean;
  recoveryMode: boolean;
  viewMode: StatusFileViewMode;
  actions: ReactNode;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
}): ReactNode {
  const selectedPathSet = useMemo(
    () => selection?.side === side ? new Set(getSelectionPaths(selection)) : new Set<string>(),
    [selection, side]
  );
  const tree = useMemo(() => buildStatusFileTree(files), [files]);
  const [collapsedFolders, setCollapsedFolders] = usePersistentWorkspacePanelState<Set<string>>(
    `status-${side}-collapsed-folders`,
    () => new Set()
  );
  const treeRows = useMemo(
    () => flattenStatusFileTree(tree, collapsedFolders),
    [collapsedFolders, tree]
  );

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" aria-label={title}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title} ({files.length})</h2>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
      {!summary?.isValid ? (
        <div className="file-list" role={viewMode === "tree" ? "tree" : "listbox"} aria-label={title} aria-multiselectable="true" />
      ) : viewMode === "tree" ? (
        <FixedSizeVirtualList
          items={treeRows}
          itemKey={(row) => row.kind === "folder" ? `${side}:folder:${row.folder.id}` : `${side}:${row.file.path}`}
          rowHeight={34}
          ariaLabel={title}
          role="tree"
          selectedKey={selection?.side === side ? `${side}:${selection.path}` : null}
          className="file-list"
          renderItem={(row, index, rowProps) => {
            const treeRowProps = {
              ...rowProps,
              "aria-posinset": row.position,
              "aria-setsize": row.setSize
            };
            return row.kind === "folder" ? (
            <StatusFileTreeFolderRow
              key={`${side}:folder:${row.folder.id}`}
              folder={row.folder}
              side={side}
              level={row.level}
              collapsed={collapsedFolders.has(row.folder.id)}
              disabled={disabled}
              recoveryMode={recoveryMode}
              virtualIndex={index}
              virtualRowProps={treeRowProps}
              onToggle={() => setCollapsedFolders((current) => {
                const next = new Set(current);
                if (next.has(row.folder.id)) next.delete(row.folder.id);
                else next.add(row.folder.id);
                return next;
              })}
              onContextAction={onContextAction}
            />
          ) : (
            <FileRow
              key={`${side}:${row.file.path}`}
              file={row.file}
              side={side}
              selected={selectedPathSet.has(row.file.path)}
              disabled={disabled}
              recoveryMode={recoveryMode}
              onSelectFile={onSelectFile}
              onContextAction={onContextAction}
              treeLevel={row.level}
              virtualIndex={index}
              virtualRowProps={treeRowProps}
            />
            );
          }}
        />
      ) : (
        <FixedSizeVirtualList
          items={files}
          itemKey={(file) => `${side}:${file.path}`}
          rowHeight={34}
          ariaLabel={title}
          selectedKey={selection?.side === side ? `${side}:${selection.path}` : null}
          className="file-list"
          renderItem={(file, index, rowProps) => (
            <FileRow
              key={`${side}:${file.path}`}
              file={file}
              side={side}
              selected={selectedPathSet.has(file.path)}
              disabled={disabled}
              recoveryMode={recoveryMode}
              onSelectFile={onSelectFile}
              onContextAction={onContextAction}
              virtualIndex={index}
              virtualRowProps={rowProps}
            />
          )}
        />
      )}
    </section>
  );
}

function StatusFileTreeFolderRow({ folder, side, level, collapsed, disabled, recoveryMode, virtualIndex, virtualRowProps, onToggle, onContextAction }: {
  folder: StatusFileTreeFolder;
  side: GitDiffSide;
  level: number;
  collapsed: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  virtualIndex: number;
  virtualRowProps: VirtualRowProps;
  onToggle: () => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
}): ReactNode {
  const actionableFiles = side === "unstaged" ? folder.descendantFiles.filter(canStageStatusFile) : folder.descendantFiles;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="file-tree-folder-row" style={{ ...virtualRowProps.style, paddingLeft: `${(level - 1) * 18 + 4}px` }}>
          <button type="button" className="file-tree-folder-trigger" role="treeitem" aria-level={level} aria-expanded={!collapsed}
            aria-posinset={virtualRowProps["aria-posinset"]} aria-setsize={virtualRowProps["aria-setsize"]}
            data-folder-id={folder.id} data-virtual-index={virtualIndex} onClick={onToggle} onKeyDown={handleStatusTreeKeyDown}>
            {collapsed ? <ChevronRight /> : <ChevronDown />}<Folder /><span className="file-path">{folder.name}</span>
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{folder.id}</ContextMenuLabel>
        <ContextMenuItem disabled={disabled || actionableFiles.length === 0} onSelect={() => {
          const first = actionableFiles[0];
          if (first) onContextAction(first, side, "toggle-stage", actionableFiles.map((file) => file.path));
        }}>
          <Save />
          {side === "unstaged" ? "Stage folder" : "Unstage folder"}
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || recoveryMode || folder.descendantFiles.length === 0} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "stash", folder.descendantFiles.map((file) => file.path));
        }}>
          <Archive />
          Stash folder files...
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "revert", folder.descendantFiles.map((file) => file.path));
        }}>
          <RotateCcw />
          Revert folder changes
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "delete", folder.descendantFiles.map((file) => file.path));
        }}>
          <Trash2 />
          Delete folder files
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface StashComposerState {
  open: boolean;
  paths: string[];
}

function handleStatusTreeKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
  const current = event.currentTarget;
  const tree = current.closest('[role="tree"]');
  if (!tree) return;
  const items = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter((item) => item.offsetParent !== null);
  const index = items.indexOf(current);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    items[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  } else if (event.key === "ArrowLeft" && current.getAttribute("aria-expanded") === "true") {
    event.preventDefault(); current.click();
  } else if (event.key === "ArrowRight" && current.getAttribute("aria-expanded") === "false") {
    event.preventDefault(); current.click();
  }
}

function FileRow({
  file,
  side,
  selected,
  disabled,
  recoveryMode,
  onSelectFile,
  onContextAction,
  treeLevel,
  virtualIndex,
  virtualRowProps
}: {
  file: GitStatusFile;
  side: GitDiffSide;
  selected: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
  treeLevel?: number;
  virtualIndex?: number;
  virtualRowProps?: VirtualRowProps;
}): ReactNode {
  const actionLabel = side === "unstaged" ? "Stage" : "Unstage";
  const deleted = isDeletedOnSide(file, side);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={() => {
          if (!selected) {
            onSelectFile(file, side, { extendRange: false, selectAll: false, toggle: false });
          }
        }}
      >
        <button
          type="button"
          className={`file-row ${selected ? "is-selected" : ""}`}
          data-path={file.path}
          role={treeLevel ? "treeitem" : "option"}
          aria-level={treeLevel}
          aria-selected={selected}
          aria-posinset={virtualRowProps?.["aria-posinset"]}
          aria-setsize={virtualRowProps?.["aria-setsize"]}
          data-virtual-index={virtualIndex}
          style={treeLevel
            ? { ...virtualRowProps?.style, paddingLeft: `${(treeLevel - 1) * 18 + 8}px` }
            : virtualRowProps?.style}
          onClick={(event: MouseEvent<HTMLButtonElement>) => onSelectFile(file, side, {
            extendRange: event.shiftKey,
            selectAll: false,
            toggle: event.ctrlKey || event.metaKey
          })}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (treeLevel && event.key.startsWith("Arrow")) handleStatusTreeKeyDown(event);
            if (event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onSelectFile(file, side, {
                extendRange: false,
                selectAll: true,
                toggle: false
              });
            }
          }}
        >
          <StatusBadge file={file} side={side} />
          <TooltipTarget content={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
            <span className="file-path">{treeLevel ? fileName(file.path) : file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}</span>
          </TooltipTarget>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={disabled || deleted} onSelect={() => onContextAction(file, side, "open")}>
          <ExternalLink />
          {file.submodule ? "Open Submodule" : "Open"}
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "show")}>
          <MapPinned />
          Show in Explorer
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "copy")}>
          <Clipboard />
          Copy Path
        </ContextMenuItem>
        {file.submodule ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "update-submodule")}>
              <RefreshCw />
              Initialize / Update
            </ContextMenuItem>
          </>
        ) : <ContextMenuSeparator />}
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "toggle-stage")}>
          <Save />
          {actionLabel}
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "stash")}>
          <Archive />
          Stash selected files...
        </ContextMenuItem>
        {!file.submodule ? <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "delete")}>
          <Trash2 />
          Delete
        </ContextMenuItem> : null}
        {!file.submodule ? <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "revert")}>
          <RotateCcw />
          Revert changes
        </ContextMenuItem> : null}
        {!file.submodule ? <ContextMenuSeparator /> : null}
        {!file.submodule ? <ContextMenuItem disabled={disabled || recoveryMode || deleted} onSelect={() => onContextAction(file, side, "ignore")}>
          <FileCode2 />
          Add to ignore
        </ContextMenuItem> : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function StatusBadge({ file, side }: { file: GitStatusFile; side: GitDiffSide }): ReactNode {
  return <FileStatusChip visuals={getFileStatusVisuals(file, side)} />;
}

function CommitFileStatusBadge({ status }: { status: string }): ReactNode {
  return <FileStatusChip visuals={getCommitFileStatusVisuals(status)} />;
}

function DiffPanel({
  title,
  eyebrow,
  diff,
  filePath,
  loading,
  emptyMessage,
  hunkAction,
  repoPath,
  previewSource,
  onRefresh,
  refreshDisabled = false,
  changed = false,
  onDownloadImage,
  imageDownloadLoading = false,
  wrapLines,
  onWrapLinesChange
}: {
  title: string;
  eyebrow: string;
  diff: GitFileDiff | null;
  filePath: string;
  loading: boolean;
  emptyMessage: string;
  hunkAction?: DiffHunkAction | undefined;
  repoPath: string;
  previewSource?: GitFilePreviewSource | undefined;
  onRefresh?: (() => void) | undefined;
  refreshDisabled?: boolean;
  changed?: boolean;
  onDownloadImage?: () => void;
  imageDownloadLoading?: boolean;
  wrapLines: boolean;
  onWrapLinesChange: (wrap: boolean) => void;
}): ReactNode {
  const previewInstanceId = useId();
  const previewGeneration = useRef(0);
  const activePreviewRequestId = useRef<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<{ text: string | null; loading: boolean; error: string }>({
    text: null,
    loading: false,
    error: ""
  });
  const previewKey = previewSource
    ? `${repoPath}\0${filePath}\0${previewSource.kind}\0${previewSource.kind === "commit" ? previewSource.hash : ""}`
    : "";

  const cancelActivePreview = useCallback((): void => {
    const requestId = activePreviewRequestId.current;
    activePreviewRequestId.current = null;
    if (requestId) void window.githead.cancelRepositoryRead({ requestId }).catch(() => undefined);
  }, []);

  const resetPreview = useCallback((): void => {
    previewGeneration.current += 1;
    cancelActivePreview();
    setShowPreview(false);
    setPreview({ text: null, loading: false, error: "" });
  }, [cancelActivePreview]);

  useEffect(() => {
    resetPreview();
    return cancelActivePreview;
  }, [previewKey, diff, resetPreview, cancelActivePreview]);

  const togglePreview = useCallback((): void => {
    if (!previewSource) return;
    if (showPreview) {
      setShowPreview(false);
      return;
    }

    setShowPreview(true);
    if (preview.text !== null || preview.loading) return;

    const generation = previewGeneration.current + 1;
    previewGeneration.current = generation;
    const requestId = `file-preview:${previewInstanceId}:${generation}`;
    activePreviewRequestId.current = requestId;
    setPreview({ text: null, loading: true, error: "" });
    void window.githead.getFilePreview({ repoPath, path: filePath, source: previewSource, requestId })
      .then((result) => {
        if (generation !== previewGeneration.current) return;
        activePreviewRequestId.current = null;
        setPreview({ text: result.text, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (generation !== previewGeneration.current) return;
        activePreviewRequestId.current = null;
        setPreview({
          text: null,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load Markdown preview."
        });
      });
  }, [filePath, preview.loading, preview.text, previewInstanceId, previewSource, repoPath, showPreview]);

  let content: ReactNode = emptyMessage;
  let outputClass = "diff-output";

  if (showPreview && previewSource) {
    outputClass = "markdown-preview-output";
    content = preview.loading
      ? <LoadingState label="Loading Markdown preview" className="h-full" />
      : preview.error
        ? <p className="markdown-preview-status bad selectable-text" role="alert">{preview.error}</p>
        : (
          <OptionalFeatureBoundary name="Markdown preview">
            <MarkdownPreview text={preview.text ?? ""} />
          </OptionalFeatureBoundary>
        );
  } else if (loading && !diff) {
    content = <LoadingState label="Loading diff" className="h-full" />;
  } else if (diff) {
    outputClass = `diff-output ${diff.kind}${diff.kind === "text" && wrapLines ? " is-wrapped" : ""}`;
    content = diff.kind === "text"
      ? <DiffRows filePath={filePath} text={diff.text} truncated={Boolean(diff.truncated)} hunkAction={hunkAction} />
      : diff.kind === "image"
        ? <ImageDiffView filePath={filePath} before={diff.before} after={diff.after} {...(onDownloadImage ? { onDownload: onDownloadImage } : {})} downloading={imageDownloadLoading} />
        : diff.text;
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card" aria-label={eyebrow}>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <TooltipTarget content={title}><h2 className="truncate text-sm font-semibold">{title}</h2></TooltipTarget>
          {changed ? <p className="diff-changed-description" role="status">Loaded diff is out of date</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {diff?.kind === "text" && !showPreview ? (
            <TooltipButton
              type="button"
              variant={wrapLines ? "secondary" : "outline"}
              size="icon-sm"
              aria-label="Wrap diff lines"
              aria-pressed={wrapLines}
              tooltip={wrapLines ? "Use horizontal scrolling" : "Wrap long diff lines"}
              onClick={() => onWrapLinesChange(!wrapLines)}
            >
              <WrapText />
            </TooltipButton>
          ) : null}
          {previewSource ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={showPreview}
              onClick={togglePreview}
            >
              <Eye />
              {showPreview ? "Show Diff" : "Preview"}
            </Button>
          ) : null}
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={changed ? "diff-changed-refresh" : undefined}
              disabled={refreshDisabled || loading}
              onClick={() => {
              resetPreview();
              onRefresh();
            }}>
              <RefreshCw />
              {changed ? "New diff available" : loading ? "Loading diff" : "Refresh Diff"}
            </Button>
          ) : null}
        </div>
      </div>
      <div data-workspace-scroll-key={`diff:${eyebrow}`} className={`${outputClass}${changed ? " is-changed" : ""}`}>
        {content}
      </div>
    </section>
  );
}

interface DiffHunkAction {
  side: GitDiffSide;
  disabled: boolean;
  onApply: (patch: string) => void;
}

function DiffRows({
  filePath,
  text,
  truncated,
  hunkAction
}: {
  filePath: string;
  text: string;
  truncated: boolean;
  hunkAction?: DiffHunkAction | undefined;
}): ReactNode {
  const sessionRef = useRef<ReturnType<typeof createDiffProcessingSession> | null>(null);
  const {
    value: processedValue,
    requestValue: requestProcessedValue,
    rootRef,
    onPointerDownCapture
  } = useSelectionSafeValue<{
    filePath: string;
    text: string;
    truncated: boolean;
    result: ProcessedDiff;
  } | null>(null);

  useEffect(() => {
    const session = createDiffProcessingSession();
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    let cancelled = false;

    void session.process({ filePath, text, truncated }).then((result) => {
      if (!cancelled && result) requestProcessedValue({ filePath, text, truncated, result });
    });

    return () => {
      cancelled = true;
      session.cancel();
    };
  }, [filePath, requestProcessedValue, text, truncated]);

  const processed = processedValue?.filePath === filePath
    && processedValue.text === text
    && processedValue.truncated === truncated
    ? processedValue.result
    : null;
  const groups = processed?.groups ?? [];

  let hunkNumber = 0;

  return (
    <div className="diff-rows" ref={rootRef} aria-busy={!processed} onPointerDownCapture={onPointerDownCapture}>
      {!processed ? <LoadingState label="Processing diff" className="min-h-32" /> : null}
      {groups.map((group, groupIndex) => {
        const groupKey = `${groupIndex}:${group.kind}:${group.rows[0]?.text ?? ""}`;
        const rowViews = group.rows.flatMap((row, rowIndex) => {
          const visible = group.kind === "hunk" ? row.kind !== "hunk" : !isTechnicalFileHeader(row);
          const lineAction = visible ? createDiffLineAction(group, row, rowIndex, hunkAction) : undefined;
          return visible ? [
            <DiffRowView
              key={`${rowIndex}:${row.kind}:${row.oldLine ?? ""}:${row.newLine ?? ""}`}
              row={row}
              highlighted={processed?.highlightedRows[groupIndex]?.[rowIndex] ?? { kind: "plain", value: row.text }}
              lineAction={lineAction}
            />
          ] : [];
        });
        const hunkActionLabel = hunkAction?.side === "unstaged" ? "Stage Hunk" : "Unstage Hunk";

        if (group.kind === "hunk") {
          hunkNumber += 1;

          return (
            <div className="diff-hunk-block" key={groupKey}>
              <div className="diff-hunk-toolbar">
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span className="diff-hunk-title">{formatHunkTitle(group.rows, hunkNumber)}</span>
                <span className="diff-hunk-actions">
                  {hunkAction && group.patch ? (
                    <TooltipTarget content={hunkActionLabel}>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="diff-hunk-action"
                        aria-label={hunkActionLabel}
                        disabled={hunkAction.disabled}
                        onClick={() => hunkAction.onApply(group.patch!)}
                      >
                        {hunkActionLabel}
                      </Button>
                    </TooltipTarget>
                  ) : null}
                </span>
              </div>
              {rowViews}
            </div>
          );
        }

        return (
          <Fragment key={groupKey}>
            {rowViews}
          </Fragment>
        );
      })}
    </div>
  );
}

interface DiffLineAction {
  label: string;
  disabled: boolean;
  onApply: () => void;
}

function createDiffLineAction(
  group: DiffRowGroup,
  row: DiffRow,
  rowIndex: number,
  hunkAction: DiffHunkAction | undefined
): DiffLineAction | undefined {
  if (!hunkAction || (row.kind !== "add" && row.kind !== "delete")) return undefined;

  const lineNumber = row.newLine ?? row.oldLine;
  const verb = hunkAction.side === "unstaged" ? "Stage" : "Unstage";
  const changeKind = row.kind === "add" ? "added" : "deleted";
  const label = Number.isInteger(lineNumber)
    ? `${verb} ${changeKind} line ${lineNumber}`
    : `${verb} ${changeKind} line`;

  return {
    label,
    disabled: hunkAction.disabled,
    onApply: () => {
      const patch = createLinePatch(group, rowIndex, hunkAction.side);
      if (patch) hunkAction.onApply(patch);
    }
  };
}

function formatHunkTitle(rows: DiffRow[], hunkNumber: number): string {
  const lineNumbers = rows
    .flatMap((row) => row.newLine ?? row.oldLine ?? [])
    .filter((lineNumber) => Number.isInteger(lineNumber));
  const minLine = Math.min(...lineNumbers);
  const maxLine = Math.max(...lineNumbers);

  if (!Number.isFinite(minLine) || !Number.isFinite(maxLine)) {
    return `Hunk ${hunkNumber}`;
  }

  return minLine === maxLine
    ? `Hunk ${hunkNumber}: Line ${minLine}`
    : `Hunk ${hunkNumber}: Lines ${minLine}-${maxLine}`;
}

function DiffRowView({
  row,
  highlighted,
  lineAction
}: {
  row: DiffRow;
  highlighted: HighlightedCode;
  lineAction?: DiffLineAction | undefined;
}): ReactNode {
  return (
    <div className={`diff-row ${row.kind}`}>
      <span className="diff-line-number old-line">{row.oldLine === null ? "" : row.oldLine}</span>
      <span className="diff-line-number new-line">{row.newLine === null ? "" : row.newLine}</span>
      {lineAction ? (
        <button
          type="button"
          className="diff-marker diff-line-action"
          aria-label={lineAction.label}
          title={lineAction.label}
          disabled={lineAction.disabled}
          onClick={lineAction.onApply}
        >
          {row.marker}
        </button>
      ) : <span className="diff-marker">{row.marker}</span>}
      <DiffCode highlighted={highlighted} />
    </div>
  );
}

function DiffCode({ highlighted }: { highlighted: HighlightedCode }): ReactNode {
  if (highlighted.kind === "highlighted") {
    return <span className="diff-code hljs" dangerouslySetInnerHTML={{ __html: highlighted.value }} />;
  }

  return <span className="diff-code">{highlighted.value}</span>;
}

function HistoryView({
  summary,
  historyScope,
  history,
  historyLoading,
  historyError,
  selectedCommitHash,
  commitDetails,
  commitDetailsLoading,
  commitDetailsError,
  selectedCommitFilePath,
  commitFileDiff,
  commitFileDiffLoading,
  commitFileDiffError,
  wrapLines,
  allowCherryPickingContainedCommits,
  currentHeadHash,
  amendDisabledReason,
  disabled,
  insights,
  insightsLoading,
  insightsError,
  onRetryInsights,
  onOpenExternalUrl,
  onHistoryScopeChange,
  onSelectCommit,
  onSelectCommitFile,
  onCommitContextAction,
  onCommitFileContextAction,
  onDownloadImage,
  onWrapLinesChange
}: {
  summary: RepoSummary | null;
  historyScope: CommitHistoryScope;
  history: GitCommitGraphRow[];
  historyLoading: boolean;
  historyError: string;
  selectedCommitHash: string | null;
  commitDetails: GitCommitDetails | null;
  commitDetailsLoading: boolean;
  commitDetailsError: string;
  selectedCommitFilePath: string | null;
  commitFileDiff: GitFileDiff | null;
  commitFileDiffLoading: boolean;
  commitFileDiffError: string;
  wrapLines: boolean;
  allowCherryPickingContainedCommits: boolean;
  currentHeadHash: string | null;
  amendDisabledReason: string | null;
  disabled: boolean;
  insights: import("../shared/types").GitHubHistoryInsights;
  insightsLoading: boolean;
  insightsError: string;
  onRetryInsights: () => void;
  onOpenExternalUrl: (url: string) => void;
  onHistoryScopeChange: (scope: CommitHistoryScope) => void;
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
  onCommitFileContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
  onDownloadImage: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}): ReactNode {
  const graphLayout = useMemo(() => buildCommitGraphLayout(history), [history]);
  const associations = useMemo(() => createCommitAssociationMap(insights), [insights]);
  const historyColumns = useMemo(() => [
    { id: "graph", label: "Graph", defaultWidth: Math.max(82, graphLayout.width), minWidth: graphLayout.width },
    { id: "description", label: "Description", defaultWidth: 360, minWidth: 180 },
    { id: "date", label: "Date", defaultWidth: 150, minWidth: 90 },
    { id: "author", label: "Author", defaultWidth: 150, minWidth: 90 },
    { id: "commit", label: "Commit", defaultWidth: 92, minWidth: 72 },
    { id: "references", label: "References", defaultWidth: 220, minWidth: 120, defaultVisible: false },
    { id: "pullRequest", label: "Pull request", defaultWidth: 120, minWidth: 92, defaultVisible: false },
    { id: "checks", label: "Checks", defaultWidth: 110, minWidth: 82, defaultVisible: false }
  ] as const satisfies readonly ColumnDefinition<HistoryColumnId>[], [graphLayout.width]);
  const columnLayout = usePersistentColumnLayout("githead.column-layout.history", historyColumns);
  const selectedCommitFile = selectedCommitFilePath
    ? commitDetails?.files.find((file) => file.path === selectedCommitFilePath) ?? null
    : null;
  const showHistoryScope = summary?.isValid && summary.kind === "git";
  const graphColumnIndex = columnLayout.layout.order.indexOf("graph");
  const graphOffset = 12 + columnLayout.layout.order
    .slice(0, graphColumnIndex)
    .reduce((total, id) => total + columnLayout.layout.widths[id] + 10, 0);
  const historyStyle = {
    ...columnLayout.style,
    "--history-graph-offset": `${graphOffset}px`
  } as CSSProperties;

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0 bg-background">
      <ResizablePanel defaultSize="44%" minSize="180px">
        <section ref={columnLayout.containerRef} style={historyStyle} className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] border-b bg-card" aria-label="Commit list">
          <div className="history-scope-toolbar">
            {showHistoryScope ? (
              <>
              <span className="history-scope-label">Show</span>
              <div className="history-scope-control" role="group" aria-label="Commit history scope">
                {(["current", "all"] as const).map((scope) => (
                  <Button
                    key={scope}
                    type="button"
                    size="xs"
                    variant={historyScope === scope ? "secondary" : "ghost"}
                    aria-pressed={historyScope === scope}
                    onClick={() => onHistoryScopeChange(scope)}
                  >
                    {scope === "current" ? "Current" : "All"}
                  </Button>
                ))}
              </div>
              </>
            ) : null}
            <ColumnVisibilityMenu columns={historyColumns} controller={columnLayout} />
          </div>
          <div className="history-list-shell">
            <AdjustableColumnHeader columns={historyColumns} controller={columnLayout} className="history-table-header" />
            {insightsError ? (
              <div className="history-insights-error" role="status">
                <span>GitHub annotations unavailable.</span>
                <Button type="button" variant="ghost" size="sm" onClick={onRetryInsights}>Retry</Button>
              </div>
            ) : insightsLoading ? <span className="sr-only" role="status">Loading GitHub annotations</span> : null}
            {history.length === 0 ? (
              <div className="history-list" role="listbox" aria-label="Commit history">
                {historyLoading ? (
                  <LoadingState label="Loading commit history" className="h-full" />
                ) : historyError ? (
                  <p className="empty-state bad selectable-text">{historyError}</p>
                ) : summary?.isValid ? (
                  <p className="empty-state">No commits in this repository.</p>
                ) : null}
              </div>
            ) : (
              <>
                {historyLoading ? <span className="sr-only" role="status">Refreshing commit history</span> : null}
                {historyError ? (
                  <div className="history-refresh-error selectable-text" role="status">
                    Commit history refresh failed: {historyError}
                  </div>
                ) : null}
                <FixedSizeVirtualList
                  items={history}
                  itemKey={(commit) => commit.hash}
                  rowHeight={COMMIT_GRAPH_ROW_HEIGHT}
                  overscan={6}
                  ariaLabel="Commit history"
                  selectedKey={selectedCommitHash}
                  className="history-list"
                  multiSelectable={false}
                  renderOverlay={(range) => (
                    <CommitGraphSvg
                      layout={graphLayout}
                      selectedCommitHash={selectedCommitHash}
                      visibleStartRow={range.start}
                      visibleEndRow={range.end}
                    />
                  )}
                  renderItem={(commit, _index, virtualRowProps) => (
                    <HistoryRow
                      commit={commit}
                      selected={commit.hash === selectedCommitHash}
                      tagsEnabled={summary?.capabilities.tags ?? true}
                      containedInCurrentBranch={historyScope === "current"}
                      allowCherryPickingContainedCommits={allowCherryPickingContainedCommits}
                      isHead={commit.hash === currentHeadHash}
                      amendDisabled={disabled}
                      amendDisabledReason={amendDisabledReason}
                      {...(associations.get(commit.hash) ? { association: associations.get(commit.hash)! } : {})}
                      onOpenExternalUrl={onOpenExternalUrl}
                      onSelectCommit={onSelectCommit}
                      onCommitContextAction={onCommitContextAction}
                      columnOrder={columnLayout.visibleOrder}
                      virtualRowProps={virtualRowProps}
                    />
                  )}
                />
              </>
            )}
          </div>
        </section>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel minSize="260px">
        <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
          <ResizablePanel defaultSize="42%" minSize="300px" className="min-w-[300px]">
            <CommitDetailsPanel
              details={commitDetails}
              loading={commitDetailsLoading}
              error={commitDetailsError}
              repository={summary?.githubRepository ?? null}
              onOpenExternalUrl={onOpenExternalUrl}
              selectedFilePath={selectedCommitFilePath}
              disabled={disabled}
              fileHistoryEnabled={Boolean(summary?.capabilities.fileHistory)}
              blameEnabled={Boolean(summary?.capabilities.blame)}
              onSelectCommit={onSelectCommit}
              onSelectCommitFile={onSelectCommitFile}
              onCommitFileContextAction={onCommitFileContextAction}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize="240px">
            <DiffPanel
              title={selectedCommitFilePath ?? "Select a file"}
              eyebrow="Commit diff"
              diff={commitFileDiff}
              filePath={selectedCommitFilePath ?? ""}
              loading={commitFileDiffLoading}
              emptyMessage={commitFileDiffError || "Select a file to view the diff"}
              onDownloadImage={onDownloadImage}
              imageDownloadLoading={disabled}
              repoPath={summary?.repoPath ?? ""}
              previewSource={selectedCommitHash && selectedCommitFile && selectedCommitFile.status !== "D" && isMarkdownPath(selectedCommitFile.path)
                ? { kind: "commit", hash: selectedCommitHash }
                : undefined}
              wrapLines={wrapLines}
              onWrapLinesChange={onWrapLinesChange}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function WorkflowRunsView({
  active,
  summary,
  workflowRuns,
  loading,
  busy,
  loaded,
  error,
  failure,
  nextPage,
  loadingMore,
  totalCount,
  query,
  search,
  preset,
  onQueryChange,
  onSearchChange,
  onPresetChange,
  onLoadMore,
  onOpenExternalUrl,
  onRefresh,
  onConnectGitHub,
  onReviewAccess,
  onCheckRemote
}: {
  active: boolean;
  summary: RepoSummary | null;
  workflowRuns: GitHubWorkflowRun[];
  loading: boolean;
  busy: boolean;
  loaded: boolean;
  error: string;
  failure: GitHubFailure | null;
  nextPage: number | null;
  loadingMore: boolean;
  totalCount: number | null;
  query: GitHubWorkflowRunQuery;
  search: string;
  preset: string;
  onQueryChange: (query: GitHubWorkflowRunQuery) => void;
  onSearchChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  onLoadMore: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onConnectGitHub: () => void;
  onReviewAccess: () => void;
  onCheckRemote: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const [selectedRun, setSelectedRun] = useState<GitHubWorkflowRun | null>(null);
  const selectedRunRef = useRef<HTMLButtonElement | null>(null);
  const displayedRuns = useMemo(() => sortLoadedWorkflowRuns(filterLoadedWorkflowRuns(workflowRuns, search), query.sortDirection), [workflowRuns, search, query.sortDirection]);
  const filtered = Boolean(search || query.branch || query.event || query.status);
  const countLabel = loaded ? (search ? `${displayedRuns.length} matches in ${workflowRuns.length} loaded runs` : formatLoadedCount(workflowRuns.length, totalCount, "run", "runs")) : "-";
  const activeFilterCount = [query.branch, query.event, query.status].filter(Boolean).length;
  const applyPreset = (value: string): void => {
    onPresetChange(value);
    if (value === "custom") return;
    if (value === "branch") onQueryChange({ ...DEFAULT_WORKFLOW_QUERY, branch: summary?.branch ?? undefined });
    else if (value === "failed") onQueryChange({ ...DEFAULT_WORKFLOW_QUERY, status: "failure" });
    else if (value === "progress") onQueryChange({ ...DEFAULT_WORKFLOW_QUERY, status: "in_progress" });
    else onQueryChange({ ...DEFAULT_WORKFLOW_QUERY });
  };
  useEffect(() => {
    setSelectedRun(null);
    selectedRunRef.current = null;
  }, [summary?.repoPath]);
  useEffect(() => {
    setSelectedRun((current) => current ? workflowRuns.find((run) => run.id === current.id) ?? current : null);
  }, [workflowRuns]);
  const closeDetail = (): void => {
    setSelectedRun(null);
    requestAnimationFrame(() => selectedRunRef.current?.focus());
  };

  return (
    <GitHubDetailWorkspace persistent listDefaultSize="38%" open={selectedRun !== null} emptyDrawer={<WorkflowRunEmptyDetails />} drawer={selectedRun && repository ? (
      <WorkflowRunConsole
        active={active}
        repoPath={summary?.repoPath ?? ""}
        githubFullName={repository.fullName}
        run={selectedRun}
        onClose={closeDetail}
        onOpenExternalUrl={onOpenExternalUrl}
        onRunChanged={onRefresh}
      />
    ) : null}>
      <section className="github-view workflow-runs-grid" aria-label="Workflow runs">
        <GitHubSelectorHeader repositoryName={repository?.fullName ?? "-"} countLabel={countLabel} />
        <GitHubQueryToolbar compact activeFilterCount={activeFilterCount} refreshDisabled={!repository} refreshing={loading || busy} onRefresh={onRefresh} view="workflows" search={search} preset={preset} presets={[{ value: "all", label: "All runs" }, { value: "branch", label: "Current branch", disabled: !summary?.branch }, { value: "failed", label: "Failed" }, { value: "progress", label: "In progress" }, { value: "custom", label: "Custom" }]} sort={query.sortDirection} sortOptions={[{ value: "desc", label: "Newest" }, { value: "asc", label: "Oldest loaded" }]} viewerAvailable status={loading || busy ? "Loading workflow runs" : countLabel} onSearchChange={(value) => { onPresetChange("custom"); onSearchChange(value); }} onPresetChange={applyPreset} onSortChange={(value) => { onPresetChange("custom"); onQueryChange({ ...query, sortDirection: value as "asc" | "desc" }); }} onClear={() => { onSearchChange(""); applyPreset("all"); }}>
          <label className="github-query-field"><span>Event</span><input value={query.event ?? ""} placeholder="push" onChange={(event) => { onPresetChange("custom"); onQueryChange({ ...query, event: event.target.value || undefined }); }} /></label>
          <label className="github-query-field"><span>Status</span><select value={query.status ?? ""} onChange={(event) => { onPresetChange("custom"); onQueryChange({ ...query, status: (event.target.value || undefined) as GitHubWorkflowRunQuery["status"] }); }}><option value="">Any</option><option value="queued">Queued</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="success">Success</option><option value="failure">Failure</option><option value="cancelled">Cancelled</option></select></label>
        </GitHubQueryToolbar>
        <div className="github-list" role="list" aria-label="Workflow runs">
          {!repository ? (
            <GitHubListEmptyState icon={<GitFork />} title="No GitHub repository" description="Select a repository with a supported GitHub origin." />
          ) : loading ? (
            <LoadingState label="Loading workflow runs" className="h-full" />
          ) : error && workflowRuns.length === 0 ? (
            <GitHubFailureState failure={failure} fallback={error} stale={false} onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} />
          ) : displayedRuns.length === 0 ? (
            filtered
              ? <GitHubListEmptyState icon={<SearchX />} title="No matching workflow runs" description="Try changing or clearing your search and filters." actionLabel="Clear filters" onAction={() => { onSearchChange(""); applyPreset("all"); }} />
              : <GitHubListEmptyState icon={<Workflow />} title="No workflow runs" description="Workflow runs for this repository will appear here." />
          ) : (
            displayedRuns.map((run) => (
              <WorkflowRunRow key={run.id} run={run} selected={selectedRun?.id === run.id} onSelect={(item, button) => {
                selectedRunRef.current = button;
                setSelectedRun(item);
              }} />
            ))
          )}
          {error && workflowRuns.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
          <GitHubListFooter label="workflow runs" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
        </div>
      </section>
    </GitHubDetailWorkspace>
  );
}

function WorkflowRunRow({
  run,
  selected,
  onSelect
}: {
  run: GitHubWorkflowRun;
  selected: boolean;
  onSelect: (run: GitHubWorkflowRun, button: HTMLButtonElement) => void;
}): ReactNode {
  const statusText = formatWorkflowRunStatus(run);
  const title = run.displayTitle || run.commitMessage || run.name;

  return (
    <div
      className={`github-row workflow-run-row ${selected ? "is-selected" : ""}`}
      role="listitem"
      aria-current={selected ? "true" : undefined}
    >
      <button type="button" className="workflow-run-row-select" aria-label={`${run.name}: ${title}`} aria-pressed={selected} onClick={(event) => onSelect(run, event.currentTarget)}>
        <span className={`workflow-run-row-state ${getWorkflowRunStatusClass(run)}`}>
          <span className="github-status-dot" aria-hidden="true" />
          <span>{statusText}</span>
        </span>
        <span className="workflow-run-row-content">
          <span className="workflow-run-row-heading">
            <TooltipTarget content={run.name}><strong>{run.name}</strong></TooltipTarget>
            <span>{run.runNumber === null ? "Run" : `#${run.runNumber}`}</span>
          </span>
          <TooltipTarget content={title}><span className="github-primary-text workflow-run-row-title">{title}</span></TooltipTarget>
          <span className="workflow-run-row-meta github-secondary-text">
            <TooltipTarget content={run.actor.login}><span className="truncate">{run.actor.login}</span></TooltipTarget>
            <span aria-hidden="true">·</span>
            <TooltipTarget content={run.branch}><span className="truncate">{run.branch}</span></TooltipTarget>
          </span>
          <span className="workflow-run-row-details github-secondary-text">
            <span>{formatWorkflowEvent(run.event)}</span>
            <span aria-hidden="true">·</span>
            <TooltipTarget content={formatDate(run.updatedAt)}><span>updated {formatRelativeDate(run.updatedAt)}</span></TooltipTarget>
            <span aria-hidden="true">·</span>
            <span>{formatRunDuration(run.startedAt, run.updatedAt)}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

function WorkflowRunEmptyDetails(): ReactNode {
  return <section className="review-console-empty" aria-labelledby="workflow-run-empty-heading">
    <Workflow aria-hidden="true" />
    <h2 id="workflow-run-empty-heading">Select a workflow run</h2>
    <p>Choose a run to inspect jobs, steps, timing, logs, and available run actions.</p>
  </section>;
}

function GitHubDetailWorkspace({ open, drawer, emptyDrawer, persistent = false, listDefaultSize = "40%", children }: { open: boolean; drawer: ReactNode; emptyDrawer?: ReactNode; persistent?: boolean; listDefaultSize?: string; children: ReactNode }): ReactNode {
  const showDrawer = open || persistent;
  return (
    <ResizablePanelGroup orientation="horizontal" className="review-console-workspace">
      <ResizablePanel defaultSize={showDrawer ? listDefaultSize : "100%"} minSize="280px" className="review-console-list-panel">
        {children}
      </ResizablePanel>
      {showDrawer ? (
        <>
          <ResizableHandle withHandle className="review-console-resize-handle" aria-label="Resize review console" />
          <ResizablePanel defaultSize={listDefaultSize === "38%" ? "62%" : "60%"} minSize="420px" className="review-console-drawer-panel">
            {open ? drawer : emptyDrawer}
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}

function PullRequestsView({
  active,
  summary,
  pullRequests,
  openCount,
  loading,
  busy,
  loaded,
  error,
  failure,
  nextPage,
  loadingMore,
  totalCount,
  query,
  preset,
  viewerLogin,
  onQueryChange,
  onPresetChange,
  onLoadMore,
  onOpenExternalUrl,
  onCheckout,
  onRefresh,
  onMerged,
  onConnectGitHub,
  onReviewAccess,
  onCheckRemote
}: {
  active: boolean;
  summary: RepoSummary | null;
  pullRequests: GitHubPullRequest[];
  openCount: number | null;
  loading: boolean;
  busy: boolean;
  loaded: boolean;
  error: string;
  failure: GitHubFailure | null;
  nextPage: number | null;
  loadingMore: boolean;
  totalCount: number | null;
  query: GitHubPullRequestQuery;
  preset: string;
  viewerLogin: string | null;
  onQueryChange: (query: GitHubPullRequestQuery) => void;
  onPresetChange: (value: string) => void;
  onLoadMore: () => void;
  onOpenExternalUrl: (url: string) => void;
  onCheckout: (pullRequest: GitHubPullRequest) => void;
  onRefresh: () => void;
  onMerged: () => void;
  onConnectGitHub: () => void;
  onReviewAccess: () => void;
  onCheckRemote: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const [selectedPullRequest, setSelectedPullRequest] = useState<GitHubPullRequest | null>(null);
  const selectedTitleRef = useRef<HTMLButtonElement | null>(null);
  const filtered = Object.keys(query).some((key) => !["sort", "direction"].includes(key)) || query.sort !== "updated" || query.direction !== "desc";
  const countLabel = loaded ? (filtered && totalCount !== null ? `${totalCount} matching` : formatLoadedCount(pullRequests.length, openCount, "open pull request", "open pull requests")) : "-";
  const activeFilterCount = Object.entries(query).filter(([key, value]) => !["search", "sort", "direction"].includes(key) && value !== undefined && value !== "").length;
  const applyPreset = (value: string): void => {
    onPresetChange(value);
    if (value === "custom") return;
    if (value === "branch") onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY, sourceBranch: summary?.branch ?? undefined });
    else if (value === "authored" && viewerLogin) onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY, author: viewerLogin });
    else if (value === "assigned" && viewerLogin) onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY, assignee: viewerLogin });
    else if (value === "review" && viewerLogin) onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY, reviewRequested: viewerLogin });
    else if (value === "drafts") onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY, draft: "draft" });
    else onQueryChange({ ...DEFAULT_PULL_REQUEST_QUERY });
  };
  useEffect(() => {
    setSelectedPullRequest(null);
    selectedTitleRef.current = null;
  }, [summary?.repoPath]);
  const closeDetail = (): void => {
    setSelectedPullRequest(null);
    requestAnimationFrame(() => selectedTitleRef.current?.focus());
  };

  return (
    <GitHubDetailWorkspace persistent listDefaultSize="38%" open={selectedPullRequest !== null} emptyDrawer={<PullRequestEmptyDetails />} drawer={selectedPullRequest && repository ? (
      <Suspense fallback={<LoadingState label="Loading review console" className="h-full" />}>
        <ReviewConsole
          active={active}
          repoPath={summary?.repoPath ?? ""}
          githubFullName={repository.fullName}
          selection={{ itemType: "pullRequest", item: selectedPullRequest }}
          onClose={closeDetail}
          onCheckout={onCheckout}
          onOpenExternalUrl={onOpenExternalUrl}
          onMerged={onMerged}
        />
      </Suspense>
    ) : null}>
    <section className="github-view pull-requests-grid" aria-label="Pull requests">
      <GitHubSelectorHeader repositoryName={repository?.fullName ?? "-"} countLabel={countLabel} />
      <GitHubQueryToolbar compact activeFilterCount={activeFilterCount} refreshDisabled={!repository} refreshing={loading || busy} onRefresh={onRefresh} view="pullRequests" search={query.search ?? ""} preset={preset} presets={[{ value: "all", label: "All open" }, { value: "branch", label: "Current Branch", disabled: !summary?.branch }, { value: "authored", label: "Authored by me", disabled: !viewerLogin }, { value: "assigned", label: "Assigned to me", disabled: !viewerLogin }, { value: "review", label: "Review requested", disabled: !viewerLogin }, { value: "drafts", label: "Drafts" }, { value: "custom", label: "Custom" }]} sort={`${query.sort}-${query.direction}`} sortOptions={[{ value: "updated-desc", label: "Recently updated" }, { value: "created-desc", label: "Newest" }, { value: "created-asc", label: "Oldest" }]} viewerAvailable={Boolean(viewerLogin)} status={loading || busy ? "Loading pull requests" : countLabel} onSearchChange={(value) => { onPresetChange("custom"); onQueryChange({ ...query, search: value || undefined }); }} onPresetChange={applyPreset} onSortChange={(value) => { const [sort, direction] = value.split("-") as ["updated" | "created", "asc" | "desc"]; onQueryChange({ ...query, sort, direction }); }} onClear={() => applyPreset("all")}>
        <label className="github-query-field"><span>Label</span><input value={query.label ?? ""} onChange={(event) => { onPresetChange("custom"); onQueryChange({ ...query, label: event.target.value || undefined }); }} /></label>
        <label className="github-query-field"><span>Draft</span><select value={query.draft ?? ""} onChange={(event) => { onPresetChange("custom"); onQueryChange({ ...query, draft: (event.target.value || undefined) as GitHubPullRequestQuery["draft"] }); }}><option value="">Any</option><option value="draft">Draft</option><option value="ready">Ready</option></select></label>
      </GitHubQueryToolbar>
      <div className="github-list" role="list" aria-label="Pull requests">
        {!repository ? (
          <GitHubListEmptyState icon={<GitFork />} title="No GitHub repository" description="Select a repository with a supported GitHub origin." />
        ) : loading ? (
          <LoadingState label="Loading pull requests" className="h-full" />
        ) : error && pullRequests.length === 0 ? (
          <GitHubFailureState failure={failure} fallback={error} stale={false} onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} />
        ) : pullRequests.length === 0 ? (
          filtered
            ? <GitHubListEmptyState icon={<SearchX />} title="No matching pull requests" description="Try changing or clearing your filters." actionLabel="Clear filters" onAction={() => applyPreset("all")} />
            : <GitHubListEmptyState icon={<GitPullRequest />} title="No open pull requests" description="Open pull requests for this repository will appear here." />
        ) : (
          pullRequests.map((pullRequest) => (
            <PullRequestRow
              key={pullRequest.number}
              pullRequest={pullRequest}
              selected={selectedPullRequest?.number === pullRequest.number}
              onSelect={(item, button) => {
                selectedTitleRef.current = button;
                setSelectedPullRequest(item);
              }}
            />
          ))
        )}
        {error && pullRequests.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
        <GitHubListFooter label="pull requests" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
      </div>
    </section>
    </GitHubDetailWorkspace>
  );
}

function PullRequestRow({
  pullRequest,
  selected,
  onSelect
}: {
  pullRequest: GitHubPullRequest;
  selected: boolean;
  onSelect: (pullRequest: GitHubPullRequest, button: HTMLButtonElement) => void;
}): ReactNode {
  return <GitHubItemRow
    itemType="pullRequest"
    number={pullRequest.number}
    title={pullRequest.title}
    state={pullRequest.state}
    {...(pullRequest.draft ? { qualifier: "Draft" } : {})}
    authorLogin={pullRequest.authorLogin}
    updatedAt={pullRequest.updatedAt}
    labels={pullRequest.labels}
    comments={pullRequest.comments}
    selected={selected}
    onSelect={(button) => onSelect(pullRequest, button)}
  />;
}

function PullRequestEmptyDetails(): ReactNode {
  return <GitHubSelectionEmptyDetails itemType="pullRequest" />;
}

function IssuesView({
  active,
  summary,
  issues,
  openCount,
  loading,
  busy,
  loaded,
  error,
  failure,
  nextPage,
  loadingMore,
  totalCount,
  query,
  preset,
  viewerLogin,
  onQueryChange,
  onPresetChange,
  onLoadMore,
  onOpenExternalUrl,
  onRefresh,
  onConnectGitHub,
  onReviewAccess,
  onCheckRemote
}: {
  active: boolean;
  summary: RepoSummary | null;
  issues: GitHubIssue[];
  openCount: number | null;
  loading: boolean;
  busy: boolean;
  loaded: boolean;
  error: string;
  failure: GitHubFailure | null;
  nextPage: number | null;
  loadingMore: boolean;
  totalCount: number | null;
  query: GitHubIssueQuery;
  preset: string;
  viewerLogin: string | null;
  onQueryChange: (query: GitHubIssueQuery) => void;
  onPresetChange: (value: string) => void;
  onLoadMore: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onConnectGitHub: () => void;
  onReviewAccess: () => void;
  onCheckRemote: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [createIssueDialog, setCreateIssueDialog] = useState<CreateIssueDialogState>(EMPTY_CREATE_ISSUE_DIALOG);
  const selectedTitleRef = useRef<HTMLButtonElement | null>(null);
  const createIssueOperationRef = useRef<string | null>(null);
  const createIssueGenerationRef = useRef(0);
  const abandonCreateIssueMutation = useCallback((): void => {
    createIssueGenerationRef.current += 1;
    const operationId = createIssueOperationRef.current;
    createIssueOperationRef.current = null;
    if (operationId) void window.githead.cancelGitOperation({ operationId });
  }, []);
  const filtered = Object.keys(query).some((key) => !["sort", "direction"].includes(key)) || query.sort !== "updated" || query.direction !== "desc";
  const countLabel = loaded ? (filtered && totalCount !== null ? `${totalCount} matching` : formatLoadedCount(issues.length, openCount, "open issue", "open issues")) : "-";
  const activeFilterCount = Object.entries(query).filter(([key, value]) => !["search", "sort", "direction"].includes(key) && value !== undefined && value !== "").length;
  const applyPreset = (value: string): void => {
    onPresetChange(value);
    if (value === "authored" && viewerLogin) onQueryChange({ ...DEFAULT_ISSUE_QUERY, author: viewerLogin });
    else if (value === "assigned" && viewerLogin) onQueryChange({ ...DEFAULT_ISSUE_QUERY, assignee: viewerLogin });
    else if (value === "unassigned") onQueryChange({ ...DEFAULT_ISSUE_QUERY, unassigned: true });
    else onQueryChange({ ...DEFAULT_ISSUE_QUERY });
  };
  useEffect(() => {
    setSelectedIssue(null);
    selectedTitleRef.current = null;
    setCreateIssueDialog(EMPTY_CREATE_ISSUE_DIALOG);
    return abandonCreateIssueMutation;
  }, [abandonCreateIssueMutation, summary?.repoPath]);
  const closeDetail = (): void => {
    setSelectedIssue(null);
    requestAnimationFrame(() => selectedTitleRef.current?.focus());
  };
  const closeCreateIssueDialog = (): void => {
    abandonCreateIssueMutation();
    setCreateIssueDialog(EMPTY_CREATE_ISSUE_DIALOG);
  };
  const submitCreateIssue = async (draft: CreateIssueDraft): Promise<void> => {
    if (!repository || !summary?.repoPath || createIssueDialog.busy || (createIssueDialog.outcomeUnknown && !createIssueDialog.unknownOutcomeReviewed)) return;

    const repoPath = summary.repoPath;
    const operationId = createIssueOperationId();
    const generation = createIssueGenerationRef.current + 1;
    createIssueGenerationRef.current = generation;
    createIssueOperationRef.current = operationId;
    setCreateIssueDialog((current) => ({ ...current, busy: true, error: "", outcomeUnknown: false, unknownOutcomeReviewed: true }));

    try {
      const result = await window.githead.createGitHubIssue({
        repoPath,
        title: draft.title,
        body: draft.body,
        ...(draft.labels.length ? { labels: draft.labels } : {}),
        ...(draft.assignees.length ? { assignees: draft.assignees } : {}),
        operationId
      });
      if (createIssueOperationRef.current !== operationId || createIssueGenerationRef.current !== generation) return;
      createIssueOperationRef.current = null;
      if (!result.ok) {
        const outcomeUnknown = result.error.outcomeUnknown;
        setCreateIssueDialog((current) => ({
          ...current,
          busy: false,
          error: outcomeUnknown
            ? `${result.error.message} Check GitHub before retrying; the issue may have been created.`
            : result.error.message,
          outcomeUnknown,
          unknownOutcomeReviewed: !outcomeUnknown
        }));
        return;
      }
      setCreateIssueDialog(EMPTY_CREATE_ISSUE_DIALOG);
      onRefresh();
    } catch (error) {
      if (createIssueOperationRef.current !== operationId || createIssueGenerationRef.current !== generation) return;
      createIssueOperationRef.current = null;
      const message = error instanceof Error ? error.message : "Unable to create the issue.";
      setCreateIssueDialog((current) => ({
        ...current,
        busy: false,
        error: `${message} Check GitHub before retrying; the issue may have been created.`,
        outcomeUnknown: true,
        unknownOutcomeReviewed: false
      }));
    }
  };

  return (
    <>
    <GitHubDetailWorkspace persistent listDefaultSize="38%" open={selectedIssue !== null} emptyDrawer={<IssueEmptyDetails />} drawer={selectedIssue && repository ? (
      <Suspense fallback={<LoadingState label="Loading review console" className="h-full" />}>
        <ReviewConsole
          active={active}
          repoPath={summary?.repoPath ?? ""}
          githubFullName={repository.fullName}
          selection={{ itemType: "issue", item: selectedIssue }}
          onClose={closeDetail}
          onCheckout={() => undefined}
          onOpenExternalUrl={onOpenExternalUrl}
          onMerged={() => undefined}
        />
      </Suspense>
    ) : null}>
    <section className="github-view issues-grid" aria-label="Issues">
      <GitHubSelectorHeader repositoryName={repository?.fullName ?? "-"} countLabel={countLabel} actions={
        <Button type="button" size="sm" disabled={!repository} onClick={() => setCreateIssueDialog({ ...EMPTY_CREATE_ISSUE_DIALOG, open: true })}>
          <Plus />New issue
        </Button>
      } />
      <GitHubQueryToolbar compact activeFilterCount={activeFilterCount} refreshDisabled={!repository} refreshing={loading || busy} onRefresh={onRefresh} view="issues" search={query.search ?? ""} preset={preset} presets={[{ value: "all", label: "All open" }, { value: "authored", label: "Authored by me", disabled: !viewerLogin }, { value: "assigned", label: "Assigned to me", disabled: !viewerLogin }, { value: "unassigned", label: "Unassigned" }, { value: "custom", label: "Custom" }]} sort={`${query.sort}-${query.direction}`} sortOptions={[{ value: "updated-desc", label: "Recently updated" }, { value: "created-desc", label: "Newest" }, { value: "created-asc", label: "Oldest" }]} viewerAvailable={Boolean(viewerLogin)} status={loading || busy ? "Loading issues" : countLabel} onSearchChange={(value) => { onPresetChange("custom"); onQueryChange({ ...query, search: value || undefined }); }} onPresetChange={applyPreset} onSortChange={(value) => { const [sort, direction] = value.split("-") as ["updated" | "created", "asc" | "desc"]; onPresetChange("custom"); onQueryChange({ ...query, sort, direction }); }} onClear={() => applyPreset("all")}>
        <label className="github-query-field"><span>Label</span><input value={query.label ?? ""} onChange={(event) => { onPresetChange("custom"); onQueryChange({ ...query, label: event.target.value || undefined }); }} /></label>
      </GitHubQueryToolbar>
      <div className="github-list" role="list" aria-label="Issues">
        {!repository ? (
          <GitHubListEmptyState icon={<GitFork />} title="No GitHub repository" description="Select a repository with a supported GitHub origin." />
        ) : loading ? (
          <LoadingState label="Loading issues" className="h-full" />
        ) : error && issues.length === 0 ? (
          <GitHubFailureState failure={failure} fallback={error} stale={false} onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} />
        ) : issues.length === 0 ? (
          filtered
            ? <GitHubListEmptyState icon={<SearchX />} title="No matching issues" description="Try changing or clearing your filters." actionLabel="Clear filters" onAction={() => applyPreset("all")} />
            : <GitHubListEmptyState icon={<CircleDot />} title="No open issues" description="Open issues for this repository will appear here." />
        ) : (
          issues.map((issue) => (
            <IssueRow
              key={issue.number}
              issue={issue}
              selected={selectedIssue?.number === issue.number}
              onSelect={(item, button) => {
                selectedTitleRef.current = button;
                setSelectedIssue(item);
              }}
            />
          ))
        )}
        {error && issues.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
        <GitHubListFooter label="issues" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
      </div>
    </section>
    </GitHubDetailWorkspace>
    <CreateIssueDialog
      open={createIssueDialog.open}
      repoPath={summary?.repoPath ?? ""}
      repositoryName={repository?.fullName ?? ""}
      repositoryUrl={repository?.webUrl ?? ""}
      busy={createIssueDialog.busy}
      error={createIssueDialog.error}
      outcomeUnknown={createIssueDialog.outcomeUnknown}
      unknownOutcomeReviewed={createIssueDialog.unknownOutcomeReviewed}
      onOpenChange={(open) => { if (!open) closeCreateIssueDialog(); }}
      onOpenExternalUrl={onOpenExternalUrl}
      onClearError={() => setCreateIssueDialog((current) => ({ ...current, error: "" }))}
      onReviewUnknownOutcome={() => {
        if (repository) onOpenExternalUrl(`${repository.webUrl}/issues`);
        setCreateIssueDialog((current) => ({ ...current, unknownOutcomeReviewed: true }));
      }}
      onSubmit={(draft) => { void submitCreateIssue(draft); }}
    />
    </>
  );
}

interface CreateIssueDialogState {
  open: boolean;
  busy: boolean;
  error: string;
  outcomeUnknown: boolean;
  unknownOutcomeReviewed: boolean;
}

const EMPTY_CREATE_ISSUE_DIALOG: CreateIssueDialogState = {
  open: false,
  busy: false,
  error: "",
  outcomeUnknown: false,
  unknownOutcomeReviewed: true
};

function createIssueOperationId(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `issue-create-${suffix}`;
}

function IssueRow({
  issue,
  selected,
  onSelect
}: {
  issue: GitHubIssue;
  selected: boolean;
  onSelect: (issue: GitHubIssue, button: HTMLButtonElement) => void;
}): ReactNode {
  return <GitHubItemRow
    itemType="issue"
    number={issue.number}
    title={issue.title}
    state={issue.state}
    qualifier={capitalize(issue.state)}
    authorLogin={issue.authorLogin}
    updatedAt={issue.updatedAt}
    labels={issue.labels}
    comments={issue.comments}
    selected={selected}
    onSelect={(button) => onSelect(issue, button)}
  />;
}

function IssueEmptyDetails(): ReactNode {
  return <GitHubSelectionEmptyDetails itemType="issue" />;
}

function GitHubSelectorHeader({ repositoryName, countLabel, actions }: { repositoryName: string; countLabel: string; actions?: ReactNode }): ReactNode {
  return <div className="github-view-header github-selector-header">
    <div className="min-w-0">
      <p className="eyebrow">GitHub</p>
      <TooltipTarget content={repositoryName}><h2 className="truncate text-sm font-semibold">{repositoryName}</h2></TooltipTarget>
      <p className="github-secondary-text">{countLabel}</p>
    </div>
    {actions ? <div className="github-view-actions">{actions}</div> : null}
  </div>;
}

function GitHubSelectionEmptyDetails({ itemType }: { itemType: "pullRequest" | "issue" }): ReactNode {
  const pullRequest = itemType === "pullRequest";
  const headingId = `github-${itemType}-empty-heading`;
  return <section className="review-console-empty" aria-labelledby={headingId}>
    {pullRequest ? <GitPullRequest aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
    <h2 id={headingId}>Select {pullRequest ? "a pull request" : "an issue"}</h2>
    <p>{pullRequest
      ? "Choose a pull request to view details, checks, files, and review activity."
      : "Choose an issue to view its description, activity, and project details."}</p>
  </section>;
}

function GitHubItemRow({ itemType, number, title, state, qualifier, authorLogin, updatedAt, labels, comments, selected, onSelect }: {
  itemType: "pullRequest" | "issue";
  number: number;
  title: string;
  state: string;
  qualifier?: string;
  authorLogin: string;
  updatedAt: string;
  labels: string[];
  comments: number;
  selected: boolean;
  onSelect: (button: HTMLButtonElement) => void;
}): ReactNode {
  const pullRequest = itemType === "pullRequest";
  return <div
    className={`github-row github-item-row ${pullRequest ? "pull-request-row" : "issue-row"} ${selected ? "is-selected" : ""}`}
    role="listitem"
    aria-current={selected ? "true" : undefined}
  >
    <button
      type="button"
      className="github-item-row-select"
      aria-label={title}
      aria-pressed={selected}
      title={`${capitalize(state)} ${pullRequest ? "pull request" : "issue"} #${number}`}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      <span className={`github-item-row-state is-${itemType}`} aria-hidden="true">
        {pullRequest ? <><GitPullRequest /><CircleDot className="github-item-open-state" /></> : <CircleDot />}
        <span className="github-issue-number">#{number}</span>
        {qualifier ? <span className="github-item-qualifier">{qualifier}</span> : null}
      </span>
      <span className="github-item-row-content">
        <TooltipTarget content={title}><span className="github-primary-text github-item-row-title">{title}</span></TooltipTarget>
        <span className="github-item-row-meta github-secondary-text">
          <TooltipTarget content={authorLogin}><span className="truncate">{authorLogin}</span></TooltipTarget>
          <span aria-hidden="true">·</span>
          <TooltipTarget content={formatDate(updatedAt)}><span className="truncate">updated {formatRelativeDate(updatedAt)}</span></TooltipTarget>
        </span>
        <span className="github-item-row-details">
          <span className="github-item-comment-count github-secondary-text" aria-label={`${comments} ${comments === 1 ? "comment" : "comments"}`}><MessageSquare />{comments}</span>
          <GitHubLabels labels={labels} max={2} />
        </span>
      </span>
    </button>
  </div>;
}

function GitHubLabels({ labels, max = 3 }: { labels: string[]; max?: number }): ReactNode {
  return (
    <TooltipTarget content={labels.join(", ")}>
      <span className="github-labels">
        {labels.length === 0 ? (
          <span className="github-secondary-text">-</span>
        ) : (
          labels.slice(0, max).map((label) => (
            <span key={label} className="github-label-chip">{label}</span>
          ))
        )}
      </span>
    </TooltipTarget>
  );
}

function formatLoadedCount(loaded: number, total: number | null, singular: string, plural: string): string {
  const noun = loaded === 1 ? singular : plural;
  return total === null ? `${loaded} ${noun} loaded` : `${loaded} of ${Math.max(total, loaded)} ${plural} loaded`;
}

function GitHubFailureState({
  failure,
  fallback,
  stale,
  onRetry,
  onConnect,
  onReviewAccess,
  onCheckRemote
}: {
  failure: GitHubFailure | null;
  fallback: string;
  stale: boolean;
  onRetry: () => void;
  onConnect: () => void;
  onReviewAccess: () => void;
  onCheckRemote: () => void;
}): ReactNode {
  const kind = failure?.kind ?? "unexpected";
  const retryAt = failure?.retryAfterAt ?? failure?.rateLimit?.resetAt ?? null;
  return <div className={`grid gap-2 border-destructive/30 bg-destructive/5 p-4 text-sm ${stale ? "border-y" : "m-4 rounded-md border"}`} role="alert">
    <div>
      <p className="font-medium">{getGitHubFailureTitle(kind)}</p>
      <p className="selectable-text text-muted-foreground">{fallback}</p>
      {failure?.missingPermission ? <p className="mt-1 font-medium">Missing permission: {failure.missingPermission}</p> : null}
      {stale ? <p className="mt-1 text-muted-foreground">Showing cached results while Githead recovers.</p> : null}
      {retryAt ? <p className="mt-1 text-muted-foreground">Try again {formatDateTime(retryAt)}.</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {kind === "authentication" ? <Button type="button" size="sm" onClick={onConnect}>Connect GitHub</Button> : null}
      {kind === "authorization" ? <Button type="button" size="sm" onClick={onReviewAccess}>Review access</Button> : null}
      {kind === "notFound" ? <Button type="button" size="sm" variant="outline" onClick={onCheckRemote}>Check remote</Button> : null}
      {failure?.retryable || kind === "offline" || kind === "transient" || kind === "timeout" || kind === "rateLimited" || !failure ? <Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw />Retry</Button> : null}
    </div>
  </div>;
}

function getGitHubFailureTitle(kind: GitHubFailure["kind"]): string {
  if (kind === "authentication") return "GitHub authentication is required";
  if (kind === "authorization") return "GitHub repository access is not granted";
  if (kind === "rateLimited") return "GitHub rate limit reached";
  if (kind === "offline") return "GitHub is unavailable while offline";
  if (kind === "transient" || kind === "timeout") return "GitHub is temporarily unavailable";
  if (kind === "notFound") return "GitHub repository was not found";
  return "Unable to load GitHub data";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function GitHubListEmptyState({ icon, title, description, actionLabel, onAction }: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactNode {
  const headingId = useId();
  return <section className="github-list-empty" aria-labelledby={headingId}>
    <span className="github-list-empty-icon" aria-hidden="true">{icon}</span>
    <h3 id={headingId}>{title}</h3>
    <p>{description}</p>
    {actionLabel && onAction ? <Button type="button" variant="outline" size="sm" onClick={onAction}>{actionLabel}</Button> : null}
  </section>;
}

function GitHubListFooter({ label, nextPage, loading, error, disabled, onLoadMore }: {
  label: string;
  nextPage: number | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  onLoadMore: () => void;
}): ReactNode {
  if (nextPage === null && !loading && !error) return null;
  return (
    <div className="github-list-footer" role="status" aria-live="polite" aria-busy={loading}>
      {error ? <span className="github-list-footer-error selectable-text">{error}</span> : null}
      {loading ? <LoadingState label={`Loading more ${label}`} className="min-h-0 p-0" /> : nextPage !== null ? (
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Load more ${label}`} onClick={onLoadMore}>
          {error ? "Retry" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

const CommitGraphSvg = memo(function CommitGraphSvg({
  layout,
  selectedCommitHash,
  visibleStartRow,
  visibleEndRow
}: {
  layout: CommitGraphLayout;
  selectedCommitHash: string | null;
  visibleStartRow: number;
  visibleEndRow: number;
}): ReactNode {
  if (layout.nodes.length === 0) {
    return null;
  }

  return (
    <svg
      className="commit-graph-svg"
      data-testid="commit-graph-svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
    >
      <g className="commit-graph-edges">
        {layout.edges.filter((edge) => edge.fromRow < visibleEndRow && edge.toRow >= visibleStartRow).map((edge) => (
          <path
            key={edge.id}
            className={`commit-graph-edge lane-${edge.colorLane % 6}`}
            d={edge.path}
          />
        ))}
      </g>
      <g className="commit-graph-nodes">
        {layout.nodes.filter((node) => node.row >= visibleStartRow && node.row < visibleEndRow).map((node) => (
          <circle
            key={node.hash}
            data-testid="commit-graph-node"
            className={`commit-graph-node lane-${node.lane % 6} ${node.hash === selectedCommitHash ? "is-selected" : ""}`}
            cx={node.x}
            cy={node.y}
            r="3.5"
          />
        ))}
      </g>
    </svg>
  );
});

interface HistoryRowProps {
  commit: GitCommitGraphRow;
  selected: boolean;
  tagsEnabled: boolean;
  containedInCurrentBranch: boolean;
  allowCherryPickingContainedCommits: boolean;
  isHead: boolean;
  amendDisabled: boolean;
  amendDisabledReason: string | null;
  association?: GitHubCommitAssociation;
  onOpenExternalUrl: (url: string) => void;
  onSelectCommit: (hash: string) => void;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
  columnOrder: readonly HistoryColumnId[];
  virtualRowProps: VirtualRowProps;
}

const HistoryRow = memo(function HistoryRow({
  commit,
  selected,
  tagsEnabled,
  containedInCurrentBranch,
  allowCherryPickingContainedCommits,
  isHead,
  amendDisabled,
  amendDisabledReason,
  association,
  onOpenExternalUrl,
  onSelectCommit,
  onCommitContextAction,
  columnOrder,
  virtualRowProps
}: HistoryRowProps): ReactNode {
  const cherryPickDisabled = containedInCurrentBranch && !allowCherryPickingContainedCommits;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={() => {
          if (!selected) {
            onSelectCommit(commit.hash);
          }
        }}
      >
        <div
          className={`history-row ${selected ? "is-selected" : ""}`}
          role="option"
          tabIndex={0}
          aria-selected={selected}
          data-commit-hash={commit.hash}
          data-virtual-index={virtualRowProps["aria-posinset"] - 1}
          {...virtualRowProps}
          onClick={() => onSelectCommit(commit.hash)}
          onKeyDown={(event) => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.dispatchEvent(new globalThis.MouseEvent("contextmenu", {
                bubbles: true,
                clientX: bounds.left + 24,
                clientY: bounds.top + 20,
                button: 2
              }));
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectCommit(commit.hash);
            }
          }}
        >
          <OrderedCells order={columnOrder} cells={{
            graph: <span className="history-graph-cell" aria-hidden="true" />,
            description: <TooltipTarget content={commit.subject || undefined}>
              <span className="history-description">
                {!columnOrder.includes("references") ? <HistoryReferences commit={commit} /> : null}
                <CommitSubject
                  subject={commit.subject}
                  className="history-subject"
                  scopeClassName="history-scope"
                  descriptionClassName="history-description-text"
                />
                {association && (!columnOrder.includes("pullRequest") || !columnOrder.includes("checks")) ? (
                  <span className="history-github-badges">
                    {!columnOrder.includes("pullRequest") ? <HistoryPullRequests association={association} onOpenExternalUrl={onOpenExternalUrl} /> : null}
                    {!columnOrder.includes("checks") ? <HistoryCheckState association={association} compact /> : null}
                  </span>
                ) : null}
              </span>
            </TooltipTarget>,
            date: <TooltipTarget content={formatDate(commit.authorDate)}>
              <span className="history-date">{commit.relativeDate || formatDate(commit.authorDate)}</span>
            </TooltipTarget>,
            author: <TooltipTarget content={commit.authorEmail}><span className="history-author">{commit.authorName}</span></TooltipTarget>,
            commit: <TooltipTarget content={commit.hash}><span className="history-hash">{commit.shortHash}</span></TooltipTarget>,
            references: <HistoryReferences commit={commit} showEmpty />,
            pullRequest: association ? <HistoryPullRequests association={association} onOpenExternalUrl={onOpenExternalUrl} showEmpty /> : <span className="github-secondary-text">-</span>,
            checks: association ? <HistoryCheckState association={association} /> : <span className="github-secondary-text">-</span>
          }} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {tagsEnabled ? (
          <ContextMenuItem onSelect={() => onCommitContextAction(commit, "tag")}>
            <Tag />
            Tag
          </ContextMenuItem>
        ) : null}
        <TooltipTarget
          content={cherryPickDisabled ? "This commit is already included in the current branch." : undefined}
          contentProps={{ side: "right", sideOffset: 8 }}
        >
          <ContextMenuItem
            disabled={cherryPickDisabled}
            className={cherryPickDisabled ? "data-[disabled]:pointer-events-auto" : undefined}
            onSelect={() => onCommitContextAction(commit, "cherry-pick")}
          >
            <GitFork />
            Cherry-pick commit…
          </ContextMenuItem>
        </TooltipTarget>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "reset")}>
          <GitBranchIcon />
          Reset current branch to this commit
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "revert")}>
          <RotateCcw />
          Reverse commit
        </ContextMenuItem>
        {isHead ? (
          <TooltipTarget
            content={amendDisabled ? amendDisabledReason ?? "Wait for the current Git operation to finish." : undefined}
            contentProps={{ side: "right", sideOffset: 8 }}
          >
            <ContextMenuItem
              disabled={amendDisabled}
              className={amendDisabled ? "data-[disabled]:pointer-events-auto" : undefined}
              onSelect={() => onCommitContextAction(commit, "amend")}
            >
              <GitCommitHorizontal />
              Amend last commit…
            </ContextMenuItem>
          </TooltipTarget>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "copy")}>
          <Clipboard />
          Copy SHA to clipboard
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}, areHistoryRowPropsEqual);

function HistoryReferences({ commit, showEmpty = false }: { commit: GitCommitGraphRow; showEmpty?: boolean }): ReactNode {
  if (commit.refs.length === 0) return showEmpty ? <span className="github-secondary-text">-</span> : null;
  return (
    <span className="history-refs">
      {commit.refs.map((ref) => (
        <span key={`${commit.hash}:${ref.kind}:${ref.name}`} className={`ref-badge ${ref.kind}`}>
          {ref.kind === "tag" ? <Tag aria-hidden="true" /> : null}
          {ref.name}
        </span>
      ))}
    </span>
  );
}

function HistoryPullRequests({
  association,
  onOpenExternalUrl,
  showEmpty = false
}: {
  association: GitHubCommitAssociation;
  onOpenExternalUrl: (url: string) => void;
  showEmpty?: boolean;
}): ReactNode {
  if (association.pullRequests.length === 0) return showEmpty ? <span className="github-secondary-text">-</span> : null;
  if (association.pullRequests.length === 1) {
    const pullRequest = association.pullRequests[0]!;
    return (
      <button type="button" className="history-github-badge" aria-label={`Open pull request ${pullRequest.number}`} onClick={(event) => {
        event.stopPropagation();
        onOpenExternalUrl(pullRequest.url);
      }}>
        PR #{pullRequest.number}
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="history-github-badge" aria-label={`${association.pullRequests.length} associated pull requests`} onClick={(event) => event.stopPropagation()}>
          PR #{association.pullRequests[0]!.number} +{association.pullRequests.length - 1}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
        {association.pullRequests.map((pullRequest) => (
          <DropdownMenuItem key={`${pullRequest.headRepositoryFullName}:${pullRequest.number}`} onSelect={() => onOpenExternalUrl(pullRequest.url)}>
            {pullRequest.headRepositoryFullName ?? pullRequest.baseRepositoryFullName} #{pullRequest.number}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HistoryCheckState({ association, compact = false }: { association: GitHubCommitAssociation; compact?: boolean }): ReactNode {
  const label = formatCheckStateLabel(association.checkState);
  return (
    <span className={compact ? undefined : "history-check-column"}>
      <span className={`history-check-state is-${association.checkState}`} aria-label={label} role="img" />
      {!compact ? <span className="truncate">{label}</span> : null}
    </span>
  );
}

function CommitSubject({
  subject,
  className,
  scopeClassName,
  descriptionClassName
}: {
  subject: string;
  className: string;
  scopeClassName: string;
  descriptionClassName: string;
}): ReactNode {
  const displaySubject = subject || "(no subject)";
  const parsedSubject = subject ? parseCommitSubject(subject) : null;
  if (!parsedSubject) {
    return <span className={className}>{displaySubject}</span>;
  }

  return (
    <span className={`${className} is-conventional`}>
      <span className={`commit-type-badge type-${parsedSubject.type}`}>{parsedSubject.label}</span>
      {parsedSubject.scope ? <span className={scopeClassName}>{parsedSubject.scope}:</span> : null}
      <span className={descriptionClassName}>{parsedSubject.description}</span>
    </span>
  );
}

function CommitDetailsPanel({
  details,
  loading,
  error,
  repository,
  onOpenExternalUrl,
  selectedFilePath,
  disabled,
  fileHistoryEnabled,
  blameEnabled,
  onSelectCommit,
  onSelectCommitFile,
  onCommitFileContextAction
}: {
  details: GitCommitDetails | null;
  loading: boolean;
  error: string;
  repository: GitHubRepository | null;
  onOpenExternalUrl: (url: string) => void;
  selectedFilePath: string | null;
  disabled: boolean;
  fileHistoryEnabled: boolean;
  blameEnabled: boolean;
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
  onCommitFileContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
}): ReactNode {
  let meta: ReactNode;
  let files: ReactNode;
  let fileCount = "No files";

  if (loading) {
    meta = <LoadingState label="Loading commit details" />;
    files = null;
  } else if (error) {
    meta = <p className="empty-state bad selectable-text">{error}</p>;
    files = null;
  } else if (!details) {
    meta = <p className="empty-state">Select a commit.</p>;
    files = null;
  } else {
    fileCount = `${details.files.length} ${details.files.length === 1 ? "file" : "files"}`;
    const references = parseGitHubReferences(`${details.subject}\n${details.body}`, repository);
    meta = (
      <div className="commit-meta-card selectable-text">
        <TooltipTarget content={details.subject || undefined}>
          <h2 className="commit-title text-base font-semibold">
            <CommitSubject
              subject={details.subject}
              className="commit-title-subject"
              scopeClassName="commit-title-scope"
              descriptionClassName="commit-title-description"
            />
          </h2>
        </TooltipTarget>
        <dl className="commit-facts">
          <Fact label="Commit" value={details.hash} />
          <Fact
            label="Parents"
            value={<ParentCommitLinks parents={details.parents} onSelectCommit={onSelectCommit} />}
          />
          <Fact label="Author" value={`${details.authorName} <${details.authorEmail}>`} />
          <Fact label="Date" value={formatDate(details.authorDate)} />
          {references.length > 0 ? (
            <Fact label="References" value={
              <span className="commit-reference-list">
                {references.map((reference) => (
                  <button key={`${reference.owner}/${reference.repository}#${reference.number}:${reference.kind}`} type="button" className="commit-reference-link" onClick={() => {
                    if (reference.targetUrl) onOpenExternalUrl(reference.targetUrl);
                  }}>{reference.displayText}</button>
                ))}
              </span>
            } />
          ) : null}
        </dl>
        {details.body ? (
          <div className="commit-body">
            <OptionalFeatureBoundary name="commit message">
              <BasicMarkdown externalLinks>{details.body}</BasicMarkdown>
            </OptionalFeatureBoundary>
          </div>
        ) : null}
      </div>
    );
    files = details.files.length === 0 ? (
      <p className="empty-state">No changed files.</p>
    ) : (
      details.files.map((file) => (
        <CommitFileRow
          key={file.path}
          file={file}
          selected={file.path === selectedFilePath}
          disabled={disabled}
          fileHistoryEnabled={fileHistoryEnabled}
          blameEnabled={blameEnabled}
          onSelectCommitFile={onSelectCommitFile}
          onContextAction={onCommitFileContextAction}
        />
      ))
    );
  }

  return (
    <section className="commit-details-panel grid h-full min-h-0 border-r bg-card" aria-label="Commit details">
      <div className="commit-meta-scroll border-b">{meta}</div>
      <div className="commit-file-list-header flex min-h-10 items-center justify-between gap-3 border-b px-4 text-sm">
        <span className="text-muted-foreground">{fileCount}</span>
        <span className="text-muted-foreground">Sorted by file status</span>
      </div>
      <div className="commit-file-list" role="listbox" aria-label="Changed files">
        {files}
      </div>
    </section>
  );
}

function ParentCommitLinks({
  parents,
  onSelectCommit
}: {
  parents: string[];
  onSelectCommit: (hash: string) => void;
}): ReactNode {
  if (parents.length === 0) {
    return "-";
  }

  return (
    <span className="commit-parent-links">
      {parents.map((parent, index) => (
        <Fragment key={parent}>
          {index > 0 ? <span aria-hidden="true">, </span> : null}
          <TooltipTarget content={parent}>
            <a
              className="commit-link"
              href={`#commit-${parent}`}
              onClick={(event) => {
                event.preventDefault();
                onSelectCommit(parent);
              }}
            >
              {parent.slice(0, 10)}
            </a>
          </TooltipTarget>
        </Fragment>
      ))}
    </span>
  );
}

function CommitFileRow({
  file,
  selected,
  disabled,
  fileHistoryEnabled,
  blameEnabled,
  onSelectCommitFile,
  onContextAction
}: {
  file: GitCommitChangedFile;
  selected: boolean;
  disabled: boolean;
  fileHistoryEnabled: boolean;
  blameEnabled: boolean;
  onSelectCommitFile: (filePath: string) => void;
  onContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
}): ReactNode {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={() => {
          if (!selected) {
            onSelectCommitFile(file.path);
          }
        }}
      >
        <button
          type="button"
          className={`commit-file-row ${selected ? "is-selected" : ""}`}
          role="option"
          aria-selected={selected}
          onClick={() => onSelectCommitFile(file.path)}
        >
          <CommitFileStatusBadge status={file.status} />
          <TooltipTarget content={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
            <span className="file-path">{file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}</span>
          </TooltipTarget>
          <span className="commit-file-stats">+{file.additions} -{file.deletions}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={disabled || !fileHistoryEnabled} onSelect={() => onContextAction(file, "log")}>
          <History />
          Log Selected
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || !blameEnabled || file.status === "D"} onSelect={() => onContextAction(file, "blame")}>
          <GitFork />
          Blame Selected
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={disabled} onSelect={() => onContextAction(file, "reset")}>
          <RotateCcw />
          Reset to Commit
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, "open-current")}>
          <ExternalLink />
          Open Current Version
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, "open-selected")}>
          <FileCode2 />
          Open Selected Version
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, "copy")}>
          <Clipboard />
          Copy Path to Clipboard
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CommitPanel({
  commitMessage,
  commitPushSafetyNotice,
  generationError,
  disabled,
  primaryCommitAction,
  pushableCommitCount,
  feedbackEvent,
  canCommit: commitAllowed,
  canGenerateCommitMessage: generateAllowed,
  generateTitle,
  onCommit,
  onCommitAndPush,
  onUndoFailedCommitPush,
  showAmendAction,
  canAmend,
  amendDisabled,
  amendDisabledReason,
  onOpenAmend,
  onGenerateMessage,
  onOpenGenerateWithContext,
  onCommitMessageChange
}: {
  commitMessage: string;
  commitPushSafetyNotice: CommitPushSafetyNotice | null;
  generationError: string;
  disabled: boolean;
  primaryCommitAction: "commit" | "push" | null;
  pushableCommitCount: number;
  feedbackEvent: OperationButtonFeedbackEvent | null;
  canCommit: boolean;
  canGenerateCommitMessage: boolean;
  generateTitle: string;
  onCommit: () => void;
  onCommitAndPush: () => void;
  onUndoFailedCommitPush: () => void;
  showAmendAction: boolean;
  canAmend: boolean;
  amendDisabled: boolean;
  amendDisabledReason: string | null;
  onOpenAmend: () => void;
  onGenerateMessage: () => void;
  onOpenGenerateWithContext: () => void;
  onCommitMessageChange: (message: string) => void;
}): ReactNode {
  const commitDisabled = disabled
    || primaryCommitAction === null
    || (primaryCommitAction === "commit" && !commitAllowed);
  const primaryActionLabel = primaryCommitAction === "push" ? "Push" : "Commit";
  const primaryActionAriaLabel = primaryCommitAction === "push" && pushableCommitCount > 0
    ? formatActionCountLabel("Push", pushableCommitCount)
    : undefined;
  const generateDisabled = disabled || !generateAllowed;
  const feedbackAction: "commit" | "push" = feedbackEvent?.surface === "commit-panel"
    && (feedbackEvent.action === "commit" || feedbackEvent.action === "push")
    ? feedbackEvent.action
    : primaryCommitAction === "push" ? "push" : "commit";

  return (
    <section className="grid min-h-0 gap-2.5 border-t bg-card px-6 py-4" aria-label="Commit staged files">
      <p className="eyebrow">Commit</p>
      <Textarea
        id="commit-message"
        value={commitMessage}
        rows={3}
        placeholder="Summarize staged changes..."
        onChange={(event) => onCommitMessageChange(event.target.value)}
      />
      {generationError ? (
        <p className="text-sm text-destructive" role="alert">{generationError}</p>
      ) : null}
      {commitPushSafetyNotice ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm" role="alert">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="min-w-0 flex-1 leading-5">{commitPushSafetyNotice.message}</p>
          {commitPushSafetyNotice.undoRequest ? (
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onUndoFailedCommitPush} className="shrink-0">
              <RotateCcw />
              Undo commit
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <div className="flex items-stretch">
          <TooltipButton
            type="button"
            variant="secondary"
            disabled={generateDisabled}
            tooltip="Generate commit message"
            disabledTooltip={generateTitle}
            onClick={onGenerateMessage}
            className="rounded-r-none"
          >
            <Sparkles />
            Generate
          </TooltipButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TooltipButton
                type="button"
                variant="secondary"
                disabled={generateDisabled}
                aria-label="More generate actions"
                tooltip="More commit message generation options"
                disabledTooltip={generateTitle}
                className="rounded-l-none border-l-secondary-foreground/20 px-2"
              >
                <ChevronDown />
              </TooltipButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onSelect={onOpenGenerateWithContext}>
                <Sparkles />
                Generate with Context
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-stretch">
          <Button
            type="button"
            disabled={commitDisabled}
            onClick={onCommit}
            aria-label={primaryActionAriaLabel}
            className={primaryCommitAction === "commit" || showAmendAction ? "rounded-r-none" : ""}
          >
            <OperationButtonFeedback
              action={feedbackAction}
              event={feedbackEvent}
              successLabel={feedbackAction === "push" ? "Pushed" : "Committed"}
              surface="commit-panel"
            >
              {primaryCommitAction === "push" ? <Upload /> : <CheckCircle2 />}
              {primaryActionLabel}
              {primaryCommitAction === "push" && pushableCommitCount > 0 ? (
                <SyncCountChip title={formatCommitCountLabel(pushableCommitCount, "ahead")}>
                  {pushableCommitCount}
                </SyncCountChip>
              ) : null}
            </OperationButtonFeedback>
          </Button>
          {primaryCommitAction === "commit" || showAmendAction ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  disabled={!showAmendAction && (disabled || !commitAllowed)}
                  aria-label="More commit actions"
                  data-amend-composer-trigger
                  className="rounded-l-none border-l-primary-foreground/25 px-2"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem disabled={disabled || !commitAllowed} onSelect={onCommitAndPush}>
                  <Upload />
                  Commit &amp; Push
                </DropdownMenuItem>
                {showAmendAction ? <DropdownMenuSeparator /> : null}
                {showAmendAction ? (
                  <TooltipTarget
                    content={!canAmend ? "This repository has no commit to amend." : amendDisabled ? amendDisabledReason ?? "Wait for the current Git operation to finish." : undefined}
                    contentProps={{ side: "left", sideOffset: 8 }}
                  >
                    <DropdownMenuItem
                      disabled={!canAmend || amendDisabled}
                      className={!canAmend || amendDisabled ? "data-[disabled]:pointer-events-auto" : undefined}
                      onSelect={onOpenAmend}
                    >
                      <GitCommitHorizontal />
                      Amend last commit…
                    </DropdownMenuItem>
                  </TooltipTarget>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GenerateWithContextDialog({
  open,
  context,
  generating,
  error,
  onOpenChange,
  onContextChange,
  onGenerate
}: {
  open: boolean;
  context: string;
  generating: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onContextChange: (context: string) => void;
  onGenerate: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form className="grid gap-4" onSubmit={onGenerate}>
          <DialogHeader>
            <DialogTitle>Generate with Context</DialogTitle>
            <DialogDescription className="sr-only">
              Add context that is not obvious from the staged code changes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="generate-change-context">Change Context</Label>
            <Textarea
              id="generate-change-context"
              name="changeContext"
              value={context}
              rows={4}
              disabled={generating}
              placeholder="Explain why this change was made..."
              onChange={(event) => onContextChange(event.currentTarget.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={generating || context.trim().length === 0}>
              <Sparkles />
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BranchDialog({
  open,
  branchName,
  checkout,
  saving,
  error,
  onOpenChange,
  onBranchNameChange,
  onCreate
}: {
  open: boolean;
  branchName: string;
  checkout: boolean;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onBranchNameChange: (branchName: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form className="grid gap-4" onSubmit={onCreate}>
          <DialogHeader>
            <DialogTitle>{checkout ? "Choose Local Branch Name" : "New Branch"}</DialogTitle>
            <DialogDescription className="sr-only">
              {checkout ? "Choose a local branch name for the selected remote branch or pull request." : "Create a local branch from the current branch."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              type="text"
              autoComplete="off"
              value={branchName}
              disabled={saving}
              autoFocus
              onChange={(event) => onBranchNameChange(event.target.value)}
            />
          </div>

          <p className="min-h-5 text-sm text-destructive" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : checkout ? <Download /> : <Plus />}
              {saving ? (checkout ? "Checking out" : "Creating") : (checkout ? "Check Out" : "Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetCommitDialog({
  state,
  commit,
  branchName,
  saving,
  resetModesEnabled,
  onOpenChange,
  onStateChange,
  onReset
}: {
  state: ResetCommitDialogState;
  commit: GitCommitGraphRow | null;
  branchName: string | null;
  saving: boolean;
  resetModesEnabled: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: ResetCommitDialogState) => void;
  onReset: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="commit-action-form" onSubmit={onReset}>
          <DialogHeader>
            <DialogTitle>Reset to Commit</DialogTitle>
            <DialogDescription>
              Move the current branch pointer to the selected commit.
            </DialogDescription>
          </DialogHeader>
          <div className="form-grid">
            <Label>Reset branch</Label>
            <span className="commit-action-value selectable-text">{branchName ?? "No current branch"}</span>
            <Label>To commit</Label>
            <span className="commit-action-value selectable-text">{commit ? getCommitSummaryLabel(commit) : state.hash}</span>
            {resetModesEnabled ? (
              <>
                <Label htmlFor="reset-mode">Using mode</Label>
                <select
                  id="reset-mode"
                  className="form-select"
                  value={state.mode}
                  disabled={saving}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      mode: event.currentTarget.value as GitResetMode,
                      error: ""
                    });
                  }}
                >
                  <option value="soft">Soft - keep all local changes</option>
                  <option value="mixed">Mixed - keep working copy but reset index</option>
                  <option value="hard">Hard - discard all working copy changes</option>
                </select>
              </>
            ) : null}
          </div>
          {state.error ? <p className="dialog-error">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !branchName}>
              {saving ? <Loader2 className="animate-spin" /> : <GitBranchIcon />}
              OK
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetCommitFileDialog({
  state,
  saving,
  onOpenChange,
  onCopy,
  onReset
}: {
  state: ResetCommitFileDialogState;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onReset: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const filesText = state.paths.join("\n");

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="commit-action-form" onSubmit={onReset}>
          <DialogHeader>
            <DialogTitle>Confirm reset file contents</DialogTitle>
            <DialogDescription>
              Please confirm that you want to reset the following files to the state they were in at this commit: {state.hash}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reset-file-paths">files:</Label>
            <Textarea
              id="reset-file-paths"
              value={filesText}
              readOnly
              rows={Math.max(1, Math.min(6, state.paths.length))}
            />
          </div>
          {state.error ? <p className="dialog-error">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving || state.paths.length === 0} onClick={onCopy}>
              <Clipboard />
              Copy to Clipboard
            </Button>
            <Button type="submit" disabled={saving || state.paths.length === 0}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              OK
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevertCommitDialog({
  state,
  commit,
  saving,
  onOpenChange,
  onReverse
}: {
  state: RevertCommitDialogState;
  commit: GitCommitGraphRow | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onReverse: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="commit-action-form" onSubmit={onReverse}>
          <DialogHeader>
            <DialogTitle>Confirm reverse commit?</DialogTitle>
            <DialogDescription>
              Are you sure you want to create a new commit reversing all the changes in {commit ? getCommitSummaryLabel(commit) : "the selected commit"}?
            </DialogDescription>
          </DialogHeader>
          {state.error ? <p className="dialog-error">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Yes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PublishBranchDialog({
  open,
  branchName,
  remotes,
  remote,
  saving,
  error,
  onOpenChange,
  onRemoteChange,
  onPublish
}: {
  open: boolean;
  branchName: string | null;
  remotes: string[];
  remote: string;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onRemoteChange: (remote: string) => void;
  onPublish: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const hasRemote = remotes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form className="grid gap-4" onSubmit={onPublish}>
          <DialogHeader>
            <DialogTitle>Publish Branch</DialogTitle>
            <DialogDescription className="sr-only">
              Choose the remote where the current branch will be pushed and tracked.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label>Branch</Label>
            <div className="commit-action-value selectable-text">{branchName ?? "No current branch"}</div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="publish-branch-remote">Remote</Label>
            <ReferencePicker
              id="publish-branch-remote"
              value={remote}
              options={remotes.map((remoteName) => ({ value: remoteName, label: remoteName, icon: <Upload /> }))}
              disabled={saving || remotes.length <= 1}
              ariaLabel="Select publish remote"
              placeholder="No push remote configured"
              searchPlaceholder="Search remotes..."
              emptyMessage="No push remotes found."
              triggerIcon={<Upload />}
              onValueChange={onRemoteChange}
            />
          </div>

          <p className="min-h-5 text-sm text-destructive" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !branchName || !hasRemote}>
              {saving ? <Loader2 className="animate-spin" /> : <Upload />}
              {saving ? "Publishing" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatePullRequestDialog({
  state,
  baseBranches,
  needsPush,
  canGenerate,
  generateTitle,
  onGenerateTitle,
  onOpenChange,
  onStateChange,
  onGenerate,
  onReviewUnknownOutcome,
  onSubmit
}: {
  state: CreatePrDialogState;
  baseBranches: string[];
  needsPush: boolean;
  canGenerate: boolean;
  generateTitle: string;
  onGenerateTitle: () => void;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: CreatePrDialogState) => void;
  onGenerate: () => void;
  onReviewUnknownOutcome: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const busy = state.step !== "idle";
  const generatingTitle = state.generating === "title";
  const generatingDescription = state.generating === "description";
  const generating = state.generating !== null;
  const submitLabel = state.step === "pushing"
    ? "Pushing…"
    : state.step === "creating"
    ? "Creating…"
    : needsPush
    ? "Push & Create"
    : "Create Pull Request";

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription>
              {`Open a GitHub pull request from ${state.headBranch || "the current branch"}${state.baseBranch ? ` into ${state.baseBranch}` : ""}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="create-pr-base">Base branch</Label>
            <ReferencePicker
              id="create-pr-base"
              value={state.baseBranch}
              options={baseBranches.map((branch) => ({ value: branch, label: branch, icon: <GitBranchIcon /> }))}
              disabled={busy || generating || baseBranches.length === 0}
              ariaLabel="Select pull request base branch"
              placeholder="No remote branches found"
              searchPlaceholder="Search base branches..."
              emptyMessage="No remote branches found."
              triggerIcon={<GitBranchIcon />}
              onValueChange={(baseBranch) => onStateChange({
                ...state,
                baseBranch,
                error: ""
              })}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="create-pr-title">Title</Label>
              <TooltipButton
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={busy || generating || !canGenerate}
                aria-label="Generate pull request title"
                tooltip="Generate pull request title"
                disabledTooltip={!canGenerate ? generateTitle : undefined}
                onClick={onGenerateTitle}
              >
                {generatingTitle ? <Loader2 className="animate-spin" /> : <Sparkles />}
              </TooltipButton>
            </div>
            <Input
              id="create-pr-title"
              value={state.title}
              disabled={busy || generating}
              onChange={(event) => onStateChange({
                ...state,
                title: event.currentTarget.value,
                error: ""
              })}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="create-pr-body">Description</Label>
              <TooltipButton
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={busy || generating || !canGenerate}
                aria-label="Generate pull request description"
                tooltip="Generate pull request description"
                disabledTooltip={!canGenerate ? generateTitle : undefined}
                onClick={onGenerate}
              >
                {generatingDescription ? <Loader2 className="animate-spin" /> : <Sparkles />}
              </TooltipButton>
            </div>
            <Textarea
              id="create-pr-body"
              className="resize-y field-sizing-fixed"
              rows={8}
              value={state.body}
              disabled={busy || generating}
              onChange={(event) => onStateChange({
                ...state,
                body: event.currentTarget.value,
                error: ""
              })}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.draft}
              disabled={busy || generating}
              onChange={(event) => onStateChange({
                ...state,
                draft: event.currentTarget.checked,
                error: ""
              })}
            />
            Create as draft
          </label>

          <div className="grid min-h-5 gap-2">
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
            {state.failure?.outcomeUnknown && !state.unknownOutcomeReviewed ? (
              <Button type="button" variant="outline" className="w-fit" onClick={onReviewUnknownOutcome}><ExternalLink />Open Pull Requests</Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || generating || !state.title.trim() || !state.baseBranch || Boolean(state.failure?.outcomeUnknown && !state.unknownOutcomeReviewed)}>
              {busy ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrustWorkspaceDialog({
  open,
  repoPath,
  onCancel,
  onTrust
}: {
  open: boolean;
  repoPath: string;
  onCancel: () => void;
  onTrust: () => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onCancel();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{TRUST_WORKSPACE_TITLE}</DialogTitle>
          <DialogDescription>
            {TRUST_WORKSPACE_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>

        {repoPath.trim() ? (
          <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
            {repoPath}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onTrust} autoFocus>
            Trust Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SafeDirectoryDialog({
  open,
  safeDirectory,
  saving,
  onCancel,
  onAllow
}: {
  open: boolean;
  safeDirectory: GitSafeDirectoryInfo | null;
  saving: boolean;
  onCancel: () => void;
  onAllow: () => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onCancel();
      }
    }}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Allow Git Ownership Exception?</DialogTitle>
          <DialogDescription>
            Git blocked this repository because its ownership differs from your current user. Githead will add this exact folder to Git's global safe.directory list.
          </DialogDescription>
        </DialogHeader>

        {safeDirectory?.path ? (
          <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
            {safeDirectory.path}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onAllow} disabled={saving || !safeDirectory?.path} autoFocus>
            {saving ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
            {saving ? "Adding Exception" : "Allow Exception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GitIdentityDialog({
  open,
  state,
  saving,
  onOpenChange,
  onStateChange,
  onSave
}: {
  open: boolean;
  state: GitIdentityPromptState;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: GitIdentityPromptState) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <form className="grid gap-4" onSubmit={onSave}>
          <DialogHeader>
            <p className="eyebrow">Git Identity</p>
            <DialogTitle>Set Git Author Identity</DialogTitle>
            <DialogDescription>
              Git needs a name and email before it can create commits.
            </DialogDescription>
          </DialogHeader>

          <GitIdentityFields
            idPrefix="git-identity-prompt"
            name={state.name}
            email={state.email}
            scope={state.scope}
            disabled={saving}
            error={state.error}
            autoFocusName
            onChange={(patch) => onStateChange({
              ...state,
              ...patch,
              error: ""
            })}
          />

          <p id="git-identity-prompt-error" className="min-h-5 text-sm text-destructive" role="alert">{state.error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Saving" : "Save and Retry Commit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImageDiffView({ filePath, before, after, onDownload, downloading }: { filePath: string; before: GitImageSide; after: GitImageSide; onDownload?: () => void; downloading: boolean }): ReactNode {
  const canDownload = (before.status === "lfs-missing" && before.fetchable) || (after.status === "lfs-missing" && after.fetchable);
  return (
    <div className="image-diff-wrap" aria-label={`Image comparison for ${filePath}`}>
      {canDownload && onDownload ? (
        <div className="image-diff-download">
          <Button type="button" variant="outline" size="sm" aria-label="Download missing Git LFS image preview" disabled={downloading} onClick={onDownload}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {downloading ? "Downloading..." : "Download Preview"}
          </Button>
        </div>
      ) : null}
      <div className="image-diff">
        <ImageDiffPane side="Before" filePath={filePath} imageSide={before} missingMessage="Image did not exist." />
        <ImageDiffPane side="After" filePath={filePath} imageSide={after} missingMessage="Image was deleted." />
      </div>
    </div>
  );
}

function ImageDiffPane({ side, filePath, imageSide, missingMessage }: { side: "Before" | "After"; filePath: string; imageSide: GitImageSide; missingMessage: string }): ReactNode {
  const version = imageSide.status === "available" ? imageSide.version : null;
  const objectUrl = useMemo(() => version ? URL.createObjectURL(new Blob([Uint8Array.from(version.data)], { type: version.mimeType })) : null, [version]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);
  return (
    <figure className="image-diff-pane">
      <figcaption className="image-diff-label">{side}</figcaption>
      <div className="image-diff-canvas">
        {objectUrl ? <img className="image-diff-preview" src={objectUrl} alt={`${side} version of ${filePath}`} /> : imageSide.status === "lfs-missing" ? <p className="image-diff-missing">LFS image is not available locally.<br />{formatImageBytes(imageSide.byteLength)}</p> : <p className="image-diff-missing">{missingMessage}</p>}
      </div>
    </figure>
  );
}

function formatImageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && value >= 1024; index += 1) { value /= 1024; unit = units[index]!; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

function useAppearanceModeClass(appearanceMode: AppAppearanceMode): void {
  useEffect(() => {
    const media = "matchMedia" in window ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const syncTheme = (): void => {
      const dark = appearanceMode === "dark" || (appearanceMode === "system" && Boolean(media?.matches));
      document.documentElement.classList.toggle("dark", dark);
    };

    syncTheme();
    media?.addEventListener("change", syncTheme);
    return () => {
      media?.removeEventListener("change", syncTheme);
    };
  }, [appearanceMode]);
}

function useFontPreferences(uiFont: AppUiFont, codeFont: AppCodeFont): void {
  useEffect(() => {
    document.documentElement.dataset.uiFont = uiFont;
    document.documentElement.dataset.codeFont = codeFont;
  }, [codeFont, uiFont]);
}

let repositoryActionDraftId = 0;

function createRepositoryActionManagerDraft(summary: RepoSummary): RepositoryActionManagerDraft {
  return {
    shared: summary.actionsConfig.shared.actions.map(createRepositoryActionDraft),
    local: summary.actionsConfig.local.actions.map(createRepositoryActionDraft)
  };
}

function createRepositoryActionDraft(action: GitConfiguredAction): RepositoryActionDraft {
  repositoryActionDraftId += 1;
  return {
    id: `repository-action-${repositoryActionDraftId}`,
    name: action.name,
    description: action.description,
    command: action.command,
    shell: action.shell
  };
}

function createEmptyRepositoryActionDraft(): RepositoryActionDraft {
  return createRepositoryActionDraft({
    name: "",
    description: "",
    command: "",
    shell: "powershell"
  });
}

function stripRepositoryActionDrafts(actions: RepositoryActionDraft[]): GitConfiguredAction[] {
  return actions.map((action) => ({
    name: action.name.trim(),
    description: action.description.trim(),
    command: action.command.trim(),
    shell: action.shell
  }));
}

function validateRepositoryActionDrafts(
  target: GitConfiguredActionFile,
  actions: GitConfiguredAction[]
): string {
  const seenNames = new Set<string>();
  for (const [index, action] of actions.entries()) {
    if (!action.name) {
      return `${getActionFileLabel(target)} action ${index + 1} is missing a name.`;
    }

    const key = getRepositoryActionKey(action.name);
    if (seenNames.has(key)) {
      return `Duplicate ${getActionFileLabel(target)} action name "${action.name}".`;
    }
    seenNames.add(key);

    if (!action.command) {
      return `${getActionFileLabel(target)} action "${action.name}" is missing a command.`;
    }

    if (!GIT_CONFIGURED_ACTION_SHELLS.includes(action.shell)) {
      return `${getActionFileLabel(target)} action "${action.name}" has an invalid shell.`;
    }
  }

  return "";
}

function getActionFileLabel(target: GitConfiguredActionFile): string {
  return target === "shared" ? "Shared" : "Local";
}

function getRepositoryActionKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function createFallbackActionFileConfig(target: GitConfiguredActionFile): GitConfiguredActionFileConfig {
  return {
    target,
    fileName: target === "shared" ? "actions.toml" : "actions.local.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: ""
  };
}

function createEmptyRendererActionsConfig(): RepoSummary["actionsConfig"] {
  return {
    hasGitheadDir: false,
    actions: [],
    error: "",
    shared: createFallbackActionFileConfig("shared"),
    local: createFallbackActionFileConfig("local")
  };
}

function createInvalidSummary(repoPath: string, message: string): RepoSummary {
  return {
    repoPath,
    kind: "git",
    capabilities: gitCapabilities(),
    isValid: false,
    branch: null,
    upstream: null,
    branches: [],
    hasHead: false,
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
    actionsConfig: createEmptyRendererActionsConfig(),
    validationErrors: [
      message
    ]
  };
}

function createSummaryFromIdentity(identity: RepoIdentitySection): RepoSummary {
  return {
    ...identity,
    upstream: null,
    branches: [],
    remotes: [],
    remoteBranches: [],
    defaultRemoteBranch: null,
    commitsAheadOfDefaultBranch: null,
    githubRepository: null,
    ahead: null,
    behind: null,
    files: [],
    operationState: null,
    actionsConfig: createEmptyRendererActionsConfig()
  };
}

function createInitialRendererUpdateState(): AppUpdateState {
  return {
    enabled: false,
    status: "disabled",
    currentVersion: "unknown",
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false
  };
}

function markAppUpdateError(
  state: AppState,
  errorContext: NonNullable<AppUpdateState["errorContext"]>,
  error: unknown
): AppState {
  return {
    ...state,
    appUpdate: {
      ...state.appUpdate,
      status: errorContext === "install" ? "downloaded" : "error",
      message: error instanceof Error ? error.message : "Unable to update Githead.",
      errorContext,
      canRetry: true,
      downloadPercent: errorContext === "download" ? null : state.appUpdate.downloadPercent
    }
  };
}

function reconcileSelection(state: AppState): AppState {
  if (!state.selection || !state.summary?.isValid) {
    return state;
  }

  const files = getFilesForSide(state.summary, state.selection.side);
  const availablePaths = new Set(files.map((file) => file.path));
  const selectedPaths = getSelectionPaths(state.selection).filter((path) => availablePaths.has(path));
  if (selectedPaths.length === 0) {
    return {
      ...state,
      selection: null,
      diff: null,
      diffChanged: false
    };
  }

  const path = availablePaths.has(state.selection.path) ? state.selection.path : selectedPaths[0]!;
  const anchorPath = availablePaths.has(state.selection.anchorPath) ? state.selection.anchorPath : path;
  if (
    path === state.selection.path &&
    anchorPath === state.selection.anchorPath &&
    areStringArraysEqual(selectedPaths, getSelectionPaths(state.selection))
  ) {
    return state;
  }

  return {
    ...state,
    selection: createFileSelection(state.selection.side, selectedPaths, path, anchorPath),
    diff: path === state.selection.path ? state.diff : null,
    diffChanged: path === state.selection.path ? state.diffChanged : false
  };
}

function areHistoryRowPropsEqual(previous: HistoryRowProps, next: HistoryRowProps): boolean {
  return previous.commit === next.commit
    && previous.selected === next.selected
    && previous.tagsEnabled === next.tagsEnabled
    && previous.containedInCurrentBranch === next.containedInCurrentBranch
    && previous.allowCherryPickingContainedCommits === next.allowCherryPickingContainedCommits
    && previous.association === next.association
    && previous.onOpenExternalUrl === next.onOpenExternalUrl
    && previous.onSelectCommit === next.onSelectCommit
    && previous.onCommitContextAction === next.onCommitContextAction
    && areStringArraysEqual(previous.columnOrder, next.columnOrder)
    && previous.virtualRowProps["aria-posinset"] === next.virtualRowProps["aria-posinset"]
    && previous.virtualRowProps["aria-setsize"] === next.virtualRowProps["aria-setsize"]
    && previous.virtualRowProps.style.top === next.virtualRowProps.style.top;
}

function resolvePostHunkSelection(summary: RepoSummary | null, selection: FileSelection): FileSelection | null {
  if (!summary?.isValid) {
    return null;
  }

  const currentSidePaths = new Set(getFilesForSide(summary, selection.side).map((file) => file.path));
  if (currentSidePaths.has(selection.path)) {
    const selectedPaths = getSelectionPaths(selection).filter((path) => currentSidePaths.has(path));
    return createFileSelection(selection.side, selectedPaths, selection.path, selection.anchorPath);
  }

  const destinationSide: GitDiffSide = selection.side === "unstaged" ? "staged" : "unstaged";
  if (getFilesForSide(summary, destinationSide).some((file) => file.path === selection.path)) {
    return createFileSelection(destinationSide, [selection.path], selection.path, selection.path);
  }

  return null;
}

function reuseCommitHistoryRows(
  previous: GitCommitGraphRow[],
  next: GitCommitGraphRow[]
): GitCommitGraphRow[] {
  if (previous.length !== next.length) return next;
  return previous.every((commit, index) => areCommitHistoryRowsEqual(commit, next[index]!))
    ? previous
    : next;
}

function areCommitHistoryRowsEqual(left: GitCommitGraphRow, right: GitCommitGraphRow): boolean {
  return left.hash === right.hash
    && left.shortHash === right.shortHash
    && left.subject === right.subject
    && left.authorName === right.authorName
    && left.authorEmail === right.authorEmail
    && left.authorDate === right.authorDate
    && left.relativeDate === right.relativeDate
    && areStringArraysEqual(left.parents, right.parents)
    && left.refs.length === right.refs.length
    && left.refs.every((ref, index) => ref.name === right.refs[index]?.name && ref.kind === right.refs[index]?.kind);
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidateHistory(state: AppState): AppState {
  return {
    ...state,
    historyLoaded: false,
    historyError: ""
  };
}

function resetGitHubUiState(state: AppState): AppState {
  return {
    ...state,
    createPrDialog: emptyCreatePrDialog
  };
}

function reconcileGitHubUiState(state: AppState, previousSummary: RepoSummary | null): AppState {
  const previousGitHubKey = previousSummary?.githubRepository?.fullName.toLowerCase() ?? "";
  const nextGitHubKey = state.summary?.githubRepository?.fullName.toLowerCase() ?? "";
  let next = previousGitHubKey === nextGitHubKey ? state : resetGitHubUiState(state);

  if (!nextGitHubKey && isGitHubView(next.activeView)) {
    next = {
      ...next,
      activeView: "status"
    };
  }

  return next;
}

function resetHistoryState(state: AppState): AppState {
  return {
    ...state,
    historyScope: "current",
    history: [],
    historyLoading: false,
    historyLoaded: false,
    historyError: "",
    selectedCommitHash: null,
    resetCommitDialog: emptyResetCommitDialog,
    revertCommitDialog: emptyRevertCommitDialog,
    resetCommitFileDialog: emptyResetCommitFileDialog,
    tagDialog: emptyTagDialog,
    commitDetails: null,
    commitDetailsLoading: false,
    commitDetailsError: "",
    selectedCommitFilePath: null,
    commitFileDiff: null,
    commitFileDiffLoading: false,
    commitFileDiffError: "",
    historyRoute: repositoryHistoryRoute,
    fileHistoryOrigin: null,
    fileHistoryEntries: [],
    fileHistoryLoading: false,
    fileHistoryError: "",
    fileHistoryHasMore: false,
    selectedFileHistoryHash: null,
    fileHistoryDiff: null,
    fileHistoryDiffLoading: false,
    fileHistoryDiffError: "",
    fileBlame: null,
    fileBlameLoading: false,
    fileBlameError: ""
  };
}

function getCurrentHistoryHeadSha(
  history: GitCommitGraphRow[],
  scope: CommitHistoryScope,
  currentBranch: string | null
): string | null {
  const decoratedHead = history.find((commit) => commit.refs.some((ref) => (
    ref.kind === "head" || (ref.kind === "branch" && ref.name === currentBranch)
  )));
  return decoratedHead?.hash ?? (scope === "current" ? history[0]?.hash ?? null : null);
}

function isGitHubView(view: WorkspaceView): boolean {
  return view === "workflows" || view === "pullRequests" || view === "issues";
}

function getCommitByHash(history: GitCommitGraphRow[], hash: string): GitCommitGraphRow | null {
  return history.find((commit) => commit.hash === hash) ?? null;
}

function getCommitTags(commit: GitCommitGraphRow): Array<{ name: string }> {
  return commit.refs.filter((ref) => ref.kind === "tag");
}

function getCommitSummaryLabel(commit: GitCommitGraphRow): string {
  const subject = commit.subject || "(no subject)";
  return `${commit.shortHash}: ${subject}`;
}

function getPushRemotes(summary: RepoSummary | null): string[] {
  if (!summary) {
    return [];
  }

  return [...new Set(summary.remotes.filter((remote) => remote.direction === "push").map((remote) => remote.name))];
}

function shouldPublishInsteadOfPush(summary: RepoSummary | null): summary is RepoSummary {
  return Boolean(
    summary?.isValid &&
    (summary.capabilities.setUpstream ?? true) &&
    summary.branch &&
    !summary.upstream &&
    getPushRemotes(summary).length > 0
  );
}

function getDefaultPublishRemote(summary: RepoSummary): string {
  return getDefaultPushRemote(summary);
}

function getDefaultPushRemote(summary: RepoSummary): string {
  const pushRemotes = getPushRemotes(summary);
  const upstreamRemote = summary.upstream
    ? summary.remoteBranches.find((remoteBranch) => remoteBranch.name === summary.upstream)?.remote
      ?? pushRemotes.find((remoteName) => summary.upstream?.startsWith(`${remoteName}/`))
    : undefined;
  if (upstreamRemote && pushRemotes.includes(upstreamRemote)) {
    return upstreamRemote;
  }
  return pushRemotes.includes("origin") ? "origin" : pushRemotes[0] ?? "";
}

function getRemoteDefaultBranch(summary: RepoSummary | null): GitRemoteBranch | null {
  if (!summary?.isValid) {
    return null;
  }

  // origin/HEAD can be locally unset (e.g. manually added remotes), so fall
  // back to the conventional default branch names.
  return summary.defaultRemoteBranch
    ?? summary.remoteBranches.find((remoteBranch) => remoteBranch.name === "origin/main")
    ?? summary.remoteBranches.find((remoteBranch) => remoteBranch.name === "origin/master")
    ?? null;
}

function getCreatePrBaseBranches(summary: RepoSummary | null): string[] {
  if (!summary?.isValid) {
    return [];
  }

  const remoteName = getRemoteDefaultBranch(summary)?.remote ?? "origin";
  return summary.remoteBranches
    .filter((remoteBranch) => remoteBranch.remote === remoteName)
    .map((remoteBranch) => remoteBranch.branch);
}

function shouldShowCreatePullRequest(
  summary: RepoSummary | null,
  pullRequests: GitHubPullRequestAssociation[],
  _hasPullRequestData: boolean
): boolean {
  if (!summary?.isValid || !summary.capabilities.github || !summary.githubRepository || !summary.branch) {
    return false;
  }

  const defaultBranch = getRemoteDefaultBranch(summary);
  if (!defaultBranch || summary.branch === defaultBranch.branch) {
    return false;
  }

  const aheadOfDefault = summary.commitsAheadOfDefaultBranch !== null
    ? summary.commitsAheadOfDefaultBranch > 0
    : hasUnpushedCommits(summary) || shouldPublishInsteadOfPush(summary);
  if (!aheadOfDefault) {
    return false;
  }

  return pullRequests.length === 0;
}

function formatPullRequestAssociationState(pullRequest: GitHubPullRequestAssociation): string {
  if (pullRequest.draft) return "Draft";
  return pullRequest.state.charAt(0).toUpperCase() + pullRequest.state.slice(1).toLowerCase();
}

function formatCheckStateLabel(state: import("../shared/types").GitHubCheckState): string {
  switch (state) {
    case "success": return "Checks passing";
    case "failure": return "Checks failing";
    case "pending": return "Checks pending";
    case "neutral": return "Checks neutral";
    default: return "Checks unavailable";
  }
}

function getGeneratePrDescriptionTitle(state: AppState): string {
  if (!canUseSelectedAiProvider(state.aiSettings)) {
    const provider = state.aiSettings?.selectedProvider ?? "openrouter";
    if (isCliProvider(provider)) {
      return `Install and authenticate ${getAiProviderLabel(provider)} before generating a description.`;
    }

    return `Configure ${getAiProviderLabel(provider)} settings before generating a description.`;
  }

  return "Generate a pull request description from the branch changes.";
}

function isMissingUpstreamPushFailure(result: GitRunResult): boolean {
  if (result.action !== "push" || result.exitCode === 0) {
    return false;
  }

  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return output.includes("has no upstream branch") ||
    output.includes("no upstream branch") ||
    output.includes("no upstream configured");
}

function shouldOfferPublishAfterFailedPush(result: GitRunResult, summary: RepoSummary | null): boolean {
  if (!shouldPublishInsteadOfPush(summary)) {
    return false;
  }

  return isMissingUpstreamPushFailure(result);
}

function getStagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isStaged);
}

function getUnstagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isUnstaged);
}

function getFilesForSide(summary: RepoSummary | null, side: GitDiffSide): GitStatusFile[] {
  return side === "staged" ? getStagedFiles(summary) : getUnstagedFiles(summary);
}

function canStageStatusFile(file: GitStatusFile): boolean {
  return file.submodule?.canStage !== false;
}

function RemoteFact({ remotes, repositoryUrl, disabled, onOpen, onManage }: {
  remotes: string;
  repositoryUrl: string | null;
  disabled: boolean;
  onOpen: (url: string) => void;
  onManage: () => void;
}): ReactNode {
  return (
    <div className="repo-upstream-fact">
      <dt>Remotes</dt>
      <dd>
        <TooltipTarget content={remotes === "-" ? undefined : remotes}><span className="repo-upstream-name">{remotes}</span></TooltipTarget>
        <span className="repo-remote-actions">
          <TooltipButton
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={disabled || !repositoryUrl}
            onClick={() => {
              if (repositoryUrl) onOpen(repositoryUrl);
            }}
            aria-label="Open remote repository"
            tooltip="Open remote repository"
            disabledTooltip={!repositoryUrl ? "No hosted repository URL available" : undefined}
          >
            <ExternalLink />
          </TooltipButton>
          <TooltipButton
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={disabled}
            onClick={onManage}
            aria-label="Manage remotes"
            tooltip="Manage remotes"
          >
            <Settings />
          </TooltipButton>
        </span>
      </dd>
    </div>
  );
}

function buildFileSelection(
  current: FileSelection | null,
  files: GitStatusFile[],
  path: string,
  side: GitDiffSide,
  modifiers: FileSelectionModifiers
): FileSelection | null {
  if (modifiers.selectAll) {
    return createFileSelection(side, files.map((file) => file.path), path, path);
  }

  if (modifiers.extendRange && current?.side === side) {
    const rangePaths = getFileRangePaths(files, current.anchorPath, path);
    return createFileSelection(side, rangePaths.length > 0 ? rangePaths : [path], path, current.anchorPath);
  }

  if (modifiers.toggle && current?.side === side) {
    const currentPaths = getSelectionPaths(current);
    const selectedPaths = currentPaths.includes(path)
      ? currentPaths.filter((selectedPath) => selectedPath !== path)
      : getOrderedSelectionPaths(files, [...currentPaths, path]);

    if (selectedPaths.length === 0) {
      return null;
    }

    const primaryPath = selectedPaths.includes(path) ? path : selectedPaths[0]!;
    const anchorPath = selectedPaths.includes(path)
      ? path
      : selectedPaths.includes(current.anchorPath)
        ? current.anchorPath
        : primaryPath;

    return createFileSelection(side, selectedPaths, primaryPath, anchorPath);
  }

  return createFileSelection(side, [path], path, path);
}

function createFileSelection(
  side: GitDiffSide,
  paths: string[],
  primaryPath: string,
  anchorPath: string
): FileSelection {
  const selectedPaths = [...new Set(paths.length > 0 ? paths : [primaryPath])];
  const path = selectedPaths.includes(primaryPath) ? primaryPath : selectedPaths[0]!;

  return {
    path,
    side,
    paths: selectedPaths,
    anchorPath: selectedPaths.includes(anchorPath) ? anchorPath : path
  };
}

function getSelectionPaths(selection: FileSelection): string[] {
  return selection.paths.length > 0 ? selection.paths : [selection.path];
}

function getContextActionPaths(selection: FileSelection | null, file: GitStatusFile, side: GitDiffSide): string[] {
  if (selection?.side !== side) {
    return [file.path];
  }

  const selectionPaths = getSelectionPaths(selection);
  return selectionPaths.includes(file.path) ? selectionPaths : [file.path];
}

function getContextActionAnchorPath(selection: FileSelection | null, paths: string[], fallbackPath: string): string {
  if (selection?.anchorPath && paths.includes(selection.anchorPath)) {
    return selection.anchorPath;
  }

  return paths.includes(fallbackPath) ? fallbackPath : paths[0]!;
}

function getFileRangePaths(files: GitStatusFile[], anchorPath: string, path: string): string[] {
  const anchorIndex = files.findIndex((file) => file.path === anchorPath);
  const pathIndex = files.findIndex((file) => file.path === path);
  if (anchorIndex === -1 || pathIndex === -1) {
    return [];
  }

  const start = Math.min(anchorIndex, pathIndex);
  const end = Math.max(anchorIndex, pathIndex);
  return files.slice(start, end + 1).map((file) => file.path);
}

function getOrderedSelectionPaths(files: GitStatusFile[], paths: string[]): string[] {
  const pathSet = new Set(paths);
  return files
    .map((file) => file.path)
    .filter((filePath) => pathSet.has(filePath));
}

function getSortedFiles(summary: RepoSummary | null, predicate: (file: GitStatusFile) => boolean): GitStatusFile[] {
  return [...(summary?.files ?? [])]
    .filter(predicate)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createSettingsDraftProviderModels(settings: AiSettings | null): Record<AiCommitMessageProvider, string> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((models, provider) => {
    models[provider] = settings?.providers[provider]?.model ?? "";
    return models;
  }, {} as Record<AiCommitMessageProvider, string>);
}

function createSettingsDraftPrDescriptionModels(settings: AiSettings | null): Record<AiCommitMessageProvider, string> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((models, provider) => {
    models[provider] = settings?.providers[provider]?.prDescriptionModel ?? "";
    return models;
  }, {} as Record<AiCommitMessageProvider, string>);
}

function createSettingsDraftCommitPlanModels(settings: AiSettings | null): Record<AiCommitMessageProvider, string> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((models, provider) => {
    models[provider] = settings?.providers[provider]?.commitPlanModel ?? "";
    return models;
  }, {} as Record<AiCommitMessageProvider, string>);
}

function createDefaultReasoningEfforts(): Record<AiCommitMessageProvider, AiReasoningEffort> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((efforts, provider) => {
    efforts[provider] = "low";
    return efforts;
  }, {} as Record<AiCommitMessageProvider, AiReasoningEffort>);
}

function createSettingsDraftReasoningEfforts(
  settings: AiSettings | null,
  purpose: "commit" | "commitPlan" | "prDescription"
): Record<AiCommitMessageProvider, AiReasoningEffort> {
  return AI_COMMIT_MESSAGE_PROVIDERS.reduce((efforts, provider) => {
    const providerSettings = settings?.providers[provider];
    efforts[provider] = purpose === "commitPlan"
      ? providerSettings?.commitPlanReasoningEffort ?? "low"
      : purpose === "prDescription"
        ? providerSettings?.prDescriptionReasoningEffort ?? "low"
        : providerSettings?.reasoningEffort ?? "low";
    return efforts;
  }, {} as Record<AiCommitMessageProvider, AiReasoningEffort>);
}

function hasAiSettingsChanges(draft: SettingsDraft, settings: AiSettings | null): boolean {
  if (!settings) {
    return draft.selectedProvider !== "openrouter"
      || draft.commitPlanGranularity !== DEFAULT_COMMIT_PLAN_GRANULARITY
      || draft.commitMessagePrompt !== DEFAULT_COMMIT_MESSAGE_PROMPT
      || draft.prDescriptionPrompt !== DEFAULT_PR_DESCRIPTION_PROMPT
      || JSON.stringify(draft.sourceControlWritingStyle) !== JSON.stringify(DEFAULT_SOURCE_CONTROL_WRITING_STYLE)
      || Object.values(draft.providerModels).some((model) => Boolean(model.trim()))
      || Object.values(draft.commitPlanModels).some((model) => Boolean(model.trim()))
      || Object.values(draft.commitPlanReasoningEfforts).some((effort) => effort !== "low")
      || Object.values(draft.prDescriptionModels).some((model) => Boolean(model.trim()))
      || Object.values(draft.reasoningEfforts).some((effort) => effort !== "low")
      || Object.values(draft.prDescriptionReasoningEfforts).some((effort) => effort !== "low")
      || Object.values(draft.apiKeys).some((apiKey) => Boolean(apiKey?.trim()))
      || Object.values(draft.clearApiKeys).some(Boolean);
  }

  if (
    draft.selectedProvider !== settings.selectedProvider
    || draft.commitPlanGranularity !== settings.commitPlanGranularity
    || draft.commitMessagePrompt !== settings.commitMessagePrompt
    || draft.prDescriptionPrompt !== settings.prDescriptionPrompt
    || JSON.stringify(draft.sourceControlWritingStyle) !== JSON.stringify(settings.sourceControlWritingStyle)
  ) {
    return true;
  }

  if (Object.values(draft.apiKeys).some((apiKey) => Boolean(apiKey?.trim()))) {
    return true;
  }
  if (Object.values(draft.clearApiKeys).some(Boolean)) {
    return true;
  }

  return AI_COMMIT_MESSAGE_PROVIDERS.some((provider) => {
    const providerSettings = settings.providers[provider];
    return draft.providerModels[provider] !== providerSettings.model
      || draft.commitPlanModels[provider] !== (providerSettings.commitPlanModel ?? "")
      || draft.commitPlanReasoningEfforts[provider] !== providerSettings.commitPlanReasoningEffort
      || draft.prDescriptionModels[provider] !== providerSettings.prDescriptionModel
      || draft.reasoningEfforts[provider] !== providerSettings.reasoningEffort
      || draft.prDescriptionReasoningEfforts[provider] !== providerSettings.prDescriptionReasoningEffort;
  });
}

function hasAppSettingsChanges(draft: SettingsDraft, settings: AppSettings | null): boolean {
  if (!settings) {
    return true;
  }

  return draft.autoFetchIntervalMinutes.trim() !== String(settings.autoFetchIntervalMinutes)
    || draft.colorTheme !== settings.colorTheme
    || draft.appearanceMode !== settings.appearanceMode
    || draft.uiFont !== settings.uiFont
    || draft.codeFont !== settings.codeFont
    || draft.zoomFactor !== settings.zoomFactor
    || draft.tagPushBehavior !== (settings.gitBehaviors?.tagPushBehavior ?? DEFAULT_TAG_PUSH_BEHAVIOR)
    || draft.requireUpToDateUpstreamBeforeCommit !== (settings.gitBehaviors?.requireUpToDateUpstreamBeforeCommit ?? false)
    || draft.remoteCheckLeaseSeconds !== (settings.gitBehaviors?.remoteCheckLeaseSeconds ?? DEFAULT_REMOTE_CHECK_LEASE_SECONDS)
    || draft.allowCherryPickingContainedCommits !== (settings.gitBehaviors?.allowCherryPickingContainedCommits ?? false)
    || draft.shareAnonymousDiagnostics !== settings.privacy.shareAnonymousDiagnostics;
}

function hasGitIdentityChanges(draft: SettingsDraft, settings: GitIdentitySettings | null): boolean {
  if (!settings) {
    return true;
  }

  return draft.gitIdentityName !== settings.global.name
    || draft.gitIdentityEmail !== settings.global.email;
}

function canCommit(state: AppState): boolean {
  return !state.summary?.operationState
    && hasStagedChanges(state.summary)
    && state.commitMessage.trim().length > 0;
}

function canGenerateCommitMessage(state: AppState): boolean {
  return hasStagedChanges(state.summary) && canUseSelectedAiProvider(state.aiSettings);
}

function canUseSelectedAiProvider(aiSettings: AiSettings | null): boolean {
  if (!aiSettings?.commitMessagePrompt.trim()) {
    return false;
  }

  const provider = aiSettings.selectedProvider;
  const providerSettings = aiSettings.providers[provider];
  if (!providerSettings?.model.trim()) {
    return false;
  }

  if (isApiKeyProvider(provider)) {
    return providerSettings.hasApiKey;
  }

  if (isCliProvider(provider)) {
    const status = aiSettings.cliStatus[provider];
    return Boolean(status?.detected && status.authenticated);
  }

  return false;
}

function parseAutoFetchIntervalDraft(value: string): number {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new Error("Enter an auto-fetch interval.");
  }

  const parsed = Number(trimmedValue);
  if (!Number.isInteger(parsed)) {
    throw new Error("Auto-fetch interval must be a whole number of minutes.");
  }

  if (parsed < 0) {
    throw new Error("Auto-fetch interval cannot be negative.");
  }

  if (parsed > 1440) {
    throw new Error("Auto-fetch interval cannot exceed 1440 minutes.");
  }

  return parsed;
}

function hasFetchRemote(summary: RepoSummary): boolean {
  return summary.remotes.some((remote) => remote.direction === "fetch");
}

function getGenerateMessageTitle(state: AppState): string {
  if (!hasStagedChanges(state.summary)) {
    return "Stage changes before generating a commit message.";
  }

  if (!canUseSelectedAiProvider(state.aiSettings)) {
    const provider = state.aiSettings?.selectedProvider ?? "openrouter";
    if (isCliProvider(provider)) {
      return `Install and authenticate ${getAiProviderLabel(provider)} before generating a commit message.`;
    }

    return `Configure ${getAiProviderLabel(provider)} settings before generating a commit message.`;
  }

  return "Generate a commit message from staged changes.";
}

function getCommitPlanGenerateTitle(state: AppState): string {
  if (state.summary?.kind !== "git") {
    return "Commit plan is available only for Git repositories.";
  }
  if (!canUseSelectedAiProvider(state.aiSettings)) {
    const provider = state.aiSettings?.selectedProvider ?? "openrouter";
    if (isCliProvider(provider)) {
      return `Install and authenticate ${getAiProviderLabel(provider)} before generating a commit plan.`;
    }
    return `Configure ${getAiProviderLabel(provider)} settings before generating a commit plan.`;
  }
  return "Generate a commit plan from unstaged changes.";
}

function getStashGenerateMessageTitle(state: AppState): string {
  if (!canUseSelectedAiProvider(state.aiSettings)) {
    const provider = state.aiSettings?.selectedProvider ?? "openrouter";
    if (isCliProvider(provider)) {
      return `Install and authenticate ${getAiProviderLabel(provider)} before generating a stash message.`;
    }
    return `Configure ${getAiProviderLabel(provider)} settings before generating a stash message.`;
  }
  return "Generate a stash message from the selected changes.";
}

function isOperationRunning(state: AppState): boolean {
  return Boolean(
    state.activeOperation ||
    state.runningAction ||
    state.runningOperation ||
    state.cloneRunning ||
    state.cloneCheckRunning ||
    state.safeDirectoryRunning ||
    state.settingsSaving ||
    state.gitIdentitySaving ||
    state.actionManager.savingTarget
  );
}

function getAmendDisabledReason(state: AppState): string | null {
  const operation = state.summary?.operationState;
  if (operation) {
    return `Finish or abort the active ${operation.kind === "cherry-pick" ? "cherry-pick" : operation.kind} first.`;
  }
  if (isOperationRunning(state)) {
    return "Wait for the current Git operation to finish.";
  }
  return null;
}

function hasProcessRunInFlight(state: AppState): boolean {
  return Boolean(state.runningAction || state.runningOperation || state.configuredActionRuns.length > 0);
}

type AppUpdateAction = "check" | "download" | "install" | "none";

function resolveAppUpdateAction(state: AppUpdateState): AppUpdateAction {
  if (state.status === "available") {
    return "download";
  }

  if (state.status === "downloaded") {
    return "install";
  }

  if (state.status === "error" && state.canRetry) {
    return "check";
  }

  if (state.status === "checking" || state.status === "downloading") {
    return "check";
  }

  return "none";
}

function getAppUpdateButtonLabel(state: AppUpdateState): string {
  if (state.status === "checking") {
    return "Checking for updates";
  }

  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading ${Math.floor(state.downloadPercent)}%`
      : "Downloading update";
  }

  if (state.status === "downloaded") {
    return "Restart to update";
  }

  if (state.status === "error") {
    return getAppUpdateMessageSummary(state);
  }

  if (state.status === "available" && state.errorContext === "download") {
    return "Retry update download";
  }

  return "Update available";
}

function getAppUpdateMessageSummary(state: AppUpdateState): string {
  if (state.status !== "error") {
    return state.message ?? "";
  }

  if (state.errorContext === "download") {
    return "Update download failed";
  }

  if (state.errorContext === "install") {
    return "Update install failed";
  }

  return "Update check failed";
}

function isSameRepoPath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}

function areRepoPathListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((repoPath, index) => isSameRepoPath(repoPath, right[index] ?? ""));
}

function getRepositoryWorkspacePaths(groups: RepositoryGroup[], fallback: string[]): string[] {
  if (!groups.length) return fallback;
  const paths = groups.flatMap((group) => group.worktrees.length
    ? group.worktrees.filter((worktree) => !worktree.isBare && !worktree.prunable).map((worktree) => worktree.path)
    : [group.anchorPath]);
  return [...new Map(paths.map((repoPath) => [getRepoPathKey(repoPath), repoPath])).values()];
}

function findRepositoryGroup(groups: RepositoryGroup[], repoPath: string): RepositoryGroup | null {
  return groups.find((group) => group.worktrees.some((worktree) => isSameRepoPath(worktree.path, repoPath)) || group.recentPaths.some((recent) => isSameRepoPath(recent, repoPath))) ?? null;
}

function createRepoSyncStatusMap(
  repoPaths: string[],
  statuses: RepoSyncStatus[],
  previous: Record<string, RepoSyncStatus> = {}
): Record<string, RepoSyncStatus> {
  const statusesByKey = new Map(statuses.map((status) => [
    getRepoPathKey(status.repoPath),
    status
  ]));
  const next: Record<string, RepoSyncStatus> = {};

  for (const repoPath of repoPaths) {
    const key = getRepoPathKey(repoPath);
    const status = statusesByKey.get(key) ?? previous[key];
    if (status) {
      next[key] = status;
    }
  }

  return next;
}

function pruneRepoSyncStatusMap(
  repoPaths: string[],
  statuses: Record<string, RepoSyncStatus>
): Record<string, RepoSyncStatus> {
  const next: Record<string, RepoSyncStatus> = {};

  for (const repoPath of repoPaths) {
    const key = getRepoPathKey(repoPath);
    const status = statuses[key];
    if (status) {
      next[key] = status;
    }
  }

  return next;
}

function createRepoSyncStatusFromSummary(summary: RepoSummary): RepoSyncStatus {
  const counts = getAheadBehindCounts(summary);

  return {
    repoPath: summary.repoPath,
    kind: summary.kind,
    isValid: summary.isValid,
    ahead: counts?.ahead ?? 0,
    behind: counts?.behind ?? 0,
    error: summary.isValid ? "" : summary.validationErrors.join(" ")
  };
}

function formatRepoSyncStatusDescription(status: RepoSyncStatus | null): string {
  if (!status?.isValid) {
    return "";
  }

  return [
    status.ahead > 0 ? formatCommitCountLabel(status.ahead, "ahead") : "",
    status.behind > 0 ? formatCommitCountLabel(status.behind, "behind") : ""
  ].filter(Boolean).join(", ");
}

function formatActionCountLabel(action: "Pull" | "Push", count: number): string {
  return `${action} ${count} ${count === 1 ? "commit" : "commits"}`;
}

function formatCommitCountLabel(count: number, direction: "ahead" | "behind"): string {
  return `${count} ${count === 1 ? "commit" : "commits"} ${direction}`;
}

function moveRepoPath(repoPaths: string[], fromRepoPath: string, toRepoPath: string, position: RepositoryDropPosition): string[] {
  const fromIndex = repoPaths.findIndex((repoPath) => isSameRepoPath(repoPath, fromRepoPath));
  const toIndex = repoPaths.findIndex((repoPath) => isSameRepoPath(repoPath, toRepoPath));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return repoPaths;
  }

  const next = [...repoPaths];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return repoPaths;
  }

  const adjustedToIndex = next.findIndex((repoPath) => isSameRepoPath(repoPath, toRepoPath));
  if (adjustedToIndex < 0) {
    return repoPaths;
  }

  next.splice(position === "before" ? adjustedToIndex : adjustedToIndex + 1, 0, moved);
  return next;
}

function getDropPosition(clientY: number, element: HTMLElement): RepositoryDropPosition {
  const bounds = element.getBoundingClientRect();
  return clientY < bounds.top + bounds.height / 2 ? "before" : "after";
}

function getRepoDisplayName(repoPath: string): string {
  const normalizedPath = repoPath.trim().replace(/[\\/]+$/, "");
  const match = /[^\\/]+$/.exec(normalizedPath);
  return match?.[0] || repoPath;
}

function inferCloneDirectoryName(source: string): string {
  const trimmedSource = source.trim().replace(/[\\/]+$/, "");
  if (!trimmedSource) {
    return "";
  }

  const withoutQuery = trimmedSource.split(/[?#]/, 1)[0] ?? trimmedSource;
  const match = /([^/:\\]+?)(?:\.git)?$/.exec(withoutQuery);
  return match?.[1] ?? "";
}

function getActionHeading(state: AppState): string {
  if (state.runningAction) {
    return `${capitalize(state.runningAction)} running`;
  }

  if (state.runningOperation) {
    return state.runningOperation;
  }

  const configuredActionHeading = getConfiguredActionRunningHeading(state.configuredActionRuns);
  if (configuredActionHeading) {
    return configuredActionHeading;
  }

  if (state.summary?.operationState) {
    const kind = state.summary.operationState.kind === "cherry-pick"
      ? "Cherry-pick"
      : capitalize(state.summary.operationState.kind);
    return `${kind} recovery required`;
  }

  if (state.lastResult) {
    return formatResultHeading(state.lastResult);
  }

  return "Ready";
}

function getActivityLogOperationStatus(state: AppState): string | null {
  if (state.runningAction) {
    return `${capitalize(state.runningAction)} running`;
  }

  if (state.runningOperation) {
    return `${state.runningOperation} running`;
  }

  const configuredActionHeading = getConfiguredActionRunningHeading(state.configuredActionRuns);
  if (configuredActionHeading) {
    return configuredActionHeading;
  }

  if (state.lastResult) {
    return formatResultHeading(state.lastResult);
  }

  if (state.lastOperationResult) {
    return state.lastOperationResult.exitCode === 0 ? "Operation complete" : "Operation failed";
  }

  return null;
}

function getConfiguredActionRunningHeading(runs: ConfiguredActionRun[]): string {
  if (runs.length === 1) {
    return `${runs[0]?.name ?? "Action"} running`;
  }

  return runs.length > 1 ? `${runs.length} actions running` : "";
}

function formatResultHeading(result: GitRunResult): string {
  const label = capitalize(result.action);
  if (result.push?.partialSuccess) return `${label} partially complete`;
  return result.exitCode === 0 ? `${label} complete` : `${label} failed`;
}

function getOperationFailureMessage(result: GitOperationResult | null, fallback: string): string {
  return result?.stderr.trim() || result?.stdout.trim() || fallback;
}

function getRepositoryAccessCheckFailureMessage(result: GitRepositoryAccessCheckResult): string {
  return result.stderr.trim() || result.stdout.trim() || "Unable to check repository access.";
}

function formatCompactCount(value: number): string {
  const count = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

  if (count < 1_000) {
    return String(count);
  }

  if (count < 999_950) {
    return formatCompactUnit(count / 1_000, "k");
  }

  return formatCompactUnit(count / 1_000_000, "m");
}

function formatCompactUnit(value: number, unit: string): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${unit}`;
}

function formatRelativeDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value || "unknown";
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  if (absolute < 2_592_000) return formatter.format(Math.round(seconds / 86_400), "day");
  if (absolute < 31_536_000) return formatter.format(Math.round(seconds / 2_592_000), "month");
  return formatter.format(Math.round(seconds / 31_536_000), "year");
}

function formatRunDuration(startedAt: string, updatedAt: string): string {
  const started = Date.parse(startedAt);
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(started) || !Number.isFinite(updated) || updated < started) return "-";
  const seconds = Math.floor((updated - started) / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatWorkflowRunStatus(run: GitHubWorkflowRun): string {
  return formatWorkflowEvent(run.conclusion ?? run.status);
}

function formatWorkflowEvent(value: string): string {
  return value.split("_").filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || "Unknown";
}

function waitForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getWorkflowRunStatusClass(run: GitHubWorkflowRun): string {
  const status = (run.conclusion ?? run.status).toLowerCase();
  if (status === "success") {
    return "success";
  }
  if (status === "failure" || status === "timed_out" || status === "cancelled") {
    return "failure";
  }
  if (status === "queued" || status === "in_progress" || status === "requested" || status === "waiting") {
    return "running";
  }

  return "neutral";
}

function isDeletedOnSide(file: GitStatusFile, side: GitDiffSide): boolean {
  return side === "staged" ? file.indexStatus === "D" : file.worktreeStatus === "D";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
