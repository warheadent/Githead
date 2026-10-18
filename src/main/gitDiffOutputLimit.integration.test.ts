import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { DEFAULT_PROCESS_MAX_OUTPUT_BYTES, NodeProcessRunner } from "./processRunner";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("viewer diff output limits", () => {
  it("shows diffs past the default process output cap as truncated text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-diff-limit-"));
    directories.push(dir);
    const runner = new NodeProcessRunner();
    const git = async (...args: string[]) => {
      const result = await runner.run("git", ["-C", dir, ...args]);
      expect(result.exitCode, result.stderr).toBe(0);
    };
    await git("init");
    await git("config", "user.name", "Diff Limit Test");
    await git("config", "user.email", "diff-limit@example.test");
    const line = "generated content line that is long enough to add up quickly\n";
    const content = line.repeat(Math.ceil((DEFAULT_PROCESS_MAX_OUTPUT_BYTES + 1024 * 1024) / line.length));
    await fs.writeFile(path.join(dir, "large.txt"), "seed\n");
    await git("add", ".");
    await git("commit", "-m", "fixture");
    await fs.writeFile(path.join(dir, "large.txt"), content);
    await fs.writeFile(path.join(dir, "untracked.txt"), content);
    const service = new GitService(runner);

    const unstaged = await service.getFileDiff({ repoPath: dir, path: "large.txt", side: "unstaged" });
    const untracked = await service.getFileDiff({ repoPath: dir, path: "untracked.txt", side: "unstaged" });
    await git("add", "large.txt");
    const staged = await service.getFileDiff({ repoPath: dir, path: "large.txt", side: "staged" });

    for (const diff of [unstaged, untracked, staged]) {
      expect(diff).toMatchObject({ kind: "text", truncated: true });
      expect(diff.text.length).toBeLessThanOrEqual(250_000);
      expect(diff.text.endsWith("\n")).toBe(true);
      expect(diff.text).toContain(`+${line.trimEnd()}`);
    }
  });
});
