import { describe, expect, it } from "vitest";
import { filterLoadedWorkflowRuns, normalizePullRequestQuery, sortLoadedWorkflowRuns } from "./githubViewQuery";

const run = (id: string, name: string, startedAt: string) => ({ id, name, runNumber: 1, status: "completed", conclusion: "success", branch: "main", event: "push", commitSha: id, commitMessage: name, url: "url", startedAt, updatedAt: startedAt });

describe("GitHub view queries", () => {
  it("normalizes whitespace without changing case", () => {
    expect(normalizePullRequestQuery({ search: "  Fix Repo  ", label: " Needs Review ", sort: "updated", direction: "desc" })).toEqual({ search: "Fix Repo", label: "Needs Review", sort: "updated", direction: "desc" });
  });
  it("filters loaded workflow fields case-insensitively", () => {
    expect(filterLoadedWorkflowRuns([run("abc", "Release Build", "2026-01-01")], "release")).toHaveLength(1);
  });
  it("sorts a copy rather than mutating stored runs", () => {
    const stored = [run("2", "new", "2026-02-01"), run("1", "old", "2026-01-01")];
    expect(sortLoadedWorkflowRuns(stored, "asc").map((item) => item.id)).toEqual(["1", "2"]);
    expect(stored.map((item) => item.id)).toEqual(["2", "1"]);
  });
});
