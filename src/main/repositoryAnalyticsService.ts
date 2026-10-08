import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type {
  AnalyticsBranch,
  AnalyticsBranches,
  AnalyticsFileType,
  AnalyticsLargeFile,
  RepositoryAnalytics,
  RepositoryAnalyticsProgress
} from "../shared/types";
import {
  AnalyticsHistoryBuilder,
  analyticsGitEnv,
  CHANGE_STRIDE,
  readAnalyticsHistory,
  readLfsPointerSizes,
  type AnalyticsHistory,
  type ReadHistoryOptions,
  type HistoryCommit
} from "./gitAnalyticsHistory";
import type { ProcessRunner } from "./processRunner";
import { getRepoPathKey } from "./repoPath";
import { buildRepositoryAnalytics, type TreeSummary } from "./repositoryAnalytics";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const DEFAULT_ANALYTICS_MAX_COMMITS = 50_000;
export const DEFAULT_ANALYTICS_MAX_FILE_CHANGES = 1_500_000;
const CACHE_FORMAT_VERSION = 1;
const MEMORY_CACHE_ENTRIES = 3;
const DISK_CACHE_ENTRIES = 20;
const BRANCH_LIMIT = 200;
const TAG_LIMIT = 200;
const FALLBACK_DRIFT_LIMIT = 50;
const FILE_TYPE_LIMIT = 9;
const LARGE_FILE_BYTES = 1_000_000;
const LARGE_FILE_LIMIT = 8;
const LFS_POINTER_MAX_BYTES = 1024;

/** Extensions of formats that Git cannot diff or merge meaningfully. */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tga", ".tif", ".tiff", ".psd", ".exr", ".hdr", ".dds", ".ico", ".webp", ".heic", ".raw",
  ".fbx", ".obj", ".blend", ".max", ".ma", ".mb", ".3ds", ".dae", ".abc", ".glb", ".usdc", ".uasset", ".umap", ".spp", ".sbsar", ".kra", ".xcf", ".clip",
  ".wav", ".mp3", ".ogg", ".flac", ".aif", ".aiff", ".wem", ".bank", ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".zip", ".rar", ".7z", ".gz", ".tar", ".exe", ".dll", ".lib", ".pdb", ".so", ".dylib", ".a", ".bin", ".ttf", ".otf", ".woff", ".woff2", ".pdf"
]);

export type AnalyticsProgressReporter = (progress: Omit<RepositoryAnalyticsProgress, "requestId">) => void;

export interface RepositoryAnalyticsServiceOptions {
  /** Folder for persisted history. Persistence is disabled when omitted. */
  cacheDirectory?: string;
  /** Milliseconds since the epoch. */
  now?: () => number;
  maxCommits?: number;
  maxFileChanges?: number;
  /** Parallel `git log` processes for history reads. Defaults to the core count minus one, up to six. */
  historyConcurrency?: number;
}

export interface RepositoryAnalyticsQuery {
  repoPath: string;
  excludePaths: boolean;
  excludedPathPatterns: string[];
}

/**
 * Computes repository analytics from local Git data. Parsed history is cached
 * in memory and on disk by HEAD commit, and later requests only read commits
 * added since the cached HEAD when it is still an ancestor.
 */
export class RepositoryAnalyticsService {
  private readonly histories = new Map<string, AnalyticsHistory>();
  private readonly trees = new Map<string, { head: string; summary: TreeSummary }>();
  private readonly now: () => number;
  private readonly maxCommits: number;
  private readonly maxFileChanges: number;

  constructor(private readonly runner: ProcessRunner, private readonly options: RepositoryAnalyticsServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxCommits = options.maxCommits ?? DEFAULT_ANALYTICS_MAX_COMMITS;
    this.maxFileChanges = options.maxFileChanges ?? DEFAULT_ANALYTICS_MAX_FILE_CHANGES;
  }

  async getAnalytics(query: RepositoryAnalyticsQuery, onProgress?: AnalyticsProgressReporter): Promise<RepositoryAnalytics> {
    const { repoPath } = query;
    await this.assertRepository(repoPath);
    const [head, branch] = await Promise.all([this.readHead(repoPath), this.readCurrentBranch(repoPath)]);
    const history = head ? await this.loadHistory(repoPath, head, onProgress) : null;
    onProgress?.({ phase: "assets", processedCommits: history?.commits.length ?? 0, totalCommits: history?.commits.length ?? 0 });
    const tree = head ? await this.loadTree(repoPath, head) : emptyTree();
    onProgress?.({ phase: "branches", processedCommits: history?.commits.length ?? 0, totalCommits: history?.commits.length ?? 0 });
    const [packedBytes, tags, branches] = await Promise.all([
      this.readPackedBytes(repoPath),
      this.readTags(repoPath),
      head ? this.readBranches(repoPath, branch) : Promise.resolve<AnalyticsBranches>({ base: null, branches: [], truncated: false })
    ]);
    return buildRepositoryAnalytics({
      repoPath,
      headHash: head,
      branch,
      now: Math.floor(this.now() / 1000),
      history,
      excludePaths: query.excludePaths,
      excludedPathPatterns: query.excludedPathPatterns,
      tree,
      packedBytes,
      branches,
      tags
    });
  }

  private async loadHistory(repoPath: string, head: string, onProgress?: AnalyticsProgressReporter): Promise<AnalyticsHistory> {
    const key = getRepoPathKey(repoPath);
    const cached = this.histories.get(key) ?? await this.readDiskCache(key);
    if (cached?.head === head) {
      this.remember(key, cached);
      return cached;
    }
    let history: AnalyticsHistory | null = null;
    if (cached && await this.isAncestor(repoPath, cached.head, head)) {
      history = await this.readIncrementalHistory(repoPath, head, cached, onProgress);
    }
    history ??= await this.readFullHistory(repoPath, head, onProgress);
    this.remember(key, history);
    await this.writeDiskCache(key, history);
    return history;
  }

  private async readFullHistory(repoPath: string, head: string, onProgress?: AnalyticsProgressReporter): Promise<AnalyticsHistory> {
    const builder = new AnalyticsHistoryBuilder();
    const result = await readAnalyticsHistory(this.runner, repoPath, builder, this.historyOptions([head], this.maxFileChanges, onProgress));
    builder.applyLfsSizes(await readLfsPointerSizes(this.runner, repoPath, builder.lfsCandidates.keys()));
    return { head, commits: result.commits, paths: builder.paths, identities: builder.identities, truncated: result.truncated };
  }

  /** Reads only commits added since `cached.head`. Returns null when a full read is required. */
  private async readIncrementalHistory(
    repoPath: string,
    head: string,
    cached: AnalyticsHistory,
    onProgress?: AnalyticsProgressReporter
  ): Promise<AnalyticsHistory | null> {
    const existingChanges = cached.commits.reduce((count, commit) => count + commit.changes.length / CHANGE_STRIDE, 0);
    const builder = new AnalyticsHistoryBuilder(cached);
    const result = await readAnalyticsHistory(this.runner, repoPath, builder, this.historyOptions([head, `^${cached.head}`], this.maxFileChanges, onProgress));
    if (result.truncated) return null;
    builder.applyLfsSizes(await readLfsPointerSizes(this.runner, repoPath, builder.lfsCandidates.keys()));
    const commits = [...result.commits, ...cached.commits];
    let truncated = cached.truncated;
    let changes = existingChanges + result.changeCount;
    while (commits.length > this.maxCommits || (changes > this.maxFileChanges && commits.length > 0)) {
      changes -= commits.pop()!.changes.length / CHANGE_STRIDE;
      truncated = true;
    }
    return { head, commits, paths: builder.paths, identities: builder.identities, truncated };
  }

  private async loadTree(repoPath: string, head: string): Promise<TreeSummary> {
    const key = getRepoPathKey(repoPath);
    const cached = this.trees.get(key);
    if (cached?.head === head) return cached.summary;
    const summary = await this.readTree(repoPath, head);
    this.trees.delete(key);
    this.trees.set(key, { head, summary });
    while (this.trees.size > MEMORY_CACHE_ENTRIES) this.trees.delete(this.trees.keys().next().value!);
    return summary;
  }

  /** Summarizes the tree at `head`, resolving LFS pointers to the size of the files they stand for. */
  private async readTree(repoPath: string, head: string): Promise<TreeSummary> {
    const types = new Map<string, AnalyticsFileType & { example: string; exampleBytes: number }>();
    const small: Array<{ path: string; oid: string; size: number }> = [];
    const large: AnalyticsLargeFile[] = [];
    let largeCount = 0;
    let files = 0;
    let lfsFiles = 0;
    let lfsBytes = 0;
    let gitBytes = 0;
    const record = (filePath: string, gitSize: number, lfsSize: number | null) => {
      files += 1;
      const extension = fileExtension(filePath);
      let type = types.get(extension);
      if (!type) {
        type = { extension, files: 0, lfsFiles: 0, lfsBytes: 0, gitBytes: 0, example: filePath, exampleBytes: 0 };
        types.set(extension, type);
      }
      type.files += 1;
      if (lfsSize !== null) {
        type.lfsFiles += 1;
        type.lfsBytes += lfsSize;
        lfsFiles += 1;
        lfsBytes += lfsSize;
        return;
      }
      type.gitBytes += gitSize;
      gitBytes += gitSize;
      if (gitSize > type.exampleBytes) {
        type.example = filePath;
        type.exampleBytes = gitSize;
      }
      if (gitSize > LARGE_FILE_BYTES) {
        largeCount += 1;
        large.push({ path: filePath, bytes: gitSize });
        if (large.length > LARGE_FILE_LIMIT * 4) {
          large.sort((a, b) => b.bytes - a.bytes);
          large.length = LARGE_FILE_LIMIT;
        }
      }
    };
    let buffer = "";
    const consume = (entry: string) => {
      const tab = entry.indexOf("\t");
      if (tab === -1) return;
      const [, type = "", oid = "", size = ""] = entry.slice(0, tab).split(/\s+/);
      if (type !== "blob") return;
      const filePath = entry.slice(tab + 1);
      const bytes = Number(size) || 0;
      if (bytes <= LFS_POINTER_MAX_BYTES) small.push({ path: filePath, oid, size: bytes });
      else record(filePath, bytes, null);
    };
    const result = await this.runner.run("git", ["-C", repoPath, "-c", "core.quotePath=false", "ls-tree", "-r", "-l", "-z", "--full-tree", head], {
      env: analyticsGitEnv(),
      streamStdout: true,
      timeoutMs: 5 * 60_000,
      onOutput: ({ stream, text }) => {
        if (stream !== "stdout") return;
        buffer += text;
        const entries = buffer.split("\0");
        buffer = entries.pop() ?? "";
        for (const entry of entries) consume(entry);
      }
    });
    if (result.exitCode !== 0) throw new Error(result.error || result.stderr.trim() || "Unable to read the repository tree.");
    if (buffer) consume(buffer);
    const pointers = await readLfsPointerSizes(this.runner, repoPath, small.map((entry) => entry.oid), { knownSmall: true });
    for (const entry of small) record(entry.path, entry.size, pointers.get(entry.oid) ?? null);

    const sortedTypes = [...types.values()].sort((a, b) => (b.gitBytes + b.lfsBytes) - (a.gitBytes + a.lfsBytes) || b.files - a.files);
    const rest = sortedTypes.slice(FILE_TYPE_LIMIT);
    const strip = ({ example: _example, exampleBytes: _exampleBytes, ...type }: AnalyticsFileType & { example: string; exampleBytes: number }) => type;
    return {
      files,
      lfsFiles,
      lfsBytes,
      gitBytes,
      types: sortedTypes.slice(0, FILE_TYPE_LIMIT).map(strip),
      otherTypes: rest.length
        ? rest.reduce<AnalyticsFileType>((total, type) => ({
          extension: "",
          files: total.files + type.files,
          lfsFiles: total.lfsFiles + type.lfsFiles,
          lfsBytes: total.lfsBytes + type.lfsBytes,
          gitBytes: total.gitBytes + type.gitBytes
        }), { extension: "", files: 0, lfsFiles: 0, lfsBytes: 0, gitBytes: 0 })
        : null,
      binaryTypesOutsideLfs: [...types.values()]
        .filter((type) => BINARY_EXTENSIONS.has(type.extension) && type.gitBytes > 0)
        .sort((a, b) => b.gitBytes - a.gitBytes)
        .slice(0, 8)
        .map(({ exampleBytes: _exampleBytes, ...type }) => ({ ...type, files: type.files - type.lfsFiles })),
      largeFilesOutsideLfs: large.sort((a, b) => b.bytes - a.bytes).slice(0, LARGE_FILE_LIMIT),
      largeFilesOutsideLfsCount: largeCount
    };
  }

  private async readBranches(repoPath: string, currentBranch: string | null): Promise<AnalyticsBranches> {
    const base = await this.resolveDriftBase(repoPath, currentBranch);
    const fields = ["%(refname)", "%(refname:short)", "%(committerdate:unix)", "%(symref)"];
    const run = (withDrift: boolean) => this.git(repoPath, [
      "for-each-ref",
      "--sort=-committerdate",
      `--count=${BRANCH_LIMIT + 1}`,
      `--format=${[...fields, ...(withDrift && base ? [`%(ahead-behind:${base})`] : [])].join("%00")}`,
      "refs/heads",
      "refs/remotes"
    ]);
    let result = await run(true);
    let driftInline = Boolean(base);
    if (result.exitCode !== 0 && base) {
      // %(ahead-behind) needs Git 2.41 or later.
      result = await run(false);
      driftInline = false;
    }
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Unable to read branches.");
    const rows = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\0"));
    const branches: AnalyticsBranch[] = [];
    for (const [ref = "", name = "", time = "", symref = "", drift = ""] of rows.slice(0, BRANCH_LIMIT)) {
      if (symref || name === base) continue;
      const [ahead, behind] = drift.split(" ").map((value) => (value === "" ? NaN : Number(value)));
      branches.push({
        name,
        remote: ref.startsWith("refs/remotes/"),
        current: ref === `refs/heads/${currentBranch}`,
        lastCommitAt: Number(time) || 0,
        ahead: Number.isFinite(ahead) ? ahead! : null,
        behind: Number.isFinite(behind) ? behind! : null
      });
    }
    if (base && !driftInline) {
      for (const branch of branches.slice(0, FALLBACK_DRIFT_LIMIT)) {
        const counts = await this.git(repoPath, ["rev-list", "--left-right", "--count", `${branch.name}...${base}`, "--"]);
        const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
        if (counts.exitCode === 0 && Number.isFinite(ahead) && Number.isFinite(behind)) {
          branch.ahead = ahead!;
          branch.behind = behind!;
        }
      }
    }
    return { base, branches, truncated: rows.length > BRANCH_LIMIT };
  }

  /** The remote default branch, else the current upstream, else the current branch. */
  private async resolveDriftBase(repoPath: string, currentBranch: string | null): Promise<string | null> {
    const remoteHead = await this.git(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (remoteHead.exitCode === 0 && remoteHead.stdout.trim()) return remoteHead.stdout.trim();
    const upstream = await this.git(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream.exitCode === 0 && upstream.stdout.trim()) return upstream.stdout.trim();
    return currentBranch;
  }

  private async readTags(repoPath: string): Promise<Array<{ name: string; time: number }>> {
    const result = await this.git(repoPath, ["for-each-ref", "--sort=-creatordate", `--count=${TAG_LIMIT}`, "--format=%(refname:short)%00%(creatordate:unix)", "refs/tags"]);
    if (result.exitCode !== 0) return [];
    return result.stdout.split("\n").filter(Boolean).flatMap((line) => {
      const [name = "", time = ""] = line.split("\0");
      return name && Number(time) > 0 ? [{ name, time: Number(time) }] : [];
    });
  }

  private async readPackedBytes(repoPath: string): Promise<number | null> {
    const result = await this.git(repoPath, ["count-objects", "-v"]);
    if (result.exitCode !== 0) return null;
    const value = (key: string) => Number(new RegExp(`^${key}: (\\d+)$`, "m").exec(result.stdout)?.[1] ?? 0);
    return (value("size-pack") + value("size")) * 1024;
  }

  private async assertRepository(repoPath: string): Promise<void> {
    const result = await this.git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
    if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
      throw new Error(result.stderr.trim() || "Selected folder is not a Git repository.");
    }
  }

  private async readHead(repoPath: string): Promise<string | null> {
    const result = await this.git(repoPath, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
    return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null;
  }

  private async readCurrentBranch(repoPath: string): Promise<string | null> {
    const result = await this.git(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null;
  }

  private async isAncestor(repoPath: string, ancestor: string, descendant: string): Promise<boolean> {
    return (await this.git(repoPath, ["merge-base", "--is-ancestor", ancestor, descendant])).exitCode === 0;
  }

  private historyOptions(revisions: string[], maxFileChanges: number, onProgress?: AnalyticsProgressReporter): ReadHistoryOptions {
    let total: number | null = null;
    return {
      revisions,
      maxCommits: this.maxCommits,
      maxFileChanges,
      ...(this.options.historyConcurrency ? { concurrency: this.options.historyConcurrency } : {}),
      onTotal: (count) => {
        total = count;
        onProgress?.({ phase: "history", processedCommits: 0, totalCommits: count });
      },
      onCommits: (count) => onProgress?.({ phase: "history", processedCommits: count, totalCommits: total })
    };
  }

  private git(repoPath: string, args: string[]) {
    return this.runner.run("git", ["-C", repoPath, ...args], { env: analyticsGitEnv(), timeoutMs: 60_000 });
  }

  private remember(key: string, history: AnalyticsHistory): void {
    this.histories.delete(key);
    this.histories.set(key, history);
    while (this.histories.size > MEMORY_CACHE_ENTRIES) this.histories.delete(this.histories.keys().next().value!);
  }

  private cacheFile(key: string): string | null {
    if (!this.options.cacheDirectory) return null;
    return path.join(this.options.cacheDirectory, `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json.gz`);
  }

  private async readDiskCache(key: string): Promise<AnalyticsHistory | null> {
    const file = this.cacheFile(key);
    if (!file) return null;
    try {
      const stored = JSON.parse((await gunzipAsync(await fs.readFile(file))).toString("utf8")) as StoredHistory;
      return stored.version === CACHE_FORMAT_VERSION && stored.key === key ? fromStoredHistory(stored) : null;
    } catch {
      return null;
    }
  }

  /** Persists history so the next session can update it incrementally. Failures only cost a full read later. */
  private async writeDiskCache(key: string, history: AnalyticsHistory): Promise<void> {
    const file = this.cacheFile(key);
    if (!file || !this.options.cacheDirectory) return;
    try {
      await fs.mkdir(this.options.cacheDirectory, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, await gzipAsync(JSON.stringify(toStoredHistory(key, history))));
      await fs.rename(temporary, file);
      await this.pruneDiskCache();
    } catch {
      // Persistence is an optimization.
    }
  }

  private async pruneDiskCache(): Promise<void> {
    const directory = this.options.cacheDirectory!;
    const entries = await Promise.all((await fs.readdir(directory)).filter((name) => name.endsWith(".json.gz")).map(async (name) => ({
      file: path.join(directory, name),
      modified: (await fs.stat(path.join(directory, name))).mtimeMs
    })));
    entries.sort((a, b) => b.modified - a.modified);
    await Promise.all(entries.slice(DISK_CACHE_ENTRIES).map((entry) => fs.rm(entry.file, { force: true })));
  }
}

interface StoredHistory {
  version: number;
  key: string;
  head: string;
  truncated: boolean;
  paths: string[];
  identities: Array<[name: string, email: string]>;
  commits: Array<[hash: string, time: number, tzOffsetMinutes: number, identity: number, merge: 0 | 1, changes: number[], lfsSizes: number[] | null]>;
}

function toStoredHistory(key: string, history: AnalyticsHistory): StoredHistory {
  return {
    version: CACHE_FORMAT_VERSION,
    key,
    head: history.head,
    truncated: history.truncated,
    paths: history.paths,
    identities: history.identities.map(({ name, email }) => [name, email]),
    commits: history.commits.map((commit) => [
      commit.hash,
      commit.time,
      commit.tzOffsetMinutes,
      commit.identity,
      commit.merge ? 1 : 0,
      Array.from(commit.changes),
      commit.lfsSizes ? Array.from(commit.lfsSizes) : null
    ])
  };
}

function fromStoredHistory(stored: StoredHistory): AnalyticsHistory {
  const commits: HistoryCommit[] = stored.commits.map(([hash, time, tzOffsetMinutes, identity, merge, changes, lfsSizes]) => ({
    hash,
    time,
    tzOffsetMinutes,
    identity,
    merge: merge === 1,
    changes: Int32Array.from(changes),
    ...(lfsSizes ? { lfsSizes: Float64Array.from(lfsSizes) } : {})
  }));
  return {
    head: stored.head,
    truncated: stored.truncated,
    paths: stored.paths,
    identities: stored.identities.map(([name, email]) => ({ name, email })),
    commits
  };
}

/** Lowercase extension with its dot, the whole name for dotfiles, or an empty string. */
export function fileExtension(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot === 0) return name.toLowerCase();
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function emptyTree(): TreeSummary {
  return { files: 0, lfsFiles: 0, lfsBytes: 0, gitBytes: 0, types: [], otherTypes: null, binaryTypesOutsideLfs: [], largeFilesOutsideLfs: [], largeFilesOutsideLfsCount: 0 };
}
