import { watch, type FSWatcher, type WatchOptions } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { RepoChangedEvent, RepoChangedReason } from "../shared/types";

export interface RepoWatcherLike {
  close(): void;
  on(eventName: "error", listener: (error: Error) => void): this;
}

export type RepoWatchFactory = (
  repoPath: string,
  options: WatchOptions,
  listener: (eventType: string, filename: string | Buffer | null) => void
) => RepoWatcherLike;

export interface RepoWatchTarget {
  path: string;
  recursive: boolean;
  kind: "content" | "metadata";
}

export interface RepoWatchOptions {
  /**
   * Lists directories, relative to the content target, that match an ignore
   * rule and contain no tracked files. The content watcher neither walks nor
   * reports them. It is called before the content watcher starts and again
   * when ignore rules change or a new directory appears.
   */
  resolveIgnoredDirectories?: () => Promise<readonly string[]>;
}

export interface RepoWatchServiceOptions {
  getWindows: () => BrowserWindow[];
  watchFactory?: RepoWatchFactory;
  isDirectory?: (absolutePath: string) => Promise<boolean>;
  debounceMs?: number;
  maxWaitMs?: number;
  clock?: () => Date;
}

const REPO_CHANGE_DEBOUNCE_MS = 750;
const REPO_CHANGE_MAX_WAIT_MS = 5_000;
// New-directory checks are a cheap stat each; cap them so a bulk write
// (for example a package install) costs a bounded amount per burst.
const MAX_DIRECTORY_CANDIDATES_PER_BURST = 32;
const MAX_REMEMBERED_DIRECTORIES = 4_096;
// Check soon after a new directory appears, before a bulk write into a newly
// created ignored directory makes the Linux watcher walk much of it.
const IGNORE_CHECK_DELAY_MS = 100;
const IGNORE_KEYS_ARE_CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

export class RepoWatchService {
  private readonly getWindows: () => BrowserWindow[];
  private readonly watchFactory: RepoWatchFactory;
  private readonly isDirectory: (absolutePath: string) => Promise<boolean>;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly clock: () => Date;
  private metadataWatchers: RepoWatcherLike[] = [];
  private contentWatcher: RepoWatcherLike | null = null;
  private contentTarget: RepoWatchTarget | null = null;
  private contentStartPending = false;
  private resolveIgnoredDirectories: (() => Promise<readonly string[]>) | null = null;
  private ignoredDirectories: ReadonlySet<string> = new Set();
  private ignoreRulesChanged = false;
  private ignoreRefreshRunning = false;
  private ignoreRefreshQueued = false;
  private ignoreCheckTimer: NodeJS.Timeout | null = null;
  private readonly directoryCandidates = new Set<string>();
  private readonly checkedDirectories = new Set<string>();
  private watchedRepoPath: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private pendingReason: RepoChangedReason | null = null;
  private watcherGeneration = 0;

  constructor(options: RepoWatchServiceOptions) {
    this.getWindows = options.getWindows;
    this.watchFactory = options.watchFactory ?? defaultWatchFactory;
    this.isDirectory = options.isDirectory ?? defaultIsDirectory;
    this.debounceMs = options.debounceMs ?? REPO_CHANGE_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? REPO_CHANGE_MAX_WAIT_MS;
    this.clock = options.clock ?? (() => new Date());
  }

  /**
   * Metadata watchers start synchronously. The content watcher starts after
   * the ignore list resolves (or the next event-loop turn), because on Linux
   * Node walks and watches the whole tree synchronously while creating it.
   */
  watchRepo(repoPath: string, targets?: RepoWatchTarget[], options: RepoWatchOptions = {}): void {
    const nextRepoPath = normalizeRepoPath(repoPath);
    if (!nextRepoPath) {
      this.stopWatching();
      return;
    }

    if (
      this.watchedRepoPath &&
      isSameRepoPath(this.watchedRepoPath, nextRepoPath) &&
      (this.metadataWatchers.length || this.contentWatcher || this.contentStartPending)
    ) {
      return;
    }

    this.stopWatching();
    const generation = ++this.watcherGeneration;
    this.watchedRepoPath = nextRepoPath;
    this.resolveIgnoredDirectories = options.resolveIgnoredDirectories ?? null;

    const watchTargets = targets?.length ? targets : [{ path: nextRepoPath, recursive: true, kind: "content" as const }];
    for (const target of dedupeWatchTargets(watchTargets)) {
      if (target.kind === "content") {
        this.contentTarget ??= target;
      } else {
        this.startMetadataWatcher(target, generation);
      }
    }

    if (this.contentTarget) {
      this.contentStartPending = true;
      void this.startContentWatcher(generation);
    }
  }

  stopWatching(repoPath?: string): void {
    const normalizedRepoPath = repoPath ? normalizeRepoPath(repoPath) : null;
    if (
      normalizedRepoPath &&
      this.watchedRepoPath &&
      !isSameRepoPath(this.watchedRepoPath, normalizedRepoPath)
    ) {
      return;
    }

    this.watcherGeneration += 1;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
    if (this.ignoreCheckTimer) {
      clearTimeout(this.ignoreCheckTimer);
      this.ignoreCheckTimer = null;
    }
    this.pendingReason = null;

    const watchers = this.contentWatcher ? [...this.metadataWatchers, this.contentWatcher] : this.metadataWatchers;
    this.metadataWatchers = [];
    this.contentWatcher = null;
    this.contentTarget = null;
    this.contentStartPending = false;
    this.resolveIgnoredDirectories = null;
    this.ignoredDirectories = new Set();
    this.ignoreRulesChanged = false;
    this.ignoreRefreshRunning = false;
    this.ignoreRefreshQueued = false;
    this.directoryCandidates.clear();
    this.checkedDirectories.clear();
    this.watchedRepoPath = null;

    for (const watcher of watchers) closeWatcher(watcher);
  }

  private startMetadataWatcher(target: RepoWatchTarget, generation: number): void {
    let watcher: RepoWatcherLike | undefined;
    try {
      watcher = this.watchFactory(target.path, { recursive: target.recursive }, (_eventType, filename) => {
        if (generation !== this.watcherGeneration) return;
        if (isNoisyGitMetadataEvent(filename)) return;
        this.scheduleChange("filesystem-metadata", generation);
      });
    } catch {
      this.emitChange("watcher-error");
      return;
    }
    const created = watcher;
    this.metadataWatchers.push(created);
    created.on("error", () => {
      if (generation !== this.watcherGeneration) return;
      this.emitChange("watcher-error");
      closeWatcher(created);
      this.metadataWatchers = this.metadataWatchers.filter((candidate) => candidate !== created);
    });
  }

  private async startContentWatcher(generation: number): Promise<void> {
    const resolver = this.resolveIgnoredDirectories;
    let directories: readonly string[] = [];
    try {
      if (resolver) {
        directories = await resolver();
      } else {
        // Let the IPC reply and queued work run before the synchronous walk.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } catch {
      // Without an ignore list, still watch everything outside VCS internals.
      directories = [];
    }
    if (generation !== this.watcherGeneration) return;

    this.contentStartPending = false;
    this.ignoredDirectories = createIgnoredDirectorySet(directories);
    if (!this.createContentWatcher(generation)) this.emitChange("watcher-error");
  }

  private createContentWatcher(generation: number): boolean {
    const target = this.contentTarget;
    if (!target) return false;

    const ignoredDirectories = this.ignoredDirectories;
    const isIgnored = (filename: string): boolean => isIgnoredContentPath(normalizeWatchPath(filename), ignoredDirectories);
    let watcher: RepoWatcherLike | undefined;
    try {
      watcher = this.watchFactory(target.path, { recursive: target.recursive, ignore: isIgnored }, (eventType, filename) => {
        if (generation !== this.watcherGeneration || !watcher || this.contentWatcher !== watcher) return;
        this.handleContentEvent(eventType, filename, ignoredDirectories, generation);
      });
    } catch {
      return false;
    }

    const created = watcher;
    this.contentWatcher = created;
    created.on("error", () => {
      if (generation !== this.watcherGeneration || this.contentWatcher !== created) return;
      // Do not recreate it: an inotify limit (ENOSPC) would fail again.
      this.contentWatcher = null;
      this.emitChange("watcher-error");
      closeWatcher(created);
    });
    return true;
  }

  private handleContentEvent(
    eventType: string,
    filename: string | Buffer | null,
    ignoredDirectories: ReadonlySet<string>,
    generation: number
  ): void {
    const relativePath = filename ? normalizeWatchPath(filename.toString()) : null;
    if (relativePath !== null) {
      // Native watchers apply `ignore` to events too; this keeps behavior
      // identical on every platform and for already-queued events.
      if (isIgnoredContentPath(relativePath, ignoredDirectories)) return;
      if (this.resolveIgnoredDirectories) {
        if (isIgnoreRulesPath(relativePath)) {
          this.ignoreRulesChanged = true;
          this.scheduleIgnoreCheck(generation);
        } else if (eventType === "rename" && this.noteDirectoryCandidate(relativePath)) {
          this.scheduleIgnoreCheck(generation);
        }
      }
    }
    this.scheduleChange(classifyWatchReason(relativePath), generation);
  }

  private noteDirectoryCandidate(relativePath: string): boolean {
    if (this.directoryCandidates.size >= MAX_DIRECTORY_CANDIDATES_PER_BURST) return false;
    if (this.checkedDirectories.has(toIgnoreKey(relativePath))) return false;
    this.directoryCandidates.add(relativePath);
    return true;
  }

  private scheduleIgnoreCheck(generation: number): void {
    this.ignoreCheckTimer ??= setTimeout(() => {
      this.ignoreCheckTimer = null;
      if (generation === this.watcherGeneration) this.processIgnoreTriggers(generation);
    }, IGNORE_CHECK_DELAY_MS);
  }

  private processIgnoreTriggers(generation: number): void {
    if (!this.resolveIgnoredDirectories) return;
    const rulesChanged = this.ignoreRulesChanged;
    const candidates = [...this.directoryCandidates];
    this.ignoreRulesChanged = false;
    this.directoryCandidates.clear();

    if (rulesChanged) {
      this.checkedDirectories.clear();
      this.requestIgnoreRefresh(generation);
    } else if (candidates.length) {
      void this.inspectDirectoryCandidates(candidates, generation);
    }
  }

  private async inspectDirectoryCandidates(candidates: string[], generation: number): Promise<void> {
    const root = this.contentTarget?.path;
    if (!root) return;
    const results = await Promise.all(candidates.map((candidate) => this.isDirectory(path.join(root, candidate)).catch(() => false)));
    if (generation !== this.watcherGeneration) return;

    const directories = candidates.filter((_candidate, index) => results[index]);
    if (!directories.length) return;
    if (this.checkedDirectories.size + directories.length > MAX_REMEMBERED_DIRECTORIES) this.checkedDirectories.clear();
    for (const directory of directories) this.checkedDirectories.add(toIgnoreKey(directory));
    this.requestIgnoreRefresh(generation);
  }

  private requestIgnoreRefresh(generation: number): void {
    if (this.ignoreRefreshRunning) {
      this.ignoreRefreshQueued = true;
      return;
    }
    this.ignoreRefreshRunning = true;
    void this.runIgnoreRefresh(generation);
  }

  private async runIgnoreRefresh(generation: number): Promise<void> {
    try {
      do {
        this.ignoreRefreshQueued = false;
        const resolver = this.resolveIgnoredDirectories;
        if (!resolver) return;
        let next: ReadonlySet<string>;
        try {
          next = createIgnoredDirectorySet(await resolver());
        } catch {
          return; // Keep the current ignore set.
        }
        if (generation !== this.watcherGeneration) return;
        if (!areSetsEqual(next, this.ignoredDirectories)) {
          this.ignoredDirectories = next;
          this.restartContentWatcher(generation);
        }
      } while (this.ignoreRefreshQueued && generation === this.watcherGeneration);
    } finally {
      if (generation === this.watcherGeneration) this.ignoreRefreshRunning = false;
    }
  }

  private restartContentWatcher(generation: number): void {
    const previous = this.contentWatcher;
    // A content watcher that failed stays closed so watch limits cannot loop.
    if (!previous) return;
    // Close first so the old and new watchers never hold watches together.
    this.contentWatcher = null;
    closeWatcher(previous);
    if (!this.createContentWatcher(generation)) {
      this.emitChange("watcher-error");
      return;
    }
    // A write that landed while the new watcher walked the tree has no event.
    this.scheduleChange("filesystem", generation);
  }

  private scheduleChange(reason: RepoChangedReason, generation: number): void {
    if (!this.watchedRepoPath || generation !== this.watcherGeneration) return;
    // A content event must not discard an earlier request to refresh metadata.
    if (this.pendingReason === null || this.pendingReason === "filesystem" || reason === "filesystem-unknown") {
      this.pendingReason = reason;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flushChange(generation);
    }, this.debounceMs);
    this.maxWaitTimer ??= setTimeout(() => {
      this.flushChange(generation);
    }, this.maxWaitMs);
  }

  private flushChange(generation: number): void {
    if (generation !== this.watcherGeneration) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    const reason = this.pendingReason;
    this.pendingReason = null;
    if (reason) this.emitChange(reason);
  }

  private emitChange(reason: RepoChangedReason): void {
    if (!this.watchedRepoPath) {
      return;
    }

    const event: RepoChangedEvent = {
      repoPath: this.watchedRepoPath,
      changedAt: this.clock().toISOString(),
      reason
    };

    for (const window of this.getWindows()) {
      window.webContents.send(IPC_CHANNELS.repoChanged, event);
    }
  }
}

function dedupeWatchTargets(targets: RepoWatchTarget[]): RepoWatchTarget[] {
  const byKey = new Map<string, RepoWatchTarget>();
  for (const target of targets) {
    const resolved = path.resolve(target.path);
    const key = `${process.platform === "win32" ? resolved.toLocaleLowerCase() : resolved}:${target.recursive}:${target.kind}`;
    if (!byKey.has(key)) byKey.set(key, { ...target, path: resolved });
  }
  return [...byKey.values()];
}

function isNoisyGitMetadataEvent(filename: string | Buffer | null): boolean {
  if (!filename) return false;
  const normalized = filename.toString().replaceAll("\\", "/").toLocaleLowerCase();
  return normalized === "index" || normalized === "index.lock" || normalized.endsWith("/index") || normalized.endsWith("/index.lock") || normalized === "objects" || normalized.startsWith("objects/") || normalized.includes("/objects/") || normalized === "logs" || normalized.startsWith("logs/") || normalized.includes("/logs/");
}

function defaultWatchFactory(
  repoPath: string,
  options: WatchOptions,
  listener: (eventType: string, filename: string | Buffer | null) => void
): FSWatcher {
  return watch(repoPath, options, listener);
}

async function defaultIsDirectory(absolutePath: string): Promise<boolean> {
  return (await stat(absolutePath)).isDirectory();
}

function closeWatcher(watcher: RepoWatcherLike): void {
  try {
    watcher.close();
  } catch {
    // A watcher can already be closed after an OS-level error.
  }
}

function normalizeRepoPath(repoPath: string): string | null {
  const trimmedRepoPath = repoPath.trim();
  return trimmedRepoPath ? path.resolve(trimmedRepoPath) : null;
}

function isSameRepoPath(left: string, right: string): boolean {
  return normalizeRepoPath(left)?.toLocaleLowerCase() === normalizeRepoPath(right)?.toLocaleLowerCase();
}

function normalizeWatchPath(filename: string): string {
  return filename.replaceAll("\\", "/");
}

function toIgnoreKey(relativePath: string): string {
  return IGNORE_KEYS_ARE_CASE_INSENSITIVE ? relativePath.toLocaleLowerCase() : relativePath;
}

function hasPathSegment(normalizedLowerPath: string, segment: string): boolean {
  return (
    normalizedLowerPath === segment ||
    normalizedLowerPath.startsWith(`${segment}/`) ||
    normalizedLowerPath.endsWith(`/${segment}`) ||
    normalizedLowerPath.includes(`/${segment}/`)
  );
}

/**
 * The content watcher never walks or reports VCS internals. The metadata
 * watchers (git dir, common dir, refs, worktrees) are authoritative for
 * `.git`; object, index, and log writes from staging must not refresh
 * repository metadata. Lore persists dirty/staged flags into `.lore` on every
 * `lore status --scan`, so its writes would cause a scan -> refresh loop.
 */
function isInternalVcsPath(normalizedPath: string): boolean {
  const lower = normalizedPath.toLocaleLowerCase();
  return hasPathSegment(lower, ".git") || hasPathSegment(lower, ".lore");
}

function isIgnoredContentPath(normalizedPath: string, ignoredDirectories: ReadonlySet<string>): boolean {
  if (isInternalVcsPath(normalizedPath)) return true;
  if (!ignoredDirectories.size) return false;
  const key = toIgnoreKey(normalizedPath);
  for (let index = key.indexOf("/"); index !== -1; index = key.indexOf("/", index + 1)) {
    if (ignoredDirectories.has(key.slice(0, index))) return true;
  }
  return ignoredDirectories.has(key);
}

function isIgnoreRulesPath(normalizedPath: string): boolean {
  const lower = normalizedPath.toLocaleLowerCase();
  return lower === ".gitignore" || lower.endsWith("/.gitignore");
}

function createIgnoredDirectorySet(directories: readonly string[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const directory of directories) {
    const normalized = normalizeWatchPath(directory).replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
    if (!normalized || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) continue;
    // Repository actions are read from `.githead` even when it is ignored.
    if (normalized.toLocaleLowerCase().split("/").at(-1) === ".githead") continue;
    keys.add(toIgnoreKey(normalized));
  }
  return keys;
}

function areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function classifyWatchReason(normalizedPath: string | null): RepoChangedReason {
  if (normalizedPath === null) return "filesystem-unknown";
  const normalized = normalizedPath.toLocaleLowerCase();
  if (
    normalized === ".mailmap" ||
    normalized === ".githead/actions.toml" ||
    normalized === ".githead/actions.local.toml" ||
    normalized.endsWith("/.githead/actions.toml") ||
    normalized.endsWith("/.githead/actions.local.toml")
  ) {
    // Mailmap edits affect Analytics author totals. Repository actions are
    // displayed from the metadata snapshot, but are
    // resolved again when they run. Force a full snapshot refresh so the
    // command the user sees is always the command the main process resolves.
    return "filesystem-metadata";
  }
  return "filesystem";
}
