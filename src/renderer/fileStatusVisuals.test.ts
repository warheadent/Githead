import { describe, expect, it } from "vite-plus/test";
import type { GitStatusFile } from "../shared/types";
import {
  getCommitFileStatusVisuals,
  getFileStatusVisuals,
  getStatusTone
} from "./fileStatusVisuals";

describe("file status visuals", () => {
  it("uses side-specific live status codes", () => {
    const file = createStatusFile({
      indexStatus: "A",
      worktreeStatus: "M",
      isStaged: true,
      isUnstaged: true
    });

    expect(getFileStatusVisuals(file, "staged")).toMatchObject({
      code: "A",
      tone: "added",
      label: "Added file"
    });
    expect(getFileStatusVisuals(file, "unstaged")).toMatchObject({
      code: "M",
      tone: "modified",
      label: "Modified file"
    });
  });

  it("keeps untracked files as question mark badges", () => {
    const file = createStatusFile({
      indexStatus: "?",
      worktreeStatus: "?",
      isUnstaged: true
    });

    expect(getFileStatusVisuals(file, "unstaged")).toMatchObject({
      code: "?",
      tone: "untracked",
      label: "Untracked file"
    });
  });

  it("lets conflicts override the raw status", () => {
    const file = createStatusFile({
      indexStatus: "M",
      worktreeStatus: "D",
      isStaged: true,
      isUnstaged: true,
      isConflicted: true
    });

    expect(getFileStatusVisuals(file, "staged")).toMatchObject({
      code: "UU",
      tone: "conflict",
      label: "Conflicted file"
    });
  });

  it("falls back to neutral for unknown statuses", () => {
    expect(getStatusTone("Z")).toBe("neutral");
    expect(getCommitFileStatusVisuals("changed")).toMatchObject({
      code: "changed",
      tone: "neutral",
      label: "Changed file"
    });
  });

  it("normalizes commit changed-file status words and codes", () => {
    expect(getCommitFileStatusVisuals("modified")).toMatchObject({
      code: "M",
      tone: "modified"
    });
    expect(getCommitFileStatusVisuals("D")).toMatchObject({
      code: "D",
      tone: "deleted"
    });
  });
});

function createStatusFile(overrides: Partial<GitStatusFile>): GitStatusFile {
  return {
    path: "src/example.ts",
    indexStatus: ".",
    worktreeStatus: ".",
    isStaged: false,
    isUnstaged: false,
    isConflicted: false,
    ...overrides
  };
}
