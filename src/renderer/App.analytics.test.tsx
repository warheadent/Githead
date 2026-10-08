// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { loreCapabilities, type RepositoryAnalytics } from "../shared/types";
import { createSummary, githead, repoPath, waitForRepositoryWorkspace } from "./AppTestHarness";
import { App } from "./App";

function emptyRange(): RepositoryAnalytics["ranges"]["all"] {
  return {
    unit: "day", from: 0, to: 1, bins: [0], commits: [[1, 0]], lines: [[3, 1]], punchCard: Array.from({ length: 168 }, () => 0), commitSizes: [0, 1, 0, 0, 0, 0],
    kpis: { commits: 1, previousCommits: 0, activeDays: 1, previousActiveDays: 0, linesAdded: 3, linesRemoved: 1, assetRevisions: 0, contributors: 1 },
    contributors: [], hotspots: [{ path: "src/app.ts", commits: 1, linesAdded: 3, linesRemoved: 1, authors: 1 }], ownership: [], coupling: []
  };
}

function analytics(): RepositoryAnalytics {
  return {
    inputKey: "initial-inputs", repoPath, headHash: "b".repeat(40), branch: "main", generatedAt: 1, excludePaths: true, excludedPathPatterns: [],
    history: { commits: 1, firstCommitAt: 0, lastCommitAt: 0, truncated: false },
    people: [{ name: "Ada", commits: 1, identities: [{ name: "Ada", email: "ada@example.test", commits: 1 }] }],
    personSlots: 1,
    ranges: { d90: emptyRange(), y1: emptyRange(), all: emptyRange() },
    tags: [],
    assets: { treeFiles: 1, lfsFiles: 0, lfsBytes: 0, gitBytes: 10, packedBytes: 100, types: [], otherTypes: null, lfsGrowth: [], lfsHistoryBytes: 0, binaryHotspots: [], binaryTypesOutsideLfs: [], largeFilesOutsideLfs: [], largeFilesOutsideLfsCount: 0 },
    branches: { base: null, branches: [], truncated: false }
  };
}

describe("analytics workspace tab", () => {
  it("opens analytics for Git repositories and navigates from a hotspot to file history", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepositoryAnalytics).mockResolvedValue(analytics());
    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(await screen.findByRole("tab", { name: "Analytics" }));
    await waitFor(() => expect(githead.getRepositoryAnalytics).toHaveBeenCalledWith(expect.objectContaining({ repoPath, excludePaths: true })));
    await user.click(await screen.findByRole("tab", { name: "Code" }));
    await user.click(await screen.findByRole("button", { name: "Open file history for src/app.ts" }));
    await waitFor(() => expect(githead.getFileHistory).toHaveBeenCalledWith(expect.objectContaining({ repoPath, startHash: "b".repeat(40), path: "src/app.ts" })));
    expect(screen.getByRole("tab", { name: "Commit History" }).getAttribute("aria-selected")).toBe("true");
  });

  it("hides analytics for repositories that do not support it", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ kind: "lore", capabilities: loreCapabilities() }));
    render(<App />);
    await waitForRepositoryWorkspace();
    await screen.findByRole("tab", { name: /File Status/ });
    expect(screen.queryByRole("tab", { name: "Analytics" })).toBeNull();
    expect(githead.getRepositoryAnalytics).not.toHaveBeenCalled();
  });
});
