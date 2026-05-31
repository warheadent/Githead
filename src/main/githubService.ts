import type {
  GitHubIssue,
  GitHubPullRequest,
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

  async getWorkflowRuns(request: GitHubRepositoryRequest): Promise<GitHubWorkflowRun[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiWorkflowRunsResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/actions/runs?per_page=${WORKFLOW_RUN_LIMIT}`
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

  async getIssues(request: GitHubRepositoryRequest): Promise<GitHubIssue[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiIssuesResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/issues?state=open&per_page=${ISSUE_LIMIT}`
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

  async getPullRequests(request: GitHubRepositoryRequest): Promise<GitHubPullRequest[]> {
    const repository = await this.getRepository(request.repoPath);
    const response = await this.fetchJson<GitHubApiPullRequestsResponse>(
      repository,
      `/repos/${encodePath(repository.owner)}/${encodePath(repository.name)}/pulls?state=open&per_page=${PULL_REQUEST_LIMIT}`
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

  private async getRepository(repoPath: string): Promise<GitHubRepository> {
    const repository = await this.repositoryProvider.getGitHubRepository(repoPath);
    if (!repository) {
      throw new Error("Selected repository does not have a supported GitHub origin.");
    }

    return repository;
  }

  private async fetchJson<T>(
    repository: GitHubRepository,
    path: string
  ): Promise<T> {
    const ghResult = await this.fetchJsonWithGitHubCli<T>(path);
    if (ghResult.kind === "success") {
      return ghResult.payload;
    }

    const response = await this.fetchImpl(`${GITHUB_API_BASE_URL}${path}`, {
      headers: createGitHubHeaders()
    });
    const payload = await parseJson<T & GitHubApiErrorResponse>(response);

    if (!response.ok) {
      throw new Error(createGitHubRequestError(repository, response.status, payload.message, ghResult.error));
    }

    return payload as T;
  }

  private async fetchJsonWithGitHubCli<T>(path: string): Promise<
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

    const result = await this.runner.run("gh", [
      "api",
      "--method",
      "GET",
      path,
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`
    ]);
    const error = `${result.stderr}${result.error ?? ""}`.trim();

    if (result.exitCode !== 0) {
      return {
        kind: result.exitCode === -1 ? "unavailable" : "failed",
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
  message: string | undefined,
  cliError: string
): string {
  if (status === 404) {
    return [
      `GitHub could not find ${repository.fullName}.`,
      "If this repository is private, authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then refresh."
    ].join(" ");
  }

  const baseMessage = message || `GitHub request for ${repository.fullName} failed with status ${status}.`;
  return cliError ? `${baseMessage} GitHub CLI fallback also failed: ${cliError}` : baseMessage;
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
