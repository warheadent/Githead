import fs from "node:fs/promises";
import path from "node:path";
import { getRepoPathKey, normalizeRepoPath } from "./repoPath";

interface StoredRepoTrust {
  trustedRepos?: unknown;
}

interface CachedTrustList {
  signature: string;
  keys: Set<string>;
  trustedRepos: string[];
}

export class RepoTrustService {
  private readonly trustPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();
  /**
   * Parsed trust list, reused while the file's stat signature is unchanged.
   * The stat keeps external edits (another instance, manual revocation)
   * effective without re-reading and parsing the file on every check.
   */
  private cached: CachedTrustList | null = null;

  constructor(userDataPath: string) {
    this.trustPath = path.join(userDataPath, "repo-trust.json");
  }

  async isTrusted(repoPath: string): Promise<boolean> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return false;
    }

    return (await this.readTrustList()).keys.has(getRepoPathKey(normalizedPath));
  }

  async trustRepo(repoPath: string): Promise<boolean> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return false;
    }

    return this.enqueueMutation(async () => {
      const { trustedRepos, keys } = await this.readTrustList();
      const next = keys.has(getRepoPathKey(normalizedPath))
        ? trustedRepos
        : [
            normalizedPath,
            ...trustedRepos
          ];

      this.cached = null;
      await this.writeTrustedRepos(next);
      return true;
    });
  }

  private async readTrustList(): Promise<CachedTrustList> {
    const signature = await this.readTrustSignature();
    if (this.cached && this.cached.signature === signature) return this.cached;
    const trustedRepos = await this.readTrustedRepos();
    // A write between the stat and the read leaves a stale signature, which
    // only causes one extra read on the next check.
    const next = { signature, trustedRepos, keys: new Set(trustedRepos.map(getRepoPathKey)) };
    this.cached = next;
    return next;
  }

  private async readTrustSignature(): Promise<string> {
    try {
      const stat = await fs.stat(this.trustPath);
      return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return "missing";
      throw error;
    }
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
