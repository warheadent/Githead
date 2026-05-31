import fs from "node:fs/promises";
import path from "node:path";

export const MAX_REPO_RECENTS = 8;

export class RepoRecentsService {
  private readonly recentsPath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.recentsPath = path.join(userDataPath, "repo-recents.json");
  }

  async getRecents(): Promise<string[]> {
    return this.readRecents();
  }

  async addRecent(repoPath: string): Promise<string[]> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return this.getRecents();
    }

    return this.enqueueMutation(async () => {
      const recents = await this.readRecents();
      const next = dedupeRecents([
        normalizedPath,
        ...recents
      ]).slice(0, MAX_REPO_RECENTS);

      await this.writeRecents(next);
      return next;
    });
  }

  async removeRecent(repoPath: string): Promise<string[]> {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath) {
      return this.getRecents();
    }

    return this.enqueueMutation(async () => {
      const key = getRepoPathKey(normalizedPath);
      const next = (await this.readRecents()).filter((recent) => getRepoPathKey(recent) !== key);

      await this.writeRecents(next);
      return next;
    });
  }

  private async readRecents(): Promise<string[]> {
    try {
      const text = await fs.readFile(this.recentsPath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return dedupeRecents(parsed.flatMap((value) => {
        const normalizedPath = typeof value === "string" ? normalizeRepoPath(value) : null;
        return normalizedPath ? [
          normalizedPath
        ] : [];
      })).slice(0, MAX_REPO_RECENTS);
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

  private async writeRecents(recents: string[]): Promise<void> {
    await fs.mkdir(path.dirname(this.recentsPath), {
      recursive: true
    });
    await fs.writeFile(this.recentsPath, `${JSON.stringify(recents, null, 2)}\n`, "utf8");
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

function normalizeRepoPath(repoPath: string): string | null {
  const trimmed = repoPath.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedPath = path.normalize(trimmed);
  if (!path.isAbsolute(normalizedPath)) {
    return null;
  }

  const root = path.parse(normalizedPath).root;
  return normalizedPath.length > root.length ? normalizedPath.replace(/[\\/]+$/, "") : normalizedPath;
}

function dedupeRecents(recents: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const recent of recents) {
    const key = getRepoPathKey(recent);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(recent);
  }

  return deduped;
}

function getRepoPathKey(repoPath: string): string {
  return process.platform === "win32" ? repoPath.toLocaleLowerCase() : repoPath;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
