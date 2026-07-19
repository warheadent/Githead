import { describe, expect, it, vi } from "vite-plus/test";
import { parseGitFileHistory, readGitFileHistory } from "./gitFileHistory";
import type { ProcessRunner } from "./processRunner";

const hash = "a".repeat(40);
const parent = "b".repeat(40);

describe("gitFileHistory", () => {
  it("parses modified and renamed entries with NUL-delimited paths", () => {
    const text = [
      `\x1e${hash}\x1faaaaaaa\x1f${parent}\x1fRename file\x1fTaylor\x1ft@example.test\x1f2026-01-01T00:00:00Z\x1fnow\0R100\0old name.ts\0new name.ts\0`,
      `\x1e${parent}\x1fbbbbbbb\x1f\x1fCreate file\x1fTaylor\x1ft@example.test\x1f2025-01-01T00:00:00Z\x1fyear ago\0A\0old name.ts\0`
    ].join("");
    expect(parseGitFileHistory(text)).toEqual([
      expect.objectContaining({ hash, path: "new name.ts", originalPath: "old name.ts", status: "R", parents: [parent] }),
      expect.objectContaining({ hash: parent, path: "old name.ts", status: "A", parents: [] })
    ]);
  });

  it("uses one bounded, rename-following command and reports more entries", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: `\x1e${hash}\x1faaaaaaa\x1f\x1fOne\x1fA\x1fa@b\x1f2026-01-01T00:00:00Z\x1fnow\0M\0a.ts\0\x1e${parent}\x1fbbbbbbb\x1f\x1fTwo\x1fA\x1fa@b\x1f2025-01-01T00:00:00Z\x1fold\0A\0a.ts\0`,
      stderr: ""
    });
    const result = await readGitFileHistory({ run } as ProcessRunner, "D:\\Repo", hash, "a.ts", 1);
    expect(result.entries).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["log", "--follow", "--find-renames", "--max-count=2", hash, "--", "a.ts"]));
  });
});
