import fs from "node:fs/promises";
import path from "node:path";
import type {
  GitIdentitySaveRequest,
  GitIdentityScope,
  GitIdentitySettings,
  GitIdentityValue
} from "../shared/types";
import type { ProcessRunner } from "./processRunner";

interface StoredGitIdentitySettings extends Partial<GitIdentityValue> {
  scope?: GitIdentityScope;
}

const emptyIdentity: GitIdentityValue = {
  name: "",
  email: ""
};

export class GitIdentityService {
  private readonly settingsPath: string;

  constructor(
    userDataPath: string,
    private readonly runner: ProcessRunner
  ) {
    this.settingsPath = path.join(userDataPath, "git-identity-settings.json");
  }

  async getIdentity(repoPath: string): Promise<GitIdentitySettings> {
    const [stored, repository, global] = await Promise.all([
      this.readStoredSettings(),
      repoPath.trim() ? this.readGitIdentity(repoPath, "repository") : Promise.resolve(emptyIdentity),
      this.readGitIdentity("", "global")
    ]);
    const scope = stored.scope === "global" ? "global" : "repository";
    const scopedIdentity = scope === "global" ? global : repository;
    const fallbackIdentity = scope === "global" ? repository : global;

    return {
      scope,
      name: sanitizeText(scopedIdentity.name) || sanitizeText(stored.name) || sanitizeText(fallbackIdentity.name),
      email: sanitizeText(scopedIdentity.email) || sanitizeText(stored.email) || sanitizeText(fallbackIdentity.email),
      repository,
      global
    };
  }

  async saveIdentity(request: GitIdentitySaveRequest): Promise<GitIdentitySettings> {
    const name = sanitizeText(request.name);
    const email = sanitizeText(request.email);

    if (!name) {
      throw new Error("Enter your Git author name.");
    }

    if (!isValidEmail(email)) {
      throw new Error("Enter a valid Git author email.");
    }

    if (request.scope !== "repository" && request.scope !== "global") {
      throw new Error("Choose where to save your Git identity.");
    }

    if (request.scope === "repository" && !request.repoPath.trim()) {
      throw new Error("Select a repository before saving repository identity.");
    }

    await this.writeGitConfig(request.repoPath, request.scope, "user.name", name);
    await this.writeGitConfig(request.repoPath, request.scope, "user.email", email);

    await fs.mkdir(path.dirname(this.settingsPath), {
      recursive: true
    });
    await fs.writeFile(this.settingsPath, `${JSON.stringify({
      scope: request.scope,
      name,
      email
    } satisfies StoredGitIdentitySettings, null, 2)}\n`, "utf8");

    return this.getIdentity(request.repoPath);
  }

  private async readGitIdentity(repoPath: string, scope: GitIdentityScope): Promise<GitIdentityValue> {
    const [name, email] = await Promise.all([
      this.readGitConfig(repoPath, scope, "user.name"),
      this.readGitConfig(repoPath, scope, "user.email")
    ]);

    return {
      name,
      email
    };
  }

  private async readGitConfig(repoPath: string, scope: GitIdentityScope, key: string): Promise<string> {
    const result = await this.runner.run("git", createGitConfigArgs(repoPath, scope, [
      "--get",
      key
    ]));

    return result.exitCode === 0 ? sanitizeText(result.stdout) : "";
  }

  private async writeGitConfig(repoPath: string, scope: GitIdentityScope, key: string, value: string): Promise<void> {
    const result = await this.runner.run("git", createGitConfigArgs(repoPath, scope, [
      key,
      value
    ]));

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || `Unable to save ${key}.`);
    }
  }

  private async readStoredSettings(): Promise<StoredGitIdentitySettings> {
    try {
      const text = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(text) as StoredGitIdentitySettings;

      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }
}

function createGitConfigArgs(repoPath: string, scope: GitIdentityScope, args: string[]): string[] {
  if (scope === "global") {
    return [
      "config",
      "--global",
      ...args
    ];
  }

  return [
    "-C",
    repoPath,
    "config",
    ...args
  ];
}

function sanitizeText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
