import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService, parsePorcelainStatus } from "./gitService";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner";

const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };

describe("repository sync status with real Git", () => {
  it("matches git status ahead-behind counts without running git status", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-sync-status-"));
    const remote = path.join(directory, "remote.git");
    const repo = path.join(directory, "repo");
    const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitEnv }).trim();
    const commit = (message: string) => git(repo, "commit", "-q", "--allow-empty", "-m", message);
    try {
      execFileSync("git", ["init", "-q", "--bare", remote], { env: gitEnv });
      execFileSync("git", ["init", "-q", "-b", "main", repo], { env: gitEnv });
      git(repo, "config", "user.name", "Githead Test");
      git(repo, "config", "user.email", "githead@example.test");
      git(repo, "remote", "add", "origin", remote);
      const commands: string[][] = [];
      const actual = new NodeProcessRunner();
      const runner: ProcessRunner = { run: (command, args, options) => {
        commands.push(args);
        return actual.run(command, args, options);
      } };
      const service = new GitService(runner);
      const expectMatchesStatus = async (scenario: string) => {
        const status = parsePorcelainStatus(git(repo, "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=no"));
        await expect(service.getRepoSyncStatus(repo), scenario).resolves.toEqual({
          repoPath: repo,
          kind: "git",
          isValid: true,
          ahead: status.ahead ?? 0,
          behind: status.behind ?? 0,
          error: ""
        });
      };

      await expectMatchesStatus("unborn branch");
      commit("base");
      await expectMatchesStatus("no upstream");
      git(repo, "push", "-q", "-u", "origin", "main");
      await expectMatchesStatus("in sync");
      commit("local 1");
      commit("local 2");
      git(repo, "branch", "-q", "remote-work", "HEAD~2");
      git(repo, "checkout", "-q", "remote-work");
      commit("remote 1");
      git(repo, "push", "-q", "origin", "remote-work:main");
      git(repo, "checkout", "-q", "main");
      git(repo, "fetch", "-q", "origin");
      await expectMatchesStatus("diverged");
      expect((await service.getRepoSyncStatus(repo))).toMatchObject({ ahead: 2, behind: 1 });
      git(repo, "branch", "-q", "--set-upstream-to=remote-work");
      await expectMatchesStatus("local upstream");
      git(repo, "branch", "-q", "--set-upstream-to=origin/main");
      git(repo, "update-ref", "-d", "refs/remotes/origin/main");
      await expectMatchesStatus("gone upstream");
      git(repo, "checkout", "-q", "--detach");
      await expectMatchesStatus("detached HEAD");

      expect(commands.filter((args) => args.includes("status"))).toEqual([]);
    } finally {
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  }, 30_000);
});
