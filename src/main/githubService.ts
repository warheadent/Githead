import type {
  CreatePullRequestRequest,
  CreatePullRequestResult,
  GitHubIssue,
  GitHubIssuesRequest,
  GitHubHistoryInsights,
  GitHubHistoryInsightsRequest,
  GitHubCommitAssociation,
  GitHubPullRequestAssociation,
  GitHubCheckState,
  GitHubOpenCounts,
  GitHubPullRequest,
  GitHubPullRequestsRequest,
  GitHubFailure,
  GitHubOperationResult,
  GitHubPage,
  GitHubRepository,
  GitHubRepositoryRequest,
  GitHubWorkflowRun
  ,GitHubWorkflowRunsRequest,
  GitHubViewer
} from "../shared/types";
import type { GitHubClient } from "./githubClient";
import { buildIssueSearchPath, buildPullRequestSearchPath, buildWorkflowRunsPath, hasPullRequestSearchFilters } from "./githubQuery";

const WORKFLOW_RUN_LIMIT = 30;
const ISSUE_LIMIT = 50;
const PULL_REQUEST_LIMIT = 50;
const OBSERVED_COUNT_MAX_AGE_MS = 30_000;
const HISTORY_INSIGHTS_BATCH_SIZE = 20;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

interface GitHubRepositoryProvider {
  getGitHubRepository(repoPath: string): Promise<GitHubRepository | null>;
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
  run_number?: number | null;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  event?: string | null;
  head_sha?: string | null;
  html_url?: string | null;
  run_started_at?: string | null;
  updated_at?: string | null;
  head_commit?: {
    message?: string | null;
  } | null;
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

interface GitHubApiPullRequest {
  number?: number;
  title?: string | null;
  state?: string | null;
  user?: {
    login?: string | null;
  } | null;
  head?: {
    ref?: string | null;
  } | null;
  base?: {
    ref?: string | null;
  } | null;
  labels?: Array<string | {
    name?: string | null;
  }>;
  comments?: number | null;
  review_comments?: number | null;
  draft?: boolean | null;
  updated_at?: string | null;
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
    private readonly client: GitHubClient,
    private readonly now: () => number = Date.now
  ) {}

  async getWorkflowRuns(request: GitHubWorkflowRunsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPage<GitHubWorkflowRun>>> {
    return this.read(() => this.getWorkflowRunsData(request, signal));
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
  async getPullRequests(request: GitHubPullRequestsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPage<GitHubPullRequest>>> {
    return this.read(() => this.getPullRequestsData(request, signal));
  }
  async getHistoryInsights(request: GitHubHistoryInsightsRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubHistoryInsights>> {
    return this.read(() => this.getHistoryInsightsData(request, signal));
  }
  async createPullRequest(request: CreatePullRequestRequest): Promise<GitHubOperationResult<CreatePullRequestResult>> {
    try { return { ok: true, data: await this.createPullRequestData(request), rateLimit: null }; }
    catch (error) { return { ok: false, error: classifyError(error, "combined", true) }; }
  }

  private async read<T>(operation: () => Promise<T>): Promise<GitHubOperationResult<T>> {
    try { return { ok: true, data: await operation(), rateLimit: null }; }
    catch (error) { return { ok: false, error: classifyError(error, "combined", false) }; }
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
      const id = run.id === undefined || run.id === null ? "" : String(run.id);
      if (!id) {
        return [];
      }

      return [
        {
          id,
          name: normalizeText(run.name, "Unnamed workflow"),
          runNumber: Number.isFinite(run.run_number) ? Number(run.run_number) : null,
          status: normalizeText(run.status, "unknown"),
          conclusion: run.conclusion?.trim() || null,
          branch: normalizeText(run.head_branch, "-"),
          event: normalizeText(run.event, "-"),
          commitSha: normalizeText(run.head_sha, ""),
          commitMessage: getFirstLine(run.head_commit?.message ?? ""),
          url: normalizeText(run.html_url, repository.webUrl),
          startedAt: normalizeText(run.run_started_at, ""),
          updatedAt: normalizeText(run.updated_at, "")
        }
      ];
    });
    return { items, page, nextPage: getNextPage(headers, page, rawItems.length, WORKFLOW_RUN_LIMIT), totalCount: Number.isFinite(response.total_count) ? Number(response.total_count) : null };
  }

  private async getOpenCountsData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOpenCounts> {
    const repository = await this.getRepository(request.repoPath);
    const observed = this.observedOpenCounts.get(normalizeRepository(repository));
    const issues = this.isFresh(observed?.issues)
      ? observed.issues.value
      : this.getSearchCount(repository, `repo:${repository.fullName} is:open is:issue`, signal);
    const pullRequests = this.isFresh(observed?.pullRequests)
      ? observed.pullRequests.value
      : this.getSearchCount(repository, `repo:${repository.fullName} is:open is:pr`, signal);
    const [resolvedIssues, resolvedPullRequests] = await Promise.all([issues, pullRequests]);

    return {
      issues: resolvedIssues,
      pullRequests: resolvedPullRequests
    };
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

  private async createPullRequestData(request: CreatePullRequestRequest): Promise<CreatePullRequestResult> {
    const repository = await this.getRepository(request.repoPath);
    const { payload: response } = await this.client.requestJson<GitHubApiPullRequest>(
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
        }
      }
    );

    if (!Number.isFinite(response.number)) {
      throw new Error("GitHub returned an unexpected response while creating the pull request.");
    }

    this.client.invalidateRepository(repository);
    this.clearObservedCount(repository, "pullRequests");
    return {
      number: Number(response.number),
      url: normalizeText(response.html_url, repository.webUrl),
      title: normalizeText(response.title, request.title),
      draft: response.draft === true
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

function classifyError(error: unknown, source: GitHubFailure["source"], mutation: boolean): GitHubFailure {
  const message = error instanceof Error ? error.message : "An unexpected GitHub error occurred.";
  const lower = message.toLowerCase();
  const cancelled = lower.includes("abort") || lower.includes("cancel");
  const timeout = lower.includes("timed out") || lower.includes("timeout");
  const authentication = /\b401\b|authenticate|auth login|bad credentials/.test(lower);
  const authorization = !authentication && (/\b403\b|permission|forbidden/.test(lower));
  const rateLimited = /rate.?limit|\b429\b/.test(lower);
  const notFound = /\b404\b|could not find/.test(lower);
  const validation = /\b422\b|validation/.test(lower);
  const offline = /enotfound|econnreset|network|fetch failed|offline/.test(lower);
  const transient = /\b(408|502|503|504)\b|temporar/.test(lower);
  const outcomeUnknown = mutation && (cancelled || timeout || offline || transient || lower.includes("outcome is unknown"));
  const kind: GitHubFailure["kind"] = cancelled ? "cancelled" : timeout ? "timeout" : rateLimited ? "rateLimited"
    : authentication ? "authentication" : authorization ? "authorization" : notFound ? "notFound"
    : validation ? "validation" : offline ? "offline" : transient ? "transient" : "unexpected";
  return {
    kind,
    message,
    retryable: !mutation && (timeout || offline || transient),
    retryAfterAt: null,
    outcomeUnknown,
    source,
    rateLimit: null
  };
}
