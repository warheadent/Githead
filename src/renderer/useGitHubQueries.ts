import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { GitHubIssue, GitHubOpenCounts, GitHubPullRequest, GitHubWorkflowRun } from "../shared/types";
import { createGitHubQueryStore, type GitHubQueryDescriptor, type GitHubQueryParams, type GitHubQuerySnapshot, type GitHubRepositoryScope, type GitHubResource } from "./githubQueryStore";

type ResourceData = {
  workflowRuns: GitHubWorkflowRun[];
  openCounts: GitHubOpenCounts;
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
};
const fallbackErrors: Record<GitHubResource, string> = {
  workflowRuns: "Unable to load workflow runs.", openCounts: "Unable to load GitHub counts.",
  pullRequests: "Unable to load pull requests.", issues: "Unable to load issues."
};
async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; error: { kind: string; message: string } }>, fallback: string): Promise<T> {
  const result = await promise;
  if (result.ok) return result.data;
  throw new Error(result.error.kind === "cancelled" ? "" : result.error.message || fallback);
}

export const gitHubQueryStore = createGitHubQueryStore({
  loaders: {
    workflowRuns: (descriptor, requestId) => unwrap(window.githead.getGitHubWorkflowRuns({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.workflowRuns),
    openCounts: (descriptor, requestId) => unwrap(window.githead.getGitHubOpenCounts({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.openCounts),
    pullRequests: (descriptor, requestId) => unwrap(window.githead.getGitHubPullRequests({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.pullRequests),
    issues: (descriptor, requestId) => unwrap(window.githead.getGitHubIssues({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.issues)
  }
});

const EMPTY: GitHubQuerySnapshot<never> = Object.freeze({ status: "idle", data: undefined, error: "", updatedAt: null, isStale: true });
function descriptor(repository: GitHubRepositoryScope | null, resource: GitHubResource, params: GitHubQueryParams = {}): GitHubQueryDescriptor | null {
  return repository ? { repository, resource, params } : null;
}
function useSnapshot<T>(value: GitHubQueryDescriptor | null): GitHubQuerySnapshot<T> {
  const subscribe = useCallback((listener: () => void) => value ? gitHubQueryStore.subscribe(value, listener) : () => undefined, [value]);
  const getSnapshot = useCallback(() => value ? gitHubQueryStore.getSnapshot<T>(value) : EMPTY, [value]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useGitHubQueries(repository: GitHubRepositoryScope | null) {
  const stableRepository = useMemo(() => repository ? { repoPath: repository.repoPath, githubFullName: repository.githubFullName } : null,
    [repository?.repoPath, repository?.githubFullName]);
  const descriptors = useMemo(() => ({
    workflowRuns: descriptor(stableRepository, "workflowRuns"), openCounts: descriptor(stableRepository, "openCounts"),
    pullRequests: descriptor(stableRepository, "pullRequests"), issues: descriptor(stableRepository, "issues")
  }), [stableRepository]);
  const workflows = useSnapshot<ResourceData["workflowRuns"]>(descriptors.workflowRuns);
  const counts = useSnapshot<ResourceData["openCounts"]>(descriptors.openCounts);
  const pullRequests = useSnapshot<ResourceData["pullRequests"]>(descriptors.pullRequests);
  const issues = useSnapshot<ResourceData["issues"]>(descriptors.issues);
  const ensure = useCallback(<R extends GitHubResource>(resource: R, params: GitHubQueryParams = {}) => {
    if (!stableRepository) return Promise.resolve(undefined);
    return gitHubQueryStore.ensure<ResourceData[R]>({ repository: stableRepository, resource, params });
  }, [stableRepository]);
  const refresh = useCallback(<R extends GitHubResource>(resource: R, params: GitHubQueryParams = {}) => {
    if (!stableRepository) return Promise.resolve(undefined);
    return gitHubQueryStore.refresh<ResourceData[R]>({ repository: stableRepository, resource, params });
  }, [stableRepository]);
  const invalidate = useCallback((resource?: GitHubResource, params?: GitHubQueryParams) => {
    if (stableRepository) gitHubQueryStore.invalidate({ repository: stableRepository, ...(resource ? { resource } : {}), ...(params ? { params } : {}) });
  }, [stableRepository]);
  return { workflows, counts, pullRequests, issues, ensure, refresh, invalidate };
}
