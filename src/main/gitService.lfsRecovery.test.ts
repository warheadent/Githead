import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";

describe("GitService LFS recovery with a local remote", { timeout: 30_000 }, () => {
  it("repairs only the selected object and preserves worktree and index content", async (context) => {
    const runner = new NodeProcessRunner();
    const help = await runner.run("git", ["lfs", "fetch", "--help"]);
    if (help.exitCode !== 0 || !help.stdout.includes("--refetch")) context.skip("Requires Git LFS with --refetch support.");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lfs-recovery-"));
    try {
      const repoPath = path.join(root, "work");
      const remotePath = path.join(root, "remote.git");
      const git = async (args: string[], cwd = repoPath) => {
        const result = await runner.run("git", ["-C", cwd, ...args], {
          env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "no-global-config") }
        });
        expect(result.exitCode, result.stderr).toBe(0);
        return result.stdout;
      };
      await fs.mkdir(repoPath);
      await git(["init", "--initial-branch=main"]);
      await git(["init", "--bare", remotePath]);
      await git(["config", "user.name", "Githead Test"]);
      await git(["config", "user.email", "githead-test@example.test"]);
      await git(["config", "commit.gpgsign", "false"]);
      await git(["remote", "add", "origin", remotePath]);
      await git(["config", "lfs.fetchrecentalways", "true"]);
      await fs.writeFile(path.join(repoPath, ".gitattributes"), "*.png filter=lfs diff=lfs merge=lfs -text\n");
      const images = [
        { name: "image.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
        { name: "other.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]) }
      ];
      const objects = [];
      for (const image of images) {
        const oid = createHash("sha256").update(image.bytes).digest("hex");
        const relativePath = path.join(oid.slice(0, 2), oid.slice(2, 4), oid);
        const remoteObject = path.join(remotePath, "lfs", "objects", relativePath);
        const localObject = path.join(repoPath, ".git", "lfs", "objects", relativePath);
        const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${image.bytes.length}\n`;
        await fs.mkdir(path.dirname(remoteObject), { recursive: true });
        await fs.writeFile(remoteObject, image.bytes);
        await fs.mkdir(path.dirname(localObject), { recursive: true });
        await fs.writeFile(localObject, Buffer.alloc(image.bytes.length));
        await fs.writeFile(path.join(repoPath, image.name), pointer);
        objects.push({ ...image, localObject, pointer });
      }
      await git(["-c", "filter.lfs.process=", "-c", "filter.lfs.clean=cat", "-c", "filter.lfs.required=false", "add", "."]);
      await git(["commit", "-m", "Add LFS image pointers"]);
      const indexBefore = await git(["ls-files", "--stage"]);
      const service = new GitService(runner);
      const result = await service.fetchLfsImageVersions({ context: "status", repoPath, path: "image.png", side: "unstaged" });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(await fs.readFile(objects[0]!.localObject)).toEqual(objects[0]!.bytes);
      expect(await fs.readFile(objects[1]!.localObject)).toEqual(Buffer.alloc(objects[1]!.bytes.length));
      expect(await fs.readFile(path.join(repoPath, "image.png"), "utf8")).toBe(objects[0]!.pointer);
      expect(await git(["ls-files", "--stage"])).toBe(indexBefore);
      await expect(service.getFilePreviewImage({ repoPath, path: "image.png", source: { kind: "staged" } })).resolves.toMatchObject({ data: new Uint8Array(objects[0]!.bytes) });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
