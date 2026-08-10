// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createIssue,
  createIssueDetail,
  createPullRequest,
  createPullRequestDetail,
  defer,
  githead,
  repoPath
} from "./AppTestHarness";
import { ReviewConsole } from "./ReviewConsole";

const pullRequest = createPullRequest({ number: 24, title: "Review console", url: "https://github.com/openai/githead/pull/24" });

function renderConsole(overrides: Partial<React.ComponentProps<typeof ReviewConsole>> = {}) {
  const props: React.ComponentProps<typeof ReviewConsole> = {
    repoPath,
    githubFullName: "openai/githead",
    selection: { itemType: "pullRequest", item: pullRequest },
    onClose: vi.fn(),
    onCheckout: vi.fn(),
    onOpenExternalUrl: vi.fn(),
    onMerged: vi.fn(),
    ...overrides
  };
  return { ...render(<TooltipProvider><ReviewConsole {...props} /></TooltipProvider>), props };
}

describe("ReviewConsole", () => {
  it("shows GitHub-style added and removed line totals in pull request details", async () => {
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({
      ok: true,
      data: createPullRequestDetail({ number: 24, title: "Review console", additions: 18, deletions: 7 }),
      rateLimit: null
    });
    renderConsole();

    const drawer = await screen.findByRole("region", { name: "Review console" });
    expect(within(drawer).getByRole("group", { name: "Line changes" })).toBeTruthy();
    expect(within(drawer).getByLabelText("18 lines added").textContent).toBe("+18");
    expect(within(drawer).getByLabelText("7 lines removed").textContent).toBe("−7");
  });

  it("supports tab keyboard navigation and Escape without trapping focus", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    const { props } = renderConsole();
    const drawer = screen.getByRole("region", { name: "Review console" });
    expect(within(drawer).getAllByRole("button", { name: /Open on GitHub/ })).toHaveLength(1);
    expect(within(drawer).queryByRole("button", { name: "Comment" })).toBeNull();
    const overview = within(drawer).getByRole("tab", { name: /Overview/ });
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(drawer).getByRole("tab", { name: /Files/ }).getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it("shows approve progress and mutation errors inside the drawer", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    const pending = defer<Awaited<ReturnType<typeof githead.approveGitHubPullRequest>>>();
    vi.mocked(githead.approveGitHubPullRequest).mockReturnValue(pending.promise);
    renderConsole();

    const approve = await screen.findByRole("button", { name: "Approve" });
    await user.click(approve);
    expect(approve.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Approving pull request")).toBeTruthy();

    pending.resolve({
      ok: false,
      error: { kind: "authorization", message: "Approval is not permitted.", retryable: false, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null }
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Approval is not permitted.");
  });

  it("submits comments and refreshes detail after success", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    renderConsole();

    await user.type(await screen.findByRole("textbox", { name: "Write a comment" }), "Looks good to me.");
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => expect(githead.commentOnGitHubItem).toHaveBeenCalledWith(expect.objectContaining({
      repoPath,
      itemType: "pullRequest",
      number: 24,
      body: "Looks good to me.",
      operationId: expect.any(String)
    })));
    await waitFor(() => expect(githead.getGitHubPullRequestDetail).toHaveBeenCalledTimes(2));
    expect((screen.getByRole("textbox", { name: "Write a comment" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("shows supported issue metadata and backed external links", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubIssueDetail).mockResolvedValue({ ok: true, data: createIssueDetail({
      number: 12,
      title: "Issue console",
      state: "closed",
      closedAt: "2026-05-31T10:00:00Z",
      comments: [{ id: "comment-1", kind: "issue", author: { login: "alex", avatarUrl: "", url: "https://github.com/alex" }, body: "Tracked here.", createdAt: "2026-05-30T11:00:00Z", updatedAt: "2026-05-30T11:00:00Z", url: "comment-url", path: null, line: null, side: null, diffHunk: null }],
      assignees: [{ login: "alex", avatarUrl: "", url: "https://github.com/alex" }],
      labels: [{ name: "enhancement", color: "84b6eb" }],
      milestone: { number: 2, title: "Next", url: "https://github.com/openai/githead/milestone/2" },
      linkedPullRequests: [{ number: 31, title: "Fix issue", state: "open", url: "https://github.com/openai/githead/pull/31" }]
    }), rateLimit: null });
    const { props } = renderConsole({ selection: { itemType: "issue", item: createIssue({ number: 12, title: "Issue console", state: "closed" }) } });

    const drawer = await screen.findByRole("region", { name: "Issue console" });
    expect(within(drawer).getByRole("tab", { name: /Overview.*1 comment/ })).toBeTruthy();
    expect(within(drawer).getByText("Activity")).toBeTruthy();
    expect(within(drawer).getByText("Tracked here.")).toBeTruthy();
    expect(within(drawer).getByText("enhancement")).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: "Merge" })).toBeNull();
    expect(within(drawer).getByRole("button", { name: "Comment" })).toBeTruthy();

    await user.click(within(drawer).getByRole("button", { name: "alex" }));
    await user.click(within(drawer).getByRole("button", { name: "Next" }));
    await user.click(within(drawer).getByRole("button", { name: /#31 Fix issue/ }));
    expect(props.onOpenExternalUrl).toHaveBeenNthCalledWith(1, "https://github.com/alex");
    expect(props.onOpenExternalUrl).toHaveBeenNthCalledWith(2, "https://github.com/openai/githead/milestone/2");
    expect(props.onOpenExternalUrl).toHaveBeenNthCalledWith(3, "https://github.com/openai/githead/pull/31");
  });

  it("requires confirmation, disables non-mergeable requests, and reports successful merges", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    const onMerged = vi.fn();
    const { unmount } = renderConsole({ onMerged });
    await user.click(await screen.findByRole("button", { name: "Merge" }));
    expect(githead.mergeGitHubPullRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(githead.mergeGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({ number: 24, operationId: expect.any(String) })));
    await waitFor(() => expect(onMerged).toHaveBeenCalledTimes(1));
    unmount();

    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 25, title: "Conflicting", mergeable: false, mergeStatus: "conflicting", canMerge: false }), rateLimit: null });
    renderConsole({ selection: { itemType: "pullRequest", item: createPullRequest({ number: 25, title: "Conflicting" }) } });
    expect((await screen.findByRole("button", { name: "Merge" })).hasAttribute("disabled")).toBe(true);
  });
});
