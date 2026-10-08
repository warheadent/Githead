import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GitHubFailure,
  GitHubWorkflowAnalytics,
  GitHubWorkflowAnalyticsRange,
  RepositoryAnalytics,
  RepositoryAnalyticsProgress
} from "../shared/types";
import { getRepoPathKey } from "./repositorySnapshotCache";

export interface RepositoryAnalyticsState {
  data: RepositoryAnalytics | null;
  loading: boolean;
  error: string;
  progress: RepositoryAnalyticsProgress | null;
}

const initialAnalyticsState: RepositoryAnalyticsState = { data: null, loading: false, error: "", progress: null };
/** Ref updates arrive in bursts during fetch and pull; wait for them to settle. */
const STALE_RELOAD_DELAY_MS = 750;

function isSamePath(a: string, b: string): boolean {
  return getRepoPathKey(a) === getRepoPathKey(b);
}

/**
 * Loads repository analytics while the view is active. Results stay on screen
 * while a refresh runs. Commits, branch changes, and fetches mark the data
 * stale; working tree edits do not affect analytics.
 */
export function useRepositoryAnalytics(repoPath: string, enabled: boolean, active: boolean, excludePaths: boolean) {
  const [state, setState] = useState<RepositoryAnalyticsState>(initialAnalyticsState);
  const [stale, setStale] = useState(false);
  const requestRef = useRef<{ id: string; repoPath: string } | null>(null);
  const counter = useRef(0);

  const cancel = useCallback(() => {
    const current = requestRef.current;
    requestRef.current = null;
    if (current) void window.githead.cancelRepositoryRead({ requestId: current.id });
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled || !repoPath) return;
    cancel();
    counter.current += 1;
    const request = { id: `analytics:${counter.current}`, repoPath };
    requestRef.current = request;
    setStale(false);
    setState((current) => ({ ...current, loading: true, error: "", progress: null }));
    try {
      const data = await window.githead.getRepositoryAnalytics({ repoPath, excludePaths, requestId: request.id });
      if (requestRef.current !== request) return;
      requestRef.current = null;
      setState({ data, loading: false, error: "", progress: null });
    } catch (error) {
      if (requestRef.current !== request) return;
      requestRef.current = null;
      setState((current) => ({ ...current, loading: false, progress: null, error: error instanceof Error ? error.message : "Unable to analyze the repository." }));
    }
  }, [cancel, enabled, excludePaths, repoPath]);

  useEffect(() => {
    setState(initialAnalyticsState);
    setStale(false);
    return cancel;
  }, [cancel, repoPath]);

  useEffect(() => window.githead.onRepositoryAnalyticsProgress((progress) => {
    if (requestRef.current?.id !== progress.requestId) return;
    setState((current) => ({ ...current, progress }));
  }), []);

  useEffect(() => window.githead.onRepoChanged((event) => {
    if (event.reason !== "filesystem" && isSamePath(event.repoPath, repoPath)) setStale(true);
  }), [repoPath]);

  const needsLoad = enabled && active && !state.loading && !state.error
    && (state.data === null || state.data.excludePaths !== excludePaths || !isSamePath(state.data.repoPath, repoPath));
  useEffect(() => {
    if (needsLoad) void load();
  }, [load, needsLoad]);

  useEffect(() => {
    if (!stale || !active || !enabled || state.loading || state.data === null) return;
    const timer = window.setTimeout(() => { void load(); }, STALE_RELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, enabled, load, stale, state.data, state.loading]);

  return { ...state, refresh: load };
}

export interface WorkflowAnalyticsState {
  data: GitHubWorkflowAnalytics | null;
  range: GitHubWorkflowAnalyticsRange | null;
  loading: boolean;
  failure: GitHubFailure | null;
  loadedAt: number;
}

const initialWorkflowState: WorkflowAnalyticsState = { data: null, range: null, loading: false, failure: null, loadedAt: 0 };
/** CI data is remote and rate limited, so reopening the section reuses recent results. */
const WORKFLOW_ANALYTICS_MAX_AGE_MS = 5 * 60_000;

export function useGitHubWorkflowAnalytics(repoPath: string, enabled: boolean, active: boolean, range: GitHubWorkflowAnalyticsRange) {
  const [state, setState] = useState<WorkflowAnalyticsState>(initialWorkflowState);
  const requestRef = useRef<string | null>(null);
  const counter = useRef(0);

  const cancel = useCallback(() => {
    const current = requestRef.current;
    requestRef.current = null;
    if (current) void window.githead.cancelGitHubRequest({ requestId: current });
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled || !repoPath) return;
    cancel();
    counter.current += 1;
    const requestId = `workflow-analytics:${counter.current}`;
    requestRef.current = requestId;
    setState((current) => ({ ...current, loading: true, failure: null }));
    try {
      const result = await window.githead.getGitHubWorkflowAnalytics({ repoPath, range, requestId });
      if (requestRef.current !== requestId) return;
      requestRef.current = null;
      setState((current) => result.ok
        ? { data: result.data, range, loading: false, failure: null, loadedAt: Date.now() }
        : { ...current, range, loading: false, failure: result.error, loadedAt: Date.now() });
    } catch (error) {
      if (requestRef.current !== requestId) return;
      requestRef.current = null;
      setState((current) => ({
        ...current,
        range,
        loading: false,
        loadedAt: Date.now(),
        failure: { kind: "unexpected", message: error instanceof Error ? error.message : "Unable to load workflow runs.", retryable: true, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null }
      }));
    }
  }, [cancel, enabled, range, repoPath]);

  useEffect(() => {
    setState(initialWorkflowState);
    return cancel;
  }, [cancel, repoPath]);

  const needsLoad = enabled && active && !state.loading
    && (state.range !== range || (state.failure === null && Date.now() - state.loadedAt > WORKFLOW_ANALYTICS_MAX_AGE_MS));
  useEffect(() => {
    if (needsLoad) void load();
  }, [load, needsLoad]);

  return { ...state, refresh: load };
}
