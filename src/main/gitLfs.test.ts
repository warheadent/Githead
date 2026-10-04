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

  it.each([
    ["added", `+version https://git-lfs.github.com/spec/v1\n+oid sha256:${"b".repeat(64)}\n+size 12`],
    ["deleted", `-version https://git-lfs.github.com/spec/v1\n-oid sha256:${"b".repeat(64)}\n-size 12`],
    ["changed size", ` version https://git-lfs.github.com/spec/v1\n-oid sha256:${"b".repeat(64)}\n-size 12\n+oid sha256:${"c".repeat(64)}\n+size 13`],
    ["unchanged size", `diff --git a/asset.png b/asset.png\nindex 1234567..2345678 100644\n--- a/asset.png\n+++ b/asset.png\n@@ -1,3 +1,3 @@\n version https://git-lfs.github.com/spec/v1\n-oid sha256:${"b".repeat(64)}\n+oid sha256:${"c".repeat(64)}\n size 12`],
  ])("recognizes %s pointer diffs", (_description, diff) => {
    expect(isGitLfsPointerDiff(diff)).toBe(true);
  });

  it.each([
    ["ordinary pointer text", `version https://git-lfs.github.com/spec/v1\noid sha256:${"b".repeat(64)}\nsize 12`],
    ["unchanged pointer context", ` version https://git-lfs.github.com/spec/v1\n oid sha256:${"b".repeat(64)}\n size 12`],
    ["missing version", `-oid sha256:${"b".repeat(64)}\n+oid sha256:${"c".repeat(64)}\n size 12`],
    ["malformed OID", " version https://git-lfs.github.com/spec/v1\n-oid sha256:invalid\n+oid sha256:invalid\n size 12"],
    ["missing size", ` version https://git-lfs.github.com/spec/v1\n-oid sha256:${"b".repeat(64)}\n+oid sha256:${"c".repeat(64)}`],
    ["malformed size", ` version https://git-lfs.github.com/spec/v1\n-oid sha256:${"b".repeat(64)}\n+oid sha256:${"c".repeat(64)}\n size 012`],
  ])("rejects %s as a pointer diff", (_description, diff) => {
    expect(isGitLfsPointerDiff(diff)).toBe(false);
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

  it.each(["size", "hash"])("reports a corrupt local object with a %s mismatch", async (mismatch) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lfs-corrupt-"));
    try {
      const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const oid = createHash("sha256").update(image).digest("hex");
      const objectPath = path.join(root, oid.slice(0, 2), oid.slice(2, 4), oid);
      await fs.mkdir(path.dirname(objectPath), { recursive: true });
      await fs.writeFile(objectPath, new Uint8Array(mismatch === "size" ? 1 : image.byteLength));
      await expect(resolveLocalLfsImage(root, { oid, size: image.byteLength }, "asset.png", true)).resolves.toEqual({ kind: "lfs-corrupt", byteLength: image.byteLength, fetchable: true });
      await expect(resolveLocalLfsImage(root, { oid, size: image.byteLength }, "asset.png", false)).resolves.toEqual({ kind: "lfs-corrupt", byteLength: image.byteLength, fetchable: false });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("distinguishes invalid storage from a missing object", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lfs-storage-"));
    try {
      const oid = "a".repeat(64);
      const objectPath = path.join(root, oid.slice(0, 2), oid.slice(2, 4), oid);
      await fs.mkdir(objectPath, { recursive: true });
      await expect(resolveLocalLfsImage(root, { oid, size: 8 }, "asset.png", true)).resolves.toMatchObject({ kind: "lfs-error", message: expect.stringContaining("not a file") });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
