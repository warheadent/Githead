import fs from "node:fs/promises";
import path from "node:path";
import type { GitImageVersion } from "../shared/types";

export const IMAGE_PREVIEW_LIMIT = 10 * 1024 * 1024;

const EXTENSION_MIME = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".gif", "image/gif"], [".webp", "image/webp"], [".bmp", "image/bmp"], [".ico", "image/x-icon"]
]);

export type ImageReadResult =
  | { kind: "image"; version: GitImageVersion }
  | { kind: "missing" }
  | { kind: "oversized" }
  | { kind: "invalid" }
  | { kind: "lfs-missing"; byteLength: number; fetchable: boolean }
  | { kind: "error" };

export function isPreviewableImagePath(filePath: string): boolean {
  return EXTENSION_MIME.has(path.extname(filePath).toLowerCase());
}

export function imageVersionFromBytes(filePath: string, bytes: Uint8Array): ImageReadResult {
  if (bytes.byteLength > IMAGE_PREVIEW_LIMIT) return { kind: "oversized" };
  const expected = EXTENSION_MIME.get(path.extname(filePath).toLowerCase());
  const actual = detectMime(bytes);
  if (!expected || actual !== expected) return { kind: "invalid" };
  return { kind: "image", version: { mimeType: actual, data: new Uint8Array(bytes), byteLength: bytes.byteLength } };
}

export async function readImageFile(filePath: string, displayPath: string): Promise<ImageReadResult> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return { kind: "missing" };
    if (stat.size > IMAGE_PREVIEW_LIMIT) return { kind: "oversized" };
    return imageVersionFromBytes(displayPath, await fs.readFile(filePath));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "missing" } : { kind: "error" };
  }
}

export function imageFallbackText(results: ImageReadResult[]): string {
  return results.some((result) => result.kind === "oversized")
    ? "Image is larger than the 10 MiB preview limit."
    : "Image preview is unavailable.";
}

function detectMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 2 && ascii(0, 2) === "BM") return "image/bmp";
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && (bytes[4] !== 0 || bytes[5] !== 0)) return "image/x-icon";
  return null;
}
