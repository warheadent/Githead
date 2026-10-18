import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { GitDiffSide } from "../shared/types";

/**
 * Worktree files up to this size are identified by content. Content identity
 * stays stable when a file is touched without changes and cannot miss a
 * same-size rewrite that lands within one filesystem timestamp tick.
 */
export const DIFF_FINGERPRINT_CONTENT_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Builds a cheap identity for the working-tree diff Githead would display for
 * `filePath` on `side`, from one `git status --porcelain=v2 -z` read of that
 * path plus the worktree file when the unstaged side depends on it.
 *
 * Equal fingerprints mean the displayed diff is unchanged. A different
 * fingerprint usually means the diff changed. `null` means this path cannot
 * be fingerprinted cheaply (submodules), so callers must compare full diffs.
 *
 * Larger worktree files fall back to lstat identity (size, mtime, ctime,
 * inode). ctime cannot be preserved by user tools, so this misses a change
 * only when a same-size rewrite lands in the same timestamp tick as the read.
 */
export async function createGitDiffFingerprint(
  repoPath: string,
  filePath: string,
  side: GitDiffSide,
  porcelainStatus: string
): Promise<string | null> {
  const record = findPorcelainStatusRecord(porcelainStatus, filePath);
  const parts = await fingerprintParts(repoPath, filePath, side, record);
  if (!parts) return null;
  return createHash("sha1").update([side, filePath, ...parts].join("\0")).digest("hex");
}

export interface PorcelainStatusRecord {
  type: "1" | "2" | "u" | "?";
  fields: string[];
  originalPath?: string;
}

/** Finds the porcelain v2 `-z` record for one repository-relative path. */
export function findPorcelainStatusRecord(text: string, filePath: string): PorcelainStatusRecord | null {
  const records = text.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.startsWith("? ")) {
      if (record.slice(2) === filePath) return { type: "?", fields: [] };
      continue;
    }
    const type = record[0];
    if ((type !== "1" && type !== "2" && type !== "u") || record[1] !== " ") continue;
    const pathFieldIndex = type === "1" ? 8 : type === "2" ? 9 : 10;
    const fields = record.split(" ");
    const recordPath = fields.slice(pathFieldIndex).join(" ");
    const originalPath = type === "2" ? records[index + 1] : undefined;
    if (type === "2") index += 1;
    if (recordPath !== filePath) continue;
    return {
      type,
      fields: fields.slice(0, pathFieldIndex),
      ...(originalPath === undefined ? {} : { originalPath })
    };
  }
  return null;
}

async function fingerprintParts(
  repoPath: string,
  filePath: string,
  side: GitDiffSide,
  record: PorcelainStatusRecord | null
): Promise<string[] | null> {
  // No record: the path is clean (or ignored), so both diffs are empty until
  // Git reports a change for it.
  if (!record) return ["clean"];
  if (record.type === "?") {
    return side === "staged" ? ["untracked"] : ["untracked", await readWorktreeIdentity(repoPath, filePath)];
  }

  const [, xy = "..", submodule = "N..."] = record.fields;
  // Submodule diffs depend on the submodule's own HEAD and working tree,
  // which porcelain status does not identify. Their diffs are small, so the
  // caller compares them in full.
  if (submodule.startsWith("S")) return null;

  if (record.type === "u") {
    return side === "staged"
      ? ["unmerged", ...record.fields]
      : ["unmerged", ...record.fields, await readWorktreeIdentity(repoPath, filePath)];
  }

  // Fields: type XY sub mH mI mW hH hI [Xscore]
  const [, , , modeHead = "", modeIndex = "", modeWorktree = "", hashHead = "", hashIndex = "", score = ""] = record.fields;
  const indexStatus = xy[0] ?? ".";
  const worktreeStatus = xy[1] ?? ".";
  if (side === "staged") {
    // The staged diff compares HEAD with the index only.
    return indexStatus === "."
      ? ["staged", "."]
      : ["staged", indexStatus, modeHead, modeIndex, hashHead, hashIndex, score, record.originalPath ?? ""];
  }
  // The unstaged diff compares the index with the working tree only, so HEAD
  // changes (for example a commit of other staged hunks) do not affect it.
  return worktreeStatus === "."
    ? ["unstaged", "."]
    : ["unstaged", worktreeStatus, modeIndex, modeWorktree, hashIndex, await readWorktreeIdentity(repoPath, filePath)];
}

async function readWorktreeIdentity(repoPath: string, filePath: string): Promise<string> {
  const absolutePath = path.join(repoPath, filePath);
  let stats: BigIntStats;
  try {
    stats = await fs.lstat(absolutePath, { bigint: true });
  } catch (error) {
    return `missing:${errorCode(error)}`;
  }

  if (stats.isSymbolicLink()) {
    try {
      return `link:${await fs.readlink(absolutePath)}`;
    } catch (error) {
      return `link-unreadable:${errorCode(error)}`;
    }
  }

  const statIdentity = `stat:${stats.mode}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}:${stats.ino}:${stats.dev}`;
  // Only regular files are read; opening a FIFO or device could block.
  if (!stats.isFile() || stats.size > BigInt(DIFF_FINGERPRINT_CONTENT_LIMIT_BYTES)) return statIdentity;
  const content = await readFileUpTo(absolutePath, Number(stats.size));
  return content
    ? `content:${content.byteLength}:${createHash("sha1").update(content).digest("hex")}`
    : statIdentity;
}

/**
 * Reads a file expected to hold `expectedSize` bytes. Returns null when it is
 * unreadable or grew after lstat, so a file that is still being written falls
 * back to its stat identity instead of an unbounded read.
 */
async function readFileUpTo(filePath: string, expectedSize: number): Promise<Buffer | null> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.allocUnsafe(expectedSize + 1);
    let length = 0;
    while (length < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, length, buffer.byteLength - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    return length > expectedSize ? null : buffer.subarray(0, length);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
}
