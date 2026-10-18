import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BinaryProcessResult, ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

/**
 * Process-wide cache for Git reads whose output is fully determined by a
 * resolved object id: commit details, commit file diffs, blame at a commit,
 * and commit-sourced previews.
 *
 * Only full 40/64-hex object ids are cacheable. Abbreviated ids can become
 * ambiguous when new objects arrive, and symbolic revisions move.
 *
 * Git can still rewrite what a fixed id shows through replacement refs,
 * grafts, mailmap (blame authors), attributes (diff drivers and binary
 * detection), and configuration (diff algorithm, rename limits). Each cached
 * read compares a cheap stat fingerprint of those inputs; any change drops
 * every entry for that repository. The fingerprint covers top-level
 * `.mailmap` and `.gitattributes`, repository and global configuration,
 * `info/attributes`, `info/grafts`, and replacement refs (loose, packed, or
 * reftable). Nested `.gitattributes` files and custom `mailmap.file` or
 * `core.attributesFile` locations are not tracked.
 */

/**
 * Commit text diffs are bounded at 250 000 characters (~0.5 MB in UTF-16),
 * blame at 20 000 lines, previews at 1 MB of text, and image diffs at 10 MiB
 * per side. A 48 MiB budget keeps hundreds of typical commits and diffs warm
 * while staying a small fraction of the main process heap. Entries above a
 * quarter of the budget are never retained so one large image cannot evict
 * the whole working set.
 */
export const IMMUTABLE_READ_CACHE_MAX_BYTES = 48 * 1024 * 1024;
export const IMMUTABLE_READ_CACHE_MAX_ENTRY_BYTES = IMMUTABLE_READ_CACHE_MAX_BYTES / 4;

export function isFullObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
}

export function immutableRepoKey(repoPath: string): string | null {
  const normalized = normalizeRepoPath(repoPath);
  return normalized ? getRepoPathKey(normalized) : null;
}

export interface ImmutableReadKey {
  repoKey: string;
  kind: string;
  hash: string;
  parts?: readonly string[];
}

export interface ImmutableLoadResult<T> {
  value: T;
  /** False for errors, environment-dependent fallbacks, and partial reads. */
  cacheable: boolean;
}

export interface ImmutableReadCacheOptions {
  maxBytes?: number;
  maxEntryBytes?: number;
}

interface CacheEntry {
  repoKey: string;
  value: unknown;
  bytes: number;
}

interface RepoState {
  fingerprint: string;
  generation: number;
  keys: Set<string>;
}

type LoadOutcome =
  | { ok: true; value: unknown; cacheable: boolean; interrupted: boolean }
  | { ok: false; error: unknown; interrupted: boolean };

interface LoadTracker {
  interrupted: boolean;
  parent: LoadTracker | undefined;
}

const loadTrackers = new AsyncLocalStorage<LoadTracker>();

export class ImmutableReadCache {
  private readonly maxBytes: number;
  private readonly maxEntryBytes: number;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<LoadOutcome>>();
  private readonly repos = new Map<string, RepoState>();
  private totalBytes = 0;
  private generation = 0;

  constructor(options: ImmutableReadCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? IMMUTABLE_READ_CACHE_MAX_BYTES;
    this.maxEntryBytes = Math.min(options.maxEntryBytes ?? IMMUTABLE_READ_CACHE_MAX_ENTRY_BYTES, this.maxBytes);
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  /**
   * Returns a cached value, joins a matching in-flight load, or runs `loader`.
   * `fingerprint` must describe the repository's history-rewriting inputs; a
   * null fingerprint disables caching for this read.
   */
  async read<T>(
    key: ImmutableReadKey,
    fingerprint: string | null,
    loader: () => Promise<ImmutableLoadResult<T>>
  ): Promise<T> {
    if (fingerprint === null || !isFullObjectId(key.hash)) return (await loader()).value;
    const repo = this.syncRepo(key.repoKey, fingerprint);
    const cacheKey = serializeKey(key);
    const cached = this.entries.get(cacheKey);
    if (cached) {
      this.entries.delete(cacheKey);
      this.entries.set(cacheKey, cached);
      return cached.value as T;
    }

    const shared = this.inFlight.get(cacheKey);
    if (shared) {
      const outcome = await shared;
      // A joined load ran under another request's cancellation signal. When it
      // was interrupted, this request still deserves its own attempt.
      if (!outcome.interrupted) return unwrapOutcome<T>(outcome);
    }
    return unwrapOutcome<T>(await this.load(cacheKey, key.repoKey, repo.generation, loader));
  }

  private load<T>(cacheKey: string, repoKey: string, generation: number, loader: () => Promise<ImmutableLoadResult<T>>): Promise<LoadOutcome> {
    const promise: Promise<LoadOutcome> = this.runTracked(loader).then((outcome) => {
      if (outcome.ok && outcome.cacheable && !outcome.interrupted) this.store(cacheKey, repoKey, generation, outcome.value);
      return outcome;
    }).finally(() => {
      if (this.inFlight.get(cacheKey) === promise) this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  clearRepo(repoKey: string): void {
    const repo = this.repos.get(repoKey);
    if (!repo) return;
    for (const cacheKey of repo.keys) this.deleteEntry(cacheKey);
    // Deleting the current key while iterating a Map is safe.
    for (const cacheKey of this.inFlight.keys()) {
      if (cacheKey.startsWith(`${repoKey}\0`)) this.inFlight.delete(cacheKey);
    }
    this.repos.delete(repoKey);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.repos.clear();
    this.totalBytes = 0;
  }

  private async runTracked<T>(loader: () => Promise<ImmutableLoadResult<T>>): Promise<LoadOutcome> {
    const outcome = await observeInterruptions(loader);
    return outcome.ok
      ? { ok: true, value: outcome.value.value, cacheable: outcome.value.cacheable, interrupted: outcome.interrupted }
      : outcome;
  }

  private syncRepo(repoKey: string, fingerprint: string): RepoState {
    const existing = this.repos.get(repoKey);
    if (existing?.fingerprint === fingerprint) return existing;
    if (existing) this.clearRepo(repoKey);
    const next: RepoState = { fingerprint, generation: ++this.generation, keys: new Set() };
    this.repos.set(repoKey, next);
    return next;
  }

  private store(cacheKey: string, repoKey: string, generation: number, value: unknown): void {
    const repo = this.repos.get(repoKey);
    // The repository's history-rewriting inputs changed while this load ran.
    if (!repo || repo.generation !== generation) return;
    const bytes = estimateRetainedBytes(value) + cacheKey.length * 2;
    if (bytes > this.maxEntryBytes) return;
    this.deleteEntry(cacheKey);
    this.entries.set(cacheKey, { repoKey, value, bytes });
    repo.keys.add(cacheKey);
    this.totalBytes += bytes;
    for (const [oldestKey] of this.entries) {
      if (this.totalBytes <= this.maxBytes) break;
      this.deleteEntry(oldestKey);
    }
  }

  private deleteEntry(cacheKey: string): void {
    const entry = this.entries.get(cacheKey);
    if (!entry) return;
    this.entries.delete(cacheKey);
    this.totalBytes -= entry.bytes;
    this.repos.get(entry.repoKey)?.keys.delete(cacheKey);
  }
}

/**
 * Runs `operation` and reports whether any process it started through a
 * runner wrapped by trackProcessInterruptions was cancelled, timed out, or
 * failed to start. Nested observations also mark every enclosing one.
 */
export async function observeInterruptions<T>(operation: () => Promise<T>): Promise<
  | { ok: true; value: T; interrupted: boolean }
  | { ok: false; error: unknown; interrupted: boolean }
> {
  const tracker: LoadTracker = { interrupted: false, parent: loadTrackers.getStore() };
  try {
    const value = await loadTrackers.run(tracker, operation);
    return { ok: true, value, interrupted: tracker.interrupted };
  } catch (error) {
    return { ok: false, error, interrupted: tracker.interrupted };
  }
}

function unwrapOutcome<T>(outcome: LoadOutcome): T {
  if (outcome.ok) return outcome.value as T;
  throw outcome.error;
}

function serializeKey(key: ImmutableReadKey): string {
  // The repository prefix lets clearRepo match in-flight keys; JSON keeps
  // parts unambiguous whatever characters they contain.
  return `${key.repoKey}\0${JSON.stringify([key.kind, key.hash.toLowerCase(), ...(key.parts ?? [])])}`;
}

/**
 * Marks the active cached load as interrupted when a process was cancelled,
 * timed out, or failed to start, so a partial result is never retained.
 * Output-limit truncation is deterministic and remains cacheable.
 */
export function trackProcessInterruptions(runner: ProcessRunner): ProcessRunner {
  const runBinary = async (command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }): Promise<BinaryProcessResult> => {
    if (!runner.runBinary) throw new Error("Binary process output is unavailable.");
    return noteTermination(await runner.runBinary(command, args, options));
  };
  return {
    run: async (command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> =>
      noteTermination(await runner.run(command, args, options)),
    // Resolve on access so capability checks follow the wrapped runner.
    get runBinary() {
      return runner.runBinary ? runBinary : undefined;
    }
  } as ProcessRunner;
}

function noteTermination<T extends ProcessResult | BinaryProcessResult>(result: T): T {
  const reason = result.terminationReason;
  if (reason === "aborted" || reason === "timedOut" || reason === "spawnFailed") {
    for (let tracker = loadTrackers.getStore(); tracker; tracker = tracker.parent) tracker.interrupted = true;
  }
  return result;
}

/**
 * Approximates retained heap bytes. Strings count as UTF-16 because V8 may
 * store them as two-byte strings; binary data counts its byte length.
 */
export function estimateRetainedBytes(value: unknown): number {
  const seen = new Set<object>();
  let bytes = 0;
  const stack: unknown[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string") bytes += 16 + current.length * 2;
    else if (typeof current === "number" || typeof current === "bigint") bytes += 8;
    else if (typeof current === "boolean" || current === null || current === undefined) bytes += 4;
    else if (ArrayBuffer.isView(current)) bytes += 64 + current.byteLength;
    else if (current instanceof ArrayBuffer) bytes += 64 + current.byteLength;
    else if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      if (Array.isArray(current)) {
        bytes += 16 + current.length * 8;
        for (const item of current) stack.push(item);
      } else {
        bytes += 32;
        for (const [name, item] of Object.entries(current)) {
          bytes += 8 + name.length * 2;
          stack.push(item);
        }
      }
    }
  }
  return bytes;
}

export interface RepoReadPaths {
  topLevel: string;
  gitDir: string;
  commonDir: string;
}

/** Files whose changes can alter what Git shows for a fixed object id. */
export function repoFingerprintPaths(
  paths: RepoReadPaths,
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir()
): string[] {
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config");
  const globalConfig = env.GIT_CONFIG_GLOBAL?.trim()
    ? [env.GIT_CONFIG_GLOBAL.trim()]
    : [path.join(homeDir, ".gitconfig"), path.join(xdgConfigHome, "git", "config")];
  const candidates = [
    path.join(paths.topLevel, ".mailmap"),
    path.join(paths.topLevel, ".gitattributes"),
    path.join(paths.commonDir, "config"),
    path.join(paths.gitDir, "config.worktree"),
    path.join(paths.commonDir, "info", "attributes"),
    path.join(paths.commonDir, "info", "grafts"),
    path.join(paths.commonDir, "refs", "replace"),
    path.join(paths.commonDir, "packed-refs"),
    path.join(paths.commonDir, "reftable", "tables.list"),
    ...globalConfig,
    path.join(xdgConfigHome, "git", "attributes"),
    ...(env.GIT_CONFIG_SYSTEM?.trim() ? [env.GIT_CONFIG_SYSTEM.trim()] : [])
  ];
  return [...new Set(candidates)];
}

export type StatLike = (filePath: string) => Promise<{ mtimeMs: number; ctimeMs: number; size: number; ino: number }>;

export async function readRepoFingerprint(filePaths: readonly string[], stat: StatLike = fs.stat): Promise<string> {
  const parts = await Promise.all(filePaths.map(async (filePath) => {
    try {
      const value = await stat(filePath);
      return `${value.mtimeMs}:${value.ctimeMs}:${value.size}:${value.ino}`;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "error";
      return code === "ENOENT" || code === "ENOTDIR" ? "-" : `!${code}`;
    }
  }));
  return parts.join("|");
}

