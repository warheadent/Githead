import { repositoryName as getRepoDisplayName, organizeRepositories, repositoryLabels, repositoryPreference, useRepositoryOrganization, type RepositoryOrganization } from "./repositoryOrganization";
import { CheckoutTagDialog } from "./CheckoutTagDialog";
import { RepositoryOmnibox } from "./RepositoryOmnibox";
import { CloneOptions } from "./CloneOptions";
import { emptyCloneDraft, type CloneDraft, type CloneRepositoryControls } from "./cloneRepository";
import { inferCloneDirectoryName, isLoreSource, parseRepositorySource, resolveRepositorySourceBranch } from "../shared/repositorySource";
import { preferredCommitFile } from "../shared/commitFileSelection";
import { loadPullRequestDraft, savePullRequestDraft, removePullRequestDraft } from "./pullRequestDraft";
import type { GitTagCheckoutRequest, OperationCancelStatus } from "../shared/types";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Clipboard,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileCode2,
  FolderOpen,
  Folder,
  GitFork,
  GitCommitHorizontal,
  GitBranch as GitBranchIcon,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  GripVertical,
  History,
  ListFilter,
  ListTree,
  List,
  Loader2,
  MapPinned,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SearchX,
  Search,
  SlidersHorizontal,
  Pin,
  EyeOff,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Undo2,
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
  type ReactElement,
  type ReactNode
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { Tabs } from "@/components/ui/tabs";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "motion/react";
import { TagDialog, type TagDialogState } from "./TagDialog";
import { EASE_OUT, MotionPresence, MotionSwap } from "./motion";
import {
  RepositoryActionsDialog,
  type RepositoryActionDraft,
  type RepositoryActionManagerDraft
} from "./RepositoryActionsDialog";
import { SettingsDialog as RedesignedSettingsDialog, type SettingsCategory, type SettingsDraft as SettingsDialogDraft } from "./SettingsDialog";
import { publishTelemetryPreference } from "./telemetryPreference";
import { RepositorySettingsDialog } from "./RepositorySettingsDialog";
import { ReferencePicker } from "./ReferencePicker";
import { GitIdentityFields } from "./GitIdentityFields";
import { getAiProviderLabel, isApiKeyProvider, isCliProvider } from "../shared/aiProvider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTarget, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../shared/commitMessagePrompt";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import { GITHUB_APP_INSTALL_URL } from "../shared/githubApp";
import { GitIndexLockRecovery } from "./GitIndexLockRecovery";
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
  CommitPlanValidationRequest,
  CommitPlanValidationResult,
  GenerateCommitPlanResult,
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
  GitExecutableStatus,
  GitForceWithLeaseOffer,
  GitImageSide,
  GitImageVersion,
  GitHubIssue,
  GitHubIssueQuery,
  GitHubConnectionStatus,
  GitHubDeviceFlow,
  GitHubFailure,
  GitHubCommitAssociation,
  GitHubRepository,
  GitHubPullRequest,
  GitHubPullRequestAssociation,
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
  GitStatusTruncation,
  GitStashSelection,
  GitUndoCommitRequest,
  RepoSyncStatus,
  RepositorySyncSettings,
  RepoIdentitySection,
  RepoTrustResult,
  RepoSummary,
  RepoStatusSection,
  RepoMetadataSection,
  RepositoryGroup,
  StatusFileViewMode
} from "../shared/types";
import { AI_COMMIT_MESSAGE_PROVIDERS, DEFAULT_CODE_FONT, DEFAULT_COMMIT_PLAN_GRANULARITY, DEFAULT_REMOTE_CHECK_LEASE_SECONDS, DEFAULT_SHARE_ANONYMOUS_DIAGNOSTICS, DEFAULT_TAG_PUSH_BEHAVIOR, DEFAULT_UI_FONT, DEFAULT_ZOOM_FACTOR, GIT_CONFIGURED_ACTION_SHELLS, gitCapabilities, stepAppZoomFactor } from "../shared/types";
import { isMarkdownPath, isSvgPath } from "../shared/filePreview";
import { parseCommitSubject, type ParsedCommitSubject } from "../shared/commitSubject";
import { parseGitHubReferences } from "../shared/githubReference";
import { ActivityLogPanel } from "./ActivityLogPanel";
import { CommitPlanView } from "./CommitPlanView";
import { ListDetailLayout } from "./ListDetailLayout";
import { canStageStatusFile } from "../shared/statusFiles";
import { BranchManagementDialog } from "./BranchManagementDialog";
import { GitIntegrationDialog } from "./GitIntegrationDialog";
import { AmendDialog } from "./AmendDialog";
import { WorktreeCreateDialog, WorktreeRemoveDialog } from "./WorktreeDialogs";
import { PullRecoveryDialog } from "./PullRecoveryDialog";
import { GitOperationRecoveryBanner } from "./GitOperationRecoveryBanner";
import { OperationBanner } from "./OperationBanner";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";
import { emptyPushToBranchDialog, type PushToBranchDialogState } from "./pushToBranchState";
import { gitHubQueryStore, useGitHubQueries } from "./useGitHubQueries";
import { GitHubQueryToolbar } from "./GitHubQueryToolbar";
import { CreateIssueDialog, type CreateIssueDraft } from "./CreateIssueDialog";
import { RunStatusIcon, WorkflowRunConsole } from "./WorkflowRunConsole";
import { formatRelativeDate } from "./relativeTime";
import { WorkflowDuration } from "./WorkflowDuration";
import { DEFAULT_ISSUE_QUERY, DEFAULT_PULL_REQUEST_QUERY, DEFAULT_WORKFLOW_QUERY, filterLoadedWorkflowRuns, sortLoadedWorkflowRuns } from "./githubViewQuery";
import { useGitHubHistoryInsights } from "./useGitHubHistoryInsights";
import {
  ColumnVisibilityMenu,
  usePersistentColumnLayout,
  type ColumnDefinition
} from "./columnLayout";
import {
  CommitActionContextMenuItems,
  CommitActionDropdownMenuItems,
  getCommitActionItems,
  type CommitActionItem,
  type CommitContextActionKind
} from "./commitActionMenu";
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
import { getAheadBehindCounts, getPrimaryCommitAction, getPushableCommitCount, hasStagedChanges, hasUnpushedCommits } from "./commitActions";
import type { ConfiguredActionOutcome, ConfiguredActionRun } from "./configuredActionMenu";
import { confirmAppUpdateInstall } from "./AppUpdateControl";
import { QuickSwitcher } from "./QuickSwitcher";
import { focusActiveViewTab, RepositoryHeader, type AddViewOption, type ConfiguredActionCancelTarget } from "./RepositoryHeader";
import { buildGoToItems, buildQuickSwitcherSections, type QuickSwitcherItem, type QuickSwitcherMode } from "./quickSwitcherItems";
import { useAppShortcuts, useZoomShortcuts } from "./useAppShortcuts";
import {
  moveRepoPath,
  useRepositoryRowActions,
  type RepositoryMenuTarget,
  type RenderRepositoryMenuItems,
  type RepositoryDropPosition,
  type RepositoryMoveDirection,
  type RepositoryRecoveryResult
} from "./RepositoryMenu";
import { WindowControls } from "./WindowControls";
import { formatRepoSyncStatusDescription, RecentRepositoryVcsIcon, RepoSyncStatusChips, SyncCountChip } from "./SyncCountChip";
import {
  formatActionCountLabel,
  formatCommitCountLabel,
  formatPullRequestAssociationState,
  getPushRemotes,
  getRemoteDefaultBranch,
  getRepositoryActionKey,
  shouldPublishInsteadOfPush,
  shouldShowCreatePullRequest,
} from "./remoteActions";
import { isGitHubView, isGuestView, type GuestView } from "./workspaceViews";
import { applyHistoryPage, fullHistoryRead, historyReadRequest, planHistoryRead, type HistoryRead } from "./historyPaging";
import { buildCommitGraphLayout, COMMIT_GRAPH_COLOR_COUNT, COMMIT_GRAPH_ROW_HEIGHT, type CommitGraphLayout } from "./commitGraph";
import { countDiffLineChanges, type DiffLineChangeCounts } from "./diffParser";
import { DiffRows, type DiffHunkAction } from "./DiffRows";
import { areFileDiffsEqual } from "./diffFreshness";
import { getCommitFileStatusVisuals, getFileStatusVisuals, type FileStatusVisuals } from "./fileStatusVisuals";
import { FileStatusChip } from "./FileStatusChip";
import { filterStatusFiles, type StatusFileFilter } from "./statusFileFilter";
import { FixedSizeVirtualList, type VirtualRowProps } from "./FixedSizeVirtualList";
import { buildStatusFileTree, fileName, flattenStatusFileTree, type StatusFileTreeFolder } from "./statusFileTree";
import { applyColorTheme } from "./themes";
import { OptionalFeatureBoundary } from "./OptionalFeatureBoundary";

const PerformanceDiagnosticsDialog = lazy(() => import("./PerformanceDiagnosticsDialog.js").then((module) => ({
  default: module.PerformanceDiagnosticsDialog
})));
import { StashComposerDialog, type StashCreateDraft } from "./StashComposerDialog";
import { StashesView } from "./StashesView";
import { AnalyticsView } from "./AnalyticsView";
import { StartupScreen } from "./StartupScreen";
import { attachCommitGraphHover } from "./commitGraphHover";
import { VisualEffectsProvider, defaultVisualPreferences, useVisualEffects } from "./VisualEffects";
import { StartLayout } from "./StartLayout";
import { useGitStashes } from "./useGitStashes";
import { useImageFilePreview, useMarkdownFilePreview } from "./useFilePreview";
import { repositoryHistoryRoute, targetFromCommitFile, targetFromHistoryEntry, type HistoricalFileTarget, type HistoryRoute } from "./historyNavigation";
import { useWorkspaceNavigation, type WorkspaceLocation, type WorkspaceView } from "./useWorkspaceNavigation";

const BasicMarkdown = lazy(() => import("./BasicMarkdown.js").then((module) => ({ default: module.BasicMarkdown })));
const BlameView = lazy(() => import("./BlameView.js").then((module) => ({ default: module.BlameView })));
const FileHistoryView = lazy(() => import("./FileHistoryView.js").then((module) => ({ default: module.FileHistoryView })));
const MarkdownDocument = lazy(() => import("./MarkdownDocument.js").then((module) => ({ default: module.MarkdownDocument })));
const PushToBranchDialog = lazy(() => import("./PushToBranchDialog.js").then((module) => ({ default: module.PushToBranchDialog })));
const RemoteManagementDialog = lazy(() => import("./RemoteManagementDialog.js").then((module) => ({ default: module.RemoteManagementDialog })));
const ReviewConsole = lazy(() => import("./ReviewConsole.js").then((module) => ({ default: module.ReviewConsole })));

const HISTORY_LIMIT = 200;

type HistoryColumnId = "graph" | "description" | "date" | "author" | "commit" | "references" | "pullRequest" | "checks";

type IntegrationDialogState = { kind: "merge" | "rebase" | "cherry-pick"; commitHash?: string } | null;

interface CommitFileDiffRead {
  requestId: number;
  diff: Promise<GitFileDiff>;
}

interface FileSelection {
  path: string;
  side: GitDiffSide;
  paths: string[];
  anchorPath: string;
}

interface FileSelectionModifiers {
  orderedPaths?: string[];
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
  concurrentSaveOperation: ActiveRendererOperation | null;
  error: string;
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
  repoPath: string;
  templateId: string;
  templates: import("../shared/types").GitHubPullRequestTemplate[];
  templatesLoading: boolean;
  templateError: string;
  templateRequest: number;
  applyDefaultTemplate: boolean;
  undoBody: string | null;
  draftSaveError: boolean;
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
  gitExecutableStatus: GitExecutableStatus | null;
  gitExecutableChecking: boolean;
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
  tagCheckoutOpen: boolean;
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
  /** The last configured action run that settled in this repository, for the header's Actions button. */
  configuredActionOutcome: ConfiguredActionOutcome | null;
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
  commitMessageSuggestion: CommitMessageSuggestion | null;
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
  /** The view in the single guest slot of the view switch. It stays while Changes or History is active. */
  guestView: GuestView | null;
  historyScope: CommitHistoryScope;
  history: GitCommitGraphRow[];
  /** Identifies the listing `history` came from, so later pages can extend it. */
  historyTipsToken: string | null;
  historyLoading: boolean;
  historyLoadingMore: boolean;
  historyLoaded: boolean;
  historyHasMore: boolean;
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

interface CommitMessageSuggestion {
  message: string;
  reason: "draft-changed" | "repository-changed" | "quick-commit-failed";
}

type AppStateUpdater = Partial<AppState> | ((state: AppState) => AppState);
type RepositoryRefreshReason = "filesystem" | "focus" | "repository-change" | "operation" | "user";

interface AppRepositoryRefreshRequest extends RepositoryRefreshRequest<RepositoryRefreshReason> {
  addToRecents?: boolean;
  preserveWorkspaceOnFailure?: boolean;
  showSetupOnFailure?: boolean;
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

type RepositoryReadKind = "summary" | "identity" | "status" | "metadata" | "history" | "commit-details" | "commit-file-diff" | "file-history" | "file-history-diff" | "file-blame" | "diff" | "diff-freshness" | "file-preview" | "commit-plan-validation";

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
  repositoryGroups: number;
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
  commitPlanValidation: number;
}

type RendererCancellationTarget =
  | { kind: "active"; token: number; operationId: string }
  | { kind: "configured"; id: number; operationId: string };


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

interface PendingRepoTrustRequest {
  repoPath: string;
  promise: Promise<RepoTrustResult>;
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
  ...defaultVisualPreferences,
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  zoomFactor: 1,
  tagPushBehavior: DEFAULT_TAG_PUSH_BEHAVIOR,
  requireUpToDateUpstreamBeforeCommit: false,
  quickCommitByDefault: false,
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
  concurrentSaveOperation: null,
  error: ""
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
  repoPath: "",
  templateId: "",
  templates: [],
  templatesLoading: false,
  templateError: "",
  templateRequest: 0,
  applyDefaultTemplate: true,
  undoBody: null,
  draftSaveError: false,
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

const REPOSITORY_TRUST_REQUIRED_MESSAGE = "Repository trust is required before Githead can run Git operations that may execute configured hooks or local Git configuration.";
const OPERATION_RECONCILE_INITIAL_DELAY_MS = 3_000;
const OPERATION_RECONCILE_INTERVAL_MS = 10_000;

const initialState: AppState = {
  startupStatus: "loading",
  gitExecutableStatus: null,
  gitExecutableChecking: true,
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
  tagCheckoutOpen: false,
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
  configuredActionOutcome: null,
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
  commitMessageSuggestion: null,
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
  guestView: null,
  historyScope: "current",
  history: [],
  historyTipsToken: null,
  historyLoading: false,
  historyLoadingMore: false,
  historyLoaded: false,
  historyHasMore: false,
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

export function App({ initialAppSettings = null }: { initialAppSettings?: AppSettings | null } = {}): ReactNode {
  const [state, setState] = useState<AppState>(() => ({ ...initialState, appSettings: initialAppSettings }));
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
  const uiFont = state.settingsOpen ? state.settingsDraft.uiFont : state.appSettings?.uiFont ?? DEFAULT_UI_FONT;
  const codeFont = state.settingsOpen ? state.settingsDraft.codeFont : state.appSettings?.codeFont ?? DEFAULT_CODE_FONT;
  useFontPreferences(uiFont, codeFont);
  const stateRef = useRef(state);
  stateRef.current = state;
  const githubConnectionGenerationRef = useRef(0);
  const appSettingsSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const appSettingsPreferenceSaveId = useRef(0);
  const requestIds = useRef<RequestIds>({
    repo: 0,
    repositoryGroups: 0,
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
    remoteConfigs: 0,
    commitPlanValidation: 0
  });
  const preloadedHistoryRequestId = useRef<number | null>(null);
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
  const pendingRepoTrustRequestRef = useRef<PendingRepoTrustRequest | null>(null);
  const repoRefreshInFlightRef = useRef(false);
  const autoFetchInFlightRef = useRef(false);
  const rendererOperationTokenRef = useRef(0);
  const actionManagerSaveTokenRef = useRef(0);
  const [remoteMutationRunning, setRemoteMutationRunning] = useState(false);
  const [branchMutationRunning, setBranchMutationRunning] = useState(false);
  const settingsSaveTokenRef = useRef(0);
  const configuredActionRunIdRef = useRef(0);
  const fileStatusGenerationRef = useRef(0);
  const acknowledgedFileStatusGenerationRef = useRef(0);
  // While a hunk is applied, the refreshed status moves the selection to the other group in the same
  // update that removes the file from its group, so the selection never passes through null.
  const hunkSelectionFollowRef = useRef<{ repoPath: string; selection: FileSelection } | null>(null);
  const startupAttemptRef = useRef(0);
  const refreshDirtyFileStatusRef = useRef<() => Promise<void>>(async () => undefined);
  const windowFocusedRef = useRef(true);
  const updateState = useCallback((updater: AppStateUpdater): void => {
    const base = stateRef.current;
    // Every write goes through the guest reconcile, so any path that activates a guest view also puts it in the slot.
    const optimistic = reconcileGuestView(typeof updater === "function" ? updater(base) : {
      ...base,
      ...updater
    });
    stateRef.current = optimistic;
    setState((current) => {
      const next = current === base
        ? optimistic
        : reconcileGuestView(typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater });
      stateRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const dialog = state.createPrDialog;
    if (!dialog.open || !dialog.repoPath) return;
    let active = true;
    const requestId = crypto.randomUUID();
    updateState((latest) => ({ ...latest, createPrDialog: { ...latest.createPrDialog, templatesLoading: true, templateError: "" } }));
    void window.githead.getGitHubPullRequestTemplates({ repoPath: dialog.repoPath, requestId }).then((result) => {
      if (!active) return;
      updateState((latest) => {
        const current = latest.createPrDialog;
        if (!result.ok) return { ...latest, createPrDialog: { ...current, templatesLoading: false, templateError: result.error.message } };
        const selected = result.data.find((template) => template.isDefault) ?? (result.data.length === 1 ? result.data[0] : undefined);
        const apply = current.applyDefaultTemplate && !current.body && current.generating === null && current.step === "idle";
        return { ...latest, createPrDialog: {
          ...current,
          templates: result.data,
          templatesLoading: false,
          ...(apply ? { templateId: selected?.id ?? "", body: selected?.body ?? "", applyDefaultTemplate: false } : {})
        } };
      });
    }).catch((error: unknown) => {
      if (active) updateState((latest) => ({ ...latest, createPrDialog: { ...latest.createPrDialog, templatesLoading: false, templateError: error instanceof Error ? error.message : "Unable to load pull request templates." } }));
    });
    return () => {
      active = false;
      void window.githead.cancelGitHubRequest({ requestId }).catch(() => undefined);
    };
  }, [state.createPrDialog.open, state.createPrDialog.repoPath, state.createPrDialog.headBranch, state.createPrDialog.templateRequest, updateState]);

  useEffect(() => {
    const dialog = state.createPrDialog;
    if (!dialog.open || !dialog.repoPath) return;
    const saved = savePullRequestDraft(dialog.repoPath, dialog.headBranch, {
      ...dialog, outcomeUnknown: dialog.step === "creating" || Boolean(dialog.failure?.outcomeUnknown)
    });
    if (dialog.draftSaveError === saved) updateState((latest) => ({ ...latest, createPrDialog: { ...latest.createPrDialog, draftSaveError: !saved } }));
  }, [state.createPrDialog, updateState]);

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
    patch: Partial<Pick<AppSettings, "statusFileViewMode" | "wrapDiffLines" | "zoomFactor">>,
    failureMessage: string
  ): void => {
    const previous = stateRef.current.appSettings;
    if (!previous) return;
    const desired = { ...previous, ...patch };
    if (
      desired.statusFileViewMode === previous.statusFileViewMode
      && desired.wrapDiffLines === previous.wrapDiffLines
      && desired.zoomFactor === previous.zoomFactor
    ) return;

    const saveId = ++appSettingsPreferenceSaveId.current;
    updateState({ appSettings: desired });
    if (desired.zoomFactor !== previous.zoomFactor) {
      void window.githead.setWindowZoomFactor(desired.zoomFactor).catch(() => undefined);
    }
    appSettingsSaveQueue.current = appSettingsSaveQueue.current.then(async () => {
      try {
        const appSettings = await window.githead.saveAppSettings(desired);
        if (saveId === appSettingsPreferenceSaveId.current) updateState({ appSettings });
      } catch (error) {
        if (saveId === appSettingsPreferenceSaveId.current && desired.zoomFactor !== previous.zoomFactor) {
          void window.githead.setWindowZoomFactor(previous.zoomFactor).catch(() => undefined);
        }
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

  useZoomShortcuts((action) => {
    const current = stateRef.current;
    const settingsOpen = current.settingsOpen;
    if (settingsOpen && current.settingsSaving) return;
    const from = settingsOpen ? current.settingsDraft.zoomFactor : current.appSettings?.zoomFactor ?? DEFAULT_ZOOM_FACTOR;
    const zoomFactor = action === "zoom-reset" ? DEFAULT_ZOOM_FACTOR : stepAppZoomFactor(from, action === "zoom-in" ? 1 : -1);
    if (zoomFactor === from) return;
    if (!settingsOpen) {
      saveAppSettingsPreference({ zoomFactor }, "Unable to save the interface scale.");
      return;
    }
    // The settings dialog previews its draft scale; keep the shortcut in step with the slider until the user saves or cancels.
    void window.githead.setWindowZoomFactor(zoomFactor).catch(() => undefined);
    updateState({ settingsDraft: { ...current.settingsDraft, zoomFactor } });
  });

  const requestRepoTrust = useCallback((repoPath: string): Promise<RepoTrustResult> => {
    const pending = pendingRepoTrustRequestRef.current;
    if (pending) {
      return isSameRepoPath(pending.repoPath, repoPath)
        ? pending.promise
        : Promise.resolve({ trusted: false });
    }

    const promise = window.githead.addRepoTrust({ repoPath });
    pendingRepoTrustRequestRef.current = {
      repoPath,
      promise
    };
    const clearPending = (): void => {
      if (pendingRepoTrustRequestRef.current?.promise === promise) {
        pendingRepoTrustRequestRef.current = null;
      }
    };
    void promise.then(clearPending, clearPending);
    return promise;
  }, []);

  const createTrustFailure = useCallback((repoPath: string): GitOperationResult => ({
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr: REPOSITORY_TRUST_REQUIRED_MESSAGE
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

      const nextTrust = await requestRepoTrust(repoPath);
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
  }, [createTrustFailure, requestRepoTrust, updateState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    activityLogStore.setRepository(state.repoPath, state.activeView === "activity");
  }, [activityLogStore, state.activeView, state.repoPath]);

  useEffect(() => {
    if (state.lastResult) activityLogStore.completeRun(state.lastResult);
  }, [activityLogStore, state.lastResult]);

  const appendLog = useCallback((event: GitOutputEvent): void => {
    activityLogStore.append({ ...event, repoPath: event.repoPath ?? stateRef.current.repoPath });
    if (event.runId === stateRef.current.activeOperation?.operationId && event.action === "quick-commit-committing") {
      updateState({ runningOperation: "Committing selected files" });
    }
  }, [activityLogStore, updateState]);

  const appendOperationLog = useCallback((label: string, result: GitOperationResult): void => {
    activityLogStore.appendOperationResult(label, result);
  }, [activityLogStore]);

  const copyActivityLogRawText = useCallback(async (runId?: string): Promise<void> => {
    const text = activityLogStore.getRawText(runId);
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

  const loadCommitFileDiff = useCallback(async (hash: string, filePath: string, prefetched?: CommitFileDiffRead): Promise<void> => {
    const beginRead = (): number => {
      cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
      requestIds.current.commitFileDiff += 1;
      return requestIds.current.commitFileDiff;
    };
    const readDiff = (readId: number): Promise<GitFileDiff> => {
      const originalPath = stateRef.current.commitDetails?.files.find((file) => file.path === filePath)?.originalPath;
      return window.githead.getCommitFileDiff({
        repoPath: stateRef.current.repoPath,
        hash,
        path: filePath,
        requestId: repositoryReadRequestId("commit-file-diff", readId),
        ...(originalPath ? { originalPath } : {})
      });
    };
    // A read started with the commit details is still current only when no
    // other file or commit was selected since.
    const usePrefetched = prefetched !== undefined && prefetched.requestId === requestIds.current.commitFileDiff;
    let requestId = usePrefetched ? prefetched.requestId : beginRead();
    updateState({
      commitFileDiffLoading: true,
      commitFileDiffError: "",
      commitFileDiff: null
    });

    try {
      let diff = await (usePrefetched ? prefetched.diff : readDiff(requestId));
      if (usePrefetched && requestId === requestIds.current.commitFileDiff && diff?.path !== filePath) {
        // The service chose another file or declined to choose one.
        requestId = beginRead();
        diff = await readDiff(requestId);
      }

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

  const invalidateCommitDetailReads = useCallback((): void => {
    cancelRepositoryRead("commit-details", requestIds.current.commitDetails);
    cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
    requestIds.current.commitDetails += 1;
    requestIds.current.commitFileDiff += 1;
  }, []);

  const loadCommitDetails = useCallback(async (hash: string): Promise<void> => {
    invalidateCommitDetailReads();
    const requestId = requestIds.current.commitDetails;
    const previousFilePath = stateRef.current.selectedCommitFilePath;
    updateState({
      commitDetailsLoading: true,
      commitDetailsError: "",
      commitDetails: null,
      selectedCommitFilePath: null,
      commitFileDiff: null,
      commitFileDiffLoading: false,
      commitFileDiffError: ""
    });

    // Start the diff the details will select (the previous file when this
    // commit changed it, else its first file) instead of after the details.
    const diffRequestId = requestIds.current.commitFileDiff;
    const repoPath = stateRef.current.repoPath;
    const prefetchedDiff: CommitFileDiffRead = {
      requestId: diffRequestId,
      diff: (async () => window.githead.getCommitFileDiff({
        repoPath,
        hash,
        path: previousFilePath ?? "",
        fallbackToFirstFile: true,
        requestId: repositoryReadRequestId("commit-file-diff", diffRequestId)
      }))()
    };
    // Observed by loadCommitFileDiff when the details select a file.
    prefetchedDiff.diff.catch(() => undefined);

    try {
      const details = await window.githead.getCommitDetails({
        repoPath: stateRef.current.repoPath,
        hash,
        requestId: repositoryReadRequestId("commit-details", requestId)
      });

      if (requestId !== requestIds.current.commitDetails) {
        return;
      }

      const selectedCommitFilePath = preferredCommitFile(details.files, previousFilePath)?.path ?? null;

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

    if (requestId !== requestIds.current.commitDetails) return;
    const latest = stateRef.current;
    if (latest.selectedCommitHash === hash && latest.selectedCommitFilePath) {
      await loadCommitFileDiff(hash, latest.selectedCommitFilePath, prefetchedDiff);
    } else if (diffRequestId === requestIds.current.commitFileDiff) {
      cancelRepositoryRead("commit-file-diff", diffRequestId);
    }
  }, [invalidateCommitDetailReads, loadCommitFileDiff, updateState]);

  const loadCommitHistory = useCallback(async (
    force: boolean,
    preload = false,
    loadMore = false
  ): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.summary?.isValid) {
      updateState({
        history: [],
        historyTipsToken: null,
        historyLoaded: false,
        historyHasMore: false,
        historyError: current.summary?.validationErrors.join(" ") ?? ""
      });
      return false;
    }

    if (loadMore && (current.historyLoading || !current.historyHasMore)) return false;

    if (current.historyLoaded && !force) {
      return true;
    }

    const repoPath = current.repoPath;
    const scope = current.historyScope;
    const baseHistory = current.history;
    const baseHasMore = current.historyHasMore;
    // Extend or refresh the loaded rows only while the listing they came from
    // is unchanged. Otherwise reread the full prefix so graph order stays exact.
    let read = planHistoryRead(baseHistory, current.historyTipsToken, loadMore);
    const repoRequestId = requestIds.current.repo;

    preloadedHistoryRequestId.current = null;
    cancelRepositoryRead("history", requestIds.current.history);
    const requestId = requestIds.current.history + 1;
    requestIds.current.history = requestId;
    updateState({
      historyLoading: true,
      historyLoadingMore: loadMore,
      historyError: ""
    });

    let commitHashToLoad: string | null = null;

    try {
      const readPage = (nextRead: HistoryRead) => window.githead.getCommitHistoryPage({
        repoPath,
        ...historyReadRequest(nextRead),
        scope,
        requestId: repositoryReadRequestId("history", requestId)
      });
      let page = await readPage(read);
      if (requestId !== requestIds.current.history) {
        return false;
      }
      let applied = applyHistoryPage(baseHistory, baseHasMore, read, page);
      if (!applied) {
        read = fullHistoryRead(baseHistory.length, loadMore);
        page = await readPage(read);
        if (requestId !== requestIds.current.history) {
          return false;
        }
        applied = applyHistoryPage(baseHistory, baseHasMore, read, page);
      }

      const latest = stateRef.current;
      // Paged results extend the rows they were planned from.
      if (!applied || (read.kind !== "full" && latest.history !== baseHistory)) {
        return false;
      }
      preloadedHistoryRequestId.current = preload && repoRequestId === requestIds.current.repo && latest.activeView !== "history" ? requestId : null;
      const history = reuseCommitHistoryRows(latest.history, applied.history);
      const selectedCommitHash = history.some((commit) => commit.hash === latest.selectedCommitHash)
        ? latest.selectedCommitHash
        : history[0]?.hash ?? null;
      const selectionChanged = selectedCommitHash !== latest.selectedCommitHash;
      const detailsNeedLoading = Boolean(selectedCommitHash)
        && latest.commitDetails?.hash !== selectedCommitHash
        && !(latest.commitDetailsLoading && latest.selectedCommitHash === selectedCommitHash);

      if (selectionChanged && latest.selectedCommitHash) invalidateCommitDetailReads();
      updateState(selectionChanged ? {
        history,
        historyTipsToken: applied.tipsToken,
        historyHasMore: applied.hasMore,
        historyLoaded: true,
        historyError: "",
        selectedCommitHash,
        commitDetails: null,
        commitDetailsLoading: false,
        commitDetailsError: "",
        selectedCommitFilePath: null,
        commitFileDiff: null,
        commitFileDiffLoading: false,
        commitFileDiffError: ""
      } : {
        history,
        historyTipsToken: applied.tipsToken,
        historyHasMore: applied.hasMore,
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
            historyTipsToken: null,
            historyLoaded: false,
            historyHasMore: false,
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
          historyLoading: false,
          historyLoadingMore: false
        });
      }
    }

    if (commitHashToLoad && stateRef.current.activeView === "history") {
      await loadCommitDetails(commitHashToLoad);
    }

    return true;
  }, [invalidateCommitDetailReads, loadCommitDetails, updateState]);

  useEffect(() => {
    if (
      state.repoLoading ||
      !state.summary?.isValid ||
      state.historyLoaded ||
      state.historyLoading ||
      state.historyError ||
      typeof window.requestIdleCallback !== "function"
    ) {
      return;
    }

    const repoPath = state.repoPath;
    const scope = state.historyScope;
    const idleCallbackId = window.requestIdleCallback(() => {
      const latest = stateRef.current;
      if (
        !isSameRepoPath(repoPath, latest.repoPath) ||
        latest.historyScope !== scope ||
        latest.historyLoaded ||
        latest.historyLoading ||
        latest.historyError ||
        !latest.summary?.isValid
      ) {
        return;
      }
      void loadCommitHistory(false, true);
    }, { timeout: 750 });

    return () => {
      window.cancelIdleCallback(idleCallbackId);
    };
  }, [loadCommitHistory, state.historyError, state.historyLoaded, state.historyLoading, state.historyScope, state.repoLoading, state.repoPath, state.summary?.isValid]);

  const changeHistoryScope = useCallback(async (scope: CommitHistoryScope): Promise<void> => {
    let current = stateRef.current;
    if (current.historyScope === scope || current.summary?.kind !== "git") {
      return;
    }
    const repoPath = current.repoPath;
    if (scope === "all" && !(await ensureTrustedRepo(repoPath))) return;
    current = stateRef.current;
    if (!isSameRepoPath(repoPath, current.repoPath) || current.historyScope === scope || current.summary?.kind !== "git") return;

    invalidateCommitDetailReads();
    updateState({
      historyScope: scope,
      history: [],
      historyTipsToken: null,
      historyLoading: false,
      historyLoadingMore: false,
      historyLoaded: false,
      historyHasMore: false,
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
  }, [ensureTrustedRepo, invalidateCommitDetailReads, loadCommitHistory, updateState]);

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
    const request = {
      repoPath,
      path: selection.path,
      side: selection.side,
      requestId: repositoryReadRequestId("diff-freshness", requestId)
    };
    const isCurrent = (): boolean => {
      const latest = stateRef.current;
      return requestId === requestIds.current.diffFreshness &&
        isSameRepoPath(repoPath, latest.repoPath) &&
        latest.selection?.path === selection.path &&
        latest.selection.side === selection.side &&
        latest.diff === loadedDiff;
    };

    try {
      // A fingerprint read avoids transferring the whole diff, including both
      // image versions, after every repository change event.
      if (loadedDiff.fingerprint) {
        const { fingerprint } = await window.githead.getFileDiffFingerprint(request);
        if (!isCurrent()) return;
        if (fingerprint !== null) {
          if (fingerprint !== loadedDiff.fingerprint) updateState({ diffChanged: true });
          return;
        }
      }
      const latestDiff = await window.githead.getFileDiff(request);
      if (!isCurrent()) return;
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
    const requestId = ++requestIds.current.repositoryGroups;
    const isCurrent = (): boolean => requestId === requestIds.current.repositoryGroups
      && areRepoPathListsEqual(repoPaths, stateRef.current.repoRecents);
    if (!repoPaths.length) {
      updateState({ repositoryGroups: [] });
      return;
    }
    try {
      const groups = await window.githead.getRepositoryGroups({
        repoPaths,
        activeRepoPath: stateRef.current.repoPath || null
      });
      if (!isCurrent()) return;
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
      if (isCurrent()) updateState({ repositoryGroups: [] });
    }
  }, [loadRepoSyncStatuses, updateState]);

  const runRepoRefresh = useCallback(async (
    repoPath: string,
    options: AppRepositoryRefreshRequest,
    signal: AbortSignal
  ): Promise<void> => {
    preloadedHistoryRequestId.current = null;
    const requestId = requestIds.current.repo + 1;
    requestIds.current.repo = requestId;
    const fileStatusGeneration = fileStatusGenerationRef.current;
    const showSetupOnFailure = options.showSetupOnFailure ?? stateRef.current.showSetup;
    let refreshSucceeded = false;
    lastRepositoryRefreshRef.current = { repoPath, succeeded: false };
    repoRefreshInFlightRef.current = true;

    const getFollowSelection = (): FileSelection | null => {
      const follow = hunkSelectionFollowRef.current;
      return follow && isSameRepoPath(follow.repoPath, repoPath) ? follow.selection : null;
    };
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
        const trust = await window.githead.getRepoTrust({ repoPath });
        if (
          !trust.trusted ||
          requestId !== requestIds.current.repo ||
          !isSameRepoPath(repoPath, stateRef.current.repoPath)
        ) return;
        const status = await window.githead.getRepoStatus({ repoPath, generation: requestId, statusOnly: true, requestId: repositoryReadRequestId("status", requestId) });
        if (requestId !== requestIds.current.repo || !isSameRepoPath(status.repoPath, stateRef.current.repoPath)) return;
        acknowledgedFileStatusGenerationRef.current = Math.max(acknowledgedFileStatusGenerationRef.current, fileStatusGeneration);
        refreshSucceeded = true;
        updateState((current) => current.summary ? reconcileSelection({ ...current, summary: { ...current.summary, ...status } }, getFollowSelection()) : current);
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
      updateState((current) => ({
        ...current,
        summary: identitySummary,
        showSetup: !identity.isValid && showSetupOnFailure,
        setupError: identity.validationErrors.join(" "),
        repoSyncStatuses: identity.isValid ? current.repoSyncStatuses : {
          ...current.repoSyncStatuses,
          [getRepoPathKey(identity.repoPath)]: createRepoSyncStatusFromSummary(identitySummary)
        }
      }));
      if (!identity.isValid) return;
      if (!(await ensureTrustedRepo(identity.repoPath, () => (
        requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)
      ), false))) return;

      const isRefreshCurrent = (): boolean => !signal.aborted
        && requestId === requestIds.current.repo
        && isSameRepoPath(repoPath, stateRef.current.repoPath);
      if (!isRefreshCurrent()) return;
      // History needs validated, trusted identity, but not status or metadata.
      if (stateRef.current.activeView === "history" && stateRef.current.historyRoute.kind === "repository") {
        void loadCommitHistory(true);
      }

      const applySection = (section: RepoStatusSection | RepoMetadataSection): boolean => {
        if (!isRefreshCurrent() || section.generation !== requestId || !isSameRepoPath(section.repoPath, repoPath)) return false;
        updateState((current) => {
          const summary = { ...current.summary!, ...section };
          return reconcileGitHubUiState(reconcileSelection({
            ...current,
            summary,
            repoSyncStatuses: {
              ...current.repoSyncStatuses,
              [getRepoPathKey(repoPath)]: createRepoSyncStatusFromSummary(summary)
            }
          }, getFollowSelection()), current.summary);
        });
        return true;
      };
      const [statusResult, metadataResult] = await Promise.allSettled([
        window.githead.getRepoStatus({ repoPath, generation: requestId, requestId: repositoryReadRequestId("status", requestId) }).then((status) => {
          if (!applySection(status)) return null;
          acknowledgedFileStatusGenerationRef.current = Math.max(acknowledgedFileStatusGenerationRef.current, fileStatusGeneration);
          refreshSucceeded = true;
          return status;
        }),
        window.githead.getRepoMetadata({ repoPath, generation: requestId, requestId: repositoryReadRequestId("metadata", requestId) }).then((metadata) => applySection(metadata) ? metadata : null)
      ]);
      if (!isRefreshCurrent()) return;
      const status = statusResult.status === "fulfilled" ? statusResult.value : null;
      const metadata = metadataResult.status === "fulfilled" ? metadataResult.value : null;
      const summary = stateRef.current.summary!;
      lastRepositoryRefreshRef.current = { repoPath, succeeded: Boolean(status && metadata) };

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
          updateState((current) => ({ ...current, lastOperationResult: { repoPath, exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : "Unable to refresh changes." } }));
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
          showSetup: showSetupOnFailure,
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
  }, [ensureTrustedRepo, loadCommitHistory, loadRepoSyncStatuses, updateState]);

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
        preloadedHistoryRequestId.current = null;
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

  const switchRepo = useCallback(async (repoPath: string, options: { addToRecents?: boolean; recentAnchorPath?: string; location?: WorkspaceLocation } = {}): Promise<void> => {
    const nextRepoPath = repoPath.trim();
    if (!nextRepoPath) {
      return;
    }

    const leaving = stateRef.current;
    if (leaving.summary?.isValid && leaving.repoPath) {
      repositorySnapshots.current.set(leaving.repoPath, {
        summary: leaving.summary,
        history: leaving.history,
        historyTipsToken: leaving.historyTipsToken,
        historyHasMore: leaving.historyHasMore,
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

    if (changingRepositories && leaving.actionManager.concurrentSaveOperation) {
      void window.githead.cancelGitOperation({ operationId: leaving.actionManager.concurrentSaveOperation.operationId }).catch(() => undefined);
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
    cancelRepositoryRead("commit-plan-validation", requestIds.current.commitPlanValidation);
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
      tagCheckoutOpen: false,
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
      commitMessageSuggestion: null,
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
      // Another repository starts without a guest view; the reconcile restores one that stays active.
      guestView: changingRepositories ? null : base.guestView,
      configuredActionOutcome: changingRepositories ? null : base.configuredActionOutcome,
      selection: cached?.selection ?? null,
      diff: null,
      diffLoading: false,
      diffChanged: false
      }));
      const restored = cached ? { ...reset, history: cached.history, historyTipsToken: cached.historyTipsToken, historyScope: cached.historyScope, historyLoaded: cached.history.length > 0, historyHasMore: cached.historyHasMore, selection: cached.selection } : reset;
      return options.location ? { ...restored, ...options.location } : restored;
    });

    await refreshRepo({
      reason: "repository-change",
      showSetupOnFailure: leaving.showSetup,
      addToRecents: options.addToRecents ?? false,
      ...(options.recentAnchorPath ? { recentAnchorPath: options.recentAnchorPath } : {})
    });
  }, [refreshRepo, repositoryRefreshCoordinator, updateState]);

  const initializeRepository = useCallback(async (startupAttempt: number): Promise<void> => {
    let repoRecents: Awaited<ReturnType<typeof window.githead.getRepoRecents>> = [];

    try {
      repoRecents = await window.githead.getRepoRecents();
    } catch (error) {
      if (startupAttempt === startupAttemptRef.current) {
        updateState((current) => ({
          ...current,
          lastOperationResult: {
            repoPath: current.repoPath,
            exitCode: -1,
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unable to load recent repositories."
          }
        }));
      }
      throw error;
    }

    if (startupAttempt !== startupAttemptRef.current) return;

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
        showSetupOnFailure: true,
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

  const loadAppSettings = useCallback(async (startupAttempt: number): Promise<void> => {
    try {
      const appSettings = await window.githead.getAppSettings();
      if (startupAttempt !== startupAttemptRef.current) return;
      publishTelemetryPreference(appSettings.privacy.shareAnonymousDiagnostics);
      updateState((current) => ({
        ...current, appSettings,
        cloneDraft: { ...current.cloneDraft, parentPath: current.cloneDraft.parentPath || appSettings.cloneParentPath || "" }
      }));
    } catch (error) {
      if (startupAttempt !== startupAttemptRef.current) return;
      updateState((current) => ({
        ...current,
        appSettings: current.appSettings ?? {
          autoFetchIntervalMinutes: 10,
          colorTheme: "githead",
          appearanceMode: "system",
          ...defaultVisualPreferences,
          uiFont: DEFAULT_UI_FONT,
          codeFont: DEFAULT_CODE_FONT,
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
    const startupAttempt = startupAttemptRef.current + 1;
    startupAttemptRef.current = startupAttempt;
    updateState({ gitExecutableChecking: true });
    try {
      const gitExecutableStatus = await window.githead.getGitExecutableStatus();
      if (startupAttempt !== startupAttemptRef.current) return;
      if (!gitExecutableStatus.available) {
        updateState({
          startupStatus: "ready",
          gitExecutableStatus,
          gitExecutableChecking: false
        });
        return;
      }

      updateState({
        startupStatus: "loading",
        gitExecutableStatus,
        gitExecutableChecking: false
      });
      await Promise.all([
        initializeRepository(startupAttempt),
        loadAppSettings(startupAttempt)
      ]);
      if (startupAttempt !== startupAttemptRef.current) return;
      updateState({ startupStatus: "ready" });
    } catch (error) {
      if (startupAttempt !== startupAttemptRef.current) return;
      updateState({
        startupStatus: "ready",
        gitExecutableChecking: false,
        showSetup: true,
        setupError: error instanceof Error ? error.message : "Unable to load recent repositories."
      });
    }
  }, [initializeRepository, loadAppSettings, updateState]);

  useEffect(() => {
    void initializeApp();
    void loadAiSettings();
    return () => {
      startupAttemptRef.current += 1;
    };
  }, [initializeApp, loadAiSettings]);

  useEffect(() => {
    if (state.gitExecutableStatus?.available) {
      void loadRepositoryGroups();
    }
  }, [loadRepositoryGroups, state.gitExecutableStatus, state.repoRecents.join("\0")]);

  useEffect(() => {
    if (!state.settingsOpen && state.appSettings) {
      applyColorTheme(state.appSettings.colorTheme);
    }
  }, [state.appSettings, state.settingsOpen]);

  useEffect(() => {
    if (!state.gitExecutableStatus?.available) {
      updateState({ gitIdentity: null, repositorySyncSettings: null });
      return;
    }
    void loadGitIdentity(state.repoPath);
    void loadRepositorySyncSettings(state.repoPath);
  }, [loadGitIdentity, loadRepositorySyncSettings, state.gitExecutableStatus, state.repoPath, updateState]);

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
    cancelRepositoryRead("commit-plan-validation", requestIds.current.commitPlanValidation);
    pendingRepoTrustRequestRef.current = null;
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

      const actionSave = next.actionManager.concurrentSaveOperation;
      if (actionSave && missingIds.has(actionSave.operationId)) {
        refreshCurrentRepository ||= belongsToCurrentRepository(actionSave.repoPath);
        next = { ...next, actionManager: { ...next.actionManager, savingTarget: null, concurrentSaveOperation: null,
          error: "The action save ended before its result arrived. Review the saved file before retrying." } };
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
    ...(state.actionManager.concurrentSaveOperation ? [state.actionManager.concurrentSaveOperation.operationId] : []),
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

  const chooseRepo = useCallback(async (defaultPath?: string): Promise<void> => {
    const repoPath = await window.githead.chooseRepo(defaultPath ?? stateRef.current.repoPath);
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
    const source = stateRef.current.cloneDraft.source;
    try {
      const parentPath = await window.githead.chooseCloneParent(stateRef.current.cloneDraft.parentPath);
      if (!parentPath || stateRef.current.cloneDraft.source !== source || stateRef.current.cloneRunning) return;
      updateState((current) => ({ ...current,
        cloneDraft: { ...current.cloneDraft, parentPath },
        appSettings: current.appSettings ? { ...current.appSettings, cloneParentPath: parentPath } : null,
        cloneError: "" }));
    } catch (error) {
      if (stateRef.current.cloneDraft.source === source) updateState({ cloneError: error instanceof Error ? error.message : "Unable to choose the destination." });
    }
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

  const abandonCloneCheck = useCallback((): void => {
    const operation = stateRef.current.activeOperation;
    if (operation?.kind !== "clone-check") return;
    // Invalidate synchronously before requesting cancellation. Late IPC replies
    // must never overwrite the next source, even if cancellation loses the race.
    finishActiveOperation(operation.token);
    resetCloneCheckState();
    void window.githead.cancelGitOperation({ operationId: operation.operationId }).catch(() => undefined);
  }, [finishActiveOperation, resetCloneCheckState]);

  const setClonePanelOpen = useCallback((clonePanelOpen: boolean): void => {
    const current = stateRef.current;
    if (!clonePanelOpen && current.cloneRunning) {
      return;
    }
    if (!clonePanelOpen) abandonCloneCheck();

    updateState({
      clonePanelOpen
    });
  }, [abandonCloneCheck, updateState]);

  const checkRepositoryAccess = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (isOperationRunning(current)) {
      return;
    }

    const parsed = parseRepositorySource(current.cloneDraft.source);
    const source = parsed?.source ?? current.cloneDraft.source;
    const sourceDraft = current.cloneDraft.source;
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

      if (!isActiveOperationCurrent(operation.token) || stateRef.current.cloneDraft.source !== sourceDraft) {
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
          branchName: resolveRepositorySourceBranch(latest.cloneDraft.sourceRefPath || parsed?.refPath || "", result.branches,
            latest.cloneDraft.branchName.trim() || parsed?.branchName || result.defaultBranch || "")
        },
        cloneCheckStatus: "success",
        cloneCheckMessage: "Repository is accessible.",
        cloneBranches: result.branches
      }));
    } catch (error) {
      if (!isActiveOperationCurrent(operation.token) || stateRef.current.cloneDraft.source !== sourceDraft) {
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

  const cloneRepository = useCallback(async (fork = false): Promise<void> => {
    const current = stateRef.current;
    if (isOperationRunning(current)) {
      return;
    }

    const depthText = isLoreSource(current.cloneDraft.source) ? "0" : current.cloneDraft.depth.trim();
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
        source: parseRepositorySource(current.cloneDraft.source)?.source ?? current.cloneDraft.source,
        parentPath: current.cloneDraft.parentPath,
        directoryName: current.cloneDraft.directoryName,
        branchName: current.cloneDraft.branchName,
        depth,
        recurseSubmodules: current.cloneDraft.recurseSubmodules,
        ...(current.cloneDraft.skipLfs ? { skipLfs: true } : {}),
        ...(fork ? { fork: true } : {}),
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
          latest.cloneDraft.recurseSubmodules === submittedDraft.recurseSubmodules &&
          latest.cloneDraft.skipLfs === submittedDraft.skipLfs &&
          latest.cloneDraft.sourceRefPath === submittedDraft.sourceRefPath;
        if (!isSameRepoPath(latest.repoPath, result.repoPath) || !draftStillBelongsToThisClone) {
          return latest;
        }
        return {
          ...latest,
          cloneDraft: { ...emptyCloneDraft, parentPath: submittedDraft.parentPath },
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

    if (action === "pull" && current.summary.kind === "git" && !current.summary.branch) return null;

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
      activityLogStore.completeRun(lastResult);
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
        runId: operation.operationId,
        action,
        repoPath: stateRef.current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: message,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString()
      };
      completedResult = rendererResult;
      activityLogStore.completeRun(rendererResult);
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
  }, [activityLogStore, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

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

  const runConfiguredAction = useCallback(async (
    action: GitConfiguredAction
  ): Promise<void> => {
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
      startedAt: Date.now(),
      cancelStatus: "idle",
      cancelError: ""
    };
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
        expectedAction: action,
        operationId: invocation.operationId
      });
      activityLogStore.completeRun(lastResult);
      if (!invocationIsTracked()) return;
      updateState((latest) => isSameRepoPath(repoPath, latest.repoPath) ? {
        ...latest,
        lastResult,
        configuredActionOutcome: createConfiguredActionOutcome(invocation, lastResult.exitCode)
      } : latest);
    } catch (error) {
      if (!invocationIsTracked()) return;
      const message = error instanceof Error ? error.message : "Configured action failed.";
      const lastResult: GitRunResult = {
        runId: invocation.operationId,
        action: action.name,
        repoPath,
        exitCode: -1,
        stdout: "",
        stderr: message,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString()
      };
      activityLogStore.completeRun(lastResult);
      updateState((latest) => isSameRepoPath(repoPath, latest.repoPath) ? {
        ...latest,
        lastResult,
        configuredActionOutcome: createConfiguredActionOutcome(invocation, lastResult.exitCode)
      } : latest);
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
  }, [activityLogStore, ensureTrustedRepo, isInvocationCurrent, refreshRepo, updateState]);

  const runPullWithConfiguredAction = useCallback(async (action: GitConfiguredAction): Promise<void> => {
    const result = await runAction("pull", undefined, "action-bar");
    if (result?.exitCode === 0) {
      await runConfiguredAction(action);
    }
  }, [runAction, runConfiguredAction]);

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
        concurrentSaveOperation: null,
        error: ""
      }
    });
  }, [updateState]);

  const closeActionManager = useCallback((): void => {
    const manager = stateRef.current.actionManager;
    if (manager.savingTarget) {
      const operation = manager.concurrentSaveOperation;
      if (operation && operation.cancelStatus !== "canceling") {
        updateState({ actionManager: { ...manager, concurrentSaveOperation: { ...operation, cancelStatus: "canceling" } } });
        void window.githead.cancelGitOperation({ operationId: operation.operationId }).then((result) => {
          if (!result.accepted) {
            if (result.state === "not-found") recoverMissingOperations([operation.operationId]);
            else throw new Error("This window cannot cancel the action save.");
          }
        }).catch((error: unknown) => {
          updateState((latest) => latest.actionManager.concurrentSaveOperation?.token === operation.token
            ? { ...latest, actionManager: { ...latest.actionManager, error: error instanceof Error ? error.message : "Unable to cancel action save.", concurrentSaveOperation: { ...operation, cancelStatus: "error" } } }
            : latest);
        });
      }
      return;
    }

    updateState({
      actionManager: emptyActionManager
    });
  }, [recoverMissingOperations, updateState]);

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
    if (!current.summary?.isValid || current.actionManager.savingTarget) {
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
    if (!(await ensureTrustedRepo(current.repoPath)) || !isSameRepoPath(current.repoPath, stateRef.current.repoPath)
      || stateRef.current.actionManager.savingTarget || !stateRef.current.actionManager.open) return;
    const latest = stateRef.current;
    const concurrent = isOperationRunning(latest);
    if (concurrent && !(latest.summary?.kind === "git" && latest.activeOperation?.kind === "action"
      && (latest.runningAction === "fetch" || latest.runningAction === "push"))) {
      updateState({ actionManager: { ...latest.actionManager, error: "Wait for the current operation to finish before saving action files. Your changes are kept in this editor." } });
      return;
    }

    const saveToken = ++actionManagerSaveTokenRef.current;
    const operation = createActiveOperation(
      `Saving ${target} actions`,
      current.repoPath,
      "action-save"
    );

    updateState({
      ...(!concurrent ? { activeOperation: operation } : {}),
      actionManager: {
        ...current.actionManager,
        savingTarget: target,
        concurrentSaveOperation: concurrent ? operation : null,
        error: ""
      }
    });

    const isSaveCurrent = (): boolean => saveToken === actionManagerSaveTokenRef.current
      && isSameRepoPath(current.repoPath, stateRef.current.repoPath)
      && (concurrent ? stateRef.current.actionManager.savingTarget === target : isActiveOperationCurrent(operation.token));
    const finishSave = (updater: (state: AppState) => AppState): void => {
      if (!isSaveCurrent()) return;
      if (!concurrent) finishActiveOperation(operation.token, updater);
      else updateState((latest) => {
        const next = updater(latest);
        return { ...next, actionManager: { ...next.actionManager, savingTarget: null, concurrentSaveOperation: null } };
      });
    };

    try {
      const result = await window.githead.saveConfiguredActions({
        repoPath: current.repoPath,
        target,
        actions,
        operationId: operation.operationId
      });
      if (!isSaveCurrent()) {
        return;
      }
      if (result.exitCode !== 0) {
        finishSave((latest) => ({
          ...latest,
          actionManager: {
            ...latest.actionManager,
            error: result.stderr || "Unable to save repository actions."
          }
        }));
        return;
      }

      finishSave((latest) => ({
        ...latest,
        actionManager: {
          ...latest.actionManager,
          error: ""
        }
      }));
      void refreshRepo({ reason: "operation" });
    } catch (error) {
      if (!isSaveCurrent()) {
        return;
      }
      finishSave((latest) => ({
        ...latest,
        actionManager: {
          ...latest.actionManager,
          error: error instanceof Error ? error.message : "Unable to save repository actions."
        }
      }));
    }
  }, [createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, refreshRepo, updateState]);

  const runIndependentOperation = useCallback(async (
    label: string,
    operation: (operationId: string) => Promise<GitOperationResult>
  ): Promise<GitOperationResult> => {
    const repoPath = stateRef.current.repoPath;
    let result: GitOperationResult;
    try {
      result = await operation(createRendererOperationId(++rendererOperationTokenRef.current));
    } catch (error) {
      result = { repoPath, exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : `${label} failed.` };
    }
    appendOperationLog(label, result);
    if (isSameRepoPath(repoPath, stateRef.current.repoPath) && !isOperationRunning(stateRef.current)) {
      updateState({ lastOperationResult: result });
    }
    return result;
  }, [appendOperationLog, updateState]);

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
    if (!isInvocationCurrent(repoPath, (latest) => latest.worktreeDialogOpen)) return "The active repository changed. Reopen Add worktree and try again.";
    const result = await runRepoOperation("Creating worktree", undefined, (operationId) => window.githead.createWorktree({ ...request, repoPath, operationId } as GitWorktreeCreateRequest & { operationId: string }));
    if (!result) return "Another repository operation is already running.";
    if (result.exitCode !== 0) {
      await loadRepositoryGroups();
      return result.errorKind === "cancelled"
        ? "Worktree creation was cancelled. Check the destination before retrying. Git may have left a folder or created the branch."
        : result.stderr || "Unable to create worktree.";
    }
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return "The active repository changed. Reopen Add worktree and try again.";
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
    if (!(await ensureTrustedRepo(repoPath))) return;
    if (!isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
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
  }, [ensureTrustedRepo, updateState]);

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
    if (!current.summary?.isValid || !current.summary.capabilities.manageRemotes) {
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
      return "The active repository changed. Reopen Manage remotes and try again.";
    }
    setRemoteMutationRunning(true);
    try {
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
    } finally {
      setRemoteMutationRunning(false);
    }
  }, [ensureTrustedRepo, loadRemoteConfigs, runRepoOperation]);

  const showRecentRepositoryInExplorer = useCallback(async (repoPath: string): Promise<void> => {
    await runIndependentOperation("Showing repository in Explorer", () => window.githead.showRepositoryInExplorer(repoPath));
  }, [runIndependentOperation]);

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
    if (!current.summary?.isValid) return;
    updateState({ branchManagerOpen: true });
  }, [updateState]);

  const closeBranchManager = useCallback((): void => {
    updateState({ branchManagerOpen: false });
  }, [updateState]);

  const runBranchOperation = useCallback(async (action: "rename" | "remove", label: string, branchName: string, operation: (repoPath: string, operationId: string) => Promise<GitOperationResult>): Promise<string | null> => {
    const snapshot = stateRef.current;
    const repoPath = snapshot.repoPath;
    if (!(await ensureTrustedRepo(repoPath))) return "Trust this workspace before changing branches.";
    const latest = stateRef.current;
    if (latest.repoPath !== repoPath || !latest.branchManagerOpen) return "The active repository changed. Reopen Manage branches and try again.";
    if (action === "remove" && latest.summary?.branch === branchName) return "Switch to another branch before removing this branch.";
    setBranchMutationRunning(true);
    try {
      const result = await runRepoOperation(label, undefined, (operationId) => operation(repoPath, operationId));
      if (!result) return "Another repository operation is already running.";
      if (result.exitCode === 0) return null;
      if (action === "remove" && /not fully merged/i.test(result.stderr)) {
        return "This branch has commits that haven’t been merged. Merge them into another branch before deleting it.";
      }
      return result.stderr.trim() || `${label} failed.`;
    } finally {
      setBranchMutationRunning(false);
    }
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

  const openTagCheckout = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || current.summary.kind !== "git" || isOperationRunning(current)) return;
    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath)) || !isInvocationCurrent(repoPath)) return;
    updateState({ tagCheckoutOpen: true });
  }, [ensureTrustedRepo, isInvocationCurrent, updateState]);

  const checkoutTag = useCallback(async (request: GitTagCheckoutRequest): Promise<string | null> => {
    const current = stateRef.current;
    if (!isSameRepoPath(request.repoPath, current.repoPath) || !current.tagCheckoutOpen || isOperationRunning(current)) return "The repository changed or is busy. Try again.";
    if (!(await ensureTrustedRepo(request.repoPath)) || !isInvocationCurrent(request.repoPath)) return "Repository is no longer available.";
    const result = await runRepoOperation(`Checking out tag ${request.tagName}`, null, (operationId) =>
      window.githead.checkoutTag({ ...request, operationId }));
    if (result?.exitCode !== 0) return getOperationFailureMessage(result, "Unable to check out tag.");
    if (isSameRepoPath(request.repoPath, stateRef.current.repoPath)) updateState({ tagCheckoutOpen: false });
    return null;
  }, [ensureTrustedRepo, isInvocationCurrent, runRepoOperation, updateState]);

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
        runId: activeOperation.operationId,
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
  }, [activityLogStore, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, isInvocationCurrent, refreshRepo, updateState]);

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
    const saved = loadPullRequestDraft(current.repoPath, summary.branch);
    updateState({
      createPrDialog: {
        ...emptyCreatePrDialog,
        open: true,
        repoPath: current.repoPath,
        templatesLoading: true,
        applyDefaultTemplate: !saved,
        headBranch: summary.branch,
        title: latestCommitSubject || summary.branch,
        baseBranch: defaultBranch?.branch ?? "",
        ...saved,
        ...(saved?.outcomeUnknown ? {
          error: "A previous creation may have reached GitHub. Check Pull Requests before retrying.",
          failure: { kind: "unexpected" as const, message: "Previous creation outcome unknown.", retryable: false, retryAfterAt: null, outcomeUnknown: true, source: "combined" as const, rateLimit: null }
        } : {})
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

    if (!dialog.open || dialog.templatesLoading || dialog.generating !== null || dialog.step !== "idle" || isOperationRunning(current)) {
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
        ...(dialog.body ? { currentBody: dialog.body } : {}),
        ...(dialog.templateId ? { template: dialog.templates.find((template) => template.id === dialog.templateId)?.body ?? "" } : {}),
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
              body: result.stdout.trim(),
              undoBody: dialog.body,
              applyDefaultTemplate: false
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

    if (!dialog.open || dialog.templatesLoading || dialog.generating !== null || dialog.step !== "idle" || isOperationRunning(current)) {
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

    if (!dialog.open || dialog.templatesLoading || dialog.step !== "idle" || dialog.generating !== null || isOperationRunning(current)) {
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
        activityLogStore.appendOperationResult(needsPublish ? "Publish" : "Push", { repoPath, exitCode: -1, stdout: "", stderr: message });
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

      removePullRequestDraft(repoPath, dialog.headBranch);
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
  }, [activityLogStore, createActiveOperation, ensureTrustedRepo, finishActiveOperation, github, isActiveOperationCurrent, isInvocationCurrent, refreshRepo, updateState]);

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

  const applySelectedHunk = useCallback(async (patch: string, discard = false): Promise<void> => {
    const current = stateRef.current;
    const selection = current.selection;
    if (!selection || current.diffChanged || (discard && selection.side !== "unstaged")) {
      return;
    }
    const repoPath = current.repoPath;
    const follow = { repoPath, selection };
    hunkSelectionFollowRef.current = follow;
    let nextSelection: FileSelection | null;
    try {
      const result = discard
        ? await runRepoOperation("Reverting hunk", selection, (operationId) =>
            window.githead.discardHunk({ repoPath, path: selection.path, side: selection.side, patch, operationId })
          )
        : selection.side === "unstaged"
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
      nextSelection = resolvePostHunkSelection(stateRef.current.summary, selection);
      updateState({
        selection: nextSelection,
        diff: null,
        diffChanged: false
      });
    } finally {
      if (hunkSelectionFollowRef.current === follow) hunkSelectionFollowRef.current = null;
    }

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

  const commitStagedChanges = useCallback((
    repoPath: string,
    message: string,
    operationId: string
  ): Promise<GitOperationResult | GitCommitWithRemoteCheckResult> => {
    const current = stateRef.current;
    const requireRemoteCheck = isSameRepoPath(repoPath, current.repoPath)
      && current.summary?.kind === "git"
      && current.appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit === true;
    return requireRemoteCheck
      ? window.githead.commitWithRemoteCheck({ repoPath, message, operationId })
      : window.githead.commitChanges({ repoPath, message, operationId });
  }, []);

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
      (operationId) => commitStagedChanges(repoPath, message, operationId),
      { successFeedback: { action: "commit", surface: "commit-panel" } }
    ) as GitOperationResult | GitCommitWithRemoteCheckResult | null;

    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return null;
    }

    if (result.exitCode === 0) {
      updateState({
        commitMessage: "",
        commitMessageSuggestion: null,
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
  }, [commitStagedChanges, ensureTrustedRepo, isInvocationCurrent, openGitIdentityPrompt, runRepoOperation, updateState]);

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
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return null;
    if (isOperationRunning(stateRef.current)) return null;
    const activeOperation = createActiveOperation("Generating commit plan", repoPath, "repo-operation");
    updateState({
      activeOperation,
      runningOperation: "Generating commit plan",
      lastOperationResult: null
    });

    try {
      const generated = await window.githead.generateCommitPlan({
        repoPath,
        paths,
        operationId: activeOperation.operationId
      });
      if (!isActiveOperationCurrent(activeOperation.token) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      if (stateRef.current.activeOperation?.cancelStatus === "canceling") {
        updateState({ lastOperationResult: null });
        return null;
      }

      const operationResult: GitOperationResult = {
        repoPath,
        exitCode: generated.exitCode,
        stdout: "",
        stderr: generated.stderr
      };
      updateState({ lastOperationResult: operationResult });
      appendOperationLog("Generating commit plan", operationResult);
      return generated;
    } catch (error) {
      if (!isActiveOperationCurrent(activeOperation.token) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return null;
      }
      if (stateRef.current.activeOperation?.cancelStatus === "canceling") {
        updateState({ lastOperationResult: null });
        return null;
      }

      const operationResult: GitOperationResult = {
        repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unable to generate a commit plan."
      };
      updateState({ lastOperationResult: operationResult });
      appendOperationLog("Generating commit plan", operationResult);
      return null;
    } finally {
      finishActiveOperation(activeOperation.token);
    }
  }, [appendOperationLog, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, updateState]);

  const validateCommitPlan = useCallback(async (request: CommitPlanValidationRequest): Promise<CommitPlanValidationResult> => {
    cancelRepositoryRead("commit-plan-validation", requestIds.current.commitPlanValidation);
    const generation = requestIds.current.commitPlanValidation + 1;
    requestIds.current.commitPlanValidation = generation;
    return window.githead.validateCommitPlan({
      ...request,
      requestId: repositoryReadRequestId("commit-plan-validation", generation)
    });
  }, []);

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

  const quickCommitSelectedFiles = useCallback(async (paths: string[]): Promise<void> => {
    const current = stateRef.current;
    if (isOperationRunning(current) || getQuickCommitDisabledReason(current.summary, paths, canUseSelectedAiProvider(current.aiSettings))) return;
    const repoPath = current.repoPath;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    const latest = stateRef.current;
    const namespace = getRepoPathKey(repoPath) || "setup";
    const currentPaths = getQuickCommitSelectionPaths(
      latest.summary, latest.selection,
      workspacePanelStateStore.read(namespace, "status-file-query", ""),
      workspacePanelStateStore.read<StatusFileFilter>(namespace, "status-file-filter", "all")
    );
    if (!areStringArraysEqual(paths, currentPaths) || getQuickCommitDisabledReason(latest.summary, paths, canUseSelectedAiProvider(latest.aiSettings))) return;
    const result = await runRepoOperation("Generating quick commit message", null,
      (operationId) => window.githead.generateAndCommit({ repoPath, paths, operationId }),
      { successFeedback: { action: "commit", surface: "commit-panel" } }
    );
    if (!result || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    if (result.exitCode !== 0 && "generatedMessage" in result && typeof result.generatedMessage === "string") {
      updateState({ commitMessageSuggestion: { message: result.generatedMessage, reason: "quick-commit-failed" } });
      if (result.errorKind === "missing-author-identity") await openGitIdentityPrompt(repoPath, result.generatedMessage);
    }
  }, [ensureTrustedRepo, openGitIdentityPrompt, runRepoOperation, updateState, workspacePanelStateStore]);

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
      updateState({ commitMessage: "", commitMessageSuggestion: null, commitPushSafetyNotice: null });
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
      ...(result.push?.branchSucceeded ? { commitMessage: "", commitMessageSuggestion: null } : {}),
      commitPushSafetyNotice: result.push?.partialSuccess
        ? null
        : {
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
    if (!(await ensureTrustedRepo(current.repoPath)) || !isSameRepoPath(current.repoPath, stateRef.current.repoPath)) {
      return false;
    }

    const activeOperation = createActiveOperation(
      "Generating commit message",
      current.repoPath,
      "repo-operation"
    );
    const startingCommitMessage = stateRef.current.commitMessage;
    updateState({
      activeOperation,
      runningOperation: "Generating commit message",
      lastOperationResult: null,
      commitMessageSuggestion: null,
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
      if (stateRef.current.activeOperation?.cancelStatus === "canceling") {
        updateState({
          lastOperationResult: null,
          commitMessageGenerationError: ""
        });
        return false;
      }
      const generatedMessage = result.exitCode === 0 ? result.stdout.trim() : "";
      const repositoryChanged = result.sourceChanged === true;
      updateState((latest) => ({
        ...latest,
        lastOperationResult: result.exitCode === 0
          ? {
              ...result,
              stdout: "Commit message generated."
            }
          : result,
        ...(result.exitCode === 0 && latest.commitMessage === startingCommitMessage && !repositoryChanged
          ? { commitMessage: generatedMessage, commitMessageSuggestion: null }
          : result.exitCode === 0
            ? {
                commitMessageSuggestion: {
                  message: generatedMessage,
                  reason: repositoryChanged ? "repository-changed" : "draft-changed"
                }
              }
            : {}),
        commitMessageGenerationError: result.exitCode === 0
          ? ""
          : result.stderr.trim() || "Unable to generate a commit message."
      }));
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
      if (stateRef.current.activeOperation?.cancelStatus === "canceling") {
        updateState({
          lastOperationResult: null,
          commitMessageGenerationError: ""
        });
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
  }, [appendOperationLog, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, updateState]);

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
    if (!(await ensureTrustedRepo(current.repoPath)) || !isSameRepoPath(current.repoPath, stateRef.current.repoPath)) {
      return failure("Repository trust is required before generating a stash message.");
    }

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
  }, [appendOperationLog, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, updateState]);

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
        const result = await window.githead.pollGitHubDeviceFlow({ flowId: flow.flowId });
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
        visualEffects: appSettings?.visualEffects ?? defaultVisualPreferences.visualEffects,
        reduceMotion: appSettings?.reduceMotion ?? defaultVisualPreferences.reduceMotion,
        uiFont: appSettings?.uiFont ?? DEFAULT_UI_FONT,
        codeFont: appSettings?.codeFont ?? DEFAULT_CODE_FONT,
        zoomFactor: appSettings?.zoomFactor ?? 1,
        tagPushBehavior: appSettings?.gitBehaviors?.tagPushBehavior ?? DEFAULT_TAG_PUSH_BEHAVIOR,
        requireUpToDateUpstreamBeforeCommit: appSettings?.gitBehaviors?.requireUpToDateUpstreamBeforeCommit ?? false,
        quickCommitByDefault: appSettings?.gitBehaviors?.quickCommitByDefault ?? false,
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
    const concurrent = isOperationRunning(initial);
    const saveToken = ++settingsSaveTokenRef.current;
    if (concurrent && hasGitIdentityChanges(draft, initial.gitIdentity)) {
      updateState({ settingsError: "Wait for the current operation to finish before changing Git identity." });
      return;
    }
    // Settings can remain in renderer-only preflight and preference writes for
    // their full lifetime, so the repository coordinator cannot track them.
    const operation = createActiveOperation("Saving settings", repoPath, "settings-save", {
      coordinated: false
    });
    updateState({
      ...(!concurrent ? { activeOperation: operation } : {}),
      settingsError: "",
      settingsSaving: true
    });

    const isSaveCurrent = (): boolean => (
      saveToken === settingsSaveTokenRef.current &&
      (concurrent ? stateRef.current.settingsSaving : isActiveOperationCurrent(operation.token)) &&
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
          visualEffects: draft.visualEffects,
          reduceMotion: draft.reduceMotion,
          uiFont: draft.uiFont,
          codeFont: draft.codeFont,
          zoomFactor: draft.zoomFactor,
          statusFileViewMode: initial.appSettings?.statusFileViewMode ?? "list",
          wrapDiffLines: initial.appSettings?.wrapDiffLines ?? false,
          gitBehaviors: {
            tagPushBehavior: draft.tagPushBehavior,
            requireUpToDateUpstreamBeforeCommit: draft.requireUpToDateUpstreamBeforeCommit,
            quickCommitByDefault: draft.quickCommitByDefault,
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
      if (concurrent) {
        if (isSaveCurrent()) updateState({ settingsSaving: false });
      } else finishActiveOperation(operation.token);
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

      const result = await runRepoOperation(
        "Committing changes",
        null,
        (operationId) => commitStagedChanges(repoPath, retryMessage, operationId)
      );

      if (result?.exitCode === 0) {
        updateState({
          commitMessage: "",
          commitMessageSuggestion: null
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
  }, [commitStagedChanges, createActiveOperation, ensureTrustedRepo, finishActiveOperation, isActiveOperationCurrent, isInvocationCurrent, runRepoOperation, updateState]);

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
    if (view === "analytics" && !stateRef.current.summary?.capabilities.analytics) {
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
    if (view === "history" && latest.historyRoute.kind === "file") {
      if (!latest.fileHistoryLoading && latest.fileHistoryEntries.length === 0) void loadFileHistory(latest.historyRoute.origin);
    } else if (view === "history" && latest.historyRoute.kind === "blame") {
      if (!latest.fileBlameLoading && !latest.fileBlame) void loadFileBlame(latest.historyRoute.target, latest.historyRoute.returnTo);
    } else if (view === "history" && !latest.historyLoading) {
      if (
        latest.selectedCommitHash &&
        latest.commitDetails?.hash !== latest.selectedCommitHash &&
        !latest.commitDetailsLoading
      ) {
        void loadCommitDetails(latest.selectedCommitHash);
      }
      // Consume an idle preload once. Reopening the tab still refreshes it.
      const hasPreloadedHistory = latest.historyLoaded && preloadedHistoryRequestId.current === requestIds.current.history;
      preloadedHistoryRequestId.current = null;
      if (!hasPreloadedHistory) void loadCommitHistory(true);
    }
    if (view === "stashes") void stashWorkspace.refresh();
    if (view === "workflows") void github.ensure("workflowRuns");
    if (view === "pullRequests") void github.ensure("pullRequests");
    if (view === "issues") void github.ensure("issues");
  }, [activityLogStore, github.ensure, loadCommitDetails, loadCommitHistory, loadFileBlame, loadFileHistory, refreshDirtyFileStatus, stashWorkspace.refresh, updateState]);

  /** Empties the guest slot. A guest that is the active view hands over to Changes first. */
  const closeGuestView = useCallback((): void => {
    const current = stateRef.current;
    if (current.guestView && current.activeView === current.guestView) setWorkspaceView("status");
    updateState({ guestView: null });
  }, [setWorkspaceView, updateState]);

  const openAnalyticsFileHistory = useCallback((path: string, headHash: string): void => {
    if (!stateRef.current.summary?.capabilities.fileHistory) return;
    void loadFileHistory({ hash: headHash, path, status: "M" });
  }, [loadFileHistory]);

  const openWorkflowRunsForBranch = useCallback((branch: string): void => {
    setWorkflowSearch("");
    setWorkflowPreset("custom");
    setWorkflowQuery({ ...DEFAULT_WORKFLOW_QUERY, branch });
    setWorkspaceView("workflows");
  }, [setWorkspaceView]);

  const restoreWorkspaceLocation = useCallback((location: WorkspaceLocation): void => {
    const previous = stateRef.current;
    const changingRepositories = !isSameRepoPath(previous.repoPath, location.repoPath);
    const restoreHistory = (): void => {
      const latest = stateRef.current;
      if (!isSameRepoPath(latest.repoPath, location.repoPath)
        || latest.activeView !== location.activeView || latest.historyRoute !== location.historyRoute) return;
      if (location.activeView !== "history") return;
      if (location.historyRoute.kind === "file") {
        const origin = location.historyRoute.origin;
        if (!changingRepositories && previous.fileHistoryOrigin?.hash === origin.hash
          && previous.fileHistoryOrigin.path === origin.path && previous.fileHistoryEntries.length > 0) {
          const selected = previous.fileHistoryEntries.find((entry) => entry.hash === previous.selectedFileHistoryHash);
          if (selected && (!previous.fileHistoryDiff || previous.fileHistoryDiffLoading)) void loadFileHistoryDiff(selected);
          return;
        }
        void loadFileHistory(origin);
      } else if (location.historyRoute.kind === "blame") {
        void loadFileBlame(location.historyRoute.target, location.historyRoute.returnTo);
      } else if (location.selectedCommitHash) {
        if (latest.commitDetails?.hash !== location.selectedCommitHash && !latest.commitDetailsLoading) {
          void loadCommitDetails(location.selectedCommitHash);
        } else if (latest.commitDetails?.hash === location.selectedCommitHash
          && location.selectedCommitFilePath && previous.selectedCommitFilePath !== location.selectedCommitFilePath) {
          void loadCommitFileDiff(location.selectedCommitHash, location.selectedCommitFilePath);
        }
      }
    };
    if (changingRepositories) {
      activityLogStore.setViewing(location.activeView === "activity");
      void switchRepo(location.repoPath, { location }).then(restoreHistory);
      return;
    }
    cancelRepositoryRead("file-history", requestIds.current.fileHistory);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    requestIds.current.fileHistory += 1;
    requestIds.current.fileHistoryDiff += 1;
    requestIds.current.fileBlame += 1;
    const commitChanged = previous.selectedCommitHash !== location.selectedCommitHash;
    const commitFileChanged = commitChanged || previous.selectedCommitFilePath !== location.selectedCommitFilePath;
    const fileHistoryChanged = previous.fileHistoryOrigin?.hash !== location.fileHistoryOrigin?.hash
      || previous.fileHistoryOrigin?.path !== location.fileHistoryOrigin?.path;
    if (commitChanged) {
      invalidateCommitDetailReads();
    } else if (commitFileChanged) {
      cancelRepositoryRead("commit-file-diff", requestIds.current.commitFileDiff);
      requestIds.current.commitFileDiff += 1;
    }
    updateState({
      historyRoute: location.historyRoute,
      fileHistoryOrigin: location.fileHistoryOrigin,
      selectedCommitHash: location.selectedCommitHash,
      selectedCommitFilePath: location.selectedCommitFilePath,
      fileHistoryLoading: false,
      fileHistoryDiffLoading: false,
      fileBlameLoading: false,
      // The saved origin is navigation context. Cached rows and diffs must not
      // acquire that origin unless they were loaded for the same file version.
      ...(fileHistoryChanged ? {
        fileHistoryEntries: [],
        fileHistoryError: "",
        fileHistoryHasMore: false,
        selectedFileHistoryHash: null,
        fileHistoryDiff: null,
        fileHistoryDiffError: ""
      } : {}),
      ...(commitChanged ? { commitDetails: null, commitDetailsLoading: false, commitDetailsError: "" } : {}),
      ...(commitFileChanged ? { commitFileDiff: null, commitFileDiffLoading: false, commitFileDiffError: "" } : {})
    });
    setWorkspaceView(location.activeView);
    restoreHistory();
  }, [activityLogStore, invalidateCommitDetailReads, loadCommitDetails, loadCommitFileDiff, loadFileBlame, loadFileHistory, loadFileHistoryDiff, setWorkspaceView, switchRepo, updateState]);

  const workspaceLocation: WorkspaceLocation = {
    repoPath: state.repoPath,
    activeView: state.activeView,
    historyRoute: state.historyRoute,
    fileHistoryOrigin: state.fileHistoryOrigin,
    selectedCommitHash: state.selectedCommitHash,
    selectedCommitFilePath: state.selectedCommitFilePath
  };
  const navigation = useWorkspaceNavigation(
    state.startupStatus === "ready" && state.repoPath && !state.showSetup ? workspaceLocation : null,
    restoreWorkspaceLocation
  );

  useEffect(() => {
    if (
      state.activeView !== "stashes" ||
      stashWorkspace.state.loadedRepoPath !== state.repoPath ||
      stashWorkspace.state.loading ||
      stashWorkspace.state.error ||
      stashWorkspace.state.entries.length > 0
    ) {
      return;
    }

    closeGuestView();
  }, [
    closeGuestView,
    stashWorkspace.state.entries.length,
    stashWorkspace.state.loadedRepoPath,
    stashWorkspace.state.loading,
    stashWorkspace.state.error,
    state.activeView,
    state.repoPath
  ]);

  const selectFile = useCallback((file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers): void => {
    const availableFiles = getFilesForSide(stateRef.current.summary, side);
    const filesByPath = modifiers.orderedPaths ? new Map(availableFiles.map((candidate) => [candidate.path, candidate])) : null;
    const selection = buildFileSelection(
      stateRef.current.selection,
      filesByPath && modifiers.orderedPaths
        ? modifiers.orderedPaths.flatMap((path) => { const candidate = filesByPath.get(path); return candidate ? [candidate] : []; })
        : availableFiles,
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
    if (!(await ensureTrustedRepo(request.repoPath))) {
      return "Repository trust is required before saving and staging a conflict resolution.";
    }
    const result = await runRepoOperation(`Resolving ${request.path}`, undefined, (operationId) =>
      window.githead.saveConflictResolution({ ...request, operationId }));
    if (!result || result.exitCode !== 0) {
      return getOperationFailureMessage(result, "Unable to save and stage the conflict resolution.");
    }
    return null;
  }, [ensureTrustedRepo, runRepoOperation]);

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

  const copyCommitShaToClipboard = useCallback(async (commit: Pick<GitCommitGraphRow, "hash">): Promise<void> => {
    await runIndependentOperation("Copying commit SHA", () => window.githead.copyCommitShaToClipboard({
      repoPath: stateRef.current.repoPath,
      hash: commit.hash
    }));
  }, [runIndependentOperation]);

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
      void runIndependentOperation("Opening current file version", () =>
        window.githead.openFile({
          repoPath,
          path: file.path
        })
      );
      return;
    }

    if (action === "open-selected") {
      void runIndependentOperation("Opening selected file version", (operationId) =>
        window.githead.openCommitFileVersion({
          repoPath,
          hash,
          path: file.path,
          operationId
        })
      );
      return;
    }

    void runIndependentOperation("Copying path", () =>
      window.githead.copyPathToClipboard({
        repoPath,
        path: file.path
      })
    );
  }, [loadFileBlame, loadFileHistory, openResetCommitFileDialog, runIndependentOperation, selectCommitFile]);

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
    explicitPaths?: string[],
    expectedSnapshot?: string
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
        if (isOperationRunning(stateRef.current)) return;
        await switchRepo(`${repoPath.replace(/[\\/]+$/, "")}/${file.path}`, { addToRecents: true });
        return;
      }
      await runIndependentOperation("Opening file", () =>
        window.githead.openFile({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "show") {
      await runIndependentOperation("Showing file in Explorer", () =>
        window.githead.showInExplorer({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "copy") {
      await runIndependentOperation("Copying path", () =>
        window.githead.copyPathToClipboard({
          repoPath,
          path: file.path
        })
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
          ...(expectedSnapshot === undefined ? {} : { expectedSnapshot }),
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
  }, [runIndependentOperation, runRepoOperation, stageFiles, switchRepo, unstageFiles]);
  // Stable, so that the memoised file lists skip a render when only the commit box changed.
  const stageStatusFiles = useCallback((paths: string[], selection?: FileSelection): void => {
    void stageFiles(paths, selection);
  }, [stageFiles]);
  const unstageStatusFiles = useCallback((paths: string[], selection?: FileSelection): void => {
    void unstageFiles(paths, selection);
  }, [unstageFiles]);
  const runStatusFileContextAction = useCallback((
    file: GitStatusFile,
    side: GitDiffSide,
    kind: ContextActionKind,
    paths?: string[],
    expectedSnapshot?: string
  ): void => {
    void runContextFileOperation(file, side, kind, paths, expectedSnapshot);
  }, [runContextFileOperation]);

  const updateSubmodules = useCallback(async (path?: string): Promise<void> => {
    const repoPath = stateRef.current.repoPath;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    await runRepoOperation(path ? `Updating submodule ${path}` : "Updating submodules", undefined, (operationId) =>
      window.githead.updateSubmodules({ repoPath, ...(path ? { path } : {}), operationId })
    );
  }, [ensureTrustedRepo, runRepoOperation]);

  const syncSubmodules = useCallback(async (): Promise<void> => {
    const repoPath = stateRef.current.repoPath;
    if (!(await ensureTrustedRepo(repoPath)) || !isSameRepoPath(repoPath, stateRef.current.repoPath)) return;
    await runRepoOperation("Synchronizing submodule URLs", undefined, (operationId) =>
      window.githead.syncSubmodules({ repoPath, operationId })
    );
  }, [ensureTrustedRepo, runRepoOperation]);

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
    onCancelledOrMissing?: () => void
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
        onCancelledOrMissing?.();
        return;
      }

      if (result.state === "not-found") {
        recoverMissingOperations([target.operationId]);
        onCancelledOrMissing?.();
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
  const pendingFileCount = state.summary?.files.length ?? 0;
  const running = isOperationRunning(state);
  const isValid = state.summary?.isValid ?? false;
  const disableActions = running || !isValid;
  const repositoryOperationActive = Boolean(state.summary?.operationState);
  const disableUnrelatedMutations = disableActions || repositoryOperationActive;
  const primaryCommitAction = getPrimaryCommitAction(state.summary, state.appSettings?.gitBehaviors?.quickCommitByDefault);
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
  const showAnalyticsTab = Boolean(state.summary?.isValid && state.summary.capabilities.analytics);
  // The stashes panel stays mounted while it holds the guest slot, even when it is not the active view.
  const showStashesTab = Boolean(
    state.summary?.capabilities.stashes
      && (stashWorkspace.state.entries.length > 0 || state.activeView === "stashes" || state.guestView === "stashes")
  );
  const selectedStashFile = stashWorkspace.state.details?.files.find((file) => file.path === stashWorkspace.state.selectedFilePath) ?? null;
  const pullRequestTabCount = github.counts.data ? formatCompactCount(github.counts.data.pullRequests) : null;
  const issueTabCount = github.counts.data ? formatCompactCount(github.counts.data.issues) : null;
  const activityLogAttentionState = state.activeView === "activity" ? "none" : activityLogAttention;

  const [quickSwitcherMode, setQuickSwitcherMode] = useState<QuickSwitcherMode | null>(null);
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState("");
  const [showHiddenRepositories, setShowHiddenRepositories] = useState(false);
  const pendingSwitcherNavigationRef = useRef<"back" | "forward" | null>(null);
  // Set when the chosen switcher item changes the view, so focus lands on the active tab instead of the opener.
  const switcherFocusesViewRef = useRef(false);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const repositoryOrganization = useRepositoryOrganization();
  const workspaceRoute = state.startupStatus === "ready" && Boolean(state.repoPath) && !state.showSetup
    && state.gitExecutableStatus?.available !== false;
  const quickSwitcherSearching = quickSwitcherQuery.trim().length > 0;

  /** Opens the switcher in a mode, or changes the mode of the open switcher, with an empty query. */
  const openQuickSwitcher = useCallback((mode: QuickSwitcherMode): void => {
    switcherFocusesViewRef.current = false;
    setQuickSwitcherQuery("");
    setQuickSwitcherMode(mode);
  }, []);

  const closeQuickSwitcher = useCallback((): void => {
    setQuickSwitcherMode(null);
    setQuickSwitcherQuery("");
  }, []);

  // Leaving the workspace (setup screen, Git missing) closes the switcher so it never reappears on return.
  useEffect(() => {
    if (!workspaceRoute) closeQuickSwitcher();
  }, [closeQuickSwitcher, workspaceRoute]);

  const removeRepositoryFromSwitcher = useCallback((repoPath: string): void => {
    void removeRecentRepo(repoPath);
  }, [removeRecentRepo]);
  const showRepositoryInExplorerFromSwitcher = useCallback((repoPath: string): void => {
    void showRecentRepositoryInExplorer(repoPath);
  }, [showRecentRepositoryInExplorer]);
  const removeWorktreeFromSwitcher = useCallback((worktree: GitWorktree): void => {
    void openWorktreeRemoval(worktree);
  }, [openWorktreeRemoval]);
  const reorderRepositoriesFromSwitcher = useCallback((repoPaths: string[]): void => {
    void reorderRepositories(repoPaths);
  }, [reorderRepositories]);

  // Row actions of the switcher's repository rows. Their dialogs mount beside the workspace dialogs, never inside the
  // switcher, and every action that opens one closes the switcher first.
  const switcherRepositoryActions = useRepositoryRowActions({
    repoPaths: state.repoRecents,
    activeRepoPath: state.repoPath,
    disabled: running || repositoryOperationActive,
    organization: repositoryOrganization,
    onRemove: removeRepositoryFromSwitcher,
    onRecover: recoverRecentRepo,
    onShowInExplorer: showRepositoryInExplorerFromSwitcher,
    onOpenRepositorySettings: setRepositorySettingsPath,
    onRemoveWorktree: removeWorktreeFromSwitcher,
    onReorder: reorderRepositoriesFromSwitcher,
    onBeforeOpen: closeQuickSwitcher
  });
  const { renderMenuItems: renderSwitcherRepositoryMenuItems, openRecovery: openSwitcherRepositoryRecovery, openOrganizer: openSwitcherRepositoryOrganizer } = switcherRepositoryActions;

  // Sections are built only while the switcher is open.
  // The view switch's + menu lists the same views as the quick switcher's Go to section.
  const addViewOptions = useMemo((): AddViewOption[] => buildGoToItems({
    summary: state.summary,
    stashCount: stashWorkspace.state.entries.length,
    pullRequestCount: pullRequestTabCount,
    issueCount: issueTabCount,
    activityAttention: activityLogAttentionState,
    activeView: state.activeView
  }).flatMap((item) => item.kind === "view" && isGuestView(item.payload.view)
    ? [{ view: item.payload.view, title: item.title, label: item.label, meta: item.meta }]
    : []), [activityLogAttentionState, issueTabCount, pullRequestTabCount, stashWorkspace.state.entries.length, state.activeView, state.summary]);
  const openGuestView = useCallback((view: GuestView): void => setWorkspaceView(view), [setWorkspaceView]);

  const quickSwitcherSections = useMemo(() => quickSwitcherMode ? buildQuickSwitcherSections(quickSwitcherMode, {
    repoPath: state.repoPath,
    repoRecents: state.repoRecents,
    repositoryGroups: state.repositoryGroups,
    organization: repositoryOrganization.organization,
    repoSyncStatuses: state.repoSyncStatuses,
    showHidden: showHiddenRepositories,
    searching: quickSwitcherSearching,
    running,
    summary: state.summary,
    stashCount: stashWorkspace.state.entries.length,
    pullRequestCount: pullRequestTabCount,
    issueCount: issueTabCount,
    activityAttention: activityLogAttentionState,
    activeView: state.activeView,
    branchPullRequests: historyInsights.currentBranchPullRequests,
    hasPullRequestData: historyInsights.branchPullRequestsLoaded,
    appUpdate: state.appUpdate,
    canGoBack: navigation.canGoBack,
    canGoForward: navigation.canGoForward
  }) : null, [
    activityLogAttentionState,
    historyInsights.currentBranchPullRequests,
    historyInsights.branchPullRequestsLoaded,
    issueTabCount,
    navigation.canGoBack,
    navigation.canGoForward,
    pullRequestTabCount,
    quickSwitcherMode,
    quickSwitcherSearching,
    repositoryOrganization.organization,
    running,
    showHiddenRepositories,
    stashWorkspace.state.entries.length,
    state.activeView,
    state.appUpdate,
    state.repoPath,
    state.repoRecents,
    state.repoSyncStatuses,
    state.repositoryGroups,
    state.summary
  ]);

  // useWorkspaceNavigation reverts history moves while a dialog is open, so Go back and Go forward wait until the
  // switcher has unmounted.
  useEffect(() => {
    if (quickSwitcherMode !== null) return;
    const direction = pendingSwitcherNavigationRef.current;
    if (!direction) return;
    pendingSwitcherNavigationRef.current = null;
    if (direction === "back") navigationRef.current.back();
    else navigationRef.current.forward();
  }, [quickSwitcherMode]);

  const runQuickSwitcherItem = useCallback((item: QuickSwitcherItem): void => {
    if (item.disabled) return;
    // These items change the switcher itself and keep it open.
    if (item.kind === "notice") return;
    if (item.kind === "toggle-hidden-repositories") {
      setShowHiddenRepositories(item.payload.showHidden);
      return;
    }
    if (item.kind === "branch-action" && item.payload.action === "change-upstream") {
      openQuickSwitcher("upstream");
      return;
    }
    if (item.kind === "upstream") {
      // The switcher stays open so a failure shows in it, and closes once the upstream changed.
      void setBranchUpstream(item.payload.upstream).then(() => {
        if (!stateRef.current.upstreamError) setQuickSwitcherMode((mode) => mode === "upstream" ? null : mode);
      });
      return;
    }

    // Everything else closes the switcher before it opens a dialog, a view or another repository.
    closeQuickSwitcher();
    switch (item.kind) {
      case "repository":
        void selectRecentRepo(item.payload.path);
        return;
      case "repair":
        openSwitcherRepositoryRecovery(item.payload.path, item.payload.reason);
        return;
      case "add-repository":
        setClonePanelOpen(true);
        return;
      case "organize-repositories":
        openSwitcherRepositoryOrganizer();
        return;
      case "branch": {
        const choice = item.payload.choice;
        if (choice?.kind === "switch") void switchBranch(choice.branchName);
        else if (choice?.kind === "open-worktree") void selectRecentRepo(choice.worktreePath);
        else if (choice?.kind === "checkout-remote") checkoutRemoteBranch(choice.remoteBranch);
        return;
      }
      case "branch-action":
        switch (item.payload.action) {
          case "new-branch":
            openBranchDialog();
            return;
          case "merge":
            setIntegrationDialog({ kind: "merge" });
            return;
          case "rebase":
            setIntegrationDialog({ kind: "rebase" });
            return;
          case "checkout-tag":
            void openTagCheckout();
            return;
          case "add-worktree":
            openWorktreeDialog();
            return;
          case "manage-branches":
            openBranchManager();
            return;
          default:
            return;
        }
      case "open-remote":
        if (item.payload.url) openExternalUrl(item.payload.url);
        return;
      case "manage-remotes":
        openRemoteManager();
        return;
      case "repository-action":
        void runConfiguredAction(item.payload.action);
        return;
      case "view":
        switcherFocusesViewRef.current = true;
        setWorkspaceView(item.payload.view);
        return;
      case "settings":
        openSettingsDialog();
        return;
      case "open-pull-request":
        openExternalUrl(item.payload.pullRequest.url);
        return;
      case "create-pull-request":
        openCreatePrDialog();
        return;
      case "repository-settings":
        setRepositorySettingsPath(item.payload.path);
        return;
      case "app-update":
        if (item.payload.action === "check") void checkForAppUpdates();
        else if (item.payload.action === "download") void downloadAppUpdate();
        else if (confirmAppUpdateInstall()) void installAppUpdate();
        return;
      case "performance-diagnostics":
        setPerformanceDiagnosticsOpen(true);
        return;
      case "navigate":
        // Back and Forward change the view, so focus returns to the active tab instead of the opener.
        switcherFocusesViewRef.current = true;
        pendingSwitcherNavigationRef.current = item.payload.direction;
        return;
      case "manage-repository-actions":
        openActionManager();
        return;
      case "push-to-branch":
        openPushToBranchDialog();
        return;
      default:
        return;
    }
  }, [
    checkForAppUpdates,
    checkoutRemoteBranch,
    closeQuickSwitcher,
    downloadAppUpdate,
    installAppUpdate,
    openActionManager,
    openBranchDialog,
    openBranchManager,
    openCreatePrDialog,
    openExternalUrl,
    openPushToBranchDialog,
    openQuickSwitcher,
    openRemoteManager,
    openSettingsDialog,
    openSwitcherRepositoryOrganizer,
    openSwitcherRepositoryRecovery,
    openTagCheckout,
    openWorktreeDialog,
    runConfiguredAction,
    selectRecentRepo,
    setBranchUpstream,
    setClonePanelOpen,
    setWorkspaceView,
    switchBranch
  ]);

  const restoreQuickSwitcherFocus = useCallback(
    (): boolean => switcherFocusesViewRef.current && focusActiveViewTab(),
    []
  );

  const renderQuickSwitcherContextMenu = useCallback((item: QuickSwitcherItem, row: ReactElement): ReactNode => {
    if (item.kind !== "repository" && item.kind !== "repair") return row;
    const { menuPath, group, worktree } = item.payload;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-72">
          <ContextMenuLabel className="repo-recent-menu-path">{menuPath}</ContextMenuLabel>
          <ContextMenuSeparator />
          {renderSwitcherRepositoryMenuItems(menuPath, worktree
            ? { ...(group ? { group } : {}), worktree }
            : { ...(group ? { group } : {}), reorder: true })}
        </ContextMenuContent>
      </ContextMenu>
    );
  }, [renderSwitcherRepositoryMenuItems]);

  useAppShortcuts(workspaceRoute, {
    quickSwitcherOpen: quickSwitcherMode !== null,
    workspaceValid: Boolean(state.summary?.isValid),
    onToggleQuickSwitcher: () => {
      if (quickSwitcherMode !== null) closeQuickSwitcher();
      else openQuickSwitcher("all");
    },
    onCloseQuickSwitcher: closeQuickSwitcher,
    onOpenSettings: () => openSettingsDialog(),
    onNewBranch: openBranchDialog,
    onAddRepository: () => setClonePanelOpen(true)
  });

  const changeWorkspaceTab = useCallback((value: string): void => {
    setWorkspaceView(value as WorkspaceView);
  }, [setWorkspaceView]);
  const headerRepository = useMemo(
    () => getHeaderRepository(state.repoPath, state.repoRecents, state.repositoryGroups, repositoryOrganization.organization),
    [repositoryOrganization.organization, state.repoPath, state.repoRecents, state.repositoryGroups]
  );
  const renderHeaderRepositoryMenuItems = useCallback(
    (): ReactNode => renderSwitcherRepositoryMenuItems(headerRepository.menuPath, headerRepository.menuTarget),
    [headerRepository, renderSwitcherRepositoryMenuItems]
  );
  const headerGuestCount = state.guestView === "stashes"
    ? stashWorkspace.state.entries.length
    : state.guestView === "pullRequests"
      ? pullRequestTabCount
      : state.guestView === "issues" ? issueTabCount : null;
  const repoSwitcherRef = useRef<HTMLButtonElement>(null);
  const repositoryAdditionDisabled = running || repositoryOperationActive;
  const cloneCancelStatus = cloneCancellation?.cancelStatus ?? "idle";
  const cloneCancelError = cloneCancellation?.cancelError ?? "";
  const cancelCloneOperation = useCallback((): void => {
    const operation = stateRef.current.activeOperation;
    if (operation?.kind !== "clone" && operation?.kind !== "clone-check") return;
    void cancelRunningOperation({ kind: "active", token: operation.token, operationId: operation.operationId });
  }, [cancelRunningOperation]);
  const openLocalRepository = useCallback((path?: string): void => { void chooseRepo(path); }, [chooseRepo]);
  const connectGitHubFromOmnibox = useCallback((): void => {
    openSettingsDialog("integrations");
    void connectGitHub();
  }, [connectGitHub, openSettingsDialog]);
  const changeCloneSource = useCallback((draft: CloneDraft): void => {
    updateCloneDraft(draft);
    resetCloneCheckState();
  }, [resetCloneCheckState, updateCloneDraft]);
  const chooseCloneParentFromOmnibox = useCallback((): void => { void chooseCloneParent(); }, [chooseCloneParent]);
  const submitClone = useCallback((event: FormEvent<HTMLFormElement>, fork?: boolean): void => {
    event.preventDefault();
    void cloneRepository(fork);
  }, [cloneRepository]);
  // The add-repository popover opens below the repository switcher and returns focus to it. Its callbacks stay
  // stable, because the composer starts its automatic access check when they change.
  const wrapRepoSwitcher = useCallback((node: ReactNode): ReactNode => (
    <RepositoryOmnibox
      anchor={node}
      returnFocusRef={repoSwitcherRef}
      open={state.clonePanelOpen}
      disabled={repositoryAdditionDisabled}
      onOpenChange={setClonePanelOpen}
      onOpenLocal={openLocalRepository}
      onConnectGitHub={connectGitHubFromOmnibox}
      onAbandonCheck={abandonCloneCheck}
      cloneDraft={state.cloneDraft}
      cloneError={state.cloneError}
      cloneRunning={state.cloneRunning}
      cloneCheckRunning={state.cloneCheckRunning}
      cloneCheckStatus={state.cloneCheckStatus}
      cloneCheckMessage={state.cloneCheckMessage}
      cloneBranches={state.cloneBranches}
      cancelStatus={cloneCancelStatus}
      cancelError={cloneCancelError}
      onCloneDraftChange={updateCloneDraft}
      onCloneSourceChange={changeCloneSource}
      onChooseCloneParent={chooseCloneParentFromOmnibox}
      onCheckRepositoryAccess={checkRepositoryAccess}
      onClone={submitClone}
      onCancelOperation={cancelCloneOperation}
    />
  ), [
    abandonCloneCheck,
    cancelCloneOperation,
    changeCloneSource,
    checkRepositoryAccess,
    chooseCloneParentFromOmnibox,
    cloneCancelError,
    cloneCancelStatus,
    connectGitHubFromOmnibox,
    openLocalRepository,
    repositoryAdditionDisabled,
    setClonePanelOpen,
    state.cloneBranches,
    state.cloneCheckMessage,
    state.cloneCheckRunning,
    state.cloneCheckStatus,
    state.cloneDraft,
    state.cloneError,
    state.clonePanelOpen,
    state.cloneRunning,
    submitClone,
    updateCloneDraft
  ]);
  const runHeaderAction = useCallback((action: GitAction): void => {
    // Pull during a pull recovery reopens the recovery instead of pulling again.
    if (action === "pull" && stateRef.current.pullRecovery) {
      updateState({ pullRecoveryOpen: true, pullRecoveryError: "" });
    } else {
      void runAction(action, undefined, "action-bar");
    }
  }, [runAction, updateState]);
  const runHeaderPullWithAction = useCallback((action: GitConfiguredAction): void => {
    void runPullWithConfiguredAction(action);
  }, [runPullWithConfiguredAction]);
  const runHeaderConfiguredAction = useCallback((action: GitConfiguredAction): void => {
    void runConfiguredAction(action);
  }, [runConfiguredAction]);
  // Without a target, cancellation picks the running operation the header shows Cancel for.
  const cancelHeaderOperation = useCallback((): void => {
    void cancelRunningOperation();
  }, [cancelRunningOperation]);
  const cancelHeaderConfiguredAction = useCallback((target: ConfiguredActionCancelTarget): void => {
    void cancelRunningOperation(target);
  }, [cancelRunningOperation]);
  const checkForHeaderAppUpdates = useCallback((): void => { void checkForAppUpdates(); }, [checkForAppUpdates]);
  const downloadHeaderAppUpdate = useCallback((): void => { void downloadAppUpdate(); }, [downloadAppUpdate]);
  const installHeaderAppUpdate = useCallback((): void => { void installAppUpdate(); }, [installAppUpdate]);

  const visualPreferences = state.settingsOpen ? state.settingsDraft : state.appSettings ?? defaultVisualPreferences;
  if (state.startupStatus === "loading") {
    return (
      <AppChrome
        visualPreferences={visualPreferences}
        isMaximized={windowState.isMaximized}
        onMinimize={minimizeWindow}
        onToggleMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
      >
        <StartupScreen repositoryName={getRepoDisplayName(state.repoPath)} />
      </AppChrome>
    );
  }

  if (state.gitExecutableStatus && !state.gitExecutableStatus.available) {
    return (
      <AppChrome
        visualPreferences={visualPreferences}
        isMaximized={windowState.isMaximized}
        onMinimize={minimizeWindow}
        onToggleMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
      >
        <GitRequiredScreen
          status={state.gitExecutableStatus}
          checking={state.gitExecutableChecking}
          onInstall={() => openExternalUrl("https://git-scm.com/downloads")}
          onCheckAgain={() => {
            void initializeApp();
          }}
        />
      </AppChrome>
    );
  }

  if (state.showSetup) {
    return (
      <AppChrome
        visualPreferences={visualPreferences}
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
  const blameRoute = state.historyRoute.kind === "blame" ? state.historyRoute : null;
  // Blame shows the loaded file history beside it only when that history contains the blamed version.
  const blameVersions = blameRoute && state.fileHistoryOrigin
    && state.fileHistoryEntries.some((entry) => entry.hash === blameRoute.target.hash && entry.path === blameRoute.target.path)
    ? state.fileHistoryEntries
    : null;
  /** Leaves File History or Blame for the commit history, and drops their pending reads. */
  const openRepositoryHistoryRoute = (): void => {
    cancelRepositoryRead("file-history", requestIds.current.fileHistory);
    cancelRepositoryRead("file-history-diff", requestIds.current.fileHistoryDiff);
    cancelRepositoryRead("file-blame", requestIds.current.fileBlame);
    requestIds.current.fileHistory += 1;
    requestIds.current.fileHistoryDiff += 1;
    requestIds.current.fileBlame += 1;
    updateState({ historyRoute: repositoryHistoryRoute });
  };

  return (
    <AppChrome
      visualPreferences={visualPreferences}
      isMaximized={windowState.isMaximized}
      titleBar={false}
      onMinimize={minimizeWindow}
      onToggleMaximize={toggleMaximizeWindow}
      onClose={closeWindow}
    >
      {/* The header's view switch and the view panels share this Tabs root. */}
      <Tabs value={state.activeView} onValueChange={changeWorkspaceTab} className="app-workspace-shell">
        {/* The header sits outside the repository-keyed panel provider, so switching repositories never remounts it. */}
        {/* The header reads per-repository panel state (action folders). This provider has no key, so switching
            repositories changes its namespace without remounting the header. */}
        <WorkspacePanelStateProvider store={workspacePanelStateStore} namespace={getRepoPathKey(state.repoPath) || "setup"}>
        <RepositoryHeader
          repoPath={state.repoPath}
          displayName={headerRepository.displayName}
          summary={state.summary}
          isMaximized={windowState.isMaximized}
          changesCount={pendingFileCount}
          guestView={state.guestView}
          guestCount={headerGuestCount}
          activityAttention={activityLogAttentionState}
          actionHeading={actionHeading}
          runningAction={state.runningAction}
          feedbackEvent={state.operationButtonFeedback?.repoPath === state.repoPath ? state.operationButtonFeedback : null}
          configuredActionRuns={state.configuredActionRuns}
          configuredActionOutcome={state.configuredActionOutcome}
          disabled={disableUnrelatedMutations}
          pullRecovery={state.pullRecovery}
          cancellable={Boolean(cancellationTarget)}
          cancelStatus={cancellationTarget?.cancelStatus ?? "idle"}
          cancelLabel={state.runningOperation === "Generating commit message" ? "Stop" : "Cancel"}
          cancelingLabel={state.runningOperation === "Generating commit message" ? "Stopping…" : "Cancelling"}
          appUpdate={state.appUpdate}
          repoSwitcherRef={repoSwitcherRef}
          wrapRepoSwitcher={wrapRepoSwitcher}
          renderRepositoryMenuItems={renderHeaderRepositoryMenuItems}
          onOpenSwitcher={openQuickSwitcher}
          onCloseGuest={closeGuestView}
          addViewOptions={addViewOptions}
          onOpenView={openGuestView}
          onRunAction={runHeaderAction}
          onPullWithAction={runHeaderPullWithAction}
          onOpenPushToBranch={openPushToBranchDialog}
          onRunConfiguredAction={runHeaderConfiguredAction}
          onManageActions={openActionManager}
          onCancel={cancelHeaderOperation}
          onCancelOperation={cancelHeaderConfiguredAction}
          onCheckForUpdates={checkForHeaderAppUpdates}
          onDownloadUpdate={downloadHeaderAppUpdate}
          onInstallUpdate={installHeaderAppUpdate}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximizeWindow}
          onCloseWindow={closeWindow}
        />
        </WorkspacePanelStateProvider>
        <div className="operation-banner-slot">
          {state.summary?.isValid !== false && cancellationTarget?.cancelError ? (
            <p className="operation-banner-alert selectable-text" role="alert">{cancellationTarget.cancelError}</p>
          ) : null}
          {state.summary?.isValid !== false && state.summary?.operationState ? (
            <GitOperationRecoveryBanner
              state={state.summary.operationState}
              busy={running}
              cancellable={Boolean(cancellationRequestTarget)}
              error={state.repositoryOperationError}
              onAction={(action) => { void resolveRepositoryOperation(action); }}
              onOpenConflict={openRepositoryOperationConflict}
              onOpenConflictFile={openRepositoryOperationConflictFile}
              onCancel={cancelHeaderOperation}
            />
          ) : null}
        </div>
        <div className="app-workspace-body">
          {state.summary?.isValid === false ? (
            <RepositoryErrorView
              key={state.repoPath}
              repoPath={state.repoPath}
              error={state.setupError || state.summary.validationErrors.join(" ")}
              safeDirectory={state.summary.safeDirectory}
              busy={running || state.repoLoading}
              onRetry={() => { void refreshRepo({ reason: "user", addToRecents: true }); }}
              onRecover={() => recoverRecentRepo(state.repoPath)}
              onAllowGitException={openSafeDirectoryDialog}
            />
          ) : (
            <WorkspacePanelStateProvider
              key={getRepoPathKey(state.repoPath) || "setup"}
              store={workspacePanelStateStore}
              namespace={getRepoPathKey(state.repoPath) || "setup"}
            >
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
                  onStageFiles={stageStatusFiles}
                  onUnstageFiles={unstageStatusFiles}
                  onRefreshDiff={() => {
                    void loadSelectedDiff();
                  }}
                  onDownloadImage={() => { void downloadStatusLfsPreview(); }}
                  onApplyHunk={applySelectedHunk}
                  onContextAction={runStatusFileContextAction}
                  onUpdateSubmodules={(path) => { void updateSubmodules(path); }}
                  onSyncSubmodules={() => { void syncSubmodules(); }}
                  canGeneratePlan={canUseSelectedAiProvider(state.aiSettings)}
                  generatePlanTitle={getCommitPlanGenerateTitle(state)}
                  repositoryChangeVersion={workingTreeChangeVersion}
                  repositoryStatusVersion={fileStatusGenerationRef.current}
                  onGeneratePlan={generateCommitPlan}
                  onValidatePlan={validateCommitPlan}
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
                  commitBox={statusWorkspaceMode === "files" && !repositoryOperationActive ? (
                    <CommitPanel
                      commitMessage={state.commitMessage}
                      commitMessageSuggestion={state.commitMessageSuggestion}
                      commitPushSafetyNotice={state.commitPushSafetyNotice}
                      generationError={state.commitMessageGenerationError}
                      generating={state.runningOperation === "Generating commit message"}
                      disabled={disableUnrelatedMutations}
                      primaryCommitAction={primaryCommitAction}
                      stagedCount={stagedFiles.length}
                      quickCommitByDefault={state.summary?.kind === "git" && state.appSettings?.gitBehaviors?.quickCommitByDefault === true}
                      summary={state.summary}
                      selection={state.selection}
                      quickCommitAiReady={canUseSelectedAiProvider(state.aiSettings)}
                      quickCommitPhase={state.activeOperation?.label === "Generating quick commit message" ? state.runningOperation === "Committing selected files" ? "committing" : "generating" : null}
                      onQuickCommit={(paths) => { void quickCommitSelectedFiles(paths); }}
                      onManualCommit={() => { void commitChanges(); }}
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
                      onApplyCommitMessageSuggestion={() => {
                        const suggestion = stateRef.current.commitMessageSuggestion;
                        if (!suggestion) return;
                        updateState({
                          commitMessage: suggestion.message,
                          commitMessageSuggestion: null,
                          commitMessageGenerationError: ""
                        });
                      }}
                      onDismissCommitMessageSuggestion={() => {
                        updateState({ commitMessageSuggestion: null });
                      }}
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
                        variant="embedded"
                        status={selectedStashFile ? getCommitFileStatusVisuals(selectedStashFile.status) : undefined}
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
                    onBack={openRepositoryHistoryRoute}
                    onOpenRepositoryHistory={openRepositoryHistoryRoute}
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
                        variant="card"
                        status={selectedFileHistoryEntry ? getCommitFileStatusVisuals(selectedFileHistoryEntry.status) : undefined}
                      />
                    }
                  />
                  </OptionalFeatureBoundary>
                ) : blameRoute ? (
                  <OptionalFeatureBoundary name="blame view">
                  <BlameView
                    path={blameRoute.target.path}
                    hash={blameRoute.target.hash}
                    result={state.fileBlame}
                    loading={state.fileBlameLoading}
                    error={state.fileBlameError}
                    backLabel={blameRoute.returnTo === "file" ? "Back to file history" : "Back"}
                    versions={blameVersions}
                    fileHistoryDisabled={!blameVersions && !state.summary?.capabilities.fileHistory}
                    onBack={() => {
                      restoreWorkspaceLocation({
                        ...workspaceLocation,
                        historyRoute: blameRoute.returnTo === "file" && state.fileHistoryOrigin
                          ? { kind: "file", origin: state.fileHistoryOrigin }
                          : repositoryHistoryRoute
                      });
                    }}
                    onOpenRepositoryHistory={openRepositoryHistoryRoute}
                    onShowFileHistory={() => {
                      // The loaded history is shown again as it is. Otherwise the history of the blamed version loads.
                      if (blameVersions && state.fileHistoryOrigin) {
                        restoreWorkspaceLocation({ ...workspaceLocation, historyRoute: { kind: "file", origin: state.fileHistoryOrigin } });
                      } else if (state.summary?.capabilities.fileHistory) {
                        void loadFileHistory(blameRoute.target);
                      }
                    }}
                    onSelectVersion={(entry) => { void loadFileBlame(targetFromHistoryEntry(entry), "file"); }}
                    onRetry={() => { void loadFileBlame(blameRoute.target, blameRoute.returnTo); }}
                    onOpenCommit={(hash) => {
                      openRepositoryHistoryRoute();
                      selectCommit(hash);
                    }}
                  />
                  </OptionalFeatureBoundary>
                ) : <HistoryView
                  summary={state.summary}
                  historyScope={state.historyScope}
                  history={state.history}
                  historyHasMore={state.historyHasMore}
                  onLoadMoreHistory={() => { void loadCommitHistory(true, false, true); }}
                  onRetryHistory={() => { void loadCommitHistory(true); }}
                  historyLoading={state.historyLoading}
                  historyLoadingMore={state.historyLoadingMore}
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
                  onCopyCommit={copyCommitShaToClipboard}
                  onCommitContextAction={runCommitContextAction}
                  currentHeadHash={getCurrentHistoryHeadSha(state.history, state.historyScope, state.summary?.branch ?? null)}
                  amendDisabledReason={getAmendDisabledReason(state)}
                  onCommitFileContextAction={runCommitFileContextAction}
                  onDownloadImage={() => { void downloadCommitLfsPreview(); }}
                  onWrapLinesChange={setWrapDiffLines}
                />}
              </PersistentWorkspaceTabsContent>

              {showAnalyticsTab ? (
                <PersistentWorkspaceTabsContent panelKey="analytics" active={state.activeView === "analytics"} preserveMount value="analytics" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                  <OptionalFeatureBoundary name="analytics">
                    <AnalyticsView
                      active={state.activeView === "analytics"}
                      repoPath={state.repoPath}
                      enabled={showAnalyticsTab}
                      githubAvailable={showGitHubTabs}
                      canOpenFileHistory={Boolean(state.summary?.capabilities.fileHistory)}
                      onOpenFileHistory={openAnalyticsFileHistory}
                      onOpenBranchManager={openBranchManager}
                      onOpenWorkflowRuns={openWorkflowRunsForBranch}
                      renderGitHubFailure={(failure, retry) => (
                        <GitHubFailureState
                          failure={failure}
                          fallback={failure.message}
                          stale={false}
                          onRetry={retry}
                          onConnect={() => openSettingsDialog("integrations")}
                          onReviewAccess={() => { void window.githead.openExternalUrl({ url: GITHUB_APP_INSTALL_URL }); }}
                          onCheckRemote={openRemoteManager}
                        />
                      )}
                    />
                  </OptionalFeatureBoundary>
                </PersistentWorkspaceTabsContent>
              ) : null}

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
                      showCreatePullRequest={shouldShowCreatePullRequest(state.summary, historyInsights.currentBranchPullRequests, historyInsights.branchPullRequestsLoaded)}
                      branchPullRequests={historyInsights.currentBranchPullRequests}
                      createPullRequestDisabled={disableUnrelatedMutations}
                      onCreatePullRequest={openCreatePrDialog}
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

            </WorkspacePanelStateProvider>
          )}
        </div>
      </Tabs>

      {quickSwitcherMode && quickSwitcherSections ? (
        <QuickSwitcher
          mode={quickSwitcherMode}
          sections={quickSwitcherSections}
          query={quickSwitcherQuery}
          onQueryChange={setQuickSwitcherQuery}
          onSelect={runQuickSwitcherItem}
          onClose={closeQuickSwitcher}
          onModeChange={openQuickSwitcher}
          renderItemContextMenu={renderQuickSwitcherContextMenu}
          restoreFocus={restoreQuickSwitcherFocus}
          upstreamError={state.upstreamError}
        />
      ) : null}
      {switcherRepositoryActions.dialogs}

      <GitIndexLockRecovery
        key={state.repoPath}
        repoPath={state.repoPath}
        operationResult={state.lastOperationResult}
        actionResult={state.lastResult}
        busy={running}
        onRemove={(fingerprint) => runRepoOperation("Recover index lock", undefined, (operationId) =>
          window.githead.removeGitIndexLock({ repoPath: state.repoPath, fingerprint, operationId })
        )}
      />
      <SafeDirectoryDialog
        open={state.safeDirectoryDialogOpen}
        safeDirectory={state.summary?.safeDirectory ?? null}
        saving={state.safeDirectoryRunning}
        onCancel={() => requestModalClose(["safe-directory"], closeSafeDirectoryDialog)}
        onAllow={() => { void allowSafeDirectory(); }}
      />
      <GenerateWithContextDialog
        open={state.generateContextDialog.open}
        context={state.generateContextDialog.context}
        generating={state.runningOperation === "Generating commit message"}
        cancelStatus={state.runningOperation === "Generating commit message"
          ? state.activeOperation?.cancelStatus ?? "idle"
          : "idle"}
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
        repoPath={state.repoPath}
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
        busy={remoteMutationRunning}
        mutationBlocked={running || repositoryOperationActive}
        loadError={state.remoteManager.error}
        hasGitHubOrigin={Boolean(state.summary?.githubRepository)}
        onOpenChange={(open) => {
          if (!open) {
            if (remoteMutationRunning) requestModalClose(["repo-operation"], closeRemoteManager);
            else closeRemoteManager();
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
        busy={branchMutationRunning}
        mutationBlocked={running || repositoryOperationActive}
        onOpenChange={(open) => {
          if (!open) {
            if (branchMutationRunning) requestModalClose(["repo-operation"], closeBranchManager);
            else closeBranchManager();
          }
        }}
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
          {forceLeaseOffer ? <div className="dialog-notice" data-tone="warning"><TriangleAlert aria-hidden="true" /><div><p className="dialog-notice-title">{forceLeaseOffer.branchName} → {forceLeaseOffer.remoteName}/{forceLeaseOffer.remoteBranchName}</p><p className="text-muted-foreground">Plain force is never used. No push has happened yet.</p></div></div> : null}
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
        cancelling={state.activeOperation?.cancelStatus === "canceling"}
        cancelError={state.activeOperation?.cancelError ?? ""}
        onCancel={() => { void cancelRunningOperation(); }}
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

      {state.tagCheckoutOpen && state.summary?.kind === "git" ? <CheckoutTagDialog
        key={state.repoPath}
        repoPath={state.repoPath}
        remotes={state.summary.remotes}
        busy={isOperationRunning(state)}
        onClose={() => { if (!isOperationRunning(stateRef.current)) updateState({ tagCheckoutOpen: false }); }}
        onCheckout={checkoutTag}
      /> : null}
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

    </AppChrome>
  );
}

interface AppChromeProps {
  visualPreferences: Pick<AppSettings, "visualEffects" | "reduceMotion">;
  children: ReactNode;
  isMaximized: boolean;
  /** The window title strip. The workspace turns it off because its repository header is the title bar. */
  titleBar?: boolean;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
}

function AppChrome({
  visualPreferences,
  children,
  isMaximized,
  titleBar = true,
  onMinimize,
  onToggleMaximize,
  onClose
}: AppChromeProps): ReactNode {
  return (
    <VisualEffectsProvider effects={visualPreferences.visualEffects} motionPreference={visualPreferences.reduceMotion}>
      <TooltipProvider>
        <main className="app-shell bg-background text-foreground" data-title-bar={titleBar ? "true" : "false"}>
          {titleBar ? (
            // A bare drag strip: the brand lives in StartLayout, so the strip carries only the window controls.
            <header className="window-chrome" data-maximized={isMaximized ? "true" : "false"}>
              <WindowControls
                isMaximized={isMaximized}
                onMinimize={onMinimize}
                onToggleMaximize={onToggleMaximize}
                onClose={onClose}
              />
            </header>
          ) : null}
          <section className="app-content">
            {children}
          </section>
        </main>
      </TooltipProvider>
    </VisualEffectsProvider>
  );
}

function GitRequiredScreen({
  status,
  checking,
  onInstall,
  onCheckAgain
}: {
  status: Extract<GitExecutableStatus, { available: false }>;
  checking: boolean;
  onInstall: () => void;
  onCheckAgain: () => void;
}): ReactNode {
  const unavailable = status.reason === "unavailable";

  return (
    <StartLayout>
      <section className="git-required-screen" aria-labelledby="git-required-title">
        <span className={unavailable ? "notice-tile is-warning" : "notice-tile"} aria-hidden="true">
          {unavailable ? <TriangleAlert /> : <GitFork />}
        </span>
        <div className="git-required-copy">
          <h1 id="git-required-title">{unavailable ? "Git could not be started" : "Git is required"}</h1>
          <p>
            {unavailable
              ? "Githead found Git, but the command failed. Reinstall Git or check your system PATH."
              : "Githead could not find Git on this computer. Install Git before opening or cloning repositories."}
          </p>
          <p>After installation, check again. You do not need to restart Githead.</p>
        </div>
        <div className="git-required-actions">
          <Button type="button" variant="secondary" onClick={onCheckAgain} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking for Git" : "Check again"}
          </Button>
          <Button type="button" onClick={onInstall} disabled={checking}>
            <Download />
            Download Git
            <ExternalLink />
          </Button>
        </div>
      </section>
    </StartLayout>
  );
}

function RepositoryErrorView({ repoPath, error, safeDirectory, busy, onRetry, onRecover, onAllowGitException }: {
  repoPath: string;
  error: string;
  safeDirectory: GitSafeDirectoryInfo | null;
  busy: boolean;
  onRetry: () => void;
  onRecover: () => Promise<RepositoryRecoveryResult>;
  onAllowGitException: () => void;
}): ReactNode {
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const disabled = busy || recovering;

  return (
    <div className="repository-error">
      <section className="repository-error-panel" aria-labelledby="repository-error-heading">
        <span className="notice-tile is-destructive" aria-hidden="true"><TriangleAlert /></span>
        <div className="repository-error-copy">
          <h2 id="repository-error-heading">Repository unavailable</h2>
          <p>Githead cannot open this repository. Try again or select another repository from the list.</p>
        </div>
        <p className="dialog-code-block">{repoPath}</p>
        <p className="repository-error-message selectable-text" role="alert">{recoveryError || error}</p>
        {safeDirectory?.required ? <p className="repository-error-caption">Git ownership check blocked this repository.</p> : null}
        <div className="repository-error-actions">
          {safeDirectory?.required ? (
            <Button variant="secondary" disabled={disabled} onClick={onAllowGitException}><ShieldAlert />Allow Git exception</Button>
          ) : (
            <Button variant="secondary" disabled={disabled} onClick={() => {
              setRecovering(true);
              setRecoveryError("");
              void onRecover().then((result) => {
                if (result.status === "error") setRecoveryError(result.message);
              }).finally(() => setRecovering(false));
            }}>
              {recovering ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              {recovering ? "Checking location" : "Choose new location"}
            </Button>
          )}
          <Button disabled={disabled} onClick={onRetry}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Try again
          </Button>
        </div>
      </section>
    </div>
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
  const [step, setStep] = useState<"welcome" | "clone">("welcome");
  const cloneButtonRef = useRef<HTMLButtonElement>(null);
  const clonePanelRef = useRef<HTMLDivElement>(null);
  const cloneBusy = cloneRunning || cloneCheckRunning;

  useEffect(() => {
    if (step === "clone") clonePanelRef.current?.querySelector("input")?.focus();
  }, [step]);

  const returnToWelcome = (): void => {
    if (cloneBusy) return;
    setStep("welcome");
    requestAnimationFrame(() => cloneButtonRef.current?.focus());
  };

  return (
    <StartLayout>
      <div className="setup-screen">
        {step === "clone" ? (
          <div className="setup-clone-step" ref={clonePanelRef}>
            <Button type="button" variant="ghost" className="setup-back" onClick={returnToWelcome} disabled={cloneBusy}>
              <ArrowLeft /> Back to repositories
            </Button>
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
          </div>
        ) : (
          <>
            <header className="setup-header">
              <h2>{repoRecents.length ? "Pick up where you left off." : "Start with a repository."}</h2>
              <p>Open a local folder or clone a repository to this computer.</p>
            </header>
            <div className="start-card">
              <button type="button" className="setup-action" aria-label="Open repository" onClick={onChooseRepo} disabled={running}>
                <FolderOpen className="setup-action-icon" aria-hidden="true" />
                <span className="setup-action-copy"><strong>Open repository</strong><span>Choose an existing folder on your computer</span></span>
                <ChevronRight className="setup-action-chevron" aria-hidden="true" />
              </button>
              <button type="button" ref={cloneButtonRef} className="setup-action" aria-label="Clone a repository" onClick={() => setStep("clone")} disabled={running}>
                <GitFork className="setup-action-icon" aria-hidden="true" />
                <span className="setup-action-copy"><strong>Clone a repository</strong><span>Download a repository from a URL or path</span></span>
                <ChevronRight className="setup-action-chevron" aria-hidden="true" />
              </button>
            </div>
            {setupError ? (
              <p className="setup-error selectable-text" role="alert">{setupError}</p>
            ) : null}
            {safeDirectory?.required ? (
              <div className="setup-safe-directory" role="status">
                <OperationBanner
                  className="is-inline"
                  ariaLabel="Git ownership check"
                  icon={<ShieldAlert />}
                  title="Git ownership check blocked this repository."
                  description="Allow an exception for this folder to add it to Git's global safe.directory list."
                  actions={(
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={onOpenSafeDirectoryDialog}
                      disabled={running || safeDirectoryRunning}
                    >
                      {safeDirectoryRunning ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
                      {safeDirectoryRunning ? "Adding exception" : "Allow Git exception"}
                    </Button>
                  )}
                >
                  <span className="operation-banner-path selectable-text">{safeDirectory.path}</span>
                </OperationBanner>
              </div>
            ) : null}
            {selectedRepoPath ? (
              <p className="setup-selected-path selectable-text">{selectedRepoPath}</p>
            ) : null}
            <div className="setup-recent-section">
              <div className="setup-recent-title"><h3>Recent repositories</h3><span>{repoRecents.length}</span></div>
              {repoRecents.length > 0 ? (
                <RepositoryList
                  className="setup-recents start-card"
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
              ) : (
                <EmptyState
                  className="start-card"
                  icon={<History />}
                  title="Your repositories will appear here"
                  description="Open or clone your first repository to get started."
                />
              )}
            </div>
          </>
        )}
      </div>
    </StartLayout>
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
  label?: { name: string; detail: string };
  renderMenuItems: RenderRepositoryMenuItems;
  hidden?: boolean;
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
  onRecover: (repoPath: string, reason: string) => void;
}

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
  const repositoryOrganization = useRepositoryOrganization();
  const { organization, update: updateOrganization, saveError } = repositoryOrganization;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const orderedPaths = repoPaths;
  const { renderMenuItems, changePreference, openRecovery, openOrganizer, dialogs } = useRepositoryRowActions({
    repoPaths: orderedPaths,
    activeRepoPath: repoPath,
    disabled,
    organization: repositoryOrganization,
    onRemove,
    onRecover,
    onShowInExplorer,
    onOpenRepositorySettings,
    ...(onRemoveWorktree ? { onRemoveWorktree } : {})
  });
  const groupsByPath = useMemo(() => new Map(groups?.map((group) => [getRepoPathKey(group.anchorPath), group]) ?? []), [groups]);
  const labels = useMemo(() => repositoryLabels(orderedPaths, organization), [orderedPaths, organization]);
  const sections = useMemo(() => organizeRepositories(orderedPaths, groups ?? [], organization, query, showHidden, repoPath), [orderedPaths, groups, organization, query, showHidden, repoPath]);
  const visiblePaths = sections.flatMap((section) => section.collapsed ? [] : section.paths);
  const hiddenCount = orderedPaths.filter((path) => repositoryPreference(organization, path).hidden).length;
  const repositoryOrderDependency = orderedPaths.map(getRepoPathKey).join("\u0000");
  useEffect(() => {
    const activeKey = repoPath ? getRepoPathKey(repoPath) : null;
    if (!activeKey) {
      return;
    }

    repositoryRowsRef.current.get(activeKey)?.scrollIntoView?.({
      block: "nearest"
    });
  }, [repoPath, repoPaths]);

  const moveRepository = (fromRepoPath: string, toRepoPath: string, position: RepositoryDropPosition): void => {
    if (isSameRepoPath(fromRepoPath, toRepoPath)) {
      return;
    }

    const targetPreference = repositoryPreference(organization, toRepoPath);
    const sourcePreference = repositoryPreference(organization, fromRepoPath);
    if (sourcePreference.pinned !== targetPreference.pinned || (!targetPreference.pinned && sourcePreference.projectId !== targetPreference.projectId)) {
      if (!changePreference(fromRepoPath, { pinned: targetPreference.pinned, ...(!targetPreference.pinned ? { projectId: targetPreference.projectId } : {}) })) return;
    }
    const next = moveRepoPath(repoPaths, fromRepoPath, toRepoPath, position);
    if (!areRepoPathListsEqual(repoPaths, next)) onReorder(next);
  };

  const moveRepositoryByKeyboard = (path: string, direction: RepositoryMoveDirection): void => {
    const section = sections.find((item) => item.paths.some((candidate) => isSameRepoPath(candidate, path)));
    if (!section) return;
    const index = section.paths.findIndex((candidate) => isSameRepoPath(candidate, path));
    const target = section.paths[direction === "up" ? index - 1 : index + 1];
    if (target) moveRepository(path, target, direction === "up" ? "before" : "after");
  };

  const startDrag = (event: DragEvent<HTMLButtonElement>, dragRepoPath: string): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragRepoPath);
    draggedRepoPathRef.current = dragRepoPath;
    setDraggedRepoPath(dragRepoPath);
  };

  const startPointerDrag = (dragRepoPath: string): void => {
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
    if (!sourceRepoPath || isSameRepoPath(sourceRepoPath, targetRepoPath)) {
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

  const renderRepository = (recentRepoPath: string): ReactNode => {
    const group = groupsByPath.get(getRepoPathKey(recentRepoPath));
    if (group) {
          const key = getRepoPathKey(group.anchorPath);
          const active = group.worktrees.some((worktree) => isSameRepoPath(worktree.path, repoPath)) || isSameRepoPath(group.anchorPath, repoPath);
          const currentDropPosition = dropTarget && isSameRepoPath(dropTarget.repoPath, group.anchorPath) ? dropTarget.position : null;
          return <RepositoryGroupRow
            key={group.id}
            group={group}
            label={labels.get(key)!}
            hidden={repositoryPreference(organization, group.anchorPath).hidden}
            renderMenuItems={renderMenuItems}
            activeRepoPath={repoPath}
            active={active}
            searchExpanded={Boolean(query.trim())}
            expanded={organization.expandedWorktrees.includes(group.id) || Boolean(query.trim())}
            disabled={disabled}
            dragging={Boolean(draggedRepoPath && isSameRepoPath(draggedRepoPath, group.anchorPath))}
            dropPosition={currentDropPosition}
            syncStatuses={syncStatuses}
            layoutDependency={repositoryOrderDependency}
            rowRef={(element) => { if (element) repositoryRowsRef.current.set(key, element); else repositoryRowsRef.current.delete(key); }}
            onToggle={() => updateOrganization((current) => ({ ...current, expandedWorktrees: current.expandedWorktrees.includes(group.id) ? current.expandedWorktrees.filter((id) => id !== group.id) : [...current.expandedWorktrees, group.id] }))}
            onDragStart={startDrag}
            onPointerDragStart={startPointerDrag}
            onDragEnd={() => { draggedRepoPathRef.current = null; setDraggedRepoPath(null); setDropTarget(null); }}
            onKeyboardMove={moveRepositoryByKeyboard}
            onSelect={onSelect}
            onRecover={(reason) => openRecovery(group.anchorPath, reason)}
          />;
        }
          const key = getRepoPathKey(recentRepoPath);
          const active = repoPath ? isSameRepoPath(recentRepoPath, repoPath) : false;
          const currentDropPosition = dropTarget && isSameRepoPath(dropTarget.repoPath, recentRepoPath)
            ? dropTarget.position
            : null;

          return (
            <RecentRepositoryRow
              key={key}
              repoPath={recentRepoPath}
              label={labels.get(key)!}
              hidden={repositoryPreference(organization, recentRepoPath).hidden}
              renderMenuItems={renderMenuItems}
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
              onRecover={openRecovery}
            />
          );
  };

  return (
    <>
    <section className={className} aria-label="Repositories">
      <div className="repo-recents-heading">
        <p className="repo-recents-label">Repositories</p>
        <div className="flex items-center gap-1">
          <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Search repositories" tooltip="Search repositories" aria-expanded={searchOpen || Boolean(query)} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (searchOpen || query) { setQuery(""); setSearchOpen(false); } else { setSearchOpen(true); } }}><Search /></TooltipButton>
          <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Organize repositories" tooltip="Organize repositories" onClick={() => openOrganizer()}><SlidersHorizontal /></TooltipButton>
          {headingAction}
        </div>
      </div>
      {searchOpen || query ? <div className="repository-search">
        <Search aria-hidden="true" />
        <Input type="search" autoFocus aria-label="Search repositories" placeholder="Search repositories…" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => { if (!query) setSearchOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setQuery(""); setSearchOpen(false); } }} />
      </div> : null}
      {saveError ? <p role="alert" className="text-xs text-destructive">{saveError}</p> : null}
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
        {sections.map((section) => <div key={section.id} className="repository-project-section">
          {section.id.startsWith("project:") ? <button type="button" className="repository-section-heading" aria-label={`${section.name}, ${section.paths.length} repositories`} disabled={Boolean(query.trim())} title={query.trim() ? "Clear search to collapse groups" : undefined} aria-expanded={!section.collapsed} onClick={() => updateOrganization((current) => ({ ...current, projects: current.projects.map((project) => `project:${project.id}` === section.id ? { ...project, collapsed: !project.collapsed } : project) }))}>
            <ChevronRight className={section.collapsed ? "" : "rotate-90"} /><span>{section.name}</span><span className="repository-section-count">{section.paths.length}</span>
          </button> : sections.length > 1 || section.id === "pinned" ? <p className="repository-section-heading">{section.id === "pinned" ? <Pin /> : null}<span>{section.name}</span><span className="repository-section-count">{section.paths.length}</span></p> : null}
          {!section.collapsed ? section.paths.map(renderRepository) : null}
          {!section.collapsed && !section.paths.length ? <p className="repository-empty-group">Assign repositories in Organize repositories.</p> : null}
        </div>)}
        {!visiblePaths.length && query.trim() ? <p className="repository-empty-group" role="status">No repositories match your search.</p> : null}
      </div>
      {hiddenCount > 0 ? <button type="button" className="repository-show-hidden" aria-pressed={showHidden} onClick={() => setShowHidden((current) => !current)}>{showHidden ? "Hide inactive repositories" : `Show hidden (${hiddenCount})`}</button> : null}
    </section>
    {dialogs}
    </>
  );
}

function RepositoryGroupRow({ searchExpanded, label, renderMenuItems, hidden, group, activeRepoPath, active, expanded, disabled, dragging, dropPosition, syncStatuses, layoutDependency, rowRef, onToggle, onDragStart, onPointerDragStart, onDragEnd, onKeyboardMove, onSelect, onRecover }: {
  searchExpanded: boolean;
  label?: { name: string; detail: string };
  renderMenuItems: RenderRepositoryMenuItems;
  hidden?: boolean;
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
  onRecover: (reason: string) => void;
}): ReactNode {
  const worktreeListId = useId();
  const worktrees = group.worktrees.length ? group.worktrees : [{ path: group.anchorPath, head: null, branch: null, isMain: true, isBare: false, isDetached: false, locked: false, lockReason: null, prunable: false, prunableReason: null } satisfies GitWorktree];
  const displayName = label?.name ?? getRepoDisplayName(group.anchorPath);
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
  return <motion.div ref={rowRef} layout="position" layoutDependency={layoutDependency} transition={{ layout: { duration: 0.12, ease: EASE_OUT } }} className={rowClassName} data-repo-path={group.anchorPath}>
    <ContextMenu><ContextMenuTrigger asChild><div className="repo-group-heading">
      <button type="button" className="repo-recent-drag-handle" draggable onDragStart={(event) => onDragStart(event, group.anchorPath)} onMouseDown={() => onPointerDragStart(group.anchorPath)} onDragEnd={onDragEnd} onKeyDown={handleKeyDown} aria-label={`Reorder ${group.anchorPath}`}><GripVertical /></button>
      <button type="button" className="repo-group-toggle" disabled={searchExpanded} title={searchExpanded ? "Clear search to collapse worktrees" : undefined} onClick={onToggle} aria-expanded={expanded} aria-controls={worktreeListId} aria-label={`${expanded ? "Collapse" : "Expand"} worktrees for ${displayName}`}><ChevronRight className="repo-group-chevron" /></button>
      <button type="button" className="repo-group-main" disabled={disabled || navigationActive || navigationUnavailable || Boolean(unavailableReason)} onClick={() => onSelect(group.lastUsedPath)} aria-current={navigationActive ? "true" : undefined} aria-label={`Switch to ${group.anchorPath}`}><RecentRepositoryVcsIcon kind={group.kind} /><span className="repo-recent-title" title={group.anchorPath}>{displayName}{label?.detail ? <span className="repository-path-detail">{label.detail}</span> : null}</span>{hidden ? <EyeOff className="repository-hidden-icon" aria-label="Hidden repository" /> : null}</button>
      {unavailableReason ? <RepositoryUnavailableButton repoPath={group.anchorPath} reason={unavailableReason} disabled={disabled} onClick={() => onRecover(unavailableReason)} /> : null}
    </div></ContextMenuTrigger><ContextMenuContent className="w-72"><ContextMenuLabel className="repo-recent-menu-path">{group.anchorPath}</ContextMenuLabel><ContextMenuSeparator />{renderMenuItems(group.anchorPath, { group })}</ContextMenuContent></ContextMenu>
    <MotionPresence present={expanded} id={worktreeListId} className="repo-worktree-list" initialY={-2}>{worktrees.map((worktree) => {
      const workspaceActive = isSameRepoPath(worktree.path, activeRepoPath);
      const unavailable = worktree.isBare || worktree.prunable;
      const status = syncStatuses[getRepoPathKey(worktree.path)] ?? null;
      return <ContextMenu key={getRepoPathKey(worktree.path)}><ContextMenuTrigger asChild><div className={`repo-worktree-row ${workspaceActive ? "is-active" : ""}`}><button type="button" className="repo-worktree-main" disabled={disabled || workspaceActive || unavailable} onClick={() => onSelect(worktree.path)} aria-current={workspaceActive ? "true" : undefined}><GitBranchIcon /><span className="min-w-0 flex-1"><span className="repo-worktree-branch">{worktree.branch ?? (worktree.isDetached ? "Detached HEAD" : getRepoDisplayName(worktree.path))}</span>{!isSameRepoPath(worktree.path, group.anchorPath) ? <span className="repo-worktree-path">{getRepoDisplayName(worktree.path)}</span> : null}</span>{worktree.isMain ? <Badge variant="outline" className="repo-worktree-main-badge">Main</Badge> : null}{worktree.locked ? <Badge variant="outline">Locked</Badge> : null}{worktree.prunable ? <Badge variant="destructive">Missing</Badge> : null}<RepoSyncStatusChips status={status} /></button></div></ContextMenuTrigger><ContextMenuContent className="w-72"><ContextMenuLabel className="repo-recent-menu-path">{worktree.path}</ContextMenuLabel><ContextMenuSeparator />{renderMenuItems(worktree.path, { group, worktree })}</ContextMenuContent></ContextMenu>;
    })}{group.error ? <p className="px-3 py-2 text-xs text-destructive">{group.error}</p> : null}</MotionPresence>
  </motion.div>;
}

function RecentRepositoryRow({
  label,
  renderMenuItems,
  hidden,
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
  onRecover
}: RecentRepositoryRowProps): ReactNode {
  const displayName = label?.name ?? getRepoDisplayName(repoPath);
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
          transition={{ layout: { duration: 0.12, ease: EASE_OUT } }}
          className={rowClassName}
          data-repo-path={repoPath}
        >
          <TooltipTarget content="Reorder repository">
            <button
              type="button"
              className="repo-recent-drag-handle"
              draggable
              onDragStart={(event) => {
                onDragStart(event, repoPath);
              }}
              onMouseDown={() => {
                onPointerDragStart(repoPath);
              }}
              onDragEnd={onDragEnd}
              onKeyDown={handleKeyDown}
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
              <span className="repo-recent-title" title={repoPath}>{displayName}{label?.detail ? <span className="repository-path-detail">{label.detail}</span> : null}</span>
              {hidden ? <EyeOff className="repository-hidden-icon" aria-label="Hidden repository" /> : null}
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
        {renderMenuItems(repoPath)}
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
    <TooltipTarget content={reason} contentProps={{ className: "[--tooltip-max-width:20rem]" }}>
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

interface CloneRepositoryFormProps extends CloneRepositoryControls {
  idPrefix: string;
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

  const updateSource = (source: string): void => {
    const previousInferredName = parseRepositorySource(cloneDraft.source)?.name ?? inferCloneDirectoryName(cloneDraft.source);
    const parsed = parseRepositorySource(source);
    const nextInferredName = parsed?.name ?? inferCloneDirectoryName(source);
    const shouldUpdateDirectory = !cloneDraft.directoryName.trim() || cloneDraft.directoryName === previousInferredName;

    onCloneSourceChange({
      ...cloneDraft,
      source,
      branchName: parsed?.branchName ?? "",
      sourceRefPath: parsed?.refPath ?? "",
      directoryName: shouldUpdateDirectory ? nextInferredName : cloneDraft.directoryName
    });
  };

  return (
    <form className="setup-clone-form" onSubmit={onClone}>
      <header className="setup-header">
        <h2>Clone repository</h2>
        <p>Create a local copy of a repository.</p>
      </header>

      <div className="start-card setup-clone-fields">
        <div className="setup-clone-field">
          <Label htmlFor={sourceId}>Repository URL or path</Label>
          <div className="setup-clone-input-row">
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
              variant="secondary"
              onClick={onCheckRepositoryAccess}
              disabled={cloneBusy || !cloneDraft.source.trim()}
            >
              {cloneCheckRunning ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {cloneCheckRunning ? "Checking" : "Check"}
            </Button>
          </div>
        </div>

        <div className="setup-clone-field">
          <Label htmlFor={parentId}>Destination folder</Label>
          <div className="setup-clone-input-row">
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
            <Button type="button" variant="secondary" onClick={onChooseCloneParent} disabled={cloneRunning}>
              <FolderOpen />
              Browse
            </Button>
          </div>
        </div>

        <div className="setup-clone-field">
          <Label htmlFor={directoryId}>Folder name</Label>
          <Input
            id={directoryId}
            value={cloneDraft.directoryName}
            placeholder="From repository name"
            disabled={cloneRunning}
            onChange={(event) => {
              onCloneDraftChange({
                ...cloneDraft,
                directoryName: event.target.value
              });
            }}
          />
        </div>
        <details className="setup-clone-advanced">
          <summary>Clone options<ChevronDown aria-hidden="true" /></summary>
          <div className="setup-clone-advanced-body">
            <div className="setup-clone-options">
              <div className="setup-clone-field">
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
                  customValueLabel={(query) => `Use branch "${query}"`}
                  onValueChange={(branchName) => onCloneDraftChange({ ...cloneDraft, branchName })}
                />
              </div>
            </div>
            {!isLoreSource(cloneDraft.source) ? <CloneOptions draft={cloneDraft} disabled={cloneRunning} idPrefix={idPrefix} onChange={onCloneDraftChange} /> : null}
          </div>
        </details>
      </div>

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
      {cancelError ? (
        <p className="setup-error selectable-text" role="alert">{cancelError}</p>
      ) : null}

      <div className="setup-clone-footer">
        {cloneBusy ? (
          <Button
            type="button"
            variant="secondary"
            disabled={cancelStatus === "canceling"}
            onClick={onCancelOperation}
          >
            {cancelStatus === "canceling" ? <Loader2 className="animate-spin" /> : <X />}
            {cancelStatus === "canceling"
              ? "Cancelling"
              : cloneCheckRunning
                ? "Cancel check"
                : "Cancel clone"}
          </Button>
        ) : null}
        <Button type="submit" disabled={cloneBusy}>
          {cloneRunning ? <Loader2 className="animate-spin" /> : <Download />}
          {cloneRunning ? "Cloning" : "Clone repository"}
        </Button>
      </div>
    </form>
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
  repositoryStatusVersion,
  onGeneratePlan,
  onValidatePlan,
  onQuickCommit,
  composer,
  commitBox
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
  onApplyHunk: (patch: string, discard?: boolean) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[], expectedSnapshot?: string) => void;
  onUpdateSubmodules: (path?: string) => void;
  onSyncSubmodules: () => void;
  canGeneratePlan: boolean;
  generatePlanTitle: string;
  repositoryChangeVersion: number;
  repositoryStatusVersion: number;
  onGeneratePlan: (paths: string[]) => Promise<GenerateCommitPlanResult | null>;
  onValidatePlan: (request: CommitPlanValidationRequest) => Promise<CommitPlanValidationResult>;
  onQuickCommit: (changes: GitQuickCommitChange[], message: string) => Promise<GitOperationResult | null>;
  composer?: ReactNode;
  /** The commit box, docked at the bottom of the list column. The plan view replaces it. */
  commitBox?: ReactNode;
}): ReactNode {
  const [query, setQuery] = usePersistentWorkspacePanelState("status-file-query", "");
  const [statusFilter, setStatusFilter] = usePersistentWorkspacePanelState<StatusFileFilter>("status-file-filter", "all");
  const [expandEmptyStaged, setExpandEmptyStaged] = usePersistentWorkspacePanelState("status-expand-empty-staged", false);
  const [expandEmptyUnstaged, setExpandEmptyUnstaged] = usePersistentWorkspacePanelState("status-expand-empty-unstaged", false);
  const [collapseStaged, setCollapseStaged] = usePersistentWorkspacePanelState("status-collapse-staged", false);
  const [collapseUnstaged, setCollapseUnstaged] = usePersistentWorkspacePanelState("status-collapse-unstaged", false);
  // Both file groups render their rows into this one scroller, so its ref must be state.
  const [fileScroller, setFileScroller] = useState<HTMLDivElement | null>(null);
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false);
  const matchingStagedFiles = useMemo(() => filterStatusFiles(stagedFiles, "staged", query, statusFilter), [stagedFiles, query, statusFilter]);
  const matchingUnstagedFiles = useMemo(() => filterStatusFiles(unstagedFiles, "unstaged", query, statusFilter), [unstagedFiles, query, statusFilter]);
  const filtering = query.trim().length > 0 || statusFilter !== "all";
  const matchingPaths = useMemo(() => new Set((selection?.side === "staged" ? matchingStagedFiles : matchingUnstagedFiles).map((file) => file.path)), [matchingStagedFiles, matchingUnstagedFiles, selection?.side]);
  // Memoised so that the file groups skip a render when only the commit box changed.
  const matchingSelection = useMemo(() => {
    if (!selection) return null;
    const selectedPaths = getSelectionPaths(selection).filter((path) => matchingPaths.has(path));
    return selectedPaths.length > 0
      ? createFileSelection(selection.side, selectedPaths, selection.path, selection.anchorPath)
      : null;
  }, [matchingPaths, selection]);
  // A stage or unstage from this view moves the selection to the other group. Both groups share one
  // scroller, so revealing the moved row would scroll the list away from where the user works.
  const selectionKey = selection ? `${selection.side}:${selection.path}` : null;
  const [selectionMove, setSelectionMove] = useState<{
    selectionKey: string | null;
    expected: { side: GitDiffSide; paths: ReadonlySet<string> } | null;
    moved: boolean;
  }>(() => ({ selectionKey, expected: null, moved: false }));
  if (selectionMove.selectionKey !== selectionKey) {
    const { expected } = selectionMove;
    setSelectionMove({
      selectionKey,
      expected: null,
      moved: Boolean(selection && expected?.side === selection.side && expected.paths.has(selection.path))
    });
  }
  const expectSelectionMove = useCallback((side: GitDiffSide, paths: readonly string[]): void => {
    setSelectionMove((current) => ({ ...current, expected: { side, paths: new Set(paths) } }));
  }, []);
  const stageGroupFiles = useCallback((paths: string[], nextSelection?: FileSelection): void => {
    if (nextSelection) expectSelectionMove(nextSelection.side, paths);
    onStageFiles(paths, nextSelection);
  }, [expectSelectionMove, onStageFiles]);
  const unstageGroupFiles = useCallback((paths: string[], nextSelection?: FileSelection): void => {
    if (nextSelection) expectSelectionMove(nextSelection.side, paths);
    onUnstageFiles(paths, nextSelection);
  }, [expectSelectionMove, onUnstageFiles]);
  // An empty group starts collapsed to its header; a group with files collapses only when the user asks.
  const stagedEmpty = stagedFiles.length === 0;
  const unstagedEmpty = unstagedFiles.length === 0;
  const stagedCollapsed = stagedEmpty ? !expandEmptyStaged : collapseStaged;
  const unstagedCollapsed = unstagedEmpty ? !expandEmptyUnstaged : collapseUnstaged;
  const toggleStaged = useCallback(() => {
    if (stagedEmpty) setExpandEmptyStaged((value) => !value);
    else setCollapseStaged((value) => !value);
  }, [setCollapseStaged, setExpandEmptyStaged, stagedEmpty]);
  const toggleUnstaged = useCallback(() => {
    if (unstagedEmpty) setExpandEmptyUnstaged((value) => !value);
    else setCollapseUnstaged((value) => !value);
  }, [setCollapseUnstaged, setExpandEmptyUnstaged, unstagedEmpty]);
  const openDetail = useCallback(() => setNarrowDetailOpen(true), []);
  const closeDetail = useCallback(() => setNarrowDetailOpen(false), []);
  const clean = summary?.isValid && stagedFiles.length === 0 && unstagedFiles.length === 0;
  const [discardTarget, setDiscardTarget] = useState<{
    file: GitStatusFile; side: GitDiffSide; paths: string[]; repoPath: string; version: number;
    snapshot: Promise<string | null> | null;
  } | null>(null);
  const [discardCheck, setDiscardCheck] = useState<{
    target: typeof discardTarget; version: number; snapshot: string | null; error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!discardTarget?.snapshot) return;
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const snapshot = await discardTarget.snapshot;
        if (snapshot === null) throw new Error("Unable to check the selected files. Close this dialog and try again.");
        const currentSnapshot = discardTarget.version === repositoryStatusVersion
          ? snapshot
          : await window.githead.getDiscardSnapshot({ repoPath: discardTarget.repoPath, paths: discardTarget.paths, side: discardTarget.side });
        if (!cancelled) setDiscardCheck({
          target: discardTarget, version: repositoryStatusVersion, snapshot,
          error: snapshot === currentSnapshot ? null : "The selected files changed. Close this dialog and review the files again."
        });
      } catch {
        if (!cancelled) setDiscardCheck({
          target: discardTarget, version: repositoryStatusVersion, snapshot: null,
          error: "Unable to check the selected files. Close this dialog and try again."
        });
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [discardTarget, repositoryStatusVersion]);
  const discardCheckReady = discardCheck?.target === discardTarget && discardCheck?.version === repositoryStatusVersion;
  const discardError = discardTarget?.repoPath !== summary?.repoPath
    ? "The repository changed. Close this dialog and review the files again."
    : discardTarget?.snapshot
      ? (discardCheckReady ? discardCheck?.error : null)
      : discardTarget?.version !== repositoryStatusVersion
        ? "The repository changed. Close this dialog and review the files again."
        : null;
  const discardChecking = Boolean(discardTarget?.snapshot && !discardCheckReady);
  const discardCurrent = Boolean(discardTarget && !discardError && !discardChecking);
  const repoPath = summary?.repoPath ?? "";
  const repositoryKind = summary?.kind;
  const handleContextAction = useCallback((file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, explicitPaths?: string[]): void => {
    const paths = explicitPaths ?? getContextActionPaths(matchingSelection, file, side);
    if (kind === "revert") {
      setDiscardTarget({
        file, side, paths, repoPath, version: repositoryStatusVersion,
        snapshot: repositoryKind === "git"
          ? window.githead.getDiscardSnapshot({ repoPath, paths, side }).catch(() => null)
          : null
      });
    } else {
      if (kind === "toggle-stage") expectSelectionMove(side === "staged" ? "unstaged" : "staged", paths);
      onContextAction(file, side, kind, paths);
    }
  }, [expectSelectionMove, matchingSelection, onContextAction, repoPath, repositoryKind, repositoryStatusVersion]);
  const selectedFile = selection
    ? (selection.side === "staged" ? stagedFiles : unstagedFiles).find((file) => file.path === selection.path) ?? null
    : null;
  const canApplyHunks = Boolean(
    selection &&
    diff?.kind === "text" &&
    !diff.truncated &&
    !selectedFile?.isConflicted &&
    (summary?.capabilities.hunkStaging ?? true)
  );
  const selectedSide = selection?.side;
  const selectedPath = selection?.path;
  const hunkAction = useMemo<DiffHunkAction | undefined>(() => {
    if (!canApplyHunks || !selectedSide || selectedPath === undefined) return undefined;
    // The selection follows the file to the other group when its last hunk leaves this side.
    const applyHunk = (patch: string, discard?: boolean): void => {
      expectSelectionMove(selectedSide === "staged" ? "unstaged" : "staged", [selectedPath]);
      onApplyHunk(patch, discard);
    };
    return {
      side: selectedSide,
      disabled: disabled || diffChanged,
      onApply: applyHunk,
      onDiscard: selectedSide === "unstaged" ? (patch) => applyHunk(patch, true) : undefined
    };
  }, [canApplyHunks, diffChanged, disabled, expectSelectionMove, onApplyHunk, selectedPath, selectedSide]);
  const fileViewMode = workspaceMode === "plan" ? "plan" : viewMode;
  const ready = Boolean(summary?.isValid);

  const list = (
    <div className={`status-changes-list${workspaceMode === "plan" ? " is-plan" : ""}`}>
      <div className="status-file-toolbar">
        {workspaceMode === "files" ? <>
          <div className="status-file-search">
            <Search className="status-file-search-icon" aria-hidden="true" />
            <Input aria-label="Search changed files" placeholder="Filter files…" spellCheck={false} value={query} className="status-file-search-input"
              onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} />
            {query ? <TooltipButton type="button" variant="ghost" size="icon-xs" aria-label="Clear file search" tooltip="Clear file search" onClick={() => setQuery("")}><X /></TooltipButton> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="status-file-filter-trigger" data-active={statusFilter !== "all" ? "true" : undefined} aria-label="Filter files by status" title="Filter files by status">
                  <ListFilter aria-hidden="true" />
                  <span>{STATUS_FILE_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.short ?? "All"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFileFilter)}>
                  {STATUS_FILE_FILTER_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </> : <h2 className="status-plan-title">Commit plan</h2>}
        {(summary?.submodules?.length ?? 0) > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Submodules" tooltip="Submodules" disabled={disabled || recoveryMode}>
                <GitFork />
              </TooltipButton>
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
        <Segmented<StatusFileViewMode | "plan">
          label="Changed file view mode"
          className="status-file-view-mode ml-auto shrink-0"
          value={fileViewMode}
          onChange={(mode) => {
            if (mode === "plan") {
              onWorkspaceModeChange("plan");
              return;
            }
            onWorkspaceModeChange("files");
            onViewModeChange(mode);
          }}
          options={[
            { value: "list", label: <List />, ariaLabel: "List view", title: "Show files as a list" },
            { value: "tree", label: <ListTree />, ariaLabel: "Tree view", title: "Show files as a tree" },
            { value: "plan", label: <Sparkles />, ariaLabel: "Commit plan view", title: "Group files into planned commits", disabled: recoveryMode }
          ]}
        />
      </div>
      {summary?.statusTruncation ? <StatusTruncationNotice truncation={summary.statusTruncation} /> : null}
      {workspaceMode === "plan" ? (
        <CommitPlanView
          repoPath={repoPath}
          files={unstagedFiles}
          stagedCount={stagedFiles.length}
          selectedPath={selection?.side === "unstaged" ? selection.path : null}
          disabled={disabled || recoveryMode}
          supported={summary?.kind === "git"}
          canGenerate={canGeneratePlan}
          generateTitle={generatePlanTitle}
          repositoryChangeVersion={repositoryChangeVersion}
          onSelectFile={(file) => {
            onSelectFile(file, "unstaged", { extendRange: false, selectAll: false, toggle: false });
            openDetail();
          }}
          onGenerate={onGeneratePlan}
          onValidatePlan={onValidatePlan}
          onQuickCommit={onQuickCommit}
        />
      ) : (
        <div ref={setFileScroller} className="status-file-scroll" data-workspace-scroll-key="status-files">
          {clean ? (
            <EmptyState
              className="status-clean-state"
              icon={<CircleCheck />}
              title="Working tree clean"
              description={summary?.branch ? `Nothing to commit on ${summary.branch}` : "Nothing to commit"}
            />
          ) : <>
          <FileGroup
            title="Staged files"
            label="Staged"
            side="staged"
            files={matchingStagedFiles}
            totalCount={stagedFiles.length}
            filtering={filtering}
            collapsed={stagedCollapsed}
            onToggle={toggleStaged}
            emptyMessage="No staged files"
            ready={ready}
            selection={matchingSelection}
            disabled={disabled}
            recoveryMode={recoveryMode}
            viewMode={viewMode}
            scrollContainer={fileScroller}
            onSelectFile={onSelectFile}
            onOpenFile={openDetail}
            onStageFiles={stageGroupFiles}
            onUnstageFiles={unstageGroupFiles}
            onContextAction={handleContextAction}
            revealSelection={!selectionMove.moved}
          />
          <FileGroup
            title="Unstaged files"
            label="Changes"
            side="unstaged"
            files={matchingUnstagedFiles}
            totalCount={unstagedFiles.length}
            filtering={filtering}
            collapsed={unstagedCollapsed}
            onToggle={toggleUnstaged}
            emptyMessage="No unstaged files"
            ready={ready}
            selection={matchingSelection}
            disabled={disabled}
            recoveryMode={recoveryMode}
            viewMode={viewMode}
            scrollContainer={fileScroller}
            onSelectFile={onSelectFile}
            onOpenFile={openDetail}
            onStageFiles={stageGroupFiles}
            onUnstageFiles={unstageGroupFiles}
            onContextAction={handleContextAction}
            revealSelection={!selectionMove.moved}
          />
          </>}
        </div>
      )}
      {workspaceMode === "plan" ? null : commitBox}
    </div>
  );

  return (
    <>
      <ListDetailLayout
        id="changes"
        listLabel="changed files"
        list={list}
        detailOpen={narrowDetailOpen && selection !== null}
        onBack={closeDetail}
        detail={
          <div className="changes-detail">
            <DiffPanel
              title={selection?.path ?? "Select a file"}
              eyebrow={selection ? `${capitalize(selection.side)} diff` : "Diff"}
              diff={diff}
              filePath={selection?.path ?? ""}
              loading={diffLoading}
              emptyMessage={selection ? "Refresh the diff to view this file." : clean ? "No changes to show" : "Select a file to view the diff"}
              onDownloadImage={onDownloadImage}
              imageDownloadLoading={disabled}
              repoPath={repoPath}
              previewSource={selection && selectedFile && !selectedFile.submodule && (isMarkdownPath(selection.path) || isSvgPath(selection.path)) && !isDeletedOnSide(selectedFile, selection.side)
                ? { kind: selection.side === "staged" ? "staged" : "working" }
                : undefined}
              hunkAction={hunkAction}
              onRefresh={selection ? onRefreshDiff : undefined}
              refreshDisabled={disabled}
              changed={diffChanged}
              wrapLines={wrapLines}
              onWrapLinesChange={onWrapLinesChange}
              variant="card"
              status={selection && selectedFile ? getFileStatusVisuals(selectedFile, selection.side) : undefined}
            />
          </div>
        }
      />
      <Dialog open={Boolean(discardTarget)} onOpenChange={(open) => { if (!open) setDiscardTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fileActionLabel("Discard changes in", discardTarget?.paths.length ?? 0)}?</DialogTitle>
            <DialogDescription>Discard the {discardTarget?.side} changes in these files. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <ul className="dialog-code-block discard-path-list">{discardTarget?.paths.slice(0, 100).map((path) => <li key={path}>{path}</li>)}</ul>
          {discardTarget && discardTarget.paths.length > 100 ? <p className="text-sm text-muted-foreground">Showing the first 100 of {discardTarget.paths.length} files.</p> : null}
          {discardChecking ? <p role="status" className="text-sm text-muted-foreground">Checking selected files…</p> : null}
          {discardError ? <p role="alert" className="dialog-error">{discardError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={disabled || recoveryMode || !discardCurrent} onClick={() => {
              if (discardTarget && discardCurrent) {
                onContextAction(discardTarget.file, discardTarget.side, "revert", discardTarget.paths, discardTarget.snapshot ? discardCheck?.snapshot ?? undefined : undefined);
                setDiscardTarget(null);
              }
            }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {composer}
    </>
  );
}

type ContextActionKind = "open" | "show" | "copy" | "toggle-stage" | "stash" | "delete" | "revert" | "ignore" | "update-submodule";
type CommitFileContextActionKind = "log" | "blame" | "reset" | "open-current" | "open-selected" | "copy";

const STATUS_FILE_ROW_HEIGHT = 32;

const STATUS_FILE_FILTER_OPTIONS: ReadonlyArray<{ value: StatusFileFilter; label: string; short: string }> = [
  { value: "all", label: "All statuses", short: "All" },
  { value: "modified", label: "Modified", short: "Modified" },
  { value: "untracked", label: "Untracked", short: "Untracked" },
  { value: "added", label: "Added", short: "Added" },
  { value: "deleted", label: "Deleted", short: "Deleted" },
  { value: "renamed", label: "Renamed", short: "Renamed" },
  { value: "copied", label: "Copied", short: "Copied" },
  { value: "conflict", label: "Conflicted", short: "Conflicted" }
];

/** Memoised so that typing in the commit box, which re-renders the status view, skips both file lists. */
const FileGroup = memo(function FileGroup({
  title,
  label,
  totalCount,
  filtering,
  collapsed,
  onToggle,
  emptyMessage,
  side,
  files,
  ready,
  selection,
  disabled,
  recoveryMode,
  viewMode,
  scrollContainer,
  revealSelection,
  onSelectFile,
  onOpenFile,
  onStageFiles,
  onUnstageFiles,
  onContextAction
}: {
  /** The accessible name of the group and its list. */
  title: string;
  /** The visible group name. */
  label: string;
  totalCount: number;
  filtering: boolean;
  collapsed: boolean;
  /** Collapses or expands the group. Empty groups start collapsed to their header. */
  onToggle: () => void;
  emptyMessage: string;
  side: GitDiffSide;
  files: GitStatusFile[];
  /** False while the repository summary is missing or invalid. */
  ready: boolean;
  selection: FileSelection | null;
  disabled: boolean;
  recoveryMode: boolean;
  viewMode: StatusFileViewMode;
  /** The list column scroller that both file groups share. Null while its ref is pending. */
  scrollContainer: HTMLElement | null;
  /** False while the selection is one that a stage or unstage moved here from the other group. */
  revealSelection: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  /** Shows the diff in a narrow window. */
  onOpenFile: () => void;
  onStageFiles: (paths: string[], selection?: FileSelection) => void;
  onUnstageFiles: (paths: string[], selection?: FileSelection) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
}): ReactNode {
  const selectedPathSet = useMemo(
    () => selection?.side === side ? new Set(getSelectionPaths(selection)) : new Set<string>(),
    [selection, side]
  );
  const selectedFiles = useMemo(() => files.filter((file) => selectedPathSet.has(file.path)), [files, selectedPathSet]);
  const stageableSelectedCount = side === "staged" ? selectedFiles.length : selectedFiles.filter(canStageStatusFile).length;
  const canDiscardSelection = selectedFiles.every(canDiscardStatusFile);
  // The selection already holds only matching paths, in selection order.
  const selectionPaths = useMemo(() => selection?.side === side ? getSelectionPaths(selection) : [], [selection, side]);
  const actionablePaths = useMemo(
    () => (side === "staged" ? files : files.filter(canStageStatusFile)).map((file) => file.path),
    [files, side]
  );
  const actionablePathSet = useMemo(() => new Set(actionablePaths), [actionablePaths]);
  const selectionActionPaths = useMemo(
    () => side === "staged" ? selectionPaths : selectionPaths.filter((path) => actionablePathSet.has(path)),
    [actionablePathSet, selectionPaths, side]
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

  const orderedPaths = useMemo(() => viewMode === "tree"
    ? treeRows.flatMap((row) => row.kind === "file" ? [row.file.path] : [])
    : files.map((file) => file.path), [files, treeRows, viewMode]);
  const selectVisibleFile = (file: GitStatusFile, selectedSide: GitDiffSide, modifiers: FileSelectionModifiers): void => {
    onSelectFile(file, selectedSide, { ...modifiers, orderedPaths });
  };
  const navigateToFile = (file: GitStatusFile, event: KeyboardEvent<HTMLDivElement>): void => {
    if (!event.ctrlKey && !event.metaKey) {
      selectVisibleFile(file, side, { extendRange: event.shiftKey, selectAll: false, toggle: false });
    }
  };
  const toggleFolder = (id: string): void => setCollapsedFolders((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const applyToSelection = (): void => {
    if (selection?.side !== side || selectionActionPaths.length === 0) return;
    const targetSide: GitDiffSide = side === "staged" ? "unstaged" : "staged";
    const nextSelection = createFileSelection(targetSide, selectionPaths, selection.path, selection.anchorPath);
    if (side === "staged") onUnstageFiles(selectionActionPaths, nextSelection);
    else onStageFiles(selectionActionPaths, nextSelection);
  };
  const renderFileRow = (file: GitStatusFile, index: number, rowProps: VirtualRowProps, treeLevel?: number): ReactNode => {
    const selected = selectedPathSet.has(file.path);
    return (
      <FileRow
        key={`${side}:${file.path}`}
        file={file}
        side={side}
        selected={selected}
        selectedCount={selected ? selectedPathSet.size : 1}
        stageCount={selected ? stageableSelectedCount : side === "staged" || canStageStatusFile(file) ? 1 : 0}
        canDiscard={selected ? canDiscardSelection : canDiscardStatusFile(file)}
        disabled={disabled}
        recoveryMode={recoveryMode}
        onSelectFile={selectVisibleFile}
        onOpenFile={onOpenFile}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onContextAction={onContextAction}
        treeLevel={treeLevel}
        virtualIndex={index}
        virtualRowProps={rowProps}
      />
    );
  };
  const countLabel = filtering ? `${files.length} of ${totalCount}` : String(totalCount);
  const groupActionLabel = side === "staged"
    ? filtering ? `Unstage ${actionablePaths.length} matching` : "Unstage all"
    : filtering ? `Stage ${actionablePaths.length} matching` : "Stage all";
  const listRole = viewMode === "tree" ? "tree" : "listbox";

  return (
    <section className="status-file-group" aria-label={title}>
      <div className="status-file-group-header">
        <button type="button" className="status-file-group-toggle" aria-label={`${collapsed ? "Expand" : "Collapse"} ${title.toLowerCase()}`} aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
        <h2 className="status-file-group-title" onClick={onToggle}>{label} <span className="status-file-count">{countLabel}</span></h2>
        <div className="status-file-group-actions">
          {selectionPaths.length > 1 ? (
            <Button type="button" variant="ghost" size="xs" disabled={disabled || selectionActionPaths.length === 0} onClick={applyToSelection}>
              {fileActionLabel(side === "staged" ? "Unstage" : "Stage", selectionActionPaths.length)}
            </Button>
          ) : null}
          {totalCount > 0 ? (
            <TooltipButton
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={groupActionLabel}
              tooltip={groupActionLabel}
              disabled={disabled || actionablePaths.length === 0}
              onClick={() => side === "staged" ? onUnstageFiles(actionablePaths) : onStageFiles(actionablePaths)}
            >
              {side === "staged" ? <Minus /> : <Plus />}
            </TooltipButton>
          ) : null}
        </div>
      </div>
      {collapsed ? null : !ready ? (
        <div className="file-list" role={listRole} aria-label={title} aria-multiselectable="true" />
      ) : files.length === 0 ? (
        <div className="file-list is-empty" role={listRole} aria-label={title} aria-multiselectable="true">
          <EmptyState title={filtering && totalCount > 0 ? "No files match your search and filter" : emptyMessage} />
        </div>
      ) : viewMode === "tree" ? (
        <FixedSizeVirtualList
          items={treeRows}
          itemKey={(row) => row.kind === "folder" ? `${side}:folder:${row.folder.id}` : `${side}:${row.file.path}`}
          rowHeight={STATUS_FILE_ROW_HEIGHT}
          ariaLabel={title}
          role="tree"
          scrollContainer={scrollContainer}
          onNavigate={(row, event) => { if (row.kind === "file") navigateToFile(row.file, event); }}
          onItemKeyDown={(row, index, event) => {
            if (event.key === "ArrowRight" && row.kind === "folder") {
              event.preventDefault();
              if (collapsedFolders.has(row.folder.id)) toggleFolder(row.folder.id);
              else if (treeRows[index + 1]?.level === row.level + 1) return index + 1;
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              if (row.kind === "folder" && !collapsedFolders.has(row.folder.id)) toggleFolder(row.folder.id);
              else {
                for (let parent = index - 1; parent >= 0; parent -= 1) {
                  if (treeRows[parent]!.level < row.level) return parent;
                }
              }
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && row.kind === "folder") {
              const first = treeRows.find((candidate) => candidate.kind === "file");
              if (first?.kind === "file") selectVisibleFile(first.file, side, { extendRange: false, toggle: false, selectAll: true });
              event.preventDefault();
            }
            return undefined;
          }}
          selectedKey={selection?.side === side ? `${side}:${selection.path}` : null}
          revealSelection={revealSelection}
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
                onToggle={() => toggleFolder(row.folder.id)}
                onContextAction={onContextAction}
              />
            ) : renderFileRow(row.file, index, treeRowProps, row.level);
          }}
        />
      ) : (
        <FixedSizeVirtualList
          items={files}
          onNavigate={navigateToFile}
          itemKey={(file) => `${side}:${file.path}`}
          rowHeight={STATUS_FILE_ROW_HEIGHT}
          ariaLabel={title}
          scrollContainer={scrollContainer}
          selectedKey={selection?.side === side ? `${side}:${selection.path}` : null}
          revealSelection={revealSelection}
          className="file-list"
          renderItem={(file, index, rowProps) => renderFileRow(file, index, rowProps)}
        />
      )}
    </section>
  );
});

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
            data-folder-id={folder.id} data-virtual-index={virtualIndex} onClick={onToggle} tabIndex={virtualRowProps.tabIndex}>
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
          {fileActionLabel(side === "unstaged" ? "Stage" : "Unstage", actionableFiles.length)} in folder
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || recoveryMode || folder.descendantFiles.length === 0} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "stash", folder.descendantFiles.map((file) => file.path));
        }}>
          <Archive />
          {fileActionLabel("Stash", folder.descendantFiles.length)} in folder…
        </ContextMenuItem>
        <ContextMenuSeparator />
        {side === "unstaged" ? <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode || !folder.descendantFiles.every(canDiscardStatusFile)} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "revert", folder.descendantFiles.map((file) => file.path));
        }}>
          <RotateCcw />
          {fileActionLabel("Discard changes in", folder.descendantFiles.length)}…
        </ContextMenuItem> : null}
        <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode} onSelect={() => {
          const first = folder.descendantFiles[0];
          if (first) onContextAction(first, side, "delete", folder.descendantFiles.map((file) => file.path));
        }}>
          <Trash2 />
          {fileActionLabel("Delete", folder.descendantFiles.length)} in folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface StashComposerState {
  open: boolean;
  paths: string[];
}


function StatusTruncationNotice({ truncation }: { truncation: GitStatusTruncation }): ReactNode {
  const shown = `Showing the first ${truncation.shownFileCount.toLocaleString()} changed files.`;
  return (
    <div className="dialog-notice status-truncation-notice" data-tone="warning" role="status">
      <TriangleAlert aria-hidden="true" />
      <div>
        <p className="dialog-notice-title">{truncation.trackedComplete ? "Too many untracked files" : "Too many changed files"}</p>
        <p className="text-muted-foreground">
          {truncation.trackedComplete
            ? `${shown} Every staged and modified file is listed. Add generated folders to .gitignore to see the rest.`
            : `${shown} Some staged or modified files are not listed.`}
        </p>
      </div>
    </div>
  );
}

function FileRow({
  file,
  side,
  selected,
  selectedCount,
  stageCount,
  canDiscard,
  disabled,
  recoveryMode,
  onSelectFile,
  onOpenFile,
  onStageFiles,
  onUnstageFiles,
  onContextAction,
  treeLevel,
  virtualIndex,
  virtualRowProps
}: {
  file: GitStatusFile;
  side: GitDiffSide;
  selected: boolean;
  selectedCount: number;
  stageCount: number;
  canDiscard: boolean;
  disabled: boolean;
  recoveryMode: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onOpenFile: () => void;
  onStageFiles: (paths: string[], selection?: FileSelection) => void;
  onUnstageFiles: (paths: string[], selection?: FileSelection) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind, paths?: string[]) => void;
  treeLevel?: number | undefined;
  virtualIndex?: number;
  virtualRowProps?: VirtualRowProps;
}): ReactNode {
  const actionLabel = side === "unstaged" ? "Stage" : "Unstage";
  const deleted = isDeletedOnSide(file, side);
  // The row buttons act on this file only. A selected file moves its selection to the other side.
  const nextSelection = (targetSide: GitDiffSide): FileSelection | undefined => selected
    ? createFileSelection(targetSide, [file.path], file.path, file.path)
    : undefined;

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
        <div
          className={`file-row${selected ? " is-selected" : ""}`}
          data-path={file.path}
          style={treeLevel
            ? { ...virtualRowProps?.style, paddingLeft: `${(treeLevel - 1) * 18}px` }
            : virtualRowProps?.style}
        >
          <button
            type="button"
            className="file-row-main"
            role={treeLevel ? "treeitem" : "option"}
            aria-level={treeLevel}
            aria-selected={selected}
            aria-label={`${getFileStatusVisuals(file, side).label} ${file.originalPath ? `${file.originalPath} -> ` : ""}${file.path}`}
            tabIndex={virtualRowProps?.tabIndex}
            aria-posinset={virtualRowProps?.["aria-posinset"]}
            aria-setsize={virtualRowProps?.["aria-setsize"]}
            data-virtual-index={virtualIndex}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              const extendRange = event.shiftKey;
              const toggle = event.ctrlKey || event.metaKey;
              onSelectFile(file, side, { extendRange, selectAll: false, toggle });
              if (!extendRange && !toggle) onOpenFile();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
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
              <span className="status-file-path">
                <span className="status-file-name">{fileName(file.path)}</span>
                {!treeLevel && file.path.includes("/") ? <span className="status-file-directory">{file.path.slice(0, file.path.lastIndexOf("/"))}</span> : null}
                {file.originalPath ? <span className="status-file-directory">← {file.originalPath}</span> : null}
              </span>
            </TooltipTarget>
          </button>
          <span className="file-row-actions">
            {side === "unstaged" && canDiscardStatusFile(file) ? (
              <FileRowActionButton
                label={`Discard changes in ${file.path}`}
                tooltip="Discard changes"
                disabled={disabled || recoveryMode}
                onClick={() => onContextAction(file, side, "revert", [file.path])}
              >
                <Undo2 />
              </FileRowActionButton>
            ) : null}
            {side === "unstaged" ? canStageStatusFile(file) ? (
              <FileRowActionButton
                label={`Stage ${file.path}`}
                tooltip="Stage file"
                disabled={disabled}
                onClick={() => onStageFiles([file.path], nextSelection("staged"))}
              >
                <Plus />
              </FileRowActionButton>
            ) : null : (
              <FileRowActionButton
                label={`Unstage ${file.path}`}
                tooltip="Unstage file"
                disabled={disabled}
                onClick={() => onUnstageFiles([file.path], nextSelection("unstaged"))}
              >
                <Minus />
              </FileRowActionButton>
            )}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>{selectedCount === 1 ? "1 file selected" : `${selectedCount} files selected`}</ContextMenuLabel>
        <ContextMenuItem disabled={disabled || stageCount === 0} onSelect={() => onContextAction(file, side, "toggle-stage")}>
          <Save />{fileActionLabel(actionLabel, stageCount)}
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "stash")}>
          <Archive />{fileActionLabel("Stash", selectedCount)}…
        </ContextMenuItem>
        <ContextMenuSeparator />
        {selectedCount > 1 ? <ContextMenuLabel className="truncate" title={file.path}>For {fileName(file.path)}</ContextMenuLabel> : null}
        <ContextMenuItem disabled={deleted || (Boolean(file.submodule) && disabled)} onSelect={() => onContextAction(file, side, "open")}>
          <ExternalLink />{file.submodule ? "Open submodule" : "Open"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction(file, side, "show")}>
          <MapPinned />Show in Explorer
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction(file, side, "copy")}>
          <Clipboard />Copy path
        </ContextMenuItem>
        {file.submodule ? <ContextMenuItem disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "update-submodule")}>
          <RefreshCw />Initialize / Update
        </ContextMenuItem> : <ContextMenuItem disabled={disabled || recoveryMode || deleted} onSelect={() => onContextAction(file, side, "ignore")}>
          <FileCode2 />Add to ignore
        </ContextMenuItem>}
        {!file.submodule ? <>
          <ContextMenuSeparator />
          {side === "unstaged" ? <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode || !canDiscard} onSelect={() => onContextAction(file, side, "revert")}>
            <RotateCcw />{fileActionLabel("Discard changes in", selectedCount)}…
          </ContextMenuItem> : null}
          <ContextMenuItem variant="destructive" disabled={disabled || recoveryMode} onSelect={() => onContextAction(file, side, "delete")}>
            <Trash2 />{fileActionLabel("Delete", selectedCount)}
          </ContextMenuItem>
        </> : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * A row hover action. It is out of the tab order: the row is one stop in the list, and the context
 * menu offers the same actions from the keyboard.
 */
function FileRowActionButton({ label, tooltip, disabled, onClick, children }: {
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function fileActionLabel(action: string, count: number): string {
  return count === 0 ? action : `${action} ${count} ${count === 1 ? "file" : "files"}`;
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
  onWrapLinesChange,
  variant = "default",
  status
}: {
  title: string;
  /** Names the panel for assistive technology and its scroll key. Only the default variant shows it. */
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
  /**
   * "default" keeps the eyebrow header. "card" fills a surface card with the V2 file header
   * (status chip, path, line stats, icon actions). "embedded" uses the same header inside a card
   * that also shows other content.
   */
  variant?: DiffPanelVariant;
  /** The status chip that the card and embedded headers show before the path. */
  status?: FileStatusVisuals | undefined;
}): ReactNode {
  const [showPreview, setShowPreview] = useState(false);
  const fileHeader = variant !== "default";
  const diffText = fileHeader && diff?.kind === "text" && !diff.truncated ? diff.text : null;
  // A truncated diff would undercount, so the header shows no stats for it.
  const lineChanges = useMemo(() => diffText === null ? null : countDiffLineChanges(diffText), [diffText]);
  const previewKey = previewSource
    ? `${repoPath}\0${filePath}\0${previewSource.kind}\0${previewSource.kind === "commit" ? previewSource.hash : ""}`
    : "";
  const readingPosition = useMemo(() => ({ scrollTop: 0 }), [previewKey]);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState(previewKey);
  const previewVisible = showPreview && selectedPreviewKey === previewKey;
  const svgFile = isSvgPath(filePath);
  const previewRequest = previewSource ? { repoPath, path: filePath, source: previewSource } : null;
  const preview = useMarkdownFilePreview(!svgFile ? previewRequest : null, diff, previewVisible && !svgFile);
  const imagePreview = useImageFilePreview(svgFile ? previewRequest : null, diff, previewVisible && svgFile);
  const togglePreview = (): void => {
    setSelectedPreviewKey(previewKey);
    setShowPreview(!previewVisible);
  };

  let content: ReactNode = <EmptyState title={emptyMessage} />;
  let outputClass = "diff-output";

  if (previewVisible && previewSource && svgFile) {
    outputClass = "diff-output image";
    content = imagePreview.loading && !imagePreview.image
      ? <LoadingState label="Loading SVG preview" className="h-full" />
      : imagePreview.error && !imagePreview.image
        ? <p className="markdown-preview-status bad selectable-text" role="alert">{imagePreview.error}</p>
        : imagePreview.image
          ? <div className="image-diff-wrap" aria-label={`SVG preview for ${filePath}`}>
            {imagePreview.error ? <p className="markdown-preview-status bad selectable-text" role="alert">{imagePreview.error}</p> : null}
            <div className="image-diff is-single">
              <ImageDiffPane side="Preview" filePath={filePath} imageSide={{ status: "available", version: imagePreview.image }} missingMessage="SVG preview is unavailable." />
            </div>
          </div>
          : null;
  } else if (previewVisible && previewSource) {
    outputClass = "markdown-preview-output";
    content = preview.loading && preview.text === null
      ? <LoadingState label="Loading Markdown preview" className="h-full" />
      : preview.error && preview.text === null
        ? <p className="markdown-preview-status bad selectable-text" role="alert">{preview.error}</p>
        : (
          <OptionalFeatureBoundary name="Markdown preview">
            <MarkdownDocument key={previewKey} text={preview.text ?? ""} repoPath={repoPath} path={filePath} source={previewSource} readingPosition={readingPosition} revision={preview.revision} refreshing={preview.loading} error={preview.error}
              diff={diff?.kind === "text" ? <DiffRows filePath={filePath} text={diff.text} truncated={Boolean(diff.truncated)} hunkAction={hunkAction} /> : undefined} />
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

  const output = (
    <div data-workspace-scroll-key={`diff:${eyebrow}`} className={`${outputClass}${changed ? " is-changed" : ""}`}>
      {content}
    </div>
  );

  if (fileHeader) {
    return (
      <section className="diff-panel" data-variant={variant} aria-label={eyebrow}>
        <div className="diff-panel-header">
          <div className="diff-panel-heading">
            {status ? <FileStatusChip visuals={status} /> : null}
            <TooltipTarget overflowOnly content={title}><h2 className="diff-panel-path">{title}</h2></TooltipTarget>
            {changed ? <p className="diff-changed-description" role="status">Loaded diff is out of date</p> : null}
          </div>
          <div className="diff-panel-actions">
            {lineChanges && !previewVisible ? (
              <span className="diff-panel-stats">
                <span className="sr-only">{formatDiffLineChanges(lineChanges)}</span>
                <span className="diff-panel-additions" aria-hidden="true">+{lineChanges.additions}</span>
                <span className="diff-panel-deletions" aria-hidden="true">−{lineChanges.deletions}</span>
              </span>
            ) : null}
            {diff?.kind === "text" && !previewVisible ? (
              <TooltipButton
                type="button"
                variant="ghost"
                size="icon-xs"
                className="aria-pressed:bg-selected aria-pressed:text-foreground"
                aria-label="Wrap diff lines"
                aria-pressed={wrapLines}
                tooltip={wrapLines ? "Use horizontal scrolling" : "Wrap long diff lines"}
                onClick={() => onWrapLinesChange(!wrapLines)}
              >
                <WrapText />
              </TooltipButton>
            ) : null}
            {previewSource ? (
              <Button type="button" variant="ghost" size="xs" aria-pressed={previewVisible} onClick={togglePreview}>
                <Eye />
                {previewVisible ? "Show diff" : "Preview"}
              </Button>
            ) : null}
            {onRefresh && changed ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="diff-changed-refresh"
                disabled={refreshDisabled || loading}
                onClick={() => onRefresh()}
              >
                <RefreshCw />
                New diff available
              </Button>
            ) : onRefresh ? (
              <TooltipButton
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={loading ? "Loading diff" : "Refresh diff"}
                tooltip={loading ? "Loading diff" : "Refresh diff"}
                disabled={refreshDisabled || loading}
                onClick={() => onRefresh()}
              >
                <RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
              </TooltipButton>
            ) : null}
          </div>
        </div>
        {output}
      </section>
    );
  }

  return (
    <section className="diff-panel grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card" data-variant={variant} aria-label={eyebrow}>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <TooltipTarget overflowOnly content={title}><h2 className="truncate text-sm font-medium">{title}</h2></TooltipTarget>
          {changed ? <p className="diff-changed-description" role="status">Loaded diff is out of date</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {diff?.kind === "text" && !previewVisible ? (
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
              aria-pressed={previewVisible}
              onClick={togglePreview}
            >
              <Eye />
              {previewVisible ? "Show diff" : "Preview"}
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
              onRefresh();
            }}>
              <RefreshCw />
              {changed ? "New diff available" : loading ? "Loading diff" : "Refresh diff"}
            </Button>
          ) : null}
        </div>
      </div>
      {output}
    </section>
  );
}

type DiffPanelVariant = "default" | "card" | "embedded";

function formatDiffLineChanges({ additions, deletions }: DiffLineChangeCounts): string {
  return `${additions} ${additions === 1 ? "line" : "lines"} added, ${deletions} ${deletions === 1 ? "line" : "lines"} deleted`;
}

function HistoryView({
  summary,
  historyScope,
  history,
  historyLoading,
  historyLoadingMore,
  historyHasMore,
  onLoadMoreHistory,
  onRetryHistory,
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
  onCopyCommit,
  onCommitFileContextAction,
  onDownloadImage,
  onWrapLinesChange
}: {
  summary: RepoSummary | null;
  historyScope: CommitHistoryScope;
  history: GitCommitGraphRow[];
  historyLoading: boolean;
  historyLoadingMore: boolean;
  historyHasMore: boolean;
  onLoadMoreHistory: () => void;
  onRetryHistory: () => void;
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
  onCopyCommit: (commit: Pick<GitCommitGraphRow, "hash">) => Promise<void>;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
  onCommitFileContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
  onDownloadImage: () => void;
  onWrapLinesChange: (wrap: boolean) => void;
}): ReactNode {
  const graphDefaultBranch = getRemoteDefaultBranch(summary);
  const graphMainBranch = graphDefaultBranch?.branch;
  const graphMainRemote = graphDefaultBranch?.name;
  const graphLayout = useMemo(() => buildCommitGraphLayout(
    history,
    graphMainBranch && graphMainRemote ? [graphMainBranch, graphMainRemote] : undefined
  ), [history, graphMainBranch, graphMainRemote]);
  const associations = useMemo(() => createCommitAssociationMap(insights), [insights]);
  const columnLayout = usePersistentColumnLayout("githead.column-layout.history", HISTORY_COLUMNS);
  const columnVisibility = columnLayout.layout.visibility;
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false);
  const openDetail = useCallback(() => setNarrowDetailOpen(true), []);
  const closeDetail = useCallback(() => setNarrowDetailOpen(false), []);
  const selectedCommitFile = selectedCommitFilePath
    ? commitDetails?.files.find((file) => file.path === selectedCommitFilePath) ?? null
    : null;
  const selectedHistoryCommit = useMemo(
    () => selectedCommitHash ? history.find((commit) => commit.hash === selectedCommitHash) ?? null : null,
    [history, selectedCommitHash]
  );
  // A parent opened from the card can be outside the loaded rows, so the card falls back to the details.
  const detailsCommit = useMemo(() => commitDetails ? createCommitRowFromDetails(commitDetails) : null, [commitDetails]);
  const cardCommit = commitDetails
    ? selectedHistoryCommit?.hash === commitDetails.hash ? selectedHistoryCommit : detailsCommit
    : null;
  const tagsEnabled = summary?.capabilities.tags ?? true;
  const containedInCurrentBranch = historyScope === "current";
  const showHistoryScope = summary?.isValid && summary.kind === "git";
  const graphVisible = columnVisibility.graph;
  const historyStyle = {
    // The list padding (8px) plus the row padding (4px), measured from the list column edge.
    "--history-graph-offset": "calc(12px)",
    "--history-graph-width": `${graphLayout.width}px`
  } as CSSProperties;

  const list = (
    <section style={historyStyle} className="history-list-column grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" aria-label="Commit list" onScrollCapture={(event) => {
      const source = event.target;
      if (!(source instanceof HTMLElement)) return;
      if (source.classList.contains("history-list") && source.scrollTop > 0
        && source.scrollHeight - source.scrollTop - source.clientHeight < COMMIT_GRAPH_ROW_HEIGHT * 8
        && historyHasMore && !historyLoading && !historyError) onLoadMoreHistory();
    }}>
      <div className="history-scope-toolbar">
        {showHistoryScope ? (
          <Segmented<CommitHistoryScope>
            label="Commit history scope"
            size="sm"
            value={historyScope}
            options={HISTORY_SCOPE_OPTIONS}
            onChange={onHistoryScopeChange}
          />
        ) : null}
        <ColumnVisibilityMenu columns={HISTORY_COLUMNS} controller={columnLayout} iconOnly />
      </div>
      <div className="history-list-shell">
        {insightsError ? (
          <div className="history-insights-error" role="status">
            <span>GitHub annotations unavailable.</span>
            <Button type="button" variant="ghost" size="sm" onClick={onRetryInsights}>Retry</Button>
          </div>
        ) : insightsLoading ? <span className="sr-only" role="status">Loading GitHub annotations</span> : null}
        {history.length === 0 ? (
          <div className="history-list" role={historyError ? "group" : "listbox"} aria-label="Commit history">
            {historyLoading ? (
              <LoadingState label="Loading commit history" className="h-full" />
            ) : historyError ? (
              <div className="space-y-3 p-4">
                <p className="bad selectable-text" role="alert">{historyError}</p>
                <Button type="button" variant="outline" size="sm" aria-label="Retry loading commit history" onClick={onRetryHistory}>
                  Retry
                </Button>
              </div>
            ) : summary?.isValid ? (
              <EmptyState title="No commits in this repository." />
            ) : null}
          </div>
        ) : (
          <>
            {historyLoading ? <span className="sr-only" role="status">Refreshing commit history</span> : null}
            {historyError ? (
              <div className="history-refresh-error selectable-text" role="status">
                Unable to load commit history: {historyError}
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
              renderOverlay={(range) => graphVisible ? (
                <CommitGraphSvg
                  layout={graphLayout}
                  selectedCommitHash={selectedCommitHash}
                  visibleStartRow={range.start}
                  visibleEndRow={range.end}
                />
              ) : null}
              renderItem={(commit, _index, virtualRowProps) => (
                <HistoryRow
                  commit={commit}
                  selected={commit.hash === selectedCommitHash}
                  tagsEnabled={tagsEnabled}
                  containedInCurrentBranch={containedInCurrentBranch}
                  allowCherryPickingContainedCommits={allowCherryPickingContainedCommits}
                  isHead={commit.hash === currentHeadHash}
                  amendDisabled={disabled}
                  amendDisabledReason={amendDisabledReason}
                  {...(associations.get(commit.hash) ? { association: associations.get(commit.hash)! } : {})}
                  onOpenExternalUrl={onOpenExternalUrl}
                  onSelectCommit={onSelectCommit}
                  onOpenDetail={openDetail}
                  onCommitContextAction={onCommitContextAction}
                  columnVisibility={columnVisibility}
                  virtualRowProps={virtualRowProps}
                />
              )}
            />
            {historyHasMore ? (
              <div className="history-load-more">
                <Button type="button" variant="ghost" size="sm" disabled={historyLoading} onClick={onLoadMoreHistory}>
                  {historyLoadingMore ? "Loading commits…" : historyError ? "Retry loading commits" : "Load more commits"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );

  return (
    <ListDetailLayout
      id="history"
      listLabel="commit list"
      list={list}
      detailOpen={narrowDetailOpen && selectedCommitHash !== null}
      onBack={closeDetail}
      detailCard={false}
      detail={
        <CommitDetailsPanel
          onCopyCommit={onCopyCommit}
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
          actions={cardCommit ? (
            <CommitActionsMenu
              commit={cardCommit}
              items={getCommitActionItems({
                tagsEnabled,
                cherryPickDisabled: containedInCurrentBranch && !allowCherryPickingContainedCommits,
                isHead: cardCommit.hash === currentHeadHash,
                amendDisabled: disabled,
                amendDisabledReason
              })}
              onAction={onCommitContextAction}
            />
          ) : null}
          diff={
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
              previewSource={selectedCommitHash && selectedCommitFile && selectedCommitFile.status !== "D" && (isMarkdownPath(selectedCommitFile.path) || isSvgPath(selectedCommitFile.path))
                ? { kind: "commit", hash: selectedCommitHash }
                : undefined}
              wrapLines={wrapLines}
              onWrapLinesChange={onWrapLinesChange}
              variant="embedded"
              status={selectedCommitFile ? getCommitFileStatusVisuals(selectedCommitFile.status) : undefined}
            />
          }
        />
      }
    />
  );
}

const HISTORY_SCOPE_OPTIONS = [
  { value: "current", label: "Current branch" },
  { value: "all", label: "All branches" }
] as const satisfies readonly SegmentedOption<CommitHistoryScope>[];

/** The widths only keep the stored layout readable. The two-line rows use the visibility alone. */
const HISTORY_COLUMNS = [
  { id: "graph", label: "Graph", defaultWidth: 82, minWidth: 28 },
  { id: "description", label: "Description", defaultWidth: 360, minWidth: 180 },
  { id: "date", label: "Date", defaultWidth: 112, minWidth: 90 },
  { id: "author", label: "Author", defaultWidth: 150, minWidth: 90 },
  { id: "commit", label: "Commit", defaultWidth: 80, minWidth: 72 },
  { id: "references", label: "References", defaultWidth: 220, minWidth: 120, defaultVisible: false },
  { id: "pullRequest", label: "Pull request", defaultWidth: 120, minWidth: 92, defaultVisible: false },
  { id: "checks", label: "Checks", defaultWidth: 110, minWidth: 82, defaultVisible: false }
] as const satisfies readonly ColumnDefinition<HistoryColumnId>[];

function createCommitRowFromDetails(details: GitCommitDetails): GitCommitGraphRow {
  return {
    hash: details.hash,
    shortHash: details.shortHash,
    parents: details.parents,
    refs: details.refs,
    subject: details.subject,
    authorName: details.authorName,
    authorEmail: details.authorEmail,
    authorDate: details.authorDate,
    relativeDate: ""
  };
}

function CommitActionsMenu({
  commit,
  items,
  onAction
}: {
  commit: GitCommitGraphRow;
  items: readonly CommitActionItem[];
  onAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipButton type="button" variant="ghost" size="icon-xs" className="commit-actions-trigger" aria-label="Commit actions" tooltip="Commit actions">
          <Ellipsis />
        </TooltipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <CommitActionDropdownMenuItems items={items} commit={commit} onAction={onAction} />
      </DropdownMenuContent>
    </DropdownMenu>
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
  }, [summary?.repoPath]);
  useEffect(() => {
    setSelectedRun((current) => current ? workflowRuns.find((run) => run.id === current.id) ?? current : null);
  }, [workflowRuns]);
  const closeDetail = (): void => {
    const runId = selectedRun?.id;
    setSelectedRun(null);
    if (runId !== undefined) focusGitHubRowLater(`workflowRun:${runId}`);
  };

  return (
    <ListDetailLayout
      id="github-workflow-runs"
      listLabel="workflow run list"
      detailOpen={selectedRun !== null}
      onBack={closeDetail}
      detail={selectedRun && repository ? (
        <WorkflowRunConsole
          active={active}
          repoPath={summary?.repoPath ?? ""}
          githubFullName={repository.fullName}
          run={selectedRun}
          onClose={closeDetail}
          onOpenExternalUrl={onOpenExternalUrl}
          onRunChanged={onRefresh}
        />
      ) : <WorkflowRunEmptyDetails />}
      list={(
      <section className="github-view" aria-label="Workflow runs">
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
              <WorkflowRunRow key={run.id} run={run} active={active} selected={selectedRun?.id === run.id} onSelect={setSelectedRun} />
            ))
          )}
          {error && workflowRuns.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
          <GitHubListFooter label="workflow runs" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
        </div>
        <GitHubListCaption countLabel={countLabel} />
      </section>
      )}
    />
  );
}

function WorkflowRunRow({
  run,
  active,
  selected,
  onSelect
}: {
  run: GitHubWorkflowRun;
  active: boolean;
  selected: boolean;
  onSelect: (run: GitHubWorkflowRun) => void;
}): ReactNode {
  const statusText = formatWorkflowRunStatus(run);
  const title = run.displayTitle || run.commitMessage || run.name;

  return (
    <div
      className={`github-row workflow-run-row ${selected ? "is-selected" : ""}`}
      role="listitem"
      aria-current={selected ? "true" : undefined}
      data-github-row={`workflowRun:${run.id}`}
    >
      <button type="button" className="github-row-button" aria-label={`${run.name}: ${title}`} aria-pressed={selected} onClick={() => onSelect(run)}>
        <span className="github-row-icon">
          <RunStatusIcon status={run.status} conclusion={run.conclusion} />
          <span className="sr-only">{statusText}</span>
        </span>
        <span className="github-row-body">
          <span className="workflow-run-row-heading">
            <TooltipTarget overflowOnly content={run.name}><strong>{run.name}</strong></TooltipTarget>
            <span className="github-issue-number">{run.runNumber === null ? "Run" : `#${run.runNumber}`}</span>
            <TooltipTarget content={<WorkflowRunTiming run={run} active={active} />}>
              <span className="github-row-time">{formatRelativeDate(run.updatedAt)}</span>
            </TooltipTarget>
          </span>
          <TooltipTarget overflowOnly content={title}><span className="github-row-title">{title}</span></TooltipTarget>
          <span className="github-row-meta">
            <TooltipTarget overflowOnly content={run.branch}><span className="truncate">{run.branch}</span></TooltipTarget>
            <span aria-hidden="true">·</span>
            <span className="truncate">{formatWorkflowEvent(run.event)}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

/** Tooltip details that the compact run row leaves out. */
function WorkflowRunTiming({ run, active }: { run: GitHubWorkflowRun; active: boolean }): ReactNode {
  return <span className="grid gap-0.5">
    <span>Updated {formatDate(run.updatedAt)}</span>
    <span>Triggered by {run.actor.login}</span>
    <span>Duration <WorkflowDuration startedAt={run.startedAt} completedAt={run.status === "completed" ? run.updatedAt : ""} running={run.status === "in_progress"} active={active} /></span>
  </span>;
}

function WorkflowRunEmptyDetails(): ReactNode {
  return <EmptyState
    as="section"
    className="h-full"
    headingLevel={2}
    icon={<Workflow />}
    title="Select a workflow run"
    description="Choose a run to inspect jobs, steps, timing, logs, and available run actions."
  />;
}

/**
 * Returns focus to a list row after its detail closes. The row is found again by its key, because a
 * narrow window mounts the list again when the detail closes.
 */
function focusGitHubRowLater(rowKey: string): void {
  requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-github-row]")).find((element) => element.dataset.githubRow === rowKey);
    row?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
  });
}

/** The caption row at the bottom of a GitHub list column: the count, then optional actions. */
function GitHubListCaption({ countLabel, children }: { countLabel: string; children?: ReactNode }): ReactNode {
  const showCount = countLabel !== "-";
  if (!showCount && !children) return null;
  return <div className="github-list-caption">
    {/* The toolbar's status region announces the same count. */}
    {showCount ? <p aria-hidden="true">{countLabel}</p> : null}
    {children}
  </div>;
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
  onCheckRemote,
  showCreatePullRequest,
  branchPullRequests,
  createPullRequestDisabled,
  onCreatePullRequest
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
  /** Shows the Create pull request action when the current branch has no pull request yet. */
  showCreatePullRequest: boolean;
  /** Pull requests whose head is the current branch. */
  branchPullRequests: GitHubPullRequestAssociation[];
  createPullRequestDisabled: boolean;
  onCreatePullRequest: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const [selectedPullRequest, setSelectedPullRequest] = useState<GitHubPullRequest | null>(null);
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
  }, [summary?.repoPath]);
  const closeDetail = (): void => {
    const number = selectedPullRequest?.number;
    setSelectedPullRequest(null);
    if (number !== undefined) focusGitHubRowLater(`pullRequest:${number}`);
  };

  return (
    <ListDetailLayout
      id="github-pull-requests"
      listLabel="pull request list"
      detailOpen={selectedPullRequest !== null}
      onBack={closeDetail}
      detail={selectedPullRequest && repository ? (
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
      ) : <PullRequestEmptyDetails />}
      list={(
    <section className="github-view" aria-label="Pull requests">
      <GitHubQueryToolbar compact activeFilterCount={activeFilterCount} refreshDisabled={!repository} refreshing={loading || busy} onRefresh={onRefresh} view="pullRequests" search={query.search ?? ""} preset={preset} presets={[{ value: "all", label: "All open" }, { value: "branch", label: "Current branch", disabled: !summary?.branch }, { value: "authored", label: "Authored by me", disabled: !viewerLogin }, { value: "assigned", label: "Assigned to me", disabled: !viewerLogin }, { value: "review", label: "Review requested", disabled: !viewerLogin }, { value: "drafts", label: "Drafts" }, { value: "custom", label: "Custom" }]} sort={`${query.sort}-${query.direction}`} sortOptions={[{ value: "updated-desc", label: "Recently updated" }, { value: "created-desc", label: "Newest" }, { value: "created-asc", label: "Oldest" }]} viewerAvailable={Boolean(viewerLogin)} status={loading || busy ? "Loading pull requests" : countLabel} onSearchChange={(value) => { onPresetChange("custom"); onQueryChange({ ...query, search: value || undefined }); }} onPresetChange={applyPreset} onSortChange={(value) => { const [sort, direction] = value.split("-") as ["updated" | "created", "asc" | "desc"]; onQueryChange({ ...query, sort, direction }); }} onClear={() => applyPreset("all")}>
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
              onSelect={setSelectedPullRequest}
            />
          ))
        )}
        {error && pullRequests.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
        <GitHubListFooter label="pull requests" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
      </div>
      <GitHubListCaption countLabel={countLabel}>
        <CurrentBranchPullRequestAction
          showCreatePullRequest={showCreatePullRequest}
          branchPullRequests={branchPullRequests}
          disabled={createPullRequestDisabled}
          onCreatePullRequest={onCreatePullRequest}
          onOpenExternalUrl={onOpenExternalUrl}
        />
      </GitHubListCaption>
    </section>
      )}
    />
  );
}

/** The current branch's pull request, or the Create pull request action when it has none. */
function CurrentBranchPullRequestAction({ showCreatePullRequest, branchPullRequests, disabled, onCreatePullRequest, onOpenExternalUrl }: {
  showCreatePullRequest: boolean;
  branchPullRequests: GitHubPullRequestAssociation[];
  disabled: boolean;
  onCreatePullRequest: () => void;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  const [onlyPullRequest] = branchPullRequests;
  if (branchPullRequests.length === 1 && onlyPullRequest) {
    return <Button type="button" variant="outline" className="github-list-caption-action" onClick={() => onOpenExternalUrl(onlyPullRequest.url)}>
      <GitPullRequest />
      PR #{onlyPullRequest.number} · {formatPullRequestAssociationState(onlyPullRequest)}
      <ExternalLink />
    </Button>;
  }
  if (branchPullRequests.length > 1) {
    return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="github-list-caption-action"><GitPullRequest />Multiple pull requests<ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {branchPullRequests.map((pullRequest) => (
          <DropdownMenuItem key={`${pullRequest.headRepositoryFullName}:${pullRequest.number}`} onSelect={() => onOpenExternalUrl(pullRequest.url)}>
            {pullRequest.headRepositoryFullName ?? pullRequest.baseRepositoryFullName} #{pullRequest.number} · {formatPullRequestAssociationState(pullRequest)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>;
  }
  if (!showCreatePullRequest) return null;
  return <Button type="button" variant="outline" className="github-list-caption-action" disabled={disabled} onClick={onCreatePullRequest}>
    <Plus />
    Create pull request…
  </Button>;
}

function PullRequestRow({
  pullRequest,
  selected,
  onSelect
}: {
  pullRequest: GitHubPullRequest;
  selected: boolean;
  onSelect: (pullRequest: GitHubPullRequest) => void;
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
    onSelect={() => onSelect(pullRequest)}
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
    setCreateIssueDialog(EMPTY_CREATE_ISSUE_DIALOG);
    return abandonCreateIssueMutation;
  }, [abandonCreateIssueMutation, summary?.repoPath]);
  const closeDetail = (): void => {
    const number = selectedIssue?.number;
    setSelectedIssue(null);
    if (number !== undefined) focusGitHubRowLater(`issue:${number}`);
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
    <ListDetailLayout
      id="github-issues"
      listLabel="issue list"
      detailOpen={selectedIssue !== null}
      onBack={closeDetail}
      detail={selectedIssue && repository ? (
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
      ) : <IssueEmptyDetails />}
      list={(
    <section className="github-view" aria-label="Issues">
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
              onSelect={setSelectedIssue}
            />
          ))
        )}
        {error && issues.length ? <GitHubFailureState failure={failure} fallback={error} stale onRetry={onRefresh} onConnect={onConnectGitHub} onReviewAccess={onReviewAccess} onCheckRemote={onCheckRemote} /> : null}
        <GitHubListFooter label="issues" nextPage={nextPage} loading={loadingMore} error="" disabled={busy} onLoadMore={onLoadMore} />
      </div>
      <GitHubListCaption countLabel={countLabel}>
        <Button type="button" variant="outline" className="github-list-caption-action" disabled={!repository} onClick={() => setCreateIssueDialog({ ...EMPTY_CREATE_ISSUE_DIALOG, open: true })}>
          New issue
        </Button>
      </GitHubListCaption>
    </section>
      )}
    />
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
  onSelect: (issue: GitHubIssue) => void;
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
    onSelect={() => onSelect(issue)}
  />;
}

function IssueEmptyDetails(): ReactNode {
  return <GitHubSelectionEmptyDetails itemType="issue" />;
}

function GitHubSelectionEmptyDetails({ itemType }: { itemType: "pullRequest" | "issue" }): ReactNode {
  const pullRequest = itemType === "pullRequest";
  return <EmptyState
    as="section"
    className="h-full"
    headingLevel={2}
    icon={pullRequest ? <GitPullRequest /> : <CircleDot />}
    title={`Select ${pullRequest ? "a pull request" : "an issue"}`}
    description={pullRequest
      ? "Choose a pull request to view details, checks, files, and review activity."
      : "Choose an issue to view its description, activity, and project details."}
  />;
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
  onSelect: () => void;
}): ReactNode {
  const pullRequest = itemType === "pullRequest";
  const visualState = getGitHubItemVisualState(itemType, state, qualifier === "Draft");
  return <div
    className={`github-row github-item-row ${selected ? "is-selected" : ""}`}
    role="listitem"
    aria-current={selected ? "true" : undefined}
    data-github-row={`${itemType}:${number}`}
  >
    <button
      type="button"
      className="github-row-button"
      aria-label={title}
      aria-pressed={selected}
      title={`${capitalize(state)} ${pullRequest ? "pull request" : "issue"} #${number}`}
      onClick={onSelect}
    >
      <span className="github-row-icon" data-state={visualState} aria-hidden="true">
        {pullRequest
          ? visualState === "draft" ? <GitPullRequestDraft /> : visualState === "closed" ? <GitPullRequestClosed /> : visualState === "merged" ? <GitMerge /> : <GitPullRequest />
          : visualState === "completed" ? <CircleCheck /> : <CircleDot />}
      </span>
      <span className="github-row-body">
        <TooltipTarget overflowOnly content={title}><span className="github-row-title">{title}</span></TooltipTarget>
        <span className="github-row-meta">
          <span className="github-issue-number">#{number}</span>
          {qualifier ? <span className="github-item-qualifier">{qualifier}</span> : null}
          <TooltipTarget overflowOnly content={authorLogin}><span className="truncate">{authorLogin}</span></TooltipTarget>
          <span aria-hidden="true">·</span>
          <TooltipTarget content={formatDate(updatedAt)}><span className="github-row-time">{formatRelativeDate(updatedAt)}</span></TooltipTarget>
        </span>
        <GitHubLabels labels={labels} max={2} />
      </span>
      {comments > 0 ? (
        <span className="github-item-comment-count" aria-label={`${comments} ${comments === 1 ? "comment" : "comments"}`}><MessageSquare aria-hidden="true" />{comments}</span>
      ) : null}
    </button>
  </div>;
}

/** The icon state of a pull request or issue row. A closed issue is completed; a draft pull request is not yet open for review. */
function getGitHubItemVisualState(itemType: "pullRequest" | "issue", state: string, draft: boolean): "open" | "draft" | "closed" | "merged" | "completed" {
  const normalized = state.toLowerCase();
  if (itemType === "issue") return normalized === "closed" ? "completed" : "open";
  if (normalized === "merged") return "merged";
  if (normalized === "closed") return "closed";
  return draft ? "draft" : "open";
}

function GitHubLabels({ labels, max = 3 }: { labels: string[]; max?: number }): ReactNode {
  if (labels.length === 0) return null;
  return (
    <TooltipTarget content={labels.join(", ")}>
      <span className="github-labels">
        {labels.slice(0, max).map((label) => (
          <span key={label} className="github-label-chip">{label}</span>
        ))}
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
  const canRetry = failure?.retryable || kind === "offline" || kind === "transient" || kind === "timeout" || kind === "rateLimited" || !failure;
  return <div className="dialog-notice github-failure" data-tone="danger" data-stale={stale ? "true" : "false"} role="alert">
    <TriangleAlert aria-hidden="true" />
    <div className="github-failure-body">
      <p className="dialog-notice-title">{getGitHubFailureTitle(kind)}</p>
      <p className="selectable-text github-failure-text">{fallback}</p>
      {failure?.missingPermission ? <p className="github-failure-text font-medium text-foreground">Missing permission: {failure.missingPermission}</p> : null}
      {stale ? <p className="github-failure-text">Showing cached results while Githead recovers.</p> : null}
      {retryAt ? <p className="github-failure-text">Try again {formatDateTime(retryAt)}.</p> : null}
      <div className="github-failure-actions">
        {/* Secondary actions first, so the primary action is last. */}
        {kind === "notFound" ? <Button type="button" size="sm" variant="outline" onClick={onCheckRemote}>Check remote</Button> : null}
        {canRetry ? <Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw />Retry</Button> : null}
        {kind === "authorization" ? <Button type="button" size="sm" onClick={onReviewAccess}>Review access</Button> : null}
        {kind === "authentication" ? <Button type="button" size="sm" onClick={onConnect}>Connect GitHub</Button> : null}
      </div>
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
  return <EmptyState
    as="section"
    className="github-list-empty"
    headingLevel={3}
    icon={icon}
    title={title}
    description={description}
    action={actionLabel && onAction ? <Button type="button" variant="outline" size="sm" onClick={onAction}>{actionLabel}</Button> : undefined}
  />;
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

/** Nodes are hollow rings in the lane colour; the selected node is filled and ringed. */
const COMMIT_GRAPH_DOT_RADIUS = 4.5;
const COMMIT_GRAPH_SELECTION_RADIUS = 7;

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
  const svgRef = useRef<SVGSVGElement>(null);
  const glowId = useId();
  const { effects } = useVisualEffects();
  const hoverEnabled = effects !== "off";
  useEffect(() => {
    if (!hoverEnabled || !svgRef.current) return;
    return attachCommitGraphHover(svgRef.current);
  }, [hoverEnabled, layout, visibleStartRow, visibleEndRow]);
  const visibleEdges = useMemo(() => layout.edges.filter((edge) => (
    edge.fromRow < visibleEndRow && edge.toRow >= visibleStartRow
  )), [layout, visibleEndRow, visibleStartRow]);
  const top = visibleStartRow * layout.rowHeight;
  const height = (visibleEndRow - visibleStartRow) * layout.rowHeight;
  if (layout.nodes.length === 0 || height <= 0) {
    return null;
  }

  return (
    <svg
      ref={svgRef}
      className="commit-graph-svg"
      data-testid="commit-graph-svg"
      width={layout.width}
      height={height}
      style={{ top, "--commit-graph-hover-filter": `url("#${glowId}")` } as CSSProperties}
      viewBox={`0 ${top} ${layout.width} ${height}`}
      // The stylesheet caps a wide graph, and slicing clips the lanes past the cap instead of shrinking it.
      preserveAspectRatio="xMinYMin slice"
      aria-hidden="true"
    >
      {hoverEnabled ? <defs>
        <filter id={glowId} filterUnits="userSpaceOnUse" x="0" y={top} width={layout.width} height={height} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs> : null}
      <g className="commit-graph-edges">
        {visibleEdges.map((edge) => (
          <g
            key={edge.id}
            data-graph-from={edge.fromHash}
            data-graph-to={edge.toHash}
            className={`commit-graph-edge lane-${edge.colorLane % COMMIT_GRAPH_COLOR_COUNT}`}
          >
            <path className="commit-graph-edge-clearance" d={edge.path} />
            <path className="commit-graph-edge-line" d={edge.path} />
            {hoverEnabled ? <path className="commit-graph-edge-line commit-graph-glow" d={edge.path} /> : null}
          </g>
        ))}
      </g>
      <g className="commit-graph-nodes">
        {layout.nodes.slice(visibleStartRow, visibleEndRow).map((node) => (
          <g
            key={node.hash}
            data-graph-hash={node.hash}
            className={`commit-graph-node lane-${node.lane % COMMIT_GRAPH_COLOR_COUNT} ${node.isMerge ? "is-merge" : ""} ${node.hash === selectedCommitHash ? "is-selected" : ""}`}
          >
            {node.hash === selectedCommitHash ? <circle className="commit-graph-selection" cx={node.x} cy={node.y} r={COMMIT_GRAPH_SELECTION_RADIUS} /> : null}
            <circle data-testid="commit-graph-node" className="commit-graph-dot" cx={node.x} cy={node.y} r={COMMIT_GRAPH_DOT_RADIUS} />
            {hoverEnabled ? <g className="commit-graph-glow">
              {node.hash === selectedCommitHash ? <circle className="commit-graph-selection" cx={node.x} cy={node.y} r={COMMIT_GRAPH_SELECTION_RADIUS} /> : null}
              <circle className="commit-graph-dot" cx={node.x} cy={node.y} r={COMMIT_GRAPH_DOT_RADIUS} />
            </g> : null}
          </g>
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
  /** Shows the commit card in a narrow window. A context menu selects without opening it. */
  onOpenDetail: () => void;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
  columnVisibility: Readonly<Record<HistoryColumnId, boolean>>;
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
  onOpenDetail,
  onCommitContextAction,
  columnVisibility,
  virtualRowProps
}: HistoryRowProps): ReactNode {
  const showAuthor = columnVisibility.author;
  const showDate = columnVisibility.date;
  const expandedPullRequests = columnVisibility.pullRequest && association && association.pullRequests.length > 0;
  const expandedChecks = columnVisibility.checks && association;
  const compactPullRequests = association && !columnVisibility.pullRequest;
  const compactChecks = association && !columnVisibility.checks;
  const showCaption = showAuthor || showDate || expandedPullRequests || expandedChecks;
  const openCommit = (): void => {
    onSelectCommit(commit.hash);
    onOpenDetail();
  };
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
          onClick={openCommit}
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
              openCommit();
            }
          }}
        >
          {columnVisibility.graph ? <span className="history-graph-cell" aria-hidden="true" /> : null}
          <span className="history-row-content">
            <span className="history-description">
              {columnVisibility.references ? <HistoryReferences commit={commit} /> : <HistoryReferences commit={commit} compact />}
              {columnVisibility.description ? (
                <TooltipTarget content={commit.subject || undefined}>
                  <span className="history-subject-tooltip">
                    <CommitSubject
                      subject={commit.subject}
                      className="history-subject"
                      scopeClassName="history-scope"
                      descriptionClassName="history-description-text"
                    />
                  </span>
                </TooltipTarget>
              ) : null}
            </span>
            {showCaption ? (
              <span className="history-row-caption">
                {showAuthor ? <TooltipTarget content={commit.authorEmail}><span className="history-author">{commit.authorName}</span></TooltipTarget> : null}
                {showAuthor && showDate ? <span className="history-caption-separator" aria-hidden="true">·</span> : null}
                {showDate ? (
                  <TooltipTarget content={formatDate(commit.authorDate)}>
                    <span className="history-date">{commit.relativeDate || formatDate(commit.authorDate)}</span>
                  </TooltipTarget>
                ) : null}
                {expandedPullRequests ? <HistoryPullRequests association={association} onOpenExternalUrl={onOpenExternalUrl} /> : null}
                {expandedChecks ? <HistoryCheckState association={association} /> : null}
              </span>
            ) : null}
          </span>
          {columnVisibility.commit || compactPullRequests || compactChecks ? (
            <span className="history-row-trailing">
              {columnVisibility.commit ? (
                <TooltipTarget content={commit.hash}><span className="history-hash">{commit.shortHash}</span></TooltipTarget>
              ) : null}
              {compactPullRequests || compactChecks ? (
                <span className="history-github-badges">
                  {compactPullRequests ? <HistoryPullRequests association={association} onOpenExternalUrl={onOpenExternalUrl} compact /> : null}
                  {compactChecks ? <HistoryCheckState association={association} compact /> : null}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <CommitActionContextMenuItems
          items={getCommitActionItems({
            tagsEnabled,
            cherryPickDisabled: containedInCurrentBranch && !allowCherryPickingContainedCommits,
            isHead,
            amendDisabled,
            amendDisabledReason
          })}
          commit={commit}
          onAction={onCommitContextAction}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}, areHistoryRowPropsEqual);

function HistoryReferences({ commit, compact = false, className }: {
  commit: Pick<GitCommitGraphRow, "hash" | "refs">;
  compact?: boolean;
  className?: string;
}): ReactNode {
  if (commit.refs.length === 0) return null;
  const visibleRefs = compact ? [commit.refs.find((ref) => ref.kind === "branch") ?? commit.refs[0]!] : commit.refs;
  return (
    <span className={["history-refs", compact ? "is-compact" : "", className ?? ""].filter(Boolean).join(" ")}>
      {visibleRefs.map((ref) => (
        <span key={`${commit.hash}:${ref.kind}:${ref.name}`} className={`ref-badge ${ref.kind}`}>
          {ref.kind === "tag" ? <Tag aria-hidden="true" /> : null}
          <TooltipTarget overflowOnly content={ref.name}>
            <span className="truncate">{ref.name}</span>
          </TooltipTarget>
        </span>
      ))}
      {compact && commit.refs.length > 1 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="history-ref-overflow" aria-label={`Show all ${commit.refs.length} references`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              +{commit.refs.length - 1}
            </button>
          </PopoverTrigger>
          <PopoverContent className="history-reference-popover" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-medium">References</p>
            <ul>{commit.refs.map((ref) => <li key={`${ref.kind}:${ref.name}`}><span>{ref.name}</span><span className="text-muted-foreground">{ref.kind}</span></li>)}</ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
}

function HistoryPullRequests({
  association,
  onOpenExternalUrl,
  compact = false
}: {
  association: GitHubCommitAssociation;
  onOpenExternalUrl: (url: string) => void;
  compact?: boolean;
}): ReactNode {
  const prefix = compact ? "#" : "PR #";
  if (association.pullRequests.length === 0) return null;
  if (association.pullRequests.length === 1) {
    const pullRequest = association.pullRequests[0]!;
    return (
      <button type="button" className="history-github-badge" aria-label={`Open pull request ${pullRequest.number}`} onClick={(event) => {
        event.stopPropagation();
        onOpenExternalUrl(pullRequest.url);
      }}>
        {prefix}{pullRequest.number}
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="history-github-badge" aria-label={`${association.pullRequests.length} associated pull requests`} onClick={(event) => event.stopPropagation()}>
          {prefix}{association.pullRequests[0]!.number} +{association.pullRequests.length - 1}
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
  if (association.checkState === "unknown") return null;

  const stateLabel = formatCheckStateLabel(association.checkState);
  const counts = association.checkCounts;
  const label = counts ? `${stateLabel}: ${counts.passed} of ${counts.total} passed` : stateLabel;
  return (
    <span className={compact ? undefined : "history-check-column"} title={label}>
      <span className={`history-check-state is-${association.checkState}`} aria-label={label} role="img" />
      {!compact ? <span className="truncate">{counts ? `${counts.passed}/${counts.total}` : stateLabel}</span> : null}
    </span>
  );
}

function CommitTypeBadge({ type, label }: Pick<ParsedCommitSubject, "type" | "label">): ReactNode {
  return <span className={`commit-type-badge type-${type}`}>{label}</span>;
}

function CommitSubject({
  subject,
  className,
  scopeClassName,
  descriptionClassName,
  showType = true
}: {
  subject: string;
  className: string;
  scopeClassName: string;
  descriptionClassName: string;
  showType?: boolean;
}): ReactNode {
  const displaySubject = subject || "(no subject)";
  const parsedSubject = subject ? parseCommitSubject(subject) : null;
  if (!parsedSubject) {
    return <span className={className}>{displaySubject}</span>;
  }

  return (
    <span className={`${className} is-conventional`}>
      {showType ? <CommitTypeBadge {...parsedSubject} /> : null}
      {parsedSubject.scope ? <span className={scopeClassName}>{parsedSubject.scope}:</span> : null}
      <span className={descriptionClassName}>{parsedSubject.description}</span>
    </span>
  );
}

function CommitDetailsPanel({
  details,
  onCopyCommit,
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
  onCommitFileContextAction,
  actions,
  diff
}: {
  details: GitCommitDetails | null;
  onCopyCommit: (commit: Pick<GitCommitGraphRow, "hash">) => Promise<void>;
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
  /** The card's commit actions menu, shown beside the title. */
  actions: ReactNode;
  /** The embedded diff for the selected file. The card shows it once the details load. */
  diff: ReactNode;
}): ReactNode {
  if (loading || error || !details) {
    return (
      <section className="commit-details-panel" aria-label="Commit details">
        <div className="commit-meta-scroll">
          {loading ? (
            <LoadingState label="Loading commit details" />
          ) : error ? (
            <EmptyState tone="error" className="selectable-text" title={error} />
          ) : (
            <EmptyState title="Select a commit." />
          )}
        </div>
      </section>
    );
  }

  const fileCount = `${details.files.length} ${details.files.length === 1 ? "file" : "files"}`;
  const totals = details.files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 });
  const parsedSubject = parseCommitSubject(details.subject);
  const references = parseGitHubReferences(`${details.subject}\n${details.body}`, repository);

  return (
    <section className="commit-details-panel" aria-label="Commit details">
      <div className="commit-meta-scroll">
        <div className="commit-meta-card selectable-text">
          <div className="commit-title-row">
            <TooltipTarget content={details.subject || undefined}>
              <h2 className="commit-title">
                <CommitSubject
                  subject={details.subject}
                  className="commit-title-subject"
                  scopeClassName="commit-title-scope"
                  descriptionClassName="commit-title-description"
                  showType={false}
                />
              </h2>
            </TooltipTarget>
            {actions}
          </div>
          <div className="commit-summary-meta">
            <TooltipTarget content={details.authorEmail}><span>{details.authorName}</span></TooltipTarget>
            <time dateTime={details.authorDate}>{formatDate(details.authorDate)}</time>
            <TooltipButton type="button" variant="ghost" size="xs" className="commit-copy-hash" aria-label="Copy commit SHA" tooltip="Copy full commit SHA" onClick={() => { void onCopyCommit(details); }}>
              <Clipboard />{details.shortHash}
            </TooltipButton>
            {parsedSubject ? <CommitTypeBadge {...parsedSubject} /> : null}
            {details.parents.length > 0 ? (
              <span className="commit-parents">
                {details.parents.length > 1 ? "Parents" : "Parent"}
                <ParentCommitLinks parents={details.parents} onSelectCommit={onSelectCommit} />
              </span>
            ) : null}
          </div>
          {details.refs.length > 0 ? <HistoryReferences commit={details} className="commit-refs" /> : null}
          {references.length > 0 ? (
            <div className="commit-reference-list" aria-label="Linked issues and pull requests">
              {references.map((reference) => (
                <button key={`${reference.owner}/${reference.repository}#${reference.number}:${reference.kind}`} type="button" className="commit-reference-link" onClick={() => {
                  if (reference.targetUrl) onOpenExternalUrl(reference.targetUrl);
                }}>{reference.displayText}</button>
              ))}
            </div>
          ) : null}
          {details.body ? (
            <div className="commit-body">
              <OptionalFeatureBoundary name="commit message">
                <BasicMarkdown externalLinks>{details.body}</BasicMarkdown>
              </OptionalFeatureBoundary>
            </div>
          ) : null}
        </div>
      </div>
      <div className="commit-file-list-header">
        <span>{fileCount}</span>
        <span className="sr-only">Sorted by file status</span>
        <span className="commit-change-summary"><span className="good">+{totals.additions}</span><span className="bad">−{totals.deletions}</span></span>
      </div>
      <div className="commit-file-list" role="listbox" aria-label="Changed files">
        {details.files.length === 0 ? (
          <EmptyState title="No changed files." />
        ) : details.files.map((file) => (
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
        ))}
      </div>
      {diff}
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
      {parents.map((parent) => (
        <Fragment key={parent}>
          <TooltipTarget content={parent}>
            <a
              className="commit-link"
              href={`#commit-${parent}`}
              onClick={(event) => {
                event.preventDefault();
                onSelectCommit(parent);
              }}
            >
              {parent.slice(0, 7)}
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
  const slashIndex = file.path.lastIndexOf("/");
  const directory = file.path.slice(0, slashIndex + 1);
  const filename = file.path.slice(slashIndex + 1);
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
          aria-label={`${getCommitFileStatusVisuals(file.status).label} ${file.originalPath ? `${file.originalPath} -> ` : ""}${file.path} +${file.additions} -${file.deletions}`}
          onClick={() => onSelectCommitFile(file.path)}
        >
          <CommitFileStatusBadge status={file.status} />
          <TooltipTarget content={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
            <span className="commit-file-name">
              <span className="commit-file-basename">{filename}</span>
              {directory || file.originalPath ? <span className="commit-file-directory">{file.originalPath ? `${file.originalPath} → ${directory || "."}` : directory}</span> : null}
            </span>
          </TooltipTarget>
          <span className="commit-file-stats"><span className="good">+{file.additions}</span><span className="bad">−{file.deletions}</span></span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!fileHistoryEnabled} onSelect={() => onContextAction(file, "log")}>
          <History />
          Log selected
        </ContextMenuItem>
        <ContextMenuItem disabled={!blameEnabled || file.status === "D"} onSelect={() => onContextAction(file, "blame")}>
          <GitFork />
          Blame selected
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={disabled} onSelect={() => onContextAction(file, "reset")}>
          <RotateCcw />
          Reset to commit
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction(file, "open-current")}>
          <ExternalLink />
          Open current version
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction(file, "open-selected")}>
          <FileCode2 />
          Open selected version
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextAction(file, "copy")}>
          <Clipboard />
          Copy path to clipboard
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CommitPanel({
  commitMessage,
  commitMessageSuggestion,
  commitPushSafetyNotice,
  generationError,
  generating,
  disabled,
  primaryCommitAction,
  stagedCount,
  quickCommitByDefault,
  summary,
  selection,
  quickCommitAiReady,
  quickCommitPhase,
  onQuickCommit,
  onManualCommit,
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
  onCommitMessageChange,
  onApplyCommitMessageSuggestion,
  onDismissCommitMessageSuggestion
}: {
  commitMessage: string;
  commitMessageSuggestion: CommitMessageSuggestion | null;
  commitPushSafetyNotice: CommitPushSafetyNotice | null;
  generationError: string;
  generating: boolean;
  disabled: boolean;
  primaryCommitAction: "commit" | "quick-commit" | "push" | null;
  stagedCount: number;
  quickCommitByDefault: boolean;
  summary: RepoSummary | null;
  selection: FileSelection | null;
  quickCommitAiReady: boolean;
  quickCommitPhase: "generating" | "committing" | null;
  onQuickCommit: (paths: string[]) => void;
  onManualCommit: () => void;
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
  onApplyCommitMessageSuggestion: () => void;
  onDismissCommitMessageSuggestion: () => void;
}): ReactNode {
  const [query] = usePersistentWorkspacePanelState("status-file-query", "");
  const [statusFilter] = usePersistentWorkspacePanelState<StatusFileFilter>("status-file-filter", "all");
  const quickCommitPaths = useMemo(() => getQuickCommitSelectionPaths(summary, selection, query, statusFilter), [summary, selection, query, statusFilter]);
  const quickCommitDisabledReason = useMemo(() => getQuickCommitDisabledReason(summary, quickCommitPaths, quickCommitAiReady), [summary, quickCommitPaths, quickCommitAiReady]);
  const quickCommitDisabled = disabled || quickCommitDisabledReason !== null;
  const commitDisabled = disabled
    || primaryCommitAction === null
    || (primaryCommitAction === "quick-commit" && quickCommitDisabled)
    || (primaryCommitAction === "commit" && !commitAllowed);
  const primaryActionLabel = quickCommitPhase === "generating" ? "Generating…"
    : quickCommitPhase === "committing" ? "Committing…"
    : primaryCommitAction === "push" ? "Push"
    : quickCommitByDefault ? "Quick Commit"
    : primaryCommitAction === "commit" && stagedCount > 0 ? `Commit ${stagedCount} ${stagedCount === 1 ? "file" : "files"}`
    : "Commit";
  const primaryActionAriaLabel = primaryCommitAction === "push" && pushableCommitCount > 0
    ? formatActionCountLabel("Push", pushableCommitCount)
    : undefined;
  const generateDisabled = disabled || !generateAllowed;
  const feedbackAction: "commit" | "push" = feedbackEvent?.surface === "commit-panel"
    && (feedbackEvent.action === "commit" || feedbackEvent.action === "push")
    ? feedbackEvent.action
    : primaryCommitAction === "push" ? "push" : "commit";

  return (
    <section
      className="commit-panel"
      aria-label="Commit staged files"
      aria-busy={generating || quickCommitPhase !== null}
    >
      <label className="sr-only" htmlFor="commit-message">Commit message</label>
      {generating || commitMessageSuggestion ? (
        <p className="sr-only" role="status" aria-live="polite" aria-label="Commit message generation status">
          {generating ? "Generating commit message." : "Generated commit message is ready for review."}
        </p>
      ) : null}
      <div className="commit-compose-box">
        <Textarea
          id="commit-message"
          value={commitMessage}
          rows={3}
          placeholder="Summarize staged changes..."
          onChange={(event) => onCommitMessageChange(event.target.value)}
        />
        {commitMessageSuggestion ? (
          <div
            className="commit-compose-band commit-suggestion-band"
            role="status"
            aria-label="Generated commit message suggestion"
          >
            <div className="commit-suggestion-header">
              <Sparkles aria-hidden="true" />
              <span className="commit-suggestion-title">Generated suggestion</span>
              <Button type="button" variant="ghost" size="xs" onClick={onDismissCommitMessageSuggestion}>
                Dismiss
              </Button>
              <Button type="button" variant="ghost" size="xs" className="commit-suggestion-apply" onClick={onApplyCommitMessageSuggestion}>
                {commitMessage.trim() ? "Replace" : "Apply"}
              </Button>
            </div>
            <p className="commit-suggestion-message selectable-text">{commitMessageSuggestion.message}</p>
            <p className="commit-suggestion-reason">
              {commitMessageSuggestion.reason === "quick-commit-failed"
                ? "Quick Commit did not complete. This message is saved here for review and retry. Your draft has been preserved."
                : commitMessageSuggestion.reason === "repository-changed"
                ? "Staged changes changed while this message was being generated. Review it before replacing your draft."
                : "Your draft changed while this message was being generated. Review it before replacing your draft."}
            </p>
          </div>
        ) : null}
        {generationError ? (
          <p className="commit-compose-band commit-error-band" role="alert">{generationError}</p>
        ) : null}
        {commitPushSafetyNotice ? (
          <div className="commit-compose-band commit-safety-band" role="alert">
            <ShieldAlert aria-hidden="true" />
            <p className="min-w-0 flex-1">{commitPushSafetyNotice.message}</p>
            {commitPushSafetyNotice.undoRequest ? (
              <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onUndoFailedCommitPush} className="shrink-0">
                <RotateCcw />
                Undo commit
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="commit-compose-actions">
          <div className="flex items-stretch">
            <TooltipButton
              type="button"
              variant="ghost"
              disabled={generateDisabled}
              aria-busy={generating}
              tooltip="Generate commit message"
              disabledTooltip={generateTitle}
              onClick={onGenerateMessage}
              className="commit-generate-button rounded-r-none"
            >
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {generating ? "Generating…" : "Generate"}
            </TooltipButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TooltipButton
                  type="button"
                  variant="ghost"
                  disabled={generateDisabled}
                  aria-label="More generate actions"
                  tooltip="More commit message generation options"
                  disabledTooltip={generateTitle}
                  className="commit-generate-button rounded-l-none px-2"
                >
                  <ChevronDown />
                </TooltipButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onSelect={onOpenGenerateWithContext}>
                  <Sparkles />
                  Generate with context
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="commit-submit-group" data-primary={commitDisabled ? undefined : ""}>
            <TooltipButton
              type="button"
              variant="ghost"
              disabled={commitDisabled}
              onClick={() => primaryCommitAction === "quick-commit" ? onQuickCommit(quickCommitPaths) : onCommit()}
              aria-label={primaryActionAriaLabel}
              tooltip={primaryCommitAction === "push" ? "Push commits" : quickCommitByDefault ? "Generate a message and immediately commit selected files" : "Commit staged changes using your message"}
              disabledTooltip={quickCommitByDefault && primaryCommitAction !== "push" ? quickCommitDisabledReason : undefined}
              className="commit-submit-button"
            >
              <OperationButtonFeedback
                action={feedbackAction}
                event={feedbackEvent}
                successLabel={feedbackAction === "push" ? "Pushed" : "Committed"}
                surface="commit-panel"
              >
                {quickCommitPhase ? <Loader2 className="animate-spin" /> : primaryCommitAction === "push" ? <ArrowUp /> : quickCommitByDefault ? <Sparkles /> : <CheckCircle2 />}
                {primaryActionLabel}
                {primaryCommitAction === "push" && pushableCommitCount > 0 ? (
                  <SyncCountChip title={formatCommitCountLabel(pushableCommitCount, "ahead")}>
                    {pushableCommitCount}
                  </SyncCountChip>
                ) : null}
              </OperationButtonFeedback>
            </TooltipButton>
            {primaryCommitAction === "commit" || showAmendAction ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!showAmendAction && (disabled || !commitAllowed)}
                    aria-label="More commit actions"
                    data-amend-composer-trigger
                    className="commit-submit-menu"
                  >
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  {summary?.kind === "git" ? <>
                    <TooltipTarget content={quickCommitByDefault ? "Commit staged changes using your message" : quickCommitDisabledReason ?? "Generate a message and immediately commit selected files"} contentProps={{ side: "left", sideOffset: 8 }}>
                      <DropdownMenuItem
                        disabled={disabled || (quickCommitByDefault ? !commitAllowed : quickCommitDisabled)}
                        className="data-[disabled]:pointer-events-auto"
                        onSelect={() => quickCommitByDefault ? onManualCommit() : onQuickCommit(quickCommitPaths)}
                      >
                        {quickCommitByDefault ? <CheckCircle2 /> : <Sparkles />}
                        {quickCommitByDefault ? "Commit" : "Quick Commit"}
                      </DropdownMenuItem>
                    </TooltipTarget>
                    <DropdownMenuSeparator />
                  </> : null}
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
      </div>
    </section>
  );
}

function GenerateWithContextDialog({
  open,
  context,
  generating,
  cancelStatus,
  error,
  onOpenChange,
  onContextChange,
  onGenerate
}: {
  open: boolean;
  context: string;
  generating: boolean;
  cancelStatus: OperationCancelStatus;
  error: string;
  onOpenChange: (open: boolean) => void;
  onContextChange: (context: string) => void;
  onGenerate: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" aria-busy={generating}>
        <form className="grid gap-4" onSubmit={onGenerate}>
          <DialogHeader>
            <DialogTitle>Generate with context</DialogTitle>
            <DialogDescription>
              Add context that is not obvious from the staged code changes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="generate-change-context">Change context</Label>
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

          {error ? <p className="dialog-error" role="alert">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={cancelStatus === "canceling"}
              onClick={() => onOpenChange(false)}
            >
              {cancelStatus === "canceling" ? <Loader2 className="animate-spin" /> : null}
              {cancelStatus === "canceling" ? "Stopping…" : generating ? "Stop" : "Cancel"}
            </Button>
            <Button type="submit" disabled={generating || context.trim().length === 0}>
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {generating ? "Generating…" : "Generate"}
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
            <DialogTitle>{checkout ? "Choose local branch name" : "New branch"}</DialogTitle>
            <DialogDescription>
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

          <p className="dialog-error min-h-5" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : checkout ? <Download /> : <Plus />}
              {saving ? (checkout ? "Checking out…" : "Creating branch…") : (checkout ? "Check out branch" : "Create branch")}
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
            <DialogTitle>Reset to commit</DialogTitle>
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
          {state.error ? <p className="dialog-error" role="alert">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={state.mode === "hard" ? "destructive" : "default"} disabled={saving || !branchName}>
              {saving ? <Loader2 className="animate-spin" /> : <GitBranchIcon />}
              {saving ? "Resetting branch…" : "Reset branch"}
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
            <DialogTitle>Reset file contents?</DialogTitle>
            <DialogDescription>
              Reset these files to their contents at commit {state.hash}?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reset-file-paths">Files</Label>
            <Textarea
              id="reset-file-paths"
              value={filesText}
              readOnly
              className="dialog-code-block resize-none"
              rows={Math.max(1, Math.min(6, state.paths.length))}
            />
          </div>
          {state.error ? <p className="dialog-error" role="alert">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving || state.paths.length === 0} onClick={onCopy}>
              <Clipboard />
              Copy paths
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={saving || state.paths.length === 0}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {saving ? "Resetting files…" : "Reset files"}
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
            <DialogTitle>Reverse commit?</DialogTitle>
            <DialogDescription>
              Are you sure you want to create a new commit reversing all the changes in {commit ? getCommitSummaryLabel(commit) : "the selected commit"}?
            </DialogDescription>
          </DialogHeader>
          {state.error ? <p className="dialog-error" role="alert">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {saving ? "Reversing commit…" : "Reverse commit"}
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
            <DialogTitle>Publish branch</DialogTitle>
            <DialogDescription>
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

          <p className="dialog-error min-h-5" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !branchName || !hasRemote}>
              {saving ? <Loader2 className="animate-spin" /> : <Upload />}
              {saving ? "Publishing branch…" : "Publish branch"}
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
  const selectedTemplate = state.templates.find((template) => template.id === state.templateId);
  const templateUnavailable = Boolean(state.templateId && !selectedTemplate);
  const descriptionAction = state.body.trim() ? "Update description" : "Generate description";
  const submitLabel = state.step === "pushing"
    ? "Pushing…"
    : state.step === "creating"
    ? "Creating…"
    : needsPush
    ? "Push & create"
    : "Create pull request";

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="create-pr-dialog sm:max-w-[720px]">
        <form onSubmit={onSubmit}>
          <div className="create-pr-content">
            <DialogHeader>
              <DialogTitle>Create pull request</DialogTitle>
              <DialogDescription className="sr-only">
                {`Open a GitHub pull request from ${state.headBranch || "the current branch"}${state.baseBranch ? ` into ${state.baseBranch}` : ""}.`}
              </DialogDescription>
            </DialogHeader>

            <div className="create-pr-branches">
              <div className="create-pr-head" title={state.headBranch}>
                <GitBranchIcon aria-hidden="true" />
                <span className="create-pr-meta-label">From</span>
                <span className="truncate">{state.headBranch || "Current branch"}</span>
              </div>
              <ArrowRight className="create-pr-branch-arrow" aria-hidden="true" />
              <div className="create-pr-base">
                <Label htmlFor="create-pr-base" className="create-pr-meta-label">Into</Label>
                <ReferencePicker
                  id="create-pr-base"
                  compact
                  value={state.baseBranch}
                  options={baseBranches.map((branch) => ({ value: branch, label: branch, icon: <GitBranchIcon /> }))}
                  disabled={busy || generating || baseBranches.length === 0}
                  ariaLabel="Select pull request base branch"
                  placeholder="Select base branch"
                  searchPlaceholder="Search base branches..."
                  emptyMessage="No remote branches found."
                  onValueChange={(baseBranch) => onStateChange({ ...state, baseBranch, error: "" })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create-pr-title">Title</Label>
              <div className="create-pr-title-row">
                <Input
                  id="create-pr-title"
                  value={state.title}
                  disabled={busy || generating}
                  onChange={(event) => onStateChange({ ...state, title: event.currentTarget.value, error: "" })}
                />
                <TooltipButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || generating || !canGenerate || state.templatesLoading}
                  aria-label="Generate pull request title"
                  tooltip="Generate pull request title"
                  disabledTooltip={!canGenerate ? generateTitle : undefined}
                  onClick={onGenerateTitle}
                >
                  {generatingTitle ? <Loader2 className="animate-spin" /> : <Sparkles />}
                </TooltipButton>
              </div>
            </div>

            <div className="create-pr-description">
              <div className="create-pr-editor-heading">
                <Label htmlFor="create-pr-body">Description</Label>
                <div className="create-pr-template" title={selectedTemplate ? `${selectedTemplate.repository}/${selectedTemplate.path}` : "Choose the format for the description"}>
                  <Label htmlFor="create-pr-template" className="sr-only">PR template</Label>
                  <ReferencePicker
                    id="create-pr-template"
                    compact
                    value={state.templateId || "none"}
                    options={[
                      { value: "none", label: "No template" },
                      ...state.templates.map((template) => ({
                        value: template.id,
                        label: state.templates.length === 1 ? "Repository template"
                          : template.isDefault ? "Default template" : template.path.split("/").at(-1) ?? template.path,
                        detail: template.path,
                        group: template.repository
                      })),
                      ...(templateUnavailable ? [{ value: state.templateId, label: "Template unavailable" }] : [])
                    ]}
                    disabled={busy || generating || state.templatesLoading}
                    ariaLabel="Select pull request template"
                    placeholder="Select a template"
                    searchPlaceholder="Search templates..."
                    emptyMessage="No templates found."
                    onValueChange={(value) => {
                      const templateId = value === "none" ? "" : value;
                      if (templateId === state.templateId) return;
                      const template = state.templates.find((item) => item.id === templateId);
                      // Selecting a format never discards an existing description.
                      onStateChange({ ...state, templateId, applyDefaultTemplate: false,
                        ...(!state.body && template ? { body: template.body, undoBody: state.body } : {}) });
                    }}
                  />
                </div>
              </div>
              <div className="create-pr-editor">
                <Textarea
                  id="create-pr-body"
                  className="create-pr-body field-sizing-fixed"
                  rows={12}
                  value={state.body}
                  disabled={busy || generating}
                  placeholder="Describe the change and how you verified it…"
                  onChange={(event) => onStateChange({ ...state, body: event.currentTarget.value, applyDefaultTemplate: false, error: "" })}
                />
                <div className="create-pr-editor-toolbar">
                  <div className="flex items-center gap-1">
                    <TooltipButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || generating || !canGenerate || state.templatesLoading || templateUnavailable}
                      aria-label={descriptionAction}
                      tooltip={descriptionAction}
                      disabledTooltip={!canGenerate ? generateTitle : undefined}
                      onClick={onGenerate}
                    >
                      {generatingDescription ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      {generatingDescription ? "Generating…" : state.body.trim() ? "Update description" : "Generate description"}
                    </TooltipButton>
                    {state.undoBody !== null ? <Button type="button" variant="ghost" size="sm" disabled={busy || generating}
                      onClick={() => onStateChange({ ...state, body: state.undoBody ?? "", undoBody: null, applyDefaultTemplate: false })}>
                      <RotateCcw />Undo
                    </Button> : null}
                  </div>
                  <span className="create-pr-save-status" role="status">
                    {state.templatesLoading ? "Loading template…" : state.draftSaveError ? "Not saved" : <><CheckCircle2 aria-hidden="true" />Saved locally</>}
                  </span>
                </div>
              </div>
            </div>

            {templateUnavailable && !state.templatesLoading ? <p className="dialog-notice" data-tone="neutral" role="status">Select an available template or No template before generating. Your text is preserved.</p> : null}
            {state.templateError ? <div className="dialog-error flex items-center gap-2" role="alert">
              <span>{state.templateError}</span>
              <Button type="button" variant="outline" size="sm" disabled={busy || generating || state.templatesLoading}
                onClick={() => onStateChange({ ...state, templateRequest: state.templateRequest + 1 })}>Retry</Button>
            </div> : null}
            {state.draftSaveError ? <p className="dialog-error" role="alert">Unable to save this draft on this device. Keep this window open or copy your text.</p> : null}
            {state.error ? <p className="dialog-error" role="alert">{state.error}</p> : null}
            {state.failure?.outcomeUnknown && !state.unknownOutcomeReviewed ? (
              <Button type="button" variant="outline" className="w-fit" onClick={onReviewUnknownOutcome}><ExternalLink />Open pull requests</Button>
            ) : null}
          </div>
          <div className="create-pr-footer">
            <label className="checkbox-row">
              <input type="checkbox" checked={state.draft} disabled={busy || generating}
                onChange={(event) => onStateChange({ ...state, draft: event.currentTarget.checked, error: "" })} />
              Create as draft
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close draft</Button>
              <Button type="submit" disabled={busy || generating || state.templatesLoading || !state.title.trim() || !state.baseBranch || Boolean(state.failure?.outcomeUnknown && !state.unknownOutcomeReviewed)}>
                {busy ? <Loader2 className="animate-spin" /> : <GitPullRequest />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </div>
        </form>
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
          <DialogTitle>Allow Git ownership exception?</DialogTitle>
          <DialogDescription>
            Git blocked this repository because its ownership differs from your current user. Githead will add this exact folder to Git's global safe.directory list.
          </DialogDescription>
        </DialogHeader>

        {safeDirectory?.path ? (
          <p className="dialog-code-block">
            {safeDirectory.path}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onAllow} disabled={saving || !safeDirectory?.path} autoFocus>
            {saving ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
            {saving ? "Adding exception" : "Allow exception"}
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
            <p className="eyebrow">Git identity</p>
            <DialogTitle>Set Git author identity</DialogTitle>
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

          <p id="git-identity-prompt-error" className="dialog-error min-h-5" role="alert">{state.error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Saving" : "Save and retry commit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImageDiffView({ filePath, before, after, onDownload, downloading }: { filePath: string; before: GitImageSide; after: GitImageSide; onDownload?: () => void; downloading: boolean }): ReactNode {
  const isAdded = before.status === "absent";
  const canDownload = [before, after].some((side) => (side.status === "lfs-missing" || side.status === "lfs-corrupt") && side.fetchable);
  const needsRepair = [before, after].some((side) => side.status === "lfs-corrupt" && side.fetchable);
  return (
    <div className="image-diff-wrap" aria-label={`${isAdded ? "Image preview" : "Image comparison"} for ${filePath}`}>
      {canDownload && onDownload ? (
        <div className="dialog-notice image-diff-notice" data-tone="warning">
          <TriangleAlert aria-hidden="true" />
          <div className="image-diff-notice-body">
            <span>{needsRepair ? "The Git LFS copy of this image on this device is damaged." : "This Git LFS image has not been downloaded to this device."}</span>
            <Button type="button" variant="outline" size="xs" aria-label={needsRepair ? "Retry corrupt Git LFS image preview" : "Download missing Git LFS image preview"} disabled={downloading} onClick={onDownload}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              {downloading ? "Downloading..." : needsRepair ? "Retry preview" : "Download preview"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className={`image-diff${isAdded ? " is-single" : ""}`}>
        {!isAdded && <ImageDiffPane side="Before" filePath={filePath} imageSide={before} missingMessage="Image did not exist." />}
        <ImageDiffPane side={isAdded ? "Preview" : "After"} filePath={filePath} imageSide={after} missingMessage="Image was deleted." />
      </div>
    </div>
  );
}

function ImageDiffPane({ side, filePath, imageSide, missingMessage }: { side: "Before" | "After" | "Preview"; filePath: string; imageSide: GitImageSide; missingMessage: string }): ReactNode {
  const version = imageSide.status === "available" ? imageSide.version : null;
  const [source, setSource] = useState<{ version: GitImageVersion; url: string } | null>(null);
  const objectUrl = source?.version === version ? source.url : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = Boolean(objectUrl && failedUrl === objectUrl);
  const unavailableMessage = failed ? "Unable to display image."
    : imageSide.status === "lfs-missing" || imageSide.status === "lfs-corrupt"
      ? <>{imageSide.status === "lfs-corrupt" ? "Local LFS image is corrupt." : "LFS image is not available locally."}<br />{formatImageBytes(imageSide.byteLength)}</>
      : imageSide.status === "unavailable" ? imageSide.message : missingMessage;
  useEffect(() => {
    if (!version) return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(version.data)], { type: version.mimeType }));
    setSource({ version, url });
    return () => URL.revokeObjectURL(url);
  }, [version]);
  return (
    <figure className="image-diff-pane">
      <figcaption className="image-diff-label">{side}</figcaption>
      <div className="image-diff-canvas">
        {version && !objectUrl ? null : objectUrl && !failed ? <img className="image-diff-preview" src={objectUrl} alt={`${side} version of ${filePath}`} onError={() => setFailedUrl(objectUrl)} /> : <p className="image-diff-missing">{unavailableMessage}</p>}
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
    shell: action.shell,
    bindToPull: Boolean(action.bindToPull)
  };
}

function createEmptyRepositoryActionDraft(): RepositoryActionDraft {
  return createRepositoryActionDraft({
    name: "",
    description: "",
    command: "",
    shell: "powershell",
    bindToPull: false
  });
}

function stripRepositoryActionDrafts(actions: RepositoryActionDraft[]): GitConfiguredAction[] {
  return actions.map((action) => ({
    name: action.name.trim(),
    description: action.description.trim(),
    command: action.command.trim(),
    shell: action.shell,
    ...(action.bindToPull ? { bindToPull: true } : {})
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

function reconcileSelection(state: AppState, followSelection: FileSelection | null = null): AppState {
  if (!state.selection || !state.summary?.isValid) {
    return state;
  }

  // A hunk operation hands over the selection it started from, so that the file follows its last
  // hunk to the other group (see resolvePostHunkSelection) instead of losing the selection.
  if (followSelection && followSelection.side === state.selection.side && followSelection.path === state.selection.path) {
    const followed = resolvePostHunkSelection(state.summary, state.selection);
    if (followed && followed.side !== state.selection.side) {
      return { ...state, selection: followed, diff: null, diffChanged: false };
    }
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
    && previous.isHead === next.isHead
    && previous.amendDisabled === next.amendDisabled
    && previous.amendDisabledReason === next.amendDisabledReason
    && previous.association === next.association
    && previous.onOpenExternalUrl === next.onOpenExternalUrl
    && previous.onSelectCommit === next.onSelectCommit
    && previous.onOpenDetail === next.onOpenDetail
    && previous.onCommitContextAction === next.onCommitContextAction
    && areHistoryColumnVisibilityEqual(previous.columnVisibility, next.columnVisibility)
    && previous.virtualRowProps["aria-posinset"] === next.virtualRowProps["aria-posinset"]
    && previous.virtualRowProps["aria-setsize"] === next.virtualRowProps["aria-setsize"]
    && previous.virtualRowProps.style.top === next.virtualRowProps.style.top;
}

function areHistoryColumnVisibilityEqual(
  left: Readonly<Record<HistoryColumnId, boolean>>,
  right: Readonly<Record<HistoryColumnId, boolean>>
): boolean {
  return left === right || HISTORY_COLUMNS.every((column) => left[column.id] === right[column.id]);
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

/** Puts an active guest view into the guest slot. Returns the same state when nothing changes. */
function reconcileGuestView(state: AppState): AppState {
  return isGuestView(state.activeView) && state.activeView !== state.guestView
    ? { ...state, guestView: state.activeView }
    : state;
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
  if (!nextGitHubKey && next.guestView && isGitHubView(next.guestView)) {
    next = { ...next, guestView: null };
  }
  if (next.activeView === "analytics" && state.summary && !state.summary.capabilities.analytics) {
    next = {
      ...next,
      activeView: "status"
    };
  }
  if (next.guestView === "analytics" && state.summary && !state.summary.capabilities.analytics) {
    next = { ...next, guestView: null };
  }

  return next;
}

function resetHistoryState(state: AppState): AppState {
  return {
    ...state,
    historyScope: "current",
    history: [],
    historyTipsToken: null,
    historyLoading: false,
    historyLoadingMore: false,
    historyLoaded: false,
    historyHasMore: false,
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

function getCreatePrBaseBranches(summary: RepoSummary | null): string[] {
  if (!summary?.isValid) {
    return [];
  }

  const remoteName = getRemoteDefaultBranch(summary)?.remote ?? "origin";
  return summary.remoteBranches
    .filter((remoteBranch) => remoteBranch.remote === remoteName)
    .map((remoteBranch) => remoteBranch.branch);
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

function canDiscardStatusFile(file: GitStatusFile): boolean {
  return !file.submodule && !file.isConflicted && getFileStatusVisuals(file, "unstaged").tone !== "untracked";
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
    || draft.visualEffects !== settings.visualEffects
    || draft.reduceMotion !== settings.reduceMotion
    || draft.appearanceMode !== settings.appearanceMode
    || draft.uiFont !== settings.uiFont
    || draft.codeFont !== settings.codeFont
    || draft.zoomFactor !== settings.zoomFactor
    || draft.tagPushBehavior !== (settings.gitBehaviors?.tagPushBehavior ?? DEFAULT_TAG_PUSH_BEHAVIOR)
    || draft.requireUpToDateUpstreamBeforeCommit !== (settings.gitBehaviors?.requireUpToDateUpstreamBeforeCommit ?? false)
    || draft.quickCommitByDefault !== (settings.gitBehaviors?.quickCommitByDefault ?? false)
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

function getQuickCommitSelectionPaths(summary: RepoSummary | null, selection: FileSelection | null, query: string, statusFilter: StatusFileFilter): string[] {
  if (!summary || selection?.side !== "unstaged") return [];
  const visiblePaths = new Set(filterStatusFiles(getUnstagedFiles(summary), "unstaged", query, statusFilter).map((file) => file.path));
  return getSelectionPaths(selection).filter((path) => visiblePaths.has(path));
}

function getQuickCommitDisabledReason(summary: RepoSummary | null, paths: string[], aiReady: boolean): string | null {
  if (!summary?.isValid || summary.kind !== "git") return "Quick Commit is available for Git repositories.";
  if (summary.operationState) return "Finish the current repository operation before using Quick Commit.";
  if (hasStagedChanges(summary)) return "Commit or unstage existing changes before using Quick Commit.";
  if (paths.length === 0) return "Select unstaged files to Quick Commit.";
  const eligible = new Set(summary.files.filter((file) => file.isUnstaged && !file.isConflicted && canStageStatusFile(file)).map((file) => file.path));
  if (paths.some((path) => !eligible.has(path))) return "Select files that can be staged without resolving conflicts.";
  if (!aiReady) return "Configure an AI provider in Settings to use Quick Commit.";
  return null;
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

interface HeaderRepository {
  displayName: string;
  /** The path the repository context menu acts on, with the row it belongs to. */
  menuPath: string;
  menuTarget: RepositoryMenuTarget;
}

/** Names the open repository like its quick switcher row: a saved repository by its alias, a worktree by its folder. */
function getHeaderRepository(
  repoPath: string,
  repoRecents: string[],
  groups: RepositoryGroup[],
  organization: RepositoryOrganization
): HeaderRepository {
  const group = findRepositoryGroup(groups, repoPath);
  const worktree = group && !isSameRepoPath(group.anchorPath, repoPath)
    ? group.worktrees.find((candidate) => isSameRepoPath(candidate.path, repoPath)) ?? null
    : null;
  if (group && worktree) {
    return { displayName: getRepoDisplayName(repoPath), menuPath: worktree.path, menuTarget: { group, worktree } };
  }
  const savedPath = group?.anchorPath ?? repoRecents.find((path) => isSameRepoPath(path, repoPath)) ?? null;
  const labelPath = savedPath ?? repoPath;
  return {
    displayName: repositoryPreference(organization, labelPath).alias || getRepoDisplayName(labelPath),
    menuPath: labelPath,
    menuTarget: { ...(group ? { group } : {}), ...(savedPath ? { reorder: true } : {}) }
  };
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

function getDropPosition(clientY: number, element: HTMLElement): RepositoryDropPosition {
  const bounds = element.getBoundingClientRect();
  return clientY < bounds.top + bounds.height / 2 ? "before" : "after";
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

function createConfiguredActionOutcome(run: ConfiguredActionRun, exitCode: number): ConfiguredActionOutcome {
  return { name: run.name, exitCode, operationId: run.operationId, finishedAt: Date.now() };
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

function isDeletedOnSide(file: GitStatusFile, side: GitDiffSide): boolean {
  return side === "staged" ? file.indexStatus === "D" : file.worktreeStatus === "D";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
