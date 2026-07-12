import { describe, expect, it, vi } from "vite-plus/test";
import type { GitHubRepository } from "../shared/types";
import type { GitHubClient, GitHubClientRequest, GitHubClientResponse } from "./githubClient";
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
      id: 123, name: "CI", run_number: 42, status: "completed", conclusion: "success", head_branch: "main",
      event: "push", head_sha: "abcdef", html_url: "https://github.com/openai/githead/actions/runs/123",
      run_started_at: "start", updated_at: "end", head_commit: { message: "feat: test\n\nbody" }
    }] }]);
    const result = await new GitHubService(provider(repository), client).getWorkflowRuns({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { items: [{
      id: "123", name: "CI", runNumber: 42, status: "completed", conclusion: "success", branch: "main",
      event: "push", commitSha: "abcdef", commitMessage: "feat: test", url: "https://github.com/openai/githead/actions/runs/123",
      startedAt: "start", updatedAt: "end"
    }], page: 1, nextPage: null, totalCount: null } });
    expect(client.calls[0]?.path).toBe("/repos/openai/githead/actions/runs?per_page=30&page=1");
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
    await service.getPullRequests({ repoPath: "D:\\Repo" });
    const result = await service.createPullRequest({ repoPath: "D:\\Repo", title: "New PR", body: "body", baseBranch: "main", headBranch: "feature", draft: true });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { number: 12, title: "New PR", url: "pr-url", draft: true } });
    expect(client.calls[1]?.request).toMatchObject({ method: "POST", body: { title: "New PR", head: "feature", base: "main", body: "body", draft: true } });
    expect(client.invalidated).toEqual([repository]);
    await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(2);
  });

  it("classifies transport errors without changing IPC-facing shapes", async () => {
    const client = new FakeClient([], async () => { throw new Error("GitHub rejected the request with status 403."); });
    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });
    expect(result).toMatchObject({ ok: false, error: { kind: "authorization", source: "combined", retryable: false } });
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

class FakeClient implements GitHubClient {
  readonly calls: Array<{ repository: GitHubRepository; path: string; request?: GitHubClientRequest }> = [];
  readonly invalidated: GitHubRepository[] = [];
  constructor(private readonly payloads: unknown[], private readonly handler?: (path: string) => Promise<unknown>) {}
  async requestJson<T>(repo: GitHubRepository, path: string, request?: GitHubClientRequest): Promise<GitHubClientResponse<T>> {
    this.calls.push({ repository: repo, path, ...(request ? { request } : {}) });
    const queued = this.handler ? await this.handler(path) : this.payloads.shift();
    if (queued === undefined) throw new Error(`No payload queued for ${path}`);
    const fixture = isFixture(queued) ? queued : { payload: queued, headers: {} };
    return { payload: fixture.payload as T, status: 200, headers: new Headers(fixture.headers), source: "network" };
  }
  invalidateRepository(repo: GitHubRepository): void { this.invalidated.push(repo); }
}

function isFixture(value: unknown): value is { payload: unknown; headers: Record<string, string> } {
  return typeof value === "object" && value !== null && "payload" in value && "headers" in value;
}

function provider(value: GitHubRepository | null): { getGitHubRepository(repoPath: string): Promise<GitHubRepository | null> } {
  return { getGitHubRepository: vi.fn(async () => value) };
}
