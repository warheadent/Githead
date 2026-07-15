import { watch, type FSWatcher, type WatchOptions } from "node:fs";
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

export interface RepoWatchServiceOptions {
  getWindows: () => BrowserWindow[];
  watchFactory?: RepoWatchFactory;
  debounceMs?: number;
  maxWaitMs?: number;
  clock?: () => Date;
}

const REPO_CHANGE_DEBOUNCE_MS = 750;
const REPO_CHANGE_MAX_WAIT_MS = 5_000;

export class RepoWatchService {
  private readonly getWindows: () => BrowserWindow[];
  private readonly watchFactory: RepoWatchFactory;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly clock: () => Date;
  private watchers: RepoWatcherLike[] = [];
  private watchedRepoPath: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private watcherGeneration = 0;

  constructor(options: RepoWatchServiceOptions) {
    this.getWindows = options.getWindows;
    this.watchFactory = options.watchFactory ?? defaultWatchFactory;
    this.debounceMs = options.debounceMs ?? REPO_CHANGE_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? REPO_CHANGE_MAX_WAIT_MS;
    this.clock = options.clock ?? (() => new Date());
  }

  watchRepo(repoPath: string, targets?: RepoWatchTarget[]): void {
    const nextRepoPath = normalizeRepoPath(repoPath);
    if (!nextRepoPath) {
      this.stopWatching();
      return;
    }

    if (this.watchers.length && this.watchedRepoPath && isSameRepoPath(this.watchedRepoPath, nextRepoPath)) {
      return;
    }

    this.stopWatching();
    const generation = ++this.watcherGeneration;
    this.watchedRepoPath = nextRepoPath;

    const watchTargets = targets?.length ? targets : [{ path: nextRepoPath, recursive: true, kind: "content" as const }];
    for (const target of dedupeWatchTargets(watchTargets)) {
      try {
        const watcher = this.watchFactory(target.path, { recursive: target.recursive }, (_eventType, filename) => {
          if (generation !== this.watcherGeneration) return;
          if (target.kind === "content" && isInternalVcsWatchEvent(filename)) return;
          if (target.kind === "metadata" && isNoisyGitMetadataEvent(filename)) return;
          this.scheduleChange(target.kind === "metadata" ? "filesystem-metadata" : classifyWatchReason(filename), generation);
        });
        this.watchers.push(watcher);
        watcher.on("error", () => {
          if (generation !== this.watcherGeneration) return;
          this.emitChange("watcher-error");
          try { watcher.close(); } catch { /* already closed */ }
          this.watchers = this.watchers.filter((candidate) => candidate !== watcher);
        });
      } catch {
        this.emitChange("watcher-error");
      }
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

    const watchers = this.watchers;
    this.watchers = [];
    this.watchedRepoPath = null;

    try {
      for (const watcher of watchers) watcher.close();
    } catch {
      // A watcher can already be closed after an OS-level error.
    }
  }

  private scheduleChange(reason: RepoChangedReason, generation: number): void {
    if (!this.watchedRepoPath || generation !== this.watcherGeneration) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flushChange(reason, generation);
    }, this.debounceMs);
    this.maxWaitTimer ??= setTimeout(() => {
      this.flushChange(reason, generation);
    }, this.maxWaitMs);
  }

  private flushChange(reason: RepoChangedReason, generation: number): void {
    if (generation !== this.watcherGeneration) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.emitChange(reason);
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

function normalizeRepoPath(repoPath: string): string | null {
  const trimmedRepoPath = repoPath.trim();
  return trimmedRepoPath ? path.resolve(trimmedRepoPath) : null;
}

function isSameRepoPath(left: string, right: string): boolean {
  return normalizeRepoPath(left)?.toLocaleLowerCase() === normalizeRepoPath(right)?.toLocaleLowerCase();
}

function isInternalVcsWatchEvent(filename: string | Buffer | null): boolean {
  if (!filename) {
    return false;
  }

  const normalizedFileName = filename.toString().replaceAll("\\", "/").toLocaleLowerCase();

  // Lore persists dirty/staged flags into `.lore` whenever `lore status --scan`
  // runs (which Githead does on every summary load). Ignoring all internal
  // `.lore` writes prevents a scan -> repoChanged -> reload -> scan loop. Git
  // mutates `.git` constantly too; only its noisy index reads are ignored so
  // that ref changes (commits, branch switches) still refresh the view.
  if (
    normalizedFileName === ".lore" ||
    normalizedFileName.startsWith(".lore/") ||
    normalizedFileName.endsWith("/.lore") ||
    normalizedFileName.includes("/.lore/")
  ) {
    return true;
  }

  return (
    normalizedFileName === ".git" ||
    normalizedFileName === ".git/index" ||
    normalizedFileName === ".git/index.lock" ||
    normalizedFileName.endsWith("/.git") ||
    normalizedFileName.endsWith("/.git/index") ||
    normalizedFileName.endsWith("/.git/index.lock")
  );
}

function classifyWatchReason(filename: string | Buffer | null): RepoChangedReason {
  if (!filename) return "filesystem-unknown";
  const normalized = filename.toString().replaceAll("\\", "/").toLocaleLowerCase();
  return normalized === ".git" || normalized.startsWith(".git/") || normalized.includes("/.git/")
    ? "filesystem-metadata"
    : "filesystem";
}
