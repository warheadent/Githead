// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createIssue, createPullRequest, createPullRequestDetail, createWorkflowRun, createWorkflowRunDetail, defer, githead, repoPath } from "./AppTestHarness";
import { useGitHubDetail, useGitHubQueries, useGitHubWorkflowRunDetail } from "./useGitHubQueries";

const repository = { repoPath, githubFullName: "openai/githead" };

describe("GitHub query polling", () => {
  it("refreshes all loaded pull request pages and replaces the list only after they finish", async () => {
    vi.useFakeTimers();
    const first = createPullRequest({ number: 1 });
    const second = createPullRequest({ number: 2 });
    const created = createPullRequest({ number: 3 });
    const updated = createPullRequest({ number: 2, title: "Updated pull request" });
    const pending = defer<Awaited<ReturnType<typeof githead.getGitHubPullRequests>>>();
    vi.mocked(githead.getGitHubPullRequests)
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 3 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: 3, totalCount: 3 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [created], page: 1, nextPage: 2, totalCount: 4 }, rateLimit: null })
      .mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useGitHubQueries(repository, undefined, "pullRequests"));
    await act(() => result.current.ensure("pullRequests"));
    await act(() => result.current.loadMore("pullRequests"));

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(vi.mocked(githead.getGitHubPullRequests).mock.calls.map(([request]) => request.page)).toEqual([1, 2, 1, 2]);
    expect(result.current.pullRequests).toMatchObject({ status: "refreshing", data: [first, second], nextPage: 3, totalCount: 3 });

    await act(async () => { pending.resolve({ ok: true, data: { items: [created, updated], page: 2, nextPage: 3, totalCount: 4 }, rateLimit: null }); });

    expect(result.current.pullRequests).toMatchObject({ status: "success", data: [created, updated], nextPage: 3, totalCount: 4 });
  });

  it("keeps later workflow pages during polling and updates their run status", async () => {
    vi.useFakeTimers();
    const first = createWorkflowRun({ id: "1" });
    const second = createWorkflowRun({ id: "2", status: "in_progress", conclusion: null });
    const completed = createWorkflowRun({ id: "2", status: "completed", conclusion: "success" });
    vi.mocked(githead.getGitHubWorkflowRuns)
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [completed], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null });
    const { result } = renderHook(() => useGitHubQueries(repository, undefined, "workflowRuns"));
    await act(() => result.current.ensure("workflowRuns"));
    await act(() => result.current.loadMore("workflowRuns"));

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(result.current.workflows).toMatchObject({ status: "success", data: [first, completed], nextPage: null, totalCount: 2 });
    expect(vi.mocked(githead.getGitHubWorkflowRuns).mock.calls.map(([request]) => request.page)).toEqual([1, 2, 1, 2]);
  });

  it("retains every loaded page after a partial refresh failure and retries the full range", async () => {
    const first = createPullRequest({ number: 1 });
    const second = createPullRequest({ number: 2 });
    const updated = createPullRequest({ number: 1, title: "Updated pull request" });
    vi.mocked(githead.getGitHubPullRequests)
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [updated], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ ok: true, data: { items: [updated], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null });
    const { result } = renderHook(() => useGitHubQueries(repository));
    await act(() => result.current.ensure("pullRequests"));
    await act(() => result.current.loadMore("pullRequests"));

    await act(() => result.current.refresh("pullRequests"));

    expect(result.current.pullRequests).toMatchObject({ status: "error", error: "Offline", data: [first, second], nextPage: null, totalCount: 2 });

    await act(() => result.current.refresh("pullRequests"));

    expect(result.current.pullRequests).toMatchObject({ status: "success", data: [updated, second], nextPage: null });
    expect(vi.mocked(githead.getGitHubPullRequests).mock.calls.map(([request]) => request.page)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("stops refreshing issue pages when the result has shrunk", async () => {
    const first = createIssue({ number: 1 });
    const second = createIssue({ number: 2 });
    vi.mocked(githead.getGitHubIssues)
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null })
      .mockResolvedValue({ ok: true, data: { items: [first], page: 1, nextPage: null, totalCount: 1 }, rateLimit: null });
    const { result } = renderHook(() => useGitHubQueries(repository));
    await act(() => result.current.ensure("issues"));
    await act(() => result.current.loadMore("issues"));

    await act(() => result.current.refresh("issues"));

    expect(result.current.issues).toMatchObject({ status: "success", data: [first], nextPage: null, totalCount: 1 });
    expect(vi.mocked(githead.getGitHubIssues).mock.calls.map(([request]) => request.page)).toEqual([1, 2, 1]);
  });

  it("stops an old page refresh and resets the loaded range when the filter changes", async () => {
    const first = createPullRequest({ number: 1 });
    const second = createPullRequest({ number: 2 });
    const matching = createPullRequest({ number: 3 });
    const pending = defer<Awaited<ReturnType<typeof githead.getGitHubPullRequests>>>();
    vi.mocked(githead.getGitHubPullRequests)
      .mockResolvedValueOnce({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [second], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ok: true, data: { items: [matching], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null });
    const { result, rerender } = renderHook(({ search }) => useGitHubQueries(repository, { pullRequests: { search, sort: "updated", direction: "desc" } }), {
      initialProps: { search: "" }
    });
    await act(() => result.current.ensure("pullRequests"));
    await act(() => result.current.loadMore("pullRequests"));
    let refresh: Promise<unknown> = Promise.resolve();
    act(() => { refresh = result.current.refresh("pullRequests"); });

    rerender({ search: "matching" });
    await act(() => result.current.ensure("pullRequests"));
    await act(async () => {
      pending.resolve({ ok: true, data: { items: [first], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null });
      await refresh;
    });

    expect(result.current.pullRequests).toMatchObject({ status: "success", data: [matching], nextPage: 2 });
    expect(vi.mocked(githead.getGitHubPullRequests).mock.calls.map(([request]) => [request.page, request.query?.search])).toEqual([
      [1, undefined], [2, undefined], [1, undefined], [1, "matching"]
    ]);
  });

  it("reloads old open counts when they are requested again", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getGitHubOpenCounts)
      .mockResolvedValueOnce({ ok: true, data: { pullRequests: 1, issues: 2 }, rateLimit: null })
      .mockResolvedValue({ ok: true, data: { pullRequests: 3, issues: 4 }, rateLimit: null });
    const { result } = renderHook(() => useGitHubQueries(repository));
    await act(() => result.current.ensure("openCounts"));
    await act(() => result.current.ensure("openCounts"));
    expect(githead.getGitHubOpenCounts).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(30_001));
    await act(() => result.current.ensure("openCounts"));

    expect(githead.getGitHubOpenCounts).toHaveBeenCalledTimes(2);
    expect(result.current.counts.data).toEqual({ pullRequests: 3, issues: 4 });
  });

  it("reloads a populated list when it is invalidated before ensure", async () => {
    const original = createPullRequest({ title: "Original pull request" });
    const created = createPullRequest({ number: 2, title: "New pull request" });
    vi.mocked(githead.getGitHubPullRequests)
      .mockResolvedValueOnce({ ok: true, data: { items: [original], page: 1, nextPage: null, totalCount: 1 }, rateLimit: null })
      .mockResolvedValue({ ok: true, data: { items: [created, original], page: 1, nextPage: null, totalCount: 2 }, rateLimit: null });
    const { result } = renderHook(() => useGitHubQueries(repository));

    await act(() => result.current.ensure("pullRequests"));
    await act(() => result.current.ensure("pullRequests"));
    expect(githead.getGitHubPullRequests).toHaveBeenCalledTimes(1);

    act(() => result.current.invalidate("pullRequests"));
    await act(() => result.current.ensure("pullRequests"));

    expect(githead.getGitHubPullRequests).toHaveBeenCalledTimes(2);
    expect(result.current.pullRequests.data).toEqual([created, original]);
    expect(result.current.pullRequests.totalCount).toBe(2);
  });

  it("reuses recent details and refreshes old details while keeping cached data visible", async () => {
    vi.useFakeTimers();
    const original = createPullRequestDetail({ title: "Original title" });
    const updated = createPullRequestDetail({ title: "Updated title" });
    const pending = defer<Awaited<ReturnType<typeof githead.getGitHubPullRequestDetail>>>();
    vi.mocked(githead.getGitHubPullRequestDetail)
      .mockResolvedValueOnce({ ok: true, data: original, rateLimit: null })
      .mockReturnValueOnce(pending.promise);
    const initialProps: { number: number | null } = { number: 1 };
    const { result, rerender } = renderHook(({ number }: { number: number | null }) => useGitHubDetail(
      repository,
      number === null ? null : { itemType: "pullRequest", number }
    ), { initialProps });
    await act(async () => { await Promise.resolve(); });

    rerender({ number: null });
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    rerender({ number: 1 });
    expect(githead.getGitHubPullRequestDetail).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(original);

    rerender({ number: null });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    rerender({ number: 1 });

    expect(githead.getGitHubPullRequestDetail).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ status: "refreshing", data: original });

    await act(async () => { pending.resolve({ ok: true, data: updated, rateLimit: null }); });
    expect(result.current).toMatchObject({ status: "success", data: updated });
  });

  it("refreshes cached workflow details when reopened after the active workflow cadence", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getGitHubWorkflowRunDetail)
      .mockResolvedValueOnce({ ok: true, data: createWorkflowRunDetail({ status: "in_progress", conclusion: null }), rateLimit: null })
      .mockResolvedValue({ ok: true, data: createWorkflowRunDetail({ status: "completed", conclusion: "success" }), rateLimit: null });
    const initialProps: { runId: string | null } = { runId: "1" };
    const { result, rerender } = renderHook(({ runId }: { runId: string | null }) => useGitHubWorkflowRunDetail(repository, runId), {
      initialProps
    });
    await act(async () => { await Promise.resolve(); });
    rerender({ runId: null });
    await act(() => vi.advanceTimersByTimeAsync(5_001));

    rerender({ runId: "1" });
    await act(async () => { await Promise.resolve(); });

    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(2);
    expect(result.current.data?.status).toBe("completed");
  });

  it("refreshes the active list and open counts while it is viewed", async () => {
    vi.useFakeTimers();
    renderHook(() => useGitHubQueries(repository, undefined, "workflowRuns"));

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(githead.getGitHubWorkflowRuns).toHaveBeenCalledTimes(1);
    expect(githead.getGitHubOpenCounts).toHaveBeenCalledTimes(1);
  });

  it("polls active workflow details quickly, then slows after completion", async () => {
    vi.useFakeTimers();
    vi.mocked(githead.getGitHubWorkflowRunDetail)
      .mockResolvedValueOnce({ ok: true, data: createWorkflowRunDetail({ status: "in_progress", conclusion: null }), rateLimit: null })
      .mockResolvedValue({ ok: true, data: createWorkflowRunDetail({ status: "completed", conclusion: "success" }), rateLimit: null });
    renderHook(() => useGitHubWorkflowRunDetail(repository, "1", true));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(3);
  });
});
