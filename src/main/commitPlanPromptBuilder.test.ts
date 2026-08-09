import { describe, expect, it } from "vite-plus/test";
import type { CommitPlanChange } from "../shared/types";
import {
  createCommitPlanSystemPrompt,
  createCommitPlanUserPrompt,
  parseCommitPlanResponse
} from "./commitPlanPromptBuilder";

const changes: CommitPlanChange[] = [
  { id: "change-1", path: "src/a.ts", kind: "file", label: "Whole file", fingerprint: "a".repeat(64) },
  { id: "change-2", path: "src/a.test.ts", kind: "file", label: "Whole file", fingerprint: "b".repeat(64) },
  { id: "change-3", path: "README.md", kind: "file", label: "Whole file", fingerprint: "c".repeat(64) }
];

describe("commitPlanPromptBuilder", () => {
  it("parses valid groups and leaves omitted changes unassigned", () => {
    const plan = parseCommitPlanResponse(JSON.stringify({
      groups: [{
        message: "feat(status): add commit plans",
        rationale: "Adds the new workflow.",
        changeIds: ["change-1", "change-2"]
      }]
    }), changes, "file");

    expect(plan.groups).toEqual([{
      id: "group-1",
      message: "feat(status): add commit plans",
      rationale: "Adds the new workflow.",
      changeIds: ["change-1", "change-2"]
    }]);
    expect(plan.unassignedChangeIds).toEqual(["change-3"]);
    expect(plan.changes).toEqual(changes);
  });

  it("extracts JSON from a fenced response", () => {
    const plan = parseCommitPlanResponse([
      "Here is the plan:",
      "```json",
      '{"groups":[{"message":"fix: keep state","changeIds":["change-1"]}]}',
      "```"
    ].join("\n"), changes.slice(0, 1), "file");

    expect(plan.groups[0]?.changeIds).toEqual(["change-1"]);
  });

  it("excludes invented and duplicate change IDs", () => {
    const plan = parseCommitPlanResponse(JSON.stringify({
      groups: [
        { message: "feat: first", changeIds: ["change-1", "change-1", "invented"] },
        { message: "test: second", changeIds: ["change-1", "change-2"] }
      ]
    }), changes, "file");

    expect(plan.groups.map((group) => group.changeIds)).toEqual([["change-1"], ["change-2"]]);
    expect(plan.unassignedChangeIds).toEqual(["change-3"]);
  });

  it("rejects a response without a usable group", () => {
    expect(() => parseCommitPlanResponse('{"groups":[]}', changes.slice(0, 1), "file"))
      .toThrow("no usable commit groups");
  });

  it("requires JSON output and includes repository examples", () => {
    const system = createCommitPlanSystemPrompt({ mode: "repo_conventions", customInstructions: "" });
    const user = createCommitPlanUserPrompt(
      changes.slice(0, 1),
      "### change-1: src/a.ts\n+added line",
      { mode: "repo_conventions", customInstructions: "" },
      ["Keep recent style"]
    );

    expect(system).toContain("Return valid JSON only");
    expect(system).toContain("Each supplied change ID must appear exactly once");
    expect(system).toContain("suitable for the commit message body");
    expect(user).toContain("Recent commit subjects");
    expect(user).toContain("Keep recent style");
  });
});
