import { describe, expect, it } from "vite-plus/test";
import { GIT_STASH_LIST_FORMAT, isGitStashRef, parseGitStashFiles, parseGitStashList } from "./gitStash";

describe("git stash parsing", () => {
  it("parses custom and automatic stash subjects", () => {
    const output = [
      `stash@{0}\x1f${"a".repeat(40)}\x1fOn feature/cache: traversal cleanup\x1f2026-08-04T20:00:00-07:00\x1e`,
      `stash@{1}\x1f${"b".repeat(40)}\x1fWIP on main: 9d04f31 Fix release notes\x1f2026-08-03T20:00:00-07:00\x1e`
    ].join("");

    expect(parseGitStashList(output)).toEqual([
      {
        ref: "stash@{0}",
        hash: "a".repeat(40),
        message: "traversal cleanup",
        sourceBranch: "feature/cache",
        createdAt: "2026-08-04T20:00:00-07:00"
      },
      {
        ref: "stash@{1}",
        hash: "b".repeat(40),
        message: "WIP: Fix release notes",
        sourceBranch: "main",
        createdAt: "2026-08-03T20:00:00-07:00"
      }
    ]);
  });

  it("parses ordinary and renamed files", () => {
    expect(parseGitStashFiles("M\0src/app.ts\0R100\0old.ts\0new.ts\0A\0new-file.ts\0")).toEqual([
      { path: "src/app.ts", status: "M" },
      { path: "new.ts", originalPath: "old.ts", status: "R100" },
      { path: "new-file.ts", status: "A" }
    ]);
  });

  it("accepts only canonical stash references", () => {
    expect(isGitStashRef("stash@{12}")).toBe(true);
    expect(isGitStashRef("stash@{-1}")).toBe(false);
    expect(isGitStashRef("refs/stash")).toBe(false);
  });

  it("uses unambiguous record and field separators", () => {
    expect(GIT_STASH_LIST_FORMAT).toBe("%gd%x1f%H%x1f%gs%x1f%cI%x1e");
  });
});
