import { Effect } from "effect";
import type { GitHubFailure } from "../shared/types";
import { forkEffect, tryPromise } from "../shared/effectRuntime";

export type GitHubResource = "workflowRuns" | "workflowRunDetail" | "openCounts" | "pullRequests" | "issues" | "viewer" | "pullRequestDetail" | "issueDetail";

export interface GitHubRepositoryScope { repoPath: string; githubFullName: string }
export type GitHubQueryParams = Record<string, unknown>;
export interface GitHubQueryDescriptor<TParams extends GitHubQueryParams = GitHubQueryParams> {
  repository: GitHubRepositoryScope;
  resource: GitHubResource;
  params: TParams;
}
export interface GitHubQuerySnapshot<T> {
  status: "idle" | "loading" | "success" | "refreshing" | "error";
  data: T | undefined;
  error: string;
  failure: GitHubFailure | null;
  updatedAt: number | null;
  isStale: boolean;
}
export type GitHubQueryMatcher = Partial<Pick<GitHubQueryDescriptor, "resource">> & { repository?: GitHubRepositoryScope; params?: GitHubQueryParams };

interface Entry {
  descriptor: GitHubQueryDescriptor;
  snapshot: GitHubQuerySnapshot<unknown>;
  listeners: Set<() => void>;
  generation: number;
  inFlight: Promise<unknown> | undefined;
  interrupt: (() => void) | undefined;
  lastAccess: number;
}
export interface GitHubQueryStoreOptions {
  loaders: Partial<Record<GitHubResource, (descriptor: GitHubQueryDescriptor, requestId: string) => Promise<unknown>>>;
  now?: () => number;
  staleTimes?: Partial<Record<GitHubResource, number>>;
  maxEntries?: number;
  cancel?: (requestId: string) => Promise<void>;
}

const IDLE: GitHubQuerySnapshot<never> = Object.freeze({ status: "idle", data: undefined, error: "", failure: null, updatedAt: null, isStale: true });

export function normalizeRepositoryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function canonical(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as object).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function getGitHubQueryKey(descriptor: GitHubQueryDescriptor): string {
  return `${normalizeRepositoryPath(descriptor.repository.repoPath)}\0${descriptor.repository.githubFullName.toLowerCase()}\0${descriptor.resource}\0${canonical(descriptor.params)}`;
}

export function createGitHubQueryStore(options: GitHubQueryStoreOptions) {
  const entries = new Map<string, Entry>();
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 100;
  let disposed = false;
  let requestSequence = 0;

  const notify = (entry: Entry): void => entry.listeners.forEach((listener) => listener());
  const touch = (entry: Entry): void => { entry.lastAccess = now(); };
  const cleanup = (): void => {
    if (entries.size <= maxEntries) return;
    const removable = [...entries.entries()].filter(([, entry]) => entry.listeners.size === 0 && !entry.inFlight)
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [key] of removable.slice(0, entries.size - maxEntries)) entries.delete(key);
  };
  const entryFor = (descriptor: GitHubQueryDescriptor): Entry => {
    const key = getGitHubQueryKey(descriptor);
    let entry = entries.get(key);
    if (!entry) {
      entry = { descriptor, snapshot: IDLE, listeners: new Set(), generation: 0, inFlight: undefined, interrupt: undefined, lastAccess: now() };
      entries.set(key, entry);
      cleanup();
    }
    touch(entry);
    return entry;
  };
  const matches = (entry: Entry, matcher: GitHubQueryMatcher): boolean =>
    (!matcher.resource || entry.descriptor.resource === matcher.resource) &&
    (!matcher.repository || (normalizeRepositoryPath(entry.descriptor.repository.repoPath) === normalizeRepositoryPath(matcher.repository.repoPath) &&
      entry.descriptor.repository.githubFullName.toLowerCase() === matcher.repository.githubFullName.toLowerCase())) &&
    (!matcher.params || canonical(entry.descriptor.params) === canonical(matcher.params));

  const run = <T>(descriptor: GitHubQueryDescriptor, force: boolean): Promise<T> => {
    const entry = entryFor(descriptor);
    if (!force && entry.inFlight) return entry.inFlight as Promise<T>;
    const staleTime = options.staleTimes?.[descriptor.resource] ?? Infinity;
    if (!force && entry.snapshot.data !== undefined && !entry.snapshot.isStale && now() - (entry.snapshot.updatedAt ?? 0) <= staleTime) return Promise.resolve(entry.snapshot.data as T);
    if (force && entry.inFlight) {
      entry.generation += 1;
      entry.interrupt?.();
      entry.inFlight = undefined;
      entry.interrupt = undefined;
    }
    const generation = ++entry.generation;
    entry.snapshot = { ...entry.snapshot, status: entry.snapshot.data === undefined ? "loading" : "refreshing", error: "", failure: null };
    notify(entry);
    const loader = options.loaders[descriptor.resource];
    if (!loader) return Promise.reject(new Error(`No GitHub loader is registered for ${descriptor.resource}.`));
    const requestId = `${descriptor.resource}-${++requestSequence}`;
    const program = tryPromise(() => loader(descriptor, requestId) as Promise<T>).pipe(
      Effect.onInterrupt(() => options.cancel
        ? tryPromise(() => options.cancel!(requestId).catch(() => undefined)).pipe(Effect.asVoid)
        : Effect.succeed(undefined))
    );
    const running = forkEffect(program);
    const promise = running.promise;
    entry.inFlight = promise;
    entry.interrupt = running.interrupt;
    void promise.then((data) => {
      if (!disposed && entries.get(getGitHubQueryKey(descriptor)) === entry && entry.generation === generation && entry.inFlight === promise) {
        entry.snapshot = { status: "success", data, error: "", failure: null, updatedAt: now(), isStale: false };
        entry.inFlight = undefined; entry.interrupt = undefined; touch(entry); notify(entry); cleanup();
      }
    }, (error) => {
      if (!disposed && entries.get(getGitHubQueryKey(descriptor)) === entry && entry.generation === generation && entry.inFlight === promise) {
        entry.snapshot = {
          ...entry.snapshot,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          failure: getGitHubFailure(error),
          isStale: true
        };
        entry.inFlight = undefined; entry.interrupt = undefined; touch(entry); notify(entry); cleanup();
      }
    });
    return promise;
  };

  return {
    getSnapshot<T>(descriptor: GitHubQueryDescriptor): GitHubQuerySnapshot<T> { return entryFor(descriptor).snapshot as GitHubQuerySnapshot<T>; },
    subscribe(descriptor: GitHubQueryDescriptor, listener: () => void): () => void { const entry = entryFor(descriptor); entry.listeners.add(listener); return () => entry.listeners.delete(listener); },
    ensure<T>(descriptor: GitHubQueryDescriptor): Promise<T> { return run<T>(descriptor, false); },
    refresh<T>(descriptor: GitHubQueryDescriptor): Promise<T> { return run<T>(descriptor, true); },
    cancel(descriptor: GitHubQueryDescriptor): void {
      const entry = entries.get(getGitHubQueryKey(descriptor));
      if (!entry?.inFlight) return;
      entry.generation += 1;
      entry.interrupt?.();
      entry.inFlight = undefined;
      entry.interrupt = undefined;
      entry.snapshot = entry.snapshot.data === undefined
        ? IDLE
        : { ...entry.snapshot, status: "success", error: "", failure: null };
      touch(entry);
      notify(entry);
    },
    invalidate(matcher: GitHubQueryMatcher): void { for (const entry of entries.values()) if (matches(entry, matcher) && !entry.snapshot.isStale) { entry.snapshot = { ...entry.snapshot, isStale: true }; notify(entry); } },
    clearRepository(repository: GitHubRepositoryScope): void { for (const [key, entry] of entries) if (matches(entry, { repository })) { entry.generation++; entry.interrupt?.(); entries.delete(key); } },
    clear(): void { for (const entry of entries.values()) { entry.generation++; entry.interrupt?.(); } entries.clear(); },
    dispose(): void { disposed = true; for (const entry of entries.values()) { entry.generation++; entry.interrupt?.(); entry.listeners.clear(); } entries.clear(); }
  };
}

function getGitHubFailure(error: unknown): GitHubFailure | null {
  if (!(error instanceof Error) || !("failure" in error)) return null;
  const failure = (error as Error & { failure?: unknown }).failure;
  return failure && typeof failure === "object" && "kind" in failure ? failure as GitHubFailure : null;
}

export type GitHubQueryStore = ReturnType<typeof createGitHubQueryStore>;
