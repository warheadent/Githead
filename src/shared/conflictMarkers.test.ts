import { describe, expect, it } from "vite-plus/test";
import { containsGitConflictMarkers, getGitConflictMarkerKind } from "./conflictMarkers";

describe("containsGitConflictMarkers", () => {
  it.each([
    "<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> topic\n",
    "<<<<<<<<<< HEAD\ncurrent\n==========\nincoming\n>>>>>>>>>> topic\n",
    "<<<<<<< HEAD\ncurrent\n||||||| base\nbase\n=======\nincoming\n>>>>>>> topic\n"
  ])("detects unresolved marker styles", (text) => {
    expect(containsGitConflictMarkers(text)).toBe(true);
  });

  it("does not reject ordinary separator text", () => {
    expect(containsGitConflictMarkers("heading\n===\nvalue > threshold\n")).toBe(false);
  });
});

describe("getGitConflictMarkerKind", () => {
  it("classifies standard and diff3 conflict boundaries", () => {
    expect(getGitConflictMarkerKind("<<<<<<< HEAD")).toBe("current");
    expect(getGitConflictMarkerKind("||||||| parent")).toBe("base");
    expect(getGitConflictMarkerKind("=======" )).toBe("separator");
    expect(getGitConflictMarkerKind(">>>>>>> topic")).toBe("incoming");
    expect(getGitConflictMarkerKind("const comparison = left > right;")).toBeNull();
  });
});
