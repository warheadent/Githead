import type { GitRemote, GitHubRepository } from "./types";

const GITHUB_HOST = "github.com";

export function getSupportedGitHubOrigin(remotes: GitRemote[]): GitHubRepository | null {
  const origin = remotes.find((remote) => remote.name === "origin" && remote.direction === "fetch")
    ?? remotes.find((remote) => remote.name === "origin");

  return origin ? parseGitHubRemoteUrl(origin.url) : null;
}

export function parseGitHubRemoteUrl(remoteUrl: string): GitHubRepository | null {
  const trimmedUrl = remoteUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const path = parseGitHubRemotePath(trimmedUrl);
  if (!path) {
    return null;
  }

  const [owner = "", rawName = "", ...extra] = path.split("/");
  if (!owner || !rawName || extra.length > 0) {
    return null;
  }

  const name = rawName.replace(/\.git$/i, "");
  if (!isValidGitHubOwner(owner) || !isValidGitHubRepoName(name)) {
    return null;
  }

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    webUrl: `https://${GITHUB_HOST}/${owner}/${name}`
  };
}

function parseGitHubRemotePath(remoteUrl: string): string | null {
  const scpLikeMatch = /^git@github\.com:(?<path>[^:]+)$/i.exec(remoteUrl);
  if (scpLikeMatch?.groups?.path) {
    return trimPath(scpLikeMatch.groups.path);
  }

  try {
    const url = new URL(remoteUrl);
    if (!isGitHubHost(url.hostname)) {
      return null;
    }

    return trimPath(url.pathname);
  } catch {
    return null;
  }
}

function trimPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function isGitHubHost(host: string): boolean {
  return host.toLowerCase() === GITHUB_HOST;
}

function isValidGitHubOwner(owner: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner);
}

function isValidGitHubRepoName(name: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(name);
}
