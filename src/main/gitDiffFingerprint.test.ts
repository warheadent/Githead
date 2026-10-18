import { describe, expect, it } from "vite-plus/test";
import { createGitDiffFingerprint, findPorcelainStatusRecord } from "./gitDiffFingerprint";

const headOid = "1".repeat(40);
const indexOid = "2".repeat(40);
const otherOid = "3".repeat(40);
const missingRepo = "/githead-fingerprint-test-missing-repo";

function ordinary(xy: string, filePath: string, hashHead = headOid, hashIndex = indexOid, submodule = "N...") {
  return `1 ${xy} ${submodule} 100644 100644 100644 ${hashHead} ${hashIndex} ${filePath}`;
}

describe("findPorcelainStatusRecord", () => {
  it("finds ordinary, renamed, unmerged, and untracked records by exact path", () => {
    const text = [
      ordinary(".M", "src/a b.ts"),
      `2 R. N... 100644 100644 100644 ${headOid} ${indexOid} R100 src/new.ts`,
      "src/old.ts",
      `u UU N... 100644 100644 100644 100644 ${headOid} ${indexOid} ${otherOid} src/conflict.ts`,
      "? src/untracked.ts",
      ""
    ].join("\0");

    expect(findPorcelainStatusRecord(text, "src/a b.ts")).toMatchObject({ type: "1" });
    expect(findPorcelainStatusRecord(text, "src/new.ts")).toMatchObject({ type: "2", originalPath: "src/old.ts" });
    // A rename source is not a record of its own.
    expect(findPorcelainStatusRecord(text, "src/old.ts")).toBeNull();
    expect(findPorcelainStatusRecord(text, "src/conflict.ts")).toMatchObject({ type: "u" });
    expect(findPorcelainStatusRecord(text, "src/untracked.ts")).toEqual({ type: "?", fields: [] });
    expect(findPorcelainStatusRecord(text, "src/a")).toBeNull();
  });
});

describe("createGitDiffFingerprint", () => {
  const fingerprint = (side: "staged" | "unstaged", status: string, filePath = "a.ts") =>
    createGitDiffFingerprint(missingRepo, filePath, side, status);

  it("keeps the staged fingerprint independent of the working tree", async () => {
    const staged = await fingerprint("staged", ordinary("M.", "a.ts"));
    expect(await fingerprint("staged", ordinary("MM", "a.ts"))).toBe(staged);
    expect(await fingerprint("staged", ordinary("M.", "a.ts", headOid, otherOid))).not.toBe(staged);
    expect(await fingerprint("staged", ordinary("M.", "a.ts", otherOid, indexOid))).not.toBe(staged);
  });

  it("keeps the unstaged fingerprint independent of HEAD", async () => {
    const unstaged = await fingerprint("unstaged", ordinary("MM", "a.ts"));
    expect(await fingerprint("unstaged", ordinary(".M", "a.ts", otherOid, indexOid))).toBe(unstaged);
    expect(await fingerprint("unstaged", ordinary(".M", "a.ts", headOid, otherOid))).not.toBe(unstaged);
    expect(await fingerprint("unstaged", ordinary("M.", "a.ts"))).not.toBe(unstaged);
  });

  it("distinguishes sides, paths, clean files, and conflicts", async () => {
    const clean = await fingerprint("unstaged", "");
    expect(await fingerprint("staged", "")).not.toBe(clean);
    expect(await fingerprint("unstaged", "", "b.ts")).not.toBe(clean);
    expect(await fingerprint("unstaged", ordinary(".M", "a.ts"))).not.toBe(clean);
    const conflict = (stage3: string) => `u UU N... 100644 100644 100644 100644 ${headOid} ${indexOid} ${stage3} a.ts`;
    expect(await fingerprint("staged", conflict(otherOid))).not.toBe(await fingerprint("staged", conflict(indexOid)));
  });

  it("returns null for submodules", async () => {
    await expect(fingerprint("unstaged", ordinary(".M", "child", headOid, indexOid, "S.M."), "child")).resolves.toBeNull();
    await expect(fingerprint("staged", ordinary("M.", "child", headOid, indexOid, "SC.."), "child")).resolves.toBeNull();
  });
});
