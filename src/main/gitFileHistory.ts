import type { GitFileHistoryEntry, GitFileHistoryResult } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

export async function readGitFileHistory(
  runner: ProcessRunner,
  repoPath: string,
  startHash: string,
  requestedPath: string,
  limit: number
): Promise<GitFileHistoryResult> {
  const result = await runner.run("git", [
    "-C", repoPath,
    "log",
    "--follow",
    "--find-renames",
    "--no-ext-diff",
    "--no-textconv",
    "--parents",
    "--date=iso-strict",
    `--max-count=${limit + 1}`,
    `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%ar`,
    "--name-status",
    "-z",
    startHash,
    "--",
    requestedPath
  ], { timeoutMs: 30_000 });

  if (result.exitCode !== 0) {
    throw new Error(result.error || result.stderr.trim() || "Unable to read file history.");
  }

  const parsed = parseGitFileHistory(result.stdout);
  return {
    repoPath,
    startHash,
    requestedPath,
    entries: parsed.slice(0, limit),
    hasMore: parsed.length > limit
  };
}

export function parseGitFileHistory(text: string): GitFileHistoryEntry[] {
  const entries: GitFileHistoryEntry[] = [];
  for (const rawRecord of text.split(RECORD_SEPARATOR)) {
    if (!rawRecord) continue;
    const nul = rawRecord.indexOf("\0");
    const metadata = (nul === -1 ? rawRecord : rawRecord.slice(0, nul)).replace(/^\r?\n/, "");
    const statusTokens = nul === -1 ? [] : rawRecord.slice(nul + 1).split("\0").filter(Boolean);
    const [hash = "", shortHash = "", rawParents = "", subject = "", authorName = "", authorEmail = "", authorDate = "", relativeDate = ""] = metadata.split(FIELD_SEPARATOR);
    if (!hash) continue;

    let status = "M";
    let path = "";
    let originalPath: string | undefined;
    const rawStatus = statusTokens[0] ?? "";
    if (/^[RC]\d+/.test(rawStatus)) {
      status = rawStatus[0] ?? rawStatus;
      originalPath = statusTokens[1] ?? "";
      path = statusTokens[2] ?? "";
    } else if (rawStatus) {
      status = rawStatus[0] ?? rawStatus;
      path = statusTokens[1] ?? "";
    }

    entries.push({
      hash,
      shortHash,
      parents: rawParents.split(/\s+/).filter(Boolean),
      refs: [],
      subject,
      authorName,
      authorEmail,
      authorDate,
      relativeDate,
      path,
      ...(originalPath ? { originalPath } : {}),
      status
    });
  }
  return entries;
}
