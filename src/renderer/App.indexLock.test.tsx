// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createOperationResult, createStatusFile, createSummary, githead, repoPath } from "./AppTestHarness";
import { App } from "./App";

describe("Index lock recovery", () => {
  const error = `fatal: Unable to create '${repoPath}/.git/index.lock': File exists.`;
  const lock = { path: `${repoPath}/.git/index.lock`, modifiedAt: "2026-01-01T00:00:00.000Z", fingerprint: "checked-lock" };

  async function stageWithFailure(stderr = error) {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      files: [createStatusFile("example.txt", { isUnstaged: true, worktreeStatus: "M" })]
    }));
    vi.mocked(githead.stageFiles).mockResolvedValue(createOperationResult({ exitCode: 1, stderr }));
    vi.mocked(githead.inspectGitIndexLock).mockResolvedValue({ ...createOperationResult(), lock });
    render(<App />);
    await screen.findByRole("option", { name: /example.txt/ });
    await user.click(screen.getByRole("button", { name: "Stage All" }));
    return user;
  }

  it("offers deletion after a real operation failure and requires confirmation", async () => {
    const user = await stageWithFailure();
    const dialog = await screen.findByRole("dialog", { name: "Recover Git index lock" });
    await within(dialog).findByText(lock.path);
    const remove = within(dialog).getByRole("button", { name: "Delete lock" });
    expect(remove.hasAttribute("disabled")).toBe(true);
    expect(githead.removeGitIndexLock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(remove);
    await waitFor(() => expect(githead.removeGitIndexLock).toHaveBeenCalledWith({
      repoPath, fingerprint: lock.fingerprint, operationId: expect.any(String)
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Recover Git index lock" })).toBeNull());
    // Recovery must not replay a potentially partially completed operation.
    expect(githead.stageFiles).toHaveBeenCalledTimes(1);
  });

  it("leaves the lock alone when the user cancels", async () => {
    const user = await stageWithFailure();
    const dialog = await screen.findByRole("dialog", { name: "Recover Git index lock" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(githead.removeGitIndexLock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Recover Git index lock" })).toBeNull());
  });

  it("requires a fresh check after deletion is refused", async () => {
    const user = await stageWithFailure();
    vi.mocked(githead.removeGitIndexLock).mockResolvedValue(createOperationResult({ exitCode: -1, stderr: "A Git process is running." }));
    const dialog = await screen.findByRole("dialog", { name: "Recover Git index lock" });
    await within(dialog).findByText(lock.path);
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Delete lock" }));
    await within(dialog).findByText("A Git process is running.");
    expect(within(dialog).getByRole("button", { name: "Delete lock" }).hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Check again" }));
    await within(dialog).findByRole("checkbox");
    expect(within(dialog).getByRole("button", { name: "Delete lock" }).hasAttribute("disabled")).toBe(true);
    expect(githead.inspectGitIndexLock).toHaveBeenCalledTimes(2);
  });

  it("does not offer deletion for a permission error", async () => {
    await stageWithFailure(`fatal: Unable to create '${repoPath}/.git/index.lock': Permission denied.`);
    await waitFor(() => expect(githead.stageFiles).toHaveBeenCalledTimes(1));
    expect(githead.inspectGitIndexLock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Recover Git index lock" })).toBeNull();
  });

  it("blocks deletion when the initial check finds an active Git process", async () => {
    vi.mocked(githead.inspectGitIndexLock).mockResolvedValueOnce(createOperationResult({
      exitCode: -1, stderr: "A Git process is running."
    }));
    const user = await stageWithFailure();
    const dialog = await screen.findByRole("dialog", { name: "Recover Git index lock" });
    await within(dialog).findByText("A Git process is running.");
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Delete lock" }).hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Check again" }));
    await within(dialog).findByRole("checkbox");
    expect(githead.removeGitIndexLock).not.toHaveBeenCalled();
  });
});
