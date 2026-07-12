import type {
  CreatePullRequestRequest,
  CreatePullRequestResult,
  GitHubIssue,
  GitHubOpenCounts,
  GitHubPullRequest,
  GitHubFailure,
  GitHubOperationResult,
  GitHubRepository,
  GitHubRepositoryRequest,
  GitHubWorkflowRun
} from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const WORKFLOW_RUN_LIMIT = 30;
const ISSUE_LIMIT = 50;
const PULL_REQUEST_LIMIT = 50;

type Fetch = typeof fetch;

interface GitHubRepositoryProvider {
  getGitHubRepository(repoPath: string): Promise<GitHubRepository | null>;
}

interface GitHubApiErrorResponse {
  message?: string;
  errors?: Array<string | {
    message?: string;
  }>;
}

interface GitHubRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

interface GitHubApiWorkflowRunsResponse extends GitHubApiErrorResponse {
  workflow_runs?: GitHubApiWorkflowRun[];
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

interface GitHubApiIssuesResponse extends Array<GitHubApiIssue> {}

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

export class GitHubService {
  constructor(
    private readonly repositoryProvider: GitHubRepositoryProvider,
    private readonly fetchImpl: Fetch = fetch,
    private readonly runner?: ProcessRunner
  ) {}

  async getWorkflowRuns(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubWorkflowRun[]>> {
    return this.read(() => this.getWorkflowRunsData(request, signal));
  }
  async getOpenCounts(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubOpenCounts>> {
    return this.read(() => this.getOpenCountsData(request, signal));
  }
  async getIssues(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubIssue[]>> {
    return this.read(() => this.getIssuesData(request, signal));
  }
  async getPullRequests(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOperationResult<GitHubPullRequest[]>> {
    return this.read(() => this.getPullRequestsData(request, signal));
  }
  async createPullRequest(request: CreatePullRequestRequest): Promise<GitHubOperationResult<CreatePullRequestResult>> {
    try { return { ok: true, data: await this.createPullRequestData(request), rateLimit: null }; }
    catch (error) { return { ok: false, error: classifyError(error, "combined", true) }; }
  }

  private async read<T>(operation: () => Promise<T>): Promise<GitHubOperationResult<T>> {
    try { return { ok: true, data: await operation(), rateLimit: null }; }
    catch (error) { return { ok: false, error: classifyError(error, "combined", false) }; }
  }

  private async getWorkflowRunsData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubWorkflowRun[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiWorkflowRunsResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/actions/runs?per_page=${WORKFLOW_RUN_LIMIT}`, {}, signal
    );

    return (response.workflow_runs ?? []).flatMap((run) => {
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
  }

  private async getOpenCountsData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubOpenCounts> {
    const repository = await this.getRepository(request.repoPath);
    const [issues, pullRequests] = await Promise.all([
      this.getSearchCount(repository, `repo:${repository.fullName} is:open is:issue`, signal),
      this.getSearchCount(repository, `repo:${repository.fullName} is:open is:pr`, signal)
    ]);

    return {
      issues,
      pullRequests
    };
  }

  private async getIssuesData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubIssue[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiIssuesResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/issues?state=open&per_page=${ISSUE_LIMIT}`, {}, signal
    );

    return response.flatMap((issue) => {
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
  }

  private async getPullRequestsData(request: GitHubRepositoryRequest, signal?: AbortSignal): Promise<GitHubPullRequest[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiPullRequestsResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls?state=open&per_page=${PULL_REQUEST_LIMIT}`, {}, signal
    );

    return response.flatMap((pullRequest) => {
      if (!Number.isFinite(pullRequest.number)) {
        return [];
      }

      return [
        {
          number: Number(pullRequest.number),
          title: normalizeText(pullRequest.title, "(no title)"),
          state: normalizeText(pullRequest.state, "open"),
          authorLogin: normalizeText(pullRequest.user?.login, "-"),
          sourceBranch: normalizeText(pullRequest.head?.ref, "-"),
          targetBranch: normalizeText(pullRequest.base?.ref, "-"),
          labels: normalizeLabels(pullRequest.labels ?? []),
          comments: sumCounts(pullRequest.comments, pullRequest.review_comments),
          draft: pullRequest.draft === true,
          updatedAt: normalizeText(pullRequest.updated_at, ""),
          url: normalizeText(pullRequest.html_url, repository.webUrl)
        }
      ];
    });
  }

  private async createPullRequestData(request: CreatePullRequestRequest): Promise<CreatePullRequestResult> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiPullRequest>(
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
    const response = await this.fetchJson<GitHubApiSearchResponse>(
      repository,
      `/search/issues?q=${encodeURIComponent(query)}&per_page=1`, {}, signal
    );

    return Number.isFinite(response.total_count) ? Number(response.total_count) : 0;
  }

  private async fetchJson<T>(
    repository: GitHubRepository,
    path: string,
    options: GitHubRequestOptions = {},
    signal?: AbortSignal
  ): Promise<T> {
    const ghResult = await this.fetchJsonWithGitHubCli<T>(path, options, signal);
    if (ghResult.kind === "success") {
      return ghResult.payload;
    }
    if (signal?.aborted) {
      throw new Error("GitHub request was cancelled.");
    }
    if (options.method === "POST" && ghResult.kind === "failed") {
      throw new Error(`${ghResult.error} The pull request outcome is unknown; check GitHub before retrying.`);
    }

    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("GitHub REST request timed out.")), options.method === "POST" ? 20_000 : 10_000);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    let response: Response;
    try { response = await this.fetchImpl(`${GITHUB_API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...createGitHubHeaders(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body })
      , signal: controller.signal
    }); } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
    const payload = await parseJson<T & GitHubApiErrorResponse>(response);

    if (!response.ok) {
      throw new Error(createGitHubRequestError(repository, response.status, payload, ghResult.error));
    }

    return payload as T;
  }

  private async fetchJsonWithGitHubCli<T>(path: string, options: GitHubRequestOptions = {}, signal?: AbortSignal): Promise<
    | { kind: "success"; payload: T }
    | { kind: "unavailable"; error: string }
    | { kind: "failed"; error: string }
  > {
    if (!this.runner) {
      return {
        kind: "unavailable",
        error: ""
      };
    }

    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const result = await this.runner.run("gh", [
      "api",
      "--method",
      options.method ?? "GET",
      path,
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
      ...(body === undefined ? [] : ["--input", "-"])
    ], { ...(body === undefined ? {} : { stdin: body }), timeoutMs: options.method === "POST" ? 20_000 : 10_000, ...(signal ? { signal } : {}) });
    const error = `${result.stderr}${result.error ?? ""}`.trim();

    if (result.exitCode !== 0) {
      return {
        kind: result.terminationReason === "spawnFailed" ? "unavailable" : "failed",
        error: error || result.stdout.trim() || "GitHub CLI request failed."
      };
    }

    try {
      return {
        kind: "success",
        payload: JSON.parse(result.stdout) as T
      };
    } catch {
      return {
        kind: "failed",
        error: "GitHub CLI returned invalid JSON."
      };
    }
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function createGitHubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  return {
    "Accept": "application/vnd.github+json",
    "User-Agent": "Githead",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
}

function createGitHubRequestError(
  repository: GitHubRepository,
  status: number,
  payload: GitHubApiErrorResponse,
  cliError: string
): string {
  if (status === 404) {
    return [
      `GitHub could not find ${repository.fullName}.`,
      "If this repository is private, authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then refresh."
    ].join(" ");
  }

  if (status === 401 || status === 403) {
    return [
      payload.message?.trim() || `GitHub rejected the request for ${repository.fullName} with status ${status}.`,
      "Authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then try again."
    ].join(" ");
  }

  const details = getErrorDetails(payload);
  const baseMessage = [payload.message?.trim(), details]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    || `GitHub request for ${repository.fullName} failed with status ${status}.`;
  return cliError ? `${baseMessage} GitHub CLI fallback also failed: ${cliError}` : baseMessage;
}

function getErrorDetails(payload: GitHubApiErrorResponse): string {
  return (payload.errors ?? [])
    .map((error) => (typeof error === "string" ? error : error.message ?? "").trim())
    .filter((message) => message.length > 0)
    .join(" ");
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
