import { describe, expect, it } from "vite-plus/test";
import { containsGitConflictMarkers } from "./conflictMarkers";

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
