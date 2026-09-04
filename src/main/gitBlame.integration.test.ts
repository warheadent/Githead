import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parseGitBlame, readGitFileBlame } from "./gitBlame";
import { NodeProcessRunner } from "./processRunner";

describe("compact blame with real Git", () => {
  it("matches full metadata through renames, interleaved commits, and root boundaries", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-blame-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
    });
    try {
      git("init", "-q");
      git("config", "user.name", "Githead Test");
      git("config", "user.email", "githead@example.test");
      git("config", "core.autocrlf", "false");
      const lines = Array.from({ length: 100 }, (_, index) => `const value${index} = ${index};`);
      await fs.writeFile(path.join(repo, "original.ts"), `${lines.join("\n")}\n`);
      git("add", ".");
      git("commit", "-qm", "Original lines");
      git("mv", "original.ts", "renamed.ts");
      for (let index = 0; index < lines.length; index += 10) lines[index] += " // updated";
      await fs.writeFile(path.join(repo, "renamed.ts"), `${lines.join("\n")}\n`);
      git("add", ".");
      git("commit", "-qm", "Rename and edit");

      for (const flags of [[], ["--root"]]) {
        const blame = (format: string) => git("blame", format, ...flags, "--no-progress", "--no-textconv", "HEAD", "--", "renamed.ts");
        const full = blame("--line-porcelain");
        const compact = blame("--porcelain");
        const expected = parseGitBlame(full);
        expect(parseGitBlame(compact)).toEqual(expected);
        expect(expected.lines.map((line) => line.text)).toEqual(lines);
        expect(new Set(expected.lines.map((line) => line.originalPath))).toEqual(new Set(["original.ts", "renamed.ts"]));
        expect(expected.lines.some((line) => line.boundary)).toBe(flags.length === 0);
        expect(compact.length).toBeLessThan(full.length / 2);
      }
      const result = await readGitFileBlame(new NodeProcessRunner(), repo, "HEAD", "renamed.ts");
      expect(result).toMatchObject({ kind: "text", ...parseGitBlame(git("blame", "--line-porcelain", "--root", "HEAD", "--", "renamed.ts")) });
    } finally {
      await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  }, 30_000);
});
