import { describe, expect, it } from "vite-plus/test";
import type { GitCommitGraphRow } from "../shared/types";
import { applyHistoryPage, fullHistoryRead, historyReadRequest, planHistoryRead } from "./historyPaging";

const row = (index: number): GitCommitGraphRow => ({
  hash: index.toString(16).padStart(40, "0"),
  shortHash: String(index),
  parents: [],
  refs: [],
  subject: `Commit ${index}`,
  authorName: "Taylor",
  authorEmail: "taylor@example.test",
  authorDate: "2026-01-01T00:00:00Z",
  relativeDate: "now"
});
const rows = (start: number, end: number) => Array.from({ length: end - start }, (_, index) => row(start + index));

describe("history paging", () => {
  it("plans full reads without a token and token-anchored reads with one", () => {
    expect(planHistoryRead([], "token", false)).toEqual({ kind: "full", limit: 200 });
    expect(planHistoryRead(rows(0, 400), null, true)).toEqual({ kind: "full", limit: 800 });
    expect(planHistoryRead(rows(0, 400), "token", true)).toEqual({ kind: "append", limit: 400, skip: 400, tipsToken: "token" });
    expect(planHistoryRead(rows(0, 15_000), "token", true)).toMatchObject({ kind: "append", limit: 10_000, skip: 15_000 });
    expect(planHistoryRead(rows(0, 400), "token", false)).toEqual({ kind: "refresh", limit: 200, tipsToken: "token" });
    expect(historyReadRequest(fullHistoryRead(400, false))).toEqual({ limit: 401 });
    expect(historyReadRequest({ kind: "refresh", limit: 200, tipsToken: "token" })).toEqual({ limit: 201, tipsToken: "token" });
  });

  it("appends pages and keeps the loaded tail after an unchanged first-page refresh", () => {
    const base = rows(0, 400);
    expect(applyHistoryPage(base, true, { kind: "append", limit: 400, skip: 400, tipsToken: "t" }, { rows: rows(400, 801), tipsToken: "t", tipsChanged: false }))
      .toEqual({ history: rows(0, 800), hasMore: true, tipsToken: "t" });
    const refreshedTop = rows(0, 201).map((commit) => ({ ...commit, relativeDate: "later" }));
    const refreshed = applyHistoryPage(base, true, { kind: "refresh", limit: 200, tipsToken: "t" }, { rows: refreshedTop, tipsToken: "t", tipsChanged: false });
    expect(refreshed?.history.slice(0, 200)).toEqual(refreshedTop.slice(0, 200));
    expect(refreshed).toMatchObject({ hasMore: true, tipsToken: "t" });
    expect(refreshed?.history.slice(200)).toEqual(base.slice(200));
  });

  it("requires a full read when the listing moved or the first page disagrees with the loaded rows", () => {
    const base = rows(0, 400);
    const refresh = { kind: "refresh", limit: 200, tipsToken: "t" } as const;
    expect(applyHistoryPage(base, true, refresh, { rows: [], tipsToken: "u", tipsChanged: true })).toBeNull();
    expect(applyHistoryPage(base, true, refresh, { rows: rows(1, 202), tipsToken: "t", tipsChanged: false })).toBeNull();
    expect(applyHistoryPage(base, true, refresh, { rows: rows(0, 150), tipsToken: "t", tipsChanged: false })).toBeNull();
    expect(applyHistoryPage(base, true, { kind: "append", limit: 400, skip: 400, tipsToken: "t" }, { rows: rows(400, 500), tipsToken: "other", tipsChanged: false })).toBeNull();
  });
});
