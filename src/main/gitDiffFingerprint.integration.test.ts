import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { GitDiffSide } from "../shared/types";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from([0, 0, 0, 0])]);

async function createRepository() {
  const runner = new NodeProcessRunner();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-diff-fingerprint-"));
  directories.push(dir);
  const git = async (...args: string[]) => {
    const result = await runner.run("git", ["-C", dir, ...args]);
    expect(result.exitCode, result.stderr).toBe(0);
    return result.stdout;
  };
  await git("init");
  await git("config", "user.name", "Fingerprint Test");
  await git("config", "user.email", "fingerprint@example.test");
  await git("config", "core.autocrlf", "false");
  const service = new GitService(runner);
  const fingerprint = async (filePath: string, side: GitDiffSide) =>
    (await service.getFileDiffFingerprint({ repoPath: dir, path: filePath, side })).fingerprint;
  const write = (filePath: string, content: string | Buffer) => fs.writeFile(path.join(dir, filePath), content);
  return { dir, git, service, fingerprint, write };
}

describe("working-tree diff fingerprints", () => {
  it("matches the fingerprint returned with the diff and changes only with the displayed diff", async () => {
    const { dir, git, service, fingerprint, write } = await createRepository();
    await write("app.ts", "one\n");
    await write("other.ts", "other\n");
    await git("add", ".");
    await git("commit", "-m", "fixture");
    await write("app.ts", "two\n");

    const diff = await service.getFileDiff({ repoPath: dir, path: "app.ts", side: "unstaged" });
    expect(diff).toMatchObject({ kind: "text", text: expect.stringContaining("+two") });
    expect(diff.fingerprint).toEqual(expect.any(String));
    await expect(fingerprint("app.ts", "unstaged")).resolves.toBe(diff.fingerprint);

    // Unrelated changes and a touch without content changes keep the diff.
    await write("other.ts", "changed\n");
    const later = new Date(Date.now() + 5_000);
    await fs.utimes(path.join(dir, "app.ts"), later, later);
    await expect(fingerprint("app.ts", "unstaged")).resolves.toBe(diff.fingerprint);

    // A same-size rewrite changes the content identity.
    await write("app.ts", "six\n");
    const edited = await fingerprint("app.ts", "unstaged");
    expect(edited).not.toBe(diff.fingerprint);

    // Staging moves the change from the unstaged to the staged diff.
    const stagedBefore = await fingerprint("app.ts", "staged");
    await git("add", "app.ts");
    const stagedAfter = await fingerprint("app.ts", "staged");
    const unstagedAfter = await fingerprint("app.ts", "unstaged");
    expect(stagedAfter).not.toBe(stagedBefore);
    expect(unstagedAfter).not.toBe(edited);

    // Worktree edits do not change the staged diff, and committing the staged
    // content changes HEAD without changing the index-to-worktree diff.
    await write("app.ts", "seven\n");
    await expect(fingerprint("app.ts", "staged")).resolves.toBe(stagedAfter);
    const unstagedEdited = await fingerprint("app.ts", "unstaged");
    expect(unstagedEdited).not.toBe(unstagedAfter);
    await git("commit", "-m", "stage app");
    await expect(fingerprint("app.ts", "unstaged")).resolves.toBe(unstagedEdited);
    await expect(fingerprint("app.ts", "staged")).resolves.not.toBe(stagedAfter);
  });

  it("tracks untracked, deleted, and executable-bit changes", async () => {
    const { dir, git, fingerprint, write } = await createRepository();
    await write("tool.sh", "echo one\n");
    await git("add", ".");
    await git("commit", "-m", "fixture");

    await write("new.ts", "draft\n");
    const untracked = await fingerprint("new.ts", "unstaged");
    await write("new.ts", "final\n");
    const untrackedEdited = await fingerprint("new.ts", "unstaged");
    expect(untrackedEdited).not.toBe(untracked);

    const clean = await fingerprint("tool.sh", "unstaged");
    if (process.platform !== "win32") {
      await fs.chmod(path.join(dir, "tool.sh"), 0o755);
      const executable = await fingerprint("tool.sh", "unstaged");
      expect(executable).not.toBe(clean);
    }
    await fs.rm(path.join(dir, "tool.sh"));
    await expect(fingerprint("tool.sh", "unstaged")).resolves.not.toBe(clean);
  });

  it("fingerprints image diffs without reading either version", async () => {
    const { dir, git, service, fingerprint, write } = await createRepository();
    await write("image.png", Buffer.concat([png, Buffer.from("committed")]));
    await git("add", ".");
    await git("commit", "-m", "fixture");
    await write("image.png", Buffer.concat([png, Buffer.from("working")]));

    const diff = await service.getFileDiff({ repoPath: dir, path: "image.png", side: "unstaged" });
    expect(diff.kind).toBe("image");
    expect(diff.fingerprint).toEqual(expect.any(String));
    await expect(fingerprint("image.png", "unstaged")).resolves.toBe(diff.fingerprint);

    await write("image.png", Buffer.concat([png, Buffer.from("replaced")]));
    await expect(fingerprint("image.png", "unstaged")).resolves.not.toBe(diff.fingerprint);
  });

  it("returns no fingerprint for submodules so their diffs are compared in full", async () => {
    const { dir, git, fingerprint } = await createRepository();
    const child = await createRepository();
    await child.write("child.txt", "child\n");
    await child.git("add", ".");
    await child.git("commit", "-m", "child");
    await git("-c", "protocol.file.allow=always", "submodule", "add", child.dir, "child");
    await git("commit", "-m", "add submodule");
    await fs.writeFile(path.join(dir, "child", "child.txt"), "changed\n");

    await expect(fingerprint("child", "unstaged")).resolves.toBeNull();
  });
});
