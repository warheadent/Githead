import { Effect } from "effect";
import type {
  CreateIssueRequest,
  CreateIssueResult,
  CreatePullRequestRequest,
  CreatePullRequestResult,
  GitHubIssue,
  GitHubIssueDetail,
  GitHubIssueDetailRequest,
  GitHubIssueTemplates,
  GitHubItemCommentRequest,
  GitHubIssuesRequest,
  GitHubHistoryInsights,
  GitHubHistoryInsightsRequest,
  GitHubCommitAssociation,
  GitHubPullRequestAssociation,
  GitHubCheckState,
  GitHubMutationResult,
  GitHubOpenCounts,
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubPullRequestDetailRequest,
  GitHubPullRequestMergeRequest,
  GitHubPullRequestReviewRequest,
  GitHubPullRequestsRequest,
  GitHubFailure,
  GitHubOperationResult,
  GitHubPage,
  GitHubRepository,
  GitHubRepositoryRequest,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  GitHubWorkflowRunDetail,
  GitHubWorkflowRunMutationResult,
  GitHubWorkflowRunRequest,
  GitHubWorkflowRunsRequest,
  GitHubViewer
} from "../shared/types";
import { GitHubHttpError, GitHubResponseBodyError, type GitHubApiClient } from "./githubClient";
import { reportGitHubFailure } from "./githubOperationReporter";
import { emptyGitHubIssueTemplates, parseGitHubIssueTemplate, parseGitHubIssueTemplateConfig } from "./githubIssueTemplates";
import { buildIssueSearchPath, buildPullRequestSearchPath, buildWorkflowRunsPath, hasPullRequestSearchFilters } from "./githubQuery";
import { runEffect, tryPromise } from "../shared/effectRuntime";

const WORKFLOW_RUN_LIMIT = 30;
const ISSUE_LIMIT = 50;
const PULL_REQUEST_LIMIT = 50;
const OBSERVED_COUNT_MAX_AGE_MS = 30_000;
const HISTORY_INSIGHTS_BATCH_SIZE = 20;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

interface GitHubRepositoryProvider {
  getGitHubRepository(repoPath: string): Promise<GitHubRepository | null>;
}

class GitHubMutationResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubMutationResponseError";
  }
}

interface GitHubApiErrorResponse {
  message?: string;
  errors?: Array<string | {
    message?: string;
  }>;
}

interface GitHubApiWorkflowRunsResponse extends GitHubApiErrorResponse {
  workflow_runs?: GitHubApiWorkflowRun[];
  total_count?: number;
}

interface GitHubApiWorkflowRun {
  id?: number | string;
  name?: string | null;
  display_title?: string | null;
  run_number?: number | null;
  run_attempt?: number | null;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  event?: string | null;
  head_sha?: string | null;
  html_url?: string | null;
  created_at?: string | null;
  run_started_at?: string | null;
  updated_at?: string | null;
  actor?: unknown;
  head_commit?: {
    message?: string | null;
  } | null;
}

interface GitHubApiWorkflowJobsResponse extends GitHubApiErrorResponse {
  total_count?: number;
  jobs?: unknown[];
}

interface GitHubApiIssue {
  number?: number;
  title?: string | null;
  state?: string | null;
  user?: {
    login?: string | null;
  } | null;
  labels?: Array<string | {
    name?: string | null;
  }>;
  comments?: number | null;
  updated_at?: string | null;
  html_url?: string | null;
  pull_request?: unknown;
}

interface GitHubApiPullRequestsResponse extends Array<GitHubApiPullRequest> {}

interface GitHubApiSearchResponse extends GitHubApiErrorResponse {
  total_count?: number | null;
  items?: GitHubApiIssue[];
}

interface GitHubApiViewer { login?: string | null }

interface GitHubApiContentEntry {
  name?: string;
  path?: string;
  type?: string;
  encoding?: string;
  content?: string;
}

interface GitHubApiPullRequest {
  number?: number;
  title?: string | null;
  state?: string | null;
  user?: {
    login?: string | null;
  } | null;
  head?: {
    ref?: string | null;
    sha?: string | null;
    repo?: { full_name?: string | null } | null;
  } | null;
  base?: {
    ref?: string | null;
    sha?: string | null;
    repo?: { full_name?: string | null } | null;
  } | null;
  labels?: Array<string | {
    name?: string | null;
  }>;
  comments?: number | null;
  review_comments?: number | null;
  draft?: boolean | null;
  body?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  merged_at?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  commits?: number | null;
  additions?: number | null;
  deletions?: number | null;
  requested_reviewers?: unknown[];
  html_url?: string | null;
}

interface GitHubGraphQlResponse {
  data?: { repository?: Record<string, unknown> | null } | null;
  errors?: Array<{ message?: string }>;
}

export class GitHubService {
  private readonly observedOpenCounts = new Map<string, Partial<Record<GitHubOpenKind, ObservedOpenCount>>>();

  constructor(
    private readonly repositoryProvider: GitHubRepositoryProvider,
    private readonly client: GitHubApiClient,
    private readonly now: () => number = Date.now
  ) {}

  async getWorkflowRuns(request: GitHubWorkflowRunsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPage<GitHubWorkflowRun>>> {
    return this.read(() => this.getWorkflowRunsData(request, signal));
  }
  async getWorkflowRunDetail(request: GitHubWorkflowRunRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubWorkflowRunDetail>> {
    return this.read(() => this.getWorkflowRunDetailData(request, signal));
  }
  async rerunWorkflowRun(request: GitHubWorkflowRunRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubWorkflowRunMutationResult>> {
    return this.mutate(() => this.mutateWorkflowRun(request, "rerun", signal));
  }
  async cancelWorkflowRun(request: GitHubWorkflowRunRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubWorkflowRunMutationResult>> {
    return this.mutate(() => this.mutateWorkflowRun(request, "cancel", signal));
  }
  async getOpenCounts(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubOpenCounts>> {
    return this.read(() => this.getOpenCountsData(request, signal));
  }
  async getViewer(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubViewer>> {
    return this.read(() => this.getViewerData(request, signal));
  }
  async getIssues(request: GitHubIssuesRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPage<GitHubIssue>>> {
    return this.read(() => this.getIssuesData(request, signal));
  }
  async getIssueTemplates(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubIssueTemplates>> {
    return this.read(() => this.getIssueTemplatesData(request, signal));
  }
  async getPullRequests(request: GitHubPullRequestsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPage<GitHubPullRequest>>> {
    return this.read(() => this.getPullRequestsData(request, signal));
  }
  async getPullRequestDetail(request: GitHubPullRequestDetailRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPullRequestDetail>> {
    return this.read(() => this.getPullRequestDetailData(request, signal));
  }
  async getIssueDetail(request: GitHubIssueDetailRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubIssueDetail>> {
    return this.read(() => this.getIssueDetailData(request, signal));
  }
  async approvePullRequest(request: GitHubPullRequestReviewRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubMutationResult>> {
    return this.mutate(() => this.approvePullRequestData(request, signal));
  }
  async commentOnItem(request: GitHubItemCommentRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubMutationResult>> {
    return this.mutate(() => this.commentOnItemData(request, signal));
  }
  async mergePullRequest(request: GitHubPullRequestMergeRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubMutationResult>> {
    return this.mutate(() => this.mergePullRequestData(request, signal));
  }
  async getHistoryInsights(request: GitHubHistoryInsightsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubHistoryInsights>> {
    return this.read(() => this.getHistoryInsightsData(request, signal));
  }
  async createPullRequest(request: CreatePullRequestRequest, signal?: AbortSignal): Promise<GitHubOperationResult<CreatePullRequestResult>> {
    return this.mutate(() => this.createPullRequestData(request, signal));
  }
  async createIssue(request: CreateIssueRequest, signal?: AbortSignal): Promise<GitHubOperationResult<CreateIssueResult>> {
    return this.mutate(() => this.createIssueData(request, signal));
  }

  private read<T>(operation: () => Promise<T>): Promise<GitHubOperationResult<T>> {
    return runEffect(tryPromise(operation).pipe(
      Effect.map((data): GitHubOperationResult<T> => ({ ok: true, data, rateLimit: null })),
      Effect.catch((error) => Effect.succeed<GitHubOperationResult<T>>({
        ok: false,
        error: classifyError(error, "combined", false)
      }))
    ));
  }

  private mutate<T>(operation: () => Promise<T>): Promise<GitHubOperationResult<T>> {
    return runEffect(tryPromise(operation).pipe(
      Effect.map((data): GitHubOperationResult<T> => ({ ok: true, data, rateLimit: null })),
      Effect.catch((error) => Effect.succeed<GitHubOperationResult<T>>({
        ok: false,
        error: classifyError(error, "combined", true)
      }))
    ));
  }

  private async getWorkflowRunsData(request: GitHubWorkflowRunsRequest, signal?: AbortSignal): Promise<GitHubPage<GitHubWorkflowRun>> {
    const page = resolvePage(request.page);
    const repository = await this.getRepository(request.repoPath);
    const { payload: response, headers } = await this.client.requestJson<GitHubApiWorkflowRunsResponse>(
      repository,
      buildWorkflowRunsPath(repository, { sortDirection: "desc", ...request.query }, page),
      { cache: { mode: "conditional" }, ...(signal ? { signal } : {}) }
    );

    const rawItems = response.workflow_runs ?? [];
    const items = rawItems.flatMap((run) => {
      const mapped = mapWorkflowRun(run, repository);
      return mapped ? [mapped] : [];
    });
    return { items, page, nextPage: getNextPage(headers, page, rawItems.length, WORKFLOW_RUN_LIMIT), totalCount: Number.isFinite(response.total_count) ? Number(response.total_count) : null };
  }

  private async getWorkflowRunDetailData(request: GitHubWorkflowRunRequest, signal?: AbortSignal): Promise<GitHubWorkflowRunDetail> {
    const runId = validateWorkflowRunId(request.runId);
    const repository = await this.getRepository(request.repoPath);
    const prefix = `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/actions/runs/${runId}`;
    const readRequest = { cache: { mode: "conditional" as const }, ...(signal ? { signal } : {}) };
    const [runResponse, jobsResponse] = await Promise.all([
      this.client.requestJson<GitHubApiWorkflowRun>(repository, prefix, readRequest),
      this.client.requestJson<GitHubApiWorkflowJobsResponse>(repository, `${prefix}/jobs?filter=all&per_page=100`, readRequest)
    ]);
    const run = mapWorkflowRun(runResponse.payload, repository);
    if (!run) throw new Error("GitHub returned an invalid workflow run detail response.");
    const jobs = asArray(jobsResponse.payload.jobs).flatMap((job) => {
      const mapped = mapWorkflowJob(job);
      return mapped ? [mapped] : [];
    });
    return {
      ...run,
      jobs,
      jobCount: Number.isFinite(jobsResponse.payload.total_count) ? Number(jobsResponse.payload.total_count) : jobs.length
    };
  }

  private async mutateWorkflowRun(
    request: GitHubWorkflowRunRequest,
    action: "rerun" | "cancel",
    signal?: AbortSignal
  ): Promise<GitHubWorkflowRunMutationResult> {
    const runId = validateWorkflowRunId(request.runId);
    const repository = await this.getRepository(request.repoPath);
    await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/actions/runs/${runId}/${action}`,
      { method: "POST", ...(signal ? { signal } : {}) }
    );
    this.client.invalidateRepository(repository);
    return {
      runId,
      url: `${repository.webUrl}/actions/runs/${runId}`,
      message: action === "rerun" ? "Workflow re-run requested." : "Workflow cancellation requested."
    };
  }

  private async getOpenCountsData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOpenCounts> {
    const repository = await this.getRepository(request.repoPath);
    const observed = this.observedOpenCounts.get(normalizeRepository(repository));
    const issues = this.isFresh(observed?.issues)
      ? Effect.succeed(observed.issues.value)
      : this.getSearchCountEffect(repository, `repo:${repository.fullName} is:open is:issue`, signal);
    const pullRequests = this.isFresh(observed?.pullRequests)
      ? Effect.succeed(observed.pullRequests.value)
      : this.getSearchCountEffect(repository, `repo:${repository.fullName} is:open is:pr`, signal);
    const [resolvedIssues, resolvedPullRequests] = await runEffect(Effect.all([
      issues,
      pullRequests
    ], { concurrency: "unbounded" }));

    return {
      issues: resolvedIssues,
      pullRequests: resolvedPullRequests
    };
  }

  private getSearchCountEffect(
    repository: GitHubRepository,
    query: string,
    signal?: AbortSignal
  ): Effect.Effect<number, unknown> {
    return tryPromise((effectSignal) => this.getSearchCount(
      repository,
      query,
      signal ? AbortSignal.any([signal, effectSignal]) : effectSignal
    ));
  }

  private async getViewerData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubViewer> {
    const repository = await this.getRepository(request.repoPath);
    try {
      const { payload } = await this.client.requestJson<GitHubApiViewer>(repository, "/user", { cache: { mode: "conditional", maxAgeMs: 300_000 }, ...(signal ? { signal } : {}) });
      const login = payload.login?.trim() || null;
      return { login, authenticated: Boolean(login) };
    } catch (error) {
      if (error instanceof Error && /status 401|authenticate/i.test(error.message)) return { login: null, authenticated: false };
      throw error;
    }
  }

  private async getIssuesData(request: GitHubIssuesRequest, signal?: AbortSignal): Promise<GitHubPage<GitHubIssue>> {
    const page = resolvePage(request.page);
    const repository = await this.getRepository(request.repoPath);
    const query = { sort: "updated" as const, direction: "desc" as const, ...request.query };
    const { payload: response } = await this.client.requestJson<GitHubApiSearchResponse>(
      repository,
      buildIssueSearchPath(repository, query, page),
      { cache: { mode: "conditional" }, ...(signal ? { signal } : {}) }
    );

    const rawItems = response.items ?? [];
    const issues = rawItems.flatMap((issue) => {
      if (issue.pull_request || !Number.isFinite(issue.number)) {
        return [];
      }

      return [
        {
          number: Number(issue.number),
          title: normalizeText(issue.title, "(no title)"),
          state: normalizeText(issue.state, "open"),
          authorLogin: normalizeText(issue.user?.login, "-"),
          labels: normalizeLabels(issue.labels ?? []),
          comments: Number.isFinite(issue.comments) ? Number(issue.comments) : 0,
          updatedAt: normalizeText(issue.updated_at, ""),
          url: normalizeText(issue.html_url, repository.webUrl)
        }
      ];
    });
    if (page === 1 && Number.isFinite(response.total_count)) this.observeCount(repository, "issues", Number(response.total_count));
    return { items: issues, page, nextPage: page * ISSUE_LIMIT < Number(response.total_count ?? 0) ? page + 1 : null, totalCount: Number.isFinite(response.total_count) ? Number(response.total_count) : null };
  }

  private async getIssueTemplatesData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubIssueTemplates> {
    const repository = await this.getRepository(request.repoPath);
    const directoryPath = `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/contents/.github/ISSUE_TEMPLATE`;
    let entries: GitHubApiContentEntry[];
    try {
      const { payload } = await this.client.requestJson<unknown>(repository, directoryPath, {
        cache: { mode: "conditional", maxAgeMs: 60_000 },
        ...(signal ? { signal } : {})
      });
      entries = Array.isArray(payload) ? payload.filter(isRecord) as GitHubApiContentEntry[] : [];
    } catch (error) {
      if (error instanceof GitHubHttpError && error.status === 404) return emptyGitHubIssueTemplates();
      throw error;
    }

    const files = entries
      .filter((entry) => entry.type === "file" && typeof entry.name === "string" && typeof entry.path === "string")
      .filter((entry) => /\.(?:md|ya?ml)$/i.test(entry.name ?? ""))
      .slice(0, 50);
    const loaded = await Promise.all(files.map(async (entry) => {
      signal?.throwIfAborted();
      const path = String(entry.path).split("/").map(encodePath).join("/");
      const { payload } = await this.client.requestJson<GitHubApiContentEntry>(
        repository,
        `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/contents/${path}`,
        { cache: { mode: "conditional", maxAgeMs: 60_000 }, ...(signal ? { signal } : {}) }
      );
      if (payload.encoding !== "base64" || typeof payload.content !== "string") return null;
      return { name: String(entry.name), source: Buffer.from(payload.content.replace(/\s/g, ""), "base64").toString("utf8") };
    }));

    const configFile = loaded.find((file) => file && /^config\.ya?ml$/i.test(file.name));
    const config = configFile ? parseGitHubIssueTemplateConfig(configFile.source) : { blankIssuesEnabled: true, contactLinks: [] };
    const templates = loaded.flatMap((file) => {
      if (!file) return [];
      const template = parseGitHubIssueTemplate(file.name, file.source);
      return template ? [template] : [];
    }).sort((left, right) => left.filename.localeCompare(right.filename));
    return { templates, ...config };
  }

  private async getPullRequestsData(request: GitHubPullRequestsRequest, signal?: AbortSignal): Promise<GitHubPage<GitHubPullRequest>> {
    const page = resolvePage(request.page);
    const repository = await this.getRepository(request.repoPath);
    const query = { sort: "updated" as const, direction: "desc" as const, ...request.query };
    const search = hasPullRequestSearchFilters(query);
    const { payload: response, headers } = await this.client.requestJson<GitHubApiPullRequestsResponse | GitHubApiSearchResponse>(
      repository,
      search ? buildPullRequestSearchPath(repository, query, page) : `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls?state=open&sort=updated&direction=desc&per_page=${PULL_REQUEST_LIMIT}&page=${page}`,
      { cache: { mode: "conditional" }, ...(signal ? { signal } : {}) }
    );

    const rawItems: GitHubApiPullRequest[] = search
      ? ((response as GitHubApiSearchResponse).items ?? []) as GitHubApiPullRequest[]
      : response as GitHubApiPullRequestsResponse;
    const pullRequests = rawItems.flatMap((pullRequest) => {
      if (!Number.isFinite(pullRequest.number)) {
        return [];
      }

      return [
        {
          number: Number(pullRequest.number),
          title: normalizeText(pullRequest.title, "(no title)"),
          state: normalizeText(pullRequest.state, "open"),
          authorLogin: normalizeText(pullRequest.user?.login, "-"),
          sourceBranch: normalizeText(pullRequest.head?.ref, ""),
          sourceRepositoryFullName: normalizeText(pullRequest.head?.repo?.full_name, ""),
          targetBranch: normalizeText(pullRequest.base?.ref, ""),
          labels: normalizeLabels(pullRequest.labels ?? []),
          comments: sumCounts(pullRequest.comments, pullRequest.review_comments),
          draft: pullRequest.draft === true,
          updatedAt: normalizeText(pullRequest.updated_at, ""),
          url: normalizeText(pullRequest.html_url, repository.webUrl)
        }
      ];
    });
    if (!search && page === 1 && rawItems.length < PULL_REQUEST_LIMIT) this.observeCount(repository, "pullRequests", pullRequests.length);
    const totalCount = search && Number.isFinite((response as GitHubApiSearchResponse).total_count) ? Number((response as GitHubApiSearchResponse).total_count) : null;
    return { items: pullRequests, page, nextPage: search ? (page * PULL_REQUEST_LIMIT < (totalCount ?? 0) ? page + 1 : null) : getNextPage(headers, page, rawItems.length, PULL_REQUEST_LIMIT), totalCount };
  }

  private async getPullRequestDetailData(request: GitHubPullRequestDetailRequest, signal?: AbortSignal): Promise<GitHubPullRequestDetail> {
    const number = validateItemNumber(request.number);
    const repository = await this.getRepository(request.repoPath);
    const prefix = `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}`;
    const readRequest = { cache: { mode: "conditional" as const }, ...(signal ? { signal } : {}) };
    const pullRequestPromise = this.client.requestJson<GitHubApiPullRequest>(repository, `${prefix}/pulls/${number}`, readRequest);
    const [pullRequestResponse, issueCommentsResponse, reviewCommentsResponse, reviewsResponse, filesResponse, commitsResponse] = await Promise.all([
      pullRequestPromise,
      this.client.requestJson<unknown>(repository, `${prefix}/issues/${number}/comments?per_page=100`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/pulls/${number}/comments?per_page=100`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/pulls/${number}/reviews?per_page=100`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/pulls/${number}/files?per_page=100`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/pulls/${number}/commits?per_page=100`, readRequest)
    ]);
    const pullRequest = pullRequestResponse.payload;
    if (!Number.isFinite(pullRequest.number)) {
      throw new Error("GitHub returned an invalid pull request detail response.");
    }

    const sourceSha = normalizeText(pullRequest.head?.sha, "");
    const targetSha = normalizeText(pullRequest.base?.sha, "");
    const [checksResponse, comparisonResponse] = await Promise.all([
      sourceSha
        ? this.client.requestJson<unknown>(repository, `${prefix}/commits/${encodePath(sourceSha)}/check-runs?per_page=100`, readRequest)
        : Promise.resolve(null),
      sourceSha && targetSha
        ? this.client.requestJson<unknown>(repository, `${prefix}/compare/${encodePath(targetSha)}...${encodePath(sourceSha)}`, readRequest)
        : Promise.resolve(null)
    ]);

    const comments = [
      ...asArray(issueCommentsResponse.payload).map((comment) => mapComment(comment, "issue")),
      ...asArray(reviewCommentsResponse.payload).map((comment) => mapComment(comment, "review"))
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const reviews = asArray(reviewsResponse.payload).map(mapReview).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const requestedReviewers = asArray(pullRequest.requested_reviewers).map(mapUser);
    const reviewStatus = getReviewStatus(reviews, requestedReviewers.length);
    const checks = mapChecks(checksResponse?.payload);
    const displayState = pullRequest.merged_at
      ? "merged" as const
      : pullRequest.draft === true
        ? "draft" as const
        : pullRequest.state?.toLowerCase() === "closed" ? "closed" as const : "open" as const;
    const mergeable = typeof pullRequest.mergeable === "boolean" ? pullRequest.mergeable : null;
    const mergeableState = normalizeText(pullRequest.mergeable_state, "unknown").toLowerCase();
    const mergeStatus = getMergeStatus(displayState, mergeable, mergeableState, reviewStatus, checks);
    const comparison = asRecord(comparisonResponse?.payload);
    const files = asArray(filesResponse.payload).map(mapPullRequestFile);

    return {
      number,
      title: normalizeText(pullRequest.title, "(no title)"),
      displayState,
      draft: pullRequest.draft === true,
      author: mapUser(pullRequest.user),
      body: pullRequest.body ?? "",
      createdAt: normalizeText(pullRequest.created_at, ""),
      updatedAt: normalizeText(pullRequest.updated_at, ""),
      mergedAt: pullRequest.merged_at?.trim() || null,
      url: normalizeText(pullRequest.html_url, `${repository.webUrl}/pull/${number}`),
      sourceBranch: normalizeText(pullRequest.head?.ref, ""),
      sourceRepositoryFullName: normalizeText(pullRequest.head?.repo?.full_name, ""),
      sourceSha,
      targetBranch: normalizeText(pullRequest.base?.ref, ""),
      targetRepositoryFullName: normalizeText(pullRequest.base?.repo?.full_name, repository.fullName),
      mergeable,
      mergeableState,
      mergeStatus,
      canMerge: mergeStatus === "ready",
      reviewStatus,
      requestedReviewers,
      comments,
      reviews,
      files,
      additions: finiteNumber(pullRequest.additions, files.reduce((total, file) => total + file.additions, 0)),
      deletions: finiteNumber(pullRequest.deletions, files.reduce((total, file) => total + file.deletions, 0)),
      checks,
      commits: asArray(commitsResponse.payload).map(mapPullRequestCommit),
      commitCount: finiteNumber(pullRequest.commits, asArray(commitsResponse.payload).length),
      branchRelationship: normalizeText(stringValue(comparison?.status), "unknown"),
      aheadBy: finiteNumber(comparison?.ahead_by, 0),
      behindBy: finiteNumber(comparison?.behind_by, 0)
    };
  }

  private async getIssueDetailData(request: GitHubIssueDetailRequest, signal?: AbortSignal): Promise<GitHubIssueDetail> {
    const number = validateItemNumber(request.number);
    const repository = await this.getRepository(request.repoPath);
    const prefix = `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}`;
    const readRequest = { cache: { mode: "conditional" as const }, ...(signal ? { signal } : {}) };
    const [issueResponse, commentsResponse, timelineResponse] = await Promise.all([
      this.client.requestJson<unknown>(repository, `${prefix}/issues/${number}`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/issues/${number}/comments?per_page=100`, readRequest),
      this.client.requestJson<unknown>(repository, `${prefix}/issues/${number}/timeline?per_page=100`, readRequest)
    ]);
    const issue = asRecord(issueResponse.payload);
    if (!issue || !Number.isFinite(issue.number)) {
      throw new Error("GitHub returned an invalid issue detail response.");
    }

    return {
      number,
      title: normalizeText(stringValue(issue.title), "(no title)"),
      state: normalizeText(stringValue(issue.state), "open").toLowerCase(),
      author: mapUser(issue.user),
      body: stringValue(issue.body) ?? "",
      createdAt: normalizeText(stringValue(issue.created_at), ""),
      updatedAt: normalizeText(stringValue(issue.updated_at), ""),
      closedAt: stringValue(issue.closed_at)?.trim() || null,
      url: normalizeText(stringValue(issue.html_url), `${repository.webUrl}/issues/${number}`),
      comments: asArray(commentsResponse.payload).map((comment) => mapComment(comment, "issue")),
      assignees: asArray(issue.assignees).map(mapUser),
      labels: asArray(issue.labels).flatMap(mapLabel),
      milestone: mapMilestone(issue.milestone),
      linkedPullRequests: mapLinkedPullRequests(timelineResponse.payload)
    };
  }

  private async approvePullRequestData(request: GitHubPullRequestReviewRequest, signal?: AbortSignal): Promise<GitHubMutationResult> {
    const number = validateItemNumber(request.number);
    const repository = await this.getRepository(request.repoPath);
    const body = request.body?.trim();
    const { payload } = await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls/${number}/reviews`,
      { method: "POST", body: { event: "APPROVE", ...(body ? { body } : {}) }, ...(signal ? { signal } : {}) }
    );
    const response = asRecord(payload);
    if (!response || response.id === undefined) throw new GitHubMutationResponseError("GitHub returned an unexpected response while approving the pull request.");
    this.client.invalidateRepository(repository);
    return {
      number,
      url: normalizeText(stringValue(response.html_url), `${repository.webUrl}/pull/${number}`),
      message: "Pull request approved.",
      merged: null
    };
  }

  private async commentOnItemData(request: GitHubItemCommentRequest, signal?: AbortSignal): Promise<GitHubMutationResult> {
    const number = validateItemNumber(request.number);
    const body = request.body.trim();
    if (!body) throw new Error("Comment text is required.");
    const repository = await this.getRepository(request.repoPath);
    const { payload } = await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/issues/${number}/comments`,
      { method: "POST", body: { body }, ...(signal ? { signal } : {}) }
    );
    const response = asRecord(payload);
    if (!response || response.id === undefined) throw new GitHubMutationResponseError("GitHub returned an unexpected response while adding the comment.");
    this.client.invalidateRepository(repository);
    const itemPath = request.itemType === "pullRequest" ? "pull" : "issues";
    return {
      number,
      url: normalizeText(stringValue(response.html_url), `${repository.webUrl}/${itemPath}/${number}`),
      message: "Comment added.",
      merged: null
    };
  }

  private async mergePullRequestData(request: GitHubPullRequestMergeRequest, signal?: AbortSignal): Promise<GitHubMutationResult> {
    const number = validateItemNumber(request.number);
    const repository = await this.getRepository(request.repoPath);
    const { payload } = await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls/${number}/merge`,
      { method: "PUT", body: { merge_method: request.method ?? "merge" }, ...(signal ? { signal } : {}) }
    );
    const response = asRecord(payload);
    if (!response || typeof response.merged !== "boolean") throw new GitHubMutationResponseError("GitHub returned an unexpected response while merging the pull request.");
    if (!response.merged) throw new Error(normalizeText(stringValue(response.message), "GitHub did not merge the pull request."));
    this.client.invalidateRepository(repository);
    this.clearObservedCount(repository, "pullRequests");
    return {
      number,
      url: `${repository.webUrl}/pull/${number}`,
      message: normalizeText(stringValue(response.message), "Pull request merged."),
      merged: true
    };
  }

  private async getHistoryInsightsData(request: GitHubHistoryInsightsRequest, signal?: AbortSignal): Promise<GitHubHistoryInsights> {
    const repository = await this.getRepository(request.repoPath);
    const requestedShas = [...new Set(request.commitShas.map((sha) => sha.trim().toLowerCase()).filter((sha) => FULL_SHA_PATTERN.test(sha)))].sort();
    const headSha = request.headSha?.trim().toLowerCase() ?? null;
    if (headSha && FULL_SHA_PATTERN.test(headSha) && !requestedShas.includes(headSha)) requestedShas.push(headSha);
    requestedShas.sort();

    const commits: GitHubCommitAssociation[] = [];
    const unavailableCommitShas: string[] = [];
    for (let offset = 0; offset < requestedShas.length; offset += HISTORY_INSIGHTS_BATCH_SIZE) {
      const batch = requestedShas.slice(offset, offset + HISTORY_INSIGHTS_BATCH_SIZE);
      const { query, variables } = createHistoryInsightsQuery(repository, batch);
      const { payload } = await this.client.requestJson<GitHubGraphQlResponse>(repository, "/graphql", {
        method: "POST", body: { query, variables }, ...(signal ? { signal } : {})
      });
      if (payload.errors?.length && !payload.data?.repository) {
        throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join(" ") || "GitHub GraphQL enrichment is unavailable.");
      }
      const nodes = payload.data?.repository;
      for (let index = 0; index < batch.length; index += 1) {
        const sha = batch[index]!;
        const association = parseCommitAssociation(sha, nodes?.[`commit${index}`], repository);
        if (association) commits.push(association);
        else unavailableCommitShas.push(sha);
      }
    }
    const headAssociation = headSha ? commits.find((commit) => commit.commitSha === headSha) : undefined;
    return {
      commits: commits.filter((commit) => request.commitShas.some((sha) => sha.toLowerCase() === commit.commitSha)),
      unavailableCommitShas: unavailableCommitShas.filter((sha) => request.commitShas.some((requested) => requested.toLowerCase() === sha)),
      currentBranchPullRequests: selectCurrentBranchPullRequests(headAssociation?.pullRequests ?? [], headSha, repository)
    };
  }

  private async createPullRequestData(request: CreatePullRequestRequest, signal?: AbortSignal): Promise<CreatePullRequestResult> {
    signal?.throwIfAborted();
    const repository = await this.getRepository(request.repoPath);
    signal?.throwIfAborted();
    const { payload: response } = await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls`,
      {
        method: "POST",
        body: {
          title: request.title,
          head: request.headBranch,
          base: request.baseBranch,
          body: request.body,
          draft: request.draft
        },
        ...(signal ? { signal } : {})
      }
    );
    signal?.throwIfAborted();

    if (!isRecord(response) || !Number.isFinite(response.number)) {
      throw new GitHubMutationResponseError("GitHub returned an unexpected response while creating the pull request.");
    }

    this.client.invalidateRepository(repository);
    this.clearObservedCount(repository, "pullRequests");
    return {
      number: Number(response.number),
      url: normalizeText(typeof response.html_url === "string" ? response.html_url : null, repository.webUrl),
      title: normalizeText(typeof response.title === "string" ? response.title : null, request.title),
      draft: response.draft === true
    };
  }

  private async createIssueData(request: CreateIssueRequest, signal?: AbortSignal): Promise<CreateIssueResult> {
    const title = request.title.trim();
    if (!title) throw new Error("Issue title is required.");
    signal?.throwIfAborted();
    const repository = await this.getRepository(request.repoPath);
    signal?.throwIfAborted();
    const { payload: response } = await this.client.requestJson<unknown>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/issues`,
      {
        method: "POST",
        body: {
          title,
          body: request.body,
          ...(request.labels?.length ? { labels: request.labels } : {}),
          ...(request.assignees?.length ? { assignees: request.assignees } : {})
        },
        ...(signal ? { signal } : {})
      }
    );
    signal?.throwIfAborted();

    if (!isRecord(response) || !Number.isFinite(response.number)) {
      throw new GitHubMutationResponseError("GitHub returned an unexpected response while creating the issue.");
    }

    this.client.invalidateRepository(repository);
    this.clearObservedCount(repository, "issues");
    return {
      number: Number(response.number),
      url: normalizeText(typeof response.html_url === "string" ? response.html_url : null, `${repository.webUrl}/issues/${Number(response.number)}`),
      title: normalizeText(typeof response.title === "string" ? response.title : null, title)
    };
  }

  private async getRepository(repoPath: string): Promise<GitHubRepository> {
    const repository = await this.repositoryProvider.getGitHubRepository(repoPath);
    if (!repository) {
      throw new Error("Selected repository does not have a supported GitHub origin.");
    }

    return repository;
  }

  private async getSearchCount(repository: GitHubRepository, query: string, signal?: AbortSignal): Promise<number> {
    const { payload: response } = await this.client.requestJson<GitHubApiSearchResponse>(
      repository,
      `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
      { cache: { mode: "conditional", maxAgeMs: OBSERVED_COUNT_MAX_AGE_MS }, ...(signal ? { signal } : {}) }
    );

    return Number.isFinite(response.total_count) ? Number(response.total_count) : 0;
  }

  private observeCount(repository: GitHubRepository, kind: GitHubOpenKind, value: number): void {
    const key = normalizeRepository(repository);
    const counts = this.observedOpenCounts.get(key) ?? {};
    counts[kind] = { value, observedAt: this.now() };
    this.observedOpenCounts.set(key, counts);
  }

  private clearObservedCount(repository: GitHubRepository, kind: GitHubOpenKind): void {
    const key = normalizeRepository(repository);
    const counts = this.observedOpenCounts.get(key);
    if (!counts) return;
    delete counts[kind];
    if (!counts.issues && !counts.pullRequests) this.observedOpenCounts.delete(key);
  }

  private isFresh(observed: ObservedOpenCount | undefined): observed is ObservedOpenCount {
    return observed !== undefined && this.now() - observed.observedAt <= OBSERVED_COUNT_MAX_AGE_MS;
  }
}

type GitHubOpenKind = "issues" | "pullRequests";
interface ObservedOpenCount { value: number; observedAt: number }

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function resolvePage(value: number | undefined): number {
  const page = value ?? 1;
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("GitHub page must be a positive safe integer.");
  }
  return page;
}

function getNextPage(headers: Headers, currentPage: number, rawItemCount: number, pageSize: number): number | null {
  const link = headers.get("link");
  if (!link) return rawItemCount === pageSize ? currentPage + 1 : null;
  for (const part of link.split(",")) {
    const match = part.match(/^\s*<([^>]+)>\s*;\s*(.+)$/);
    if (!match) continue;
    const relations = [...match[2]!.matchAll(/(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/gi)]
      .flatMap((relation) => (relation[1] ?? relation[2] ?? relation[3] ?? "").toLowerCase().split(/\s+/));
    if (!relations.includes("next")) continue;
    try {
      const page = Number(new URL(match[1]!, "https://api.github.com").searchParams.get("page"));
      return Number.isSafeInteger(page) && page > currentPage ? page : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeRepository(repository: GitHubRepository): string {
  return repository.fullName.trim().toLowerCase();
}

function createHistoryInsightsQuery(repository: GitHubRepository, shas: string[]): { query: string; variables: Record<string, string> } {
  const declarations = ["$owner:String!", "$name:String!", ...shas.map((_, index) => `$sha${index}:GitObjectID!`)].join(",");
  const selections = shas.map((_, index) => `
    commit${index}: object(oid:$sha${index}) {
      ... on Commit {
        oid
        statusCheckRollup { state }
        associatedPullRequests(first:5) { nodes {
          number title state isDraft url headRefName headRefOid
          baseRepository { nameWithOwner }
          headRepository { nameWithOwner }
        } }
      }
    }`).join("\n");
  return {
    query: `query GitheadHistoryInsights(${declarations}) { repository(owner:$owner,name:$name) { ${selections} } }`,
    variables: Object.fromEntries([["owner", repository.owner], ["name", repository.name], ...shas.map((sha, index) => [`sha${index}`, sha])])
  };
}

function parseCommitAssociation(sha: string, raw: unknown, repository: GitHubRepository): GitHubCommitAssociation | null {
  if (!isRecord(raw) || typeof raw.oid !== "string" || raw.oid.toLowerCase() !== sha) return null;
  const rollup = isRecord(raw.statusCheckRollup) ? raw.statusCheckRollup : null;
  const pullRequestConnection = isRecord(raw.associatedPullRequests) ? raw.associatedPullRequests : null;
  const nodes = Array.isArray(pullRequestConnection?.nodes) ? pullRequestConnection.nodes : [];
  return {
    commitSha: sha,
    checkState: mapCheckState(typeof rollup?.state === "string" ? rollup.state : null),
    pullRequests: nodes.flatMap((node) => parsePullRequestAssociation(node, repository))
  };
}

function parsePullRequestAssociation(raw: unknown, repository: GitHubRepository): GitHubPullRequestAssociation[] {
  if (!isRecord(raw) || !Number.isSafeInteger(raw.number) || Number(raw.number) <= 0 || typeof raw.url !== "string") return [];
  const base = isRecord(raw.baseRepository) && typeof raw.baseRepository.nameWithOwner === "string"
    ? raw.baseRepository.nameWithOwner : repository.fullName;
  const head = isRecord(raw.headRepository) && typeof raw.headRepository.nameWithOwner === "string"
    ? raw.headRepository.nameWithOwner : null;
  return [{
    number: Number(raw.number), title: normalizeText(typeof raw.title === "string" ? raw.title : null, "(no title)"),
    state: normalizeText(typeof raw.state === "string" ? raw.state : null, "unknown").toLowerCase(),
    draft: raw.isDraft === true, url: raw.url, baseRepositoryFullName: base,
    headRepositoryFullName: head, headBranch: typeof raw.headRefName === "string" ? raw.headRefName : "",
    headSha: typeof raw.headRefOid === "string" ? raw.headRefOid.toLowerCase() : ""
  }];
}

function mapCheckState(state: string | null): GitHubCheckState {
  switch (state?.toUpperCase()) {
    case "SUCCESS": return "success";
    case "FAILURE": case "ERROR": return "failure";
    case "PENDING": case "EXPECTED": return "pending";
    case "NEUTRAL": case "SKIPPED": case "STALE": return "neutral";
    default: return "unknown";
  }
}

function selectCurrentBranchPullRequests(
  pullRequests: GitHubPullRequestAssociation[], headSha: string | null, repository: GitHubRepository
): GitHubPullRequestAssociation[] {
  if (!headSha) return [];
  let candidates = pullRequests.filter((pullRequest) => pullRequest.headSha === headSha);
  const open = candidates.filter((pullRequest) => pullRequest.state === "open");
  if (open.length) candidates = open;
  if (candidates.length > 1) {
    const origin = candidates.filter((pullRequest) => pullRequest.headRepositoryFullName?.toLowerCase() === repository.fullName.toLowerCase());
    if (origin.length) candidates = origin;
  }
  return candidates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function getFirstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function mapWorkflowRun(run: GitHubApiWorkflowRun, repository: GitHubRepository): GitHubWorkflowRun | null {
  const id = run.id === undefined || run.id === null ? "" : String(run.id);
  if (!/^\d+$/.test(id)) return null;
  const name = normalizeText(run.name, "Unnamed workflow");
  const commitMessage = getFirstLine(run.head_commit?.message ?? "");
  return {
    id,
    name,
    displayTitle: normalizeText(run.display_title, commitMessage || name),
    runNumber: Number.isFinite(run.run_number) ? Number(run.run_number) : null,
    attempt: Math.max(1, finiteNumber(run.run_attempt, 1)),
    status: normalizeText(run.status, "unknown").toLowerCase(),
    conclusion: run.conclusion?.trim().toLowerCase() || null,
    branch: normalizeText(run.head_branch, "-"),
    event: normalizeText(run.event, "-"),
    actor: mapUser(run.actor),
    commitSha: normalizeText(run.head_sha, ""),
    commitMessage,
    url: normalizeText(run.html_url, `${repository.webUrl}/actions/runs/${id}`),
    createdAt: normalizeText(run.created_at, ""),
    startedAt: normalizeText(run.run_started_at, ""),
    updatedAt: normalizeText(run.updated_at, "")
  };
}

function mapWorkflowJob(value: unknown): GitHubWorkflowJob | null {
  const job = asRecord(value);
  if (!job) return null;
  const id = job?.id === undefined || job.id === null ? "" : String(job.id);
  if (!/^\d+$/.test(id)) return null;
  const steps = asArray(job?.steps).flatMap((value) => {
    const step = asRecord(value);
    const number = finiteNumber(step?.number, 0);
    if (!step || number < 1) return [];
    return [{
      number,
      name: normalizeText(stringValue(step.name), `Step ${number}`),
      status: normalizeText(stringValue(step.status), "unknown").toLowerCase(),
      conclusion: stringValue(step.conclusion)?.trim().toLowerCase() || null,
      startedAt: normalizeText(stringValue(step.started_at), ""),
      completedAt: normalizeText(stringValue(step.completed_at), "")
    }];
  });
  return {
    id,
    name: normalizeText(stringValue(job.name), "Unnamed job"),
    status: normalizeText(stringValue(job.status), "unknown").toLowerCase(),
    conclusion: stringValue(job.conclusion)?.trim().toLowerCase() || null,
    url: normalizeText(stringValue(job.html_url), ""),
    startedAt: normalizeText(stringValue(job.started_at), ""),
    completedAt: normalizeText(stringValue(job.completed_at), ""),
    runnerName: normalizeText(stringValue(job.runner_name), ""),
    labels: asArray(job.labels).flatMap((label) => typeof label === "string" && label.trim() ? [label.trim()] : []),
    steps
  };
}

function normalizeLabels(labels: Array<string | { name?: string | null }>): string[] {
  return labels.flatMap((label) => {
    if (typeof label === "string") {
      return label.trim() ? [label.trim()] : [];
    }

    const name = label.name?.trim();
    return name ? [name] : [];
  });
}

function sumCounts(...values: Array<number | null | undefined>): number {
  let total = 0;

  for (const value of values) {
    if (Number.isFinite(value)) {
      total += Number(value);
    }
  }

  return total;
}

function validateItemNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("GitHub item number must be a positive safe integer.");
  return value;
}

function validateWorkflowRunId(value: string): string {
  const id = value.trim();
  if (!/^[1-9]\d*$/.test(id)) throw new Error("GitHub workflow run ID must be a positive integer.");
  return id;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function mapUser(value: unknown): GitHubPullRequestDetail["author"] {
  const user = asRecord(value);
  return {
    login: normalizeText(stringValue(user?.login), "-"),
    avatarUrl: normalizeText(stringValue(user?.avatar_url), ""),
    url: normalizeText(stringValue(user?.html_url), "")
  };
}

function mapComment(value: unknown, kind: "issue" | "review"): GitHubPullRequestDetail["comments"][number] {
  const comment = asRecord(value);
  return {
    id: String(comment?.id ?? ""),
    kind,
    author: mapUser(comment?.user),
    body: stringValue(comment?.body) ?? "",
    createdAt: normalizeText(stringValue(comment?.created_at), ""),
    updatedAt: normalizeText(stringValue(comment?.updated_at), ""),
    url: normalizeText(stringValue(comment?.html_url), ""),
    path: stringValue(comment?.path)?.trim() || null,
    line: Number.isFinite(comment?.line) ? Number(comment?.line) : null,
    side: stringValue(comment?.side)?.trim() || null,
    diffHunk: stringValue(comment?.diff_hunk)?.trim() || null
  };
}

function mapReview(value: unknown): GitHubPullRequestDetail["reviews"][number] {
  const review = asRecord(value);
  return {
    id: String(review?.id ?? ""),
    author: mapUser(review?.user),
    state: normalizeText(stringValue(review?.state), "commented").toLowerCase(),
    body: stringValue(review?.body) ?? "",
    submittedAt: normalizeText(stringValue(review?.submitted_at), ""),
    url: normalizeText(stringValue(review?.html_url), "")
  };
}

function mapPullRequestFile(value: unknown): GitHubPullRequestDetail["files"][number] {
  const file = asRecord(value);
  return {
    path: normalizeText(stringValue(file?.filename), "Unknown file"),
    previousPath: stringValue(file?.previous_filename)?.trim() || null,
    status: normalizeText(stringValue(file?.status), "modified").toLowerCase(),
    additions: finiteNumber(file?.additions, 0),
    deletions: finiteNumber(file?.deletions, 0),
    patch: stringValue(file?.patch) ?? "",
    url: normalizeText(stringValue(file?.blob_url), "")
  };
}

function mapChecks(value: unknown): GitHubPullRequestDetail["checks"] {
  const response = asRecord(value);
  return asArray(response?.check_runs).map((entry) => {
    const check = asRecord(entry);
    return {
      id: String(check?.id ?? ""),
      name: normalizeText(stringValue(check?.name), "Unnamed check"),
      status: normalizeText(stringValue(check?.status), "unknown").toLowerCase(),
      conclusion: stringValue(check?.conclusion)?.trim().toLowerCase() || null,
      detailsUrl: normalizeText(stringValue(check?.details_url), stringValue(check?.html_url) ?? ""),
      startedAt: normalizeText(stringValue(check?.started_at), ""),
      completedAt: normalizeText(stringValue(check?.completed_at), "")
    };
  });
}

function mapPullRequestCommit(value: unknown): GitHubPullRequestDetail["commits"][number] {
  const entry = asRecord(value);
  const commit = asRecord(entry?.commit);
  const author = asRecord(commit?.author);
  const sha = normalizeText(stringValue(entry?.sha), "");
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: getFirstLine(stringValue(commit?.message) ?? ""),
    author: normalizeText(stringValue(author?.name), normalizeText(stringValue(asRecord(entry?.author)?.login), "-")),
    authoredAt: normalizeText(stringValue(author?.date), ""),
    url: normalizeText(stringValue(entry?.html_url), "")
  };
}

function mapLabel(value: unknown): GitHubIssueDetail["labels"] {
  if (typeof value === "string") return value.trim() ? [{ name: value.trim(), color: "" }] : [];
  const label = asRecord(value);
  const name = stringValue(label?.name)?.trim();
  return name ? [{ name, color: normalizeText(stringValue(label?.color), "") }] : [];
}

function mapMilestone(value: unknown): GitHubIssueDetail["milestone"] {
  const milestone = asRecord(value);
  if (!milestone || !Number.isSafeInteger(milestone.number)) return null;
  return {
    number: Number(milestone.number),
    title: normalizeText(stringValue(milestone.title), "Untitled milestone"),
    url: normalizeText(stringValue(milestone.html_url), "")
  };
}

function mapLinkedPullRequests(value: unknown): GitHubIssueDetail["linkedPullRequests"] {
  const linked = new Map<number, GitHubIssueDetail["linkedPullRequests"][number]>();
  for (const entry of asArray(value)) {
    const event = asRecord(entry);
    const source = asRecord(event?.source);
    const issue = asRecord(source?.issue);
    if (!issue || !isRecord(issue.pull_request) || !Number.isSafeInteger(issue.number)) continue;
    const number = Number(issue.number);
    linked.set(number, {
      number,
      title: normalizeText(stringValue(issue.title), `Pull request #${number}`),
      state: normalizeText(stringValue(issue.state), "unknown").toLowerCase(),
      url: normalizeText(stringValue(issue.html_url), "")
    });
  }
  return [...linked.values()];
}

function getReviewStatus(
  reviews: GitHubPullRequestDetail["reviews"],
  requestedReviewerCount: number
): GitHubPullRequestDetail["reviewStatus"] {
  const latestByReviewer = new Map<string, GitHubPullRequestDetail["reviews"][number]>();
  for (const review of reviews) {
    const login = review.author.login.toLowerCase();
    const previous = latestByReviewer.get(login);
    if (!previous || previous.submittedAt <= review.submittedAt) latestByReviewer.set(login, review);
  }
  const states = [...latestByReviewer.values()].map((review) => review.state);
  if (states.includes("changes_requested")) return "changesRequested";
  if (states.includes("approved")) return "approved";
  return requestedReviewerCount > 0 ? "reviewRequired" : "none";
}

function getMergeStatus(
  displayState: GitHubPullRequestDetail["displayState"],
  mergeable: boolean | null,
  mergeableState: string,
  reviewStatus: GitHubPullRequestDetail["reviewStatus"],
  checks: GitHubPullRequestDetail["checks"]
): GitHubPullRequestDetail["mergeStatus"] {
  if (displayState === "merged") return "merged";
  if (displayState === "closed") return "closed";
  if (displayState === "draft") return "draft";
  if (mergeable === null) return "checking";
  if (!mergeable || mergeableState === "dirty") return "conflicting";
  const failedCheck = checks.some((check) => check.status === "completed" && check.conclusion !== null && !["success", "neutral", "skipped"].includes(check.conclusion));
  const activeCheck = checks.some((check) => check.status !== "completed");
  if (failedCheck || activeCheck || reviewStatus === "changesRequested" || ["blocked", "behind", "draft"].includes(mergeableState)) return "blocked";
  return "ready";
}

function classifyError(error: unknown, source: GitHubFailure["source"], mutation: boolean): GitHubFailure {
  const message = error instanceof Error ? error.message : "An unexpected GitHub error occurred.";
  const lower = message.toLowerCase();
  const httpError = error instanceof GitHubHttpError ? error : null;
  const cancelled = lower.includes("abort") || lower.includes("cancel");
  const timeout = lower.includes("timed out") || lower.includes("timeout");
  const authentication = httpError?.status === 401 || /\b401\b|authenticate|auth login|bad credentials/.test(lower);
  const rateLimited = httpError?.status === 429 || httpError?.headers.get("x-ratelimit-remaining") === "0" || /rate.?limit|\b429\b/.test(lower);
  const authorization = !authentication && (httpError?.status === 403 || /\b403\b|permission|forbidden/.test(lower));
  const notFound = httpError?.status === 404 || /\b404\b|could not find/.test(lower);
  const validation = httpError?.status === 422 || /\b422\b|validation/.test(lower);
  const offline = /enotfound|econnreset|network|fetch failed|offline/.test(lower);
  const transient = (httpError !== null && [408, 502, 503, 504].includes(httpError.status)) || /\b(408|502|503|504)\b|temporar/.test(lower);
  const responseAmbiguous = error instanceof GitHubResponseBodyError || error instanceof GitHubMutationResponseError;
  const outcomeUnknown = mutation && (cancelled || timeout || offline || transient || responseAmbiguous || lower.includes("outcome is unknown"));
  const kind: GitHubFailure["kind"] = cancelled ? "cancelled" : timeout ? "timeout" : rateLimited ? "rateLimited"
    : authentication ? "authentication" : authorization ? "authorization" : notFound ? "notFound"
    : validation ? "validation" : offline ? "offline" : transient ? "transient" : "unexpected";
  const failure: GitHubFailure = {
    kind,
    message: authorization && httpError?.headers.get("x-accepted-github-permissions")
      ? `${message} Required GitHub App permission: ${httpError.headers.get("x-accepted-github-permissions")}.`
      : message,
    missingPermission: authorization ? httpError?.headers.get("x-accepted-github-permissions") ?? null : null,
    retryable: !mutation && (timeout || offline || transient || rateLimited),
    retryAfterAt: getRetryAfterAt(httpError),
    outcomeUnknown,
    source,
    rateLimit: getRateLimit(httpError)
  };
  reportGitHubFailure(mutation ? "mutation" : "read", failure);
  return failure;
}

function getRateLimit(error: GitHubHttpError | null): GitHubFailure["rateLimit"] {
  if (!error) return null;
  const limit = parseHeaderNumber(error.headers.get("x-ratelimit-limit"));
  const remaining = parseHeaderNumber(error.headers.get("x-ratelimit-remaining"));
  const reset = parseHeaderNumber(error.headers.get("x-ratelimit-reset"));
  const resource = error.headers.get("x-ratelimit-resource")?.trim() || null;
  if (limit === null && remaining === null && reset === null && resource === null) return null;
  return { limit, remaining, resetAt: reset === null ? null : new Date(reset * 1_000).toISOString(), resource };
}

function getRetryAfterAt(error: GitHubHttpError | null): string | null {
  if (!error) return null;
  const value = error.headers.get("retry-after")?.trim();
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return new Date(Date.now() + seconds * 1_000).toISOString();
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return getRateLimit(error)?.resetAt ?? null;
}

function parseHeaderNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
