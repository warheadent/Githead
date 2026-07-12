import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { escapeLfsIncludePath, isGitLfsPointerDiff, parseGitLfsPointer, parseLocalMediaDir, resolveLocalLfsImage } from "./gitLfs";

const pointer = (oid: string, size: number) => new TextEncoder().encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`);

describe("Git LFS image support", () => {
  it("parses canonical pointers and rejects malformed pointer-like text", () => {
    const oid = "a".repeat(64);
    expect(parseGitLfsPointer(pointer(oid, 123))).toEqual({ oid, size: 123 });
    expect(parseGitLfsPointer(new TextEncoder().encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 123`))).toBeNull();
    expect(parseGitLfsPointer(pointer(oid.toUpperCase(), 123))).toBeNull();
    expect(parseGitLfsPointer(new Uint8Array(1025))).toBeNull();
  });

  it("recognizes pointer diffs without matching ordinary text", () => {
    const oid = "b".repeat(64);
    expect(isGitLfsPointerDiff(`-version https://git-lfs.github.com/spec/v1\n-oid sha256:${oid}\n-size 12`)).toBe(true);
    expect(isGitLfsPointerDiff(` version https://git-lfs.github.com/spec/v1\n-oid sha256:${oid}\n-size 12\n+oid sha256:${"c".repeat(64)}\n+size 13`)).toBe(true);
    expect(isGitLfsPointerDiff(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 12`)).toBe(false);
  });

  it("parses media directories and escapes safe include paths", () => {
    expect(parseLocalMediaDir("LocalMediaDir=D:\\Shared LFS\\objects\r\n")).toBe("D:\\Shared LFS\\objects");
    expect(escapeLfsIncludePath("images/a[1]*.png")).toBe("images/a\\[1\\]\\*.png");
    expect(escapeLfsIncludePath("images/a,b.png")).toBeNull();
  });

  it("verifies locally cached object size, hash, and image signature", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lfs-test-"));
    try {
      const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const oid = createHash("sha256").update(image).digest("hex");
      const objectPath = path.join(root, oid.slice(0, 2), oid.slice(2, 4), oid);
      await fs.mkdir(path.dirname(objectPath), { recursive: true });
      await fs.writeFile(objectPath, image);
      await expect(resolveLocalLfsImage(root, { oid, size: image.byteLength }, "asset.png", true)).resolves.toMatchObject({ kind: "image" });
      await expect(resolveLocalLfsImage(root, { oid: "c".repeat(64), size: image.byteLength }, "asset.png", true)).resolves.toEqual({ kind: "lfs-missing", byteLength: image.byteLength, fetchable: true });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
