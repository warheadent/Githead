import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner";

const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };

describe("oversized File Status with real Git", () => {
  it("returns tracked changes and the first untracked files instead of failing", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-status-truncation-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: gitEnv });
    try {
      git("init", "-q");
      git("config", "user.name", "Githead Test");
      git("config", "user.email", "githead@example.test");
      await fs.writeFile(path.join(repo, "tracked.txt"), "one\n");
      await fs.writeFile(path.join(repo, "old name.txt"), "rename me\n");
      git("add", ".");
      git("commit", "-qm", "Initial");
      await fs.appendFile(path.join(repo, "tracked.txt"), "two\n");
      git("mv", "old name.txt", "new name.txt");
      await fs.mkdir(path.join(repo, "node_modules", "package"), { recursive: true });
      await Promise.all(Array.from({ length: 300 }, (_, index) => (
        fs.writeFile(path.join(repo, "node_modules", "package", `module-${String(index).padStart(3, "0")}-é.js`), "")
      )));

      const actual = new NodeProcessRunner();
      // Stand in for an untracked tree large enough to pass the real 8 MB limit.
      const limited: ProcessRunner = {
        run: (command, args, options) => actual.run(command, args, options?.outputMode === "truncate" ? { ...options, maxOutputBytes: 4_000 } : options)
      };
      const complete = await new GitService(actual).getRepoStatus({ repoPath: repo, generation: 1 });
      const partial = await new GitService(limited).getRepoStatus({ repoPath: repo, generation: 1 });

      expect(complete.files).toHaveLength(302);
      expect(complete.statusTruncation).toBeNull();
      expect(partial.statusTruncation).toEqual({ shownFileCount: partial.files.length, outputLimitBytes: 8 * 1024 * 1024, trackedComplete: true });
      expect(partial.files.length).toBeGreaterThan(2);
      expect(partial.files.length).toBeLessThan(complete.files.length);
      expect(partial.files).toEqual(complete.files.slice(0, partial.files.length));
      expect(partial.files.slice(0, 2).map((file) => [file.path, file.originalPath])).toEqual([
        ["new name.txt", "old name.txt"],
        ["tracked.txt", undefined]
      ]);
    } finally {
      await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  }, 30_000);
});
