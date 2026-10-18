import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { RepoTrustService } from "./repoTrustService";

async function withTempDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-repo-trust-test-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  }
}

describe("RepoTrustService", () => {
  it("returns false when no trust file exists", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoTrustService(dir);

      await expect(service.isTrusted(path.join(dir, "Repo"))).resolves.toBe(false);
    });
  });

  it("falls back to no trusted repositories for corrupt storage", async () => {
    await withTempDir(async (dir) => {
      const trustPath = path.join(dir, "repo-trust.json");
      await fs.writeFile(trustPath, "{bad json", "utf8");

      const service = new RepoTrustService(dir);

      await expect(service.isTrusted(path.join(dir, "Repo"))).resolves.toBe(false);
    });
  });

  it("normalizes absolute paths and persists trust decisions", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      const service = new RepoTrustService(dir);

      await expect(service.trustRepo(`${repoPath}${path.sep}`)).resolves.toBe(true);
      await expect(service.isTrusted(repoPath)).resolves.toBe(true);

      const nextService = new RepoTrustService(dir);
      await expect(nextService.isTrusted(repoPath)).resolves.toBe(true);
    });
  });

  it("ignores relative and blank repository paths", async () => {
    await withTempDir(async (dir) => {
      const service = new RepoTrustService(dir);

      await expect(service.trustRepo("relative-repo")).resolves.toBe(false);
      await expect(service.trustRepo(" ")).resolves.toBe(false);
      await expect(service.isTrusted("relative-repo")).resolves.toBe(false);
    });
  });

  it("dedupes trusted repositories by the platform path key", async () => {
    await withTempDir(async (dir) => {
      const repoPath = path.join(dir, "Repo");
      const duplicatePath = process.platform === "win32" ? repoPath.toLocaleUpperCase() : repoPath;
      const service = new RepoTrustService(dir);

      await service.trustRepo(repoPath);
      await service.trustRepo(duplicatePath);

      const stored = JSON.parse(await fs.readFile(path.join(dir, "repo-trust.json"), "utf8")) as {
        trustedRepos: string[];
      };
      expect(stored.trustedRepos).toHaveLength(1);
      await expect(service.isTrusted(duplicatePath)).resolves.toBe(true);
    });
  });

  it("reuses the parsed trust list but honors edits made outside this service", async () => {
    await withTempDir(async (dir) => {
      const trustPath = path.join(dir, "repo-trust.json");
      const first = path.join(dir, "First");
      const second = path.join(dir, "Second");
      const service = new RepoTrustService(dir);
      await service.trustRepo(first);
      await expect(service.isTrusted(first)).resolves.toBe(true);
      await expect(service.isTrusted(second)).resolves.toBe(false);

      // Another instance adds a repository, then the user revokes the first.
      await fs.writeFile(trustPath, `${JSON.stringify({ trustedRepos: [first, second] })}\n`, "utf8");
      await expect(service.isTrusted(second)).resolves.toBe(true);
      await fs.writeFile(trustPath, `${JSON.stringify({ trustedRepos: [second] })}\n`, "utf8");
      await expect(service.isTrusted(first)).resolves.toBe(false);
      await fs.rm(trustPath);
      await expect(service.isTrusted(second)).resolves.toBe(false);
    });
  });
});
