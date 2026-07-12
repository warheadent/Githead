import type { GitHubIssueQuery, GitHubPullRequestQuery, GitHubRepository, GitHubWorkflowRunQuery } from "../shared/types";

const quote = (value: string): string => `"${value.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const qualifier = (name: string, value: string | undefined): string[] => value?.trim() ? [`${name}:${quote(value)}`] : [];
const text = (value: string | undefined): string[] => value?.trim() ? [quote(value)] : [];
const pageNumber = (page: number): string => String(Math.max(1, Math.trunc(page) || 1));

export function buildWorkflowRunsPath(repository: GitHubRepository, query: GitHubWorkflowRunQuery, page: number): string {
  const params = new URLSearchParams({ per_page: "30", page: pageNumber(page) });
  if (query.branch?.trim()) params.set("branch", query.branch.trim());
  if (query.event?.trim()) params.set("event", query.event.trim());
  if (query.status) params.set("status", query.status);
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/actions/runs?${params}`;
}

export function buildPullRequestSearchPath(repository: GitHubRepository, query: GitHubPullRequestQuery, page: number): string {
  const expression = [`repo:${repository.fullName}`, "is:pr", "is:open", ...text(query.search), ...qualifier("author", query.author),
    ...qualifier("assignee", query.assignee), ...qualifier("review-requested", query.reviewRequested), ...qualifier("label", query.label),
    ...qualifier("head", query.sourceBranch), ...(query.draft ? [`draft:${query.draft === "draft" ? "true" : "false"}`] : [])].join(" ");
  return searchPath(expression, query.sort, query.direction, page);
}

export function buildIssueSearchPath(repository: GitHubRepository, query: GitHubIssueQuery, page: number): string {
  const expression = [`repo:${repository.fullName}`, "is:issue", "is:open", ...text(query.search), ...qualifier("author", query.author),
    ...(query.unassigned ? ["no:assignee"] : qualifier("assignee", query.assignee)), ...qualifier("label", query.label)].join(" ");
  return searchPath(expression, query.sort, query.direction, page);
}

function searchPath(expression: string, sort: "updated" | "created", direction: "asc" | "desc", page: number): string {
  const params = new URLSearchParams({ q: expression, sort, order: direction, per_page: "50", page: pageNumber(page) });
  return `/search/issues?${params}`;
}

export function hasPullRequestSearchFilters(query: GitHubPullRequestQuery): boolean {
  return Boolean(query.search || query.author || query.assignee || query.reviewRequested || query.label || query.sourceBranch || query.draft || query.sort !== "updated" || query.direction !== "desc");
}
