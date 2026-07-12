import { describe, expect, it } from "vitest";
import { buildIssueSearchPath, buildPullRequestSearchPath, buildWorkflowRunsPath } from "./githubQuery";

const repository = { owner: "octo org", name: "répo", fullName: "octo/repo", webUrl: "https://github.com/octo/repo" };

describe("GitHub query paths", () => {
  it("encodes workflow filters and branch punctuation", () => {
    const path = buildWorkflowRunsPath(repository, { branch: "feature/a b", event: "pull_request", status: "failure", sortDirection: "desc" }, 2);
    expect(path).toContain("/repos/octo%20org/r%C3%A9po/actions/runs?");
    expect(new URL(`https://example.test${path}`).searchParams.get("branch")).toBe("feature/a b");
    expect(path).toContain("status=failure");
  });

  it("keeps PR search text literal and mandatory qualifiers intact", () => {
    const path = buildPullRequestSearchPath(repository, { search: 'repo:evil is:closed "quoted"', label: 'needs, "design"', reviewRequested: "mé", sort: "created", direction: "asc" }, 1);
    const query = new URL(`https://example.test${path}`).searchParams.get("q");
    expect(query).toContain("repo:octo/repo is:pr is:open");
    expect(query).toContain('"repo:evil is:closed \\"quoted\\""');
    expect(query).toContain('label:"needs, \\"design\\""');
    expect(path).toContain("sort=created&order=asc");
  });

  it("composes issue filters without allowing raw syntax to replace constraints", () => {
    const path = buildIssueSearchPath(repository, { search: "is:pr", unassigned: true, label: "help wanted", sort: "updated", direction: "desc" }, 3);
    const query = new URL(`https://example.test${path}`).searchParams.get("q");
    expect(query).toBe('repo:octo/repo is:issue is:open "is:pr" no:assignee label:"help wanted"');
    expect(path).toContain("page=3");
  });
});
