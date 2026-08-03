import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitHubHistoryInsights } from "../shared/types";
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

  return { ...state, retry };
}
