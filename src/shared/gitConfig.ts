export const GIT_CONFIG_KEYS = [
  "commit.gpgsign", "gpg.format", "user.signingkey", "pull.rebase", "pull.ff",
  "core.autocrlf", "core.safecrlf", "fetch.prune", "push.autosetupremote",
  "init.defaultbranch", "core.excludesfile", "rerere.enabled"
] as const;

export type GitConfigKey = typeof GIT_CONFIG_KEYS[number];
export type GitConfigScope = "global" | "repository";
export type GitConfigValues = Record<GitConfigKey, string | null>;

export interface GitConfigEntry {
  value: string;
  origin: string;
  scope: string;
}

export interface GitConfigRequest {
  repoPath: string;
  scope: GitConfigScope;
}

export interface GitConfigSettings extends GitConfigRequest {
  filePath: string;
  revision: string;
  values: GitConfigValues;
  effective: Partial<Record<GitConfigKey, GitConfigEntry>>;
  inherited: Partial<Record<GitConfigKey, GitConfigEntry>>;
  branchRebase: GitConfigEntry | null;
}

export interface GitConfigSaveRequest extends GitConfigRequest {
  revision: string;
  changes: Partial<GitConfigValues>;
}

export type GitSigningTestRequest = GitConfigRequest;

export interface GitSigningTestResult {
  ok: boolean;
  message: string;
}

export function emptyGitConfigValues(): GitConfigValues {
  return Object.fromEntries(GIT_CONFIG_KEYS.map((key) => [key, null])) as GitConfigValues;
}

export function changedGitConfigValues(saved: GitConfigValues, draft: GitConfigValues): Partial<GitConfigValues> {
  return Object.fromEntries(GIT_CONFIG_KEYS.filter((key) => saved[key] !== draft[key]).map((key) => [key, draft[key]]));
}

export interface GitIgnoreFile {
  filePath: string;
  contents: string;
  revision: string;
}

export interface GitIgnoreFileSaveRequest extends GitConfigRequest, GitIgnoreFile {}
