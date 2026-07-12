import { describe, expect, it } from "vite-plus/test";
import type { GitStatusFile } from "../shared/types";
import { buildStatusFileTree } from "./statusFileTree";

function file(path: string): GitStatusFile {
  return { path, indexStatus: ".", worktreeStatus: "M", isStaged: false, isUnstaged: true, isConflicted: false };
}

describe("buildStatusFileTree", () => {
  it("groups nested paths while keeping root files and stable folder-first ordering", () => {
    const tree = buildStatusFileTree([file("src/z.ts"), file("README.md"), file("assets/icon.png"), file("src/a/test.ts")]);
    expect(tree.files.map((entry) => entry.path)).toEqual(["README.md"]);
    expect(tree.folders.map((folder) => folder.name)).toEqual(["assets", "src"]);
    expect(tree.folders[1]?.files.map((entry) => entry.path)).toEqual(["src/z.ts"]);
    expect(tree.folders[1]?.folders[0]?.id).toBe("src/a");
    expect(tree.folders[1]?.descendantFiles.map((entry) => entry.path)).toEqual(["src/z.ts", "src/a/test.ts"]);
  });

  it("returns an empty root for no changed files", () => {
    expect(buildStatusFileTree([])).toMatchObject({ folders: [], files: [], descendantFiles: [] });
  });
});
