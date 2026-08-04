import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GitHubIssue, GitHubIssueQuery, GitHubOpenCounts, GitHubPage, GitHubPullRequest, GitHubPullRequestQuery, GitHubViewer, GitHubWorkflowRun, GitHubWorkflowRunQuery } from "../shared/types";
import { createGitHubQueryStore, type GitHubQueryDescriptor, type GitHubQueryParams, type GitHubQuerySnapshot, type GitHubRepositoryScope, type GitHubResource } from "./githubQueryStore";

type ResourceData = {
  workflowRuns: GitHubPage<GitHubWorkflowRun>;
  openCounts: GitHubOpenCounts;
  pullRequests: GitHubPage<GitHubPullRequest>;
  issues: GitHubPage<GitHubIssue>;
  viewer: GitHubViewer;
};
const fallbackErrors: Record<GitHubResource, string> = {
  workflowRuns: "Unable to load workflow runs.", openCounts: "Unable to load GitHub counts.",
  pullRequests: "Unable to load pull requests.", issues: "Unable to load issues.", viewer: "Unable to identify the GitHub viewer."
};
async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; error: { kind: string; message: string } }>, fallback: string): Promise<T> {
  const result = await promise;
  if (result.ok) return result.data;
  throw new Error(result.error.kind === "cancelled" ? "" : result.error.message || fallback);
}

export const gitHubQueryStore = createGitHubQueryStore({
  cancel: (requestId) => window.githead.cancelGitHubRequest({ requestId }),
  loaders: {
    workflowRuns: (descriptor, requestId) => unwrap(window.githead.getGitHubWorkflowRuns({ repoPath: descriptor.repository.repoPath, requestId, page: Number(descriptor.params.page ?? 1), query: descriptor.params.query as GitHubWorkflowRunQuery | undefined }), fallbackErrors.workflowRuns),
    openCounts: (descriptor, requestId) => unwrap(window.githead.getGitHubOpenCounts({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.openCounts),
    pullRequests: (descriptor, requestId) => unwrap(window.githead.getGitHubPullRequests({ repoPath: descriptor.repository.repoPath, requestId, page: Number(descriptor.params.page ?? 1), query: descriptor.params.query as GitHubPullRequestQuery | undefined }), fallbackErrors.pullRequests),
    issues: (descriptor, requestId) => unwrap(window.githead.getGitHubIssues({ repoPath: descriptor.repository.repoPath, requestId, page: Number(descriptor.params.page ?? 1), query: descriptor.params.query as GitHubIssueQuery | undefined }), fallbackErrors.issues),
    viewer: (descriptor, requestId) => unwrap(window.githead.getGitHubViewer({ repoPath: descriptor.repository.repoPath, requestId }), fallbackErrors.viewer)
  }
});

const workflowRunKey = (item: GitHubWorkflowRun): string => item.id;
const pullRequestKey = (item: GitHubPullRequest): number => item.number;
const issueKey = (item: GitHubIssue): number => item.number;

const EMPTY: GitHubQuerySnapshot<never> = Object.freeze({ status: "idle", data: undefined, error: "", updatedAt: null, isStale: true });
function descriptor(repository: GitHubRepositoryScope | null, resource: GitHubResource, params: GitHubQueryParams = {}): GitHubQueryDescriptor | null {
  return repository ? { repository, resource, params } : null;
}
function useSnapshot<T>(value: GitHubQueryDescriptor | null): GitHubQuerySnapshot<T> {
  const subscribe = useCallback((listener: () => void) => value ? gitHubQueryStore.subscribe(value, listener) : () => undefined, [value]);
  const getSnapshot = useCallback(() => value ? gitHubQueryStore.getSnapshot<T>(value) : EMPTY, [value]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useGitHubQueries(repository: GitHubRepositoryScope | null, queries?: { workflows?: GitHubWorkflowRunQuery; pullRequests?: GitHubPullRequestQuery; issues?: GitHubIssueQuery }) {
  const stableRepository = useMemo(() => repository ? { repoPath: repository.repoPath, githubFullName: repository.githubFullName } : null,
    [repository?.repoPath, repository?.githubFullName]);
  const descriptors = useMemo(() => ({ openCounts: descriptor(stableRepository, "openCounts"), viewer: descriptor(stableRepository, "viewer") }), [stableRepository]);
  const workflows = usePagedQuery<GitHubWorkflowRun>(stableRepository, "workflowRuns", workflowRunKey, queries?.workflows);
  const counts = useSnapshot<ResourceData["openCounts"]>(descriptors.openCounts);
  const viewer = useSnapshot<ResourceData["viewer"]>(descriptors.viewer);
  const pullRequests = usePagedQuery<GitHubPullRequest>(stableRepository, "pullRequests", pullRequestKey, queries?.pullRequests);
  const issues = usePagedQuery<GitHubIssue>(stableRepository, "issues", issueKey, queries?.issues);
  const ensure = useCallback(<R extends GitHubResource>(resource: R, params: GitHubQueryParams = {}) => {
    if (!stableRepository) return Promise.resolve(undefined);
    if (resource === "workflowRuns") return workflows.ensure() as Promise<ResourceData[R] | undefined>;
    if (resource === "pullRequests") return pullRequests.ensure() as Promise<ResourceData[R] | undefined>;
    if (resource === "issues") return issues.ensure() as Promise<ResourceData[R] | undefined>;
    return gitHubQueryStore.ensure<ResourceData[R]>({ repository: stableRepository, resource, params });
  }, [stableRepository, workflows.ensure, pullRequests.ensure, issues.ensure]);
  const refresh = useCallback(<R extends GitHubResource>(resource: R, params: GitHubQueryParams = {}) => {
    if (!stableRepository) return Promise.resolve(undefined);
    if (resource === "workflowRuns") return workflows.refresh() as Promise<ResourceData[R] | undefined>;
    if (resource === "pullRequests") return pullRequests.refresh() as Promise<ResourceData[R] | undefined>;
    if (resource === "issues") return issues.refresh() as Promise<ResourceData[R] | undefined>;
    return gitHubQueryStore.refresh<ResourceData[R]>({ repository: stableRepository, resource, params });
  }, [stableRepository, workflows.refresh, pullRequests.refresh, issues.refresh]);
  const invalidate = useCallback((resource?: GitHubResource, params?: GitHubQueryParams) => {
    if (stableRepository) gitHubQueryStore.invalidate({ repository: stableRepository, ...(resource ? { resource } : {}), ...(params ? { params } : {}) });
  }, [stableRepository]);
  return { workflows, counts, pullRequests, issues, viewer, ensure, refresh, invalidate,
    loadMore: (resource: "workflowRuns" | "pullRequests" | "issues") => ({ workflowRuns: workflows, pullRequests, issues }[resource].loadMore()) };
}

type PagedResource = "workflowRuns" | "pullRequests" | "issues";
interface PagedSnapshot<T> extends GitHubQuerySnapshot<T[]> {
  nextPage: number | null;
  totalCount: number | null;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  ensure: () => Promise<void>;
}
type PagedState<T> = GitHubQuerySnapshot<T[]> & Pick<PagedSnapshot<T>, "nextPage" | "totalCount" | "loadingMore">;

function usePagedQuery<T>(repository: GitHubRepositoryScope | null, resource: PagedResource, keyOf: (item: T) => string | number, query?: GitHubWorkflowRunQuery | GitHubPullRequestQuery | GitHubIssueQuery): PagedSnapshot<T> {
  const [snapshot, setSnapshot] = useState<PagedState<T>>({ status: "idle", data: undefined, error: "", updatedAt: null, isStale: true, nextPage: null, totalCount: null, loadingMore: false });
  const generation = useRef(0);
  const busy = useRef(false);
  const canonicalQuery = canonicalPageQuery(resource, query);
  const queryKey = JSON.stringify(canonicalQuery);
  const repositoryKey = repository ? `${repository.repoPath}\0${repository.githubFullName}\0${queryKey}` : "";
  useEffect(() => { generation.current += 1; busy.current = false; setSnapshot({ status: "idle", data: undefined, error: "", updatedAt: null, isStale: true, nextPage: null, totalCount: null, loadingMore: false }); }, [repositoryKey]);

  const request = useCallback(async (page: number, replace: boolean) => {
    if (!repository || busy.current) return;
    busy.current = true;
    const requestGeneration = ++generation.current;
    setSnapshot((current) => ({ ...current, status: current.data === undefined ? "loading" : "refreshing", loadingMore: !replace, error: "" }));
    try {
      const result = await gitHubQueryStore.refresh<GitHubPage<T>>({ repository, resource, params: { page, ...(Object.keys(canonicalQuery).length ? { query: canonicalQuery } : {}) } });
      if (generation.current !== requestGeneration) return;
      setSnapshot((current) => ({ status: "success", data: replace ? result.items : mergeItems(current.data ?? [], result.items, keyOf), error: "", updatedAt: Date.now(), isStale: false, nextPage: result.nextPage, totalCount: result.totalCount, loadingMore: false }));
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      setSnapshot((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : String(error), isStale: true, loadingMore: false }));
    } finally {
      if (generation.current === requestGeneration) busy.current = false;
    }
  }, [repositoryKey, resource, keyOf, queryKey]);
  const loadMore = useCallback(async () => { if (snapshot.nextPage !== null) await request(snapshot.nextPage, false); }, [request, snapshot.nextPage]);
  const refresh = useCallback(() => request(1, true), [request]);
  const ensure = useCallback(async () => { if (snapshot.data === undefined) await request(1, true); }, [request, snapshot.data]);
  return { ...snapshot, loadMore, refresh, ensure };
}

function canonicalPageQuery(resource: PagedResource, query: GitHubWorkflowRunQuery | GitHubPullRequestQuery | GitHubIssueQuery | undefined): Record<string, unknown> {
  if (!query) return {};
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== "");
  return Object.fromEntries(entries.filter(([key, value]) => {
    if (resource === "workflowRuns") return !(key === "sortDirection" && value === "desc");
    return !((key === "sort" && value === "updated") || (key === "direction" && value === "desc"));
  }).sort(([a], [b]) => a.localeCompare(b)));
}

function mergeItems<T>(existing: T[], incoming: T[], keyOf: (item: T) => string | number): T[] {
  const positions = new Map(existing.map((item, index) => [keyOf(item), index]));
  const merged = [...existing];
  for (const item of incoming) {
    const index = positions.get(keyOf(item));
    if (index === undefined) { positions.set(keyOf(item), merged.length); merged.push(item); }
    else merged[index] = item;
  }
  return merged;
}
