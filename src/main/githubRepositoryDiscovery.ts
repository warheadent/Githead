import { setTimeout as delay } from "node:timers/promises";
import { parseRepositorySource } from "../shared/repositorySource";
import type { GitHubCloneDetails, GitHubCloneRepository, GitHubConnectionStatus, GitHubOperationResult, GitHubRepository, GitHubRepositoryDiscovery, GitHubRepositoryDiscoveryRequest } from "../shared/types";
import { GitHubHttpError, type GitHubClient } from "./githubClient";
import { classifyError } from "./githubService";

// requestJson uses this identity only to scope caches and errors, never to build URLs.
const accountScope: GitHubRepository = { owner: "", name: "", fullName: "GitHub repositories", webUrl: "https://github.com" };
const cache = { mode: "conditional", maxAgeMs: 60_000 } as const;

interface ApiRepository {
  name: string;
  owner: { login: string };
  description?: string | null;
  private?: boolean;
  fork?: boolean;
  language?: string | null;
  pushed_at?: string | null;
  default_branch?: string;
  permissions?: { push?: boolean };
  allow_forking?: boolean;
  parent?: { full_name?: string };
  source?: { full_name?: string };
}

interface Installation {
  id?: number;
  account?: { login?: string };
  repository_selection?: string;
  permissions?: { administration?: string; contents?: string };
}

export class GitHubRepositoryDiscoveryService {
  constructor(private readonly client: GitHubClient) {}

  async list(request: GitHubRepositoryDiscoveryRequest, signal: AbortSignal): Promise<GitHubOperationResult<GitHubRepositoryDiscovery>> {
    try {
      const connection = await this.client.getConnectionStatus(null, signal);
      signal.throwIfAborted();
      if (connection.failure) return { ok: false, error: connection.failure };
      const query = request.query?.trim().slice(0, 256) ?? "";
      if (!query && connection.state !== "authenticated") {
        return { ok: true, rateLimit: null, data: { repositories: [], connection, hasMore: false, incomplete: false } };
      }
      const page = Number.isFinite(request.page ?? 1) ? Math.max(1, Math.trunc(request.page ?? 1)) : 1;
      const params = new URLSearchParams({ per_page: "100", page: String(page) });
      if (query) { params.set("q", query); params.set("sort", "updated"); params.set("order", "desc"); }
      else { params.set("sort", "pushed"); params.set("direction", "desc"); }
      const response = await this.client.requestJson<ApiRepository[] | { items: ApiRepository[]; incomplete_results?: boolean }>(
        accountScope, `${query ? "/search/repositories" : "/user/repos"}?${params}`, { cache, signal }
      );
      const payload = response.payload;
      const items = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(items)) throw new Error("GitHub returned an invalid repository list.");
      return { ok: true, rateLimit: null, data: {
        repositories: items.map(mapRepository).sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "")),
        connection,
        hasMore: /rel="next"/.test(response.headers.get("link") ?? ""),
        incomplete: !Array.isArray(payload) && payload.incomplete_results === true
      } };
    } catch (error) { return { ok: false, error: classifyError(error, "rest", false) }; }
  }

  async details(source: string, signal: AbortSignal): Promise<GitHubOperationResult<GitHubCloneDetails>> {
    try {
      const repository = requireGitHubSource(source);
      const [connection, response] = await Promise.all([
        this.client.getConnectionStatus(null, signal),
        this.client.requestJson<ApiRepository>(repository, repositoryPath(repository), { cache, signal })
      ]);
      signal.throwIfAborted();
      const forkDisabledReason = await this.forkDisabledReason(connection, response.payload, response.headers, signal);
      return { ok: true, rateLimit: null, data: { repository: mapRepository(response.payload), forkDisabledReason } };
    } catch (error) { return { ok: false, error: classifyError(error, "rest", false) }; }
  }

  async fork(source: string, branch: string, signal: AbortSignal): Promise<GitHubRepository> {
    const repository = requireGitHubSource(source);
    const details = await this.details(source, signal);
    if (!details.ok) throw new Error(details.error.message);
    if (details.data.forkDisabledReason) throw new Error(details.data.forkDisabledReason);
    signal.throwIfAborted();
    let fork: GitHubCloneRepository;
    try {
      const response = await this.client.requestJson<ApiRepository>(repository, `${repositoryPath(repository)}/forks`, {
        method: "POST", body: { default_branch_only: false }, signal
      });
      fork = mapRepository(response.payload);
      const parent = response.payload.parent?.full_name ?? response.payload.source?.full_name;
      if (parent && parent.toLowerCase() !== repository.fullName.toLowerCase() && response.payload.source?.full_name?.toLowerCase() !== repository.fullName.toLowerCase()) {
        throw new Error("GitHub returned a fork of a different repository.");
      }
    } catch (error) {
      const failure = classifyError(error, "rest", true);
      throw new Error(`${failure.message}${failure.outcomeUnknown ? " The fork may have been created on GitHub. Check your account before retrying." : ""}`);
    }
    // Fork creation is asynchronous. Wait for the requested ref before starting Git.
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        signal.throwIfAborted();
        try {
          await this.client.requestJson(fork, `${repositoryPath(fork)}/branches/${encodeURIComponent(branch || fork.defaultBranch)}`, { signal });
          return fork;
        } catch (error) {
          if (!(error instanceof GitHubHttpError) || error.status !== 404) throw error;
        }
        await delay(2000, undefined, { signal });
      }
      throw new Error("GitHub has not made the requested branch available yet.");
    } catch (error) {
      throw new Error(`Fork created at ${fork.webUrl}. ${error instanceof Error ? error.message : "Unable to wait for the fork."} You can paste the fork URL to clone it later.`);
    }
  }

  private async forkDisabledReason(connection: GitHubConnectionStatus, repository: ApiRepository, headers: Headers, signal: AbortSignal): Promise<string | null> {
    if (connection.state !== "authenticated") return "Connect GitHub with permission to create repositories to fork this repository.";
    if (repository.allow_forking === false && repository.private) return "This repository does not allow forking.";
    const scopesHeader = headers.get("x-oauth-scopes");
    if (connection.source !== "githubApp") {
      if (scopesHeader !== null) {
        const scopes = scopesHeader.split(",").map((scope) => scope.trim());
        if (!scopes.includes("repo") && (repository.private || !scopes.includes("public_repo"))) {
          return `The active GitHub token needs the ${repository.private ? "repo" : "public_repo or repo"} scope to fork.`;
        }
      }
      return null;
    }
    // GitHub App forks require administration:write, contents:read, source access,
    // and an installation with all-repository access on the destination account.
    try {
      const response = await this.client.requestJson<{ installations: Installation[] }>(accountScope, "/user/installations?per_page=100", { cache, signal });
      const installations = response.payload.installations ?? [];
      const hasPermissions = (item: Installation) => item.permissions?.administration === "write" && ["read", "write"].includes(item.permissions.contents ?? "");
      const destination = installations.some((item) => item.account?.login?.toLowerCase() === connection.accountLogin?.toLowerCase() && item.repository_selection === "all" && hasPermissions(item));
      if (destination) {
        for (const installation of installations) {
          if (installation.account?.login?.toLowerCase() !== repository.owner.login.toLowerCase() || !hasPermissions(installation)) continue;
          if (installation.repository_selection === "all") return null;
          if (!installation.id) continue;
          // Public metadata alone does not prove that this app is installed on
          // the source repository. Check selected-repository installations too.
          for (let page = 1; page <= 10; page++) {
            const access = await this.client.requestJson<{ repositories: ApiRepository[] }>(accountScope,
              `/user/installations/${installation.id}/repositories?per_page=100&page=${page}`, { cache, signal });
            if (access.payload.repositories.some((repo) => repo.owner.login.toLowerCase() === repository.owner.login.toLowerCase() && repo.name.toLowerCase() === repository.name.toLowerCase())) return null;
            if (!/rel="next"/.test(access.headers.get("link") ?? "")) break;
          }
        }
      }
      return "Forking needs Githead App administration write access to the source and all repositories on your account. Use a GitHub token with fork permissions instead.";
    } catch {
      signal.throwIfAborted();
      return "Githead could not verify the GitHub App permissions needed to fork. Reconnect or use a token with fork permissions.";
    }
  }
}

function requireGitHubSource(source: string): GitHubRepository {
  const repository = parseRepositorySource(source)?.github;
  if (!repository) throw new Error("Forking is only available for GitHub repositories.");
  return repository;
}

function repositoryPath(repository: GitHubRepository): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

function mapRepository(repo: ApiRepository): GitHubCloneRepository {
  const parsed = parseRepositorySource(`${repo.owner?.login}/${repo.name}`)?.github;
  if (!parsed) throw new Error("GitHub returned an invalid repository identity.");
  return { ...parsed, description: repo.description ?? "", private: repo.private === true, fork: repo.fork === true,
    language: repo.language ?? null, pushedAt: repo.pushed_at ?? null, defaultBranch: repo.default_branch ?? "",
    canPush: typeof repo.permissions?.push === "boolean" ? repo.permissions.push : null };
}
