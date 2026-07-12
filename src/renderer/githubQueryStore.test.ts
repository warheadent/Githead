import { describe, expect, it, vi } from "vitest";
import { createGitHubQueryStore, getGitHubQueryKey, type GitHubQueryDescriptor } from "./githubQueryStore";

const repo = { repoPath: "C:\\work\\Repo", githubFullName: "Owner/Repo" };
const query = (resource: GitHubQueryDescriptor["resource"] = "issues", params = {}): GitHubQueryDescriptor => ({ repository: repo, resource, params });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("githubQueryStore", () => {
  it("deduplicates identical requests and caches successful data", async () => {
    const pending = deferred<string[]>();
    const loader = vi.fn(() => pending.promise);
    const store = createGitHubQueryStore({ loaders: { issues: loader, workflowRuns: loader, openCounts: loader, pullRequests: loader } });
    const first = store.ensure<string[]>(query());
    const second = store.ensure<string[]>(query());
    expect(loader).toHaveBeenCalledTimes(1);
    pending.resolve(["one"]); await first; await second;
    await store.ensure(query());
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps successful data when a refresh fails", async () => {
    const loader = vi.fn().mockResolvedValueOnce(["old"]).mockRejectedValueOnce(new Error("offline"));
    const store = createGitHubQueryStore({ loaders: { issues: loader, workflowRuns: loader, openCounts: loader, pullRequests: loader } });
    await store.ensure(query()); await Promise.resolve();
    const refresh = store.refresh(query());
    expect(store.getSnapshot<string[]>(query())).toMatchObject({ status: "refreshing", data: ["old"] });
    await expect(refresh).rejects.toThrow("offline"); await Promise.resolve();
    expect(store.getSnapshot<string[]>(query())).toMatchObject({ status: "error", data: ["old"], error: "offline", isStale: true });
  });

  it("does not let a superseded response overwrite a newer refresh", async () => {
    const old = deferred<string[]>(); const fresh = deferred<string[]>();
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const store = createGitHubQueryStore({ loaders: { issues: loader, workflowRuns: loader, openCounts: loader, pullRequests: loader } });
    const first = store.ensure(query()); const second = store.refresh(query());
    fresh.resolve(["new"]); await second; await Promise.resolve(); old.resolve(["old"]); await first; await Promise.resolve();
    expect(store.getSnapshot<string[]>(query()).data).toEqual(["new"]);
  });

  it("keys repository, resource, and canonical params independently", () => {
    expect(getGitHubQueryKey(query("issues", { page: 1, filter: "open" }))).toBe(getGitHubQueryKey(query("issues", { filter: "open", page: 1 })));
    expect(getGitHubQueryKey(query("issues", { page: 1 }))).not.toBe(getGitHubQueryKey(query("issues", { page: 2 })));
    expect(getGitHubQueryKey(query("issues"))).not.toBe(getGitHubQueryKey(query("pullRequests")));
    expect(getGitHubQueryKey(query())).not.toBe(getGitHubQueryKey({ ...query(), repository: { ...repo, repoPath: "D:\\work\\Repo" } }));
  });
});
