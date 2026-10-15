import { describe, expect, it } from "vite-plus/test";
import { CHERRY_PICK_CONTAINED_REASON, getCommitActionItems, type CommitActionOptions } from "./commitActionMenu";

const baseOptions: CommitActionOptions = {
  tagsEnabled: true,
  cherryPickDisabled: false,
  isHead: false,
  amendDisabled: false,
  amendDisabledReason: null
};

describe("commit action items", () => {
  it("lists the commit actions in menu order with their groups", () => {
    const items = getCommitActionItems({ ...baseOptions, isHead: true });
    expect(items.map((item) => [item.label, item.groupStart])).toEqual([
      ["Tag", false],
      ["Cherry-pick commit…", false],
      ["Reset current branch to this commit", true],
      ["Reverse commit", false],
      ["Amend last commit…", false],
      ["Copy SHA to clipboard", true]
    ]);
    expect(items.every((item) => item.disabledReason === null)).toBe(true);
  });

  it("offers Amend only on HEAD and Tag only with tag support", () => {
    const labels = getCommitActionItems({ ...baseOptions, tagsEnabled: false }).map((item) => item.label);
    expect(labels).not.toContain("Amend last commit…");
    expect(labels).not.toContain("Tag");
  });

  it("explains disabled cherry-pick and amend items", () => {
    const items = getCommitActionItems({ ...baseOptions, cherryPickDisabled: true, isHead: true, amendDisabled: true, amendDisabledReason: "Finish the merge first." });
    expect(items.find((item) => item.action === "cherry-pick")?.disabledReason).toBe(CHERRY_PICK_CONTAINED_REASON);
    expect(items.find((item) => item.action === "amend")?.disabledReason).toBe("Finish the merge first.");
    const busyAmend = getCommitActionItems({ ...baseOptions, isHead: true, amendDisabled: true });
    expect(busyAmend.find((item) => item.action === "amend")?.disabledReason).toBe("Wait for the current Git operation to finish.");
  });
});
