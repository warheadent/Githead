import { describe, expect, it, vi } from "vite-plus/test";
import { DefaultGitHubClient } from "./githubClient";
import { GitHubRepositoryDiscoveryService } from "./githubRepositoryDiscovery";

const apiRepo = (owner = "org", name = "repo") => ({ owner: { login: owner }, name, private: true, fork: false,
  description: "Project", language: "Rust", pushed_at: "2026-10-08T12:00:00Z", default_branch: "main", permissions: { push: false } });
const json = (payload: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
const signal = () => new AbortController().signal;

describe("GitHub repository discovery", () => {
  it("returns the disconnected state without requesting private repositories", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {} }));
    expect(await service.list({}, signal())).toMatchObject({ ok: true, data: { repositories: [], connection: { state: "anonymous" } } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses existing authentication and conditional cache, sorts by push and preserves pagination", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).endsWith("/user")
      ? json({ login: "me" }) : json([apiRepo(), { ...apiRepo("me", "newer"), pushed_at: "2026-10-09T12:00:00Z" }], 200,
        { etag: '"repos"', link: '<https://api.github.com/user/repos?page=2>; rel="next"' }));
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: { GITHUB_TOKEN: "test-token" } }));
    const first = await service.list({}, signal());
    expect(first).toMatchObject({ ok: true, data: { hasMore: true, repositories: [{ fullName: "me/newer" }, { fullName: "org/repo" }] } });
    await service.list({}, signal());
    const listCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes("/user/repos"));
    expect(listCalls).toHaveLength(1);
    expect(String(listCalls[0]![0])).toContain("sort=pushed&direction=desc");
    expect(new Headers(listCalls[0]![1]?.headers).get("authorization")).toBe("Bearer test-token");
  });

  it("searches without connecting and carries incomplete result information", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ items: [apiRepo()], incomplete_results: true }));
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {} }));
    expect(await service.list({ query: "hello world" }, signal())).toMatchObject({ ok: true, data: { incomplete: true } });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("/search/repositories?");
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get("q")).toBe("hello world");
  });

  it("reports rate-limit reset and honors cancellation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" }));
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {} }));
    expect(await service.list({ query: "repo" }, signal())).toMatchObject({ ok: false, error: { kind: "rateLimited", retryAfterAt: "2030-01-01T00:00:00.000Z" } });
    const controller = new AbortController();
    controller.abort();
    expect(await service.list({ query: "repo" }, controller.signal)).toMatchObject({ ok: false, error: { kind: "cancelled" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("disables GitHub App forks unless source and destination installation permissions allow them", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith("/user")) return json({ login: "me" });
      if (String(url).includes("/user/installations")) return json({ installations: [{ account: { login: "me" }, repository_selection: "selected", permissions: { contents: "read" } }] });
      return json(apiRepo());
    });
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {}, appTokenProvider: { getToken: async () => "app-token" } }));
    const details = await service.details("org/repo", signal());
    expect(details).toMatchObject({ ok: true, data: { repository: { canPush: false }, forkDisabledReason: expect.stringContaining("administration write access") } });
    await expect(service.fork("org/repo", "main", signal())).rejects.toThrow("administration write access");
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("allows an App fork with the required installations and waits for the chosen branch", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith("/user")) return json({ login: "me" });
      if (String(url).includes("/user/installations")) return json({ installations: ["me", "org"].map((login) => ({ account: { login }, repository_selection: "all", permissions: { administration: "write", contents: "read" } })) });
      if (init?.method === "POST") return json({ ...apiRepo("me"), fork: true, parent: { full_name: "org/repo" } }, 202);
      if (String(url).includes("/branches/")) return json({ name: "feature/work" });
      return json(apiRepo());
    });
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {}, appTokenProvider: { getToken: async () => "app-token" } }));
    expect(await service.fork("org/repo", "feature/work", signal())).toMatchObject({ fullName: "me/repo" });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/branches/feature%2Fwork"))).toBe(true);
    expect(fetchImpl.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe('{"default_branch_only":false}');
  });

  it("does not confuse readable public metadata with a selected source installation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/user") return json({ login: "me" });
      if (path === "/user/installations") return json({ installations: [
        { id: 1, account: { login: "me" }, repository_selection: "all", permissions: { administration: "write", contents: "read" } },
        { id: 2, account: { login: "org" }, repository_selection: "selected", permissions: { administration: "write", contents: "read" } }
      ] });
      if (path === "/user/installations/2/repositories") return json({ repositories: [apiRepo("org", "different")] });
      return json({ ...apiRepo(), private: false });
    });
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: {}, appTokenProvider: { getToken: async () => "app-token" } }));
    expect(await service.details("org/repo", signal())).toMatchObject({ ok: true, data: { forkDisabledReason: expect.stringContaining("administration write access") } });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/user/installations/2/repositories"))).toBe(true);
  });

  it("explains that a fork remains after cancellation while waiting", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith("/user")) return json({ login: "me" });
      if (init?.method === "POST") return json(apiRepo("me"), 202);
      if (String(url).includes("/branches/")) { controller.abort(); return json({ message: "Not Found" }, 404); }
      return json(apiRepo());
    });
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: { GH_TOKEN: "test-token" } }));
    await expect(service.fork("org/repo", "main", controller.signal)).rejects.toThrow("Fork created at https://github.com/me/repo");
  });

  it("does not retry an ambiguous fork mutation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith("/user")) return json({ login: "me" });
      if (init?.method === "POST") throw new Error("fetch failed");
      return json(apiRepo());
    });
    const service = new GitHubRepositoryDiscoveryService(new DefaultGitHubClient(fetchImpl, undefined, { env: { GH_TOKEN: "test-token" } }));
    await expect(service.fork("org/repo", "main", signal())).rejects.toThrow("fork may have been created");
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
