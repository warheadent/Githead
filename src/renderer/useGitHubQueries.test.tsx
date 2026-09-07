// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createPullRequest, createPullRequestDetail, createWorkflowRunDetail, defer, githead, repoPath } from "./AppTestHarness";
import { useGitHubDetail, useGitHubQueries, useGitHubWorkflowRunDetail } from "./useGitHubQueries";

const repository = { repoPath, githubFullName: "openai/githead" };

describe("GitHub query polling", () => {
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
