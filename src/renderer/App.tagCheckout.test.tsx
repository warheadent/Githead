// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { App } from "./App";
import { CheckoutTagDialog } from "./CheckoutTagDialog";
import { createPullRecovery, createSummary, defer, flushRendererAsync, githead, repoPath, waitForRepositoryWorkspace } from "./AppTestHarness";
import type { GitCheckoutTag } from "../shared/types";

const tag = { name: "v2", objectId: "a".repeat(40), commitId: "b".repeat(40), description: "Release two" };

describe("tag checkout UI", () => {
  it("opens from the branch picker and checks out the selected tag", async () => {
    vi.mocked(githead.getCheckoutTags).mockResolvedValue([tag]);
    render(<App />);
    await waitForRepositoryWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out tag…" }));
    await screen.findByRole("dialog", { name: "Check out tag" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Select tag" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Select tag" }));
    fireEvent.click(screen.getByRole("option", { name: /v2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check out tag" }));
    await waitFor(() => expect(githead.checkoutTag).toHaveBeenCalledWith({ repoPath, tagName: "v2", expectedObjectId: tag.objectId, operationId: expect.any(String) }));
  });
  it("shows the tag on restart and disables Pull", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ branch: null, currentTag: "v2", upstream: null }));
    render(<App />);
    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: "Switch branch" }).textContent).toContain("Tag: v2");
    const pull = screen.getByRole("button", { name: /^Pull/ });
    expect(pull.hasAttribute("disabled")).toBe(true);
    const tooltipTrigger = screen.getByLabelText("Switch to a branch before pulling.");
    expect(tooltipTrigger.contains(pull)).toBe(true);
    tooltipTrigger.focus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Switch to a branch before pulling.");
    expect(tooltipTrigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  });
  it("keeps pull recovery available while a rebase has detached HEAD", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ branch: null, upstream: null }));
    vi.mocked(githead.getPullRecovery).mockResolvedValue(createPullRecovery({ phase: "rebase-conflicts" }));
    render(<App />);
    await waitForRepositoryWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Keep current branch" }));
    const resolve = await screen.findByRole("button", { name: "Resolve remote history change" });
    expect(resolve.hasAttribute("disabled")).toBe(false);
  });
  it("ignores an old tag response after changing the source", async () => {
    const old = defer<GitCheckoutTag[]>();
    vi.mocked(githead.getCheckoutTags).mockReturnValueOnce(old.promise).mockResolvedValueOnce([tag]);
    render(<CheckoutTagDialog repoPath={repoPath} remotes={[{ name: "origin", url: "remote", direction: "fetch" }]} busy={false} onClose={vi.fn()} onCheckout={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tags from"), { target: { value: "origin" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Select tag" }).hasAttribute("disabled")).toBe(false));
    old.resolve([{ ...tag, name: "stale" }]);
    await flushRendererAsync();
    fireEvent.click(screen.getByRole("button", { name: "Select tag" }));
    expect(screen.getByRole("option", { name: /v2/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /stale/ })).toBeNull();
  });
  it("submits a new branch name and keeps errors visible", async () => {
    vi.mocked(githead.getCheckoutTags).mockResolvedValue([tag]);
    const checkout = vi.fn().mockResolvedValue("Branch already exists.");
    render(<CheckoutTagDialog repoPath={repoPath} remotes={[]} busy={false} onClose={vi.fn()} onCheckout={checkout} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Select tag" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Select tag" }));
    fireEvent.click(screen.getByRole("option", { name: /v2/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("New branch name"), { target: { value: "fix" } });
    fireEvent.click(screen.getByRole("button", { name: "Create branch from tag" }));
    await screen.findByRole("alert");
    expect(checkout).toHaveBeenCalledWith({ repoPath, tagName: "v2", expectedObjectId: tag.objectId, branchName: "fix" });
    expect(screen.getByRole("alert").textContent).toBe("Branch already exists.");
  });
});
