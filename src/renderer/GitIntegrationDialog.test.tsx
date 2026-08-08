// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { githead, repoPath } from "./AppTestHarness";
import { GitIntegrationDialog } from "./GitIntegrationDialog";

describe("GitIntegrationDialog", () => {
  it("keeps merge details and behavior behind Advanced while defaulting to the repository settings", async () => {
    vi.mocked(githead.getIntegrationPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review the preview.",
      preview: {
        kind: "merge",
        repoPath,
        snapshotId: "merge-preview",
        currentBranch: "main",
        headOid: "a".repeat(40),
        clean: true,
        blockingReasons: [],
        warnings: [],
        source: { kind: "local", name: "feature" },
        sourceOid: "b".repeat(40),
        ahead: 0,
        behind: 1,
        canFastForward: true,
        alreadyUpToDate: false,
        commits: [{
          oid: "b".repeat(40),
          shortOid: "bbbbbbb",
          parentOids: ["a".repeat(40)],
          subject: "Add focused workflow",
          authorName: "Githead Test",
          authorEmail: "githead@example.test",
          authorDate: "2026-08-08T00:00:00.000Z",
          files: [{ path: "src/workflow.ts", status: "M", additions: 2, deletions: 1 }]
        }],
        files: [{ path: "src/workflow.ts", status: "M" }]
      }
    });

    render(
      <GitIntegrationDialog
        open
        kind="merge"
        repoPath={repoPath}
        currentBranch="main"
        branches={[
          { name: "main", current: true, upstream: "origin/main" },
          { name: "feature", current: false, upstream: null }
        ]}
        remoteBranches={[]}
        commit={null}
        allowAlreadyContainedCherryPick={false}
        busy={false}
        onOpenChange={vi.fn()}
        onRun={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Merge into main" })).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("grid-rows-[auto_minmax(0,1fr)_auto]")).toBe(true);
    expect(dialog.querySelector(".overflow-y-auto")?.contains(screen.getByRole("button", { name: "Merge" }))).toBe(false);
    expect(screen.getByText("Bring 1 commit from feature into main")).toBeTruthy();
    expect(screen.getByText("Fast-forward")).toBeTruthy();
    const advanced = screen.getByText("Advanced").closest("details");
    expect(advanced?.open).toBe(false);

    fireEvent.click(screen.getByText("Advanced"));
    expect(advanced?.open).toBe(true);
    const behavior = await screen.findByLabelText("Merge behavior");
    expect(behavior).toHaveProperty("value", "normal");
    expect(screen.getByText("Add focused workflow")).toBeTruthy();

    await waitFor(() => expect(githead.getIntegrationPreview).toHaveBeenCalledWith({
      kind: "merge",
      repoPath,
      source: { kind: "local", name: "feature" }
    }));
  });

  it("keeps rebase details behind Advanced and uses one compact published-rewrite acknowledgement", async () => {
    const firstOid = "b".repeat(40);
    const secondOid = "c".repeat(40);
    vi.mocked(githead.getIntegrationPreview).mockResolvedValue({
      outcome: "ready",
      message: "Review the preview.",
      preview: {
        kind: "rebase",
        repoPath,
        snapshotId: "rebase-preview",
        currentBranch: "feature",
        headOid: secondOid,
        clean: true,
        blockingReasons: [],
        warnings: ["This branch tracks origin/feature. Rebasing rewrites commits and may require a separate force-with-lease push."],
        newBase: { kind: "local", name: "main" },
        newBaseOid: "a".repeat(40),
        upstream: "origin/feature",
        upstreamOid: secondOid,
        published: true,
        expectedRewrittenCommitCount: 2,
        alreadyUpToDate: false,
        commits: [firstOid, secondOid].map((oid, index) => ({
          oid,
          shortOid: oid.slice(0, 7),
          parentOids: ["a".repeat(40)],
          subject: `Rebase commit ${index + 1}`,
          authorName: "Githead Test",
          authorEmail: "githead@example.test",
          authorDate: "2026-08-08T00:00:00.000Z",
          files: [{ path: `src/rebase-${index + 1}.ts`, status: "M", additions: 1, deletions: 0 }]
        })),
        files: [
          { path: "src/rebase-1.ts", status: "M" },
          { path: "src/rebase-2.ts", status: "M" }
        ]
      }
    });
    const onRun = vi.fn().mockResolvedValue(null);

    render(
      <GitIntegrationDialog
        open
        kind="rebase"
        repoPath={repoPath}
        currentBranch="feature"
        branches={[
          { name: "feature", current: true, upstream: "origin/feature" },
          { name: "main", current: false, upstream: "origin/main" }
        ]}
        remoteBranches={[]}
        commit={null}
        allowAlreadyContainedCherryPick={false}
        busy={false}
        onOpenChange={vi.fn()}
        onRun={onRun}
      />
    );

    expect(await screen.findByRole("heading", { name: "Rebase feature" })).toBeTruthy();
    expect(screen.getByText("Replay 2 commits from feature onto main")).toBeTruthy();
    expect(screen.getByText("Published rewrite")).toBeTruthy();
    expect(screen.queryByLabelText("Integration direction")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh preview" })).toBeNull();

    const advanced = screen.getByText("Advanced").closest("details");
    expect(advanced?.open).toBe(false);
    const confirm = screen.getByRole("button", { name: "Rebase" });
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Allow rewriting origin\/feature/ }));
    expect(confirm).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByText("Advanced"));
    expect(advanced?.open).toBe(true);
    expect(screen.getByRole("checkbox", { name: /Keep merge commits/ })).toHaveProperty("checked", false);
    expect(screen.getByText("Rebase commit 1")).toBeTruthy();

    fireEvent.click(confirm);
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({
      kind: "rebase",
      repoPath,
      newBase: { kind: "local", name: "main" },
      preserveMerges: false,
      expectedSnapshotId: "rebase-preview"
    }));
  });
});
