import { describe, expect, it } from "vitest";
import type { GitCommitGraphRow } from "../shared/types";
import { getCommitGraphTokens, getCommitHistoryVisualRows } from "./commitGraph";

describe("commit graph helpers", () => {
  it("classifies git graph glyphs into drawable token kinds", () => {
    expect(getCommitGraphTokens("| *_/\\-x")).toEqual([
      {
        char: "|",
        lane: 0,
        kind: "vertical"
      },
      {
        char: " ",
        lane: 1,
        kind: "empty"
      },
      {
        char: "*",
        lane: 2,
        kind: "commit"
      },
      {
        char: "_",
        lane: 3,
        kind: "horizontal"
      },
      {
        char: "/",
        lane: 4,
        kind: "diagonal-slash"
      },
      {
        char: "\\",
        lane: 5,
        kind: "diagonal-backslash"
      },
      {
        char: "-",
        lane: 6,
        kind: "horizontal"
      },
      {
        char: "x",
        lane: 7,
        kind: "unknown"
      }
    ]);
  });

  it("uses a commit dot fallback for empty commit graph text", () => {
    expect(getCommitGraphTokens("")).toEqual([
      {
        char: "*",
        lane: 0,
        kind: "commit"
      }
    ]);
    expect(getCommitGraphTokens("", { fallbackCommit: false })).toEqual([]);
  });

  it("expands preserved connector lines before their commit row", () => {
    const commit = createCommit({
      graphLinesBefore: [
        "|\\",
        "|/"
      ]
    });

    expect(getCommitHistoryVisualRows([commit])).toEqual([
      {
        kind: "connector",
        id: `${commit.hash}:connector:0:|\\`,
        graph: "|\\"
      },
      {
        kind: "connector",
        id: `${commit.hash}:connector:1:|/`,
        graph: "|/"
      },
      {
        kind: "commit",
        commit
      }
    ]);
  });
});

function createCommit(overrides: Partial<GitCommitGraphRow> = {}): GitCommitGraphRow {
  return {
    hash: "f".repeat(40),
    shortHash: "fffffff",
    graph: "*",
    refs: [],
    subject: "fix: default test commit",
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    relativeDate: "2 hours ago",
    ...overrides
  };
}
