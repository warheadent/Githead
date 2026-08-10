// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { gitCapabilities } from "../shared/types";
import {
  createCommit,
  createCommitDetails,
  createGitHubSummary,
  createIssue,
  createOpenCounts,
  createPullRecovery,
  createPullRequest,
  createPullRequestDetail,
  createIssueDetail,
  createRunResult,
  createStatusFile,
  createSummary,
  createTextDiff,
  createWorkflowRun,
  createWorkflowRunDetail,
  defer,
  flushRendererAsync,
  githead,
  repoPath,
  repositoryRecents,
  waitForRepositoryWorkspace,
  type GitheadApi,
} from "./AppTestHarness";
import { App } from "./App";

describe("App", { timeout: 10_000 }, () => {
  it("shows GitHub tabs only for repositories with a supported GitHub origin", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    const { unmount } = render(<App />);

    await waitForRepositoryWorkspace();
    expect(screen.queryByRole("tab", { name: /Workflow Runs/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Pull Requests/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Issues/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Settings category" }), { target: { value: "integrations" } });
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeTruthy();

    unmount();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());

    render(<App />);

    await screen.findByRole("tab", { name: /Workflow Runs/ });
    expect(screen.getByRole("tab", { name: /Pull Requests/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Issues/ })).toBeTruthy();
  });

  it("loads GitHub open counts into pull request and issue tab titles", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue({ ok: true, data: createOpenCounts({
      issues: 17,
      pullRequests: 4
    }), rateLimit: null });

    render(<App />);

    await waitFor(() => {
      expect(githead.getGitHubOpenCounts).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    expect(await screen.findByRole("tab", { name: /Pull Requests 4/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Issues 17/ })).toBeTruthy();
    // Pull requests load eagerly (the Create PR button needs them); issues
    // still load only when their tab is opened.
    expect(githead.getGitHubIssues).not.toHaveBeenCalled();
  });

  it("compacts large GitHub open counts in tab titles", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubOpenCounts).mockResolvedValue({ ok: true, data: createOpenCounts({
      issues: 1100,
      pullRequests: 12_000
    }), rateLimit: null });

    render(<App />);

    expect(await screen.findByRole("tab", { name: /Issues 1\.1k/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Pull Requests 12k/ })).toBeTruthy();
  });

  it("loads workflow runs from GitHub when the Workflow Runs tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    const workflowRun = createWorkflowRun({
      name: "CI",
      displayTitle: "feat: add workflow runs tab",
      conclusion: "success",
      branch: "main",
      event: "push",
      commitMessage: "feat: add workflow runs tab"
    });
    vi.mocked(githead.getGitHubWorkflowRuns).mockResolvedValue({ ok: true, data: { items: [
      workflowRun
    ], page: 1, nextPage: null, totalCount: 1 }, rateLimit: null });
    vi.mocked(githead.getGitHubWorkflowRunDetail).mockResolvedValue({ ok: true, data: createWorkflowRunDetail({
      ...workflowRun,
      jobs: [{
        ...createWorkflowRunDetail().jobs[0]!,
        id: "11",
        name: "build-linux",
        url: "https://github.com/openai/githead/actions/runs/1/job/11",
        steps: [{ ...createWorkflowRunDetail().jobs[0]!.steps[0]!, name: "Run tests" }]
      }]
    }), rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));

    await waitFor(() => {
      expect(githead.getGitHubWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    const runButton = await screen.findByRole("button", { name: "CI: feat: add workflow runs tab" });
    expect(screen.getByText("Success")).toBeTruthy();
    expect(screen.getByText("feat: add workflow runs tab")).toBeTruthy();

    await user.click(runButton);

    await waitFor(() => {
      expect(githead.getGitHubWorkflowRunDetail).toHaveBeenCalledWith(expect.objectContaining({ repoPath, runId: "1" }));
    });
    expect(await screen.findByRole("main", { name: "Workflow jobs" })).toBeTruthy();
    expect(screen.getByText("build-linux")).toBeTruthy();
    expect(screen.getByText("Run tests")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/actions/runs/1/job/11" });
    await user.click(screen.getByRole("button", { name: /Open on GitHub/ }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/actions/runs/1" });

    await user.click(screen.getByRole("button", { name: "Close workflow run details" }));
    await waitFor(() => expect(document.activeElement).toBe(runButton));
  });

  it("re-runs completed workflow runs with a coordinated mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    const workflowRun = createWorkflowRun({ runNumber: 42, conclusion: "failure", displayTitle: "Release failed" });
    vi.mocked(githead.getGitHubWorkflowRuns).mockResolvedValue({
      ok: true,
      data: { items: [workflowRun], page: 1, nextPage: null, totalCount: 1 },
      rateLimit: null
    });
    vi.mocked(githead.getGitHubWorkflowRunDetail).mockResolvedValue({ ok: true, data: createWorkflowRunDetail({ ...workflowRun }), rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));
    await user.click(await screen.findByRole("button", { name: "CI: Release failed" }));
    await user.click(await screen.findByRole("button", { name: "Re-run all jobs" }));

    await waitFor(() => expect(githead.rerunGitHubWorkflowRun).toHaveBeenCalledWith({
      repoPath,
      runId: "1",
      operationId: expect.stringMatching(/^github-workflow-rerun-/)
    }));
    await waitFor(() => expect(screen.getAllByText("Workflow re-run requested.")).toHaveLength(2));
  });

  it("confirms cancellation for an active workflow run", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    const workflowRun = createWorkflowRun({ status: "in_progress", conclusion: null, displayTitle: "Deploy preview" });
    vi.mocked(githead.getGitHubWorkflowRuns).mockResolvedValue({ ok: true, data: { items: [workflowRun], page: 1, nextPage: null, totalCount: 1 }, rateLimit: null });
    vi.mocked(githead.getGitHubWorkflowRunDetail).mockResolvedValue({ ok: true, data: createWorkflowRunDetail({ ...workflowRun }), rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));
    await user.click(await screen.findByRole("button", { name: "CI: Deploy preview" }));
    await user.click(await screen.findByRole("button", { name: "Cancel run" }));
    expect(screen.getByRole("group", { name: "Confirm workflow cancellation" })).toBeTruthy();
    await user.click(within(screen.getByRole("group", { name: "Confirm workflow cancellation" })).getByRole("button", { name: "Cancel run" }));

    await waitFor(() => expect(githead.cancelGitHubWorkflowRun).toHaveBeenCalledWith({
      repoPath,
      runId: "1",
      operationId: expect.stringMatching(/^github-workflow-cancel-/)
    }));
  });

  it("loads open pull requests from GitHub when the Pull Requests tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubPullRequests).mockResolvedValue({ ok: true, data: { items: [
      createPullRequest({
        number: 24,
        title: "Add GitHub pull request tab",
        sourceBranch: "feature/pr-tab",
        targetBranch: "main",
        labels: [
          "ui",
          "accessibility",
          "not-shown"
        ],
        comments: 3,
        draft: true,
        url: "https://github.com/openai/githead/pull/24"
      })
    ], page: 1, nextPage: null, totalCount: null }, rateLimit: null });
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({
      number: 24,
      title: "Add GitHub pull request tab",
      url: "https://github.com/openai/githead/pull/24",
      sourceBranch: "feature/pr-tab"
    }), rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Pull Requests/ }));

    await waitFor(() => {
      expect(githead.getGitHubPullRequests).toHaveBeenCalledWith({
        repoPath,
        page: 1,
        requestId: expect.any(String)
      });
    });
    expect(await screen.findByText("#24")).toBeTruthy();
    expect(screen.getByText("Add GitHub pull request tab")).toBeTruthy();
    expect(screen.getByText("taylor")).toBeTruthy();
    expect(screen.getByLabelText("3 comments")).toBeTruthy();
    expect(screen.getByText("ui")).toBeTruthy();
    expect(screen.getByText("accessibility")).toBeTruthy();
    expect(screen.queryByText("not-shown")).toBeNull();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check out pull request #24" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Select a pull request" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Pull requests" })).queryByRole("columnheader")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Sort: Recently updated" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Newest" }));
    await user.click(screen.getByRole("button", { name: "Filters, 0 active" }));
    expect((screen.getByLabelText("Preset") as HTMLSelectElement).value).toBe("all");
    await user.keyboard("{Escape}");

    const title = screen.getByRole("button", { name: "Add GitHub pull request tab" });
    title.focus();
    await user.keyboard("{Enter}");

    const drawer = await screen.findByRole("region", { name: /Add GitHub pull request tab/ });
    expect(githead.openExternalUrl).not.toHaveBeenCalled();
    expect(within(drawer).getByRole("tab", { name: /Overview/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("listitem").getAttribute("aria-current")).toBe("true");

    await user.click(within(drawer).getByRole("button", { name: /Open on GitHub/ }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/pull/24" });

    await user.click(within(drawer).getByRole("button", { name: "Close review console" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Add GitHub pull request tab/ })).toBeNull());
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });
  });

  it("shows a recoverable empty state when pull request filters have no matches", async () => {
    const user = userEvent.setup();
    const item = createPullRequest({ number: 24, title: "Only ready pull request", draft: false });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubPullRequests).mockImplementation(async (request) => ({
      ok: true,
      data: { items: request.query?.draft === "draft" ? [] : [item], page: 1, nextPage: null, totalCount: request.query?.draft === "draft" ? 0 : 1 },
      rateLimit: null
    }));

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Pull Requests/ }));
    expect(await screen.findByRole("button", { name: "Only ready pull request" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filters, 0 active" }));
    await user.selectOptions(screen.getByLabelText("Preset"), "drafts");

    const emptyHeading = await screen.findByRole("heading", { name: "No matching pull requests" });
    const emptyState = emptyHeading.closest("section");
    expect(emptyState).toBeTruthy();
    expect(screen.getByText("Try changing or clearing your filters.")).toBeTruthy();
    await user.click(within(emptyState!).getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByRole("button", { name: "Only ready pull request" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No matching pull requests" })).toBeNull();
  });

  it("loads and merges another workflow page", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubWorkflowRuns)
      .mockResolvedValueOnce({ ok: true, data: { items: [createWorkflowRun({ id: "1", name: "First" })], page: 1, nextPage: 2, totalCount: 2 }, rateLimit: null })
      .mockResolvedValueOnce({ ok: true, data: { items: [createWorkflowRun({ id: "2", name: "Second" })], page: 2, nextPage: null, totalCount: 2 }, rateLimit: null });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Workflow Runs/ }));
    await user.click(await screen.findByRole("button", { name: "Load more workflow runs" }));

    expect(await screen.findByText("First")).toBeTruthy();
    expect(await screen.findByText("Second")).toBeTruthy();
    expect(githead.getGitHubWorkflowRuns).toHaveBeenLastCalledWith(expect.objectContaining({ repoPath, page: 2 }));
    expect(screen.queryByRole("button", { name: "Load more workflow runs" })).toBeNull();
  });

  it("downloads a missing LFS image preview only after explicit activation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("assets/image.png", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    vi.mocked(githead.getFileDiff).mockResolvedValue({
      path: "assets/image.png",
      side: "unstaged",
      kind: "image",
      text: "",
      before: { status: "lfs-missing", byteLength: 76047, fetchable: true },
      after: { status: "lfs-missing", byteLength: 76047, fetchable: true }
    });
    vi.mocked(githead.fetchLfsImageVersions).mockResolvedValue({ repoPath, exitCode: 0, stdout: "Downloaded LFS image preview.", stderr: "" });

    render(<App />);
    await user.click(await screen.findByRole("option", { name: /assets\/image\.png/ }));
    expect((await screen.findAllByText(/LFS image is not available locally/)).length).toBe(2);
    expect(githead.fetchLfsImageVersions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Download missing Git LFS image preview" }));
    await waitFor(() => expect(githead.fetchLfsImageVersions).toHaveBeenCalledWith({
      context: "status", repoPath, path: "assets/image.png", side: "unstaged", operationId: expect.any(String)
    }));
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledTimes(2));
  });

  it("generates a pull request title from the Create PR dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/pr-title",
      upstream: "origin/feature/pr-title",
      branches: [
        {
          name: "feature/pr-title",
          current: true,
          upstream: "origin/feature/pr-title"
        }
      ],
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature/pr-title",
          remote: "origin",
          branch: "feature/pr-title"
        }
      ],
      commitsAheadOfDefaultBranch: 2
    }));
    vi.mocked(githead.generatePrTitle).mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "Add generated PR titles",
      stderr: ""
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));

    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Generate pull request title" }));

    await waitFor(() => {
      expect(githead.generatePrTitle).toHaveBeenCalledWith({
        repoPath,
        baseRef: "origin/main",
        headRef: "feature/pr-title",
        operationId: expect.any(String)
      });
    });
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("Add generated PR titles");
  });

  it("recovers a missing pull request creation without accepting its stale completion", async () => {
    const user = userEvent.setup();
    const pendingCreate = defer<Awaited<ReturnType<GitheadApi["createGitHubPullRequest"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/hung-pr",
      upstream: "origin/feature/hung-pr",
      branches: [{ name: "feature/hung-pr", current: true, upstream: "origin/feature/hung-pr" }],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature/hung-pr", remote: "origin", branch: "feature/hung-pr" }
      ],
      commitsAheadOfDefaultBranch: 2,
      ahead: 0,
      behind: 0
    }));
    vi.mocked(githead.createGitHubPullRequest).mockReturnValue(pendingCreate.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));
    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Create Pull Request" }));
    await waitFor(() => expect(githead.createGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      headBranch: "feature/hung-pr",
      operationId: expect.any(String)
    })));

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const operationId = vi.mocked(githead.createGitHubPullRequest).mock.calls[0]?.[0].operationId;
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create Pull Request" })).toBeNull());

    pendingCreate.resolve({ ok: true, data: { number: 42, url: "https://github.com/openai/githead/pull/42", title: "Late PR", draft: false }, rateLimit: null });
    await flushRendererAsync();

    expect(screen.queryByRole("dialog", { name: "Create Pull Request" })).toBeNull();
    expect(screen.queryByText(/Created pull request #42/)).toBeNull();
  });

  it("preserves outcome-unknown guidance when pull request creation throws", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary({
      branch: "feature/timeout-pr",
      upstream: "origin/feature/timeout-pr",
      branches: [{ name: "feature/timeout-pr", current: true, upstream: "origin/feature/timeout-pr" }],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/feature/timeout-pr", remote: "origin", branch: "feature/timeout-pr" }
      ],
      commitsAheadOfDefaultBranch: 2,
      ahead: 0,
      behind: 0
    }));
    vi.mocked(githead.createGitHubPullRequest).mockRejectedValue(new Error("Operation timed out."));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Create PR" }));
    const dialog = screen.getByRole("dialog", { name: "Create Pull Request" });
    await user.click(within(dialog).getByRole("button", { name: "Create Pull Request" }));

    expect(await within(dialog).findByText("Operation timed out. Check GitHub before retrying; the pull request may have been created.")).toBeTruthy();
    const createButton = within(dialog).getByRole("button", { name: "Create Pull Request" }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Open Pull Requests" }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/pulls" });
    expect(createButton.disabled).toBe(false);
  });

  it("turns GitHub authentication failures into a Connect GitHub action", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockResolvedValue({
      ok: false,
      error: {
        kind: "authentication",
        message: "GitHub authentication is required.",
        retryable: false,
        retryAfterAt: null,
        outcomeUnknown: false,
        source: "rest",
        rateLimit: null
      }
    });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Issues/ }));
    await user.click(await screen.findByRole("button", { name: "Connect GitHub" }));

    expect(await screen.findByRole("tabpanel", { name: "Integrations" })).toBeTruthy();
  });

  it("creates an issue from the Issues view and refreshes GitHub data", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockResolvedValue({ ok: true, data: { items: [], page: 1, nextPage: null, totalCount: 0 }, rateLimit: null });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Issues/ }));
    await waitFor(() => expect(githead.getGitHubIssues).toHaveBeenCalled());
    const issueLoadsBeforeCreate = vi.mocked(githead.getGitHubIssues).mock.calls.length;
    const countLoadsBeforeCreate = vi.mocked(githead.getGitHubOpenCounts).mock.calls.length;

    await user.click(screen.getByRole("button", { name: "New issue" }));
    const dialog = screen.getByRole("dialog", { name: "New issue" });
    await user.type(within(dialog).getByLabelText("Title"), "Renderer fails after reconnect");
    await user.type(within(dialog).getByLabelText("Description"), "Steps to reproduce");
    await user.click(within(dialog).getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(githead.createGitHubIssue).toHaveBeenCalledWith({
      repoPath,
      title: "Renderer fails after reconnect",
      body: "Steps to reproduce",
      operationId: expect.stringMatching(/^issue-create-/)
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New issue" })).toBeNull());
    await waitFor(() => expect(vi.mocked(githead.getGitHubIssues).mock.calls.length).toBeGreaterThan(issueLoadsBeforeCreate));
    await waitFor(() => expect(vi.mocked(githead.getGitHubOpenCounts).mock.calls.length).toBeGreaterThan(countLoadsBeforeCreate));
  });

  it("builds the issue dialog from a repository Issue Form", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssueTemplates).mockResolvedValue({ ok: true, rateLimit: null, data: {
      blankIssuesEnabled: false,
      contactLinks: [],
      templates: [{
        filename: "bug.yml",
        kind: "form",
        name: "Bug report",
        description: "Report a reproducible problem",
        title: "[Bug] ",
        labels: ["bug"],
        assignees: ["octocat"],
        body: "",
        unsupportedFeatures: [],
        fields: [
          { kind: "markdown", value: "Thanks for helping us improve Githead." },
          { kind: "input", id: "version", label: "Githead version", description: "", placeholder: "0.46.0", defaultValue: "", required: true },
          { kind: "dropdown", id: "severity", label: "Severity", description: "", options: ["Low", "High"], multiple: false, required: true },
          { kind: "checkboxes", id: "terms", label: "Confirmation", description: "", options: [{ label: "I searched existing issues", required: true }] }
        ]
      }]
    } });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Issues/ }));
    await user.click(await screen.findByRole("button", { name: "New issue" }));
    const dialog = screen.getByRole("dialog", { name: "New issue" });
    await user.click(await within(dialog).findByRole("button", { name: /Bug report/ }));

    const titleInput = within(dialog).getByLabelText("Title") as HTMLInputElement;
    expect(titleInput.value).toBe("[Bug] ");
    await user.type(titleInput, "Reconnect fails");
    await user.type(within(dialog).getByLabelText(/Githead version/), "0.46.0");
    await user.selectOptions(within(dialog).getByLabelText(/Severity/), "High");
    await user.click(within(dialog).getByRole("checkbox", { name: /I searched existing issues/ }));
    await user.click(within(dialog).getByRole("button", { name: "Create issue" }));

    await waitFor(() => expect(githead.createGitHubIssue).toHaveBeenCalledWith({
      repoPath,
      title: "[Bug] Reconnect fails",
      body: "### Githead version\n\n0.46.0\n\n### Severity\n\nHigh\n\n### Confirmation\n\n- [x] I searched existing issues",
      labels: ["bug"],
      assignees: ["octocat"],
      operationId: expect.stringMatching(/^issue-create-/)
    }));
  });

  it("requires GitHub review before retrying issue creation with an unknown outcome", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.createGitHubIssue).mockResolvedValue({
      ok: false,
      error: {
        kind: "timeout",
        message: "Operation timed out.",
        retryable: false,
        retryAfterAt: null,
        outcomeUnknown: true,
        source: "combined",
        rateLimit: null
      }
    });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Issues/ }));
    await user.click(await screen.findByRole("button", { name: "New issue" }));
    const dialog = screen.getByRole("dialog", { name: "New issue" });
    await user.type(within(dialog).getByLabelText("Title"), "Possibly created issue");
    await user.click(within(dialog).getByRole("button", { name: "Create issue" }));

    expect(await within(dialog).findByText("Operation timed out. Check GitHub before retrying; the issue may have been created.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Create issue" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Open Issues" }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/issues" });
    expect((within(dialog).getByRole("button", { name: "Create issue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("loads open issues from GitHub when the Issues tab opens", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockResolvedValue({ ok: true, data: { items: [
      createIssue({
        number: 12,
        title: "Add GitHub issue tab",
        labels: [
          "enhancement",
          "needs-triage",
          "not-shown"
        ],
        comments: 4,
        url: "https://github.com/openai/githead/issues/12"
      })
    ], page: 1, nextPage: null, totalCount: null }, rateLimit: null });
    vi.mocked(githead.getGitHubIssueDetail).mockResolvedValue({ ok: true, data: createIssueDetail({
      number: 12,
      title: "Add GitHub issue tab",
      url: "https://github.com/openai/githead/issues/12"
    }), rateLimit: null });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: /Issues/ }));

    await waitFor(() => {
      expect(githead.getGitHubIssues).toHaveBeenCalledWith(expect.objectContaining({
        repoPath
      }));
    });
    expect(await screen.findByText("#12")).toBeTruthy();
    expect(screen.getByText("Add GitHub issue tab")).toBeTruthy();
    expect(screen.getByText("enhancement")).toBeTruthy();
    expect(screen.getByText("needs-triage")).toBeTruthy();
    expect(screen.queryByText("not-shown")).toBeNull();
    expect(screen.getByText("taylor")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByLabelText("4 comments")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Select an issue" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Issues" })).queryByRole("columnheader")).toBeNull();
    expect(screen.getByRole("button", { name: "Filters, 0 active" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort: Recently updated" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh issues" })).toBeTruthy();

    const title = screen.getByRole("button", { name: "Add GitHub issue tab" });
    title.focus();
    await user.keyboard("{Enter}");

    const drawer = await screen.findByRole("region", { name: /Add GitHub issue tab/ });
    expect(githead.openExternalUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("listitem").getAttribute("aria-current")).toBe("true");
    await user.click(within(drawer).getByRole("button", { name: /Open on GitHub/ }));
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/openai/githead/issues/12" });

    await user.click(within(drawer).getByRole("button", { name: "Close review console" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Add GitHub issue tab/ })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it("shows a recoverable empty state when issue filters have no matches", async () => {
    const user = userEvent.setup();
    const item = createIssue({ number: 12, title: "Assigned issue" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createGitHubSummary());
    vi.mocked(githead.getGitHubIssues).mockImplementation(async (request) => ({
      ok: true,
      data: { items: request.query?.unassigned ? [] : [item], page: 1, nextPage: null, totalCount: request.query?.unassigned ? 0 : 1 },
      rateLimit: null
    }));

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: /Issues/ }));
    expect(await screen.findByRole("button", { name: "Assigned issue" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filters, 0 active" }));
    await user.selectOptions(screen.getByLabelText("Preset"), "unassigned");

    const emptyHeading = await screen.findByRole("heading", { name: "No matching issues" });
    const emptyState = emptyHeading.closest("section");
    expect(emptyState).toBeTruthy();
    await user.click(within(emptyState!).getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByRole("button", { name: "Assigned issue" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No matching issues" })).toBeNull();
  });

  it("shows upstream commits ready to pull in the Pull action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 0,
      behind: 3
    }));

    render(<App />);

    const pullButton = await screen.findByRole("button", { name: "Pull 3 commits" });
    expect(pullButton).toBeTruthy();
    expect(within(pullButton).getByText("3")).toBeTruthy();
  });

  it("does not show a zero count in the Pull action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 0,
      behind: 0
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Pull$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pull \(0\)$/ })).toBeNull();
  });

  it.each([
    { action: "fetch", buttonName: /^Fetch$/, successLabel: "Fetched" },
    { action: "pull", buttonName: /^Pull$/, successLabel: "Pulled" }
  ])("animates $successLabel after a successful $action", async ({ action, buttonName }) => {
    const user = userEvent.setup();
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult(action));

    render(<App />);

    const button = await screen.findByRole("button", { name: buttonName });
    await user.click(button);

    await waitFor(() => {
      expect(button.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("success");
    });
  });

  it("animates failed action feedback and points to the activity log until it is opened", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("fetch", {
      exitCode: 1,
      stderr: "Unable to reach origin."
    }));

    render(<App />);

    const button = await screen.findByRole("button", { name: /^Fetch$/ });
    await user.click(button);

    await waitFor(() => {
      expect(button.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("error");
    });

    const activityLogTab = screen.getByRole("tab", { name: "Activity Log, unread error details available" });
    expect(activityLogTab.getAttribute("data-attention")).toBe("error");
    expect(activityLogTab.querySelector(".activity-log-attention-indicator")).toBeTruthy();

    await user.click(activityLogTab);
    expect(activityLogTab.getAttribute("data-attention")).toBe("none");
    expect(activityLogTab.getAttribute("aria-label")).toBe("Activity Log");
  });

  it("opens guided recovery after a forced-update pull failure", async () => {
    const user = userEvent.setup();
    const recovery = createPullRecovery();
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("pull", {
      exitCode: 1,
      stderr: "fatal: Not possible to fast-forward, aborting.",
      pullRecovery: recovery
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^Pull$/ }));

    expect(await screen.findByRole("dialog", { name: "Remote branch history changed" })).toBeTruthy();
    expect(screen.getByText("origin/feature/recovery was rewritten. Githead did not change your local branch or working files.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reapply my 2 local commits" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep current branch" }));
    expect(screen.getByRole("button", { name: "Resolve remote history change" })).toBeTruthy();
  });

  it("reapplies local commits from the recovery dialog", async () => {
    const user = userEvent.setup();
    const recovery = createPullRecovery();
    vi.mocked(githead.getPullRecovery).mockResolvedValue(recovery);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Reapply my 2 local commits" }));
    await waitFor(() => {
      expect(githead.resolvePullRecovery).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/recovery",
        action: "reapply",
        operationId: expect.any(String)
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remote branch history changed" })).toBeNull());
  });

  it("shows conflict recovery actions when reapply pauses", async () => {
    const user = userEvent.setup();
    const recovery = createPullRecovery();
    vi.mocked(githead.getPullRecovery).mockResolvedValue(recovery);
    vi.mocked(githead.resolvePullRecovery).mockResolvedValue({
      repoPath,
      exitCode: 1,
      stdout: "",
      stderr: "Resolve all conflicts manually.",
      outcome: "conflicts",
      recovery: { ...recovery, phase: "rebase-conflicts", hasWorkingChanges: true },
      recoveryRef: "refs/githead/recovery/feature/recovery"
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Reapply my 2 local commits" }));

    expect(await screen.findByRole("dialog", { name: "Reapply paused because of conflicts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open File Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abort and restore" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue after resolution" })).toBeTruthy();
  });

  it("cancels an active pull recovery from the modal", async () => {
    const user = userEvent.setup();
    const recovery = createPullRecovery();
    const pending = defer<Awaited<ReturnType<GitheadApi["resolvePullRecovery"]>>>();
    vi.mocked(githead.getPullRecovery).mockResolvedValue(recovery);
    vi.mocked(githead.resolvePullRecovery).mockReturnValue(pending.promise);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Reapply my 2 local commits" }));
    await user.click(await screen.findByRole("button", { name: "Cancel operation" }));

    const operationId = vi.mocked(githead.resolvePullRecovery).mock.calls[0]?.[0].operationId;
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId }));
    pending.resolve({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Operation was cancelled.",
      outcome: "failed",
      recovery,
      recoveryRef: null
    });
  });

  it("orders repository actions before Fetch, Pull, and Push", async () => {
    render(<App />);

    const actionsGroup = await screen.findByRole("group", { name: "Git actions" });
    const buttons = within(actionsGroup).getAllByRole("button");

    expect(buttons.slice(0, 4).map((button) => button.textContent?.trim())).toEqual([
      "Actions",
      "Fetch",
      "Pull",
      "Push"
    ]);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Repository actions");
    expect(buttons[4]?.getAttribute("aria-label")).toBe("More push actions");
  });

  it("shows upstream commits ready to push in the Push action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 2,
      behind: 0
    }));

    render(<App />);

    const actionsGroup = await screen.findByRole("group", { name: "Git actions" });

    const pushButton = within(actionsGroup).getByRole("button", { name: "Push 2 commits" });
    expect(pushButton).toBeTruthy();
    expect(within(pushButton).getByText("2")).toBeTruthy();
  });

  it("shows upstream commits ready to push in the primary commit action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 5,
      behind: 0
    }));

    render(<App />);

    const commitPanel = await screen.findByLabelText("Commit staged files");
    const pushButton = within(commitPanel).getByRole("button", { name: "Push 5 commits" });
    expect(pushButton).toBeTruthy();
    expect(within(pushButton).getByText("5")).toBeTruthy();
  });

  it("does not show a zero count in the Push action", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      ahead: 0,
      behind: 0
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Push$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Push \(0\)$/ })).toBeNull();
  });

  it("runs Push from the sync toolbar", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.runGitAction).mockResolvedValue({
      runId: "run-push",
      action: "push",
      repoPath,
      exitCode: 0,
      stdout: "",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");

    const pushButton = await screen.findByRole("button", { name: /^Push$/ });
    await user.click(pushButton);

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(pushButton.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("success");
    });
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /^Activity Log/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("shows branch-and-tag partial success explicitly after Push", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "Branch push to 'origin' succeeded, but the automatic tag push failed. The branch remains pushed and was not rolled back.",
      push: {
        branchSucceeded: true,
        partialSuccess: true,
        remoteName: "origin",
        tagPushBehavior: "all",
        tagOutcome: "failed"
      }
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    expect(await screen.findByRole("heading", { name: "Push partially complete" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Activity Log, unread error details available" })).toBeTruthy();
  });

  it("lazily renders and caches the working Markdown preview", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("README.md", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "diff-value"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({
      path: file.path,
      text: "# Rendered heading\n\n**bold text**\n\n<script>unsafe</script>"
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /README\.md/ }));
    const previewButton = await screen.findByRole("button", { name: "Preview" });
    expect(screen.getByRole("button", { name: "Wrap diff lines" })).toBeTruthy();
    expect(githead.getFilePreview).not.toHaveBeenCalled();
    await user.click(previewButton);

    expect(await screen.findByRole(
      "heading",
      { name: "Rendered heading" },
      { timeout: 5_000 }
    )).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wrap diff lines" })).toBeNull();
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
    expect(screen.queryByText("unsafe")).toBeNull();
    expect(githead.getFilePreview).toHaveBeenCalledWith({
      repoPath,
      path: "README.md",
      source: { kind: "working" },
      requestId: expect.stringMatching(/^file-preview:/)
    });

    await user.click(screen.getByRole("button", { name: "Show Diff" }));
    expect(screen.getByRole("button", { name: "Wrap diff lines" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(githead.getFilePreview).toHaveBeenCalledTimes(1);
  });

  it("renders GFM pipe tables as a semantic table constrained to the preview", async () => {
    const user = userEvent.setup();
    const file = createStatusFile("README.md", { isUnstaged: true, worktreeStatus: "M" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [file] }));
    vi.mocked(githead.getFileDiff).mockResolvedValue(createTextDiff(file.path, "diff-value"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({
      path: file.path,
      text: [
        "| Left | Center | Right |",
        "| :--- | :----: | ---: |",
        "| Alpha | Beta | Gamma |",
        "",
        "<table><tbody><tr><td>Unsafe HTML table</td></tr></tbody></table>"
      ].join("\n")
    });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /README\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));

    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Left", "Center", "Right"]);
    expect(headers.map((header) => header.style.textAlign)).toEqual(["left", "center", "right"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(table.parentElement?.classList.contains("markdown-preview-table")).toBe(true);
    expect(table.parentElement?.getAttribute("role")).toBeNull();
    expect(table.parentElement?.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByText("Unsafe HTML table")).toBeNull();
  });

  it("uses the staged source for .markdown files and hides preview for deleted targets", async () => {
    const user = userEvent.setup();
    const staged = createStatusFile("docs/guide.markdown", { isStaged: true, indexStatus: "M" });
    const deleted = createStatusFile("deleted.md", { isUnstaged: true, worktreeStatus: "D" });
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [staged, deleted] }));
    vi.mocked(githead.getFileDiff).mockImplementation(async ({ path, side }) => createTextDiff(path, "value", side));
    vi.mocked(githead.getFilePreview).mockImplementation(async ({ path }) => ({ path, text: "# Preview" }));

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /docs\/guide\.markdown/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    await waitFor(() => expect(githead.getFilePreview).toHaveBeenCalledWith(expect.objectContaining({
      path: staged.path,
      source: { kind: "staged" }
    })));

    await user.click(screen.getByRole("option", { name: /deleted\.md/ }));
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("renders the selected commit version of a Markdown file", async () => {
    const user = userEvent.setup();
    const commit = createCommit();
    vi.mocked(githead.getAppSettings).mockResolvedValue({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: true,
      gitBehaviors: { tagPushBehavior: "all" }
    });
    vi.mocked(githead.getCommitHistory).mockResolvedValue([commit]);
    vi.mocked(githead.getCommitDetails).mockResolvedValue(createCommitDetails(commit.hash, {
      files: [{ path: "README.md", status: "M", additions: 2, deletions: 1 }]
    }));
    vi.mocked(githead.getCommitFileDiff).mockResolvedValue(createTextDiff("README.md", "commit-diff"));
    vi.mocked(githead.getFilePreview).mockResolvedValue({ path: "README.md", text: "# Commit preview" });

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("tab", { name: /Commit History/ }));
    await screen.findByRole("option", { name: /README\.md/ });
    expect((await screen.findByRole("button", { name: "Wrap diff lines" })).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".diff-output.text")?.classList.contains("is-wrapped")).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("heading", { name: "Commit preview" })).toBeTruthy();
    expect(githead.getFilePreview).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      path: "README.md",
      source: { kind: "commit", hash: commit.hash }
    }));
  });

  it("cancels and ignores a stale Markdown preview when file selection changes", async () => {
    const user = userEvent.setup();
    const firstPreview = defer<{ path: string; text: string }>();
    const files = [
      createStatusFile("first.md", { isUnstaged: true, worktreeStatus: "M" }),
      createStatusFile("second.md", { isUnstaged: true, worktreeStatus: "M" })
    ];
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files }));
    vi.mocked(githead.getFileDiff).mockImplementation(async ({ path, side }) => createTextDiff(path, "value", side));
    vi.mocked(githead.getFilePreview)
      .mockReturnValueOnce(firstPreview.promise)
      .mockResolvedValueOnce({ path: "second.md", text: "# Second preview" });

    render(<App />);

    await user.click(await screen.findByRole("option", { name: /first\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    const firstRequestId = vi.mocked(githead.getFilePreview).mock.calls[0]?.[0].requestId;
    await user.click(screen.getByRole("option", { name: /second\.md/ }));

    await waitFor(() => expect(githead.cancelRepositoryRead).toHaveBeenCalledWith({ requestId: firstRequestId }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("heading", { name: "Second preview" })).toBeTruthy();

    firstPreview.resolve({ path: "first.md", text: "# Stale first preview" });
    await flushRendererAsync();
    expect(screen.queryByRole("heading", { name: "Stale first preview" })).toBeNull();
  });

  it("pushes the current branch to a selected existing remote branch without changing upstream", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: "upstream/main",
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" },
        { name: "upstream", url: "https://example.test/upstream.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/release", remote: "origin", branch: "release" },
        { name: "upstream/main", remote: "upstream", branch: "main" },
        { name: "upstream/release", remote: "upstream", branch: "release" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push"));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));

    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    expect(within(dialog).getByRole("button", { name: "Select push remote" }).textContent).toContain("upstream");
    expect(within(dialog).queryByRole("option", { name: "main" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Select destination branch" }));
    await user.click(await screen.findByRole("option", { name: /release.*upstream/ }));
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        pushTarget: {
          sourceBranch: "feature/source",
          remoteName: "upstream",
          destinationBranch: "release"
        },
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Push to Another Branch" })).toBeNull();
    });
    expect(githead.setBranchUpstream).not.toHaveBeenCalled();
  });

  it("can push a Publish-state branch to a new remote branch without tracking it", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: null,
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push"));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Publish branch" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));
    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    await user.click(within(dialog).getByRole("button", { name: "Select destination branch" }));
    await user.click(await screen.findByRole("option", { name: "New branch…" }));
    await user.type(within(dialog).getByLabelText("New branch name"), "release/candidate");
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        pushTarget: {
          sourceBranch: "feature/source",
          remoteName: "origin",
          destinationBranch: "release/candidate"
        },
        operationId: expect.any(String)
      });
    });
    expect(githead.publishBranch).not.toHaveBeenCalled();
  });

  it("keeps the push-to-branch dialog open when the targeted push fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/source",
      upstream: "origin/main",
      remotes: [
        { name: "origin", url: "https://example.test/repo.git", direction: "push" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/release", remote: "origin", branch: "release" }
      ]
    }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "rejected non-fast-forward"
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "More push actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Push to another branch…" }));
    const dialog = await screen.findByRole("dialog", { name: "Push to Another Branch" });
    await user.click(within(dialog).getByRole("button", { name: "Select destination branch" }));
    await user.click(await screen.findByRole("option", { name: /release.*origin/ }));
    await user.click(within(dialog).getByRole("button", { name: "Push" }));

    expect(await within(dialog).findByText("rejected non-fast-forward")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Push to Another Branch" })).toBeTruthy();
  });

  it("disables push-to-branch when no push remote exists and hides it when unsupported", async () => {
    const { unmount } = render(<App />);
    expect((await screen.findByRole("button", { name: "More push actions" }) as HTMLButtonElement).disabled).toBe(true);

    unmount();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      capabilities: {
        ...gitCapabilities(),
        pushToBranch: false
      }
    }));
    render(<App />);
    await screen.findByRole("button", { name: /^Push$/ });
    expect(screen.queryByRole("button", { name: "More push actions" })).toBeNull();
  });

  it("shows Publish instead of Push when the current branch has no upstream", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Publish branch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Push$/ })).toBeNull();
  });

  it("opens the publish dialog instead of running plain push", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));

    expect(await screen.findByRole("heading", { name: "Publish Branch" })).toBeTruthy();
    expect(screen.getAllByText("feature/publish").length).toBeGreaterThan(0);
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("publishes a branch to origin by default", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        },
        {
          name: "upstream",
          url: "https://example.test/upstream.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(githead.publishBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/publish",
        remoteName: "origin",
        operationId: expect.any(String)
      });
    });
  });

  it("lets the user choose among multiple publish remotes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        },
        {
          name: "upstream",
          url: "https://example.test/upstream.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.click(await screen.findByRole("button", { name: "Select publish remote" }));
    await user.click(await screen.findByRole("option", { name: "upstream" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(githead.publishBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/publish",
        remoteName: "upstream",
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the publish dialog open when publishing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branch: "feature/publish",
      upstream: null,
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));
    vi.mocked(githead.publishBranch).mockResolvedValue(createRunResult("publish", {
      exitCode: 1,
      stderr: "fatal: rejected"
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Publish branch" }));
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText("fatal: rejected")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Publish Branch" })).toBeTruthy();
  });

  it("opens the publish dialog after a stale plain push no-upstream failure", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        upstream: "origin/main",
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }))
      .mockResolvedValue(createSummary({
        branch: "feature/publish",
        upstream: null,
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "fatal: The current branch feature/publish has no upstream branch."
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    expect(await screen.findByText("This branch has no upstream. Publish it to set one.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Publish Branch" })).toBeTruthy();
  });

  it("does not open the publish dialog after unrelated push failures", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary)
      .mockResolvedValueOnce(createSummary({
        upstream: "origin/main",
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }))
      .mockResolvedValue(createSummary({
        branch: "feature/publish",
        upstream: null,
        remotes: [
          {
            name: "origin",
            url: "https://example.test/repo.git",
            direction: "push"
          }
        ]
      }));
    vi.mocked(githead.runGitAction).mockResolvedValue(createRunResult("push", {
      exitCode: 1,
      stderr: "fatal: Authentication failed"
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /^Push$/ }));

    await waitFor(() => {
      expect(githead.runGitAction).toHaveBeenCalledWith({
        repoPath,
        action: "push",
        operationId: expect.any(String)
      });
    });
    expect(screen.queryByRole("heading", { name: "Publish Branch" })).toBeNull();
  });

  it("does not show Publish when set upstream is not supported", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      upstream: null,
      capabilities: {
        ...gitCapabilities(),
        setUpstream: false
      },
      remotes: [
        {
          name: "origin",
          url: "https://example.test/repo.git",
          direction: "push"
        }
      ]
    }));

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Push$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish branch" })).toBeNull();
  });

  it("does not jump to the Activity Log when action trust is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoTrust).mockResolvedValue({
      trusted: false
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    await user.click(await screen.findByRole("button", { name: /^Push$/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(githead.getRepoTrust).toHaveBeenCalledWith({
        repoPath
      });
    });
    expect(githead.runGitAction).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /^Activity Log/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("opens the Repository Actions manager without a .githead folder and saves a shared action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForRepositoryWorkspace();

    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Build");
    await user.type(screen.getByLabelText(/Description/), " Compile the application ");
    await user.type(screen.getByLabelText("Command"), "npm run build");
    await user.click(screen.getByRole("button", { name: "Save Shared" }));

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Build",
            description: "Compile the application",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the Repository Actions body scrollable when many actions are configured", async () => {
    const user = userEvent.setup();
    const sharedActions = Array.from({ length: 14 }, (_, index) => ({
      name: `Action ${index + 1}`,
      description: "",
      command: `npm run action-${index + 1}`,
      shell: "powershell" as const
    }));
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: sharedActions
        },
        actions: sharedActions
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));

    const actionsDialog = await screen.findByRole("dialog", { name: "Repository Actions" });
    expect(actionsDialog.className).toContain("h-[min(760px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("max-h-[min(760px,calc(100vh-2rem))]");
    expect(actionsDialog.className).toContain("overflow-hidden");

    const scrollArea = screen.getByTestId("repository-actions-scroll-area");
    expect(scrollArea.className).toContain("h-full");
    expect(scrollArea.className).toContain("min-h-0");
    expect(screen.getByRole("button", { name: /14Action 14powershell/ })).toBeTruthy();
  });

  it("renders and runs configured repository actions", async () => {
    const user = userEvent.setup();
    const action = {
      name: "Build",
      description: "Compile the application",
      command: "npm run build",
      shell: "powershell" as const
    };
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [
          action
        ],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockResolvedValue({
      runId: "run-build",
      action: "Build",
      repoPath,
      exitCode: 0,
      stdout: "built\n",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });

    render(<App />);

    await user.click(await screen.findByRole("tab", { name: "Commit History" }));
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.hover(await screen.findByRole("menuitem", { name: "Build" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("Compile the application");
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    await waitFor(() => {
      expect(githead.runConfiguredAction).toHaveBeenCalledWith({
        repoPath,
        name: "Build",
        operationId: expect.any(String)
      });
    });
    expect(screen.getByRole("tab", { name: /^Activity Log/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("does not retarget a configured action when the repository changes during trust lookup", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Other";
    const pendingTrust = defer<{ trusted: boolean }>();
    const action = {
      name: "Build",
      description: "",
      command: "npm run build",
      shell: "powershell" as const
    };
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath,
      actionsConfig: {
        hasGitheadDir: true,
        actions: [action],
        error: ""
      }
    }));
    vi.mocked(githead.getRepoTrust).mockReturnValue(pendingTrust.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    await waitFor(() => expect(githead.getRepoTrust).toHaveBeenCalledWith({ repoPath }));

    fireEvent.click(screen.getByRole("button", { name: `Switch to ${otherRepo}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Switch to ${otherRepo}` }).getAttribute("aria-current")).toBe("true"));

    pendingTrust.resolve({ trusted: true });
    await flushRendererAsync();

    expect(githead.runConfiguredAction).not.toHaveBeenCalled();
  });

  it("shows configured action running and result headings", async () => {
    const user = userEvent.setup();
    const pendingAction = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [
          {
            name: "Build",
            description: "",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(pendingAction.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));

    expect(await screen.findByText("Build running")).toBeTruthy();

    pendingAction.resolve({
      runId: "run-build",
      action: "Build",
      repoPath,
      exitCode: 0,
      stdout: "built\n",
      stderr: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString()
    });
    await flushRendererAsync();

    expect(await screen.findByText("Build complete")).toBeTruthy();
  });

  it("recovers a lost configured action result and ignores its late completion", async () => {
    const user = userEvent.setup();
    const pendingAction = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(pendingAction.promise);
    vi.mocked(githead.getGitOperationStates).mockImplementation(async ({ operationIds }) => (
      operationIds.map((operationId) => ({ operationId, state: "not-found" }))
    ));

    render(<App />);
    await flushRendererAsync();
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("menuitem", { name: "Build" }));
    await flushRendererAsync();

    expect(screen.getByText("Build running")).toBeTruthy();
    const operationId = vi.mocked(githead.runConfiguredAction).mock.calls[0]?.[0].operationId;
    vi.mocked(githead.getRepoStatus).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await flushRendererAsync();

    expect(githead.getGitOperationStates).toHaveBeenCalledWith({ operationIds: [operationId] });
    expect(screen.queryByText("Build running")).toBeNull();
    expect(githead.getRepoStatus).toHaveBeenCalled();

    pendingAction.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(screen.queryByText("Build complete")).toBeNull();
  });

  it("runs repeated configured actions concurrently and tracks each completion", async () => {
    const user = userEvent.setup();
    const first = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    const second = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<App />);

    for (let index = 0; index < 2; index += 1) {
      await user.click(await screen.findByRole("button", { name: "Repository actions" }));
      await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    }

    expect(await screen.findByText("2 actions running")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repository actions" }).textContent).toContain("Actions 2");

    first.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(await screen.findByText("Build running")).toBeTruthy();

    second.resolve(createRunResult("Build"));
    await flushRendererAsync();
    expect(await screen.findByText("Build complete")).toBeTruthy();
  });

  it("allows Fetch to start while a configured action is running", async () => {
    const user = userEvent.setup();
    const configured = defer<Awaited<ReturnType<GitheadApi["runConfiguredAction"]>>>();
    const fetch = defer<Awaited<ReturnType<GitheadApi["runGitAction"]>>>();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }],
        error: ""
      }
    }));
    vi.mocked(githead.runConfiguredAction).mockReturnValue(configured.promise);
    vi.mocked(githead.runGitAction).mockReturnValue(fetch.promise);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Build" }));
    await user.click(await screen.findByRole("button", { name: "Fetch" }));

    expect(githead.runGitAction).toHaveBeenCalledWith({ repoPath, action: "fetch", operationId: expect.any(String) });
    expect(screen.getByRole("button", { name: "Repository actions" }).hasAttribute("disabled")).toBe(false);

    fetch.resolve(createRunResult("fetch"));
    configured.resolve(createRunResult("Build"));
    await flushRendererAsync();
  });

  it("shows configured action errors without enabling execution", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        actions: [],
        error: "actions.toml: Action \"Build\" has an invalid shell."
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));

    expect(await screen.findByText("actions.toml: Action \"Build\" has an invalid shell.")).toBeTruthy();
    expect(githead.runConfiguredAction).not.toHaveBeenCalled();
  });

  it("shows local Repository Actions that override shared actions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            }
          ]
        },
        local: {
          exists: true,
          actions: [
            {
              name: "build",
              description: "",
              command: "npm run build:local",
              shell: "cmd"
            }
          ]
        },
        actions: [
          {
            name: "build",
            description: "",
            command: "npm run build:local",
            shell: "cmd"
          }
        ]
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));

    await user.click(screen.getByRole("tab", { name: /Local/ }));
    expect(await screen.findByText("Overrides Shared")).toBeTruthy();
  });

  it("saves reordered Repository Actions in file order", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            },
            {
              name: "Test",
              description: "",
              command: "npm test",
              shell: "bash"
            }
          ]
        }
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: /2Testbash/ }));
    await user.click(await screen.findByRole("button", { name: "Move Test up" }));
    await user.click(screen.getByRole("button", { name: "Save Shared" }));

    await waitFor(() => {
      expect(githead.saveConfiguredActions).toHaveBeenCalledWith({
        repoPath,
        target: "shared",
        actions: [
          {
            name: "Test",
            description: "",
            command: "npm test",
            shell: "bash"
          },
          {
            name: "Build",
            description: "",
            command: "npm run build",
            shell: "powershell"
          }
        ],
        operationId: expect.any(String)
      });
    });
  });

  it("shows blocked Repository Action files without enabling structured edits", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        local: {
          exists: true,
          writable: false,
          blockedReason: "This file contains comments. Edit it manually to preserve them.",
          actions: [
            {
              name: "Build",
              description: "",
              command: "npm run build",
              shell: "powershell"
            }
          ]
        }
      }
    }));

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("tab", { name: /Local/ }));

    expect(await screen.findByText("This file contains comments. Edit it manually to preserve them.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add local action" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save Local" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("undoes draft Repository Action deletions before saving", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      actionsConfig: {
        hasGitheadDir: true,
        shared: {
          exists: true,
          actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }]
        },
        actions: [{ name: "Build", description: "", command: "npm run build", shell: "powershell" }]
      }
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(await screen.findByRole("button", { name: "Delete Build" }));

    expect(screen.getByText("1 action removed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByDisplayValue("Build")).toBeTruthy();
    expect(screen.queryByText("1 action removed")).toBeNull();
  });

  it("warns before closing Repository Actions with unsaved changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Build");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog", { name: "Repository Actions" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Repository Actions" })).toBeNull();
  });

  it("closes and clears a repository action draft when an open picker switches repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Actions-B";
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    await user.click(screen.getByRole("button", { name: "Add action" }));
    await user.type(screen.getByLabelText("Name"), "Repository A Draft");

    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Repository Actions" })).toBeNull());

    await user.click(screen.getByRole("button", { name: "Repository actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage Repository Actions" }));
    expect(screen.queryByDisplayValue("Repository A Draft")).toBeNull();
  });
});
