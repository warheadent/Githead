import type { GitBlameCommit, GitBlameLine, GitFileBlameResult } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

export const BLAME_BLOB_BYTE_LIMIT = 1_000_000;
export const BLAME_LINE_LIMIT = 20_000;
export const BLAME_OUTPUT_BYTE_LIMIT = 8_000_000;
export const BLAME_TIMEOUT_MS = 30_000;

export async function readGitFileBlame(
  runner: ProcessRunner,
  repoPath: string,
  hash: string,
  filePath: string
): Promise<GitFileBlameResult> {
  if (!runner.runBinary) throw new Error("Binary process output is unavailable.");
  const object = `${hash}:${filePath}`;
  const blob = await runner.runBinary("git", ["-C", repoPath, "cat-file", "blob", object], {
    maxBytes: BLAME_BLOB_BYTE_LIMIT + 1,
    timeoutMs: BLAME_TIMEOUT_MS
  });
  if (blob.terminationReason === "aborted") throw new Error(blob.error || "Command was cancelled.");
  if (blob.terminationReason === "timedOut") return unavailable(repoPath, hash, filePath, "timed-out", "Reading the selected file timed out.");
  if (blob.exceededLimit) return unavailable(repoPath, hash, filePath, "oversized", "Blame is unavailable for files larger than 1 MB.");
  if (blob.exitCode !== 0) return unavailable(repoPath, hash, filePath, "missing", blob.stderr.trim() || "The selected file version is unavailable.");

  const bytes = blob.stdout;
  if (bytes.includes(0)) return unavailable(repoPath, hash, filePath, "binary", "Blame is unavailable for binary files.", bytes.byteLength);
  const lineCount = countLines(bytes);
  if (lineCount > BLAME_LINE_LIMIT) {
    return { ...unavailable(repoPath, hash, filePath, "too-many-lines", "Blame is unavailable for files with more than 20,000 lines.", bytes.byteLength), lineCount };
  }

  const result = await runner.runBinary("git", [
    "-C", repoPath,
    "blame",
    "--line-porcelain",
    "--root",
    "--no-progress",
    hash,
    "--",
    filePath
  ], { maxBytes: BLAME_OUTPUT_BYTE_LIMIT, timeoutMs: BLAME_TIMEOUT_MS });
  if (result.terminationReason === "aborted") throw new Error(result.error || "Command was cancelled.");
  if (result.terminationReason === "timedOut") return unavailable(repoPath, hash, filePath, "timed-out", "Blame exceeded the 30 second time limit.", bytes.byteLength);
  if (result.exceededLimit) return unavailable(repoPath, hash, filePath, "metadata-limit", "Blame metadata exceeded the safe output limit.", bytes.byteLength);
  if (result.exitCode !== 0) throw new Error(result.error || result.stderr.trim() || "Unable to read blame information.");
  const parsed = parseGitBlame(new TextDecoder().decode(result.stdout));
  return { kind: "text", repoPath, hash, path: filePath, byteLength: bytes.byteLength, ...parsed };
}

export function parseGitBlame(text: string): { lines: GitBlameLine[]; commits: GitBlameCommit[] } {
  const lines: GitBlameLine[] = [];
  const commits = new Map<string, GitBlameCommit>();
  const input = text.split(/\r?\n/);
  for (let index = 0; index < input.length;) {
    const header = /^([0-9a-f^]{7,64}) (\d+) (\d+)(?: (\d+))?$/.exec(input[index] ?? "");
    if (!header) { index += 1; continue; }
    const hash = (header[1] ?? "").replace(/^\^/, "");
    const originalLine = Number(header[2]);
    const finalLine = Number(header[3]);
    index += 1;
    const metadata = new Map<string, string>();
    let boundary = false;
    let content = "";
    while (index < input.length) {
      const value = input[index] ?? "";
      index += 1;
      if (value.startsWith("\t")) { content = value.slice(1); break; }
      if (value === "boundary") { boundary = true; continue; }
      const space = value.indexOf(" ");
      metadata.set(space === -1 ? value : value.slice(0, space), space === -1 ? "" : value.slice(space + 1));
    }
    const authorTime = Number(metadata.get("author-time"));
    if (!commits.has(hash)) {
      commits.set(hash, {
        hash,
        shortHash: hash.slice(0, 10),
        authorName: metadata.get("author") ?? "Unknown",
        authorEmail: (metadata.get("author-mail") ?? "").replace(/^<|>$/g, ""),
        authorDate: Number.isFinite(authorTime) ? new Date(authorTime * 1000).toISOString() : "",
        summary: metadata.get("summary") ?? ""
      });
    }
    lines.push({
      finalLine,
      originalLine,
      commitHash: hash,
      originalPath: metadata.get("filename") ?? "",
      text: content,
      boundary
    });
  }
  return { lines, commits: [...commits.values()] };
}

function countLines(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  let lines = bytes[bytes.byteLength - 1] === 10 ? 0 : 1;
  for (const byte of bytes) if (byte === 10) lines += 1;
  return lines;
}

function unavailable(
  repoPath: string,
  hash: string,
  path: string,
  reason: Extract<GitFileBlameResult, { kind: "unavailable" }>["reason"],
  message: string,
  byteLength?: number
): Extract<GitFileBlameResult, { kind: "unavailable" }> {
  return { kind: "unavailable", repoPath, hash, path, reason, message, ...(byteLength === undefined ? {} : { byteLength }) };
}
