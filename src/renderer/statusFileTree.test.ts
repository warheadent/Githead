import { describe, expect, it } from "vite-plus/test";
import type { GitStatusFile } from "../shared/types";
import { buildStatusFileTree, flattenStatusFileTree } from "./statusFileTree";

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

  it("flattens only visible tree rows and keeps their levels", () => {
    const tree = buildStatusFileTree([file("README.md"), file("src/App.tsx"), file("src/lib/utils.ts")]);
    const expandedRows = flattenStatusFileTree(tree, new Set());
    expect(expandedRows.map((row) => row.kind === "folder" ? `${row.level}:${row.folder.id}` : `${row.level}:${row.file.path}`)).toEqual([
      "1:src",
      "2:src/lib",
      "3:src/lib/utils.ts",
      "2:src/App.tsx",
      "1:README.md"
    ]);
    expect(expandedRows.map((row) => `${row.position}/${row.setSize}`)).toEqual(["1/2", "1/2", "1/1", "2/2", "2/2"]);

    const collapsedRows = flattenStatusFileTree(tree, new Set(["src"]));
    expect(collapsedRows.map((row) => row.kind === "folder" ? row.folder.id : row.file.path)).toEqual(["src", "README.md"]);
  });
});
