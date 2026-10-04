// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { GitFileDiff, GitImageSide } from "../shared/types";
import { createStatusFile, createSummary, githead, repoPath } from "./AppTestHarness";
import { App } from "./App";

const filePath = "assets/image.png";
function imageDiff(after: GitImageSide): GitFileDiff {
  return { path: filePath, side: "unstaged", kind: "image", text: "", before: { status: "absent" }, after };
}

function setImageDiff(diff: GitFileDiff): void {
  vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [createStatusFile(filePath, { isUnstaged: true, worktreeStatus: "M" })] }));
  vi.mocked(githead.getFileDiff).mockResolvedValue(diff);
}

describe("Git LFS image recovery", () => {
  it("repairs a corrupt preview only when the user activates Retry Preview", async () => {
    const user = userEvent.setup();
    setImageDiff(imageDiff({ status: "lfs-corrupt", byteLength: 76047, fetchable: true }));
    vi.mocked(githead.fetchLfsImageVersions).mockResolvedValue({ repoPath, exitCode: 0, stdout: "Downloaded LFS image preview.", stderr: "" });
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /assets\/image\.png/ }));
    expect(await screen.findByText(/Local LFS image is corrupt/)).toBeTruthy();
    expect(githead.fetchLfsImageVersions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry corrupt Git LFS image preview" }));
    await waitFor(() => expect(githead.fetchLfsImageVersions).toHaveBeenCalledWith({ context: "status", repoPath, path: filePath, side: "unstaged", operationId: expect.any(String) }));
    await waitFor(() => expect(githead.getFileDiff).toHaveBeenCalledTimes(2));
  });

  it("shows an uncommitted corrupt version without a download action", async () => {
    const user = userEvent.setup();
    setImageDiff(imageDiff({ status: "lfs-corrupt", byteLength: 76047, fetchable: false }));
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /assets\/image\.png/ }));
    expect(await screen.findByText(/Local LFS image is corrupt/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry corrupt Git LFS image preview" })).toBeNull();
    expect(githead.fetchLfsImageVersions).not.toHaveBeenCalled();
  });

  it.each([
    { reason: "oversized" as const, message: "Image is larger than the 10 MiB preview limit. Open the file in an external image viewer." },
    { reason: "lfs-setup" as const, message: "Git LFS setup could not be read. Check that Git LFS is installed and run git lfs env, then refresh the preview." }
  ])("shows $reason guidance without a download action", async ({ reason, message }) => {
    const user = userEvent.setup();
    setImageDiff(imageDiff({ status: "unavailable", reason, message }));
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /assets\/image\.png/ }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Git LFS image preview/ })).toBeNull();
    expect(githead.fetchLfsImageVersions).not.toHaveBeenCalled();
  });
});
