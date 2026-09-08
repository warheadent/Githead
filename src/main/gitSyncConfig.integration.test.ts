import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GitService } from "./gitService";
import { GitConfigService } from "./gitConfigService";
import { NodeProcessRunner } from "./processRunner";

let directory: string;
let remote: string;
let local: string;
const runner = new NodeProcessRunner();
async function git(repo: string, ...args: string[]): Promise<string> {
  const result = await runner.run("git", ["-C", repo, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr || result.error);
  return result.stdout.trim();
}
async function commit(repo: string, file: string, content: string) {
  await fs.writeFile(path.join(repo, file), content);
  await git(repo, "add", file);
  await git(repo, "commit", "-m", content.trim());
}
async function policy(changes: Parameters<GitConfigService["saveSettings"]>[0]["changes"]) {
  const config = new GitConfigService(runner);
  const current = await config.getSettings({ repoPath: local, scope: "repository" });
  await config.saveSettings({ ...current, changes });
}
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-sync-config-"));
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(directory, "global"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  remote = path.join(directory, "remote");
  local = path.join(directory, "local");
  await fs.mkdir(remote);
  await git(remote, "init", "-b", "main");
  await git(remote, "config", "--global", "user.name", "Sync Test");
  await git(remote, "config", "--global", "user.email", "test@example.invalid");
  await commit(remote, "conflict.txt", "initial\n");
  await git(directory, "clone", remote, local);
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(directory, { recursive: true, force: true }); });

describe("Githead uses Git sync configuration", () => {
  it.each(["merge", "rebase", "ff-only"])("uses the selected %s pull policy", async (mode) => {
    await policy({ "pull.rebase": mode === "rebase" ? "true" : "false", "pull.ff": mode === "ff-only" ? "only" : "true" });
    await commit(local, "local.txt", "local change\n");
    const before = await git(local, "rev-parse", "HEAD");
    await commit(remote, "remote.txt", "remote change\n");
    const result = await new GitService(runner).runGitAction({ repoPath: local, action: "pull" });
    if (mode === "ff-only") {
      expect(result.exitCode).not.toBe(0);
      expect(await git(local, "rev-parse", "HEAD")).toBe(before);
    } else {
      expect(result.exitCode, result.stderr).toBe(0);
      const parents = (await git(local, "rev-list", "--parents", "-n", "1", "HEAD")).split(" ");
      expect(parents).toHaveLength(mode === "merge" ? 3 : 2);
      expect(await fs.readFile(path.join(local, "remote.txt"), "utf8")).toBe("remote change\n");
    }
  });

  it("keeps fast-forward only when no pull policy is set", async () => {
    await commit(local, "local.txt", "local\n");
    const before = await git(local, "rev-parse", "HEAD");
    await commit(remote, "remote.txt", "remote\n");
    const result = await new GitService(runner).runGitAction({ repoPath: local, action: "pull" });
    expect(result.exitCode).not.toBe(0);
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
  });

  it.each(["merge", "rebase"] as const)("can recover from a %s pull conflict after restart", async (mode) => {
    await policy({ "pull.rebase": mode === "rebase" ? "true" : "false", "pull.ff": "true" });
    await commit(local, "conflict.txt", "local\n");
    const before = await git(local, "rev-parse", "HEAD");
    await commit(remote, "conflict.txt", "remote\n");
    expect((await new GitService(runner).runGitAction({ repoPath: local, action: "pull" })).exitCode).not.toBe(0);
    const restarted = new GitService(runner);
    const operation = await restarted.getRepositoryOperationState(local);
    expect(operation).toMatchObject({ kind: mode, hasConflicts: true });
    expect(await restarted.resolveRepositoryOperation({ repoPath: local, action: "abort", expectedKind: mode, expectedStateId: operation!.stateId })).toMatchObject({ exitCode: 0 });
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
  });

  it("honors a branch rebase override without changing it", async () => {
    await policy({ "pull.rebase": "false", "pull.ff": "true" });
    await git(local, "config", "branch.main.rebase", "true");
    await commit(local, "local.txt", "local\n");
    await commit(remote, "remote.txt", "remote\n");
    const result = await new GitService(runner).runGitAction({ repoPath: local, action: "pull" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect((await git(local, "rev-list", "--parents", "-n", "1", "HEAD")).split(" ")).toHaveLength(2);
  });

  it("honors pruning off, on, and remote overrides", async () => {
    await git(remote, "branch", "obsolete");
    const service = new GitService(runner);
    await service.runGitAction({ repoPath: local, action: "fetch" });
    await git(remote, "branch", "-D", "obsolete");
    await policy({ "fetch.prune": "false" });
    expect((await service.runGitAction({ repoPath: local, action: "fetch" })).exitCode).toBe(0);
    expect(await git(local, "branch", "-r")).toContain("origin/obsolete");
    await policy({ "fetch.prune": "true" });
    await git(local, "config", "remote.origin.prune", "false");
    await service.runGitAction({ repoPath: local, action: "fetch" });
    expect(await git(local, "branch", "-r")).toContain("origin/obsolete");
    await git(local, "config", "--unset", "remote.origin.prune");
    await service.runGitAction({ repoPath: local, action: "fetch" });
    expect(await git(local, "branch", "-r")).not.toContain("origin/obsolete");
  });

  it("sets an upstream on an ordinary first push when enabled", async () => {
    await policy({ "push.autosetupremote": "true" });
    await git(local, "checkout", "-b", "published");
    const result = await new GitService(runner).runGitAction({ repoPath: local, action: "push" }, undefined, { tagPushBehavior: "none" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await git(local, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/published");
  });
});
