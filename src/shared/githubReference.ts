import type { GitHubReference, GitHubRepository } from "./types";

export const GITHUB_REFERENCE_INPUT_LIMIT = 32 * 1024;
export const GITHUB_REFERENCE_MATCH_LIMIT = 20;

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?";
const REPOSITORY = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?";
const REFERENCE_PATTERN = new RegExp(
  `https?:\\/\\/github\\.com\\/(${OWNER})\\/(${REPOSITORY})\\/(issues|pull)\\/(\\d+)|(${OWNER})\\/(${REPOSITORY})#(\\d+)|GH-(\\d+)|#(\\d+)`,
  "gi"
);

export function parseGitHubReferences(text: string, currentRepository: GitHubRepository | null): GitHubReference[] {
  const input = text.slice(0, GITHUB_REFERENCE_INPUT_LIMIT);
  const results: GitHubReference[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(REFERENCE_PATTERN)) {
    if (results.length >= GITHUB_REFERENCE_MATCH_LIMIT) break;
    const raw = match[0];
    const start = match.index ?? 0;
    if (!hasTokenBoundaries(input, start, raw.length, raw.startsWith("http"), raw.includes("/"))) continue;

    const owner = match[1] ?? match[5] ?? currentRepository?.owner ?? null;
    const repository = match[2] ?? match[6] ?? currentRepository?.name ?? null;
    const numberText = match[4] ?? match[7] ?? match[8] ?? match[9] ?? "";
    const number = Number(numberText);
    if (!owner || !repository || !isValidSegment(owner, true) || !isValidSegment(repository, false)
      || !Number.isSafeInteger(number) || number <= 0) continue;

    const explicitKind = match[3]?.toLowerCase();
    const kind = explicitKind === "pull" ? "pull-request" : explicitKind === "issues" ? "issue" : "issue-or-pull-request";
    const key = `${owner.toLowerCase()}/${repository.toLowerCase()}#${number}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const explicitRepository = Boolean(match[1] || match[5]);
    const displayText = explicitRepository && `${owner}/${repository}`.toLowerCase() !== currentRepository?.fullName.toLowerCase()
      ? `${owner}/${repository}#${number}`
      : `#${number}`;
    results.push(createGitHubReferenceTarget({
      kind, owner, repository, number, displayText, targetUrl: null,
      resolution: "exact"
    }, currentRepository));
  }
  return results;
}

export function createGitHubReferenceTarget(reference: GitHubReference, _currentRepository: GitHubRepository | null): GitHubReference {
  if (!reference.owner || !reference.repository || !isValidSegment(reference.owner, true)
    || !isValidSegment(reference.repository, false) || !Number.isSafeInteger(reference.number) || reference.number <= 0) {
    return { ...reference, targetUrl: null, resolution: "unsupported" };
  }
  const path = reference.kind === "pull-request" ? "pull" : "issues";
  return {
    ...reference,
    targetUrl: `https://github.com/${reference.owner}/${reference.repository}/${path}/${reference.number}`,
    resolution: "exact"
  };
}

function hasTokenBoundaries(input: string, start: number, length: number, isUrl: boolean, hasRepository: boolean): boolean {
  const before = start > 0 ? input[start - 1] : "";
  const after = input[start + length] ?? "";
  if (before && (/[A-Za-z0-9_@]/.test(before) || (!isUrl && before === "/"))) return false;
  if (after && /[A-Za-z0-9_]/.test(after)) return false;
  if (!hasRepository && before === ".") return false;
  return true;
}

function isValidSegment(value: string, owner: boolean): boolean {
  if (owner) return new RegExp(`^${OWNER}$`).test(value) && !value.includes("--");
  return new RegExp(`^${REPOSITORY}$`).test(value) && value !== "." && value !== "..";
}
