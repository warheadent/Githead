import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner";

describe("submodule refresh with real Git", () => {
  it("keeps recorded commits for changed, uninitialized, conflicted, and removed submodules", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-submodules-real-"));
    const repo = path.join(directory, "parent");
    const child = path.join(directory, "child");
    const git = (cwd: string, args: string[], input?: string) => execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", input,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
    }).trim();
    try {
      for (const location of [repo, child]) {
        await fs.mkdir(location);
        git(location, ["init", "-q"]);
        git(location, ["config", "user.name", "Githead Test"]);
        git(location, ["config", "user.email", "githead@example.test"]);
        git(location, ["commit", "--allow-empty", "-qm", "Initial"]);
      }
      const recorded = git(child, ["rev-parse", "HEAD"]);
      const modulePath = "vendor/[UI toolkit]";
      git(repo, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", child, modulePath]);
      git(repo, ["config", "-f", ".gitmodules", "submodule.uninitialized.path", "vendor/uninitialized"]);
      git(repo, ["config", "-f", ".gitmodules", "submodule.uninitialized.url", child]);
      git(repo, ["update-index", "--add", "--cacheinfo", `160000,${recorded},vendor/uninitialized`]);
      git(repo, ["add", ".gitmodules"]);
      git(repo, ["commit", "-qm", "Add submodules"]);
      const checkout = path.join(repo, modulePath);
      git(checkout, ["-c", "user.name=Githead Test", "-c", "user.email=githead@example.test", "commit", "--allow-empty", "-qm", "New checkout"]);
      const checkedOut = git(checkout, ["rev-parse", "HEAD"]);

      const commands: string[][] = [];
      const actual = new NodeProcessRunner();
      const runner: ProcessRunner = { run: async (command, args, options) => {
        commands.push(args);
        return actual.run(command, args, options);
      } };
      const service = new GitService(runner);
      const result = await service.getRepoStatus({ repoPath: repo, generation: 1 });
      expect(result.submodules).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: modulePath, recordedCommit: recorded, checkedOutCommit: checkedOut, status: "modified" }),
        expect.objectContaining({ path: "vendor/uninitialized", recordedCommit: recorded, checkedOutCommit: null, status: "uninitialized" })
      ]));
      expect(commands.filter((args) => args.includes("ls-files"))).toEqual([
        ["-C", repo, "--literal-pathspecs", "ls-files", "--stage", "-z", "--", modulePath, "vendor/uninitialized"]
      ]);

      git(repo, ["update-index", "--force-remove", "--", modulePath]);
      git(repo, ["update-index", "--index-info"], `160000 ${recorded} 1\t${modulePath}\n160000 ${recorded} 2\t${modulePath}\n160000 ${checkedOut} 3\t${modulePath}\n`);
      const conflicted = await service.getRepoStatus({ repoPath: repo, generation: 2 });
      expect(conflicted.submodules).toContainEqual(expect.objectContaining({ path: modulePath, recordedCommit: checkedOut, status: "conflicted" }));

      git(repo, ["update-index", "--force-remove", "--", "vendor/uninitialized"]);
      const removed = await service.getRepoStatus({ repoPath: repo, generation: 3 });
      expect(removed.submodules).toContainEqual(expect.objectContaining({ path: "vendor/uninitialized", recordedCommit: null, status: "uninitialized" }));
    } finally {
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  }, 30_000);
});
