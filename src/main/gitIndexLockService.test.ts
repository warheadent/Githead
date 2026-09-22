import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GitIndexLockService } from "./gitIndexLockService";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner";

describe("Git index lock recovery", () => {
  const git = new NodeProcessRunner();
  let root: string;
  let repoPath: string;
  let lockPath: string;
  let service: GitIndexLockService;
  const processes = vi.fn<ProcessRunner["run"]>();

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lock-test-"));
    repoPath = path.join(root, "repo");
    expect((await git.run("git", ["init", repoPath])).exitCode).toBe(0);
    lockPath = path.join(repoPath, ".git", "index.lock");
    processes.mockReset().mockResolvedValue({ exitCode: 0, stdout: '"Githead.exe","100"\n', stderr: "" });
    service = new GitIndexLockService({ run: (command, args, options) => command === "git"
      ? git.run(command, args, options) : processes(command, args, options) }, "win32");
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  async function createOldLock(target = lockPath) {
    await fs.writeFile(target, "stale lock");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(target, old, old);
  }
  async function fingerprint() {
    const inspection = await service.inspect(repoPath);
    expect(inspection.exitCode, inspection.stderr).toBe(0);
    expect(inspection.lock?.path).toBe(lockPath);
    return inspection.lock!.fingerprint;
  }

  it("recovers from a real staging failure without changing the existing index", async () => {
    await fs.writeFile(path.join(repoPath, "staged.txt"), "keep staged\n");
    await git.run("git", ["-C", repoPath, "add", "staged.txt"]);
    const index = await fs.readFile(path.join(repoPath, ".git", "index"));
    await fs.writeFile(path.join(repoPath, "next.txt"), "stage later\n");
    await createOldLock();
    const failed = await git.run("git", ["-C", repoPath, "add", "next.txt"]);
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr).toContain("index.lock");
    expect((await service.remove({ repoPath, fingerprint: await fingerprint() })).exitCode).toBe(0);
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(repoPath, ".git", "index"))).toEqual(index);
    expect((await git.run("git", ["-C", repoPath, "add", "next.txt"])).exitCode).toBe(0);
  });

  it("resolves a linked worktree's own index lock", async () => {
    await git.run("git", ["-C", repoPath, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Initial"]);
    const worktree = path.join(root, "linked");
    expect((await git.run("git", ["-C", repoPath, "worktree", "add", "-b", "linked", worktree])).exitCode).toBe(0);
    const resolved = await git.run("git", ["-C", worktree, "rev-parse", "--path-format=absolute", "--git-path", "index.lock"]);
    const linkedLock = resolved.stdout.trim();
    await createOldLock(linkedLock);
    await createOldLock();
    const inspection = await service.inspect(worktree);
    expect(inspection.lock?.path).toBe(linkedLock);
    expect((await service.remove({ repoPath: worktree, fingerprint: inspection.lock!.fingerprint })).exitCode).toBe(0);
    expect(await fs.readFile(lockPath, "utf8")).toBe("stale lock");
  });

  it.each(['"git.exe","200"\n', '"git-remote-https.exe","200"\n'])("blocks recovery when Windows reports a Git process: %s", async (stdout) => {
    await createOldLock();
    const token = await fingerprint();
    processes.mockResolvedValue({ exitCode: 0, stdout, stderr: "" });
    expect((await service.inspect(repoPath)).stderr).toContain("A Git process is running");
    expect((await service.remove({ repoPath, fingerprint: token })).stderr).toContain("A Git process is running");
    expect(await fs.readFile(lockPath, "utf8")).toBe("stale lock");
    expect(processes).toHaveBeenCalledWith("tasklist.exe", ["/FO", "CSV", "/NH"], undefined);
  });

  it("fails closed when the process check fails", async () => {
    await createOldLock();
    const token = await fingerprint();
    processes.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "Access denied" });
    expect((await service.remove({ repoPath, fingerprint: token })).stderr).toContain("could not check");
    expect(await fs.readFile(lockPath, "utf8")).toBe("stale lock");
  });

  it("rejects recently modified locks", async () => {
    await fs.writeFile(lockPath, "active");
    expect((await service.inspect(repoPath)).stderr).toContain("modified recently");
    expect((await service.remove({ repoPath, fingerprint: "invalid" })).exitCode).not.toBe(0);
    expect(await fs.readFile(lockPath, "utf8")).toBe("active");
  });

  it("rejects a replaced lock even when it has an old modification time", async () => {
    await createOldLock();
    const token = await fingerprint();
    await fs.rename(lockPath, `${lockPath}.old`);
    await createOldLock();
    expect((await service.remove({ repoPath, fingerprint: token })).stderr).toContain("changed after it was checked");
    expect(await fs.readFile(lockPath, "utf8")).toBe("stale lock");
  });

  it.skipIf(process.platform === "win32")("does not follow a symbolic link", async () => {
    const target = path.join(root, "valuable");
    await fs.writeFile(target, "keep");
    await fs.symlink(target, lockPath);
    expect((await service.inspect(repoPath)).stderr).toContain("not a regular file");
    expect((await service.remove({ repoPath, fingerprint: "invalid" })).exitCode).not.toBe(0);
    expect(await fs.readFile(target, "utf8")).toBe("keep");
  });

  it("does not remove a directory", async () => {
    await fs.mkdir(lockPath);
    expect((await service.inspect(repoPath)).stderr).toContain("not a regular file");
  });

  it("handles a lock removed elsewhere", async () => {
    await createOldLock();
    const token = await fingerprint();
    await fs.unlink(lockPath);
    expect((await service.remove({ repoPath, fingerprint: token })).stderr).toContain("no longer exists");
  });

  it("does not delete after cancellation during the process check", async () => {
    await createOldLock();
    const token = await fingerprint();
    const controller = new AbortController();
    processes.mockImplementation(async () => {
      controller.abort();
      return { exitCode: 0, stdout: '"Githead.exe","100"\n', stderr: "" };
    });
    expect((await service.remove({ repoPath, fingerprint: token }, controller.signal)).exitCode).not.toBe(0);
    expect(await fs.readFile(lockPath, "utf8")).toBe("stale lock");
  });

  it("recognizes Git processes on Linux and macOS", async () => {
    await createOldLock();
    const posix = new GitIndexLockService({ run: (command, args, options) => command === "git"
      ? git.run(command, args, options) : processes(command, args, options) }, "darwin");
    processes.mockResolvedValue({ exitCode: 0, stdout: "launchd\n/opt/bin/git\n", stderr: "" });
    expect((await posix.inspect(repoPath)).stderr).toContain("A Git process is running");
    processes.mockResolvedValue({ exitCode: 0, stdout: "launchd\ngithead\n", stderr: "" });
    expect((await posix.inspect(repoPath)).exitCode).toBe(0);
  });
});
