import type { GitHubRepository } from "../shared/types";
import type { ProcessRunner } from "./processRunner";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export interface GitHubClientRequest {
  method?: "GET" | "POST";
  body?: unknown;
  cache?: {
    mode: "conditional" | "none";
    maxAgeMs?: number;
  };
  signal?: AbortSignal;
}

export interface GitHubClientResponse<T> {
  payload: T;
  status: number;
  headers: Headers;
  source: "network" | "fresh-cache" | "not-modified";
}

export interface GitHubClient {
  requestJson<T>(repository: GitHubRepository, path: string, request?: GitHubClientRequest): Promise<GitHubClientResponse<T>>;
  invalidateRepository(repository: GitHubRepository): void;
}

type GitHubAuthStrategy =
  | { kind: "token"; source: "GITHUB_TOKEN" | "GH_TOKEN" | "gh"; token: string }
  | { kind: "anonymous" };

interface CacheEntry {
  repository: string;
  etag: string;
  payload: unknown;
  storedAt: number;
  headers: Headers;
  size: number;
}

interface GitHubApiErrorResponse {
  message?: string;
  errors?: Array<string | { message?: string }>;
}

export interface DefaultGitHubClientOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  authTimeoutMs?: number;
  requestTimeoutMs?: number;
  mutationTimeoutMs?: number;
  maxCacheEntries?: number;
  maxCachePayloadBytes?: number;
  maxInFlightRequests?: number;
}

export class DefaultGitHubClient implements GitHubClient {
  private authStrategy: GitHubAuthStrategy | undefined;
  private authInFlight: Promise<GitHubAuthStrategy> | undefined;
  private authGeneration = 0;
  private readonly responseCache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<GitHubClientResponse<unknown>>>();
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly authTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly mutationTimeoutMs: number;
  private readonly maxCacheEntries: number;
  private readonly maxCachePayloadBytes: number;
  private readonly maxInFlightRequests: number;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly runner?: ProcessRunner,
    options: DefaultGitHubClientOptions = {}
  ) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? Date.now;
    this.authTimeoutMs = options.authTimeoutMs ?? 5_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.mutationTimeoutMs = options.mutationTimeoutMs ?? 20_000;
    this.maxCacheEntries = options.maxCacheEntries ?? 100;
    this.maxCachePayloadBytes = options.maxCachePayloadBytes ?? 1_000_000;
    this.maxInFlightRequests = options.maxInFlightRequests ?? 100;
  }

  async requestJson<T>(repository: GitHubRepository, path: string, request: GitHubClientRequest = {}): Promise<GitHubClientResponse<T>> {
    validatePath(path);
    const method = request.method ?? "GET";
    if (method === "POST" && request.cache?.mode === "conditional") {
      throw new Error("GitHub POST requests cannot use response caching.");
    }

    const auth = await this.resolveAuthStrategy();
    const generation = this.authGeneration;
    const key = this.createKey(generation, repository, method, path);
    if (method !== "GET" || this.inFlight.size >= this.maxInFlightRequests) {
      return this.protectToken(this.performRequest<T>(repository, path, request, auth, generation, false), auth);
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<GitHubClientResponse<T>>;
    const operation = this.protectToken(this.performRequest<T>(repository, path, request, auth, generation, false), auth);
    this.inFlight.set(key, operation as Promise<GitHubClientResponse<unknown>>);
    void operation.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    return operation;
  }

  invalidateRepository(repository: GitHubRepository): void {
    const normalized = normalizeRepository(repository);
    for (const [key, entry] of this.responseCache) {
      if (entry.repository === normalized) this.responseCache.delete(key);
    }
  }

  private async resolveAuthStrategy(): Promise<GitHubAuthStrategy> {
    if (this.authStrategy) return this.authStrategy;
    if (this.authInFlight) return this.authInFlight;
    this.authInFlight = this.discoverAuthStrategy();
    try {
      this.authStrategy = await this.authInFlight;
      return this.authStrategy;
    } finally {
      this.authInFlight = undefined;
    }
  }

  private async protectToken<T>(operation: Promise<T>, auth: GitHubAuthStrategy): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (auth.kind !== "token" || !auth.token || !(error instanceof Error) || !error.message.includes(auth.token)) throw error;
      throw new Error(error.message.split(auth.token).join("[redacted]"), { cause: error });
    }
  }

  private async discoverAuthStrategy(): Promise<GitHubAuthStrategy> {
    const githubToken = this.env.GITHUB_TOKEN?.trim();
    if (githubToken) return { kind: "token", source: "GITHUB_TOKEN", token: githubToken };
    const ghToken = this.env.GH_TOKEN?.trim();
    if (ghToken) return { kind: "token", source: "GH_TOKEN", token: ghToken };
    if (!this.runner) return { kind: "anonymous" };
    try {
      const result = await this.runner.run("gh", ["auth", "token", "--hostname", "github.com"], { timeoutMs: this.authTimeoutMs });
      const token = result.exitCode === 0 ? result.stdout.trim() : "";
      return token ? { kind: "token", source: "gh", token } : { kind: "anonymous" };
    } catch {
      return { kind: "anonymous" };
    }
  }

  private async performRequest<T>(
    repository: GitHubRepository,
    path: string,
    request: GitHubClientRequest,
    auth: GitHubAuthStrategy,
    generation: number,
    authRetried: boolean
  ): Promise<GitHubClientResponse<T>> {
    const method = request.method ?? "GET";
    const cacheEnabled = method === "GET" && request.cache?.mode === "conditional";
    const key = this.createKey(generation, repository, method, path);
    const cached = cacheEnabled ? this.getCacheEntry(key) : undefined;
    const maxAgeMs = request.cache?.maxAgeMs ?? 0;
    if (cached && maxAgeMs > 0 && this.now() - cached.storedAt <= maxAgeMs) {
      return { payload: cached.payload as T, status: 200, headers: new Headers(cached.headers), source: "fresh-cache" };
    }

    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    const headers = new Headers({
      "Accept": "application/vnd.github+json",
      "User-Agent": "Githead",
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (cached) headers.set("If-None-Match", cached.etag);
    if (auth.kind === "token") headers.set("Authorization", `Bearer ${auth.token}`);

    const response = await this.fetchWithTimeout(`${GITHUB_API_BASE_URL}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body })
    }, request.signal, method === "POST" ? this.mutationTimeoutMs : this.requestTimeoutMs);

    if (response.status === 401) {
      this.invalidateAuthentication(generation);
      if (method === "GET" && !authRetried) {
        const refreshed = await this.resolveAuthStrategy();
        return this.protectToken(this.performRequest(repository, path, request, refreshed, this.authGeneration, true), refreshed);
      }
    }

    if (response.status === 304) {
      if (!cached) throw new Error("GitHub returned 304 without a cached response.");
      cached.storedAt = this.now();
      this.touchCacheEntry(key, cached);
      return { payload: cached.payload as T, status: 304, headers: new Headers(cached.headers), source: "not-modified" };
    }

    const payload = await parseJson(response);
    if (!response.ok) throw new Error(createGitHubRequestError(repository, response.status, payload));

    if (cacheEnabled) {
      const etag = response.headers.get("etag");
      if (etag) this.storeCacheEntry(key, repository, etag, payload, response.headers, bodySize(payload));
    }
    return { payload: payload as T, status: response.status, headers: new Headers(response.headers), source: "network" };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("GitHub REST request timed out.")), timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private invalidateAuthentication(generation: number): void {
    if (generation !== this.authGeneration) return;
    this.authStrategy = undefined;
    this.authGeneration += 1;
    this.responseCache.clear();
  }

  private createKey(generation: number, repository: GitHubRepository, method: string, path: string): string {
    return `${generation}:${normalizeRepository(repository)}:${method}:${path}`;
  }

  private getCacheEntry(key: string): CacheEntry | undefined {
    const entry = this.responseCache.get(key);
    if (entry) this.touchCacheEntry(key, entry);
    return entry;
  }

  private touchCacheEntry(key: string, entry: CacheEntry): void {
    this.responseCache.delete(key);
    this.responseCache.set(key, entry);
  }

  private storeCacheEntry(key: string, repository: GitHubRepository, etag: string, payload: unknown, headers: Headers, size: number): void {
    if (this.maxCacheEntries <= 0 || size > this.maxCachePayloadBytes) return;
    this.responseCache.delete(key);
    this.responseCache.set(key, {
      repository: normalizeRepository(repository), etag, payload, storedAt: this.now(), headers: new Headers(headers), size
    });
    while (this.responseCache.size > this.maxCacheEntries) {
      const oldest = this.responseCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.responseCache.delete(oldest);
    }
  }
}

function validatePath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new Error("GitHub API requests require a relative path beginning with '/'.");
  }
}

function normalizeRepository(repository: GitHubRepository): string {
  return repository.fullName.trim().toLowerCase();
}

function bodySize(payload: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(payload)); } catch { return Number.POSITIVE_INFINITY; }
}

async function parseJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new Error(`GitHub returned invalid JSON with status ${response.status}.`); }
}

function createGitHubRequestError(repository: GitHubRepository, status: number, rawPayload: unknown): string {
  const payload = isErrorPayload(rawPayload) ? rawPayload : {};
  if (status === 404) {
    return `GitHub could not find ${repository.fullName}. If this repository is private, authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then refresh.`;
  }
  if (status === 401 || status === 403) {
    return `${payload.message?.trim() || `GitHub rejected the request for ${repository.fullName} with status ${status}.`} Authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then try again.`;
  }
  const details = (payload.errors ?? []).map((error) => (typeof error === "string" ? error : error.message ?? "").trim()).filter(Boolean).join(" ");
  return [payload.message?.trim(), details].filter(Boolean).join(" ") || `GitHub request for ${repository.fullName} failed with status ${status}.`;
}

function isErrorPayload(payload: unknown): payload is GitHubApiErrorResponse {
  return typeof payload === "object" && payload !== null;
}
