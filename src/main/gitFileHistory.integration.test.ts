import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { readGitFileHistory } from "./gitFileHistory";
import { NodeProcessRunner } from "./processRunner";

describe("file history with real Git", () => {
  it("preserves statuses and paths through a rename, modification, and deletion", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-file-history-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
    });
    try {
      git("init", "-q");
      git("config", "user.name", "Githead Test");
      git("config", "user.email", "githead@example.test");
      git("config", "core.autocrlf", "false");
      await fs.writeFile(path.join(repo, "original name.ts"), "export const value = 1;\n");
      git("add", ".");
      git("commit", "-qm", "Add file");
      git("mv", "original name.ts", "renamed name.ts");
      git("commit", "-qm", "Rename file");
      await fs.appendFile(path.join(repo, "renamed name.ts"), "export const other = 2;\n");
      git("commit", "-qam", "Modify file");
      git("rm", "--", "renamed name.ts");
      git("commit", "-qm", "Delete file");

      const runner = new NodeProcessRunner();
      const result = await readGitFileHistory(runner, repo, "HEAD", "renamed name.ts", 10);
      expect(result.entries.map(({ subject, status, path: filePath, originalPath }) => ({ subject, status, path: filePath, originalPath }))).toEqual([
        { subject: "Delete file", status: "D", path: "renamed name.ts", originalPath: undefined },
        { subject: "Modify file", status: "M", path: "renamed name.ts", originalPath: undefined },
        { subject: "Rename file", status: "R", path: "renamed name.ts", originalPath: "original name.ts" },
        { subject: "Add file", status: "A", path: "original name.ts", originalPath: undefined }
      ]);
      expect(result.hasMore).toBe(false);

      const limited = await readGitFileHistory(runner, repo, "HEAD", "renamed name.ts", 2);
      expect(limited.entries.map((entry) => entry.hash)).toEqual(result.entries.slice(0, 2).map((entry) => entry.hash));
      expect(limited.hasMore).toBe(true);
    } finally {
      await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  }, 30_000);
});
