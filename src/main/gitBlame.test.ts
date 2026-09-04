import { describe, expect, it, vi } from "vite-plus/test";
import { BLAME_BLOB_BYTE_LIMIT, parseGitBlame, readGitFileBlame } from "./gitBlame";
import type { ProcessRunner } from "./processRunner";

const hash = "a".repeat(40);

describe("gitBlame", () => {
  it("normalizes porcelain metadata and line references", () => {
    const parsed = parseGitBlame([
      `${hash} 3 1 1`,
      "author Taylor",
      "author-mail <t@example.test>",
      "author-time 1735689600",
      "summary Add line",
      "filename old.ts",
      "boundary",
      "\tconst value = 1;",
      ""
    ].join("\n"));
    expect(parsed.commits).toEqual([expect.objectContaining({ hash, authorName: "Taylor", authorEmail: "t@example.test", summary: "Add line" })]);
    expect(parsed.lines).toEqual([{ finalLine: 1, originalLine: 3, commitHash: hash, originalPath: "old.ts", text: "const value = 1;", boundary: true }]);
  });

  it("retains metadata across compact groups and updates paths for the same commit", () => {
    const otherHash = "b".repeat(40);
    const metadata = ["author Taylor", "author-mail <t@example.test>", "author-time 1735689600", "summary Add lines"];
    const compact = [
      `${hash} 1 1 2`, ...metadata, "boundary", "filename old.ts", "\tfirst",
      `${hash} 2 2`, "\tsecond",
      `${otherHash} 1 3 1`, ...metadata, "filename new.ts", "\tthird",
      `${hash} 3 4 1`, "\tfourth",
      `${hash} 1 5 2`, "filename another.ts", "\tfifth",
      `${hash} 2 6`, "\tsixth",
      `${hash} 4 7 1`, "filename old.ts", "\tseventh"
    ].join("\n");
    const expected = [
      { hash, originalLine: 1, path: "old.ts", text: "first" },
      { hash, originalLine: 2, path: "old.ts", text: "second" },
      { hash: otherHash, originalLine: 1, path: "new.ts", text: "third" },
      { hash, originalLine: 3, path: "old.ts", text: "fourth" },
      { hash, originalLine: 1, path: "another.ts", text: "fifth" },
      { hash, originalLine: 2, path: "another.ts", text: "sixth" },
      { hash, originalLine: 4, path: "old.ts", text: "seventh" }
    ];
    const full = expected.flatMap((line, index) => [
      `${line.hash} ${line.originalLine} ${index + 1} 1`, ...metadata,
      ...(line.hash === hash ? ["boundary"] : []), `filename ${line.path}`, `\t${line.text}`
    ]).join("\n");
    const parsed = parseGitBlame(compact);
    expect(parsed).toEqual(parseGitBlame(full));
    expect(parsed.lines).toEqual(expected.map((line, index) => ({
      finalLine: index + 1, originalLine: line.originalLine, commitHash: line.hash,
      originalPath: line.path, text: line.text, boundary: line.hash === hash
    })));
  });

  it("returns a bounded binary state before invoking blame", async () => {
    const runBinary = vi.fn().mockResolvedValueOnce({ exitCode: 0, stdout: new Uint8Array([1, 0, 2]), stderr: "" });
    const result = await readGitFileBlame({ run: vi.fn(), runBinary } as ProcessRunner, "D:\\Repo", hash, "asset.bin");
    expect(result).toMatchObject({ kind: "unavailable", reason: "binary" });
    expect(runBinary).toHaveBeenCalledOnce();
  });

  it("returns oversized without retaining partial output", async () => {
    const runBinary = vi.fn().mockResolvedValueOnce({ exitCode: -1, stdout: new Uint8Array(), stderr: "", exceededLimit: true });
    const result = await readGitFileBlame({ run: vi.fn(), runBinary } as ProcessRunner, "D:\\Repo", hash, "huge.txt");
    expect(result).toMatchObject({ kind: "unavailable", reason: "oversized" });
    expect(runBinary.mock.calls[0]?.[2]).toMatchObject({ maxBytes: BLAME_BLOB_BYTE_LIMIT + 1 });
  });

  it("loads bounded porcelain after the blob preflight", async () => {
    const encoder = new TextEncoder();
    const runBinary = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: encoder.encode("hello\n"), stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: encoder.encode(`${hash} 1 1 1\nauthor T\nauthor-mail <t@e>\nauthor-time 1\nsummary Init\nfilename a.txt\n\thello\n`), stderr: "" });
    const result = await readGitFileBlame({ run: vi.fn(), runBinary } as ProcessRunner, "D:\\Repo", hash, "a.txt");
    expect(result).toMatchObject({ kind: "text", byteLength: 6, lines: [{ text: "hello", finalLine: 1 }] });
    expect(runBinary.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["blame", "--porcelain", hash, "--", "a.txt"]));
    expect(runBinary.mock.calls[1]?.[1]).toContain("--no-textconv");
  });
});
