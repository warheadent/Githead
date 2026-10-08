import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  AnalyticsHistoryBuilder,
  CHANGE_ADDED,
  CHANGE_BINARY,
  CHANGE_DELETED,
  CHANGE_LFS,
  CHANGE_STRIDE,
  GitAnalyticsLogParser,
  parseCatFileBatch,
  parseTimezoneOffset,
  readAnalyticsHistory,
  readLfsPointerSizes,
  type HistoryCommit,
  type ParsedCommit
} from "./gitAnalyticsHistory";
import { NodeProcessRunner } from "./processRunner";

const HASH_A = "a".repeat(40);
const HASH_B = "b".repeat(40);
const BLOB = "c".repeat(40);
const ZERO = "0".repeat(40);

function sampleLog(): string {
  return [
    `\x1e${HASH_A}\x1f${HASH_B}\x1fAda Lovelace\x1fada@example.test\x1f2026-08-31T16:43:31-07:00\0`,
    `\n:100644 100644 ${ZERO} ${BLOB} M\0src/app file.ts\0`,
    `:000000 100644 ${ZERO} ${BLOB} A\0art/hero.png\0`,
    `:160000 160000 ${ZERO} ${BLOB} M\0external/lib\0`,
    "12\t3\tsrc/app file.ts\0",
    "-\t-\tart/hero.png\0",
    "1\t1\texternal/lib\0",
    `\x1e${HASH_B}\x1f${HASH_A} ${HASH_A}\x1fAda\x1fada@example.test\x1f2026-08-30T08:00:00+05:30\0`
  ].join("");
}

describe("GitAnalyticsLogParser", () => {
  it("parses commits with raw and numstat records regardless of chunk boundaries", () => {
    const text = sampleLog();
    for (const size of [1, 7, 64, text.length]) {
      const commits: ParsedCommit[] = [];
      const parser = new GitAnalyticsLogParser((commit) => commits.push(commit));
      for (let start = 0; start < text.length; start += size) parser.push(text.slice(start, start + size));
      parser.end();
      expect(commits).toHaveLength(2);
      expect(commits[0]).toMatchObject({
        hash: HASH_A,
        parentCount: 1,
        name: "Ada Lovelace",
        email: "ada@example.test",
        time: Date.parse("2026-08-31T16:43:31-07:00") / 1000,
        tzOffsetMinutes: -420
      });
      expect(commits[0]!.changes).toEqual([
        { path: "src/app file.ts", status: "M", blob: BLOB, added: 12, removed: 3, binary: false },
        { path: "art/hero.png", status: "A", blob: BLOB, added: 0, removed: 0, binary: true }
      ]);
      expect(commits[1]).toMatchObject({ hash: HASH_B, parentCount: 2, tzOffsetMinutes: 330, changes: [] });
    }
  });

  it("parses time zone offsets", () => {
    expect(parseTimezoneOffset("2026-01-01T00:00:00Z")).toBe(0);
    expect(parseTimezoneOffset("2026-01-01T00:00:00-09:30")).toBe(-570);
  });
});

describe("AnalyticsHistoryBuilder", () => {
  it("interns paths and identities and flags LFS candidates", () => {
    const builder = new AnalyticsHistoryBuilder();
    const commit = builder.add({
      hash: HASH_A,
      parentCount: 2,
      name: "Ada",
      email: "ada@example.test",
      time: 10,
      tzOffsetMinutes: 0,
      changes: [
        { path: "pointer.uasset", status: "A", blob: BLOB, added: 3, removed: 0, binary: false },
        { path: "big.cpp", status: "M", blob: "d".repeat(40), added: 40, removed: 2, binary: false },
        { path: "gone.txt", status: "D", blob: ZERO, added: 0, removed: 2, binary: false }
      ]
    });
    expect(commit.merge).toBe(true);
    expect([...builder.lfsCandidates.keys()]).toEqual([BLOB]);
    builder.applyLfsSizes(new Map([[BLOB, 5_000_000]]));
    expect(Array.from(commit.changes.subarray(0, CHANGE_STRIDE))).toEqual([0, 0, 0, CHANGE_ADDED | CHANGE_LFS]);
    expect(commit.lfsSizes?.[0]).toBe(5_000_000);
    expect(commit.changes[2 * CHANGE_STRIDE + 3]).toBe(CHANGE_DELETED);
    expect(builder.paths).toEqual(["pointer.uasset", "big.cpp", "gone.txt"]);
    expect(builder.identities).toEqual([{ name: "Ada", email: "ada@example.test" }]);
  });
});

describe("parseCatFileBatch", () => {
  it("reads blob contents by declared size and skips missing objects", () => {
    const output = new TextEncoder().encode(`${HASH_A} blob 3\nabc\n${HASH_B} missing\n${BLOB} blob 0\n\n`);
    const blobs: Array<[string, string]> = [];
    parseCatFileBatch(output, (oid, content) => blobs.push([oid, new TextDecoder().decode(content)]));
    expect(blobs).toEqual([[HASH_A, "abc"], [BLOB, ""]]);
  });
});

async function withRepository(callback: (repo: string, git: (...args: string[]) => string) => Promise<void>): Promise<void> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "githead-analytics-history-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }
  });
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Githead Test");
    git("config", "user.email", "githead@example.test");
    git("config", "core.autocrlf", "false");
    await callback(repo, git);
  } finally {
    await fs.rm(repo, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
}

const pointer = (size: number) => `version https://git-lfs.github.com/spec/v1\noid sha256:${"e".repeat(64)}\nsize ${size}\n`;

describe("readAnalyticsHistory with real Git", () => {
  it("reads text, binary, and LFS pointer changes and resolves LFS sizes", async () => {
    await withRepository(async (repo, git) => {
      await fs.writeFile(path.join(repo, "notes.txt"), "one\ntwo\n");
      await fs.writeFile(path.join(repo, "image.bin"), Buffer.from([0, 1, 2, 3]));
      await fs.writeFile(path.join(repo, "Hero.uasset"), pointer(123_456));
      git("add", ".");
      git("commit", "-qm", "Add files");
      await fs.writeFile(path.join(repo, "notes.txt"), "one\nthree\nfour\n");
      await fs.writeFile(path.join(repo, "Hero.uasset"), pointer(654_321).replace("e".repeat(64), "f".repeat(64)));
      git("commit", "-qam", "Edit files");

      const runner = new NodeProcessRunner();
      const builder = new AnalyticsHistoryBuilder();
      const progress: number[] = [];
      const result = await readAnalyticsHistory(runner, repo, builder, { revisions: ["HEAD"], maxCommits: 100, maxFileChanges: 100, onCommits: (count) => progress.push(count) });
      builder.applyLfsSizes(await readLfsPointerSizes(runner, repo, builder.lfsCandidates.keys()));

      expect(result.truncated).toBe(false);
      expect(progress.at(-1)).toBe(2);
      const change = (commit: HistoryCommit, file: string) => {
        const id = builder.paths.indexOf(file);
        for (let offset = 0, index = 0; offset < commit.changes.length; offset += CHANGE_STRIDE, index += 1) {
          if (commit.changes[offset] === id) return { added: commit.changes[offset + 1], removed: commit.changes[offset + 2], flags: commit.changes[offset + 3]!, lfs: commit.lfsSizes?.[index] };
        }
        return null;
      };
      const [edit, add] = result.commits as [HistoryCommit, HistoryCommit];
      expect(change(edit, "notes.txt")).toMatchObject({ added: 2, removed: 1, flags: 0 });
      expect(change(edit, "Hero.uasset")).toMatchObject({ added: 0, removed: 0, lfs: 654_321 });
      expect(change(edit, "Hero.uasset")!.flags & CHANGE_LFS).toBe(CHANGE_LFS);
      expect(change(add, "Hero.uasset")).toMatchObject({ lfs: 123_456 });
      expect(change(add, "image.bin")!.flags & CHANGE_BINARY).toBe(CHANGE_BINARY);
    });
  }, 30_000);

  it("keeps newest-first order when chunks are read in parallel", async () => {
    await withRepository(async (repo, git) => {
      for (let index = 0; index < 9; index += 1) {
        await fs.writeFile(path.join(repo, `file-${index}.txt`), `${index}\n`);
        git("add", ".");
        git("commit", "-qm", `Commit ${index}`);
      }
      const expected = git("rev-list", "HEAD").trim().split("\n");
      const result = await readAnalyticsHistory(new NodeProcessRunner(), repo, new AnalyticsHistoryBuilder(), { revisions: ["HEAD"], maxCommits: 100, maxFileChanges: 100, concurrency: 3, chunkSize: 2 });
      expect(result.commits.map((commit) => commit.hash)).toEqual(expected);
      expect(result).toMatchObject({ truncated: false, changeCount: 9 });
      const limited = await readAnalyticsHistory(new NodeProcessRunner(), repo, new AnalyticsHistoryBuilder(), { revisions: ["HEAD"], maxCommits: 100, maxFileChanges: 4, concurrency: 1, chunkSize: 2 });
      expect(limited.truncated).toBe(true);
      expect(limited.commits.map((commit) => commit.hash)).toEqual(expected.slice(0, 4));
    });
  }, 30_000);

  it("stops at the commit and file change limits", async () => {
    await withRepository(async (repo, git) => {
      for (let index = 0; index < 4; index += 1) {
        await fs.writeFile(path.join(repo, `file-${index}.txt`), `${index}\n`);
        git("add", ".");
        git("commit", "-qm", `Commit ${index}`);
      }
      const runner = new NodeProcessRunner();
      const byCommits = await readAnalyticsHistory(runner, repo, new AnalyticsHistoryBuilder(), { revisions: ["HEAD"], maxCommits: 2, maxFileChanges: 100 });
      expect(byCommits).toMatchObject({ truncated: true });
      expect(byCommits.commits).toHaveLength(2);
      const byChanges = await readAnalyticsHistory(runner, repo, new AnalyticsHistoryBuilder(), { revisions: ["HEAD"], maxCommits: 100, maxFileChanges: 3 });
      expect(byChanges).toMatchObject({ truncated: true });
      expect(byChanges.commits).toHaveLength(3);
    });
  }, 30_000);
});
