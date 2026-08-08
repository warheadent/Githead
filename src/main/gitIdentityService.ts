import { Effect } from "effect";
import type {
  GitIdentitySaveRequest,
  GitIdentityScope,
  GitIdentitySettings,
  GitIdentityValue
} from "../shared/types";
import type { ProcessRunner } from "./processRunner";
import { runEffect } from "../shared/effectRuntime";
import { runProcessEffect } from "./processEffect";

const emptyIdentity: GitIdentityValue = {
  name: "",
  email: ""
};

export class GitIdentityService {
  constructor(private readonly runner: ProcessRunner) {}

  async getIdentity(repoPath: string): Promise<GitIdentitySettings> {
    const [repository, global] = await runEffect(Effect.all([
      repoPath.trim()
        ? this.readGitIdentityEffect(repoPath, "repository")
        : Effect.succeed(emptyIdentity),
      this.readGitIdentityEffect("", "global")
    ], { concurrency: "unbounded" }));
    const repositoryOverrideEnabled = Boolean(
      sanitizeText(repository.name) || sanitizeText(repository.email)
    );

    return {
      scope: repositoryOverrideEnabled ? "repository" : "global",
      repositoryOverrideEnabled,
      name: sanitizeText(repository.name) || sanitizeText(global.name),
      email: sanitizeText(repository.email) || sanitizeText(global.email),
      repository,
      global
    };
  }

  async saveIdentity(request: GitIdentitySaveRequest): Promise<GitIdentitySettings> {
    if (request.scope === "repository" && request.enabled === false) {
      if (!request.repoPath.trim()) {
        throw new Error("Select a repository before removing repository identity.");
      }
      await this.clearGitConfig(request.repoPath, "user.name");
      await this.clearGitConfig(request.repoPath, "user.email");
      return this.getIdentity(request.repoPath);
    }

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

    return this.getIdentity(request.repoPath);
  }

  private readGitIdentityEffect(
    repoPath: string,
    scope: GitIdentityScope
  ): Effect.Effect<GitIdentityValue, unknown> {
    return Effect.all([
      this.readGitConfigEffect(repoPath, scope, "user.name"),
      this.readGitConfigEffect(repoPath, scope, "user.email")
    ], { concurrency: "unbounded" }).pipe(
      Effect.map(([name, email]) => ({ name, email }))
    );
  }

  private readGitConfigEffect(
    repoPath: string,
    scope: GitIdentityScope,
    key: string
  ): Effect.Effect<string, unknown> {
    return runProcessEffect(this.runner, "git", createGitConfigArgs(repoPath, scope, [
      "--get",
      key
    ])).pipe(
      Effect.map((result) => result.exitCode === 0 ? sanitizeText(result.stdout) : "")
    );
  }

  private async writeGitConfig(repoPath: string, scope: GitIdentityScope, key: string, value: string): Promise<void> {
    const result = await runEffect(runProcessEffect(this.runner, "git", createGitConfigArgs(repoPath, scope, [
      key,
      value
    ])));

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || `Unable to save ${key}.`);
    }
  }

  private async clearGitConfig(repoPath: string, key: string): Promise<void> {
    const result = await runEffect(runProcessEffect(this.runner, "git", createGitConfigArgs(repoPath, "repository", [
      "--unset-all",
      key
    ])));
    if (result.exitCode !== 0 && (result.stderr.trim() || result.error)) {
      throw new Error(result.stderr.trim() || result.error || `Unable to clear ${key}.`);
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
