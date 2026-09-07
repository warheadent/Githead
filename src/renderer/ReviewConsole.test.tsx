// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  it("rechecks merge availability when details change during confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail)
      .mockResolvedValueOnce({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null })
      .mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console", canMerge: false, mergeStatus: "blocked" }), rateLimit: null });
    renderConsole();
    await waitFor(() => expect(screen.getByRole("button", { name: "Merge" }).hasAttribute("disabled")).toBe(false));
    await user.click(screen.getByRole("button", { name: "Merge" }));
    await user.click(screen.getByRole("button", { name: "Refresh details" }));
    await screen.findByText("Blocked");

    const confirm = screen.getByRole("button", { name: "Confirm merge" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.click(confirm);
    expect(githead.mergeGitHubPullRequest).not.toHaveBeenCalled();
  });

  it.each(["unknown outcome", "connection failure"] as const)("keeps a comment draft and explains recovery after %s", async (outcome) => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    if (outcome === "connection failure") vi.mocked(githead.commentOnGitHubItem).mockRejectedValue(new Error("Connection lost."));
    else vi.mocked(githead.commentOnGitHubItem).mockResolvedValue({
      ok: false,
      error: { kind: "timeout", message: "Connection lost.", retryable: false, retryAfterAt: null, outcomeUnknown: true, source: "rest", rateLimit: null }
    });
    renderConsole();
    const input = await screen.findByRole("textbox", { name: "Write a comment" });
    await user.type(input, "Please keep this comment draft.");
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect((await screen.findByRole("alert")).textContent).toContain("GitHub may have accepted the request.");
    expect(screen.getByRole("alert").textContent).toContain("Refresh details or check GitHub before trying again.");
    expect((input as HTMLTextAreaElement).value).toBe("Please keep this comment draft.");
    expect(githead.commentOnGitHubItem).toHaveBeenCalledTimes(1);
  });

  it("focuses each console's own comment input when its label is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    vi.mocked(githead.getGitHubIssueDetail).mockResolvedValue({ ok: true, data: createIssueDetail({ number: 12, title: "Issue console" }), rateLimit: null });
    renderConsole();
    await screen.findByRole("textbox", { name: "Write a comment" });
    renderConsole({ selection: { itemType: "issue", item: createIssue({ number: 12, title: "Issue console" }) } });
    const issueConsole = within(await screen.findByRole("region", { name: "Issue console" }));
    const issueInput = await issueConsole.findByRole("textbox");

    await user.click(issueConsole.getByText("Write a comment"));
    expect(document.activeElement).toBe(issueInput);

    const pullRequestConsole = within(screen.getByRole("region", { name: "Review console" }));
    await user.click(pullRequestConsole.getByText("Write a comment"));
    expect(document.activeElement).toBe(pullRequestConsole.getByRole("textbox", { name: "Write a comment" }));
    expect(issueConsole.getByRole("textbox", { name: "Write a comment" })).toBe(issueInput);
  });

  it("ignores comment results after switching repositories with the same item number", async () => {
    const user = userEvent.setup();
    const pending = defer<Awaited<ReturnType<typeof githead.commentOnGitHubItem>>>();
    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null });
    vi.mocked(githead.commentOnGitHubItem).mockReturnValue(pending.promise);
    const { props, rerender } = renderConsole();
    await user.type(await screen.findByRole("textbox", { name: "Write a comment" }), "First repository comment.");
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    rerender(<TooltipProvider><ReviewConsole {...props} repoPath="/other-repo" githubFullName="openai/other" /></TooltipProvider>);
    const input = await screen.findByRole("textbox", { name: "Write a comment" });
    expect((input as HTMLTextAreaElement).value).toBe("");
    await user.type(input, "Second repository draft.");
    await act(async () => { pending.resolve({ ok: true, data: { number: 24, url: pullRequest.url, merged: false, message: "Comment added." }, rateLimit: null }); });

    expect((input as HTMLTextAreaElement).value).toBe("Second repository draft.");
    expect(githead.getGitHubPullRequestDetail).toHaveBeenCalledTimes(2);
  });

  it("refreshes cached details, keeps them visible on failure, and retries", async () => {
    const user = userEvent.setup();
    const pending = defer<Awaited<ReturnType<typeof githead.getGitHubPullRequestDetail>>>();
    vi.mocked(githead.getGitHubPullRequestDetail)
      .mockResolvedValueOnce({ ok: true, data: createPullRequestDetail({ number: 24, title: "Review console" }), rateLimit: null })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 24, title: "Updated review" }), rateLimit: null });
    renderConsole();
    await screen.findByRole("textbox", { name: "Write a comment" });

    await user.click(screen.getByRole("button", { name: "Refresh details" }));
    expect(screen.getByRole("button", { name: "Refresh details" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("region", { name: "Review console" })).toBeTruthy();
    pending.resolve({ ok: false, error: { kind: "offline", message: "Network unavailable.", retryable: true, retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null } });

    expect((await screen.findByText(/Showing cached details/)).textContent).toContain("Network unavailable.");
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("region", { name: "Updated review" });
    expect(githead.getGitHubPullRequestDetail).toHaveBeenCalledTimes(3);
  });

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
    expect((await screen.findByRole("alert")).textContent).toBe("Approval is not permitted.");
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Merge" }).hasAttribute("disabled")).toBe(false));
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(githead.mergeGitHubPullRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(githead.mergeGitHubPullRequest).toHaveBeenCalledWith(expect.objectContaining({ number: 24, operationId: expect.any(String) })));
    await waitFor(() => expect(onMerged).toHaveBeenCalledTimes(1));
    unmount();

    vi.mocked(githead.getGitHubPullRequestDetail).mockResolvedValue({ ok: true, data: createPullRequestDetail({ number: 25, title: "Conflicting", mergeable: false, mergeStatus: "conflicting", canMerge: false }), rateLimit: null });
    renderConsole({ selection: { itemType: "pullRequest", item: createPullRequest({ number: 25, title: "Conflicting" }) } });
    const merge = await screen.findByRole("button", { name: "Merge" });
    expect(merge.hasAttribute("disabled")).toBe(true);
    await screen.findByLabelText("GitHub reports merge conflicts.");
    const trigger = merge.parentElement!;
    expect(trigger.tabIndex).toBe(0);
    trigger.focus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("conflicts");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  });
});
