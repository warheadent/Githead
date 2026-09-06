// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommitPlan } from "../shared/types";
import { commitPlanDraftKey, loadCommitPlanDraft, saveCommitPlanDraft } from "./commitPlanDraft";

const plan: CommitPlan = {
  granularity: "file",
  changes: [{ id: "a", path: "a.ts", kind: "file", fingerprint: "a".repeat(64), label: "Whole file" }],
  groups: [{ id: "group", message: "Saved subject", rationale: "Body\n\nSecond paragraph", changeIds: ["a"], needsReview: true }],
  unassignedChangeIds: []
};

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe("commit plan drafts", () => {
  it("restores durable edits and selections only for the same repository", () => {
    const draft = { plan, includedChangeIds: [], excludedPaths: ["other.ts"] };
    expect(saveCommitPlanDraft("/repo/one", draft)).toBe(true);
    expect(loadCommitPlanDraft("/repo/one")).toEqual(draft);
    expect(loadCommitPlanDraft("/repo/two")).toBeNull();
  });

  it("ignores malformed, oversized and incompatible drafts", () => {
    for (const raw of ["{bad json", "x".repeat(2_000_001), JSON.stringify({ version: 2, plan }), JSON.stringify({ version: 1, plan: { ...plan, groups: [{ ...plan.groups[0], changeIds: ["missing"] }] }, includedChangeIds: [], excludedPaths: [] })]) {
      window.localStorage.setItem(commitPlanDraftKey("/repo"), raw);
      expect(loadCommitPlanDraft("/repo")).toBeNull();
    }
  });

  it("keeps the editor usable when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(saveCommitPlanDraft("/repo", { plan, includedChangeIds: [], excludedPaths: [] })).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    expect(loadCommitPlanDraft("/repo")).toBeNull();
  });
});
