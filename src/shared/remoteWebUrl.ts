import type { GitRemote } from "./types";

export function getRepositoryWebUrl(remotes: GitRemote[]): string | null {
  const remote = remotes.find((candidate) => candidate.name === "origin" && candidate.direction === "fetch")
    ?? remotes.find((candidate) => candidate.name === "origin")
    ?? remotes.find((candidate) => candidate.direction === "fetch")
    ?? remotes[0];

  return remote ? remoteUrlToWebUrl(remote.url) : null;
}

export function remoteUrlToWebUrl(remoteUrl: string): string | null {
  const trimmedUrl = remoteUrl.trim();
  if (!trimmedUrl) return null;

  const scpLikeMatch = /^(?:[^@\s/:]+)@(?<host>[^\s/:]+):(?<path>.+)$/.exec(trimmedUrl);
  if (scpLikeMatch?.groups?.host && scpLikeMatch.groups.path) {
    return buildWebUrl(scpLikeMatch.groups.host, scpLikeMatch.groups.path);
  }

  try {
    const url = new URL(trimmedUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      url.pathname = trimRepositoryPath(url.pathname);
      return url.pathname === "/" ? null : url.toString().replace(/\/$/, "");
    }

    if (["ssh:", "git:", "git+ssh:"].includes(url.protocol)) {
      return buildWebUrl(url.hostname, url.pathname);
    }
  } catch {
    return null;
  }

  return null;
}

function buildWebUrl(host: string, path: string): string | null {
  const repositoryPath = trimRepositoryPath(path);
  if (!host || repositoryPath === "/") return null;

  try {
    return new URL(repositoryPath, `https://${host}`).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function trimRepositoryPath(path: string): string {
  const withoutSuffix = path.replace(/\/+$/, "").replace(/\.git$/i, "");
  return `/${withoutSuffix.replace(/^\/+/, "")}`;
}
