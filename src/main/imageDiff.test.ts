import { describe, expect, it } from "vite-plus/test";
import { IMAGE_PREVIEW_LIMIT, imageVersionFromBytes, isPreviewableImagePath } from "./imageDiff";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("imageDiff", () => {
  it.each([
    ["asset.PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
    ["asset.jpeg", bytes(0xff, 0xd8, 0xff), "image/jpeg"],
    ["asset.gif", new TextEncoder().encode("GIF89a"), "image/gif"],
    ["asset.webp", new TextEncoder().encode("RIFFxxxxWEBP"), "image/webp"],
    ["asset.bmp", new TextEncoder().encode("BM"), "image/bmp"],
    ["asset.ico", bytes(0, 0, 1, 0, 1, 0), "image/x-icon"]
  ])("recognizes %s by extension and signature", (filePath, data, mimeType) => {
    expect(isPreviewableImagePath(filePath)).toBe(true);
    expect(imageVersionFromBytes(filePath, data)).toMatchObject({ kind: "image", version: { mimeType } });
  });

  it("rejects SVG, signature mismatches, and oversized data", () => {
    expect(isPreviewableImagePath("asset.svg")).toBe(false);
    expect(imageVersionFromBytes("asset.png", bytes(0xff, 0xd8, 0xff)).kind).toBe("invalid");
    expect(imageVersionFromBytes("asset.png", new Uint8Array(IMAGE_PREVIEW_LIMIT + 1)).kind).toBe("oversized");
  });
});
