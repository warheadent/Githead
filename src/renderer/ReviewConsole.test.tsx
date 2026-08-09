// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
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
