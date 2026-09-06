import { describe, expect, it } from "vite-plus/test";
import type { CommitPlan, CommitPlanChange } from "../shared/types";
import { reconcileCommitPlan, removeCommittedChanges } from "./commitPlanState";

const changes: CommitPlanChange[] = ["a", "b", "c"].map((letter) => ({ id: letter, path: `${letter}.ts`, kind: "file", label: "Whole file", fingerprint: letter.repeat(64) }));
const plan: CommitPlan = {
  granularity: "file", changes,
  groups: [
    { id: "first", message: "Edited subject", rationale: "Edited body\n\nSecond paragraph", changeIds: ["a", "b"] },
    { id: "second", message: "Other subject", rationale: "", changeIds: ["c"] }
  ], unassignedChangeIds: []
};

describe("commit plan reconciliation", () => {
  it("keeps unchanged groups and edits while moving changed and added content to the inbox", () => {
    const current = [changes[0]!, { ...changes[1]!, fingerprint: "d".repeat(64) }, changes[2]!, { ...changes[0]!, path: "new.ts", fingerprint: "e".repeat(64) }];
    const result = reconcileCommitPlan(plan, current);
    expect(result.groups[0]).toMatchObject({ ...plan.groups[0], changeIds: ["a"], needsReview: true });
    expect(result.groups[1]).toMatchObject({ ...plan.groups[1], needsReview: false });
    expect(result.unassignedChangeIds).toHaveLength(2);
    expect(result.changes.filter((change) => result.unassignedChangeIds.includes(change.id)).map((change) => change.path)).toEqual(["b.ts", "new.ts"]);
    expect(reconcileCommitPlan(result, current)).toEqual(result);
  });

  it("retains unchecked changes and the message after a partial commit", () => {
    const result = removeCommittedChanges(plan, new Set(["a"]));
    expect(result.groups[0]).toEqual({ ...plan.groups[0], changeIds: ["b"] });
    expect(result.changes.map((change) => change.id)).toEqual(["b", "c"]);
    expect(result.unassignedChangeIds).toEqual([]);
    expect(removeCommittedChanges(result, new Set(["b"])).groups).toEqual([plan.groups[1]]);
  });

  it("keeps empty groups for review when all of their content disappears", () => {
    const result = reconcileCommitPlan(plan, [changes[2]!]);
    expect(result.groups[0]).toMatchObject({ id: "first", message: "Edited subject", changeIds: [], needsReview: true });
    expect(result.groups[1]?.needsReview).toBe(false);
  });
});
