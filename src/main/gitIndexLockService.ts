import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GitIndexLockInspection, GitIndexLockRemoveRequest, GitOperationResult } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const MINIMUM_LOCK_AGE_MS = 30_000;

/** Recovery is explicit. Age and process checks cannot prove that a lock is stale. */
export class GitIndexLockService {
  constructor(private readonly runner: ProcessRunner, private readonly platform = process.platform) {}

  async inspect(repoPath: string, signal?: AbortSignal): Promise<GitIndexLockInspection> {
    try {
      const lockPath = await this.resolveLockPath(repoPath, signal);
      const lock = await this.readLock(lockPath);
      await this.checkProcesses(signal);
      signal?.throwIfAborted();
      return { repoPath, exitCode: 0, stdout: "", stderr: "", lock };
    } catch (error) {
      return this.failure(repoPath, error);
    }
  }

  async remove(request: GitIndexLockRemoveRequest, signal?: AbortSignal): Promise<GitOperationResult> {
    try {
      // Never accept a deletion path from the renderer or parse one from stderr.
      const lockPath = await this.resolveLockPath(request.repoPath, signal);
      await this.checkProcesses(signal);
      const lock = await this.readLock(lockPath);
      if (!request.fingerprint || request.fingerprint !== lock.fingerprint) {
        throw new Error("The index lock changed after it was checked. Check again before deleting it.");
      }
      signal?.throwIfAborted();
      await fs.unlink(lockPath);
      return { repoPath: request.repoPath, exitCode: 0, stdout: "Index lock deleted. Retry the failed action.", stderr: "" };
    } catch (error) {
      return this.failure(request.repoPath, error);
    }
  }

  private async resolveLockPath(repoPath: string, signal?: AbortSignal): Promise<string> {
    // Git's absolute path format resolves symlinks, hiding a symlink at index.lock.
    const result = await this.runner.run("git", ["-C", repoPath, "rev-parse", "--git-path", "index.lock"], signal ? { signal } : undefined);
    const output = result.stdout.trim();
    if (result.exitCode !== 0 || !output || path.basename(output) !== "index.lock") {
      throw new Error("Unable to locate this repository's index lock.");
    }
    return path.resolve(repoPath, output);
  }

  private async readLock(lockPath: string): Promise<NonNullable<GitIndexLockInspection["lock"]>> {
    const stat = await fs.lstat(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("The index lock is not a regular file. Githead will not delete it.");
    if (Date.now() - stat.mtimeMs < MINIMUM_LOCK_AGE_MS) {
      throw new Error("The index lock was modified recently. Wait at least 30 seconds, then check again.");
    }
    const fingerprint = createHash("sha256").update(JSON.stringify([
      lockPath, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs
    ])).digest("hex");
    return { path: lockPath, modifiedAt: stat.mtime.toISOString(), fingerprint };
  }

  private async checkProcesses(signal?: AbortSignal): Promise<void> {
    const windows = this.platform === "win32";
    const result = await this.runner.run(windows ? "tasklist.exe" : "ps", windows ? ["/FO", "CSV", "/NH"] : ["-A", "-o", "comm="], signal ? { signal } : undefined);
    if (result.exitCode !== 0 || result.error || !result.stdout.trim() || result.stdoutTruncated) {
      throw new Error("Githead could not check for running Git processes. The lock was not deleted.");
    }
    const running = result.stdout.split(/\r?\n/).some((line) => windows
      ? /^"git(?:-[^"]+)?\.exe",/i.test(line.trim())
      : /^git(?:-.+)?$/.test(path.basename(line.trim())));
    if (running) throw new Error("A Git process is running. Let it finish or close the other Git client, then check again.");
  }

  private failure(repoPath: string, error: unknown): GitOperationResult {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    return {
      repoPath, exitCode: -1, stdout: "",
      stderr: missing ? "The index lock no longer exists. Close this prompt and retry the failed action."
        : error instanceof Error ? error.message : "Unable to recover the index lock."
    };
  }
}
