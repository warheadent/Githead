import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-discard-"));
  directories.push(repoPath);
  const runner = new NodeProcessRunner();
  const git = async (...args: string[]) => {
    const result = await runner.run("git", ["-C", repoPath, ...args]);
    expect(result.exitCode, result.stderr).toBe(0);
  };
  await git("init");
  await git("config", "user.name", "Discard Test");
  await git("config", "user.email", "discard@example.test");
  await fs.writeFile(path.join(repoPath, "file.txt"), "original\n");
  await git("add", ".");
  await git("commit", "-m", "initial");
  await fs.writeFile(path.join(repoPath, "file.txt"), "changed\n");
  return { repoPath, git, service: new GitService(runner), request: { repoPath, paths: ["file.txt"], side: "unstaged" as const } };
}

it("discards an unchanged selected file after unrelated activity", async () => {
  const { repoPath, service, request } = await fixture();
  const expectedSnapshot = await service.getDiscardSnapshot(request);
  await fs.writeFile(path.join(repoPath, "unrelated.txt"), "activity\n");
  expect(await service.getDiscardSnapshot(request)).toBe(expectedSnapshot);
  expect((await service.revertFileChanges({ ...request, expectedSnapshot })).exitCode).toBe(0);
  expect(await fs.readFile(path.join(repoPath, "file.txt"), "utf8")).toBe("original\n");
});

it("refuses new edits even if the status remains modified", async () => {
  const { repoPath, service, request } = await fixture();
  const expectedSnapshot = await service.getDiscardSnapshot(request);
  await fs.writeFile(path.join(repoPath, "file.txt"), "new edits\n");
  expect((await service.revertFileChanges({ ...request, expectedSnapshot })).exitCode).not.toBe(0);
  expect(await fs.readFile(path.join(repoPath, "file.txt"), "utf8")).toBe("new edits\n");
});

it("detects changed binary content", async () => {
  const { repoPath, git, service, request } = await fixture();
  await fs.writeFile(path.join(repoPath, "file.txt"), Buffer.from([0, 1, 2]));
  await git("add", ".");
  await git("commit", "-m", "binary");
  await fs.writeFile(path.join(repoPath, "file.txt"), Buffer.from([0, 3, 4]));
  const expectedSnapshot = await service.getDiscardSnapshot(request);
  await fs.writeFile(path.join(repoPath, "file.txt"), Buffer.from([0, 5, 6]));
  expect(await service.getDiscardSnapshot(request)).not.toBe(expectedSnapshot);
  expect((await service.revertFileChanges({ ...request, expectedSnapshot })).exitCode).not.toBe(0);
});

it("ignores external target edits but detects a changed symlink itself", async () => {
  const { repoPath, git, service } = await fixture();
  const external = await fs.mkdtemp(path.join(os.tmpdir(), "githead-discard-target-"));
  directories.push(external);
  await fs.writeFile(path.join(external, "target"), "original");
  await fs.symlink(path.join(external, "target"), path.join(repoPath, "link"));
  await git("add", "link");
  await git("commit", "-m", "symlink");
  const request = { repoPath, paths: ["link"], side: "unstaged" as const };
  const snapshot = await service.getDiscardSnapshot(request);
  await fs.writeFile(path.join(external, "target"), "unrelated edits");
  expect(await service.getDiscardSnapshot(request)).toBe(snapshot);
  await fs.unlink(path.join(repoPath, "link"));
  await fs.symlink(path.join(external, "other"), path.join(repoPath, "link"));
  expect(await service.getDiscardSnapshot(request)).not.toBe(snapshot);
});

it("refuses a changed index before discarding staged changes", async () => {
  const { repoPath, git, service, request } = await fixture();
  await git("add", "file.txt");
  const staged = { ...request, side: "staged" as const };
  const expectedSnapshot = await service.getDiscardSnapshot(staged);
  await fs.writeFile(path.join(repoPath, "file.txt"), "later staged edits\n");
  await git("add", "file.txt");
  expect((await service.revertFileChanges({ ...staged, expectedSnapshot })).exitCode).not.toBe(0);
});

it("checks every selected file before a bulk discard", async () => {
  const { repoPath, git, service, request } = await fixture();
  await fs.writeFile(path.join(repoPath, "second.txt"), "original\n");
  await git("add", "second.txt");
  await git("commit", "-m", "second file");
  await fs.writeFile(path.join(repoPath, "second.txt"), "changed\n");
  const bulk = { ...request, paths: ["file.txt", "second.txt"] };
  const expectedSnapshot = await service.getDiscardSnapshot(bulk);
  await fs.writeFile(path.join(repoPath, "second.txt"), "later edits\n");
  expect((await service.revertFileChanges({ ...bulk, expectedSnapshot })).exitCode).not.toBe(0);
  expect(await fs.readFile(path.join(repoPath, "file.txt"), "utf8")).toBe("changed\n");
  expect(await fs.readFile(path.join(repoPath, "second.txt"), "utf8")).toBe("later edits\n");
});

it("refuses incomplete snapshots", async () => {
  const service = new GitService({ run: async () => ({ exitCode: 0, stdout: "partial", stderr: "", stdoutTruncated: true }) });
  await expect(service.getDiscardSnapshot({ repoPath: "/unused", paths: ["file.txt"], side: "unstaged" })).rejects.toThrow("Unable to check");
});
