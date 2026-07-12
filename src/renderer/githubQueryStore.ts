export type GitHubResource = "workflowRuns" | "openCounts" | "pullRequests" | "issues";

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
  lastAccess: number;
}
export interface GitHubQueryStoreOptions {
  loaders: Record<GitHubResource, (descriptor: GitHubQueryDescriptor, requestId: string) => Promise<unknown>>;
  now?: () => number;
  staleTimes?: Partial<Record<GitHubResource, number>>;
  maxEntries?: number;
}

const IDLE: GitHubQuerySnapshot<never> = Object.freeze({ status: "idle", data: undefined, error: "", updatedAt: null, isStale: true });

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
      entry = { descriptor, snapshot: IDLE, listeners: new Set(), generation: 0, inFlight: undefined, lastAccess: now() };
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
    const generation = ++entry.generation;
    entry.snapshot = { ...entry.snapshot, status: entry.snapshot.data === undefined ? "loading" : "refreshing", error: "" };
    notify(entry);
    const promise = options.loaders[descriptor.resource](descriptor, `${descriptor.resource}-${++requestSequence}`) as Promise<T>;
    entry.inFlight = promise;
    void promise.then((data) => {
      if (!disposed && entries.get(getGitHubQueryKey(descriptor)) === entry && entry.generation === generation && entry.inFlight === promise) {
        entry.snapshot = { status: "success", data, error: "", updatedAt: now(), isStale: false };
        entry.inFlight = undefined; touch(entry); notify(entry); cleanup();
      }
    }, (error) => {
      if (!disposed && entries.get(getGitHubQueryKey(descriptor)) === entry && entry.generation === generation && entry.inFlight === promise) {
        entry.snapshot = { ...entry.snapshot, status: "error", error: error instanceof Error ? error.message : String(error), isStale: true };
        entry.inFlight = undefined; touch(entry); notify(entry); cleanup();
      }
    });
    return promise;
  };

  return {
    getSnapshot<T>(descriptor: GitHubQueryDescriptor): GitHubQuerySnapshot<T> { return entryFor(descriptor).snapshot as GitHubQuerySnapshot<T>; },
    subscribe(descriptor: GitHubQueryDescriptor, listener: () => void): () => void { const entry = entryFor(descriptor); entry.listeners.add(listener); return () => entry.listeners.delete(listener); },
    ensure<T>(descriptor: GitHubQueryDescriptor): Promise<T> { return run<T>(descriptor, false); },
    refresh<T>(descriptor: GitHubQueryDescriptor): Promise<T> { return run<T>(descriptor, true); },
    invalidate(matcher: GitHubQueryMatcher): void { for (const entry of entries.values()) if (matches(entry, matcher) && !entry.snapshot.isStale) { entry.snapshot = { ...entry.snapshot, isStale: true }; notify(entry); } },
    clearRepository(repository: GitHubRepositoryScope): void { for (const [key, entry] of entries) if (matches(entry, { repository })) { entry.generation++; entries.delete(key); } },
    clear(): void { for (const entry of entries.values()) entry.generation++; entries.clear(); },
    dispose(): void { disposed = true; for (const entry of entries.values()) { entry.generation++; entry.listeners.clear(); } entries.clear(); }
  };
}

export type GitHubQueryStore = ReturnType<typeof createGitHubQueryStore>;
