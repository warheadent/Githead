import { describe, expect, it } from "vitest";
import {
  loreDateToIso,
  normalizeLoreDiff,
  parseLoreBranchList,
  parseLoreHistory,
  parseLorePerson,
  parseLoreRevision,
  parseLoreStatus
} from "./loreParsers";

// Fixtures captured verbatim from `lore` CLI v0.8.3 against a local repository.

const STATUS_STAGED_AND_UNTRACKED = `Repository 019ee33ca6e07831a467dbc3dc6e148e
On branch main revision 0 -> 0000000000000000000000000000000000000000000000000000000000000000
Changes staged for commit:
A hello.txt
Untracked files:
A notes.md
`;

const STATUS_MODIFIED = `Repository 019ee33ca6e07831a467dbc3dc6e148e
On branch main revision 1 -> 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Changes not staged for commit:
M hello.txt
Untracked files:
A notes.md
Tracked changes: 1 added, 1 modified
`;

const STATUS_DELETED = `Repository 019ee33ca6e07831a467dbc3dc6e148e
On branch main revision 2 -> 0b939d06488b9a58aff2287684193f2676f708d5c04756d8bde6c2dc1ebb0033
Changes not staged for commit:
D notes.md
Tracked changes: 1 deleted
`;

const HISTORY_TWO = `Revision  : 2
Signature : 0b939d06488b9a58aff2287684193f2676f708d5c04756d8bde6c2dc1ebb0033
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Sat, 20 Jun 2026 04:17:48 +0000
    Edit hello, add notes
Creator   : Test User <test@example.com>
Committer : Test User <test@example.com>

Revision  : 1
Signature : 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Sat, 20 Jun 2026 04:15:43 +0000
    Add hello.txt
Creator   : Test User <test@example.com>
Committer : Test User <test@example.com>
`;

const REVISION_INFO_DELTA = `Revision  : 1
Signature : 7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4
Branch    : e726318bbc3fd75ac8733a7e030cc35b
Date      : Sat, 20 Jun 2026 04:15:43 +0000
    Add hello.txt
Creator   : Test User <test@example.com>
Committer : Test User <test@example.com>

A hello.txt
`;

const BRANCH_LIST = `Local branches:
* main
Warning: Could not query remote branch list
`;

const DIFF_MODIFIED = `
hello.txt
--- hello.txt@1
+++ hello.txt
@@ -1 +1,2 @@
-hello lore
+hello lore - edited
+new line
`;

describe("parseLoreStatus", () => {
  it("parses staged and untracked files", () => {
    const status = parseLoreStatus(STATUS_STAGED_AND_UNTRACKED);

    expect(status.branch).toBe("main");
    expect(status.revisionNumber).toBe(0);
    expect(status.revisionSignature).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(status.files).toEqual([
      {
        path: "hello.txt",
        indexStatus: "A",
        worktreeStatus: "",
        isStaged: true,
        isUnstaged: false,
        isConflicted: false
      },
      {
        path: "notes.md",
        indexStatus: "",
        worktreeStatus: "?",
        isStaged: false,
        isUnstaged: true,
        isConflicted: false
      }
    ]);
  });

  it("parses an unstaged modification", () => {
    const status = parseLoreStatus(STATUS_MODIFIED);

    expect(status.revisionNumber).toBe(1);
    const hello = status.files.find((file) => file.path === "hello.txt");
    expect(hello).toMatchObject({
      worktreeStatus: "M",
      isUnstaged: true,
      isStaged: false
    });
  });

  it("drops directory entries (trailing slash) from status", () => {
    const status = parseLoreStatus(`On branch main revision 1 -> abc123
Untracked files:
A myrion/
A myrion/Config/
A myrion/Config/DefaultEngine.ini
A myrion/Myrion.uproject
`);

    expect(status.files.map((file) => file.path)).toEqual([
      "myrion/Config/DefaultEngine.ini",
      "myrion/Myrion.uproject"
    ]);
  });

  it("parses a deletion with a D worktree status", () => {
    const status = parseLoreStatus(STATUS_DELETED);

    expect(status.files).toEqual([
      {
        path: "notes.md",
        indexStatus: "",
        worktreeStatus: "D",
        isStaged: false,
        isUnstaged: true,
        isConflicted: false
      }
    ]);
  });
});

describe("parseLoreHistory", () => {
  it("parses revisions newest-first with author and date", () => {
    const revisions = parseLoreHistory(HISTORY_TWO);

    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({
      number: 2,
      signature: "0b939d06488b9a58aff2287684193f2676f708d5c04756d8bde6c2dc1ebb0033",
      subject: "Edit hello, add notes",
      authorName: "Test User",
      authorEmail: "test@example.com"
    });
    expect(revisions[0]?.date).toBe("2026-06-20T04:17:48.000Z");
    expect(revisions[1]?.signature).toBe("7154881d5d929c4487cdee9d65fd7b9c6edb6de8994f819c80ac4191a8f08af4");
  });
});

describe("parseLoreRevision", () => {
  it("parses a revision with its delta file list", () => {
    const revision = parseLoreRevision(REVISION_INFO_DELTA);

    expect(revision).not.toBeNull();
    expect(revision?.subject).toBe("Add hello.txt");
    expect(revision?.committerName).toBe("Test User");
    expect(revision?.files).toEqual([
      {
        path: "hello.txt",
        status: "A",
        additions: 0,
        deletions: 0
      }
    ]);
  });
});

describe("parseLoreRevision directory filtering", () => {
  it("drops directory entries from a git-imported revision delta", () => {
    const revision = parseLoreRevision(`Revision  : 1
Signature : abc123
git.author: Taylor <t@example.com>
git-lfs.objects: 45
Branch    : e726318b
Date      : Fri, 19 Jun 2026 00:30:47 +0000
    Init commit
Creator   : git-lore-bot@example.com
Committer : git-lore-bot@example.com

A Content
A Config
A Config/DefaultEngine.ini
A Myrion.uproject
A Content/Geometry
A Content/Geometry/1M_Cube.uasset
`);

    expect(revision?.subject).toBe("Init commit");
    expect(revision?.authorName).toBe("git-lore-bot@example.com");
    expect(revision?.files.map((file) => file.path)).toEqual([
      "Config/DefaultEngine.ini",
      "Myrion.uproject",
      "Content/Geometry/1M_Cube.uasset"
    ]);
  });
});

describe("parseLoreBranchList", () => {
  it("lists branches and marks the current one, skipping headers and warnings", () => {
    expect(parseLoreBranchList(BRANCH_LIST)).toEqual([
      {
        name: "main",
        current: true
      }
    ]);
  });
});

describe("normalizeLoreDiff", () => {
  it("strips the leading title and blank lines to a clean unified diff", () => {
    const normalized = normalizeLoreDiff(DIFF_MODIFIED);

    expect(normalized.startsWith("--- hello.txt@1")).toBe(true);
    expect(normalized).toContain("@@ -1 +1,2 @@");
    expect(normalized).toContain("+new line");
  });

  it("returns an empty string when there is no diff body", () => {
    expect(normalizeLoreDiff("\n")).toBe("");
  });
});

describe("helpers", () => {
  it("parses an identity into name and email", () => {
    expect(parseLorePerson("Test User <test@example.com>")).toEqual({
      name: "Test User",
      email: "test@example.com"
    });
  });

  it("converts an RFC 2822 date to ISO", () => {
    expect(loreDateToIso("Sat, 20 Jun 2026 04:15:43 +0000")).toBe("2026-06-20T04:15:43.000Z");
  });
});
