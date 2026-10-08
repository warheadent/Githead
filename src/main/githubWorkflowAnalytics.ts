import type { GitHubWorkflowAnalytics, GitHubWorkflowAnalyticsRange, GitHubWorkflowAnalyticsWorkflow, GitHubWorkflowRun } from "../shared/types";
import { addLocalDays, binIndex, binStarts, median, startOfLocalDay, startOfLocalWeek } from "./analyticsTime";

const WORKFLOW_LIMIT = 4;
const BRANCH_LIMIT = 6;
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

export function workflowAnalyticsWindow(range: GitHubWorkflowAnalyticsRange, now: number): { unit: "day" | "week"; from: number; previousFrom: number } {
  const today = startOfLocalDay(now);
  if (range === "d30") {
    const from = addLocalDays(today, -29);
    return { unit: "day", from, previousFrom: addLocalDays(from, -30) };
  }
  const from = startOfLocalWeek(addLocalDays(today, -89));
  return { unit: "week", from, previousFrom: from - (now - from) };
}

type Outcome = 0 | 1 | 2;

function outcomeOf(run: GitHubWorkflowRun): Outcome | null {
  if (run.status !== "completed") return null;
  if (run.conclusion === "success") return 0;
  if (FAILED_CONCLUSIONS.has(run.conclusion ?? "")) return 1;
  if (run.conclusion === "cancelled") return 2;
  return null;
}

function seconds(value: string): number | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time / 1000 : null;
}

/**
 * Summarizes completed workflow runs. Skipped, neutral, and stale runs are
 * ignored; timed-out and startup failures count as failures.
 */
export function buildWorkflowAnalytics(
  runs: readonly GitHubWorkflowRun[],
  range: GitHubWorkflowAnalyticsRange,
  now: number,
  sampled: boolean
): GitHubWorkflowAnalytics {
  const { unit, from, previousFrom } = workflowAnalyticsWindow(range, now);
  const bins = binStarts(from, now, unit);
  const outcomes = bins.map(() => [0, 0, 0] as [number, number, number]);
  const workflows = new Map<string, { runs: number; failures: number; durations: number[]; byBin: number[][] }>();
  const branches = new Map<string, { failed: number; passed: number; runs: number }>();
  let passed = 0;
  let failed = 0;
  let cancelled = 0;
  let previousPassed = 0;
  let previousFailed = 0;
  let reruns = 0;
  let oldest = Infinity;

  for (const run of runs) {
    const created = seconds(run.createdAt);
    if (created === null) continue;
    oldest = Math.min(oldest, created);
    const outcome = outcomeOf(run);
    if (outcome === null) continue;
    if (created < from) {
      if (created >= previousFrom) {
        if (outcome === 0) previousPassed += 1;
        if (outcome === 1) previousFailed += 1;
      }
      continue;
    }
    const bin = binIndex(bins, created);
    if (bin < 0 || created > now) continue;
    outcomes[bin]![outcome] += 1;
    if (outcome === 0) passed += 1;
    else if (outcome === 1) failed += 1;
    else cancelled += 1;
    if (run.attempt > 1) reruns += 1;

    let workflow = workflows.get(run.name);
    if (!workflow) {
      workflow = { runs: 0, failures: 0, durations: [], byBin: bins.map(() => []) };
      workflows.set(run.name, workflow);
    }
    workflow.runs += 1;
    if (outcome === 1) workflow.failures += 1;
    const started = seconds(run.startedAt || run.createdAt);
    const finished = seconds(run.updatedAt);
    if (outcome === 0 && started !== null && finished !== null && finished > started) {
      workflow.durations.push(finished - started);
      workflow.byBin[bin]!.push(finished - started);
    }

    const branchName = run.branch || "-";
    const branch = branches.get(branchName) ?? { failed: 0, passed: 0, runs: 0 };
    branch.runs += 1;
    if (outcome === 0) branch.passed += 1;
    if (outcome === 1) branch.failed += 1;
    branches.set(branchName, branch);
  }

  const topWorkflows: GitHubWorkflowAnalyticsWorkflow[] = [...workflows.entries()]
    .sort((a, b) => b[1].runs - a[1].runs || a[0].localeCompare(b[0]))
    .slice(0, WORKFLOW_LIMIT)
    .map(([name, workflow]) => ({
      name,
      runs: workflow.runs,
      failures: workflow.failures,
      medianDurationSeconds: median(workflow.durations),
      medianDurations: workflow.byBin.map((values) => median(values))
    }));
  // A sample that does not reach back to the previous window cannot support a comparison.
  const previousCovered = !sampled || oldest <= previousFrom;
  return {
    unit,
    from,
    to: now,
    bins,
    outcomes,
    workflows: topWorkflows,
    passed,
    failed,
    cancelled,
    successRate: passed + failed ? passed / (passed + failed) : null,
    previousSuccessRate: previousCovered && previousPassed + previousFailed ? previousPassed / (previousPassed + previousFailed) : null,
    reruns,
    failingBranches: [...branches.entries()]
      .filter(([, branch]) => branch.failed > 0)
      .sort((a, b) => b[1].failed - a[1].failed || b[1].runs - a[1].runs)
      .slice(0, BRANCH_LIMIT)
      .map(([branch, counts]) => ({ branch, ...counts })),
    sampled: sampled && oldest > from
  };
}
