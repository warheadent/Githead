import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "../main/gitService";
import { NodeProcessRunner, type ProcessResult } from "../main/processRunner";
import { createLinePatch, groupDiffRowsByHunk, parseUnifiedDiff, type DiffRowGroup } from "./diffParser";

describe("line staging patches", () => {
  it("stages one line from a newly added file", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      await fs.writeFile(path.join(repoPath, "new.txt"), "one\ntwo\nthree\n", "utf8");
      await run(["add", "--intent-to-add", "new.txt"]);
      const patch = await linePatch(run, ["diff", "--", "new.txt"], "two", "unstaged");

      const result = await service.stageHunk({ repoPath, path: "new.txt", side: "unstaged", patch });

      expect(result.exitCode, result.stderr).toBe(0);
      expect((await run(["show", ":new.txt"])).stdout).toBe("two\n");
    });
  });

  it("unstages one line from a newly added file", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      await fs.writeFile(path.join(repoPath, "new.txt"), "one\ntwo\nthree\n", "utf8");
      await run(["add", "new.txt"]);
      const patch = await linePatch(run, ["diff", "--cached", "--", "new.txt"], "two", "staged");

      const result = await service.unstageHunk({ repoPath, path: "new.txt", side: "staged", patch });

      expect(result.exitCode, result.stderr).toBe(0);
      expect((await run(["show", ":new.txt"])).stdout).toBe("one\nthree\n");
    });
  });

  it("stages one line from a deleted file", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      await fs.writeFile(path.join(repoPath, "removed.txt"), "one\ntwo\nthree\n", "utf8");
      await run(["add", "removed.txt"]);
      await run(["commit", "-m", "Add removed fixture"]);
      await fs.rm(path.join(repoPath, "removed.txt"));
      const patch = await linePatch(run, ["diff", "--", "removed.txt"], "two", "unstaged");

      const result = await service.stageHunk({ repoPath, path: "removed.txt", side: "unstaged", patch });

      expect(result.exitCode, result.stderr).toBe(0);
      expect((await run(["show", ":removed.txt"])).stdout).toBe("one\nthree\n");
    });
  });

  it("unstages one line from a staged file deletion", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      await fs.writeFile(path.join(repoPath, "removed.txt"), "one\ntwo\nthree\n", "utf8");
      await run(["add", "removed.txt"]);
      await run(["commit", "-m", "Add removed fixture"]);
      await fs.rm(path.join(repoPath, "removed.txt"));
      await run(["add", "removed.txt"]);
      const patch = await linePatch(run, ["diff", "--cached", "--", "removed.txt"], "two", "staged");

      const result = await service.unstageHunk({ repoPath, path: "removed.txt", side: "staged", patch });

      expect(result.exitCode, result.stderr).toBe(0);
      expect((await run(["show", ":removed.txt"])).stdout).toBe("two\n");
    });
  });
});

interface RepositoryFixture {
  repoPath: string;
  run(args: string[]): Promise<ProcessResult>;
  service: GitService;
}

async function withRepository(callback: (fixture: RepositoryFixture) => Promise<void>): Promise<void> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-line-staging-"));
  const runner = new NodeProcessRunner();
  const run = async (args: string[]): Promise<ProcessResult> => {
    const result = await runner.run("git", ["-C", repoPath, ...args]);
    expect(result.exitCode, result.stderr).toBe(0);
    return result;
  };

  try {
    await run(["init", "-b", "main"]);
    await run(["config", "user.name", "Githead Test"]);
    await run(["config", "user.email", "githead@example.test"]);
    await fs.writeFile(path.join(repoPath, "base.txt"), "base\n", "utf8");
    await run(["add", "base.txt"]);
    await run(["commit", "-m", "Base"]);
    await callback({ repoPath, run, service: new GitService(runner) });
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

async function linePatch(
  run: RepositoryFixture["run"],
  diffArgs: string[],
  lineText: string,
  side: "staged" | "unstaged"
): Promise<string> {
  const diff = (await run(diffArgs)).stdout;
  const hunk = groupDiffRowsByHunk(parseUnifiedDiff(diff)).find((group): group is DiffRowGroup => group.kind === "hunk");
  expect(hunk).toBeTruthy();
  const rowIndex = hunk!.rows.findIndex((row) => row.text === lineText);
  const patch = createLinePatch(hunk!, rowIndex, side);
  expect(patch).toBeTruthy();
  return patch!;
}
