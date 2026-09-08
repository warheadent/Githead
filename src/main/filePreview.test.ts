import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";
import { resolvePreviewFile, validatePreviewPath } from "./filePreview";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-preview-test-"));
  directories.push(dir);
  return dir;
}

const png = Buffer.from("89504e470d0a1a0a", "hex");

describe("repository preview assets", () => {
  it("reads the requested image version without replacing it with the working image", async () => {
    const dir = await temporaryDirectory();
    const runner = new NodeProcessRunner();
    const git = async (...args: string[]) => {
      const result = await runner.run("git", ["-C", dir, ...args]);
      expect(result.exitCode, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    await git("init");
    await fs.writeFile(path.join(dir, "image.png"), Buffer.concat([png, Buffer.from("committed")]));
    await git("add", ".");
    await git("-c", "user.name=Preview Test", "-c", "user.email=preview@example.test", "commit", "-m", "fixture");
    const hash = await git("rev-parse", "HEAD");
    await fs.writeFile(path.join(dir, "image.png"), Buffer.concat([png, Buffer.from("staged")]));
    await git("add", ".");
    await fs.writeFile(path.join(dir, "image.png"), Buffer.concat([png, Buffer.from("working")]));
    const service = new GitService(runner);
    for (const [source, expected] of [
      [{ kind: "commit", hash }, "committed"],
      [{ kind: "staged" }, "staged"],
      [{ kind: "working" }, "working"]
    ] as const) {
      const image = await service.getFilePreviewImage({ repoPath: dir, path: "image.png", source });
      expect(Buffer.from(image.data).subarray(8).toString()).toBe(expected);
    }
    await expect(service.getFilePreviewImage({ repoPath: dir, path: "image.png", source: { kind: "commit", hash: "HEAD~1" } }))
      .rejects.toThrow("Commit hash is invalid");
    await expect(service.getFilePreviewImage({ repoPath: dir, path: "missing.png", source: { kind: "working" } }))
      .rejects.toThrow("missing");
  });

  it("rejects traversal and symlinks that leave the repository", async () => {
    const dir = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await fs.writeFile(path.join(outside, "image.png"), png);
    await fs.symlink(path.join(outside, "image.png"), path.join(dir, "image.png"));
    await expect(resolvePreviewFile(dir, "image.png")).rejects.toThrow("inside the repository");
    for (const invalid of ["../image.png", "/image.png", "C:/image.png", "..\\image.png", "image\0.png"]) {
      expect(() => validatePreviewPath(invalid)).toThrow();
    }
  });
});
