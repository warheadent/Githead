import { describe, expect, it } from "vite-plus/test";
import { planGitPush, validateGitPushRemoteName } from "./gitPushPlan";

describe("planGitPush", () => {
  it("plans an explicit branch push followed by all tags by default policy", () => {
    expect(planGitPush({ remoteName: "origin" }, "all")).toEqual({
      remoteName: "origin",
      tagPushBehavior: "all",
      phases: [
        { kind: "branch", args: ["push", "origin"] },
        { kind: "tags", args: ["push", "origin", "--tags"] }
      ]
    });
  });

  it("adds follow-tags to the same targeted branch command", () => {
    expect(planGitPush({
      remoteName: "upstream",
      refspec: "HEAD:refs/heads/release"
    }, "follow").phases).toEqual([
      {
        kind: "branch",
        args: ["push", "--follow-tags", "upstream", "HEAD:refs/heads/release"]
      }
    ]);
  });

  it("keeps publication upstream configuration while omitting automatic tags", () => {
    expect(planGitPush({
      remoteName: "origin",
      refspec: "feature/x",
      setUpstream: true
    }, "none").phases).toEqual([
      {
        kind: "branch",
        args: ["push", "--set-upstream", "origin", "feature/x"]
      }
    ]);
  });

  it("rejects option-like remote names before building push arguments", () => {
    expect(validateGitPushRemoteName("--mirror")).toEqual({
      error: "Push remote names cannot start with a dash."
    });
    expect(() => planGitPush({ remoteName: "--repo=evil" }, "all"))
      .toThrow("Push remote names cannot start with a dash.");
  });
});
