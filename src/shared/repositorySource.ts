import { parseGitHubRemoteUrl } from "./githubRemote";
import type { GitHubRepository } from "./types";

export interface RepositorySource {
  kind: "git" | "lore" | "local";
  source: string;
  name: string;
  label: string;
  github: GitHubRepository | null;
  branchName: string;
  /** GitHub web links can contain both a slash-delimited ref and a file path. */
  refPath: string;
}

export function isLoreSource(source: string): boolean {
  return source.trim().toLowerCase().startsWith("lore://");
}

/** Shared by the renderer and clipboard IPC. Unrecognized clipboard text never crosses IPC. */
export function parseRepositorySource(input: string, options: { fromClipboard?: boolean } = {}): RepositorySource | null {
  const text = input.trim().replace(/^"(.*)"$/, "$1");
  if (!text || text.length > 4096 || hasControlCharacters(text)) return null;
  const local = /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/(?!\/)|\.{1,2}[\\/]|~[\\/])/i.test(text);
  if (local) return sourceResult("local", text, inferCloneDirectoryName(text));
  if (/\s/.test(text)) return null;

  const shorthand = parseGitHubRemoteUrl(`https://github.com/${text}`);
  if (shorthand && !text.includes(":") && !text.includes("@")) {
    return githubSource(shorthand);
  }
  const scp = /^(?:[\w.-]+@)?([\w.-]+):([^\s:]+\/[^\s:]+)$/.exec(text);
  if (scp && !text.includes("://")) {
    const github = parseGitHubRemoteUrl(text);
    return github ? { ...githubSource(github), source: text } : sourceResult("git", text, inferCloneDirectoryName(text));
  }
  try {
    const url = new URL(text);
    if (url.protocol === "file:") {
      const pathname = decodeURIComponent(url.pathname);
      if (hasControlCharacters(pathname)) return null;
      const localPath = url.hostname ? `//${url.hostname}${pathname}` : pathname.replace(/^\/([a-z]:\/)/i, "$1");
      return sourceResult("local", localPath, inferCloneDirectoryName(localPath));
    }
    if (!url.hostname || url.password || (url.username && url.protocol !== "ssh:")) return null;
    if (!["https:", "http:", "ssh:", "git:", "lore:"].includes(url.protocol)) return null;
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (!segments.length || segments.some(hasControlCharacters)) return null;
    if (isLoreSource(text)) return sourceResult("lore", text, segments.at(-1) ?? "");
    if (url.hostname.toLowerCase() === "github.com") {
      if (["orgs", "users", "settings", "search", "topics", "collections", "marketplace", "sponsors", "features"].includes(segments[0]?.toLowerCase() ?? "")) return null;
      const github = parseGitHubRemoteUrl(`https://github.com/${segments.slice(0, 2).join("/")}`);
      if (!github) return null;
      const result = githubSource(github);
      if (segments[2] === "tree" || segments[2] === "blob" || segments[2] === "raw") {
        result.branchName = segments[3] ?? "";
        result.refPath = segments.slice(3).join("/");
      }
      if (url.protocol === "ssh:" && segments.length === 2) result.source = text;
      return result;
    }
    // An arbitrary web link is valid input for a manual Git access check, but
    // must not expose unrelated clipboard contents as a repository suggestion.
    const knownForge = ["gitlab.com", "bitbucket.org", "codeberg.org", "sr.ht", "git.sr.ht"].includes(url.hostname.toLowerCase());
    const explicitGitPath = /\.git\/?$/i.test(url.pathname) || /\/_git\/[^/]+\/?$/i.test(url.pathname);
    if (options.fromClipboard && ["http:", "https:"].includes(url.protocol) && !knownForge && !explicitGitPath) return null;
    return sourceResult("git", text, inferCloneDirectoryName(url.pathname));
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}

function sourceResult(kind: RepositorySource["kind"], source: string, name: string): RepositorySource {
  return { kind, source, name, label: kind === "local" ? source : name, github: null, branchName: "", refPath: "" };
}

function githubSource(github: GitHubRepository): RepositorySource {
  return { ...sourceResult("git", `${github.webUrl}.git`, github.name), label: github.fullName, github };
}

export function resolveRepositorySourceBranch(refPath: string, branches: readonly string[], fallback: string): string {
  return branches.filter((branch) => refPath === branch || refPath.startsWith(`${branch}/`))
    .sort((a, b) => b.length - a.length)[0] ?? fallback;
}

export function inferCloneDirectoryName(source: string): string {
  const trimmed = source.trim().replace(/[\\/]+$/, "").split(/[?#]/, 1)[0] ?? "";
  return /([^/:\\]+?)(?:\.git)?$/.exec(trimmed)?.[1] ?? "";
}
