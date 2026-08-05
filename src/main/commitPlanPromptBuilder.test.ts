import { describe, expect, it } from "vite-plus/test";
import {
  createCommitPlanSystemPrompt,
  createCommitPlanUserPrompt,
  parseCommitPlanResponse
} from "./commitPlanPromptBuilder";

describe("commitPlanPromptBuilder", () => {
  it("parses valid groups and leaves omitted files unassigned", () => {
    const plan = parseCommitPlanResponse(JSON.stringify({
      groups: [{
        message: "feat(status): add commit plans",
        rationale: "Adds the new workflow.",
        paths: ["src/a.ts", "src/a.test.ts"]
      }]
    }), ["src/a.ts", "src/a.test.ts", "README.md"]);

    expect(plan.groups).toEqual([{
      id: "group-1",
      message: "feat(status): add commit plans",
      rationale: "Adds the new workflow.",
      paths: ["src/a.ts", "src/a.test.ts"]
    }]);
    expect(plan.unassignedPaths).toEqual(["README.md"]);
  });

  it("extracts JSON from a fenced response", () => {
    const plan = parseCommitPlanResponse([
      "Here is the plan:",
      "```json",
      '{"groups":[{"message":"fix: keep state","paths":["a.ts"]}]}',
      "```"
    ].join("\n"), ["a.ts"]);

    expect(plan.groups[0]?.paths).toEqual(["a.ts"]);
  });

  it("excludes invented and duplicate paths", () => {
    const plan = parseCommitPlanResponse(JSON.stringify({
      groups: [
        { message: "feat: first", paths: ["a.ts", "a.ts", "invented.ts"] },
        { message: "test: second", paths: ["a.ts", "b.ts"] }
      ]
    }), ["a.ts", "b.ts", "c.ts"]);

    expect(plan.groups.map((group) => group.paths)).toEqual([["a.ts"], ["b.ts"]]);
    expect(plan.unassignedPaths).toEqual(["c.ts"]);
  });

  it("rejects a response without a usable group", () => {
    expect(() => parseCommitPlanResponse('{"groups":[]}', ["a.ts"]))
      .toThrow("no usable commit groups");
  });

  it("requires JSON output and includes repository examples", () => {
    const system = createCommitPlanSystemPrompt({ mode: "repo_conventions", customInstructions: "" });
    const user = createCommitPlanUserPrompt(
      ["src/a.ts"],
      "### src/a.ts\n+added line",
      { mode: "repo_conventions", customInstructions: "" },
      ["Keep recent style"]
    );

    expect(system).toContain("Return valid JSON only");
    expect(system).toContain("Each supplied path must appear exactly once");
    expect(user).toContain("Recent commit subjects");
    expect(user).toContain("Keep recent style");
  });
});
