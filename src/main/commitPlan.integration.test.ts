import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";
import { createCommitPlanChanges } from "./commitPlanChanges";

async function withRepository(test: (repoPath: string, service: GitService, run: (args: string[]) => Promise<string>) => Promise<void>): Promise<void> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "githead-plan-"));
  const runner = new NodeProcessRunner();
  const run = async (args: string[]): Promise<string> => {
    const result = await runner.run("git", ["-C", repoPath, ...args]);
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout;
  };
  try {
    await run(["init"]);
    await run(["config", "user.name", "Plan Test"]);
    await run(["config", "user.email", "plan@example.test"]);
    await run(["config", "commit.gpgsign", "false"]);
    await run(["config", "core.hooksPath", path.join(repoPath, "no-hooks")]);
    await run(["commit", "--allow-empty", "-m", "Initial"]);
    await test(repoPath, new GitService(runner), run);
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

describe("commit plan content validation", { timeout: 20_000 }, () => {
  for (const tracked of [false, true]) {
    it(`rejects changed ${tracked ? "tracked" : "untracked"} binary content with the same diff description`, async () => {
      await withRepository(async (repoPath, service, run) => {
        const file = path.join(repoPath, "asset.bin");
        await fs.writeFile(file, Buffer.from([0, 1, 2, 3]));
        if (tracked) {
          await run(["add", "asset.bin"]);
          await run(["commit", "-m", "Add asset"]);
          await fs.writeFile(file, Buffer.from([0, 1, 2, 4]));
        }
        const before = await service.getCommitPlanDiffs({ repoPath, paths: ["asset.bin"] });
        expect(before[0]?.kind).toBe("binary");
        expect(before[0]?.text).toMatch(/index [a-f0-9]{40}\.\.[a-f0-9]{40}/);
        const changes = createCommitPlanChanges(before, "file");
        await fs.writeFile(file, Buffer.from([0, 1, 2, 5]));
        const result = await service.quickCommitFiles({ repoPath, changes, message: "Use reviewed binary" });
        expect(result.exitCode).not.toBe(0);
        expect(await run(["diff", "--cached", "--name-only"])).toBe("");
        expect(await fs.readFile(file)).toEqual(Buffer.from([0, 1, 2, 5]));
      });
    });
  }

  it("rejects an edit beyond a truncated text diff and accepts a fresh snapshot", async () => {
    await withRepository(async (repoPath, service, run) => {
      const file = path.join(repoPath, "large.txt");
      const prefix = "unchanged prefix line\n".repeat(20_000);
      await fs.writeFile(file, prefix + "first tail\n");
      const before = await service.getCommitPlanDiffs({ repoPath, paths: ["large.txt"] });
      expect(before[0]).toMatchObject({ kind: "text", truncated: true });
      const changes = createCommitPlanChanges(before, "file");
      await fs.writeFile(file, prefix + "second tail\n");
      const stale = await service.quickCommitFiles({ repoPath, changes, message: "Use old tail" });
      expect(stale.exitCode).not.toBe(0);
      expect(await run(["diff", "--cached", "--name-only"])).toBe("");
      const fresh = createCommitPlanChanges(await service.getCommitPlanDiffs({ repoPath, paths: ["large.txt"] }), "file");
      const committed = await service.quickCommitFiles({ repoPath, changes: fresh, message: "Use new tail" });
      expect(committed.exitCode, committed.stderr).toBe(0);
      expect(await run(["status", "--porcelain"])).toBe("");
    });
  });
});
