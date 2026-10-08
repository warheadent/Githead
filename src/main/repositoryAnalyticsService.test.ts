import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { NodeProcessRunner, type ProcessRunner, type ProcessRunOptions } from "./processRunner";
import { fileExtension, RepositoryAnalyticsService } from "./repositoryAnalyticsService";

class RecordingRunner implements ProcessRunner {
  readonly commands: string[][] = [];
  private readonly delegate = new NodeProcessRunner();

  run(command: string, args: string[], options?: ProcessRunOptions) {
    this.commands.push(args);
    return this.delegate.run(command, args, options);
  }

  runBinary(command: string, args: string[], options: ProcessRunOptions & { maxBytes: number }) {
    this.commands.push(args);
    return this.delegate.runBinary(command, args, options);
  }

  logCommands(): string[][] {
    return this.commands.filter((args) => args.includes("log"));
  }

  revisionLists(): string[][] {
    return this.commands.filter((args) => args.includes("rev-list") && !args.includes("--count"));
  }
}

async function withRepository(callback: (repo: string, git: (...args: string[]) => string, cacheDirectory: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "githead-analytics-service-"));
  const repo = path.join(root, "repo");
  await fs.mkdir(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
  });
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Githead Test");
    git("config", "user.email", "githead@example.test");
    git("config", "core.autocrlf", "false");
    await callback(repo, git, path.join(root, "cache"));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
}

const pointer = (size: number) => `version https://git-lfs.github.com/spec/v1\noid sha256:${"e".repeat(64)}\nsize ${size}\n`;

describe("RepositoryAnalyticsService with real Git", () => {
  it("skips unchanged inputs and updates storage without rebuilding history or branch drift", async () => {
    await withRepository(async (repo, git) => {
      await fs.writeFile(path.join(repo, "a.txt"), "one\n");
      git("add", ".");
      git("commit", "-qm", "First");
      const runner = new RecordingRunner();
      const service = new RepositoryAnalyticsService(runner);
      const query = { repoPath: repo, excludePaths: false, excludedPathPatterns: [] };
      const first = await service.getAnalytics(query);
      runner.commands.length = 0;
      await fs.writeFile(path.join(repo, ".git", "FETCH_HEAD"), "background fetch\n");
      await fs.mkdir(path.join(repo, ".git", "lfs", "tmp"), { recursive: true });
      await fs.writeFile(path.join(repo, ".git", "lfs", "tmp", "probe"), "temporary\n");
      const progress: string[] = [];
      expect(await service.getAnalytics({ ...query, knownInputKey: first.inputKey }, (event) => progress.push(event.phase))).toBeNull();
      expect(progress).toEqual([]);
      expect(runner.logCommands()).toHaveLength(0);
      expect(runner.commands.some((args) => args.some((arg) => arg.includes("ahead-behind")))).toBe(false);

      await fs.writeFile(path.join(repo, "untracked.txt"), "loose object\n");
      git("hash-object", "-w", "untracked.txt");
      const changed = await service.getAnalytics({ ...query, knownInputKey: first.inputKey });
      expect(changed?.assets.packedBytes).toBeGreaterThan(first.assets.packedBytes!);
      expect(changed?.ranges).toBe(first.ranges);
      expect(changed?.branches).toBe(first.branches);
      expect(progress).toEqual([]);
    });
  });

  it("detects refs, branch selection, mailmap, filters, and day rollover", async () => {
    await withRepository(async (repo, git, cacheDirectory) => {
      await fs.writeFile(path.join(repo, "a.txt"), "one\n");
      git("add", ".");
      git("commit", "-qm", "First");
      let now = new Date(2026, 9, 8, 12).getTime();
      const runner = new RecordingRunner();
      const service = new RepositoryAnalyticsService(runner, { cacheDirectory, now: () => now });
      const query = { repoPath: repo, excludePaths: false, excludedPathPatterns: [] };
      let previous = await service.getAnalytics(query);
      git("branch", "feature");
      let next = await service.getAnalytics({ ...query, knownInputKey: previous.inputKey });
      expect(next?.branches.branches.some((branch) => branch.name === "feature")).toBe(true);
      expect(next?.ranges).toBe(previous.ranges);
      previous = next!;
      git("switch", "-q", "feature");
      next = await service.getAnalytics({ ...query, knownInputKey: previous.inputKey });
      expect(next?.branch).toBe("feature");
      previous = next!;
      git("tag", "v1");
      next = await service.getAnalytics({ ...query, knownInputKey: previous.inputKey });
      expect(next?.tags[0]?.name).toBe("v1");
      previous = next!;
      await fs.writeFile(path.join(repo, ".mailmap"), "Mapped Author <mapped@example.test> <githead@example.test>\n");
      next = await service.getAnalytics({ ...query, knownInputKey: previous.inputKey });
      expect(next?.people[0]?.name).toBe("Mapped Author");
      expect(runner.logCommands()).toHaveLength(1);
      previous = next!;
      next = await service.getAnalytics({ ...query, excludePaths: true, excludedPathPatterns: ["*.txt"], knownInputKey: previous.inputKey });
      expect(next?.ranges.all.hotspots).toEqual([]);
      previous = next!;
      now += 86_400_000;
      next = await service.getAnalytics({ ...query, excludePaths: true, excludedPathPatterns: ["*.txt"], knownInputKey: previous.inputKey });
      expect(next?.generatedAt).toBe(now / 1000);
      expect(runner.logCommands()).toHaveLength(1);

      await fs.writeFile(path.join(repo, ".mailmap"), "New Mapping <new@example.test> <githead@example.test>\n");
      const restartedRunner = new RecordingRunner();
      const restarted = new RepositoryAnalyticsService(restartedRunner, { cacheDirectory });
      expect((await restarted.getAnalytics(query)).people[0]?.name).toBe("New Mapping");
      expect(restartedRunner.logCommands()).toHaveLength(0);
    });
  });

  it("reads history once and then only new commits, across service instances", async () => {
    await withRepository(async (repo, git, cacheDirectory) => {
      await fs.writeFile(path.join(repo, "a.txt"), "one\n");
      git("add", ".");
      git("commit", "-qm", "First");
      const firstHead = git("rev-parse", "HEAD").trim();

      const runner = new RecordingRunner();
      const service = new RepositoryAnalyticsService(runner, { cacheDirectory });
      const progress: string[] = [];
      const first = await service.getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] }, (event) => progress.push(event.phase));
      expect(first).toMatchObject({ headHash: firstHead, branch: "main", history: { commits: 1 } });
      expect(progress).toEqual(expect.arrayContaining(["history", "assets", "branches"]));
      expect(runner.logCommands()).toHaveLength(1);

      await service.getAnalytics({ repoPath: repo, excludePaths: true, excludedPathPatterns: ["*.txt"] });
      expect(runner.logCommands()).toHaveLength(1);

      await fs.writeFile(path.join(repo, "a.txt"), "one\ntwo\n");
      git("commit", "-qam", "Second");
      const second = await service.getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] });
      expect(second.history.commits).toBe(2);
      expect(runner.revisionLists().at(-1)).toContain(`^${firstHead}`);
      expect(runner.logCommands()).toHaveLength(2);

      const restarted = new RecordingRunner();
      const reloaded = await new RepositoryAnalyticsService(restarted, { cacheDirectory }).getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] });
      expect(reloaded.history.commits).toBe(2);
      expect(reloaded.ranges.all.hotspots[0]).toMatchObject({ path: "a.txt", commits: 2 });
      expect(restarted.logCommands()).toHaveLength(0);
    });
  }, 30_000);

  it("rereads history after HEAD moves to an unrelated commit", async () => {
    await withRepository(async (repo, git) => {
      await fs.writeFile(path.join(repo, "a.txt"), "one\n");
      git("add", ".");
      git("commit", "-qm", "First");
      await fs.writeFile(path.join(repo, "a.txt"), "two\n");
      git("commit", "-qam", "Second");
      const runner = new RecordingRunner();
      const service = new RepositoryAnalyticsService(runner);
      expect((await service.getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] })).history.commits).toBe(2);
      git("reset", "-q", "--hard", "HEAD~1");
      expect((await service.getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] })).history.commits).toBe(1);
      expect(runner.revisionLists().at(-1)?.some((arg) => arg.startsWith("^"))).toBe(false);
    });
  }, 30_000);

  it("summarizes the tree with LFS sizes and reports branch drift", async () => {
    await withRepository(async (repo, git) => {
      await fs.writeFile(path.join(repo, "Hero.uasset"), pointer(5_000_000));
      await fs.writeFile(path.join(repo, "big.png"), Buffer.alloc(1_200_000, 1));
      await fs.writeFile(path.join(repo, "notes.md"), "hello\n");
      git("add", ".");
      git("commit", "-qm", "Assets");
      git("tag", "v1");
      git("switch", "-q", "-c", "feature");
      await fs.writeFile(path.join(repo, "notes.md"), "hello\nworld\n");
      git("commit", "-qam", "Feature work");
      git("switch", "-q", "main");

      const result = await new RepositoryAnalyticsService(new NodeProcessRunner()).getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] });
      expect(result.assets).toMatchObject({ treeFiles: 3, lfsFiles: 1, lfsBytes: 5_000_000, largeFilesOutsideLfsCount: 1 });
      expect(result.assets.types[0]).toMatchObject({ extension: ".uasset", lfsFiles: 1, lfsBytes: 5_000_000 });
      expect(result.assets.binaryTypesOutsideLfs).toEqual([expect.objectContaining({ extension: ".png", files: 1, example: "big.png" })]);
      expect(result.assets.largeFilesOutsideLfs).toEqual([{ path: "big.png", bytes: 1_200_000 }]);
      expect(result.assets.packedBytes).toBeGreaterThan(0);
      expect(result.tags.map((tag) => tag.name)).toEqual(["v1"]);
      expect(result.branches.base).toBe("main");
      expect(result.branches.branches).toEqual([expect.objectContaining({ name: "feature", remote: false, current: false, ahead: 1, behind: 0 })]);
    });
  }, 30_000);

  it("returns empty analytics for a repository without commits", async () => {
    await withRepository(async (repo) => {
      const result = await new RepositoryAnalyticsService(new NodeProcessRunner()).getAnalytics({ repoPath: repo, excludePaths: false, excludedPathPatterns: [] });
      expect(result).toMatchObject({ headHash: null, history: { commits: 0 }, assets: { treeFiles: 0 }, branches: { branches: [] } });
    });
  }, 30_000);

  it("rejects folders that are not repositories", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "githead-analytics-plain-"));
    try {
      await expect(new RepositoryAnalyticsService(new NodeProcessRunner()).getAnalytics({ repoPath: folder, excludePaths: false, excludedPathPatterns: [] })).rejects.toThrow();
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  });
});

describe("fileExtension", () => {
  it("normalizes extensions and dotfiles", () => {
    expect(fileExtension("Content/Hero.UASSET")).toBe(".uasset");
    expect(fileExtension("dir/.gitattributes")).toBe(".gitattributes");
    expect(fileExtension("Makefile")).toBe("");
  });
});
