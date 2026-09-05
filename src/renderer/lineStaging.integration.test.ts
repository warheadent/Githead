/// <reference types="node" />

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "../main/gitService";
import { createCommitPlanChanges } from "../main/commitPlanChanges";
import { NodeProcessRunner, type ProcessResult } from "../main/processRunner";
import { createLinePatch, groupDiffRowsByHunk, parseUnifiedDiff, type DiffRowGroup } from "./diffParser";

describe("line staging patches", { timeout: 20_000 }, () => {
  it("creates one commit from two selected hunks in one file", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      const original = Array.from({ length: 24 }, (_, index) => `value ${index + 1}`);
      await fs.writeFile(path.join(repoPath, "combined.txt"), `${original.join("\n")}\n`, "utf8");
      await run(["add", "combined.txt"]);
      await run(["commit", "-m", "Add combined fixture"]);
      const changed = [...original];
      changed[1] = "changed near start";
      changed[21] = "changed near end";
      await fs.writeFile(path.join(repoPath, "combined.txt"), `${changed.join("\n")}\n`, "utf8");
      const diff = await service.getFileDiff({ repoPath, path: "combined.txt", side: "unstaged" });
      const hunks = createCommitPlanChanges([diff], "hunk");
      expect(hunks).toHaveLength(2);

      const result = await service.quickCommitFiles({
        repoPath,
        changes: hunks.map((hunk) => ({ path: hunk.path, kind: "hunk" as const, fingerprint: hunk.fingerprint })),
        message: "Commit both hunks"
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect((await run(["status", "--porcelain"])).stdout).toBe("");
    });
  });

  it("creates sequential commits from two planned hunks in one file", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      const original = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
      await fs.writeFile(path.join(repoPath, "planned.txt"), `${original.join("\n")}\n`, "utf8");
      await run(["add", "planned.txt"]);
      await run(["commit", "-m", "Add planned fixture"]);
      const changed = [...original];
      changed.splice(2, 0, "inserted near start");
      changed[20] = "changed near end";
      await fs.writeFile(path.join(repoPath, "planned.txt"), `${changed.join("\n")}\n`, "utf8");
      const diff = await service.getFileDiff({ repoPath, path: "planned.txt", side: "unstaged" });
      const hunks = createCommitPlanChanges([diff], "hunk");
      expect(hunks).toHaveLength(2);

      const first = await service.quickCommitFiles({
        repoPath,
        changes: [{ path: hunks[0]!.path, kind: "hunk", fingerprint: hunks[0]!.fingerprint }],
        message: "Add early line"
      });
      expect(first.exitCode, first.stderr).toBe(0);
      expect((await run(["show", "HEAD:planned.txt"])).stdout).toContain("inserted near start");
      expect((await run(["show", "HEAD:planned.txt"])).stdout).toContain("line 20");

      const second = await service.quickCommitFiles({
        repoPath,
        changes: [{ path: hunks[1]!.path, kind: "hunk", fingerprint: hunks[1]!.fingerprint }],
        message: "Change late line"
      });
      expect(second.exitCode, second.stderr).toBe(0);
      expect((await run(["show", "HEAD:planned.txt"])).stdout).toContain("changed near end");
      expect((await run(["status", "--porcelain"])).stdout).toBe("");
    });
  });

  it("rejects a planned hunk after its content changes", async () => {
    await withRepository(async ({ repoPath, run, service }) => {
      await fs.writeFile(path.join(repoPath, "stale.txt"), "one\ntwo\nthree\n", "utf8");
      await run(["add", "stale.txt"]);
      await run(["commit", "-m", "Add stale fixture"]);
      await fs.writeFile(path.join(repoPath, "stale.txt"), "one\nchanged\nthree\n", "utf8");
      const diff = await service.getFileDiff({ repoPath, path: "stale.txt", side: "unstaged" });
      const [hunk] = createCommitPlanChanges([diff], "hunk");
      await fs.writeFile(path.join(repoPath, "stale.txt"), "one\nchanged again\nthree\n", "utf8");

      const result = await service.quickCommitFiles({
        repoPath,
        changes: [{ path: hunk!.path, kind: "hunk", fingerprint: hunk!.fingerprint }],
        message: "Use stale hunk"
      });

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toContain("Generate the commit plan again");
      expect((await run(["diff", "--cached", "--quiet"])).exitCode).toBe(0);
    });
  });

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
