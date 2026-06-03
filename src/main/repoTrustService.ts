import fs from "node:fs/promises";
import path from "node:path";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

interface StoredRepoTrust {
  trustedRepos?: unknown;
}

export class RepoTrustService {
  private readonly trustPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.trustPath = path.join(userDataPath, "repo-trust.json");
  }

  async isTrusted(repoPath: string): Promise<boolean> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return false;
    }

    const trustedRepos = await this.readTrustedRepos();
    const key = getRepoPathKey(normalizedPath);
    return trustedRepos.some((trustedRepo) => getRepoPathKey(trustedRepo) === key);
  }

  async trustRepo(repoPath: string): Promise<boolean> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return false;
    }

    return this.enqueueMutation(async () => {
      const trustedRepos = await this.readTrustedRepos();
      const key = getRepoPathKey(normalizedPath);
      const next = trustedRepos.some((trustedRepo) => getRepoPathKey(trustedRepo) === key)
        ? trustedRepos
        : [
            normalizedPath,
            ...trustedRepos
          ];

      await this.writeTrustedRepos(next);
      return true;
    });
  }

  private async readTrustedRepos(): Promise<string[]> {
    try {
      const text = await fs.readFile(this.trustPath, "utf8");
      const parsed = JSON.parse(text) as StoredRepoTrust;
      const values = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray(parsed.trustedRepos)
          ? parsed.trustedRepos
          : [];

      return dedupeTrustedRepos(values.flatMap((value) => {
        const normalizedPath = typeof value === "string" ? normalizeRepoPath(value) : null;
        return normalizedPath ? [
          normalizedPath
        ] : [];
      }));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }

      if (error instanceof SyntaxError) {
        return [];
      }

      throw error;
    }
  }

  private async writeTrustedRepos(trustedRepos: string[]): Promise<void> {
    await fs.mkdir(path.dirname(this.trustPath), {
      recursive: true
    });
    await fs.writeFile(this.trustPath, `${JSON.stringify({ trustedRepos }, null, 2)}\n`, "utf8");
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }
}

function dedupeTrustedRepos(trustedRepos: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const trustedRepo of trustedRepos) {
    const key = getRepoPathKey(trustedRepo);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trustedRepo);
  }

  return deduped;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
