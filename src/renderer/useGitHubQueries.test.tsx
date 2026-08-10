// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createWorkflowRunDetail, githead, repoPath } from "./AppTestHarness";
import { useGitHubQueries, useGitHubWorkflowRunDetail } from "./useGitHubQueries";

const repository = { repoPath, githubFullName: "openai/githead" };

describe("GitHub query polling", () => {
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
