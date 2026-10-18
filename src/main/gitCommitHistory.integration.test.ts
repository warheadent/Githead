import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { CommitHistoryScope, GitCommitGraphRow } from "../shared/types";
import { buildCommitGraphLayout } from "../renderer/commitGraph";
import { applyHistoryPage, historyReadRequest, planHistoryRead, type HistoryRead } from "../renderer/historyPaging";
import { GitService } from "./gitService";
import { NodeProcessRunner } from "./processRunner";

const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };

// Builds a history large enough for several renderer pages: a main line with
// regularly merged topic branches, an octopus merge, unmerged local and
// remote-tracking branches, tags, and commits that share timestamps.
function createHistoryStream(): string {
  const lines: string[] = [];
  let mark = 0;
  let time = 1_600_000_000;
  const commit = (ref: string, message: string, parents: number[], options: { sameTime?: boolean } = {}): number => {
    mark += 1;
    if (!options.sameTime) time += 60;
    lines.push(`commit ${ref}`, `mark :${mark}`, `author Githead Test <githead@example.test> ${time} +0000`, `committer Githead Test <githead@example.test> ${time} +0000`, `data ${Buffer.byteLength(message)}`, message);
    if (parents[0] !== undefined) lines.push(`from :${parents[0]}`);
    for (const parent of parents.slice(1)) lines.push(`merge :${parent}`);
    lines.push(`M 644 inline file-${mark % 7}.txt`, `data ${Buffer.byteLength(String(mark))}`, String(mark), "");
    return mark;
  };
  let main = commit("refs/heads/main", "root", []);
  for (let topic = 0; topic < 60; topic += 1) {
    const base = main;
    let side = base;
    for (let index = 0; index < 4; index += 1) side = commit(`refs/heads/topic-${topic}`, `topic ${topic} ${index}`, [side], { sameTime: index === 2 });
    for (let index = 0; index < 3; index += 1) main = commit("refs/heads/main", `main ${topic} ${index}`, [main]);
    main = commit("refs/heads/main", `merge topic ${topic}`, [main, side]);
    if (topic % 10 === 0) lines.push(`reset refs/tags/v${topic}`, `from :${main}`, "");
  }
  const octopusBase = main;
  const legs = [0, 1, 2].map((leg) => commit(`refs/heads/leg-${leg}`, `leg ${leg}`, [octopusBase], { sameTime: true }));
  main = commit("refs/heads/main", "octopus", [main, ...legs]);
  let unmerged = main;
  for (let index = 0; index < 40; index += 1) unmerged = commit("refs/heads/unmerged", `unmerged ${index}`, [unmerged]);
  let remote = octopusBase;
  for (let index = 0; index < 40; index += 1) remote = commit("refs/remotes/origin/remote-only", `remote ${index}`, [remote]);
  for (let index = 0; index < 20; index += 1) main = commit("refs/heads/main", `tail ${index}`, [main]);
  // A disconnected history only reachable from a tag.
  let orphan = commit("refs/tags/orphan", "orphan root", []);
  for (let index = 0; index < 10; index += 1) orphan = commit("refs/tags/orphan", `orphan ${index}`, [orphan]);
  return `${lines.join("\n")}\n`;
}

describe("commit history pages with real Git", () => {
  let directory = "";
  let repo = "";
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: gitEnv }).trim();
  const service = new GitService(new NodeProcessRunner());

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "githead-history-pages-"));
    repo = path.join(directory, "repo");
    await fs.mkdir(repo);
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Githead Test");
    git("config", "user.email", "githead@example.test");
    execFileSync("git", ["-C", repo, "fast-import", "--quiet"], { input: createHistoryStream(), env: gitEnv });
    git("reset", "-q", "--hard", "main");
  }, 60_000);

  afterAll(async () => {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  });

  const readSingle = async (scope: CommitHistoryScope): Promise<GitCommitGraphRow[]> => {
    const page = await service.getCommitHistoryPage({ repoPath: repo, scope, limit: 100_000 });
    expect(page.tipsChanged).toBe(false);
    return page.rows;
  };

  // Mirrors the renderer: a first page, then load-more pages until the end.
  const readLikeRenderer = async (scope: CommitHistoryScope) => {
    let history: GitCommitGraphRow[] = [];
    let tipsToken: string | null = null;
    let hasMore = true;
    const reads: HistoryRead[] = [];
    while (hasMore) {
      const read = planHistoryRead(history, tipsToken, history.length > 0);
      reads.push(read);
      const page = await service.getCommitHistoryPage({ repoPath: repo, scope, ...historyReadRequest(read) });
      const applied = applyHistoryPage(history, hasMore, read, page);
      if (!applied) throw new Error(`Page ${reads.length} did not apply.`);
      ({ history, tipsToken, hasMore } = applied);
    }
    return { history, tipsToken, reads };
  };

  for (const scope of ["current", "all"] as const) {
    it(`appends ${scope}-scope pages that match one large read`, async () => {
      const single = await readSingle(scope);
      const paged = await readLikeRenderer(scope);

      expect(single.length).toBeGreaterThan(scope === "all" ? 500 : 400);
      expect(paged.reads.map((read) => read.kind)).toEqual(["full", ...paged.reads.slice(1).map(() => "append")]);
      expect(paged.history).toEqual(single);
      expect(buildCommitGraphLayout(paged.history)).toEqual(buildCommitGraphLayout(single));
      await expect(service.getCommitHistory({ repoPath: repo, scope, limit: 100_000 })).resolves.toEqual(single);
    }, 30_000);

    it(`matches one large read for arbitrary ${scope}-scope page sizes`, async () => {
      const single = await readSingle(scope);
      const first = await service.getCommitHistoryPage({ repoPath: repo, scope, limit: 7 });
      expect(first.tipsToken).toMatch(/^[h-][r-][0-9a-f]{64}$/);
      const rows = [...first.rows];
      const sizes = [1, 13, 2, 50, 3, 97];
      for (let index = 0; rows.length < single.length; index += 1) {
        const page = await service.getCommitHistoryPage({ repoPath: repo, scope, limit: sizes[index % sizes.length]!, skip: rows.length, tipsToken: first.tipsToken! });
        expect(page).toMatchObject({ tipsToken: first.tipsToken, tipsChanged: false });
        expect(page.rows.length).toBeGreaterThan(0);
        rows.push(...page.rows);
      }
      expect(rows).toEqual(single);
    }, 30_000);
  }

  it("refreshes only the first page and keeps the loaded tail while history is unchanged", async () => {
    const loaded = await readLikeRenderer("all");
    const read = planHistoryRead(loaded.history, loaded.tipsToken, false);
    expect(read).toMatchObject({ kind: "refresh", limit: 200 });
    const page = await service.getCommitHistoryPage({ repoPath: repo, scope: "all", ...historyReadRequest(read) });
    expect(page.rows).toHaveLength(201);
    expect(applyHistoryPage(loaded.history, false, read, page)).toEqual({ history: loaded.history, hasMore: false, tipsToken: loaded.tipsToken });
  }, 30_000);

  it("reports moved history instead of appending rows from a different listing", async () => {
    for (const scope of ["current", "all"] as const) {
      const first = await service.getCommitHistoryPage({ repoPath: repo, scope, limit: 200 });
      const before = git("rev-parse", "HEAD");
      try {
        git("commit", "-q", "--allow-empty", "-m", "moved");
        const moved = await service.getCommitHistoryPage({ repoPath: repo, scope, limit: 200, skip: 200, tipsToken: first.tipsToken! });
        expect(moved).toEqual({ rows: [], tipsToken: expect.stringMatching(/^[h-][r-][0-9a-f]{64}$/), tipsChanged: true });
        expect(moved.tipsToken).not.toBe(first.tipsToken);
        expect(applyHistoryPage(first.rows, true, { kind: "append", limit: 200, skip: 200, tipsToken: first.tipsToken! }, moved)).toBeNull();
      } finally {
        git("reset", "-q", "--hard", before);
      }
      // Moving back restores the same listing and the same token.
      await expect(service.getCommitHistoryPage({ repoPath: repo, scope, limit: 1 })).resolves.toMatchObject({ tipsToken: first.tipsToken });
    }
  }, 30_000);

  it("treats ref-only changes as moved history because they change decorations", async () => {
    const first = await service.getCommitHistoryPage({ repoPath: repo, scope: "current", limit: 10 });
    const checks = [
      () => git("branch", "decoration-only", "HEAD~3"),
      () => git("checkout", "-q", "--detach", "HEAD")
    ];
    try {
      for (const change of checks) {
        change();
        const page = await service.getCommitHistoryPage({ repoPath: repo, scope: "current", limit: 10, skip: 10, tipsToken: first.tipsToken! });
        expect(page.tipsChanged).toBe(true);
      }
    } finally {
      git("checkout", "-q", "main");
      git("branch", "-q", "-D", "decoration-only");
    }
    await expect(service.getCommitHistoryPage({ repoPath: repo, scope: "current", limit: 10, skip: 10, tipsToken: first.tipsToken! }))
      .resolves.toMatchObject({ tipsChanged: false });
  }, 30_000);
});

describe("commit history pages in empty repositories", () => {
  it("returns empty pages with a token for unborn HEAD", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-history-empty-"));
    try {
      execFileSync("git", ["-C", repo, "init", "-q"], { env: gitEnv });
      const service = new GitService(new NodeProcessRunner());
      for (const scope of ["current", "all"] as const) {
        await expect(service.getCommitHistoryPage({ repoPath: repo, scope, limit: 201 })).resolves.toEqual({
          rows: [],
          tipsToken: expect.stringMatching(/^[h-][r-][0-9a-f]{64}$/),
          tipsChanged: false
        });
      }
    } finally {
      await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    }
  });
});
