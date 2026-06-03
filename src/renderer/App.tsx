import {
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clipboard,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  FileCode2,
  FolderOpen,
  GitFork,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  History,
  ListTree,
  Loader2,
  MapPinned,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Workflow,
  X
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type {
  AiSettings,
  AppUpdateState,
  GitBranch,
  GitAction,
  GitCommitChangedFile,
  GitCommitDetails,
  GitCommitGraphRow,
  GitDiffSide,
  GitFileDiff,
  GitHubIssue,
  GitHubPullRequest,
  GitHubWorkflowRun,
  AppWindowState,
  GitOperationResult,
  GitOutputEvent,
  GitRemoteBranch,
  GitResetMode,
  GitRepositoryAccessCheckResult,
  GitRunResult,
  GitStatusFile,
  RepoTrustResult,
  RepoSummary
} from "../shared/types";
import { parseCommitSubject } from "../shared/commitSubject";
import { canPush, getPrimaryCommitAction, getPullableCommitCount, getPushableCommitCount, hasStagedChanges } from "./commitActions";
import { buildCommitGraphLayout, type CommitGraphLayout } from "./commitGraph";
import { groupDiffRowsByHunk, parseUnifiedDiff, type DiffRow, type DiffRowKind } from "./diffParser";
import { highlightDiffCode } from "./syntaxHighlighter";

const HISTORY_LIMIT = 200;

type WorkspaceView = "status" | "history" | "workflows" | "pullRequests" | "issues" | "activity";

interface FileSelection {
  path: string;
  side: GitDiffSide;
  paths: string[];
  anchorPath: string;
}

interface FileSelectionModifiers {
  extendRange: boolean;
  toggle: boolean;
}

interface SettingsDraft {
  apiKey: string;
  model: string;
  siteUrl: string;
  siteTitle: string;
}

interface CloneDraft {
  source: string;
  parentPath: string;
  directoryName: string;
  branchName: string;
  depth: string;
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

interface TagDialogState {
  open: boolean;
  hash: string;
  tab: "add" | "remove";
  tagName: string;
  message: string;
  lightweight: boolean;
  force: boolean;
  pushRemote: string | null;
  deleteTagName: string;
  deletePushRemote: string | null;
  error: string;
}

interface AppState {
  repoPath: string;
  repoRecents: string[];
  repoLoading: boolean;
  showSetup: boolean;
  setupError: string;
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
  branchNameDraft: string;
  branchError: string;
  upstreamDialogOpen: boolean;
  upstreamDraft: string | null;
  upstreamError: string;
  runningAction: GitAction | null;
  runningOperation: string | null;
  lastResult: GitRunResult | null;
  lastOperationResult: GitOperationResult | null;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  commitMessage: string;
  aiSettings: AiSettings | null;
  settingsOpen: boolean;
  settingsDraft: SettingsDraft;
  settingsError: string;
  settingsSaving: boolean;
  activeView: WorkspaceView;
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
  workflowRuns: GitHubWorkflowRun[];
  workflowRunsLoading: boolean;
  workflowRunsLoaded: boolean;
  workflowRunsError: string;
  pullRequests: GitHubPullRequest[];
  pullRequestsLoading: boolean;
  pullRequestsLoaded: boolean;
  pullRequestsError: string;
  issues: GitHubIssue[];
  issuesLoading: boolean;
  issuesLoaded: boolean;
  issuesError: string;
  logText: string;
  appUpdate: AppUpdateState;
}

type AppStateUpdater = Partial<AppState> | ((state: AppState) => AppState);

interface RequestIds {
  repo: number;
  diff: number;
  history: number;
  commitDetails: number;
  commitFileDiff: number;
  workflowRuns: number;
  pullRequests: number;
  issues: number;
}

const emptySettingsDraft: SettingsDraft = {
  apiKey: "",
  model: "",
  siteUrl: "",
  siteTitle: "Githead"
};

const emptyCloneDraft: CloneDraft = {
  source: "",
  parentPath: "",
  directoryName: "",
  branchName: "",
  depth: "0"
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
  error: ""
};

const TRUST_WORKSPACE_TITLE = "Do you trust this workspace?";
const TRUST_WORKSPACE_DESCRIPTION = "This is the first time Githead will run Git operations here that may execute configured hooks or local Git configuration.";

const initialState: AppState = {
  repoPath: "",
  repoRecents: [],
  repoLoading: false,
  showSetup: true,
  setupError: "",
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
  branchNameDraft: "",
  branchError: "",
  upstreamDialogOpen: false,
  upstreamDraft: null,
  upstreamError: "",
  runningAction: null,
  runningOperation: null,
  lastResult: null,
  lastOperationResult: null,
  selection: null,
  diff: null,
  diffLoading: false,
  commitMessage: "",
  aiSettings: null,
  settingsOpen: false,
  settingsDraft: emptySettingsDraft,
  settingsError: "",
  settingsSaving: false,
  activeView: "status",
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
  workflowRuns: [],
  workflowRunsLoading: false,
  workflowRunsLoaded: false,
  workflowRunsError: "",
  pullRequests: [],
  pullRequestsLoading: false,
  pullRequestsLoaded: false,
  pullRequestsError: "",
  issues: [],
  issuesLoading: false,
  issuesLoaded: false,
  issuesError: "",
  logText: "",
  appUpdate: createInitialRendererUpdateState()
};

const initialWindowState: AppWindowState = {
  isMaximized: false
};

export function App(): ReactNode {
  useSystemThemeClass();

  const [state, setState] = useState<AppState>(initialState);
  const [windowState, setWindowState] = useState<AppWindowState>(initialWindowState);
  const stateRef = useRef(state);
  const requestIds = useRef<RequestIds>({
    repo: 0,
    diff: 0,
    history: 0,
    commitDetails: 0,
    commitFileDiff: 0,
    workflowRuns: 0,
    pullRequests: 0,
    issues: 0
  });
  const logOutputRef = useRef<HTMLPreElement | null>(null);
  const trustDialogResolveRef = useRef<((trusted: boolean) => void) | null>(null);
  const repoRefreshInFlightRef = useRef(false);
  const fileStatusDirtyRef = useRef(false);
  const windowFocusedRef = useRef(true);
  const [trustDialogOpen, setTrustDialogOpen] = useState(false);

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
    stateRef.current = state;
  }, [state]);

  const appendLog = useCallback((event: GitOutputEvent): void => {
    const prefix = event.stream === "system" ? "" : `[${event.stream}] `;
    updateState((current) => ({
      ...current,
      logText: `${current.logText}${prefix}${event.text}`
    }));
  }, [updateState]);

  const appendSystemLine = useCallback((text: string): void => {
    appendLog({
      runId: "renderer",
      action: stateRef.current.runningAction ?? "fetch",
      stream: "system",
      text: `${text}\n`,
      timestamp: new Date().toISOString()
    });
  }, [appendLog]);

  const appendOperationLog = useCallback((label: string, result: GitOperationResult): void => {
    updateState((current) => ({
      ...current,
      logText: `${current.logText}${formatOperationLog(label, result)}`
    }));
  }, [updateState]);

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

  useEffect(() => {
    if (logOutputRef.current) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [state.activeView, state.logText]);

  const loadCommitFileDiff = useCallback(async (hash: string, filePath: string): Promise<void> => {
    const requestId = requestIds.current.commitFileDiff + 1;
    requestIds.current.commitFileDiff = requestId;
    updateState({
      commitFileDiffLoading: true,
      commitFileDiffError: "",
      commitFileDiff: null
    });

    try {
      const diff = await window.githead.getCommitFileDiff({
        repoPath: stateRef.current.repoPath,
        hash,
        path: filePath
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
        hash
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

  const loadCommitHistory = useCallback(async (force: boolean): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid) {
      updateState({
        history: [],
        historyLoaded: false,
        historyError: current.summary?.validationErrors.join(" ") ?? ""
      });
      return;
    }

    if (current.historyLoaded && !force) {
      return;
    }

    const requestId = requestIds.current.history + 1;
    requestIds.current.history = requestId;
    const previousCommitHash = current.selectedCommitHash;
    updateState({
      historyLoading: true,
      historyError: ""
    });

    let selectedCommitHash: string | null = null;

    try {
      const history = await window.githead.getCommitHistory({
        repoPath: stateRef.current.repoPath,
        limit: HISTORY_LIMIT
      });

      if (requestId !== requestIds.current.history) {
        return;
      }

      selectedCommitHash = history.some((commit) => commit.hash === previousCommitHash)
        ? previousCommitHash
        : history[0]?.hash ?? null;

      updateState({
        history,
        historyLoaded: true,
        selectedCommitHash,
        commitDetails: null,
        commitDetailsError: "",
        selectedCommitFilePath: null,
        commitFileDiff: null,
        commitFileDiffError: ""
      });
    } catch (error) {
      if (requestId === requestIds.current.history) {
        updateState({
          history: [],
          historyLoaded: false,
          historyError: error instanceof Error ? error.message : "Unable to read commit history.",
          selectedCommitHash: null,
          commitDetails: null,
          selectedCommitFilePath: null,
          commitFileDiff: null
        });
      }
    } finally {
      if (requestId === requestIds.current.history) {
        updateState({
          historyLoading: false
        });
      }
    }

    if (selectedCommitHash) {
      await loadCommitDetails(selectedCommitHash);
    }
  }, [loadCommitDetails, updateState]);

  const loadWorkflowRuns = useCallback(async (force: boolean): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || !current.summary.githubRepository) {
      updateState({
        workflowRuns: [],
        workflowRunsLoaded: false,
        workflowRunsError: current.summary?.isValid ? "Selected repository does not have a supported GitHub origin." : ""
      });
      return;
    }

    if (current.workflowRunsLoaded && !force) {
      return;
    }

    const requestId = requestIds.current.workflowRuns + 1;
    requestIds.current.workflowRuns = requestId;
    updateState({
      workflowRunsLoading: true,
      workflowRunsError: ""
    });

    try {
      const workflowRuns = await window.githead.getGitHubWorkflowRuns({
        repoPath: stateRef.current.repoPath
      });

      if (requestId === requestIds.current.workflowRuns) {
        updateState({
          workflowRuns,
          workflowRunsLoaded: true
        });
      }
    } catch (error) {
      if (requestId === requestIds.current.workflowRuns) {
        updateState({
          workflowRuns: [],
          workflowRunsLoaded: false,
          workflowRunsError: error instanceof Error ? error.message : "Unable to load workflow runs."
        });
      }
    } finally {
      if (requestId === requestIds.current.workflowRuns) {
        updateState({
          workflowRunsLoading: false
        });
      }
    }
  }, [updateState]);

  const loadPullRequests = useCallback(async (force: boolean): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || !current.summary.githubRepository) {
      updateState({
        pullRequests: [],
        pullRequestsLoaded: false,
        pullRequestsError: current.summary?.isValid ? "Selected repository does not have a supported GitHub origin." : ""
      });
      return;
    }

    if (current.pullRequestsLoaded && !force) {
      return;
    }

    const requestId = requestIds.current.pullRequests + 1;
    requestIds.current.pullRequests = requestId;
    updateState({
      pullRequestsLoading: true,
      pullRequestsError: ""
    });

    try {
      const pullRequests = await window.githead.getGitHubPullRequests({
        repoPath: stateRef.current.repoPath
      });

      if (requestId === requestIds.current.pullRequests) {
        updateState({
          pullRequests,
          pullRequestsLoaded: true
        });
      }
    } catch (error) {
      if (requestId === requestIds.current.pullRequests) {
        updateState({
          pullRequests: [],
          pullRequestsLoaded: false,
          pullRequestsError: error instanceof Error ? error.message : "Unable to load pull requests."
        });
      }
    } finally {
      if (requestId === requestIds.current.pullRequests) {
        updateState({
          pullRequestsLoading: false
        });
      }
    }
  }, [updateState]);

  const loadIssues = useCallback(async (force: boolean): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || !current.summary.githubRepository) {
      updateState({
        issues: [],
        issuesLoaded: false,
        issuesError: current.summary?.isValid ? "Selected repository does not have a supported GitHub origin." : ""
      });
      return;
    }

    if (current.issuesLoaded && !force) {
      return;
    }

    const requestId = requestIds.current.issues + 1;
    requestIds.current.issues = requestId;
    updateState({
      issuesLoading: true,
      issuesError: ""
    });

    try {
      const issues = await window.githead.getGitHubIssues({
        repoPath: stateRef.current.repoPath
      });

      if (requestId === requestIds.current.issues) {
        updateState({
          issues,
          issuesLoaded: true
        });
      }
    } catch (error) {
      if (requestId === requestIds.current.issues) {
        updateState({
          issues: [],
          issuesLoaded: false,
          issuesError: error instanceof Error ? error.message : "Unable to load issues."
        });
      }
    } finally {
      if (requestId === requestIds.current.issues) {
        updateState({
          issuesLoading: false
        });
      }
    }
  }, [updateState]);

  const loadSelectedDiff = useCallback(async (selectionOverride?: FileSelection): Promise<void> => {
    const selection = selectionOverride ?? stateRef.current.selection;
    if (!selection || !stateRef.current.summary?.isValid) {
      updateState({
        diff: null,
        diffLoading: false
      });
      return;
    }

    const requestId = requestIds.current.diff + 1;
    requestIds.current.diff = requestId;
    updateState({
      diffLoading: true
    });

    try {
      const diff = await window.githead.getFileDiff({
        repoPath: stateRef.current.repoPath,
        path: selection.path,
        side: selection.side
      });

      if (requestId === requestIds.current.diff) {
        updateState({
          diff
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

  const refreshRepo = useCallback(async (options: {
    addToRecents?: boolean;
    silent?: boolean;
  } = {}): Promise<void> => {
    const requestId = requestIds.current.repo + 1;
    requestIds.current.repo = requestId;
    const repoPath = stateRef.current.repoPath;
    repoRefreshInFlightRef.current = true;

    if (!options.silent) {
      updateState({
        repoLoading: true
      });
    }

    try {
      const summary = await window.githead.getRepoSummary(repoPath);
      if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return;
      }

      fileStatusDirtyRef.current = false;
      updateState((current) => reconcileGitHubState(reconcileSelection({
        ...current,
        summary,
        showSetup: !summary.isValid,
        setupError: summary.isValid ? "" : summary.validationErrors.join(" ")
      }), current.summary));

      if (options.addToRecents && summary.isValid) {
        try {
          const repoRecents = await window.githead.addRepoRecent(summary.repoPath);
          if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
            updateState({
              repoRecents
            });
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
      if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        updateState((current) => ({
          ...current,
          summary: createInvalidSummary(
            current.repoPath,
            error instanceof Error ? error.message : "Unable to read repository state."
          ),
          showSetup: true,
          setupError: error instanceof Error ? error.message : "Unable to read repository state.",
          selection: null,
          diff: null
        }));
      }
    } finally {
      if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        repoRefreshInFlightRef.current = false;
        if (!options.silent) {
          updateState({
            repoLoading: false
          });
        }
      }
    }

    if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    const latest = stateRef.current;
    if (latest.activeView === "history") {
      await loadCommitHistory(true);
    }
    if (latest.activeView === "workflows") {
      await loadWorkflowRuns(true);
    }
    if (latest.activeView === "pullRequests") {
      await loadPullRequests(true);
    }
    if (latest.activeView === "issues") {
      await loadIssues(true);
    }
  }, [loadCommitHistory, loadIssues, loadPullRequests, loadWorkflowRuns, updateState]);

  const refreshDirtyFileStatus = useCallback(async (options: { force?: boolean } = {}): Promise<void> => {
    const current = stateRef.current;
    if (!options.force && !fileStatusDirtyRef.current) {
      return;
    }

    if (current.activeView !== "status") {
      return;
    }

    if (
      !current.summary?.isValid ||
      current.repoLoading ||
      isOperationRunning(current) ||
      repoRefreshInFlightRef.current
    ) {
      if (options.force) {
        fileStatusDirtyRef.current = true;
      }
      return;
    }

    fileStatusDirtyRef.current = false;
    await refreshRepo({
      silent: true
    });
  }, [refreshRepo]);

  useEffect(() => {
    const cleanupRepoChanged = window.githead.onRepoChanged((event) => {
      if (!isSameRepoPath(event.repoPath, stateRef.current.repoPath)) {
        return;
      }

      fileStatusDirtyRef.current = true;
      void refreshDirtyFileStatus();
    });

    return cleanupRepoChanged;
  }, [refreshDirtyFileStatus]);

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
        force: true
      });
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [refreshDirtyFileStatus]);

  const switchRepo = useCallback(async (repoPath: string, options: { addToRecents?: boolean } = {}): Promise<void> => {
    const nextRepoPath = repoPath.trim();
    if (!nextRepoPath) {
      return;
    }

    requestIds.current.diff += 1;
    requestIds.current.history += 1;
    requestIds.current.commitDetails += 1;
    requestIds.current.commitFileDiff += 1;
    requestIds.current.workflowRuns += 1;
    requestIds.current.pullRequests += 1;
    requestIds.current.issues += 1;

    updateState((current) => resetGitHubState(resetHistoryState({
      ...current,
      repoPath: nextRepoPath,
      repoLoading: true,
      showSetup: false,
      setupError: "",
      cloneError: "",
      clonePanelOpen: false,
      summary: null,
      branchDialogOpen: false,
      branchNameDraft: "",
      branchError: "",
      upstreamDialogOpen: false,
      upstreamDraft: null,
      upstreamError: "",
      lastResult: null,
      lastOperationResult: null,
      activeView: isGitHubView(current.activeView) ? "status" : current.activeView,
      selection: null,
      diff: null,
      diffLoading: false
    })));

    await refreshRepo({
      addToRecents: options.addToRecents ?? false
    });
  }, [refreshRepo, updateState]);

  const initializeRepository = useCallback(async (): Promise<void> => {
    let repoRecents: string[] = [];

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
    }

    updateState((current) => ({
      ...current,
      repoPath: repoRecents[0] ?? "",
      repoRecents,
      showSetup: repoRecents.length === 0,
      setupError: repoRecents.length === 0 ? "" : current.setupError
    }));

    if (repoRecents.length > 0) {
      await refreshRepo({
        addToRecents: true
      });
    }
  }, [refreshRepo, updateState]);

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

  useEffect(() => {
    void initializeRepository();
    void loadAiSettings();
  }, [initializeRepository, loadAiSettings]);

  useEffect(() => {
    if (!state.summary?.isValid) {
      fileStatusDirtyRef.current = false;
      void window.githead.unwatchRepoChanges(state.repoPath).catch(() => undefined);
      return;
    }

    const watchedRepoPath = state.summary.repoPath;
    void window.githead.watchRepoChanges(watchedRepoPath).catch(() => {
      fileStatusDirtyRef.current = true;
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

    updateState({
      cloneCheckRunning: true,
      cloneCheckStatus: "idle",
      cloneCheckMessage: "",
      cloneBranches: [],
      cloneError: ""
    });

    try {
      const result = await window.githead.checkRepositoryAccess({
        source: current.cloneDraft.source
      });

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
      updateState({
        cloneCheckStatus: "error",
        cloneCheckMessage: error instanceof Error ? error.message : "Unable to check repository access.",
        cloneBranches: []
      });
    } finally {
      updateState({
        cloneCheckRunning: false
      });
    }
  }, [updateState]);

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

    updateState({
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
        depth
      });
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

      await switchRepo(result.repoPath, {
        addToRecents: true
      });
      updateState({
        cloneDraft: emptyCloneDraft,
        cloneError: "",
        cloneCheckStatus: "idle",
        cloneCheckMessage: "",
        cloneBranches: [],
        clonePanelOpen: false
      });
    } catch (error) {
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
      updateState({
        cloneRunning: false
      });
    }
  }, [appendOperationLog, switchRepo, updateState]);

  const selectRecentRepo = useCallback(async (repoPath: string): Promise<void> => {
    if (isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    await switchRepo(repoPath, {
      addToRecents: true
    });
  }, [switchRepo]);

  const removeRecentRepo = useCallback(async (repoPath: string): Promise<void> => {
    try {
      const repoRecents = await window.githead.removeRepoRecent(repoPath);
      updateState({
        repoRecents
      });
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

  const createTrustFailure = useCallback((): GitOperationResult => ({
    repoPath: stateRef.current.repoPath,
    exitCode: -1,
    stdout: "",
    stderr: `${TRUST_WORKSPACE_TITLE} ${TRUST_WORKSPACE_DESCRIPTION}`
  }), []);

  const closeTrustDialog = useCallback((trusted: boolean): void => {
    const resolve = trustDialogResolveRef.current;
    trustDialogResolveRef.current = null;
    setTrustDialogOpen(false);
    resolve?.(trusted);
  }, []);

  const confirmWorkspaceTrust = useCallback(async (): Promise<boolean> => {
    if (trustDialogResolveRef.current) {
      return false;
    }

    setTrustDialogOpen(true);
    return new Promise((resolve) => {
      trustDialogResolveRef.current = resolve;
    });
  }, []);

  const ensureTrustedRepo = useCallback(async (): Promise<boolean> => {
    const repoPath = stateRef.current.repoPath;
    if (!repoPath.trim()) {
      return false;
    }

    try {
      const existingTrust = await window.githead.getRepoTrust({ repoPath });
      if (existingTrust.trusted) {
        return true;
      }

      if (!(await confirmWorkspaceTrust())) {
        updateState({
          lastOperationResult: createTrustFailure()
        });
        return false;
      }

      const nextTrust: RepoTrustResult = await window.githead.addRepoTrust({ repoPath });
      if (nextTrust.trusted) {
        return true;
      }

      updateState({
        lastOperationResult: createTrustFailure()
      });
      return false;
    } catch (error) {
      updateState({
        lastOperationResult: {
          repoPath,
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unable to update repository trust."
        }
      });
      return false;
    }
  }, [confirmWorkspaceTrust, createTrustFailure, updateState]);

  const runAction = useCallback(async (action: GitAction): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }

    if (!(await ensureTrustedRepo())) {
      return;
    }

    updateState({
      runningAction: action,
      lastResult: null,
      logText: ""
    });

    try {
      const lastResult = await window.githead.runGitAction({
        repoPath: stateRef.current.repoPath,
        action
      });
      updateState({
        lastResult
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Git command failed.";
      updateState((latest) => ({
        ...latest,
        lastResult: {
          runId: "renderer-error",
          action,
          repoPath: latest.repoPath,
          exitCode: -1,
          stdout: "",
          stderr: message,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString()
        }
      }));
      appendSystemLine(message);
    } finally {
      updateState((latest) => invalidateHistory({
        ...latest,
        runningAction: null
      }));
      await refreshRepo();
    }
  }, [appendSystemLine, ensureTrustedRepo, refreshRepo, updateState]);

  const runRepoOperation = useCallback(async (
    label: string,
    nextSelection: FileSelection | null | undefined,
    operation: () => Promise<GitOperationResult>
  ): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }

    updateState({
      runningOperation: label,
      lastOperationResult: null
    });

    try {
      const lastOperationResult = await operation();
      updateState({
        lastOperationResult
      });
      appendOperationLog(label, lastOperationResult);
    } catch (error) {
      const lastOperationResult: GitOperationResult = {
        repoPath: stateRef.current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : `${label} failed.`
      };

      updateState({
        lastOperationResult
      });
      appendOperationLog(label, lastOperationResult);
    } finally {
      updateState((latest) => {
        let next: AppState = {
          ...latest,
          runningOperation: null
        };

        if (latest.lastOperationResult?.exitCode === 0 && nextSelection !== undefined) {
          next = {
            ...next,
            selection: nextSelection,
            diff: null
          };
        }

        if (latest.lastOperationResult?.exitCode === 0) {
          next = invalidateHistory(next);
        }

        return next;
      });
      await refreshRepo();
    }
  }, [appendOperationLog, refreshRepo, updateState]);

  const openBranchDialog = useCallback((): void => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
      return;
    }

    updateState({
      branchDialogOpen: true,
      branchNameDraft: "",
      branchError: ""
    });
  }, [updateState]);

  const closeBranchDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      branchDialogOpen: false,
      branchError: ""
    });
  }, [updateState]);

  const openUpstreamDialog = useCallback((): void => {
    const current = stateRef.current;
    const summary = current.summary;
    if (!summary?.isValid || isOperationRunning(current) || !summary.branch) {
      return;
    }

    if (summary.remoteBranches.length === 0 && !summary.upstream) {
      return;
    }

    const currentUpstreamAvailable = summary.upstream
      ? summary.remoteBranches.some((remoteBranch) => remoteBranch.name === summary.upstream)
      : false;

    updateState({
      upstreamDialogOpen: true,
      upstreamDraft: currentUpstreamAvailable
        ? summary.upstream
        : summary.remoteBranches[0]?.name ?? null,
      upstreamError: ""
    });
  }, [updateState]);

  const closeUpstreamDialog = useCallback((): void => {
    if (isOperationRunning(stateRef.current)) {
      return;
    }

    updateState({
      upstreamDialogOpen: false,
      upstreamError: ""
    });
  }, [updateState]);

  const switchBranch = useCallback(async (branchName: string): Promise<void> => {
    const current = stateRef.current;
    const nextBranchName = branchName.trim();

    if (!current.summary?.isValid || isOperationRunning(current) || !nextBranchName || nextBranchName === current.summary.branch) {
      return;
    }

    if (!(await ensureTrustedRepo())) {
      return;
    }

    await runRepoOperation(`Switching branch to ${nextBranchName}`, null, () =>
      window.githead.switchBranch({
        repoPath: stateRef.current.repoPath,
        branchName: nextBranchName
      })
    );
  }, [ensureTrustedRepo, runRepoOperation]);

  const setBranchUpstream = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const summary = current.summary;

    if (!summary?.isValid || isOperationRunning(current) || !summary.branch) {
      return;
    }

    const branchName = summary.branch;
    if (current.upstreamDraft === summary.upstream) {
      updateState({
        upstreamDialogOpen: false,
        upstreamError: ""
      });
      return;
    }

    const upstream = current.upstreamDraft;
    if (upstream !== null && !summary.remoteBranches.some((remoteBranch) => remoteBranch.name === upstream)) {
      updateState({
        upstreamError: "Select a fetched remote branch."
      });
      return;
    }

    updateState({
      upstreamError: ""
    });

    if (!(await ensureTrustedRepo())) {
      updateState({
        upstreamError: "Repository trust is required before changing branch upstreams."
      });
      return;
    }

    const label = upstream ? `Changing upstream to ${upstream}` : "Clearing upstream";
    await runRepoOperation(label, null, () =>
      window.githead.setBranchUpstream({
        repoPath: stateRef.current.repoPath,
        branchName,
        upstream
      })
    );

    const result = stateRef.current.lastOperationResult;
    if (result?.exitCode === 0) {
      updateState({
        upstreamDialogOpen: false,
        upstreamDraft: null,
        upstreamError: ""
      });
      return;
    }

    updateState({
      upstreamError: getOperationFailureMessage(result, "Unable to change upstream.")
    });
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

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

    if (!(await ensureTrustedRepo())) {
      updateState({
        branchError: "Repository trust is required before creating branches."
      });
      return;
    }

    await runRepoOperation(`Creating branch ${branchName}`, null, () =>
      window.githead.createBranch({
        repoPath: stateRef.current.repoPath,
        branchName
      })
    );

    const result = stateRef.current.lastOperationResult;
    if (result?.exitCode === 0) {
      updateState({
        branchDialogOpen: false,
        branchNameDraft: "",
        branchError: ""
      });
      return;
    }

    updateState({
      branchError: getOperationFailureMessage(result, "Unable to create branch.")
    });
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const stageFiles = useCallback(async (paths: string[], nextSelection?: FileSelection): Promise<void> => {
    await runRepoOperation("Staging files", nextSelection, () =>
      window.githead.stageFiles({
        repoPath: stateRef.current.repoPath,
        paths
      })
    );
  }, [runRepoOperation]);

  const unstageFiles = useCallback(async (paths: string[], nextSelection?: FileSelection): Promise<void> => {
    await runRepoOperation("Unstaging files", nextSelection, () =>
      window.githead.unstageFiles({
        repoPath: stateRef.current.repoPath,
        paths
      })
    );
  }, [runRepoOperation]);

  const applySelectedHunk = useCallback(async (patch: string): Promise<void> => {
    const selection = stateRef.current.selection;
    if (!selection) {
      return;
    }

    if (selection.side === "unstaged") {
      await runRepoOperation("Staging hunk", selection, () =>
        window.githead.stageHunk({
          repoPath: stateRef.current.repoPath,
          path: selection.path,
          side: selection.side,
          patch
        })
      );
      return;
    }

    await runRepoOperation("Unstaging hunk", selection, () =>
      window.githead.unstageHunk({
        repoPath: stateRef.current.repoPath,
        path: selection.path,
        side: selection.side,
        patch
      })
    );
  }, [runRepoOperation]);

  const commitChanges = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canCommit(current)) {
      return;
    }

    if (!(await ensureTrustedRepo())) {
      return;
    }

    await runRepoOperation("Committing changes", null, () =>
      window.githead.commitChanges({
        repoPath: stateRef.current.repoPath,
        message: stateRef.current.commitMessage
      })
    );

    if (stateRef.current.lastOperationResult?.exitCode === 0) {
      updateState({
        commitMessage: ""
      });
    }
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const commitAndPush = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canCommit(current)) {
      return;
    }

    await commitChanges();
    if (stateRef.current.lastOperationResult?.exitCode === 0 && canPush(stateRef.current.summary)) {
      await runAction("push");
    }
  }, [commitChanges, runAction]);

  const generateCommitMessage = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canGenerateCommitMessage(current)) {
      return;
    }

    updateState({
      runningOperation: "Generating commit message",
      lastOperationResult: null
    });

    try {
      const result = await window.githead.generateCommitMessage({
        repoPath: stateRef.current.repoPath
      });
      const generatedMessage = result.exitCode === 0 ? result.stdout.trim() : stateRef.current.commitMessage;
      updateState({
        lastOperationResult: result.exitCode === 0
          ? {
              ...result,
              stdout: "Commit message generated."
            }
          : result,
        commitMessage: generatedMessage
      });
      appendOperationLog("Generating commit message", result);
    } catch (error) {
      const lastOperationResult: GitOperationResult = {
        repoPath: stateRef.current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unable to generate commit message."
      };

      updateState({
        lastOperationResult
      });
      appendOperationLog("Generating commit message", lastOperationResult);
    } finally {
      updateState({
        runningOperation: null
      });
    }
  }, [appendOperationLog, updateState]);

  const openSettingsDialog = useCallback((): void => {
    const settings = stateRef.current.aiSettings;
    updateState({
      settingsOpen: true,
      settingsError: "",
      settingsDraft: {
        apiKey: "",
        model: settings?.model ?? "",
        siteUrl: settings?.siteUrl ?? "",
        siteTitle: settings?.siteTitle ?? "Githead"
      }
    });
  }, [updateState]);

  const closeSettingsDialog = useCallback((): void => {
    if (stateRef.current.settingsSaving) {
      return;
    }

    updateState({
      settingsOpen: false,
      settingsError: ""
    });
  }, [updateState]);

  const saveAiSettings = useCallback(async (): Promise<void> => {
    if (stateRef.current.settingsSaving) {
      return;
    }

    updateState({
      settingsError: "",
      settingsSaving: true
    });

    try {
      const draft = stateRef.current.settingsDraft;
      const aiSettings = await window.githead.saveAiSettings({
        apiKey: draft.apiKey,
        model: draft.model,
        siteUrl: draft.siteUrl,
        siteTitle: draft.siteTitle
      });
      updateState({
        aiSettings,
        settingsOpen: false
      });
    } catch (error) {
      updateState({
        settingsError: error instanceof Error ? error.message : "Unable to save AI settings."
      });
    } finally {
      updateState({
        settingsSaving: false
      });
    }
  }, [updateState]);

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

    updateState({
      activeView: view
    });

    const latest = stateRef.current;
    if (view === "status") {
      void refreshDirtyFileStatus();
    }
    if (view === "history" && !latest.historyLoaded && !latest.historyLoading) {
      void loadCommitHistory(false);
    }
    if (view === "workflows" && !latest.workflowRunsLoaded && !latest.workflowRunsLoading) {
      void loadWorkflowRuns(false);
    }
    if (view === "pullRequests" && !latest.pullRequestsLoaded && !latest.pullRequestsLoading) {
      void loadPullRequests(false);
    }
    if (view === "issues" && !latest.issuesLoaded && !latest.issuesLoading) {
      void loadIssues(false);
    }
  }, [loadCommitHistory, loadIssues, loadPullRequests, loadWorkflowRuns, refreshDirtyFileStatus, updateState]);

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
        diffLoading: false
      });
      return;
    }

    updateState({
      selection,
      diff: null
    });
    void loadSelectedDiff(selection);
  }, [loadSelectedDiff, updateState]);

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

    updateState({
      runningOperation: "Copying commit SHA",
      lastOperationResult: null
    });

    try {
      const lastOperationResult = await window.githead.copyCommitShaToClipboard({
        repoPath: stateRef.current.repoPath,
        hash: commit.hash
      });
      updateState({
        lastOperationResult
      });
      appendOperationLog("Copying commit SHA", lastOperationResult);
    } catch (error) {
      const lastOperationResult: GitOperationResult = {
        repoPath: stateRef.current.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Copying commit SHA failed."
      };
      updateState({
        lastOperationResult
      });
      appendOperationLog("Copying commit SHA", lastOperationResult);
    } finally {
      updateState({
        runningOperation: null
      });
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

    void copyCommitShaToClipboard(commit);
  }, [copyCommitShaToClipboard, openResetCommitDialog, openRevertCommitDialog, openTagDialog, selectCommit]);

  const runCommitFileContextAction = useCallback((file: GitCommitChangedFile, action: CommitFileContextActionKind): void => {
    const repoPath = stateRef.current.repoPath;
    const hash = stateRef.current.selectedCommitHash;
    if (!repoPath || !hash) {
      return;
    }

    if (action === "log" || action === "blame") {
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
        })
      );
      return;
    }

    if (action === "open-selected") {
      void runRepoOperation("Opening selected file version", undefined, () =>
        window.githead.openCommitFileVersion({
          repoPath,
          hash,
          path: file.path
        })
      );
      return;
    }

    void runRepoOperation("Copying path", undefined, () =>
      window.githead.copyPathToClipboard({
        repoPath,
        path: file.path
      })
    );
  }, [openResetCommitFileDialog, runRepoOperation, selectCommitFile]);

  const createTag = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.tagDialog;
    const tagName = dialog.tagName.trim();

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

    if (!(await ensureTrustedRepo())) {
      updateState({
        tagDialog: {
          ...stateRef.current.tagDialog,
          error: "Repository trust is required before creating tags."
        }
      });
      return;
    }

    await runRepoOperation(`Creating tag ${tagName}`, null, () =>
      window.githead.createTag({
        repoPath: stateRef.current.repoPath,
        hash: stateRef.current.tagDialog.hash,
        tagName,
        message: stateRef.current.tagDialog.message,
        lightweight: stateRef.current.tagDialog.lightweight,
        force: stateRef.current.tagDialog.force,
        pushRemote: stateRef.current.tagDialog.pushRemote
      })
    );

    const result = stateRef.current.lastOperationResult;
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
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const deleteTag = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.tagDialog;
    const tagName = dialog.deleteTagName.trim();

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

    updateState({
      tagDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo())) {
      updateState({
        tagDialog: {
          ...stateRef.current.tagDialog,
          error: "Repository trust is required before removing tags."
        }
      });
      return;
    }

    await runRepoOperation(`Removing tag ${tagName}`, null, () =>
      window.githead.deleteTag({
        repoPath: stateRef.current.repoPath,
        tagName,
        pushRemote: stateRef.current.tagDialog.deletePushRemote
      })
    );

    const result = stateRef.current.lastOperationResult;
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
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const resetBranchToCommit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.resetCommitDialog;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    updateState({
      resetCommitDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo())) {
      updateState({
        resetCommitDialog: {
          ...stateRef.current.resetCommitDialog,
          error: "Repository trust is required before resetting branches."
        }
      });
      return;
    }

    await runRepoOperation("Resetting branch to commit", null, () =>
      window.githead.resetBranchToCommit({
        repoPath: stateRef.current.repoPath,
        hash: stateRef.current.resetCommitDialog.hash,
        mode: stateRef.current.resetCommitDialog.mode
      })
    );

    const result = stateRef.current.lastOperationResult;
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
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const resetFilesToCommit = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const dialog = current.resetCommitFileDialog;

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash || dialog.paths.length === 0) {
      return;
    }

    updateState({
      resetCommitFileDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo())) {
      updateState({
        resetCommitFileDialog: {
          ...stateRef.current.resetCommitFileDialog,
          error: "Repository trust is required before resetting files."
        }
      });
      return;
    }

    await runRepoOperation(
      dialog.paths.length === 1 ? "Resetting file to commit" : "Resetting files to commit",
      null,
      () => window.githead.resetFilesToCommit({
        repoPath: stateRef.current.repoPath,
        hash: stateRef.current.resetCommitFileDialog.hash,
        paths: stateRef.current.resetCommitFileDialog.paths
      })
    );

    const result = stateRef.current.lastOperationResult;
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
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

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

    if (!current.summary?.isValid || isOperationRunning(current) || !dialog.hash) {
      return;
    }

    updateState({
      revertCommitDialog: {
        ...dialog,
        error: ""
      }
    });

    if (!(await ensureTrustedRepo())) {
      updateState({
        revertCommitDialog: {
          ...stateRef.current.revertCommitDialog,
          error: "Repository trust is required before reversing commits."
        }
      });
      return;
    }

    await runRepoOperation("Reversing commit", null, () =>
      window.githead.revertCommit({
        repoPath: stateRef.current.repoPath,
        hash: stateRef.current.revertCommitDialog.hash
      })
    );

    const result = stateRef.current.lastOperationResult;
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
  }, [ensureTrustedRepo, runRepoOperation, updateState]);

  const runContextFileOperation = useCallback(async (
    file: GitStatusFile,
    side: GitDiffSide,
    kind: "open" | "show" | "copy" | "toggle-stage" | "delete" | "revert" | "ignore"
  ): Promise<void> => {
    const paths = getContextActionPaths(stateRef.current.selection, file, side);

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
    if (kind === "open") {
      await runRepoOperation("Opening file", undefined, () =>
        window.githead.openFile({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "show") {
      await runRepoOperation("Showing file in Explorer", undefined, () =>
        window.githead.showInExplorer({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "copy") {
      await runRepoOperation("Copying path", undefined, () =>
        window.githead.copyPathToClipboard({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "delete") {
      await runRepoOperation(paths.length === 1 ? "Deleting file" : "Deleting files", null, () =>
        window.githead.deleteFiles({
          repoPath,
          paths
        })
      );
      return;
    }
    if (kind === "revert") {
      await runRepoOperation(paths.length === 1 ? "Reverting changes" : "Reverting selected changes", null, () =>
        window.githead.revertFileChanges({
          repoPath,
          paths,
          side
        })
      );
      return;
    }

    await runRepoOperation("Adding to ignore", undefined, () =>
      window.githead.addPathToIgnore({
        repoPath,
        path: file.path
      })
    );
  }, [runRepoOperation, stageFiles, unstageFiles]);

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

  const stagedFiles = useMemo(() => getStagedFiles(state.summary), [state.summary]);
  const unstagedFiles = useMemo(() => getUnstagedFiles(state.summary), [state.summary]);
  const running = isOperationRunning(state);
  const isValid = state.summary?.isValid ?? false;
  const disableActions = running || !isValid;
  const primaryCommitAction = getPrimaryCommitAction(state.summary);
  const actionHeading = getActionHeading(state);
  const repoHealth = getRepoHealth(state);
  const showGitHubTabs = Boolean(state.summary?.githubRepository);

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
          selectedRepoPath={state.repoPath}
          setupError={state.setupError}
          cloneDraft={state.cloneDraft}
          cloneError={state.cloneError}
          cloneRunning={state.cloneRunning}
          cloneCheckRunning={state.cloneCheckRunning}
          cloneCheckStatus={state.cloneCheckStatus}
          cloneCheckMessage={state.cloneCheckMessage}
          cloneBranches={state.cloneBranches}
          running={running}
          onChooseRepo={() => {
            void chooseRepo();
          }}
          onSelectRecent={(repoPath) => {
            void selectRecentRepo(repoPath);
          }}
          onRemoveRecent={(repoPath) => {
            void removeRecentRepo(repoPath);
          }}
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
        />
      </AppChrome>
    );
  }

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
            repoHealth={repoHealth}
            summary={state.summary}
            running={running}
            appUpdate={state.appUpdate}
            clonePanelOpen={state.clonePanelOpen}
            cloneDraft={state.cloneDraft}
            cloneError={state.cloneError}
            cloneRunning={state.cloneRunning}
            cloneCheckRunning={state.cloneCheckRunning}
            cloneCheckStatus={state.cloneCheckStatus}
            cloneCheckMessage={state.cloneCheckMessage}
            cloneBranches={state.cloneBranches}
            onClonePanelOpenChange={setClonePanelOpen}
            onChooseRepo={() => {
              void chooseRepo();
            }}
            onRefreshRepo={() => {
              void refreshRepo();
            }}
            onSelectRecent={(repoPath) => {
              void selectRecentRepo(repoPath);
            }}
            onRemoveRecent={(repoPath) => {
              void removeRecentRepo(repoPath);
            }}
            onSwitchBranch={(branchName) => {
              void switchBranch(branchName);
            }}
            onOpenBranchDialog={openBranchDialog}
            onOpenUpstreamDialog={openUpstreamDialog}
            onOpenSettings={openSettingsDialog}
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
              disabled={disableActions}
              onRunAction={(action) => {
                void runAction(action);
              }}
            />

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
                      <TabsTrigger value="pullRequests" className="workspace-tab-trigger h-9 rounded-none">
                        <GitPullRequest />
                        Pull Requests
                      </TabsTrigger>
                      <TabsTrigger value="issues" className="workspace-tab-trigger h-9 rounded-none">
                        <CircleDot />
                        Issues
                      </TabsTrigger>
                    </>
                  ) : null}
                  <TabsTrigger value="activity" className="workspace-tab-trigger workspace-tab-trigger-end h-9 rounded-none">
                    <Clipboard />
                    Activity Log
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent forceMount value="status" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <StatusView
                  stagedFiles={stagedFiles}
                  unstagedFiles={unstagedFiles}
                  summary={state.summary}
                  selection={state.selection}
                  diff={state.diff}
                  diffLoading={state.diffLoading}
                  disabled={disableActions}
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
                  onApplyHunk={(patch) => {
                    void applySelectedHunk(patch);
                  }}
                  onContextAction={(file, side, kind) => {
                    void runContextFileOperation(file, side, kind);
                  }}
                />
              </TabsContent>

              <TabsContent forceMount value="history" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <HistoryView
                  summary={state.summary}
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
                  disabled={disableActions}
                  onSelectCommit={selectCommit}
                  onSelectCommitFile={selectCommitFile}
                  onCommitContextAction={runCommitContextAction}
                  onCommitFileContextAction={runCommitFileContextAction}
                />
              </TabsContent>

              {showGitHubTabs ? (
                <>
                  <TabsContent forceMount value="workflows" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <WorkflowRunsView
                      summary={state.summary}
                      workflowRuns={state.workflowRuns}
                      loading={state.workflowRunsLoading}
                      loaded={state.workflowRunsLoaded}
                      error={state.workflowRunsError}
                      onOpenExternalUrl={openExternalUrl}
                      onRefresh={() => {
                        void loadWorkflowRuns(true);
                      }}
                    />
                  </TabsContent>

                  <TabsContent forceMount value="pullRequests" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <PullRequestsView
                      summary={state.summary}
                      pullRequests={state.pullRequests}
                      loading={state.pullRequestsLoading}
                      loaded={state.pullRequestsLoaded}
                      error={state.pullRequestsError}
                      onOpenExternalUrl={openExternalUrl}
                      onRefresh={() => {
                        void loadPullRequests(true);
                      }}
                    />
                  </TabsContent>

                  <TabsContent forceMount value="issues" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <IssuesView
                      summary={state.summary}
                      issues={state.issues}
                      loading={state.issuesLoading}
                      loaded={state.issuesLoaded}
                      error={state.issuesError}
                      onOpenExternalUrl={openExternalUrl}
                      onRefresh={() => {
                        void loadIssues(true);
                      }}
                    />
                  </TabsContent>
                </>
              ) : null}

              <TabsContent forceMount value="activity" className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <ActivityLogView
                  logText={state.logText}
                  logOutputRef={logOutputRef}
                  onClearLog={() => {
                    updateState({
                      logText: ""
                    });
                  }}
                />
              </TabsContent>
            </Tabs>

            {state.activeView === "status" ? (
              <CommitPanel
                commitMessage={state.commitMessage}
                disabled={disableActions}
                primaryCommitAction={primaryCommitAction}
                pushableCommitCount={getPushableCommitCount(state.summary)}
                canCommit={canCommit(state)}
                canGenerateCommitMessage={canGenerateCommitMessage(state)}
                generateTitle={getGenerateMessageTitle(state)}
                onCommit={() => {
                  if (primaryCommitAction === "commit") {
                    void commitChanges();
                  } else if (primaryCommitAction === "push") {
                    void runAction("push");
                  }
                }}
                onCommitAndPush={() => {
                  void commitAndPush();
                }}
                onGenerateMessage={() => {
                  void generateCommitMessage();
                }}
                onCommitMessageChange={(commitMessage) => {
                  updateState({
                    commitMessage
                  });
                }}
              />
            ) : null}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      <SettingsDialog
        open={state.settingsOpen}
        draft={state.settingsDraft}
        saving={state.settingsSaving}
        error={state.settingsError}
        onOpenChange={(open) => {
          if (!open) {
            closeSettingsDialog();
          }
        }}
        onDraftChange={(settingsDraft) => {
          updateState({
            settingsDraft
          });
        }}
        onSave={(event) => {
          event.preventDefault();
          void saveAiSettings();
        }}
      />

      <BranchDialog
        open={state.branchDialogOpen}
        branchName={state.branchNameDraft}
        saving={state.runningOperation?.startsWith("Creating branch ") ?? false}
        error={state.branchError}
        onOpenChange={(open) => {
          if (!open) {
            closeBranchDialog();
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

      <UpstreamDialog
        open={state.upstreamDialogOpen}
        currentUpstream={state.summary?.upstream ?? null}
        remoteBranches={state.summary?.remoteBranches ?? []}
        upstream={state.upstreamDraft}
        saving={state.runningOperation?.startsWith("Changing upstream") || state.runningOperation === "Clearing upstream"}
        error={state.upstreamError}
        onOpenChange={(open) => {
          if (!open) {
            closeUpstreamDialog();
          }
        }}
        onUpstreamChange={(upstreamDraft) => {
          updateState({
            upstreamDraft,
            upstreamError: ""
          });
        }}
        onSave={(event) => {
          event.preventDefault();
          void setBranchUpstream();
        }}
      />

      <TagDialog
        state={state.tagDialog}
        commit={getCommitByHash(state.history, state.tagDialog.hash)}
        remotes={getPushRemotes(state.summary)}
        saving={Boolean(state.runningOperation?.startsWith("Creating tag ") || state.runningOperation?.startsWith("Removing tag "))}
        onOpenChange={(open) => {
          if (!open) {
            closeTagDialog();
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
        onOpenChange={(open) => {
          if (!open) {
            closeResetCommitDialog();
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
            closeResetCommitFileDialog();
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
            closeRevertCommitDialog();
          }
        }}
        onReverse={(event) => {
          event.preventDefault();
          void revertCommit();
        }}
      />

      <TrustWorkspaceDialog
        open={trustDialogOpen}
        repoPath={state.repoPath}
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
    <main className="app-shell bg-background text-foreground">
      <header className="window-chrome" data-maximized={isMaximized ? "true" : "false"}>
        <div className="window-title">
          <div className="window-title-mark" aria-hidden="true">G</div>
          <span>Githead</span>
        </div>
        <TooltipProvider>
          <WindowControls
            isMaximized={isMaximized}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onClose}
          />
        </TooltipProvider>
      </header>
      <section className="app-content">
        {children}
      </section>
    </main>
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
  selectedRepoPath,
  setupError,
  cloneDraft,
  cloneError,
  cloneRunning,
  cloneCheckRunning,
  cloneCheckStatus,
  cloneCheckMessage,
  cloneBranches,
  running,
  onChooseRepo,
  onSelectRecent,
  onRemoveRecent,
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone
}: {
  repoRecents: string[];
  selectedRepoPath: string;
  setupError: string;
  cloneDraft: CloneDraft;
  cloneError: string;
  cloneRunning: boolean;
  cloneCheckRunning: boolean;
  cloneCheckStatus: "idle" | "success" | "error";
  cloneCheckMessage: string;
  cloneBranches: string[];
  running: boolean;
  onChooseRepo: () => void;
  onSelectRecent: (repoPath: string) => void;
  onRemoveRecent: (repoPath: string) => void;
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
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
            <p className="setup-error" role="alert">{setupError}</p>
          ) : null}
          {selectedRepoPath ? (
            <p className="setup-selected-path">{selectedRepoPath}</p>
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
            onCloneDraftChange={onCloneDraftChange}
            onCloneSourceChange={onCloneSourceChange}
            onChooseCloneParent={onChooseCloneParent}
            onCheckRepositoryAccess={onCheckRepositoryAccess}
            onClone={onClone}
          />
        </section>
      </div>

      {repoRecents.length > 0 ? (
        <section className="setup-recents" aria-label="Recent repositories">
          <p className="repo-recents-label">Recent Repositories</p>
          <div className="repo-recents-list">
            {repoRecents.map((recentRepoPath) => (
              <div key={getRepoPathKey(recentRepoPath)} className="repo-recent-row">
                <button
                  type="button"
                  className="repo-recent-main"
                  onClick={() => {
                    onSelectRecent(recentRepoPath);
                  }}
                  disabled={running}
                  aria-label={`Switch to ${recentRepoPath}`}
                >
                  <span className="repo-recent-name">{getRepoDisplayName(recentRepoPath)}</span>
                  <span className="repo-recent-path">{recentRepoPath}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="repo-recent-remove"
                  onClick={() => {
                    onRemoveRecent(recentRepoPath);
                  }}
                  disabled={running}
                  aria-label={`Remove ${recentRepoPath} from recent repositories`}
                  title="Remove recent repository"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
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
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
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
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone
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
          <p>Clone from any Git-supported HTTPS, SSH, or local source.</p>
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
          <div className="clone-branch-control">
            <Input
              id={branchId}
              className="clone-branch-input"
              value={cloneDraft.branchName}
              disabled={cloneRunning}
              placeholder="Optional"
              onChange={(event) => {
                onCloneDraftChange({
                  ...cloneDraft,
                  branchName: event.target.value
                });
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="clone-branch-trigger"
                  disabled={cloneRunning || cloneBranches.length === 0}
                  aria-label="Choose branch"
                  title="Choose branch"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="clone-branch-menu">
                {cloneBranches.map((branch) => (
                  <DropdownMenuItem
                    key={branch}
                    onSelect={() => {
                      onCloneDraftChange({
                        ...cloneDraft,
                        branchName: branch
                      });
                    }}
                  >
                    {branch}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {cloneError ? (
        <p className="setup-error" role="alert">{cloneError}</p>
      ) : null}
      {cloneCheckMessage ? (
        <p className={cloneCheckStatus === "success" ? "setup-success" : "setup-error"} role={cloneCheckStatus === "error" ? "alert" : "status"}>
          {cloneCheckMessage}
        </p>
      ) : null}

      <Button type="submit" className="w-full justify-center" disabled={cloneBusy}>
        {cloneRunning ? <Loader2 className="animate-spin" /> : <Download />}
        {cloneRunning ? "Cloning" : "Clone Repository"}
      </Button>
    </form>
  );
}

function RepositoryPanel({
  repoPath,
  repoRecents,
  repoHealth,
  summary,
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
  onClonePanelOpenChange,
  onChooseRepo,
  onRefreshRepo,
  onSelectRecent,
  onRemoveRecent,
  onSwitchBranch,
  onOpenBranchDialog,
  onOpenUpstreamDialog,
  onOpenSettings,
  onCloneDraftChange,
  onCloneSourceChange,
  onChooseCloneParent,
  onCheckRepositoryAccess,
  onClone,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate
}: {
  repoPath: string;
  repoRecents: string[];
  repoHealth: { text: string; state: "good" | "bad" | "neutral" };
  summary: RepoSummary | null;
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
  onClonePanelOpenChange: (open: boolean) => void;
  onChooseRepo: () => void;
  onRefreshRepo: () => void;
  onSelectRecent: (repoPath: string) => void;
  onRemoveRecent: (repoPath: string) => void;
  onSwitchBranch: (branchName: string) => void;
  onOpenBranchDialog: () => void;
  onOpenUpstreamDialog: () => void;
  onOpenSettings: () => void;
  onCloneDraftChange: (draft: CloneDraft) => void;
  onCloneSourceChange: (draft: CloneDraft) => void;
  onChooseCloneParent: () => void;
  onCheckRepositoryAccess: () => void;
  onClone: (event: FormEvent<HTMLFormElement>) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
}): ReactNode {
  const [addMode, setAddMode] = useState<"choice" | "clone">("choice");
  const remotes = summary?.remotes.length
    ? [...new Set(summary.remotes.map((remote) => remote.name))].join(", ")
    : "-";
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
      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5">
        <div className="grid size-11 place-items-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">
          G
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Githead</h1>
          <p className={repoHealth.state === "good" ? "status-text good" : repoHealth.state === "bad" ? "status-text bad" : "status-text"}>
            {repoHealth.text}
          </p>
        </div>
        <Popover open={clonePanelOpen} onOpenChange={updateAddPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Add repository"
              title="Add repository"
            >
              <Plus />
            </Button>
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
                onCloneDraftChange={onCloneDraftChange}
                onCloneSourceChange={onCloneSourceChange}
                onChooseCloneParent={onChooseCloneParent}
                onCheckRepositoryAccess={onCheckRepositoryAccess}
                onClone={onClone}
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
      </div>

      {repoRecents.length > 0 ? (
        <section className="repo-recents" aria-label="Recent repositories">
          <p className="repo-recents-label">Recent Repositories</p>
          <div className="repo-recents-list">
            {repoRecents.map((recentRepoPath) => {
              const active = isSameRepoPath(recentRepoPath, repoPath);

              return (
                <div key={getRepoPathKey(recentRepoPath)} className={`repo-recent-row${active ? " is-active" : ""}`}>
                  <button
                    type="button"
                    className="repo-recent-main"
                    onClick={() => {
                      onSelectRecent(recentRepoPath);
                    }}
                    disabled={running || active}
                    aria-current={active ? "true" : undefined}
                    aria-label={`Switch to ${recentRepoPath}`}
                  >
                    <span className="repo-recent-name">{getRepoDisplayName(recentRepoPath)}</span>
                    <span className="repo-recent-path">{recentRepoPath}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="repo-recent-remove"
                    onClick={() => {
                      onRemoveRecent(recentRepoPath);
                    }}
                    disabled={running}
                    aria-label={`Remove ${recentRepoPath} from recent repositories`}
                    title="Remove recent repository"
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <dl className="repo-facts">
        <BranchFact
          currentBranch={summary?.branch ?? null}
          branches={summary?.branches ?? []}
          disabled={running || !summary?.isValid}
          onSwitchBranch={onSwitchBranch}
          onCreateBranch={onOpenBranchDialog}
        />
        <UpstreamFact
          upstream={summary?.upstream ?? null}
          currentBranch={summary?.branch ?? null}
          remoteBranches={summary?.remoteBranches ?? []}
          disabled={running || !summary?.isValid}
          onChangeUpstream={onOpenUpstreamDialog}
        />
        <Fact label="Remotes" value={remotes} />
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
        <Button type="button" variant="secondary" onClick={onRefreshRepo} disabled={running}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
    </aside>
  );
}

function BranchFact({
  currentBranch,
  branches,
  disabled,
  onSwitchBranch,
  onCreateBranch
}: {
  currentBranch: string | null;
  branches: GitBranch[];
  disabled: boolean;
  onSwitchBranch: (branchName: string) => void;
  onCreateBranch: () => void;
}): ReactNode {
  const switchableBranches = branches.filter((branch) => !branch.current && branch.name !== currentBranch);
  const canSwitch = !disabled && switchableBranches.length > 0;

  return (
    <div className="repo-branch-fact">
      <dt>Branch</dt>
      <dd>
        <span className="repo-branch-name" title={currentBranch ?? undefined}>{currentBranch ?? "-"}</span>
        <span className="repo-branch-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={!canSwitch}
                aria-label="Switch branch"
                title="Switch branch"
              >
                <GitBranchIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="branch-menu-content">
              {switchableBranches.map((branch) => (
                <DropdownMenuItem key={branch.name} onSelect={() => onSwitchBranch(branch.name)}>
                  <GitBranchIcon />
                  <span className="branch-menu-name">{branch.name}</span>
                  {branch.upstream ? <span className="branch-menu-upstream">{branch.upstream}</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onCreateBranch}>
                <Plus />
                New Branch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={disabled}
            onClick={onCreateBranch}
            aria-label="Create branch"
            title="Create branch"
          >
            <Plus />
          </Button>
        </span>
      </dd>
    </div>
  );
}

function UpstreamFact({
  upstream,
  currentBranch,
  remoteBranches,
  disabled,
  onChangeUpstream
}: {
  upstream: string | null;
  currentBranch: string | null;
  remoteBranches: GitRemoteBranch[];
  disabled: boolean;
  onChangeUpstream: () => void;
}): ReactNode {
  const canChange = !disabled && Boolean(currentBranch) && (remoteBranches.length > 0 || Boolean(upstream));

  return (
    <div className="repo-upstream-fact">
      <dt>Upstream</dt>
      <dd>
        <span className="repo-upstream-name" title={upstream ?? undefined}>{upstream ?? "-"}</span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={!canChange}
          onClick={onChangeUpstream}
          aria-label="Change upstream"
          title="Change upstream"
        >
          <GitBranchIcon />
        </Button>
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
  if (action === "none") {
    return null;
  }

  const version = state.downloadedVersion ?? state.availableVersion;
  const label = getAppUpdateButtonLabel(state);
  const disabled = state.status === "checking" || state.status === "downloading";
  const icon = state.status === "downloaded"
    ? <RotateCcw />
    : state.status === "checking" || state.status === "downloading"
      ? <Loader2 className="animate-spin" />
      : action === "check"
        ? <RefreshCw />
        : <Download />;

  const runAction = (): void => {
    if (action === "check") {
      onCheck();
      return;
    }

    if (action === "download") {
      onDownload();
      return;
    }

    if (window.confirm("Restart Githead now to install the downloaded update?")) {
      onInstall();
    }
  };

  return (
    <section className={`app-update-control is-${state.status}`} aria-label="App update">
      {state.message ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={state.status === "error" ? "outline" : "secondary"}
              disabled={disabled}
              onClick={runAction}
              aria-label={`${label}: ${state.message}`}
            >
              {icon}
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            {state.message}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant={state.status === "error" ? "outline" : "secondary"}
          disabled={disabled}
          onClick={runAction}
        >
          {icon}
          {label}
        </Button>
      )}
      {version ? <p className="app-update-version">Version {version}</p> : null}
    </section>
  );
}

function ActionBar({
  heading,
  summary,
  runningAction,
  disabled,
  onRunAction
}: {
  heading: string;
  summary: RepoSummary | null;
  runningAction: GitAction | null;
  disabled: boolean;
  onRunAction: (action: GitAction) => void;
}): ReactNode {
  const pullableCommitCount = getPullableCommitCount(summary);
  const pullLabel = pullableCommitCount > 0 ? `Pull (${pullableCommitCount})` : "Pull";

  return (
    <header className="flex items-center justify-between gap-5 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <p className="eyebrow">Sync</p>
        <h2 className="truncate text-base font-semibold">{heading}</h2>
      </div>
      <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="Git actions">
        <Button
          type="button"
          variant={runningAction === "fetch" ? "secondary" : "outline"}
          disabled={disabled}
          onClick={() => onRunAction("fetch")}
          className="min-w-24"
        >
          {runningAction === "fetch" ? <Loader2 className="animate-spin" /> : <Download />}
          Fetch
        </Button>
        <Button
          type="button"
          variant={runningAction === "pull" ? "secondary" : "outline"}
          disabled={disabled}
          onClick={() => onRunAction("pull")}
          className="min-w-24"
        >
          {runningAction === "pull" ? <Loader2 className="animate-spin" /> : <Download />}
          {pullLabel}
        </Button>
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
  disabled,
  onSelectFile,
  onStageFiles,
  onUnstageFiles,
  onRefreshDiff,
  onApplyHunk,
  onContextAction
}: {
  stagedFiles: GitStatusFile[];
  unstagedFiles: GitStatusFile[];
  summary: RepoSummary | null;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  disabled: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onStageFiles: (paths: string[], selection?: FileSelection) => void;
  onUnstageFiles: (paths: string[], selection?: FileSelection) => void;
  onRefreshDiff: () => void;
  onApplyHunk: (patch: string) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
  const stagedSelectionPaths = selection?.side === "staged" ? getSelectionPaths(selection) : [];
  const unstagedSelectionPaths = selection?.side === "unstaged" ? getSelectionPaths(selection) : [];
  const selectedFile = selection
    ? getFilesForSide(summary, selection.side).find((file) => file.path === selection.path) ?? null
    : null;
  const canApplyHunks = Boolean(selection && diff?.kind === "text" && !diff.truncated && !selectedFile?.isConflicted);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 bg-background">
      <ResizablePanel defaultSize="38%" minSize="300px" className="min-w-[300px]">
        <div className="grid h-full min-h-0 grid-rows-2 border-r bg-card">
          <FileGroup
            title="Staged files"
            side="staged"
            files={stagedFiles}
            summary={summary}
            selection={selection}
            disabled={disabled}
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
          <FileGroup
            title="Unstaged files"
            side="unstaged"
            files={unstagedFiles}
            summary={summary}
            selection={selection}
            disabled={disabled}
            className="border-t"
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || unstagedFiles.length === 0}
                  onClick={() => onStageFiles(unstagedFiles.map((file) => file.path))}
                >
                  Stage All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || unstagedSelectionPaths.length === 0}
                  onClick={() => {
                    if (selection?.side === "unstaged" && unstagedSelectionPaths.length > 0) {
                      onStageFiles(
                        unstagedSelectionPaths,
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
          hunkAction={canApplyHunks && selection ? {
            side: selection.side,
            disabled,
            onApply: onApplyHunk
          } : undefined}
          action={
            <Button type="button" variant="outline" size="sm" disabled={disabled || !selection} onClick={onRefreshDiff}>
              <RefreshCw />
              Refresh Diff
            </Button>
          }
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

type ContextActionKind = "open" | "show" | "copy" | "toggle-stage" | "delete" | "revert" | "ignore";
type CommitContextActionKind = "tag" | "reset" | "revert" | "copy";
type CommitFileContextActionKind = "log" | "blame" | "reset" | "open-current" | "open-selected" | "copy";

function FileGroup({
  title,
  side,
  files,
  summary,
  selection,
  disabled,
  actions,
  className = "",
  onSelectFile,
  onContextAction
}: {
  title: string;
  side: GitDiffSide;
  files: GitStatusFile[];
  summary: RepoSummary | null;
  selection: FileSelection | null;
  disabled: boolean;
  actions: ReactNode;
  className?: string;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
  const selectedPathSet = selection?.side === side ? new Set(getSelectionPaths(selection)) : new Set<string>();

  return (
    <section className={`grid min-h-0 grid-rows-[auto_minmax(0,1fr)] ${className}`} aria-label={title}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title} ({files.length})</h2>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
      <div className="file-list" role="listbox" aria-label={title}>
        {!summary?.isValid ? (
          <p className="empty-state">Select a valid repository.</p>
        ) : files.length === 0 ? (
          null
        ) : (
          files.map((file) => (
            <FileRow
              key={`${side}:${file.path}`}
              file={file}
              side={side}
              selected={selectedPathSet.has(file.path)}
              disabled={disabled}
              onSelectFile={onSelectFile}
              onContextAction={onContextAction}
            />
          ))
        )}
      </div>
    </section>
  );
}

function FileRow({
  file,
  side,
  selected,
  disabled,
  onSelectFile,
  onContextAction
}: {
  file: GitStatusFile;
  side: GitDiffSide;
  selected: boolean;
  disabled: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide, modifiers: FileSelectionModifiers) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
  const actionLabel = side === "unstaged" ? "Stage" : "Unstage";
  const deleted = isDeletedOnSide(file, side);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={() => {
          if (!selected) {
            onSelectFile(file, side, { extendRange: false, toggle: false });
          }
        }}
      >
        <button
          type="button"
          className={`file-row ${selected ? "is-selected" : ""}`}
          data-path={file.path}
          role="option"
          aria-selected={selected}
          onClick={(event: MouseEvent<HTMLButtonElement>) => onSelectFile(file, side, {
            extendRange: event.shiftKey,
            toggle: event.ctrlKey || event.metaKey
          })}
        >
          <StatusBadge file={file} side={side} />
          <span className="file-path" title={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
            {file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={disabled || deleted} onSelect={() => onContextAction(file, side, "open")}>
          <ExternalLink />
          Open
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "show")}>
          <MapPinned />
          Show in Explorer
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "copy")}>
          <Clipboard />
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "toggle-stage")}>
          <Save />
          {actionLabel}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" disabled={disabled} onSelect={() => onContextAction(file, side, "delete")}>
          <Trash2 />
          Delete
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onContextAction(file, side, "revert")}>
          <RotateCcw />
          Revert changes
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled || deleted} onSelect={() => onContextAction(file, side, "ignore")}>
          <FileCode2 />
          Add to ignore
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function StatusBadge({ file, side }: { file: GitStatusFile; side: GitDiffSide }): ReactNode {
  return (
    <Badge className={`status-chip ${file.isConflicted ? "conflict" : ""}`}>
      {formatFileStatus(file, side)}
    </Badge>
  );
}

function DiffPanel({
  title,
  eyebrow,
  diff,
  filePath,
  loading,
  emptyMessage,
  hunkAction,
  action
}: {
  title: string;
  eyebrow: string;
  diff: GitFileDiff | null;
  filePath: string;
  loading: boolean;
  emptyMessage: string;
  hunkAction?: DiffHunkAction | undefined;
  action?: ReactNode;
}): ReactNode {
  let content: ReactNode = emptyMessage;
  let outputClass = "diff-output";

  if (loading) {
    content = "Loading diff...";
  } else if (diff) {
    outputClass = `diff-output ${diff.kind}`;
    content = diff.kind === "text"
      ? <DiffRows filePath={filePath} text={diff.text} truncated={Boolean(diff.truncated)} hunkAction={hunkAction} />
      : diff.text;
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card" aria-label={eyebrow}>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="truncate text-sm font-semibold" title={title}>{title}</h2>
        </div>
        {action}
      </div>
      <div className={outputClass}>
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
  const groups = useMemo(() => {
    const rows = parseUnifiedDiff(text, truncated ? ["Diff truncated."] : []);
    return groupDiffRowsByHunk(rows);
  }, [text, truncated]);

  let hunkNumber = 0;

  return groups.map((group, groupIndex) => {
    const groupKey = `${groupIndex}:${group.kind}:${group.rows[0]?.text ?? ""}`;
    const visibleRows = group.kind === "hunk"
      ? group.rows.filter((row) => row.kind !== "hunk")
      : group.rows;
    const rowViews = visibleRows.map((row, rowIndex) => (
      <DiffRowView key={`${rowIndex}:${row.kind}:${row.oldLine ?? ""}:${row.newLine ?? ""}`} row={row} filePath={filePath} />
    ));
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
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="diff-hunk-action"
                  aria-label={hunkActionLabel}
                  title={hunkActionLabel}
                  disabled={hunkAction.disabled}
                  onClick={() => hunkAction.onApply(group.patch!)}
                >
                  {hunkActionLabel}
                </Button>
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
  });
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

function DiffRowView({ row, filePath }: { row: DiffRow; filePath: string }): ReactNode {
  return (
    <div className={`diff-row ${row.kind}`}>
      <span className="diff-line-number old-line">{row.oldLine === null ? "" : row.oldLine}</span>
      <span className="diff-line-number new-line">{row.newLine === null ? "" : row.newLine}</span>
      <span className="diff-marker">{row.marker}</span>
      <DiffCode row={row} filePath={filePath} />
    </div>
  );
}

function DiffCode({ row, filePath }: { row: DiffRow; filePath: string }): ReactNode {
  if (!shouldHighlightDiffRow(row.kind)) {
    return <span className="diff-code">{row.text}</span>;
  }

  const highlighted = highlightDiffCode(filePath, row.text);
  if (highlighted.kind === "highlighted") {
    return <span className="diff-code hljs" dangerouslySetInnerHTML={{ __html: highlighted.value }} />;
  }

  return <span className="diff-code">{highlighted.value}</span>;
}

function HistoryView({
  summary,
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
  disabled,
  onSelectCommit,
  onSelectCommitFile,
  onCommitContextAction,
  onCommitFileContextAction
}: {
  summary: RepoSummary | null;
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
  disabled: boolean;
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
  onCommitFileContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
}): ReactNode {
  const graphLayout = useMemo(() => buildCommitGraphLayout(history), [history]);
  const historyStyle = {
    "--history-graph-width": `${graphLayout.width}px`
  } as CSSProperties;

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0 bg-background" style={historyStyle}>
      <ResizablePanel defaultSize="44%" minSize="180px">
        <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] border-b bg-card" aria-label="Commit list">
          <div className="history-table-header" aria-hidden="true">
            <span>Graph</span>
            <span>Description</span>
            <span>Date</span>
            <span>Author</span>
            <span>Commit</span>
          </div>
          <div className="history-list" role="listbox" aria-label="Commit history">
            {historyLoading ? (
              <p className="empty-state">Loading commit history...</p>
            ) : historyError ? (
              <p className="empty-state bad">{historyError}</p>
            ) : !summary?.isValid ? (
              <p className="empty-state">Select a valid repository.</p>
            ) : history.length === 0 ? (
              <p className="empty-state">No commits in this repository.</p>
            ) : (
              <div className="history-rows">
                <CommitGraphSvg layout={graphLayout} selectedCommitHash={selectedCommitHash} />
                {history.map((commit) => (
                  <HistoryRow
                    key={commit.hash}
                    commit={commit}
                    selected={commit.hash === selectedCommitHash}
                    onSelectCommit={onSelectCommit}
                    onCommitContextAction={onCommitContextAction}
                  />
                ))}
              </div>
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
              selectedFilePath={selectedCommitFilePath}
              disabled={disabled}
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
              emptyMessage={commitFileDiffError || (selectedCommitFilePath ? "Loading diff..." : "Select a file to view the diff")}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function WorkflowRunsView({
  summary,
  workflowRuns,
  loading,
  loaded,
  error,
  onOpenExternalUrl,
  onRefresh
}: {
  summary: RepoSummary | null;
  workflowRuns: GitHubWorkflowRun[];
  loading: boolean;
  loaded: boolean;
  error: string;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const countLabel = loaded ? `${workflowRuns.length} ${workflowRuns.length === 1 ? "run" : "runs"}` : "-";

  return (
    <section className="github-view workflow-runs-grid" aria-label="Workflow runs">
      <GitHubViewHeader
        eyebrow="GitHub"
        title="Workflow Runs"
        repositoryName={repository?.fullName ?? "-"}
        countLabel={countLabel}
        loading={loading}
        disabled={!repository}
        onRefresh={onRefresh}
      />
      <div className="github-table-header" aria-hidden="true">
        <span>Status</span>
        <span>Workflow</span>
        <span>Branch</span>
        <span>Event</span>
        <span>Updated</span>
      </div>
      <div className="github-list" role="list" aria-label="Workflow runs">
        {!repository ? (
          <p className="empty-state">Select a repository with a supported GitHub origin.</p>
        ) : loading ? (
          <p className="empty-state">Loading workflow runs...</p>
        ) : error ? (
          <p className="empty-state bad">{error}</p>
        ) : workflowRuns.length === 0 ? (
          <p className="empty-state">No workflow runs found.</p>
        ) : (
          workflowRuns.map((run) => (
            <WorkflowRunRow key={run.id} run={run} onOpenExternalUrl={onOpenExternalUrl} />
          ))
        )}
      </div>
    </section>
  );
}

function WorkflowRunRow({
  run,
  onOpenExternalUrl
}: {
  run: GitHubWorkflowRun;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  const statusText = formatWorkflowRunStatus(run);

  return (
    <a
      className="github-row workflow-run-row"
      href={run.url}
      target="_blank"
      rel="noreferrer"
      role="listitem"
      onClick={(event) => {
        event.preventDefault();
        onOpenExternalUrl(run.url);
      }}
    >
      <span className={`github-status ${getWorkflowRunStatusClass(run)}`}>
        <span className="github-status-dot" aria-hidden="true" />
        <span className="truncate" title={statusText}>{statusText}</span>
      </span>
      <span className="min-w-0">
        <span className="github-primary-text" title={run.name}>{run.name}</span>
        <span className="github-secondary-text" title={run.commitMessage || run.commitSha}>
          {run.commitMessage || formatShortHash(run.commitSha)}
        </span>
      </span>
      <span className="truncate" title={run.branch}>{run.branch}</span>
      <span className="truncate" title={run.event}>{run.event}</span>
      <span className="truncate" title={formatDate(run.updatedAt)}>{formatDate(run.updatedAt)}</span>
    </a>
  );
}

function PullRequestsView({
  summary,
  pullRequests,
  loading,
  loaded,
  error,
  onOpenExternalUrl,
  onRefresh
}: {
  summary: RepoSummary | null;
  pullRequests: GitHubPullRequest[];
  loading: boolean;
  loaded: boolean;
  error: string;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const countLabel = loaded ? `${pullRequests.length} open ${pullRequests.length === 1 ? "pull request" : "pull requests"}` : "-";

  return (
    <section className="github-view pull-requests-grid" aria-label="Pull requests">
      <GitHubViewHeader
        eyebrow="GitHub"
        title="Pull Requests"
        repositoryName={repository?.fullName ?? "-"}
        countLabel={countLabel}
        loading={loading}
        disabled={!repository}
        onRefresh={onRefresh}
      />
      <div className="github-table-header" aria-hidden="true">
        <span>PR</span>
        <span>Title</span>
        <span>Branch</span>
        <span>Labels</span>
        <span>Updated</span>
      </div>
      <div className="github-list" role="list" aria-label="Pull requests">
        {!repository ? (
          <p className="empty-state">Select a repository with a supported GitHub origin.</p>
        ) : loading ? (
          <p className="empty-state">Loading pull requests...</p>
        ) : error ? (
          <p className="empty-state bad">{error}</p>
        ) : pullRequests.length === 0 ? (
          <p className="empty-state">No open pull requests found.</p>
        ) : (
          pullRequests.map((pullRequest) => (
            <PullRequestRow key={pullRequest.number} pullRequest={pullRequest} onOpenExternalUrl={onOpenExternalUrl} />
          ))
        )}
      </div>
    </section>
  );
}

function PullRequestRow({
  pullRequest,
  onOpenExternalUrl
}: {
  pullRequest: GitHubPullRequest;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  return (
    <a
      className="github-row pull-request-row"
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      role="listitem"
      onClick={(event) => {
        event.preventDefault();
        onOpenExternalUrl(pullRequest.url);
      }}
    >
      <span className="github-issue-number">
        #{pullRequest.number}
        {pullRequest.draft ? <span className="github-draft-text">Draft</span> : null}
      </span>
      <span className="min-w-0">
        <span className="github-primary-text" title={pullRequest.title}>{pullRequest.title}</span>
        <span className="github-secondary-text" title={pullRequest.authorLogin}>
          {pullRequest.authorLogin} · {pullRequest.comments} {pullRequest.comments === 1 ? "comment" : "comments"}
        </span>
      </span>
      <span className="github-secondary-text" title={`${pullRequest.sourceBranch} -> ${pullRequest.targetBranch}`}>
        {pullRequest.sourceBranch} -&gt; {pullRequest.targetBranch}
      </span>
      <GitHubLabels labels={pullRequest.labels} />
      <span className="truncate" title={formatDate(pullRequest.updatedAt)}>{formatDate(pullRequest.updatedAt)}</span>
    </a>
  );
}

function IssuesView({
  summary,
  issues,
  loading,
  loaded,
  error,
  onOpenExternalUrl,
  onRefresh
}: {
  summary: RepoSummary | null;
  issues: GitHubIssue[];
  loading: boolean;
  loaded: boolean;
  error: string;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
}): ReactNode {
  const repository = summary?.githubRepository ?? null;
  const countLabel = loaded ? `${issues.length} open ${issues.length === 1 ? "issue" : "issues"}` : "-";

  return (
    <section className="github-view issues-grid" aria-label="Issues">
      <GitHubViewHeader
        eyebrow="GitHub"
        title="Issues"
        repositoryName={repository?.fullName ?? "-"}
        countLabel={countLabel}
        loading={loading}
        disabled={!repository}
        onRefresh={onRefresh}
      />
      <div className="github-table-header" aria-hidden="true">
        <span>Issue</span>
        <span>Title</span>
        <span>Labels</span>
        <span>Comments</span>
        <span>Updated</span>
      </div>
      <div className="github-list" role="list" aria-label="Issues">
        {!repository ? (
          <p className="empty-state">Select a repository with a supported GitHub origin.</p>
        ) : loading ? (
          <p className="empty-state">Loading issues...</p>
        ) : error ? (
          <p className="empty-state bad">{error}</p>
        ) : issues.length === 0 ? (
          <p className="empty-state">No open issues found.</p>
        ) : (
          issues.map((issue) => (
            <IssueRow key={issue.number} issue={issue} onOpenExternalUrl={onOpenExternalUrl} />
          ))
        )}
      </div>
    </section>
  );
}

function IssueRow({
  issue,
  onOpenExternalUrl
}: {
  issue: GitHubIssue;
  onOpenExternalUrl: (url: string) => void;
}): ReactNode {
  return (
    <a
      className="github-row issue-row"
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      role="listitem"
      onClick={(event) => {
        event.preventDefault();
        onOpenExternalUrl(issue.url);
      }}
    >
      <span className="github-issue-number">#{issue.number}</span>
      <span className="github-primary-text" title={issue.title}>{issue.title}</span>
      <GitHubLabels labels={issue.labels} />
      <span className="github-secondary-text">{issue.comments}</span>
      <span className="truncate" title={formatDate(issue.updatedAt)}>{formatDate(issue.updatedAt)}</span>
    </a>
  );
}

function GitHubLabels({ labels }: { labels: string[] }): ReactNode {
  return (
    <span className="github-labels" title={labels.join(", ")}>
      {labels.length === 0 ? (
        <span className="github-secondary-text">-</span>
      ) : (
        labels.slice(0, 3).map((label) => (
          <span key={label} className="github-label-chip">{label}</span>
        ))
      )}
    </span>
  );
}

function GitHubViewHeader({
  eyebrow,
  title,
  repositoryName,
  countLabel,
  loading,
  disabled,
  onRefresh
}: {
  eyebrow: string;
  title: string;
  repositoryName: string;
  countLabel: string;
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
}): ReactNode {
  return (
    <div className="github-view-header">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        <p className="github-secondary-text" title={repositoryName}>{repositoryName}</p>
      </div>
      <div className="github-view-actions">
        <span className="github-count">{countLabel}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled || loading} onClick={onRefresh}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>
    </div>
  );
}

function CommitGraphSvg({
  layout,
  selectedCommitHash
}: {
  layout: CommitGraphLayout;
  selectedCommitHash: string | null;
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
        {layout.edges.map((edge) => (
          <path
            key={edge.id}
            className={`commit-graph-edge lane-${edge.colorLane % 6}`}
            d={edge.path}
          />
        ))}
      </g>
      <g className="commit-graph-nodes">
        {layout.nodes.map((node) => (
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
}

function HistoryRow({
  commit,
  selected,
  onSelectCommit,
  onCommitContextAction
}: {
  commit: GitCommitGraphRow;
  selected: boolean;
  onSelectCommit: (hash: string) => void;
  onCommitContextAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
}): ReactNode {
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
        <button
          type="button"
          className={`history-row ${selected ? "is-selected" : ""}`}
          role="option"
          aria-selected={selected}
          onClick={() => onSelectCommit(commit.hash)}
        >
          <span className="history-graph-cell" aria-hidden="true" />
          <span className="history-description" title={commit.subject || undefined}>
            <span className="history-refs">
              {commit.refs.map((ref) => (
                <span key={`${commit.hash}:${ref.kind}:${ref.name}`} className={`ref-badge ${ref.kind}`}>
                  {ref.name}
                </span>
              ))}
            </span>
            <CommitSubject
              subject={commit.subject}
              className="history-subject"
              scopeClassName="history-scope"
              descriptionClassName="history-description-text"
            />
          </span>
          <span className="history-date" title={formatDate(commit.authorDate)}>
            {commit.relativeDate || formatDate(commit.authorDate)}
          </span>
          <span className="history-author" title={commit.authorEmail}>{commit.authorName}</span>
          <span className="history-hash" title={commit.hash}>{commit.shortHash}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "tag")}>
          <Tag />
          Tag
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "reset")}>
          <GitBranchIcon />
          Reset current branch to this commit
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "revert")}>
          <RotateCcw />
          Reverse commit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCommitContextAction(commit, "copy")}>
          <Clipboard />
          Copy SHA to clipboard
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
  selectedFilePath,
  disabled,
  onSelectCommit,
  onSelectCommitFile,
  onCommitFileContextAction
}: {
  details: GitCommitDetails | null;
  loading: boolean;
  error: string;
  selectedFilePath: string | null;
  disabled: boolean;
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
  onCommitFileContextAction: (file: GitCommitChangedFile, action: CommitFileContextActionKind) => void;
}): ReactNode {
  let meta: ReactNode;
  let files: ReactNode;
  let fileCount = "No files";

  if (loading) {
    meta = <p className="empty-state">Loading commit details...</p>;
    files = null;
  } else if (error) {
    meta = <p className="empty-state bad">{error}</p>;
    files = null;
  } else if (!details) {
    meta = <p className="empty-state">Select a commit.</p>;
    files = null;
  } else {
    fileCount = `${details.files.length} ${details.files.length === 1 ? "file" : "files"}`;
    meta = (
      <div className="commit-meta-card">
        <h2 className="commit-title text-base font-semibold" title={details.subject || undefined}>
          <CommitSubject
            subject={details.subject}
            className="commit-title-subject"
            scopeClassName="commit-title-scope"
            descriptionClassName="commit-title-description"
          />
        </h2>
        <dl className="commit-facts">
          <Fact label="Commit" value={details.hash} />
          <Fact
            label="Parents"
            value={<ParentCommitLinks parents={details.parents} onSelectCommit={onSelectCommit} />}
          />
          <Fact label="Author" value={`${details.authorName} <${details.authorEmail}>`} />
          <Fact label="Date" value={formatDate(details.authorDate)} />
        </dl>
        {details.body ? (
          <div className="commit-body">
            <ReactMarkdown
              skipHtml
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                )
              }}
            >
              {details.body}
            </ReactMarkdown>
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
          onSelectCommitFile={onSelectCommitFile}
          onContextAction={onCommitFileContextAction}
        />
      ))
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r bg-card" aria-label="Commit details">
      <div className="min-h-0 overflow-auto border-b">{meta}</div>
      <div className="flex min-h-10 items-center justify-between gap-3 border-b px-4 text-sm">
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
          <a
            className="commit-link"
            href={`#commit-${parent}`}
            title={parent}
            onClick={(event) => {
              event.preventDefault();
              onSelectCommit(parent);
            }}
          >
            {parent.slice(0, 10)}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

function CommitFileRow({
  file,
  selected,
  disabled,
  onSelectCommitFile,
  onContextAction
}: {
  file: GitCommitChangedFile;
  selected: boolean;
  disabled: boolean;
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
          <Badge className="status-chip">{file.status}</Badge>
          <span className="file-path" title={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
            {file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}
          </span>
          <span className="commit-file-stats">+{file.additions} -{file.deletions}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled onSelect={() => onContextAction(file, "log")}>
          <History />
          Log Selected
        </ContextMenuItem>
        <ContextMenuItem disabled onSelect={() => onContextAction(file, "blame")}>
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
  disabled,
  primaryCommitAction,
  pushableCommitCount,
  canCommit: commitAllowed,
  canGenerateCommitMessage: generateAllowed,
  generateTitle,
  onCommit,
  onCommitAndPush,
  onGenerateMessage,
  onCommitMessageChange
}: {
  commitMessage: string;
  disabled: boolean;
  primaryCommitAction: "commit" | "push" | null;
  pushableCommitCount: number;
  canCommit: boolean;
  canGenerateCommitMessage: boolean;
  generateTitle: string;
  onCommit: () => void;
  onCommitAndPush: () => void;
  onGenerateMessage: () => void;
  onCommitMessageChange: (message: string) => void;
}): ReactNode {
  const commitDisabled = disabled
    || primaryCommitAction === null
    || (primaryCommitAction === "commit" && !commitAllowed);
  const primaryActionLabel = primaryCommitAction === "push"
    ? `Push (${pushableCommitCount})`
    : "Commit";

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
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={disabled || !generateAllowed} title={generateTitle} onClick={onGenerateMessage}>
          <Sparkles />
          Generate
        </Button>
        <div className="flex items-stretch">
          <Button
            type="button"
            disabled={commitDisabled}
            onClick={onCommit}
            className={primaryCommitAction === "commit" ? "rounded-r-none" : ""}
          >
            {primaryCommitAction === "push" ? <Upload /> : <CheckCircle2 />}
            {primaryActionLabel}
          </Button>
          {primaryCommitAction === "commit" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  disabled={disabled || !commitAllowed}
                  aria-label="More commit actions"
                  className="rounded-l-none border-l-primary-foreground/25 px-2"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onSelect={onCommitAndPush}>
                  <Upload />
                  Commit &amp; Push
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ActivityLogView({
  logText,
  logOutputRef,
  onClearLog
}: {
  logText: string;
  logOutputRef: React.RefObject<HTMLPreElement | null>;
  onClearLog: () => void;
}): ReactNode {
  const hasOutput = logText.trim().length > 0;

  return (
    <section className="activity-log-view" aria-label="Activity log">
      <div className="activity-log-header">
        <div className="min-w-0">
          <p className="eyebrow">Activity Log</p>
          <h2 className="text-sm font-semibold">{hasOutput ? "Output Available" : "Empty"}</h2>
        </div>
        <Button type="button" variant="secondary" disabled={!hasOutput} onClick={onClearLog}>
          <Eraser />
          Clear Log
        </Button>
      </div>
      <pre ref={logOutputRef} className="log-output activity-log-output" aria-live="polite">{logText}</pre>
    </section>
  );
}

function BranchDialog({
  open,
  branchName,
  saving,
  error,
  onOpenChange,
  onBranchNameChange,
  onCreate
}: {
  open: boolean;
  branchName: string;
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
            <DialogTitle>New Branch</DialogTitle>
            <DialogDescription className="sr-only">
              Create a local branch from the current checkout.
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
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              {saving ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({
  state,
  commit,
  remotes,
  saving,
  onOpenChange,
  onStateChange,
  onCreate,
  onDelete
}: {
  state: TagDialogState;
  commit: GitCommitGraphRow | null;
  remotes: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: TagDialogState) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const commitTags = commit ? getCommitTags(commit) : [];
  const remoteOptions = remotes.length > 0 ? remotes : [];

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tag</DialogTitle>
          <DialogDescription>
            {commit ? getCommitSummaryLabel(commit) : "Select a commit to tag."}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={state.tab}
          onValueChange={(tab) => {
            onStateChange({
              ...state,
              tab: tab === "remove" ? "remove" : "add",
              error: ""
            });
          }}
        >
          <TabsList>
            <TabsTrigger value="add">
              <Tag />
              Add Tag
            </TabsTrigger>
            <TabsTrigger value="remove">
              <Trash2 />
              Remove Tag
            </TabsTrigger>
          </TabsList>
          <TabsContent value="add">
            <form className="commit-action-form" onSubmit={onCreate}>
              <div className="form-grid">
                <Label htmlFor="tag-name">Tag Name</Label>
                <Input
                  id="tag-name"
                  value={state.tagName}
                  disabled={saving}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      tagName: event.currentTarget.value,
                      error: ""
                    });
                  }}
                />
                <Label>Commit</Label>
                <span className="commit-action-value">{commit ? getCommitSummaryLabel(commit) : state.hash}</span>
                <Label htmlFor="tag-push-remote">Push tag</Label>
                <select
                  id="tag-push-remote"
                  className="form-select"
                  value={state.pushRemote ?? ""}
                  disabled={saving || remoteOptions.length === 0}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      pushRemote: event.currentTarget.value || null,
                      error: ""
                    });
                  }}
                >
                  <option value="">Do not push</option>
                  {remoteOptions.map((remote) => (
                    <option key={remote} value={remote}>{remote}</option>
                  ))}
                </select>
              </div>
              <div className="commit-action-options">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={state.force}
                    disabled={saving}
                    onChange={(event) => {
                      onStateChange({
                        ...state,
                        force: event.currentTarget.checked,
                        error: ""
                      });
                    }}
                  />
                  Move existing tag
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={state.lightweight}
                    disabled={saving}
                    onChange={(event) => {
                      onStateChange({
                        ...state,
                        lightweight: event.currentTarget.checked,
                        error: ""
                      });
                    }}
                  />
                  Lightweight tag
                </label>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tag-message">Message</Label>
                <Input
                  id="tag-message"
                  value={state.message}
                  disabled={saving || state.lightweight}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      message: event.currentTarget.value,
                      error: ""
                    });
                  }}
                />
              </div>
              {state.error ? <p className="dialog-error">{state.error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Tag />}
                  Add Tag
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          <TabsContent value="remove">
            <form className="commit-action-form" onSubmit={onDelete}>
              <div className="form-grid">
                <Label htmlFor="tag-remove-name">Tag</Label>
                <select
                  id="tag-remove-name"
                  className="form-select"
                  value={state.deleteTagName}
                  disabled={saving || commitTags.length === 0}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      deleteTagName: event.currentTarget.value,
                      error: ""
                    });
                  }}
                >
                  {commitTags.length === 0 ? <option value="">No tags on this commit</option> : null}
                  {commitTags.map((ref) => (
                    <option key={`${state.hash}:${ref.name}`} value={ref.name}>{ref.name}</option>
                  ))}
                </select>
                <Label htmlFor="tag-delete-push-remote">Push delete</Label>
                <select
                  id="tag-delete-push-remote"
                  className="form-select"
                  value={state.deletePushRemote ?? ""}
                  disabled={saving || remoteOptions.length === 0}
                  onChange={(event) => {
                    onStateChange({
                      ...state,
                      deletePushRemote: event.currentTarget.value || null,
                      error: ""
                    });
                  }}
                >
                  <option value="">Do not push</option>
                  {remoteOptions.map((remote) => (
                    <option key={remote} value={remote}>{remote}</option>
                  ))}
                </select>
              </div>
              {state.error ? <p className="dialog-error">{state.error}</p> : null}
              <DialogFooter>
                <Button type="submit" variant="destructive" disabled={saving || commitTags.length === 0}>
                  {saving ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Remove Tag
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ResetCommitDialog({
  state,
  commit,
  branchName,
  saving,
  onOpenChange,
  onStateChange,
  onReset
}: {
  state: ResetCommitDialogState;
  commit: GitCommitGraphRow | null;
  branchName: string | null;
  saving: boolean;
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
            <span className="commit-action-value">{branchName ?? "No current branch"}</span>
            <Label>To commit</Label>
            <span className="commit-action-value">{commit ? getCommitSummaryLabel(commit) : state.hash}</span>
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
          </div>
          {state.error ? <p className="dialog-error">{state.error}</p> : null}
          <DialogFooter>
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
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
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

function UpstreamDialog({
  open,
  currentUpstream,
  remoteBranches,
  upstream,
  saving,
  error,
  onOpenChange,
  onUpstreamChange,
  onSave
}: {
  open: boolean;
  currentUpstream: string | null;
  remoteBranches: GitRemoteBranch[];
  upstream: string | null;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onUpstreamChange: (upstream: string | null) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  const remoteGroups = groupRemoteBranchesByRemote(remoteBranches);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form className="grid gap-4" onSubmit={onSave}>
          <DialogHeader>
            <DialogTitle>Change Upstream</DialogTitle>
            <DialogDescription className="sr-only">
              Change the remote-tracking branch configured for the current branch.
            </DialogDescription>
          </DialogHeader>

          <div className="upstream-dialog-list" role="radiogroup" aria-label="Upstream">
            {remoteGroups.map((group) => (
              <fieldset key={group.remote} className="upstream-remote-group">
                <legend>{group.remote}</legend>
                {group.branches.map((remoteBranch) => (
                  <label key={remoteBranch.name} className="upstream-option">
                    <input
                      type="radio"
                      name="upstream"
                      value={remoteBranch.name}
                      checked={upstream === remoteBranch.name}
                      disabled={saving}
                      onChange={() => onUpstreamChange(remoteBranch.name)}
                    />
                    <span className="upstream-option-main">
                      <span className="upstream-option-name">{remoteBranch.name}</span>
                      <span className="upstream-option-branch">{remoteBranch.branch}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}

            {currentUpstream ? (
              <label className="upstream-option">
                <input
                  type="radio"
                  name="upstream"
                  value=""
                  checked={upstream === null}
                  disabled={saving}
                  onChange={() => onUpstreamChange(null)}
                />
                <span className="upstream-option-main">
                  <span className="upstream-option-name">No upstream</span>
                  <span className="upstream-option-branch">Stop tracking {currentUpstream}</span>
                </span>
              </label>
            ) : null}
          </div>

          <p className="min-h-5 text-sm text-destructive" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Saving" : "Save"}
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

function SettingsDialog({
  open,
  draft,
  saving,
  error,
  onOpenChange,
  onDraftChange,
  onSave
}: {
  open: boolean;
  draft: SettingsDraft;
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: SettingsDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <form className="grid gap-4" onSubmit={onSave}>
          <DialogHeader>
            <p className="eyebrow">OpenRouter</p>
            <DialogTitle>AI Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure OpenRouter credentials and model settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="openrouter-api-key">API Key</Label>
            <Input
              id="openrouter-api-key"
              type="password"
              autoComplete="off"
              placeholder="Leave blank to keep existing key"
              value={draft.apiKey}
              disabled={saving}
              onChange={(event) => onDraftChange({
                ...draft,
                apiKey: event.target.value
              })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="openrouter-model">Model</Label>
            <Input
              id="openrouter-model"
              type="text"
              autoComplete="off"
              value={draft.model}
              disabled={saving}
              onChange={(event) => onDraftChange({
                ...draft,
                model: event.target.value
              })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="openrouter-site-url">Site URL</Label>
            <Input
              id="openrouter-site-url"
              type="url"
              autoComplete="off"
              placeholder="Optional"
              value={draft.siteUrl}
              disabled={saving}
              onChange={(event) => onDraftChange({
                ...draft,
                siteUrl: event.target.value
              })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="openrouter-site-title">Site Title</Label>
            <Input
              id="openrouter-site-title"
              type="text"
              autoComplete="off"
              placeholder="Githead"
              value={draft.siteTitle}
              disabled={saving}
              onChange={(event) => onDraftChange({
                ...draft,
                siteTitle: event.target.value
              })}
            />
          </div>

          <p className="min-h-5 text-sm text-destructive" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useSystemThemeClass(): void {
  useEffect(() => {
    if (!("matchMedia" in window)) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (): void => {
      document.documentElement.classList.toggle("dark", media.matches);
    };

    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => {
      media.removeEventListener("change", syncTheme);
    };
  }, []);
}

function createInvalidSummary(repoPath: string, message: string): RepoSummary {
  return {
    repoPath,
    isValid: false,
    branch: null,
    upstream: null,
    branches: [],
    hasHead: false,
    remotes: [],
    remoteBranches: [],
    githubRepository: null,
    statusLines: [],
    files: [],
    validationErrors: [
      message
    ]
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
      diff: null
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
    diff: path === state.selection.path ? state.diff : null
  };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidateHistory(state: AppState): AppState {
  return {
    ...state,
    historyLoaded: false,
    historyError: ""
  };
}

function resetGitHubState(state: AppState): AppState {
  return {
    ...state,
    workflowRuns: [],
    workflowRunsLoading: false,
    workflowRunsLoaded: false,
    workflowRunsError: "",
    pullRequests: [],
    pullRequestsLoading: false,
    pullRequestsLoaded: false,
    pullRequestsError: "",
    issues: [],
    issuesLoading: false,
    issuesLoaded: false,
    issuesError: ""
  };
}

function reconcileGitHubState(state: AppState, previousSummary: RepoSummary | null): AppState {
  const previousGitHubKey = getGitHubRepositoryKey(previousSummary);
  const nextGitHubKey = getGitHubRepositoryKey(state.summary);
  let next = previousGitHubKey === nextGitHubKey ? state : resetGitHubState(state);

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
    commitFileDiffError: ""
  };
}

function isGitHubView(view: WorkspaceView): boolean {
  return view === "workflows" || view === "pullRequests" || view === "issues";
}

function getGitHubRepositoryKey(summary: RepoSummary | null): string {
  return summary?.githubRepository?.fullName.toLocaleLowerCase() ?? "";
}

function groupRemoteBranchesByRemote(remoteBranches: GitRemoteBranch[]): Array<{
  remote: string;
  branches: GitRemoteBranch[];
}> {
  const branchesByRemote = new Map<string, GitRemoteBranch[]>();

  for (const remoteBranch of remoteBranches) {
    const branches = branchesByRemote.get(remoteBranch.remote) ?? [];
    branches.push(remoteBranch);
    branchesByRemote.set(remoteBranch.remote, branches);
  }

  return [...branchesByRemote.entries()]
    .map(([remote, branches]) => ({
      remote,
      branches
    }))
    .sort((left, right) => left.remote.localeCompare(right.remote));
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

function getStagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isStaged);
}

function getUnstagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isUnstaged);
}

function getFilesForSide(summary: RepoSummary | null, side: GitDiffSide): GitStatusFile[] {
  return side === "staged" ? getStagedFiles(summary) : getUnstagedFiles(summary);
}

function getSelectedFileForDiff(summary: RepoSummary | null, selection: FileSelection): GitStatusFile | null {
  return getFilesForSide(summary, selection.side).find((file) => file.path === selection.path) ?? null;
}

function buildFileSelection(
  current: FileSelection | null,
  files: GitStatusFile[],
  path: string,
  side: GitDiffSide,
  modifiers: FileSelectionModifiers
): FileSelection | null {
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

function formatFileStatus(file: GitStatusFile, side: GitDiffSide): string {
  if (file.isConflicted) {
    return "UU";
  }

  return side === "staged" ? file.indexStatus : file.worktreeStatus === "?" ? "?" : file.worktreeStatus;
}

function canCommit(state: AppState): boolean {
  return hasStagedChanges(state.summary) && state.commitMessage.trim().length > 0;
}

function canGenerateCommitMessage(state: AppState): boolean {
  return hasStagedChanges(state.summary) && hasCompleteAiSettings(state.aiSettings);
}

function hasCompleteAiSettings(aiSettings: AiSettings | null): boolean {
  return Boolean(aiSettings?.hasApiKey && aiSettings.model.trim());
}

function getGenerateMessageTitle(state: AppState): string {
  if (!hasStagedChanges(state.summary)) {
    return "Stage changes before generating a commit message.";
  }

  if (!hasCompleteAiSettings(state.aiSettings)) {
    return "Configure OpenRouter settings before generating a commit message.";
  }

  return "Generate a commit message from staged changes.";
}

function isOperationRunning(state: AppState): boolean {
  return Boolean(state.runningAction || state.runningOperation || state.cloneRunning || state.cloneCheckRunning);
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

function getRepoHealth(state: AppState): { text: string; state: "good" | "bad" | "neutral" } {
  if (state.repoLoading || !state.summary) {
    return {
      text: "Checking repository...",
      state: "neutral"
    };
  }

  if (state.summary.isValid) {
    return {
      text: "Repository ready",
      state: "good"
    };
  }

  return {
    text: state.summary.validationErrors.join(" "),
    state: "bad"
  };
}

function isSameRepoPath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}

function getRepoPathKey(repoPath: string): string {
  return repoPath.trim().replace(/[\\/]+$/, "").toLocaleLowerCase();
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

  if (state.lastResult) {
    return formatResultHeading(state.lastResult);
  }

  return "Ready";
}

function formatResultHeading(result: GitRunResult): string {
  const label = capitalize(result.action);
  return result.exitCode === 0 ? `${label} complete` : `${label} failed`;
}

function formatOperationLog(label: string, result: GitOperationResult): string {
  const chunks = [
    `> ${label}\n`
  ];

  if (result.stdout.trim().length > 0) {
    chunks.push(formatStreamOutput("stdout", result.stdout));
  }

  if (result.stderr.trim().length > 0) {
    chunks.push(formatStreamOutput("stderr", result.stderr));
  }

  chunks.push(`${label} exited with code ${result.exitCode}.\n\n`);
  return chunks.join("");
}

function getOperationFailureMessage(result: GitOperationResult | null, fallback: string): string {
  return result?.stderr.trim() || result?.stdout.trim() || fallback;
}

function getRepositoryAccessCheckFailureMessage(result: GitRepositoryAccessCheckResult): string {
  return result.stderr.trim() || result.stdout.trim() || "Unable to check repository access.";
}

function formatStreamOutput(stream: "stdout" | "stderr", text: string): string {
  return `[${stream}] ${text.endsWith("\n") ? text : `${text}\n`}`;
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatWorkflowRunStatus(run: GitHubWorkflowRun): string {
  return run.conclusion ?? run.status;
}

function getWorkflowRunStatusClass(run: GitHubWorkflowRun): string {
  const status = formatWorkflowRunStatus(run).toLowerCase();
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

function formatShortHash(hash: string): string {
  return hash ? hash.slice(0, 7) : "-";
}

function shouldHighlightDiffRow(kind: DiffRowKind): boolean {
  return kind === "context" || kind === "add" || kind === "delete";
}

function isDeletedOnSide(file: GitStatusFile, side: GitDiffSide): boolean {
  return side === "staged" ? file.indexStatus === "D" : file.worktreeStatus === "D";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
