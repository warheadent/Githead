import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessRunOptions, type ProcessRunner } from "./processRunner";

describe("ignored directories with real Git", () => {
  it("lists only directories matched by ignore rules that hold no tracked files", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-ignored-dirs-"));
    const git = (args: string[]) => execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
    });
    const write = async (relativePath: string, content = "x\n") => {
      await fs.mkdir(path.dirname(path.join(repo, relativePath)), { recursive: true });
      await fs.writeFile(path.join(repo, relativePath), content);
    };
    try {
      git(["init", "-q"]);
      await write(".gitignore", "node_modules/\ndist/\n*.log\nforced/\n");
      await write("src/index.ts");
      await write("node_modules/pkg/index.js");
      await write("packages/a/node_modules/dep/index.js");
      await write("packages/b/debug.log");
      await write("forced/tracked.txt");
      await write("forced/other.txt");
      await fs.mkdir(path.join(repo, "dist"));
      git(["add", ".gitignore", "src/index.ts"]);
      git(["add", "-f", "forced/tracked.txt"]);

      const calls: Array<{ args: string[]; options: ProcessRunOptions | undefined }> = [];
      const actual = new NodeProcessRunner();
      const runner: ProcessRunner = { run: async (command, args, options) => {
        calls.push({ args, options });
        return actual.run(command, args, options);
      } };
      const directories = await new GitService(runner).getIgnoredDirectories(repo);

      // `packages/` and `packages/b/` only contain ignored files, but no rule
      // matches them, so new files there must still be watched.
      expect(directories.sort()).toEqual(["dist", "node_modules", "packages/a/node_modules"]);
      const statusCall = calls.find((call) => call.args.includes("status"));
      expect(statusCall?.args).toContain("--no-optional-locks");
      expect(statusCall?.options?.streamStdout).toBe(true);

      // Paths stay relative to a watched subdirectory.
      await expect(new GitService(runner).getIgnoredDirectories(path.join(repo, "packages"))).resolves.toEqual(["a/node_modules"]);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it("bounds the number of returned directories", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-ignored-dirs-limit-"));
    try {
      execFileSync("git", ["-C", repo, "init", "-q"]);
      await fs.writeFile(path.join(repo, ".gitignore"), "cache/\n");
      for (const name of ["a", "b", "c"]) await fs.mkdir(path.join(repo, name, "cache"), { recursive: true });

      const directories = await new GitService(new NodeProcessRunner()).getIgnoredDirectories(repo, { maxEntries: 2 });

      expect(directories).toHaveLength(2);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });
});
