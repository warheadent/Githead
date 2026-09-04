import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { GitService } from "./gitService";
import type { ProcessResult } from "./processRunner";

const recorded = "a".repeat(40);
const checkedOut = "b".repeat(40);
const ok = (stdout = ""): ProcessResult => ({ exitCode: 0, stdout, stderr: "" });

async function withConfig(paths: string[], test: (repo: string) => Promise<void>): Promise<void> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-submodules-"));
  try {
    await fs.writeFile(path.join(repo, ".gitmodules"), paths.map((entry, index) => `[submodule "module-${index}"]\n path = ${entry}\n url = https://example.test/${index}\n`).join(""));
    await test(repo);
  } finally {
    await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
}

function runnerFor(status: string, index: (args: string[]) => Promise<ProcessResult>) {
  return { run: vi.fn(async (_command: string, args: string[]): Promise<ProcessResult> => {
    if (args.includes("ls-files")) return index(args);
    if (args.includes("submodule")) return ok(status);
    if (args.includes("--git-path")) return { exitCode: 1, stdout: "", stderr: "No operation" };
    return ok();
  }) };
}

describe("submodule index queries", () => {
  it("queries literal configured paths and preserves recorded commits for modified checkouts", async () => {
    const paths = ["vendor/[engine]", "vendor/UI toolkit"];
    await withConfig(paths, async (repo) => {
      const runner = runnerFor(`+${checkedOut} ${paths[0]} (heads/main)\n-${recorded} ${paths[1]}\n`, async () => ok(paths.map((entry) => `160000 ${recorded} 0\t${entry}\0`).join("")));
      const result = await new GitService(runner).getRepoStatus({ repoPath: repo, generation: 1 });
      expect(runner.run.mock.calls.find(([, args]) => args.includes("ls-files"))?.[1]).toEqual([
        "-C", repo, "--literal-pathspecs", "ls-files", "--stage", "-z", "--", ...paths
      ]);
      expect(result.submodules).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: paths[0], recordedCommit: recorded, checkedOutCommit: checkedOut, initialized: true }),
        expect.objectContaining({ path: paths[1], recordedCommit: recorded, checkedOutCommit: null, initialized: false })
      ]));
    });
  });

  it("does not scan the index for empty configuration and empty recursive status", async () => {
    await withConfig([], async (repo) => {
      const index = vi.fn(async () => ok());
      const result = await new GitService(runnerFor("", index)).getRepoStatus({ repoPath: repo, generation: 1 });
      expect(result.submodules).toEqual([]);
      expect(index).not.toHaveBeenCalled();
    });
  });

  it("queries paths discovered from status and keeps nested paths without redundant queries", async () => {
    await withConfig(["vendor/parent"], async (repo) => {
      const runner = runnerFor(` ${recorded} vendor/parent\n ${checkedOut} vendor/parent/nested\n+${checkedOut} extra\n`, async (args) => {
        const paths = args.slice(args.indexOf("--") + 1);
        return ok(paths.map((entry) => `160000 ${recorded} 0\t${entry}\0`).join(""));
      });
      const result = await new GitService(runner).getRepoStatus({ repoPath: repo, generation: 1 });
      const queries = runner.run.mock.calls.filter(([, args]) => args.includes("ls-files")).map(([, args]) => args.slice(args.indexOf("--") + 1));
      expect(queries).toEqual([["vendor/parent"], ["extra"]]);
      expect(result.submodules).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "extra", recordedCommit: recorded, checkedOutCommit: checkedOut }),
        expect.objectContaining({ path: "vendor/parent/nested", recordedCommit: checkedOut })
      ]));
    });
  });

  it("batches long path lists and combines every result", async () => {
    const paths = Array.from({ length: 500 }, (_, index) => `vendor/module-${index}-${"x".repeat(50)}`);
    await withConfig(paths, async (repo) => {
      const runner = runnerFor("", async (args) => ok(args.slice(args.indexOf("--") + 1).map((entry) => `160000 ${recorded} 0\t${entry}\0`).join("")));
      const result = await new GitService(runner).getRepoStatus({ repoPath: repo, generation: 1 });
      const batches = runner.run.mock.calls.filter(([, args]) => args.includes("ls-files")).map(([, args]) => args.slice(args.indexOf("--") + 1));
      expect(batches.length).toBeGreaterThan(1);
      expect(batches.flat()).toEqual(paths);
      expect(batches.every((batch) => batch.reduce((size, entry) => size + entry.length * 2 + 3, 0) <= 12_000)).toBe(true);
      expect(result.submodules).toHaveLength(paths.length);
      expect(result.submodules?.every((entry) => entry.recordedCommit === recorded)).toBe(true);
    });
  });

  it("rejects incomplete index output", async () => {
    await withConfig(["vendor/engine"], async (repo) => {
      const runner = runnerFor(`+${checkedOut} vendor/engine\n`, async () => ({ exitCode: -1, stdout: `160000 ${recorded} 0\tvendor/engine\0`, stderr: "", error: "Index output exceeded limit", exceededLimit: true }));
      await expect(new GitService(runner).getRepoStatus({ repoPath: repo, generation: 1 })).rejects.toThrow("Index output exceeded limit");
    });
  });
});
