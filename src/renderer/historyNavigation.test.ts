import { describe, expect, it } from "vite-plus/test";
import { targetFromCommitFile, targetFromHistoryEntry } from "./historyNavigation";

describe("historyNavigation", () => {
  it("preserves rename identity from commit files", () => {
    expect(targetFromCommitFile("a".repeat(40), { path: "new.ts", originalPath: "old.ts", status: "R", additions: 1, deletions: 1 })).toEqual({
      hash: "a".repeat(40), path: "new.ts", originalPath: "old.ts", status: "R"
    });
  });

  it("creates a blame target from the selected historical entry", () => {
    expect(targetFromHistoryEntry({
      hash: "b".repeat(40), shortHash: "bbbbbbb", parents: [], refs: [], subject: "change", authorName: "A", authorEmail: "a@b", authorDate: "", relativeDate: "", path: "src/a.ts", status: "M"
    })).toEqual({ hash: "b".repeat(40), path: "src/a.ts", status: "M" });
  });
});
