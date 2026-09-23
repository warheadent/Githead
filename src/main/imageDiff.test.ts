import { describe, expect, it } from "vite-plus/test";
import { IMAGE_PREVIEW_LIMIT, imageVersionFromBytes, isPreviewableImagePath, isPreviewableRasterImagePath } from "./imageDiff";

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

  it("accepts UTF-8 SVG for preview while keeping it out of raster diffs", () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<!-- mark -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
    expect(isPreviewableImagePath("asset.SVG")).toBe(true);
    expect(isPreviewableRasterImagePath("asset.svg")).toBe(false);
    expect(imageVersionFromBytes("asset.svg", svg)).toMatchObject({ kind: "image", version: { mimeType: "image/svg+xml", byteLength: svg.byteLength } });
  });

  it("rejects mislabeled or unsafe XML, signature mismatches, and oversized data", () => {
    for (const source of ["<html></html>", "<!DOCTYPE svg><svg></svg>", "<svg>\0</svg>"]) {
      expect(imageVersionFromBytes("asset.svg", new TextEncoder().encode(source)).kind).toBe("invalid");
    }
    expect(imageVersionFromBytes("asset.svg", bytes(0xff, 0xfe, 0x00)).kind).toBe("invalid");
    expect(imageVersionFromBytes("asset.png", bytes(0xff, 0xd8, 0xff)).kind).toBe("invalid");
    expect(imageVersionFromBytes("asset.png", new Uint8Array(IMAGE_PREVIEW_LIMIT + 1)).kind).toBe("oversized");
  });
});
