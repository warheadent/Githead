import {
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clipboard,
  Download,
  Eraser,
  ExternalLink,
  FileCode2,
  FolderOpen,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  History,
  ListTree,
  Loader2,
  MapPinned,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiSettings,
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
  GitOperationResult,
  GitOutputEvent,
  GitRunResult,
  GitStatusFile,
  RepoSummary
} from "../shared/types";
import { parseCommitSubject } from "../shared/commitSubject";
import { canPush, getPrimaryCommitAction, getPullableCommitCount, getPushableCommitCount, hasStagedChanges } from "./commitActions";
import { buildCommitGraphLayout, type CommitGraphLayout } from "./commitGraph";
import { groupDiffRowsByHunk, parseUnifiedDiff, type DiffRow, type DiffRowKind } from "./diffParser";
import { highlightDiffCode } from "./syntaxHighlighter";

const DEFAULT_REPO_PATH = "D:\\Githead";
const HISTORY_LIMIT = 200;

type WorkspaceView = "status" | "history" | "workflows" | "pullRequests" | "issues" | "activity";

interface FileSelection {
  path: string;
  side: GitDiffSide;
}

interface SettingsDraft {
  apiKey: string;
  model: string;
  siteUrl: string;
  siteTitle: string;
}

interface AppState {
  repoPath: string;
  repoRecents: string[];
  repoLoading: boolean;
  summary: RepoSummary | null;
  branchDialogOpen: boolean;
  branchNameDraft: string;
  branchError: string;
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

const initialState: AppState = {
  repoPath: DEFAULT_REPO_PATH,
  repoRecents: [],
  repoLoading: false,
  summary: null,
  branchDialogOpen: false,
  branchNameDraft: "",
  branchError: "",
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
  logText: ""
};

export function App(): ReactNode {
  useSystemThemeClass();

  const [state, setState] = useState<AppState>(initialState);
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

  const refreshRepo = useCallback(async (options: { addToRecents?: boolean } = {}): Promise<void> => {
    const requestId = requestIds.current.repo + 1;
    requestIds.current.repo = requestId;
    const repoPath = stateRef.current.repoPath;

    updateState({
      repoLoading: true
    });

    try {
      const summary = await window.githead.getRepoSummary(repoPath);
      if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        return;
      }

      updateState((current) => reconcileGitHubState(reconcileSelection({
        ...current,
        summary
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
          selection: null,
          diff: null
        }));
      }
    } finally {
      if (requestId === requestIds.current.repo && isSameRepoPath(repoPath, stateRef.current.repoPath)) {
        updateState({
          repoLoading: false
        });
      }
    }

    if (requestId !== requestIds.current.repo || !isSameRepoPath(repoPath, stateRef.current.repoPath)) {
      return;
    }

    const latest = stateRef.current;
    if (latest.selection) {
      await loadSelectedDiff(latest.selection);
    }
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
  }, [loadCommitHistory, loadIssues, loadPullRequests, loadSelectedDiff, loadWorkflowRuns, updateState]);

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
      summary: null,
      branchDialogOpen: false,
      branchNameDraft: "",
      branchError: "",
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
      repoPath: repoRecents[0] ?? DEFAULT_REPO_PATH,
      repoRecents
    }));

    await refreshRepo({
      addToRecents: true
    });
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

  const chooseRepo = useCallback(async (): Promise<void> => {
    const repoPath = await window.githead.chooseRepo(stateRef.current.repoPath);
    if (!repoPath) {
      return;
    }

    await switchRepo(repoPath, {
      addToRecents: true
    });
  }, [switchRepo]);

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

  const runAction = useCallback(async (action: GitAction): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current)) {
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
  }, [appendSystemLine, refreshRepo, updateState]);

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

  const switchBranch = useCallback(async (branchName: string): Promise<void> => {
    const current = stateRef.current;
    const nextBranchName = branchName.trim();

    if (!current.summary?.isValid || isOperationRunning(current) || !nextBranchName || nextBranchName === current.summary.branch) {
      return;
    }

    await runRepoOperation(`Switching branch to ${nextBranchName}`, null, () =>
      window.githead.switchBranch({
        repoPath: stateRef.current.repoPath,
        branchName: nextBranchName
      })
    );
  }, [runRepoOperation]);

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
  }, [runRepoOperation, updateState]);

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

  const commitChanges = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.summary?.isValid || isOperationRunning(current) || !canCommit(current)) {
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
  }, [runRepoOperation, updateState]);

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
  }, [loadCommitHistory, loadIssues, loadPullRequests, loadWorkflowRuns, updateState]);

  const selectFile = useCallback((file: GitStatusFile, side: GitDiffSide): void => {
    const selection = {
      path: file.path,
      side
    };
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

  const runContextFileOperation = useCallback(async (
    file: GitStatusFile,
    side: GitDiffSide,
    kind: "open" | "show" | "copy" | "toggle-stage" | "delete" | "revert" | "ignore"
  ): Promise<void> => {
    if (kind === "toggle-stage") {
      if (side === "unstaged") {
        await stageFiles([file.path], {
          path: file.path,
          side: "staged"
        });
      } else {
        await unstageFiles([file.path], {
          path: file.path,
          side: "unstaged"
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
      await runRepoOperation("Deleting file", null, () =>
        window.githead.deleteFile({
          repoPath,
          path: file.path
        })
      );
      return;
    }
    if (kind === "revert") {
      await runRepoOperation("Reverting changes", null, () =>
        window.githead.revertFileChanges({
          repoPath,
          path: file.path,
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

  const stagedFiles = useMemo(() => getStagedFiles(state.summary), [state.summary]);
  const unstagedFiles = useMemo(() => getUnstagedFiles(state.summary), [state.summary]);
  const running = isOperationRunning(state);
  const isValid = state.summary?.isValid ?? false;
  const disableActions = running || !isValid;
  const primaryCommitAction = getPrimaryCommitAction(state.summary);
  const actionHeading = getActionHeading(state);
  const repoHealth = getRepoHealth(state);
  const showGitHubTabs = Boolean(state.summary?.githubRepository);

  return (
    <main className="app-shell bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0">
        <ResizablePanel defaultSize="27%" minSize="292px" maxSize="460px" className="min-w-[292px]">
          <RepositoryPanel
            repoPath={state.repoPath}
            repoRecents={state.repoRecents}
            repoHealth={repoHealth}
            summary={state.summary}
            running={running}
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
            onOpenSettings={openSettingsDialog}
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
                  onSelectCommit={selectCommit}
                  onSelectCommitFile={selectCommitFile}
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
    </main>
  );
}

function RepositoryPanel({
  repoPath,
  repoRecents,
  repoHealth,
  summary,
  running,
  onChooseRepo,
  onRefreshRepo,
  onSelectRecent,
  onRemoveRecent,
  onSwitchBranch,
  onOpenBranchDialog,
  onOpenSettings
}: {
  repoPath: string;
  repoRecents: string[];
  repoHealth: { text: string; state: "good" | "bad" | "neutral" };
  summary: RepoSummary | null;
  running: boolean;
  onChooseRepo: () => void;
  onRefreshRepo: () => void;
  onSelectRecent: (repoPath: string) => void;
  onRemoveRecent: (repoPath: string) => void;
  onSwitchBranch: (branchName: string) => void;
  onOpenBranchDialog: () => void;
  onOpenSettings: () => void;
}): ReactNode {
  const remotes = summary?.remotes.length
    ? [...new Set(summary.remotes.map((remote) => remote.name))].join(", ")
    : "-";

  return (
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-auto border-r bg-sidebar p-6 text-sidebar-foreground">
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3.5">
        <div className="grid size-11 place-items-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">
          G
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Githead</h1>
          <p className={repoHealth.state === "good" ? "status-text good" : repoHealth.state === "bad" ? "status-text bad" : "status-text"}>
            {repoHealth.text}
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="repo-path">Repository</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input id="repo-path" value={repoPath} readOnly />
          <Button type="button" variant="outline" onClick={onChooseRepo} disabled={running}>
            <FolderOpen />
            Browse
          </Button>
        </div>
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
        <Fact label="Upstream" value={summary?.upstream ?? "-"} />
        <Fact label="Remotes" value={remotes} />
      </dl>

      <div className="mt-auto grid gap-2">
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

function Fact({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
  onContextAction
}: {
  stagedFiles: GitStatusFile[];
  unstagedFiles: GitStatusFile[];
  summary: RepoSummary | null;
  selection: FileSelection | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  disabled: boolean;
  onSelectFile: (file: GitStatusFile, side: GitDiffSide) => void;
  onStageFiles: (paths: string[], selection?: FileSelection) => void;
  onUnstageFiles: (paths: string[], selection?: FileSelection) => void;
  onRefreshDiff: () => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
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
                  disabled={disabled || selection?.side !== "staged"}
                  onClick={() => {
                    if (selection?.side === "staged") {
                      onUnstageFiles([selection.path], {
                        path: selection.path,
                        side: "unstaged"
                      });
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
                  disabled={disabled || selection?.side !== "unstaged"}
                  onClick={() => {
                    if (selection?.side === "unstaged") {
                      onStageFiles([selection.path], {
                        path: selection.path,
                        side: "staged"
                      });
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
  onSelectFile: (file: GitStatusFile, side: GitDiffSide) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
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
              selected={selection?.path === file.path && selection.side === side}
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
  onSelectFile: (file: GitStatusFile, side: GitDiffSide) => void;
  onContextAction: (file: GitStatusFile, side: GitDiffSide, kind: ContextActionKind) => void;
}): ReactNode {
  const actionLabel = side === "unstaged" ? "Stage" : "Unstage";
  const deleted = isDeletedOnSide(file, side);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={() => onSelectFile(file, side)}>
        <button
          type="button"
          className={`file-row ${selected ? "is-selected" : ""}`}
          data-path={file.path}
          role="option"
          aria-selected={selected}
          onClick={() => onSelectFile(file, side)}
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
  action
}: {
  title: string;
  eyebrow: string;
  diff: GitFileDiff | null;
  filePath: string;
  loading: boolean;
  emptyMessage: string;
  action?: ReactNode;
}): ReactNode {
  let content: ReactNode = emptyMessage;
  let outputClass = "diff-output";

  if (loading) {
    content = "Loading diff...";
  } else if (diff) {
    outputClass = `diff-output ${diff.kind}`;
    content = diff.kind === "text"
      ? <DiffRows filePath={filePath} text={diff.text} truncated={Boolean(diff.truncated)} />
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

function DiffRows({ filePath, text, truncated }: { filePath: string; text: string; truncated: boolean }): ReactNode {
  const groups = useMemo(() => {
    const rows = parseUnifiedDiff(text, truncated ? ["Diff truncated."] : []);
    return groupDiffRowsByHunk(rows);
  }, [text, truncated]);

  return groups.map((group, groupIndex) => {
    const groupKey = `${groupIndex}:${group.kind}:${group.rows[0]?.text ?? ""}`;
    const rowViews = group.rows.map((row, rowIndex) => (
      <DiffRowView key={`${rowIndex}:${row.kind}:${row.oldLine ?? ""}:${row.newLine ?? ""}`} row={row} filePath={filePath} />
    ));

    if (group.kind === "hunk") {
      return (
        <div className="diff-hunk-block" key={groupKey}>
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
  onSelectCommit,
  onSelectCommitFile
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
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
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
              onSelectCommit={onSelectCommit}
              onSelectCommitFile={onSelectCommitFile}
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
  onSelectCommit
}: {
  commit: GitCommitGraphRow;
  selected: boolean;
  onSelectCommit: (hash: string) => void;
}): ReactNode {
  return (
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
  onSelectCommit,
  onSelectCommitFile
}: {
  details: GitCommitDetails | null;
  loading: boolean;
  error: string;
  selectedFilePath: string | null;
  onSelectCommit: (hash: string) => void;
  onSelectCommitFile: (filePath: string) => void;
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
          onSelectCommitFile={onSelectCommitFile}
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
  onSelectCommitFile
}: {
  file: GitCommitChangedFile;
  selected: boolean;
  onSelectCommitFile: (filePath: string) => void;
}): ReactNode {
  return (
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
    githubRepository: null,
    statusLines: [],
    files: [],
    validationErrors: [
      message
    ]
  };
}

function reconcileSelection(state: AppState): AppState {
  if (!state.selection || !state.summary?.isValid) {
    return state;
  }

  const files = getFilesForSide(state.summary, state.selection.side);
  if (files.some((file) => file.path === state.selection?.path)) {
    return state;
  }

  return {
    ...state,
    selection: null,
    diff: null
  };
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

function getStagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isStaged);
}

function getUnstagedFiles(summary: RepoSummary | null): GitStatusFile[] {
  return getSortedFiles(summary, (file) => file.isUnstaged);
}

function getFilesForSide(summary: RepoSummary | null, side: GitDiffSide): GitStatusFile[] {
  return side === "staged" ? getStagedFiles(summary) : getUnstagedFiles(summary);
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
  return Boolean(state.runningAction || state.runningOperation);
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
