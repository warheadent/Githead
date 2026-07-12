import { describe, expect, it, vi } from "vite-plus/test";
import type { GitHubRepository } from "../shared/types";
import type { GitHubClient, GitHubClientRequest, GitHubClientResponse } from "./githubClient";
import { GitHubService } from "./githubService";

const repository: GitHubRepository = {
  owner: "openai", name: "githead", fullName: "openai/githead", webUrl: "https://github.com/openai/githead"
};

describe("GitHubService", () => {
  it("normalizes workflow runs and preserves the endpoint", async () => {
    const client = new FakeClient([{ workflow_runs: [{
      id: 123, name: "CI", run_number: 42, status: "completed", conclusion: "success", head_branch: "main",
      event: "push", head_sha: "abcdef", html_url: "https://github.com/openai/githead/actions/runs/123",
      run_started_at: "start", updated_at: "end", head_commit: { message: "feat: test\n\nbody" }
    }] }]);
    const result = await new GitHubService(provider(repository), client).getWorkflowRuns({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: [{
      id: "123", name: "CI", runNumber: 42, status: "completed", conclusion: "success", branch: "main",
      event: "push", commitSha: "abcdef", commitMessage: "feat: test", url: "https://github.com/openai/githead/actions/runs/123",
      startedAt: "start", updatedAt: "end"
    }] });
    expect(client.calls[0]?.path).toBe("/repos/openai/githead/actions/runs?per_page=30");
  });

  it("normalizes issues and excludes pull requests", async () => {
    const client = new FakeClient([[
      { number: 7, title: "Issue", state: "open", user: { login: "taylor" }, labels: [{ name: "bug" }], comments: 3, updated_at: "now", html_url: "issue-url" },
      { number: 8, title: "PR", pull_request: {} }
    ]]);
    const result = await new GitHubService(provider(repository), client).getIssues({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: [{
      number: 7, title: "Issue", state: "open", authorLogin: "taylor", labels: ["bug"], comments: 3, updatedAt: "now", url: "issue-url"
    }] });
  });

  it("normalizes pull requests and sums comment counts", async () => {
    const client = new FakeClient([[{ number: 11, title: "PR", state: "open", user: { login: "taylor" }, head: { ref: "feature" }, base: { ref: "main" }, labels: ["ui"], comments: 2, review_comments: 5, draft: true, updated_at: "now", html_url: "pr-url" }]]);
    const result = await new GitHubService(provider(repository), client).getPullRequests({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: [{ number: 11, title: "PR", state: "open", authorLogin: "taylor", sourceBranch: "feature", targetBranch: "main", labels: ["ui"], comments: 7, draft: true, updatedAt: "now", url: "pr-url" }] });
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
    const client = new FakeClient([[{ number: 1 }], { total_count: 9 }]);
    const service = new GitHubService(provider(repository), client);
    await service.getIssues({ repoPath: "D:\\Repo" });
    const result = await service.getOpenCounts({ repoPath: "D:\\Repo" });
    expect(result).toEqual({ ok: true, rateLimit: null, data: { issues: 1, pullRequests: 9 } });
    expect(client.calls.filter((call) => call.path.startsWith("/search"))).toHaveLength(1);
    expect(client.calls.at(-1)?.path).toContain("is%3Apr");
  });

  it("does not infer a count from a limit-sized list", async () => {
    const client = new FakeClient([Array.from({ length: 50 }, (_, number) => ({ number: number + 1 })), { total_count: 50 }, { total_count: 4 }]);
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
});

class FakeClient implements GitHubClient {
  readonly calls: Array<{ repository: GitHubRepository; path: string; request?: GitHubClientRequest }> = [];
  readonly invalidated: GitHubRepository[] = [];
  constructor(private readonly payloads: unknown[], private readonly handler?: (path: string) => Promise<unknown>) {}
  async requestJson<T>(repo: GitHubRepository, path: string, request?: GitHubClientRequest): Promise<GitHubClientResponse<T>> {
    this.calls.push({ repository: repo, path, ...(request ? { request } : {}) });
    const payload = this.handler ? await this.handler(path) : this.payloads.shift();
    if (payload === undefined) throw new Error(`No payload queued for ${path}`);
    return { payload: payload as T, status: 200, headers: new Headers(), source: "network" };
  }
  invalidateRepository(repo: GitHubRepository): void { this.invalidated.push(repo); }
}

function provider(value: GitHubRepository | null): { getGitHubRepository(repoPath: string): Promise<GitHubRepository | null> } {
  return { getGitHubRepository: vi.fn(async () => value) };
}
