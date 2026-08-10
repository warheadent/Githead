import { describe, expect, it, vi } from "vite-plus/test";
import type { GitHubRepository } from "../shared/types";
import { DefaultGitHubClient, GitHubHttpError, type GitHubApiClient, type GitHubClientRequest, type GitHubClientResponse } from "./githubClient";
import { GitHubService } from "./githubService";

const repository: GitHubRepository = {
  owner: "openai", name: "githead", fullName: "openai/githead", webUrl: "https://github.com/openai/githead"
};

describe("GitHubService", () => {
  it("uses Link metadata and workflow totals for explicit pages", async () => {
    const client = new FakeClient([{ payload: { total_count: 248, workflow_runs: [] }, headers: { Link: '<https://api.github.com/repos/openai/githead/actions/runs?per_page=30&page=3>; rel="last", <https://api.github.com/repos/openai/githead/actions/runs?page=2&per_page=30>; rel="NEXT"' } }]);
    const result = await new GitHubService(provider(repository), client).getWorkflowRuns({ repoPath: "D:\\Repo", page: 1 });
    expect(result).toMatchObject({ ok: true, data: { page: 1, nextPage: 2, totalCount: 248 } });
  });

  it("uses search totals for issue pagination", async () => {
    const raw = Array.from({ length: 50 }, (_, number) => ({ number: number + 1 }));
    const result = await new GitHubService(provider(repository), new FakeClient([{ items: raw, total_count: 150 }])).getIssues({ repoPath: "D:\\Repo", page: 2 });
    expect(result).toMatchObject({ ok: true, data: { page: 2, nextPage: 3, totalCount: 150 } });
  });

  it("rejects invalid pages before transport", async () => {
    const client = new FakeClient([]);
    const result = await new GitHubService(provider(repository), client).getPullRequests({ repoPath: "D:\\Repo", page: 0 });
    expect(result).toMatchObject({ ok: false, error: { kind: "unexpected", message: "GitHub page must be a positive safe integer." } });
    expect(client.calls).toHaveLength(0);
  });

  it("normalizes workflow runs and preserves the endpoint", async () => {
    const client = new FakeClient([{ workflow_runs: [{
      id: 123, name: "CI", display_title: "Release validation", run_number: 42, run_attempt: 2, status: "completed", conclusion: "success", head_branch: "main",
      event: "push", head_sha: "abcdef", html_url: "https://github.com/openai/githead/actions/runs/123",
      created_at: "created", run_started_at: "start", updated_at: "end", actor: { login: "taylor", avatar_url: "avatar", html_url: "actor-url" }, head_commit: { message: "feat: test\n\nbody" }
    }] }]);
    const result = await new GitHubService(provider(repository), client).getWorkflowRuns({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { items: [{
      id: "123", name: "CI", displayTitle: "Release validation", runNumber: 42, attempt: 2, status: "completed", conclusion: "success", branch: "main",
      event: "push", actor: { login: "taylor", avatarUrl: "avatar", url: "actor-url" }, commitSha: "abcdef", commitMessage: "feat: test", url: "https://github.com/openai/githead/actions/runs/123", createdAt: "created",
      startedAt: "start", updatedAt: "end"
    }], page: 1, nextPage: null, totalCount: null } });
    expect(client.calls[0]?.path).toBe("/repos/openai/githead/actions/runs?per_page=30&page=1");
  });

  it("loads workflow run jobs and maps their steps", async () => {
    const client = new FakeClient([
      {
        id: 123, name: "CI", display_title: "Validate release", run_number: 42, run_attempt: 1,
        status: "completed", conclusion: "failure", head_branch: "release", event: "workflow_dispatch", head_sha: "abcdef",
        html_url: "run-url", created_at: "created", run_started_at: "started", updated_at: "updated",
        actor: { login: "taylor" }, head_commit: { message: "release" }
      },
      {
        total_count: 1,
        jobs: [{
          id: 91, name: "linux", status: "completed", conclusion: "failure", html_url: "job-url",
          started_at: "job-started", completed_at: "job-completed", runner_name: "runner", labels: ["ubuntu-latest"],
          steps: [{ number: 1, name: "Test", status: "completed", conclusion: "failure", started_at: "step-started", completed_at: "step-completed" }]
        }]
      }
    ]);

    const result = await new GitHubService(provider(repository), client).getWorkflowRunDetail({ repoPath: "D:\\Repo", runId: "123" });

    expect(result).toMatchObject({ ok: true, data: {
      id: "123",
      displayTitle: "Validate release",
      actor: { login: "taylor" },
      jobCount: 1,
      jobs: [{ id: "91", name: "linux", runnerName: "runner", labels: ["ubuntu-latest"], steps: [{ number: 1, name: "Test", conclusion: "failure" }] }]
    } });
    expect(client.calls.map((call) => call.path)).toEqual([
      "/repos/openai/githead/actions/runs/123",
      "/repos/openai/githead/actions/runs/123/jobs?filter=all&per_page=100"
    ]);
  });

  it("uses supported workflow mutation endpoints and invalidates repository data", async () => {
    const client = new FakeClient([null, null]);
    const service = new GitHubService(provider(repository), client);

    await expect(service.rerunWorkflowRun({ repoPath: "D:\\Repo", runId: "123" })).resolves.toMatchObject({ ok: true, data: { runId: "123", message: "Workflow re-run requested." } });
    await expect(service.cancelWorkflowRun({ repoPath: "D:\\Repo", runId: "123" })).resolves.toMatchObject({ ok: true, data: { runId: "123", message: "Workflow cancellation requested." } });
    expect(client.calls.map((call) => [call.path, call.request?.method])).toEqual([
      ["/repos/openai/githead/actions/runs/123/rerun", "POST"],
      ["/repos/openai/githead/actions/runs/123/cancel", "POST"]
    ]);
    expect(client.invalidated).toEqual([repository, repository]);
  });

  it("rejects invalid workflow run IDs before transport", async () => {
    const client = new FakeClient([]);
    const result = await new GitHubService(provider(repository), client).getWorkflowRunDetail({ repoPath: "D:\\Repo", runId: "run-1" });
    expect(result).toMatchObject({ ok: false, error: { message: "GitHub workflow run ID must be a positive integer." } });
    expect(client.calls).toHaveLength(0);
  });

  it("normalizes issues and excludes pull requests", async () => {
    const client = new FakeClient([{ items: [
      { number: 7, title: "Issue", state: "open", user: { login: "taylor" }, labels: [{ name: "bug" }], comments: 3, updated_at: "now", html_url: "issue-url" },
      { number: 8, title: "PR", pull_request: {} }
    ], total_count: 1 }]);
    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { items: [{
      number: 7, title: "Issue", state: "open", authorLogin: "taylor", labels: ["bug"], comments: 3, updatedAt: "now", url: "issue-url"
    }], page: 1, nextPage: null, totalCount: 1 } });
  });

  it("normalizes pull requests and sums comment counts", async () => {
    const client = new FakeClient([[{ number: 11, title: "PR", state: "open", user: { login: "taylor" }, head: { ref: "feature", repo: { full_name: "openai/githead" } }, base: { ref: "main" }, labels: ["ui"], comments: 2, review_comments: 5, draft: true, updated_at: "now", html_url: "pr-url" }]]);
    const result = await new GitHubService(provider(repository), client).getPullRequests({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { items: [{ number: 11, title: "PR", state: "open", authorLogin: "taylor", sourceBranch: "feature", sourceRepositoryFullName: "openai/githead", targetBranch: "main", labels: ["ui"], comments: 7, draft: true, updatedAt: "now", url: "pr-url" }], page: 1, nextPage: null, totalCount: null } });
  });

  it("maps pull request detail resources into the dedicated model", async () => {
    const client = new FakeClient([
      {
        number: 24, title: "Review console", state: "open", body: "Description", user: { login: "taylor", avatar_url: "avatar", html_url: "author-url" },
        created_at: "created", updated_at: "updated", html_url: "pr-url", draft: false, merged_at: null, mergeable: true, mergeable_state: "clean", commits: 2,
        additions: 18, deletions: 7,
        head: { ref: "feature/review", sha: "a".repeat(40), repo: { full_name: "fork/githead" } },
        base: { ref: "main", sha: "b".repeat(40), repo: { full_name: "openai/githead" } },
        requested_reviewers: [{ login: "neon" }]
      },
      [{ id: 1, user: { login: "alex" }, body: "Looks useful", created_at: "2026-01-01", html_url: "comment-url" }],
      [{ id: 2, user: { login: "neon" }, body: "Nit", created_at: "2026-01-02", path: "src/App.tsx", line: 12, side: "RIGHT", diff_hunk: "@@" }],
      [{ id: 3, user: { login: "neon" }, state: "APPROVED", submitted_at: "2026-01-03", html_url: "review-url" }],
      [{ filename: "src/App.tsx", previous_filename: "src/Old.tsx", status: "renamed", additions: 8, deletions: 3, patch: "@@", blob_url: "blob-url" }],
      [{ sha: "c".repeat(40), html_url: "commit-url", commit: { message: "feat: review console\n\nbody", author: { name: "Taylor", date: "2026-01-01" } } }],
      { check_runs: [{ id: 9, name: "CI", status: "completed", conclusion: "success", details_url: "check-url" }] },
      { status: "ahead", ahead_by: 3, behind_by: 1 }
    ]);

    const result = await new GitHubService(provider(repository), client).getPullRequestDetail({ repoPath: "D:\\Repo", number: 24 });

    expect(result).toMatchObject({ ok: true, data: {
      number: 24,
      title: "Review console",
      displayState: "open",
      sourceBranch: "feature/review",
      targetBranch: "main",
      mergeStatus: "ready",
      canMerge: true,
      reviewStatus: "approved",
      commitCount: 2,
      additions: 18,
      deletions: 7,
      branchRelationship: "ahead",
      aheadBy: 3,
      behindBy: 1,
      comments: [{ kind: "issue", author: { login: "alex" } }, { kind: "review", path: "src/App.tsx", line: 12 }],
      reviews: [{ state: "approved", author: { login: "neon" } }],
      files: [{ path: "src/App.tsx", previousPath: "src/Old.tsx", status: "renamed", additions: 8, deletions: 3, patch: "@@" }],
      checks: [{ name: "CI", status: "completed", conclusion: "success", detailsUrl: "check-url" }],
      commits: [{ shortSha: "ccccccc", message: "feat: review console", author: "Taylor" }]
    } });
    expect(client.calls.slice(0, 6).map((call) => call.path)).toEqual([
      "/repos/openai/githead/pulls/24",
      "/repos/openai/githead/issues/24/comments?per_page=100",
      "/repos/openai/githead/pulls/24/comments?per_page=100",
      "/repos/openai/githead/pulls/24/reviews?per_page=100",
      "/repos/openai/githead/pulls/24/files?per_page=100",
      "/repos/openai/githead/pulls/24/commits?per_page=100"
    ]);
  });

  it("maps issue detail metadata and linked pull requests", async () => {
    const client = new FakeClient([
      {
        number: 12, title: "Issue detail", state: "open", body: "Issue body", user: { login: "taylor" }, created_at: "created", updated_at: "updated", html_url: "issue-url",
        assignees: [{ login: "alex" }], labels: [{ name: "bug", color: "ff0000" }], milestone: { number: 2, title: "Next", html_url: "milestone-url" }
      },
      [{ id: 1, user: { login: "alex" }, body: "Comment", created_at: "later" }],
      [{ source: { issue: { number: 31, title: "Fix issue", state: "open", html_url: "pr-url", pull_request: {} } } }]
    ]);

    const result = await new GitHubService(provider(repository), client).getIssueDetail({ repoPath: "D:\\Repo", number: 12 });

    expect(result).toMatchObject({ ok: true, data: {
      number: 12,
      body: "Issue body",
      assignees: [{ login: "alex" }],
      labels: [{ name: "bug", color: "ff0000" }],
      milestone: { number: 2, title: "Next" },
      comments: [{ body: "Comment", author: { login: "alex" } }],
      linkedPullRequests: [{ number: 31, title: "Fix issue", state: "open", url: "pr-url" }]
    } });
  });

  it("loads both open counts concurrently", async () => {
    const gates: Array<(payload: unknown) => void> = [];
    const client = new FakeClient([], () => new Promise((resolve) => gates.push(resolve)));
    const pending = new GitHubService(provider(repository), client).getOpenCounts({ repoPath: "D:\\Repo" });
    await vi.waitFor(() => expect(client.calls).toHaveLength(2));
    gates[0]?.({ total_count: 7 }); gates[1]?.({ total_count: 13 });
    await expect(pending).resolves.toEqual({ ok: true, rateLimit: null, data: { issues: 7, pullRequests: 13 } });
  });

  it("reuses exact complete-list counts and fetches only a missing kind", async () => {
    const client = new FakeClient([{ items: [{ number: 1 }], total_count: 1 }, { total_count: 9 }]);
    const service = new GitHubService(provider(repository), client);
    await service.getIssues({ repoPath: "D:\\Repo" });
    const result = await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { issues: 1, pullRequests: 9 } });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(2);
    expect(client.calls.at(-1)?.path).toContain("is%3Apr");
  });

  it("does not infer a count from a limit-sized list", async () => {
    const client = new FakeClient([{ items: Array.from({ length: 50 }, (_, number) => ({ number: number + 1 })), total_count: 50 }, { total_count: 4 }]);
    const service = new GitHubService(provider(repository), client);
    await service.getIssues({ repoPath: "D:\\Repo" });
    await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(2);
  });

  it("expires observed counts and isolates repositories", async () => {
    let now = 0;
    const other = { ...repository, owner: "other", fullName: "other/githead" };
    const repositoryProvider = { getGitHubRepository: vi.fn(async (path: string) => path.includes("Other") ? other : repository) };
    const client = new FakeClient([[], { total_count: 2 }, { total_count: 3 }, { total_count: 4 }, { total_count: 5 }]);
    const service = new GitHubService(repositoryProvider, client, () => now);
    await service.getPullRequests({ repoPath: "D:\\Repo" });
    await service.getOpenCounts({ repoPath: "D:\\Other" });
    now = 31_000;
    await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(4);
  });

  it("preserves pull request payload and invalidates repository knowledge", async () => {
    const client = new FakeClient([[], { number: 12, title: "New PR", html_url: "pr-url", draft: true }, { total_count: 8 }, { total_count: 1 }]);
    const service = new GitHubService(provider(repository), client);
    const controller = new AbortController();
    await service.getPullRequests({ repoPath: "D:\\Repo" });
    const result = await service.createPullRequest(
      { repoPath: "D:\\Repo", title: "New PR", body: "body", baseBranch: "main", headBranch: "feature", draft: true },
      controller.signal
    );
    expect(result).toEqual({ ok: true, rateLimit: null, data: { number: 12, title: "New PR", url: "pr-url", draft: true } });
    expect(client.calls[1]?.request).toMatchObject({
      method: "POST",
      body: { title: "New PR", head: "feature", base: "main", body: "body", draft: true },
      signal: controller.signal
    });
    expect(client.invalidated).toEqual([repository]);
    await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(2);
  });

  it("marks a malformed 201 pull-request response body as outcome unknown", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }));
    const client = new DefaultGitHubClient(fetchImpl, undefined, { env: {} });
    const result = await new GitHubService(provider(repository), client).createPullRequest({
      repoPath: "D:\\Repo",
      title: "New PR",
      body: "body",
      baseBranch: "main",
      headBranch: "feature",
      draft: false
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "unexpected",
        message: "GitHub returned invalid JSON with status 201.",
        outcomeUnknown: true,
        retryable: false
      }
    });
  });

  it("marks a 201 pull-request response without a PR number as outcome unknown", async () => {
    const client = new FakeClient([{
      payload: { title: "New PR", html_url: "pr-url" },
      headers: {},
      status: 201
    }]);
    const result = await new GitHubService(provider(repository), client).createPullRequest({
      repoPath: "D:\\Repo",
      title: "New PR",
      body: "body",
      baseBranch: "main",
      headBranch: "feature",
      draft: false
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "unexpected",
        outcomeUnknown: true,
        retryable: false
      }
    });
  });

  it("does not POST after cancellation during repository discovery and preserves mutation outcome semantics", async () => {
    let finishRepositoryLookup!: (value: GitHubRepository | null) => void;
    const repositoryProvider = {
      getGitHubRepository: vi.fn(() => new Promise<GitHubRepository | null>((resolve) => {
        finishRepositoryLookup = resolve;
      }))
    };
    const client = new FakeClient([{ number: 12 }]);
    const service = new GitHubService(repositoryProvider, client);
    const controller = new AbortController();
    const pending = service.createPullRequest(
      { repoPath: "D:\\Repo", title: "New PR", body: "body", baseBranch: "main", headBranch: "feature", draft: false },
      controller.signal
    );

    controller.abort(new DOMException("Operation was cancelled.", "AbortError"));
    finishRepositoryLookup(repository);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "cancelled",
        outcomeUnknown: true,
        retryable: false
      }
    });
    expect(client.calls).toHaveLength(0);
  });

  it("classifies transport errors without changing IPC-facing shapes", async () => {
    const client = new FakeClient([], async () => { throw new Error("GitHub rejected the request with status 403."); });
    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });
    expect(result).toMatchObject({ ok: false, error: { kind: "authorization", source: "combined", retryable: false } });
  });

  it("preserves rate-limit reset metadata and accepted permissions", async () => {
    const resetAtSeconds = 2_000_000_000;
    const client = new FakeClient([], async () => {
      throw new GitHubHttpError("API rate limit exceeded.", 403, new Headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetAtSeconds),
        "x-ratelimit-resource": "core",
        "x-accepted-github-permissions": "issues=read"
      }), {});
    });

    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "rateLimited",
        retryable: true,
        retryAfterAt: new Date(resetAtSeconds * 1_000).toISOString(),
        rateLimit: { limit: 5000, remaining: 0, resource: "core" }
      }
    });
  });

  it("reports the GitHub App permission required by an authorization failure", async () => {
    const client = new FakeClient([], async () => {
      throw new GitHubHttpError("Resource not accessible by integration.", 403, new Headers({
        "x-accepted-github-permissions": "issues=read; pull_requests=write"
      }), {});
    });

    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "authorization",
        missingPermission: "issues=read; pull_requests=write",
        message: expect.stringContaining("Required GitHub App permission")
      }
    });
  });

  it("fails before transport for unsupported origins", async () => {
    const client = new FakeClient([]);
    const result = await new GitHubService(provider(null), client).getIssues({ repoPath: "D:\\Repo" });
    expect(result).toMatchObject({ ok: false, error: { kind: "unexpected", message: "Selected repository does not have a supported GitHub origin." } });
    expect(client.calls).toHaveLength(0);
  });

  it("enriches full SHAs in bounded batches and preserves fork PR identity", async () => {
    const shas = Array.from({ length: 21 }, (_, index) => index.toString(16).padStart(40, "0"));
    const head = shas[0]!;
    const commit = (sha: string, state: string | null = "SUCCESS") => ({
      oid: sha, statusCheckRollup: state ? { state } : null,
      associatedPullRequests: { nodes: sha === head ? [
        { number: 7, title: "Fork", state: "OPEN", isDraft: false, url: "fork-pr", headRefName: "feature", headRefOid: head,
          baseRepository: { nameWithOwner: "openai/githead" }, headRepository: { nameWithOwner: "fork/githead" } },
        { number: 8, title: "Origin", state: "OPEN", isDraft: true, url: "origin-pr", headRefName: "feature", headRefOid: head,
          baseRepository: { nameWithOwner: "openai/githead" }, headRepository: { nameWithOwner: "openai/githead" } }
      ] : [] }
    });
    const client = new FakeClient([
      { data: { repository: Object.fromEntries(shas.slice(0, 20).map((sha, index) => [`commit${index}`, commit(sha, index === 1 ? "FAILURE" : "SUCCESS")])) } },
      { data: { repository: { commit0: commit(shas[20]!, null) } } }
    ]);
    const result = await new GitHubService(provider(repository), client).getHistoryInsights({
      repoPath: "D:\\Repo", currentBranch: "feature", headSha: head, commitShas: [...shas, head]
    });
    expect(client.calls).toHaveLength(2);
    expect(client.calls.every((call) => call.path === "/graphql" && call.request?.method === "POST")).toBe(true);
    expect(result).toMatchObject({ ok: true, data: {
      currentBranchPullRequests: [{ number: 8, headRepositoryFullName: "openai/githead", draft: true }], unavailableCommitShas: []
    } });
    expect(result.ok && result.data.commits).toHaveLength(21);
    expect(result.ok && result.data.commits[0]).toMatchObject({ commitSha: head, checkState: "success" });
    expect(result.ok && result.data.commits[1]).toMatchObject({ commitSha: shas[1], checkState: "failure" });
  });

  it("returns missing commit objects as unavailable without REST fan-out", async () => {
    const sha = "a".repeat(40);
    const client = new FakeClient([{ data: { repository: { commit0: null } } }]);
    const result = await new GitHubService(provider(repository), client).getHistoryInsights({ repoPath: "D:\\Repo", currentBranch: "main", headSha: sha, commitShas: [sha] });
    expect(result).toMatchObject({ ok: true, data: { commits: [], unavailableCommitShas: [sha], currentBranchPullRequests: [] } });
    expect(client.calls).toHaveLength(1);
  });
});

class FakeClient implements GitHubApiClient {
  readonly calls: Array<{ repository: GitHubRepository; path: string; request?: GitHubClientRequest }> = [];
  readonly invalidated: GitHubRepository[] = [];
  constructor(private readonly payloads: unknown[], private readonly handler?: (path: string) => Promise<unknown>) {}
  async requestJson<T>(repo: GitHubRepository, path: string, request?: GitHubClientRequest): Promise<GitHubClientResponse<T>> {
    this.calls.push({ repository: repo, path, ...(request ? { request } : {}) });
    const queued = this.handler ? await this.handler(path) : this.payloads.shift();
    if (queued === undefined) throw new Error(`No payload queued for ${path}`);
    const fixture = isFixture(queued) ? queued : { payload: queued, headers: {} };
    return { payload: fixture.payload as T, status: fixture.status ?? 200, headers: new Headers(fixture.headers), source: "network" };
  }
  invalidateRepository(repo: GitHubRepository): void { this.invalidated.push(repo); }
}

function isFixture(value: unknown): value is { payload: unknown; headers: Record<string, string>; status?: number } {
  return typeof value === "object" && value !== null && "payload" in value && "headers" in value;
}

function provider(value: GitHubRepository | null): { getGitHubRepository(repoPath: string): Promise<GitHubRepository | null> } {
  return { getGitHubRepository: vi.fn(async () => value) };
}
