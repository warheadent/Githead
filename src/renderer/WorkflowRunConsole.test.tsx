// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createWorkflowRun, createWorkflowRunDetail, defer, githead, repoPath } from "./AppTestHarness";
import { gitHubQueryStore } from "./useGitHubQueries";
import { WorkflowRunConsole } from "./WorkflowRunConsole";

function renderConsole(overrides: Partial<React.ComponentProps<typeof WorkflowRunConsole>> = {}) {
  const props: React.ComponentProps<typeof WorkflowRunConsole> = {
    repoPath,
    githubFullName: "openai/githead",
    run: createWorkflowRun(),
    active: false,
    onClose: vi.fn(),
    onOpenExternalUrl: vi.fn(),
    onRunChanged: vi.fn(),
    ...overrides
  };
  const result = render(<TooltipProvider><WorkflowRunConsole {...props} /></TooltipProvider>);
  return {
    ...result,
    props,
    rerenderConsole: (next: Partial<typeof props>) => result.rerender(<TooltipProvider><WorkflowRunConsole {...props} {...next} /></TooltipProvider>)
  };
}

function refreshRun(runId = "1"): Promise<void> {
  return gitHubQueryStore.refresh({
    repository: { repoPath, githubFullName: "openai/githead" },
    resource: "workflowRunDetail",
    params: { runId }
  });
}

describe("WorkflowRunConsole", () => {
  it("updates elapsed run, job, and step times without waiting for another GitHub response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:10Z"));
    const run = createWorkflowRun({ status: "in_progress", conclusion: null, startedAt: "2026-09-07T12:00:00Z", updatedAt: "2026-09-07T12:00:02Z" });
    const detail = createWorkflowRunDetail({ ...run });
    detail.jobs = [{ ...detail.jobs[0]!, startedAt: run.startedAt, completedAt: "", status: "in_progress", conclusion: null, steps: [{ number: 1, name: "Build", status: "in_progress", conclusion: null, startedAt: run.startedAt, completedAt: "" }] }];
    vi.mocked(githead.getGitHubWorkflowRunDetail).mockResolvedValue({ ok: true, data: detail, rateLimit: null });
    const { rerenderConsole } = renderConsole({ run, active: true });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByText("10s", { exact: false })).toHaveLength(3);

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getAllByText("11s", { exact: false })).toHaveLength(3);
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(1);

    rerenderConsole({ run, active: false });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.queryByText("13s", { exact: false })).toBeNull();
    rerenderConsole({ run, active: true });
    expect(screen.getAllByText("13s", { exact: false })).toHaveLength(3);
  });

  it.each(["run", "repository", "origin", "unmount"] as const)("ignores a completed action after changing %s", async (change) => {
    const user = userEvent.setup();
    const pending = defer<Awaited<ReturnType<typeof githead.rerunGitHubWorkflowRun>>>();
    vi.mocked(githead.rerunGitHubWorkflowRun).mockReturnValue(pending.promise);
    const { props, rerenderConsole, unmount } = renderConsole();
    await screen.findByRole("main", { name: "Workflow jobs" });
    await user.click(screen.getByRole("button", { name: "Re-run all jobs" }));

    if (change === "unmount") unmount();
    else {
      rerenderConsole(change === "run" ? { run: createWorkflowRun({ id: "2" }) }
        : change === "repository" ? { repoPath: "D:\\Other" }
          : { githubFullName: "openai/other" });
      await waitFor(() => expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(2));
      await screen.findByRole("main", { name: "Workflow jobs" });
    }
    const requestCount = vi.mocked(githead.getGitHubWorkflowRunDetail).mock.calls.length;

    await act(async () => pending.resolve({
      ok: true,
      data: { runId: "1", url: props.run.url, message: "Old run was restarted." },
      rateLimit: null
    }));

    expect(props.onRunChanged).not.toHaveBeenCalled();
    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(requestCount);
    expect(screen.queryByText("Old run was restarted.")).toBeNull();
  });

  it.each(["failure", "rejection"] as const)("ignores an old cancellation %s while a new run action is pending", async (outcome) => {
    const user = userEvent.setup();
    const run = createWorkflowRun({ status: "in_progress", conclusion: null });
    vi.mocked(githead.getGitHubWorkflowRunDetail).mockImplementation(async ({ runId }) => ({
      ok: true,
      data: createWorkflowRunDetail({ ...run, id: runId }),
      rateLimit: null
    }));
    const oldPending = defer<Awaited<ReturnType<typeof githead.cancelGitHubWorkflowRun>>>();
    const newPending = defer<Awaited<ReturnType<typeof githead.cancelGitHubWorkflowRun>>>();
    vi.mocked(githead.cancelGitHubWorkflowRun).mockReturnValueOnce(oldPending.promise).mockReturnValueOnce(newPending.promise);
    const { props, rerenderConsole } = renderConsole({ run });
    await screen.findByRole("main", { name: "Workflow jobs" });

    const cancelRun = async (): Promise<void> => {
      await user.click(screen.getByRole("button", { name: "Cancel run" }));
      await user.click(within(screen.getByRole("group", { name: "Confirm workflow cancellation" })).getByRole("button", { name: "Cancel run" }));
    };
    await cancelRun();
    rerenderConsole({ run: { ...run, id: "2" } });
    await screen.findByRole("main", { name: "Workflow jobs" });
    await cancelRun();

    await act(async () => {
      if (outcome === "rejection") oldPending.reject(new Error("Old run cancellation failed."));
      else oldPending.resolve({
        ok: false,
        error: { kind: "authorization", message: "Old run cancellation failed.", retryable: false, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null }
      });
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel run" }).hasAttribute("disabled")).toBe(true);
    expect(props.onRunChanged).not.toHaveBeenCalled();
    await act(async () => newPending.resolve({
      ok: true,
      data: { runId: "2", url: run.url, message: "New run cancellation requested." },
      rateLimit: null
    }));
    expect(props.onRunChanged).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("New run cancellation requested.")).toHaveLength(2);
  });

  it("keeps all jobs collapsed when details refresh and initializes jobs for the next run", async () => {
    const user = userEvent.setup();
    const { rerenderConsole } = renderConsole();
    const job = await screen.findByRole("button", { name: /build-linux/ });
    expect(job.getAttribute("aria-expanded")).toBe("true");
    await user.click(job);
    expect(screen.queryByRole("list", { name: "build-linux steps" })).toBeNull();

    await act(() => refreshRun());

    expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /build-linux/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "build-linux steps" })).toBeNull();

    rerenderConsole({ run: createWorkflowRun({ id: "2" }) });
    expect((await screen.findByRole("button", { name: /build-linux/ })).getAttribute("aria-expanded")).toBe("true");
  });

  it("initializes failed jobs when jobs arrive after an empty response", async () => {
    const initial = createWorkflowRunDetail();
    const failedJob = { ...initial.jobs[0]!, id: "12", name: "build-windows", conclusion: "failure" };
    vi.mocked(githead.getGitHubWorkflowRunDetail)
      .mockResolvedValueOnce({ ok: true, data: { ...initial, jobs: [], jobCount: 0 }, rateLimit: null })
      .mockResolvedValue({ ok: true, data: { ...initial, jobs: [...initial.jobs, failedJob], jobCount: 2 }, rateLimit: null });
    renderConsole();
    await screen.findByText("GitHub returned no jobs for this run.");

    await act(() => refreshRun());

    expect(screen.getByRole("button", { name: /build-linux/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /build-windows/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("expands the new jobs when the selected run advances to another attempt", async () => {
    const initial = createWorkflowRunDetail();
    vi.mocked(githead.getGitHubWorkflowRunDetail)
      .mockResolvedValueOnce({ ok: true, data: initial, rateLimit: null })
      .mockResolvedValue({ ok: true, data: { ...initial, attempt: 2, jobs: [{ ...initial.jobs[0]!, id: "12" }] }, rateLimit: null });
    renderConsole();
    await screen.findByRole("list", { name: "build-linux steps" });

    await act(() => refreshRun());

    expect(screen.getByRole("button", { name: /build-linux/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: "build-linux steps" })).toBeTruthy();
  });

  it("closes with Escape only when focus is inside the console", async () => {
    const user = userEvent.setup();
    const { props } = renderConsole();
    await screen.findByRole("main", { name: "Workflow jobs" });
    screen.getByRole("tab", { name: /Jobs/ }).focus();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});
