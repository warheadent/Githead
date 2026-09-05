import { describe, expect, it } from "vitest";
import { filterLoadedWorkflowRuns, sortLoadedWorkflowRuns } from "./githubViewQuery";

const run = (id: string, name: string, startedAt: string) => ({
  id,
  name,
  displayTitle: name,
  runNumber: 1,
  attempt: 1,
  status: "completed",
  conclusion: "success",
  branch: "main",
  event: "workflow_dispatch",
  actor: { login: "taylor", avatarUrl: "", url: "" },
  commitSha: id,
  commitMessage: name,
  url: "url",
  createdAt: startedAt,
  startedAt,
  updatedAt: startedAt
});

describe("GitHub view queries", () => {
  it("filters loaded workflow fields case-insensitively", () => {
    const runs = [run("123", "Release Build", "2026-01-01")];
    expect(filterLoadedWorkflowRuns(runs, "release")).toHaveLength(1);
    expect(filterLoadedWorkflowRuns(runs, "taylor")).toHaveLength(1);
    expect(filterLoadedWorkflowRuns(runs, "workflow dispatch")).toHaveLength(0);
    expect(filterLoadedWorkflowRuns(runs, "workflow_dispatch")).toHaveLength(1);
    expect(filterLoadedWorkflowRuns(runs, "123")).toHaveLength(1);
  });
  it("sorts a copy rather than mutating stored runs", () => {
    const stored = [run("2", "new", "2026-02-01"), run("1", "old", "2026-01-01")];
    expect(sortLoadedWorkflowRuns(stored, "asc").map((item) => item.id)).toEqual(["1", "2"]);
    expect(stored.map((item) => item.id)).toEqual(["2", "1"]);
  });
});
