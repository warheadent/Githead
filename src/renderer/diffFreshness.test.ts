import { describe, expect, it } from "vite-plus/test";
import type { GitFileDiff, GitImageSide } from "../shared/types";
import { areFileDiffsEqual } from "./diffFreshness";

describe("areFileDiffsEqual", () => {
  it("compares text content and truncation state", () => {
    const base: GitFileDiff = { path: "src/app.ts", side: "unstaged", kind: "text", text: "+one" };

    expect(areFileDiffsEqual(base, { ...base })).toBe(true);
    expect(areFileDiffsEqual(base, { ...base, text: "+two" })).toBe(false);
    expect(areFileDiffsEqual(base, { ...base, truncated: true })).toBe(false);
  });

  it("compares image bytes without serializing them", () => {
    const createImageDiff = (data: number[]): GitFileDiff => ({
      path: "assets/icon.png",
      side: "staged",
      kind: "image",
      text: "",
      before: { status: "absent" },
      after: {
        status: "available",
        version: { mimeType: "image/png", data: Uint8Array.from(data), byteLength: data.length }
      }
    });

    expect(areFileDiffsEqual(createImageDiff([1, 2]), createImageDiff([1, 2]))).toBe(true);
    expect(areFileDiffsEqual(createImageDiff([1, 2]), createImageDiff([1, 3]))).toBe(false);
  });

  it("updates previews when the failure reason or recovery action changes", () => {
    const diff = (after: GitImageSide): GitFileDiff => ({ path: "image.png", side: "staged", kind: "image", text: "", before: { status: "absent" }, after });
    const corrupt = { status: "lfs-corrupt", byteLength: 8, fetchable: true } as const;
    expect(areFileDiffsEqual(diff(corrupt), diff({ ...corrupt }))).toBe(true);
    expect(areFileDiffsEqual(diff(corrupt), diff({ ...corrupt, fetchable: false }))).toBe(false);
    expect(areFileDiffsEqual(diff(corrupt), diff({ ...corrupt, status: "lfs-missing" }))).toBe(false);
    const setup = { status: "unavailable", reason: "lfs-setup", message: "Install Git LFS." } as const;
    expect(areFileDiffsEqual(diff(setup), diff({ ...setup }))).toBe(true);
    expect(areFileDiffsEqual(diff(setup), diff({ ...setup, message: "Check storage." }))).toBe(false);
  });
});
