import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitHubHistoryInsights, GitHubPullRequestAssociation } from "../shared/types";
import { forkEffect, tryPromise } from "../shared/effectRuntime";

interface GitHubHistoryScope {
  repoPath: string;
  githubFullName: string;
  currentBranch: string | null;
  headSha: string | null;
  commitShas: string[];
  enabled: boolean;
}

const EMPTY_INSIGHTS: GitHubHistoryInsights = { currentBranchPullRequests: [], commits: [], unavailableCommitShas: [] };
const NO_PULL_REQUESTS: GitHubPullRequestAssociation[] = [];

/**
 * Prefix of the effect key for results that hold the current branch's pull requests. A branch keeps
 * its pull requests across new commits; a detached HEAD only matches the same commit.
 */
function branchPullRequestKeyPrefix(scope: GitHubHistoryScope): string | null {
  if (!scope.repoPath || !scope.githubFullName) return null;
  if (scope.currentBranch) return `${scope.repoPath}\0${scope.githubFullName}\0${scope.currentBranch}\0`;
  return scope.headSha ? `${scope.repoPath}\0${scope.githubFullName}\0\0${scope.headSha}\0` : null;
}

export function useGitHubHistoryInsights(scope: GitHubHistoryScope) {
  const shasKey = useMemo(() => [...new Set(scope.commitShas)].sort().join(","), [scope.commitShas]);
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<{ data: GitHubHistoryInsights; loading: boolean; loaded: boolean; error: string; key: string }>({
    data: EMPTY_INSIGHTS, loading: false, loaded: false, error: "", key: ""
  });
  const requestGeneration = useRef(0);
  const retry = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!scope.enabled || !scope.repoPath || !scope.githubFullName || !shasKey) return;
    const key = `${scope.repoPath}\0${scope.githubFullName}\0${scope.currentBranch ?? ""}\0${scope.headSha ?? ""}\0${shasKey}`;
    const currentGeneration = ++requestGeneration.current;
    const requestId = `history-insights:${currentGeneration}:${Date.now()}`;
    setState((current) => ({
      data: current.key === key ? current.data : EMPTY_INSIGHTS,
      loading: true, loaded: current.key === key && current.loaded, error: "", key
    }));
    if (typeof window.githead.getGitHubHistoryInsights !== "function") return;
    const program = tryPromise(() => window.githead.getGitHubHistoryInsights({
      repoPath: scope.repoPath, requestId, currentBranch: scope.currentBranch,
      headSha: scope.headSha, commitShas: shasKey.split(",")
    })).pipe(Effect.onInterrupt(() =>
      typeof window.githead.cancelGitHubRequest === "function"
        ? Effect.promise(() => window.githead.cancelGitHubRequest({ requestId }).catch(() => undefined))
        : Effect.succeed(undefined)
    ));
    const running = forkEffect(program);
    void running.promise.then((result) => {
      if (requestGeneration.current !== currentGeneration) return;
      if (result.ok) setState({ data: result.data, loading: false, loaded: true, error: "", key });
      else if (result.error.kind !== "cancelled") setState({ data: EMPTY_INSIGHTS, loading: false, loaded: false, error: result.error.message, key });
    }).catch((error: unknown) => {
      if (requestGeneration.current === currentGeneration) {
        setState({ data: EMPTY_INSIGHTS, loading: false, loaded: false, error: error instanceof Error ? error.message : "GitHub history enrichment is unavailable.", key });
      }
    });
    return () => {
      requestGeneration.current += 1;
      running.interrupt();
    };
  }, [generation, scope.currentBranch, scope.enabled, scope.githubFullName, scope.headSha, scope.repoPath, shasKey]);

  // Insights refresh only while History is open, so the last result can belong to another
  // repository or branch. Branch pull requests are exposed only for the current scope.
  const branchKeyPrefix = branchPullRequestKeyPrefix(scope);
  const branchPullRequestsLoaded = state.loaded && branchKeyPrefix !== null && state.key.startsWith(branchKeyPrefix);
  const currentBranchPullRequests = branchPullRequestsLoaded ? state.data.currentBranchPullRequests : NO_PULL_REQUESTS;

  return { ...state, retry, currentBranchPullRequests, branchPullRequestsLoaded };
}
