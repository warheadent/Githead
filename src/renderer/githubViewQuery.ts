import type { GitHubIssueQuery, GitHubPullRequestQuery, GitHubWorkflowRun, GitHubWorkflowRunQuery } from "../shared/types";

export const DEFAULT_WORKFLOW_QUERY: GitHubWorkflowRunQuery = Object.freeze({ sortDirection: "desc" });
export const DEFAULT_PULL_REQUEST_QUERY: GitHubPullRequestQuery = Object.freeze({ sort: "updated", direction: "desc" });
export const DEFAULT_ISSUE_QUERY: GitHubIssueQuery = Object.freeze({ sort: "updated", direction: "desc" });

export function normalizeText(value: string | undefined): string | undefined { const next = value?.trim(); return next || undefined; }
export function normalizeWorkflowQuery(query: GitHubWorkflowRunQuery): GitHubWorkflowRunQuery {
  return { ...(normalizeText(query.branch) ? { branch: normalizeText(query.branch) } : {}), ...(normalizeText(query.event) ? { event: normalizeText(query.event) } : {}), ...(query.status ? { status: query.status } : {}), sortDirection: query.sortDirection };
}
export function normalizePullRequestQuery(query: GitHubPullRequestQuery): GitHubPullRequestQuery {
  return compact({ ...query, search: normalizeText(query.search), author: normalizeText(query.author), assignee: normalizeText(query.assignee), reviewRequested: normalizeText(query.reviewRequested), label: normalizeText(query.label), sourceBranch: normalizeText(query.sourceBranch) });
}
export function normalizeIssueQuery(query: GitHubIssueQuery): GitHubIssueQuery {
  return compact({ ...query, search: normalizeText(query.search), author: normalizeText(query.author), assignee: normalizeText(query.assignee), label: normalizeText(query.label) });
}
function compact<T extends object>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T; }

export function filterLoadedWorkflowRuns(runs: GitHubWorkflowRun[], search: string): GitHubWorkflowRun[] {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return runs;
  return runs.filter((run) => [
    run.name,
    run.displayTitle,
    run.commitMessage,
    run.commitSha,
    run.branch,
    run.event,
    run.actor.login,
    run.runNumber?.toString() ?? ""
  ].some((value) => value.toLocaleLowerCase().includes(needle)));
}
export function sortLoadedWorkflowRuns(runs: GitHubWorkflowRun[], direction: "asc" | "desc"): GitHubWorkflowRun[] {
  return [...runs].sort((a, b) => (Date.parse(a.startedAt || a.updatedAt) - Date.parse(b.startedAt || b.updatedAt)) * (direction === "asc" ? 1 : -1));
}
