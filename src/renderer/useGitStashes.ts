import { useCallback, useEffect, useRef, useState } from "react";
import type { GitFileDiff, GitStashDetails, GitStashEntry } from "../shared/types";

export interface GitStashWorkspaceState {
  entries: GitStashEntry[];
  loading: boolean;
  error: string;
  selectedRef: string | null;
  details: GitStashDetails | null;
  detailsLoading: boolean;
  detailsError: string;
  selectedFilePath: string | null;
  diff: GitFileDiff | null;
  diffLoading: boolean;
  diffError: string;
}

const initialState: GitStashWorkspaceState = {
  entries: [],
  loading: false,
  error: "",
  selectedRef: null,
  details: null,
  detailsLoading: false,
  detailsError: "",
  selectedFilePath: null,
  diff: null,
  diffLoading: false,
  diffError: ""
};

export function useGitStashes(repoPath: string, enabled: boolean, active: boolean) {
  const [state, setState] = useState<GitStashWorkspaceState>(initialState);
  const repoPathRef = useRef(repoPath);
  const requestIds = useRef({ list: 0, details: 0, diff: 0 });

  useEffect(() => {
    repoPathRef.current = repoPath;
    requestIds.current.list += 1;
    requestIds.current.details += 1;
    requestIds.current.diff += 1;
    setState(initialState);
  }, [repoPath, enabled]);

  const loadDiff = useCallback(async (stashRef: string, path: string): Promise<void> => {
    if (!enabled || !repoPath || !stashRef || !path) return;
    const requestId = ++requestIds.current.diff;
    setState((current) => ({ ...current, selectedFilePath: path, diff: null, diffLoading: true, diffError: "" }));
    try {
      const diff = await window.githead.getStashFileDiff({ repoPath, stashRef, path, requestId: `stash-diff:${requestId}` });
      if (requestId !== requestIds.current.diff || repoPathRef.current !== repoPath) return;
      setState((current) => ({ ...current, diff, diffLoading: false, diffError: diff.kind === "error" ? diff.text : "" }));
    } catch (error) {
      if (requestId !== requestIds.current.diff || repoPathRef.current !== repoPath) return;
      setState((current) => ({
        ...current,
        diff: null,
        diffLoading: false,
        diffError: error instanceof Error ? error.message : "Unable to read the stash diff."
      }));
    }
  }, [enabled, repoPath]);

  const select = useCallback(async (stashRef: string): Promise<void> => {
    if (!enabled || !repoPath || !stashRef) return;
    const requestId = ++requestIds.current.details;
    requestIds.current.diff += 1;
    setState((current) => ({
      ...current,
      selectedRef: stashRef,
      details: null,
      detailsLoading: true,
      detailsError: "",
      selectedFilePath: null,
      diff: null,
      diffLoading: false,
      diffError: ""
    }));
    try {
      const details = await window.githead.getStashDetails({ repoPath, stashRef, requestId: `stash-details:${requestId}` });
      if (requestId !== requestIds.current.details || repoPathRef.current !== repoPath) return;
      const firstPath = details.files[0]?.path ?? null;
      setState((current) => ({ ...current, details, detailsLoading: false, selectedFilePath: firstPath }));
      if (firstPath) void loadDiff(stashRef, firstPath);
    } catch (error) {
      if (requestId !== requestIds.current.details || repoPathRef.current !== repoPath) return;
      setState((current) => ({
        ...current,
        details: null,
        detailsLoading: false,
        detailsError: error instanceof Error ? error.message : "Unable to read stash details."
      }));
    }
  }, [enabled, loadDiff, repoPath]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !repoPath) {
      setState(initialState);
      return;
    }
    const requestId = ++requestIds.current.list;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const entries = await window.githead.getStashes({ repoPath, requestId: `stash-list:${requestId}` });
      if (requestId !== requestIds.current.list || repoPathRef.current !== repoPath) return;
      setState((current) => {
        const selectedRef = current.selectedRef && entries.some((entry) => entry.ref === current.selectedRef)
          ? current.selectedRef
          : active ? entries[0]?.ref ?? null : null;
        return {
          ...current,
          entries,
          loading: false,
          selectedRef,
          ...(selectedRef === current.selectedRef ? {} : {
            details: null,
            detailsLoading: false,
            detailsError: "",
            selectedFilePath: null,
            diff: null,
            diffLoading: false,
            diffError: ""
          })
        };
      });
    } catch (error) {
      if (requestId !== requestIds.current.list || repoPathRef.current !== repoPath) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to read stashes."
      }));
    }
  }, [active, enabled, repoPath]);

  useEffect(() => {
    if (enabled && repoPath) void refresh();
  }, [enabled, refresh, repoPath]);

  useEffect(() => {
    if (!active || state.loading || state.entries.length === 0) return;
    const selectedRef = state.selectedRef && state.entries.some((entry) => entry.ref === state.selectedRef)
      ? state.selectedRef
      : state.entries[0]!.ref;
    if (state.details?.stash.ref !== selectedRef && !state.detailsLoading) void select(selectedRef);
  }, [active, select, state.details?.stash.ref, state.detailsLoading, state.entries, state.loading, state.selectedRef]);

  const selectFile = useCallback((path: string): void => {
    const stashRef = state.selectedRef;
    if (stashRef) void loadDiff(stashRef, path);
  }, [loadDiff, state.selectedRef]);

  return { state, refresh, select, selectFile };
}
