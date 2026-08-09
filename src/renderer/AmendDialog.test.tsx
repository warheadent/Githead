// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { GitAmendPreview, GitAmendResult } from "../shared/types";
import { githead, repoPath } from "./AppTestHarness";
import { AmendDialog } from "./AmendDialog";

describe("AmendDialog", () => {
  it("shows commit facts, staged files, upstream, and the strong published warning", async () => {
    vi.mocked(githead.getAmendPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review and confirm the amend.",
      preview: preview({
        publication: "published",
        publishedRefs: ["origin/main"],
        stagedFiles: [{ path: "src/amend.ts", status: "M" }]
      })
    });

    renderDialog();

    expect(await screen.findByRole("heading", { name: "Amend last commit" })).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("main");
    expect(screen.getByText("HEAD subject")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Githead Test <githead@example.test>");
    expect(screen.getByText("origin/main")).toBeTruthy();
    expect(screen.getByText("src/amend.ts")).toBeTruthy();
    expect(screen.getByText("Amending this commit rewrites published history. Pushing it again may require Force with Lease.")).toBeTruthy();
    expect(screen.getByText(/Amend creates a replacement commit with a new commit ID/)).toBeTruthy();
  });

  it("sends the typed mode, message, and preview token only after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAmendPreview).mockImplementation(async (request) => ({
      outcome: "ready",
      message: "Review and confirm the amend.",
      preview: preview({ mode: request.mode ?? "message-only", snapshotId: `snapshot-${request.mode ?? "message-only"}` })
    }));
    const onRun = vi.fn().mockResolvedValue(completed());
    renderDialog({ onRun });

    const message = await screen.findByLabelText("Commit message");
    fireEvent.change(message, { target: { value: "new full message\n\nbody" } });
    await user.click(screen.getByRole("button", { name: "Amend last commit" }));

    await waitFor(() => expect(onRun).toHaveBeenCalledWith({
      repoPath,
      source: "history",
      mode: "message-only",
      message: "new full message\n\nbody",
      expectedSnapshotId: "snapshot-message-only"
    }));
    expect(await screen.findByText("The last commit was amended. No push was started.")).toBeTruthy();
    expect(screen.getByText("aaaaaaa11111")).toBeTruthy();
    expect(screen.getByText("bbbbbbb22222")).toBeTruthy();
  });

  it("marks a rejected stale request and disables repeat confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAmendPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review and confirm the amend.",
      preview: preview()
    });
    const stale: GitAmendResult = {
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "The repository changed. Reopen the amend dialog.",
      outcome: "stale",
      message: "The repository changed. Reopen the amend dialog.",
      previousHeadOid: null,
      headOid: "a".repeat(40),
      recoveryRef: null,
      amendErrorKind: "stale"
    };
    renderDialog({ onRun: vi.fn().mockResolvedValue(stale) });

    fireEvent.change(await screen.findByLabelText("Commit message"), { target: { value: "changed" } });
    const confirm = screen.getByRole("button", { name: "Amend last commit" });
    await user.click(confirm);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The repository changed. Reopen the amend dialog.");
    expect(confirm).toHaveProperty("disabled", true);
  });

  it("requires explicit confirmation before a soft recovery restore", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAmendPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review and confirm the amend.",
      preview: preview({
        recoveryPoints: [{
          ref: "refs/githead/amend-recovery/1234567890123-11111111-1111-4111-8111-111111111111",
          oid: "c".repeat(40),
          shortOid: "ccccccc",
          subject: "Old commit",
          commitDate: "2026-08-08T00:00:00Z",
          restoreToken: "restore-token"
        }]
      })
    });
    const onRestore = vi.fn().mockResolvedValue({
      repoPath,
      exitCode: 0,
      stdout: "",
      stderr: "",
      outcome: "completed",
      message: "The old commit is HEAD again.",
      previousHeadOid: "a".repeat(40),
      headOid: "c".repeat(40),
      recoveryRef: "refs/githead/amend-recovery/safety"
    });
    renderDialog({ onRestore });

    await user.click(await screen.findByRole("button", { name: "Restore…" }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByText(/Githead will use a soft reset/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Restore old commit" }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith({
      repoPath,
      recoveryRef: expect.stringContaining("refs/githead/amend-recovery/"),
      expectedRestoreToken: "restore-token"
    }));
  });
});

function renderDialog(overrides: Partial<Parameters<typeof AmendDialog>[0]> = {}): void {
  render(<AmendDialog
    open
    repoPath={repoPath}
    source="history"
    busy={false}
    returnFocusRef={createRef<HTMLElement>()}
    onOpenChange={vi.fn()}
    onRun={vi.fn().mockResolvedValue(null)}
    onRestore={vi.fn().mockResolvedValue(null)}
    {...overrides}
  />);
}

function preview(overrides: Partial<GitAmendPreview> = {}): GitAmendPreview {
  return {
    repoPath,
    repositoryId: "repository",
    snapshotId: "snapshot-message-only",
    source: "history",
    mode: "message-only",
    defaultMode: "message-only",
    currentBranch: "main",
    headOid: "a".repeat(40),
    shortHeadOid: "aaaaaaa",
    subject: "HEAD subject",
    message: "old full message\n\nbody",
    authorName: "Githead Test",
    authorEmail: "githead@example.test",
    commitDate: "2026-08-09T00:00:00Z",
    stagedFiles: [],
    indexFingerprint: "index",
    upstream: "origin/main",
    publication: "local-ahead",
    publishedRefs: [],
    blockingReasons: [],
    recoveryPoints: [],
    ...overrides
  };
}

function completed(): GitAmendResult {
  return {
    repoPath,
    exitCode: 0,
    stdout: "",
    stderr: "",
    outcome: "completed",
    message: "The last commit was amended. No push was started.",
    previousHeadOid: "aaaaaaa11111".padEnd(40, "1"),
    headOid: "bbbbbbb22222".padEnd(40, "2"),
    recoveryRef: "refs/githead/amend-recovery/test"
  };
}
