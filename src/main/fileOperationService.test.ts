import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { deleteFiles, showRepositoryInExplorer } from "./fileOperationService";

describe("fileOperationService", () => {
  it("moves multiple repo-relative files to the recycle bin sequentially", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.mkdir(path.join(repoRoot, "src"));
      await fs.writeFile(path.join(repoRoot, "src", "first.ts"), "first", "utf8");
      await fs.writeFile(path.join(repoRoot, "src", "second.ts"), "second", "utf8");
      const trashItem = vi.fn<(absolutePath: string) => Promise<void>>().mockResolvedValue(undefined);

      const result = await deleteFiles({
        repoPath: repoRoot,
        paths: [
          "src/first.ts",
          "src/second.ts"
        ]
      }, trashItem);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("2 files moved to Recycle Bin.");
      expect(trashItem).toHaveBeenNthCalledWith(1, path.join(repoRoot, "src", "first.ts"));
      expect(trashItem).toHaveBeenNthCalledWith(2, path.join(repoRoot, "src", "second.ts"));
    });
  });

  it("rejects absolute delete paths before moving any files", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.writeFile(path.join(repoRoot, "tracked.ts"), "tracked", "utf8");
      const trashItem = vi.fn<(absolutePath: string) => Promise<void>>().mockResolvedValue(undefined);

      const result = await deleteFiles({
        repoPath: repoRoot,
        paths: [
          "tracked.ts",
          path.join(repoRoot, "other.ts")
        ]
      }, trashItem);

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("File path must be relative to the repository.");
      expect(trashItem).not.toHaveBeenCalled();
    });
  });

  it("rejects out-of-repo delete paths before moving any files", async () => {
    await withTempDir(async (repoRoot) => {
      await fs.writeFile(path.join(repoRoot, "tracked.ts"), "tracked", "utf8");
      const trashItem = vi.fn<(absolutePath: string) => Promise<void>>().mockResolvedValue(undefined);

      const result = await deleteFiles({
        repoPath: repoRoot,
        paths: [
          "tracked.ts",
          "..\\outside.ts"
        ]
      }, trashItem);

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("File path must stay inside the repository.");
      expect(trashItem).not.toHaveBeenCalled();
    });
  });

  it("shows a repository folder in Explorer", async () => {
    await withTempDir(async (repoRoot) => {
      const openPath = vi.fn<(absolutePath: string) => Promise<string>>().mockResolvedValue("");

      const result = await showRepositoryInExplorer(repoRoot, openPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Shown in Explorer.");
      expect(openPath).toHaveBeenCalledWith(path.resolve(repoRoot));
    });
  });

  it("returns the Explorer open error for a valid repository folder", async () => {
    await withTempDir(async (repoRoot) => {
      const openPath = vi.fn<(absolutePath: string) => Promise<string>>().mockResolvedValue("Unable to open folder.");

      const result = await showRepositoryInExplorer(repoRoot, openPath);

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("Unable to open folder.");
      expect(openPath).toHaveBeenCalledWith(path.resolve(repoRoot));
    });
  });

  it("rejects a missing repository folder before opening Explorer", async () => {
    await withTempDir(async (repoRoot) => {
      const missingRepo = path.join(repoRoot, "missing");
      const openPath = vi.fn<(absolutePath: string) => Promise<string>>().mockResolvedValue("");

      const result = await showRepositoryInExplorer(missingRepo, openPath);

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("Repository folder does not exist.");
      expect(openPath).not.toHaveBeenCalled();
    });
  });

  it("rejects a file path before opening Explorer", async () => {
    await withTempDir(async (repoRoot) => {
      const filePath = path.join(repoRoot, "tracked.ts");
      await fs.writeFile(filePath, "tracked", "utf8");
      const openPath = vi.fn<(absolutePath: string) => Promise<string>>().mockResolvedValue("");

      const result = await showRepositoryInExplorer(filePath, openPath);

      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toBe("Repository path must be a folder.");
      expect(openPath).not.toHaveBeenCalled();
    });
  });

  it("rejects a blank repository path before opening Explorer", async () => {
    const openPath = vi.fn<(absolutePath: string) => Promise<string>>().mockResolvedValue("");

    const result = await showRepositoryInExplorer("  ", openPath);

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBe("Select a repository folder.");
    expect(openPath).not.toHaveBeenCalled();
  });
});

async function withTempDir(run: (repoRoot: string) => Promise<void>): Promise<void> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "githead-file-service-"));
  try {
    await run(repoRoot);
  } finally {
    await fs.rm(repoRoot, {
      recursive: true,
      force: true
    });
  }
}
