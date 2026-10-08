import { describe, expect, it } from "vite-plus/test";
import type { GitHubWorkflowRun } from "../shared/types";
import { buildWorkflowAnalytics } from "./githubWorkflowAnalytics";

const NOW = Math.floor(new Date(2026, 9, 8, 12).getTime() / 1000);

function run(overrides: Partial<GitHubWorkflowRun> & { daysAgo: number; minutes?: number }): GitHubWorkflowRun {
  const created = new Date((NOW - overrides.daysAgo * 86_400) * 1000).toISOString();
  const finished = new Date((NOW - overrides.daysAgo * 86_400 + (overrides.minutes ?? 5) * 60) * 1000).toISOString();
  return {
    id: "1", name: "Build", displayTitle: "", runNumber: 1, attempt: 1, status: "completed", conclusion: "success", branch: "main", event: "push",
    actor: { login: "ada", avatarUrl: "", url: "" } as GitHubWorkflowRun["actor"], commitSha: "", commitMessage: "", url: "",
    createdAt: created, startedAt: created, updatedAt: finished, ...overrides
  };
}

describe("buildWorkflowAnalytics", () => {
  it("summarizes outcomes, durations, re-runs, and failing branches", () => {
    const result = buildWorkflowAnalytics([
      run({ daysAgo: 1, minutes: 4 }),
      run({ daysAgo: 1, minutes: 6, attempt: 2 }),
      run({ daysAgo: 2, conclusion: "failure", branch: "feature" }),
      run({ daysAgo: 2, conclusion: "timed_out", branch: "feature", name: "Tests" }),
      run({ daysAgo: 3, conclusion: "cancelled" }),
      run({ daysAgo: 3, conclusion: "skipped" }),
      run({ daysAgo: 3, status: "in_progress", conclusion: null }),
      run({ daysAgo: 40, conclusion: "failure" }),
      run({ daysAgo: 45 })
    ], "d30", NOW, false);

    expect(result).toMatchObject({ unit: "day", passed: 2, failed: 2, cancelled: 1, successRate: 0.5, previousSuccessRate: 0.5, reruns: 1, sampled: false });
    expect(result.bins).toHaveLength(30);
    expect(result.outcomes.reduce((total, [passed, failed, cancelled]) => total + passed + failed + cancelled, 0)).toBe(5);
    expect(result.workflows[0]).toMatchObject({ name: "Build", runs: 4, failures: 1, medianDurationSeconds: 300 });
    expect(result.failingBranches).toEqual([{ branch: "feature", failed: 2, passed: 0, runs: 2 }]);
  });

  it("uses weekly bins for 90 days and drops comparisons the sample cannot support", () => {
    const result = buildWorkflowAnalytics([run({ daysAgo: 1 }), run({ daysAgo: 20, conclusion: "failure" })], "d90", NOW, true);
    expect(result.unit).toBe("week");
    expect(result.bins.length).toBeGreaterThanOrEqual(13);
    expect(result).toMatchObject({ successRate: 0.5, previousSuccessRate: null, sampled: true });
  });
});
