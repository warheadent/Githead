import { describe, expect, it } from "vite-plus/test";
import type { GitFileDiff } from "../shared/types";
import { combineHunkPatches, createCommitPlanChanges } from "./commitPlanChanges";

const twoHunkDiff = (firstStart = 1, secondStart = 20): GitFileDiff => ({
  path: "src/example.ts",
  side: "unstaged",
  kind: "text",
  text: [
    "diff --git a/src/example.ts b/src/example.ts",
    "index 1111111..2222222 100644",
    "--- a/src/example.ts",
    "+++ b/src/example.ts",
    `@@ -${firstStart},3 +${firstStart},4 @@ first`,
    " one",
    "+inserted",
    " two",
    " three",
    `@@ -${secondStart},3 +${secondStart},3 @@ second`,
    " old-context",
    "-old-value",
    "+new-value",
    " new-context",
    ""
  ].join("\n")
});

describe("commitPlanChanges", () => {
  it("creates one change for each text hunk", () => {
    const changes = createCommitPlanChanges([twoHunkDiff()], "hunk");

    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.kind)).toEqual(["hunk", "hunk"]);
    expect(changes.map((change) => change.id)).toEqual(["change-1", "change-2"]);
  });

  it("keeps hunk fingerprints stable after line offsets change", () => {
    const before = createCommitPlanChanges([twoHunkDiff(1, 20)], "hunk");
    const after = createCommitPlanChanges([twoHunkDiff(2, 24)], "hunk");

    expect(after.map((change) => change.fingerprint)).toEqual(before.map((change) => change.fingerprint));
  });

  it("combines selected hunks under one file header", () => {
    const patch = combineHunkPatches(createCommitPlanChanges([twoHunkDiff()], "hunk"));

    expect(patch.match(/^diff --git /gm)).toHaveLength(1);
    expect(patch.match(/^@@ /gm)).toHaveLength(2);
  });

  it("uses a whole-file change for added files", () => {
    const added: GitFileDiff = {
      path: "src/new.ts",
      side: "unstaged",
      kind: "text",
      text: "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+new\n"
    };

    expect(createCommitPlanChanges([added], "hunk")).toMatchObject([{ kind: "file", label: "Whole file" }]);
  });
});
