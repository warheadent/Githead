import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import type { BinaryProcessResult, ProcessResult, ProcessRunner } from "./processRunner";

const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const oid = createHash("sha256").update(image).digest("hex");
const pointer = new TextEncoder().encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${image.byteLength}\n`);
const hash = "a".repeat(40);
const ok = (stdout = ""): ProcessResult => ({ exitCode: 0, stdout, stderr: "" });
const absent = (): ProcessResult => ({ exitCode: 1, stdout: "", stderr: "" });

class LfsConfigurationRunner implements ProcessRunner {
  branch: string | null = "main";
  readonly config = new Map<string, string>();
  remotes = ["origin", "upstream"];
  readonly fetchRemotes: string[] = [];
  onFetch?: () => void;
  envAvailable = true;

  constructor(public mediaDir: string) {}

  async run(_command: string, args: string[]): Promise<ProcessResult> {
    const command = args.slice(2);
    if (command[0] === "rev-parse") return ok(command.includes("--is-inside-work-tree") ? "true\n" : `${hash}\n`);
    if (command[0] === "symbolic-ref") return this.branch ? ok(`${this.branch}\n`) : absent();
    if (command[0] === "config") {
      const value = this.config.get(command.at(-1)!);
      return value === undefined ? absent() : ok(`${value}\n`);
    }
    if (command[0] === "remote") return ok(this.remotes.join("\n"));
    if (command[0] === "show") return ok("Binary files a/asset.png and b/asset.png differ\n");
    if (command.includes("lfs") && command.includes("env")) return this.envAvailable ? ok(`LocalMediaDir=${this.mediaDir}\n`) : absent();
    if (command.includes("lfs") && command.includes("fetch")) {
      this.fetchRemotes.push(command.at(-2)!);
      this.onFetch?.();
      await writeObject(this.mediaDir);
      return ok();
    }
    throw new Error(`Unexpected Git command: ${command.join(" ")}`);
  }

  async runBinary(): Promise<BinaryProcessResult> {
    return { exitCode: 0, stdout: pointer, stderr: "" };
  }
}

async function writeObject(mediaDir: string): Promise<void> {
  const objectPath = path.join(mediaDir, oid.slice(0, 2), oid.slice(2, 4), oid);
  await fs.mkdir(path.dirname(objectPath), { recursive: true });
  await fs.writeFile(objectPath, image);
}

describe("GitService LFS configuration", () => {
  let root: string;
  let runner: LfsConfigurationRunner;
  let service: GitService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-lfs-config-"));
    runner = new LfsConfigurationRunner(path.join(root, "old", "objects"));
    service = new GitService(runner);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("uses remote.lfsdefault before origin when the branch has no remote", async () => {
    runner.config.set("remote.lfsdefault", "upstream");
    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    expect(runner.fetchRemotes).toEqual(["upstream"]);
  });

  it.each(["branch-source", "."])("uses the current branch remote %s before remote.lfsdefault", async (remote) => {
    runner.config.set("branch.main.remote", remote);
    runner.config.set("remote.lfsdefault", "upstream");
    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    expect(runner.fetchRemotes).toEqual([remote]);
  });

  it("uses remote.lfsdefault when HEAD is detached", async () => {
    runner.branch = null;
    runner.config.set("remote.lfsdefault", "upstream");
    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    expect(runner.fetchRemotes).toEqual(["upstream"]);
  });

  it.each([["origin", "upstream"], ["upstream"]])("keeps the fallback for remotes %j", async (...remotes) => {
    runner.remotes = remotes;
    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    expect(runner.fetchRemotes).toEqual([remotes[0]]);
  });

  it("uses the new storage for both sides of the next preview", async () => {
    await writeObject(runner.mediaDir);
    const request = { repoPath: root, path: "asset.png", hash };
    await expect(service.getCommitFileDiff(request)).resolves.toMatchObject({
      kind: "image", before: { status: "available" }, after: { status: "available" }
    });

    await fs.rm(runner.mediaDir, { recursive: true });
    runner.mediaDir = path.join(root, "new", "objects");
    await writeObject(runner.mediaDir);
    await expect(service.getCommitFileDiff(request)).resolves.toMatchObject({
      kind: "image", before: { status: "available" }, after: { status: "available" }
    });
  });

  it("downloads and verifies in storage changed since the previous preview", async () => {
    await writeObject(runner.mediaDir);
    await service.getFilePreviewImage({ repoPath: root, path: "asset.png", source: { kind: "staged" } });
    await fs.rm(runner.mediaDir, { recursive: true });
    runner.mediaDir = path.join(root, "new", "objects");

    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    expect(runner.fetchRemotes).toEqual(["origin"]);
    await expect(service.getFilePreviewImage({ repoPath: root, path: "asset.png", source: { kind: "staged" } })).resolves.toMatchObject({ data: image });
  });

  it("refreshes the storage directory after a download", async () => {
    runner.onFetch = () => { runner.mediaDir = path.join(root, "new", "objects"); };
    const result = await service.fetchLfsImageVersions({ repoPath: root, path: "asset.png", context: "status", side: "unstaged" });
    expect(result.exitCode).toBe(0);
    await expect(service.getFilePreviewImage({ repoPath: root, path: "asset.png", source: { kind: "staged" } })).resolves.toMatchObject({ data: image });
  });

  it("does not reuse old storage when the current LFS environment cannot be read", async () => {
    await writeObject(runner.mediaDir);
    const request = { repoPath: root, path: "asset.png", source: { kind: "staged" } as const };
    await service.getFilePreviewImage(request);
    runner.envAvailable = false;
    await expect(service.getFilePreviewImage(request)).rejects.toThrow();
  });
});
