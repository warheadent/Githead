import os from "node:os";
import { parseGitLfsPointer } from "./gitLfs";
import type { ProcessRunner } from "./processRunner";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";
const GITLINK_MODE = "160000";
/** Git LFS pointer files are at most 1 KiB by specification. */
const LFS_POINTER_MAX_BYTES = 1024;

export const CHANGE_STRIDE = 4;
export const CHANGE_BINARY = 1;
export const CHANGE_LFS = 2;
export const CHANGE_DELETED = 4;
export const CHANGE_ADDED = 8;

/** Environment for read-only analytics commands. Partial clones must not fetch missing objects. */
export function analyticsGitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" };
}

/**
 * One commit in compact form. `changes` holds CHANGE_STRIDE integers per file:
 * path id, lines added, lines removed, and CHANGE_* flags. `lfsSizes` holds the
 * stored size for each LFS change and is omitted when the commit has none.
 */
export interface HistoryCommit {
  hash: string;
  time: number;
  tzOffsetMinutes: number;
  identity: number;
  merge: boolean;
  changes: Int32Array;
  lfsSizes?: Float64Array;
}

export interface AnalyticsHistory {
  head: string;
  /** Newest first. */
  commits: HistoryCommit[];
  paths: string[];
  identities: Array<{ name: string; email: string }>;
  truncated: boolean;
}

export interface ParsedFileChange {
  path: string;
  status: string;
  blob: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface ParsedCommit {
  hash: string;
  parentCount: number;
  name: string;
  email: string;
  time: number;
  tzOffsetMinutes: number;
  changes: ParsedFileChange[];
}

// Cache raw identities so a changed mailmap does not require rereading history.
export const ANALYTICS_LOG_FORMAT = `${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI`;

/** Parses `git log -z --raw --numstat --no-renames` output incrementally. */
export class GitAnalyticsLogParser {
  private buffer = "";

  constructor(private readonly onCommit: (commit: ParsedCommit) => void) {}

  push(text: string): void {
    this.buffer += text;
    const last = this.buffer.lastIndexOf(RECORD_SEPARATOR);
    if (last <= 0) return;
    const complete = this.buffer.slice(0, last);
    this.buffer = this.buffer.slice(last);
    for (const record of complete.split(RECORD_SEPARATOR)) this.parseRecord(record);
  }

  end(): void {
    const rest = this.buffer;
    this.buffer = "";
    for (const record of rest.split(RECORD_SEPARATOR)) this.parseRecord(record);
  }

  private parseRecord(record: string): void {
    if (!record) return;
    const headerEnd = record.indexOf("\0");
    const header = headerEnd === -1 ? record : record.slice(0, headerEnd);
    const [hash = "", parents = "", name = "", email = "", date = ""] = header.replace(/\n+$/, "").split(FIELD_SEPARATOR);
    if (!/^[0-9a-f]{40,64}$/.test(hash)) return;
    const time = Date.parse(date);
    if (!Number.isFinite(time)) return;
    const changes = new Map<string, ParsedFileChange>();
    const skipped = new Set<string>();
    const tokens = headerEnd === -1 ? [] : record.slice(headerEnd + 1).split("\0");
    for (let index = 0; index < tokens.length; index += 1) {
      const token = (tokens[index] ?? "").replace(/^\n+/, "");
      if (!token) continue;
      if (token.startsWith(":")) {
        const path = tokens[index + 1] ?? "";
        index += 1;
        const [oldMode = "", newMode = "", , blob = "", status = ""] = token.slice(1).split(" ");
        if (!path) continue;
        if (oldMode === GITLINK_MODE || newMode === GITLINK_MODE) {
          skipped.add(path);
          continue;
        }
        changes.set(path, { path, status: status.slice(0, 1), blob, added: 0, removed: 0, binary: false });
        continue;
      }
      const firstTab = token.indexOf("\t");
      const secondTab = firstTab === -1 ? -1 : token.indexOf("\t", firstTab + 1);
      if (secondTab === -1) continue;
      const path = token.slice(secondTab + 1);
      if (skipped.has(path)) continue;
      const added = token.slice(0, firstTab);
      const removed = token.slice(firstTab + 1, secondTab);
      const change = changes.get(path) ?? { path, status: "M", blob: "", added: 0, removed: 0, binary: false };
      change.binary = added === "-" || removed === "-";
      change.added = change.binary ? 0 : Number(added) || 0;
      change.removed = change.binary ? 0 : Number(removed) || 0;
      changes.set(path, change);
    }
    this.onCommit({
      hash,
      parentCount: parents.trim() ? parents.trim().split(/\s+/).length : 0,
      name: name.trim(),
      email: email.trim(),
      time: Math.floor(time / 1000),
      tzOffsetMinutes: parseTimezoneOffset(date),
      changes: [...changes.values()]
    });
  }
}

export function parseTimezoneOffset(isoDate: string): number {
  const match = /([+-])(\d{2}):?(\d{2})$/.exec(isoDate);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Interns paths and identities and turns parsed commits into compact records. */
export class AnalyticsHistoryBuilder {
  private readonly pathIds = new Map<string, number>();
  private readonly identityIds = new Map<string, number>();
  readonly paths: string[];
  readonly identities: Array<{ name: string; email: string }>;
  /** Candidate LFS pointer blobs keyed by blob id, with the change positions that reference them. */
  readonly lfsCandidates = new Map<string, Array<{ commit: HistoryCommit; change: number }>>();
  changeCount = 0;

  constructor(base?: Pick<AnalyticsHistory, "paths" | "identities">) {
    this.paths = base ? [...base.paths] : [];
    this.identities = base ? base.identities.map((identity) => ({ ...identity })) : [];
    this.paths.forEach((path, index) => this.pathIds.set(path, index));
    this.identities.forEach((identity, index) => this.identityIds.set(`${identity.name}\n${identity.email}`, index));
  }

  add(commit: ParsedCommit): HistoryCommit {
    const changes = new Int32Array(commit.changes.length * CHANGE_STRIDE);
    const record: HistoryCommit = {
      hash: commit.hash,
      time: commit.time,
      tzOffsetMinutes: commit.tzOffsetMinutes,
      identity: this.identity(commit.name, commit.email),
      merge: commit.parentCount > 1,
      changes
    };
    commit.changes.forEach((change, index) => {
      const offset = index * CHANGE_STRIDE;
      changes[offset] = this.path(change.path);
      changes[offset + 1] = Math.min(change.added, 0x7fffffff);
      changes[offset + 2] = Math.min(change.removed, 0x7fffffff);
      changes[offset + 3] = (change.binary ? CHANGE_BINARY : 0)
        | (change.status === "D" ? CHANGE_DELETED : 0)
        | (change.status === "A" ? CHANGE_ADDED : 0);
      // A pointer edit changes at most the version, oid, and size lines.
      if (!change.binary && change.status !== "D" && change.added <= 3 && change.removed <= 3 && /^[0-9a-f]{40,64}$/.test(change.blob) && !/^0+$/.test(change.blob)) {
        const references = this.lfsCandidates.get(change.blob);
        if (references) references.push({ commit: record, change: index });
        else this.lfsCandidates.set(change.blob, [{ commit: record, change: index }]);
      }
    });
    this.changeCount += commit.changes.length;
    return record;
  }

  /** Marks candidate changes whose blobs are LFS pointers and records their stored sizes. */
  applyLfsSizes(sizes: ReadonlyMap<string, number>): void {
    for (const [blob, references] of this.lfsCandidates) {
      const size = sizes.get(blob);
      if (size === undefined) continue;
      for (const { commit, change } of references) {
        const offset = change * CHANGE_STRIDE;
        commit.changes[offset + 1] = 0;
        commit.changes[offset + 2] = 0;
        commit.changes[offset + 3] = (commit.changes[offset + 3] ?? 0) | CHANGE_LFS;
        commit.lfsSizes ??= new Float64Array(commit.changes.length / CHANGE_STRIDE);
        commit.lfsSizes[change] = size;
      }
    }
    this.lfsCandidates.clear();
  }

  private path(path: string): number {
    let id = this.pathIds.get(path);
    if (id === undefined) {
      id = this.paths.length;
      this.paths.push(path);
      this.pathIds.set(path, id);
    }
    return id;
  }

  private identity(name: string, email: string): number {
    const key = `${name}\n${email}`;
    let id = this.identityIds.get(key);
    if (id === undefined) {
      id = this.identities.length;
      this.identities.push({ name, email });
      this.identityIds.set(key, id);
    }
    return id;
  }
}

export interface ReadHistoryOptions {
  /** Revision arguments, for example `["HEAD"]` or `[newHead, "^" + oldHead]`. */
  revisions: string[];
  maxCommits: number;
  maxFileChanges: number;
  /** Number of `git log` processes to run at once. */
  concurrency?: number;
  /** Commits per `git log` process. Defaults to an even split with a minimum of 50. */
  chunkSize?: number;
  onTotal?: (total: number) => void;
  onCommits?: (count: number) => void;
}

export interface ReadHistoryResult {
  commits: HistoryCommit[];
  changeCount: number;
  truncated: boolean;
}

const MIN_CHUNK_COMMITS = 50;
const CHUNKS_PER_WORKER = 4;

/** Default parallelism for history reads: leave one core for the app. */
export function defaultHistoryConcurrency(): number {
  return Math.max(1, Math.min(6, (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length) - 1));
}

/**
 * Reads commits with per-file statistics into the builder, newest first.
 * Diff statistics dominate the cost, so the commit list is split into chunks
 * that several `git log` processes read in parallel; results keep their order.
 */
export async function readAnalyticsHistory(
  runner: ProcessRunner,
  repoPath: string,
  builder: AnalyticsHistoryBuilder,
  options: ReadHistoryOptions
): Promise<ReadHistoryResult> {
  const list = await runner.run("git", ["-C", repoPath, "rev-list", `--max-count=${options.maxCommits + 1}`, ...options.revisions, "--"], {
    env: analyticsGitEnv(),
    timeoutMs: 5 * 60_000,
    maxOutputBytes: (options.maxCommits + 1) * 66 + 4096
  });
  if (list.exitCode !== 0) throw new Error(list.error || list.stderr.trim() || "Unable to list commits.");
  let hashes = list.stdout.split("\n").filter(Boolean);
  let truncated = hashes.length > options.maxCommits;
  if (truncated) hashes = hashes.slice(0, options.maxCommits);
  options.onTotal?.(hashes.length);

  const concurrency = Math.max(1, options.concurrency ?? defaultHistoryConcurrency());
  const chunkSize = Math.max(1, options.chunkSize ?? Math.max(MIN_CHUNK_COMMITS, Math.ceil(hashes.length / (concurrency * CHUNKS_PER_WORKER))));
  const chunks: string[][] = [];
  for (let start = 0; start < hashes.length; start += chunkSize) chunks.push(hashes.slice(start, start + chunkSize));
  const results = Array.from<HistoryCommit[] | undefined>({ length: chunks.length });
  const limit = new AbortController();
  let limitReached = false;
  let failure: unknown = null;
  let changeTotal = 0;
  let processed = 0;
  let lastReport = 0;
  let nextChunk = 0;

  const readChunk = async (index: number): Promise<void> => {
    const commits: HistoryCommit[] = [];
    const parser = new GitAnalyticsLogParser((commit) => {
      if (limitReached) return;
      changeTotal += commit.changes.length;
      if (changeTotal > options.maxFileChanges) {
        limitReached = true;
        limit.abort();
        return;
      }
      commits.push(builder.add(commit));
      processed += 1;
      const now = Date.now();
      if (options.onCommits && now - lastReport >= 200) {
        lastReport = now;
        options.onCommits(processed);
      }
    });
    const result = await runner.run("git", [
      "-C", repoPath,
      "-c", "core.quotePath=false",
      "-c", "diff.renames=false",
      "log",
      "--no-walk=unsorted",
      "--stdin",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      "--raw",
      "--numstat",
      "--no-abbrev",
      "-z",
      `--format=${ANALYTICS_LOG_FORMAT}`
    ], {
      env: analyticsGitEnv(),
      stdin: `${chunks[index]!.join("\n")}\n`,
      streamStdout: true,
      timeoutMs: 15 * 60_000,
      signal: limit.signal,
      onOutput: ({ stream, text }) => {
        if (stream === "stdout" && !limitReached) parser.push(text);
      }
    });
    if (limitReached) return;
    if (result.exitCode !== 0) throw new Error(result.error || result.stderr.trim() || "Unable to read commit history.");
    parser.end();
    results[index] = commits;
  };

  const worker = async (): Promise<void> => {
    while (!limitReached && failure === null && nextChunk < chunks.length) {
      const index = nextChunk;
      nextChunk += 1;
      try {
        await readChunk(index);
      } catch (error) {
        failure ??= error;
        limit.abort();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  if (failure !== null) throw failure;

  // Keep the newest contiguous chunks that fit within the file change limit.
  const commits: HistoryCommit[] = [];
  let changeCount = 0;
  for (const chunk of results) {
    if (!chunk) {
      truncated = true;
      break;
    }
    commits.push(...chunk);
  }
  for (const commit of commits) changeCount += commit.changes.length / CHANGE_STRIDE;
  if (limitReached) truncated = true;
  if (truncated) {
    const kept = new Set(commits);
    builder.lfsCandidates.forEach((references, blob) => {
      const retained = references.filter((reference) => kept.has(reference.commit));
      if (retained.length) builder.lfsCandidates.set(blob, retained);
      else builder.lfsCandidates.delete(blob);
    });
  }
  options.onCommits?.(commits.length);
  return { commits, changeCount, truncated };
}

/** Returns the stored size of each blob that is a Git LFS pointer. Missing objects are skipped. */
export async function readLfsPointerSizes(
  runner: ProcessRunner,
  repoPath: string,
  blobs: Iterable<string>,
  options: { knownSmall?: boolean } = {}
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  const unique = [...new Set(blobs)];
  if (unique.length === 0) return sizes;
  const small: string[] = options.knownSmall ? unique : [];
  for (let start = 0; !options.knownSmall && start < unique.length; start += 50_000) {
    const batch = unique.slice(start, start + 50_000);
    const check = await runner.run("git", ["-C", repoPath, "cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], {
      env: analyticsGitEnv(),
      stdin: `${batch.join("\n")}\n`,
      timeoutMs: 120_000,
      maxOutputBytes: batch.length * 128 + 4096
    });
    if (check.exitCode !== 0) throw new Error(check.error || check.stderr.trim() || "Unable to inspect Git objects.");
    for (const line of check.stdout.split("\n")) {
      const [oid = "", type = "", size = ""] = line.split(" ");
      if (type === "blob" && Number(size) <= LFS_POINTER_MAX_BYTES) small.push(oid);
    }
  }
  for (let start = 0; start < small.length; start += 20_000) {
    const batch = small.slice(start, start + 20_000);
    if (!runner.runBinary) throw new Error("Binary process output is unavailable.");
    const read = await runner.runBinary("git", ["-C", repoPath, "cat-file", "--batch"], {
      env: analyticsGitEnv(),
      stdin: `${batch.join("\n")}\n`,
      timeoutMs: 120_000,
      maxBytes: batch.length * (LFS_POINTER_MAX_BYTES + 128) + 4096
    });
    if (read.exitCode !== 0) throw new Error(read.error || read.stderr.trim() || "Unable to read Git objects.");
    parseCatFileBatch(read.stdout, (oid, content) => {
      const pointer = parseGitLfsPointer(content);
      if (pointer) sizes.set(oid, pointer.size);
    });
  }
  return sizes;
}

export function parseCatFileBatch(output: Uint8Array, onBlob: (oid: string, content: Uint8Array) => void): void {
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(10, offset);
    if (newline === -1) return;
    const [oid = "", type = "", size = ""] = decoder.decode(output.subarray(offset, newline)).split(" ");
    offset = newline + 1;
    if (type === "missing" || size === "" || !/^\d+$/.test(size)) continue;
    const length = Number(size);
    onBlob(oid, output.subarray(offset, offset + length));
    offset += length + 1;
  }
}
