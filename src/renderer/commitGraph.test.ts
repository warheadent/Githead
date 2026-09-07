import { describe, expect, it } from "vite-plus/test";
import type { GitCommitGraphRow } from "../shared/types";
import {
  buildCommitGraphLayout,
  COMMIT_GRAPH_MIN_WIDTH,
  COMMIT_GRAPH_ROW_HEIGHT
} from "./commitGraph";

describe("commit graph layout", () => {
  it("keeps master and a remote feature in the same lanes before and after merging", () => {
    const main = { ...createCommit("main", ["base"]), refs: [{ name: "master", kind: "branch" as const }] };
    const topic = { ...createCommit("topic", ["sync"]), refs: [{ name: "origin/feature", kind: "remote" as const }] };
    const sync = createCommit("sync", ["feature-base", "main"]);
    const base = createCommit("base");
    const featureBase = createCommit("feature-base", ["base"]);
    const before = buildCommitGraphLayout([topic, sync, main, featureBase, base]);
    const merge = { ...createCommit("merge", ["main", "topic"]), refs: main.refs };
    const after = buildCommitGraphLayout([merge, topic, sync, { ...main, refs: [] }, featureBase, base]);

    expect(before.nodes.find((node) => node.hash === "main")?.lane).toBe(0);
    expect(before.nodes.find((node) => node.hash === "topic")?.lane).toBe(1);
    for (const node of before.nodes) {
      expect(after.nodes.find((candidate) => candidate.hash === node.hash)?.lane).toBe(node.lane);
    }
    for (const edge of before.edges) {
      expect(after.edges.find((candidate) => candidate.id === edge.id)?.colorLane).toBe(edge.colorLane);
    }
  });

  it("keeps linear first-parent history on one lane", () => {
    const layout = buildCommitGraphLayout([
      createCommit("a", ["b"]),
      createCommit("b", ["c"]),
      createCommit("c")
    ]);

    expect(layout.nodes.map((node) => [node.hash, node.row, node.lane])).toEqual([
      ["a", 0, 0],
      ["b", 1, 0],
      ["c", 2, 0]
    ]);
    expect(layout.edges.map((edge) => [edge.fromHash, edge.toHash, edge.fromLane, edge.toLane])).toEqual([
      ["a", "b", 0, 0],
      ["b", "c", 0, 0]
    ]);
    expect(layout.width).toBe(COMMIT_GRAPH_MIN_WIDTH);
    expect(layout.height).toBe(3 * COMMIT_GRAPH_ROW_HEIGHT);
  });

  it("uses a configured default branch with a nonstandard name", () => {
    const commits = [
      createCommit("feature", ["base"]),
      { ...createCommit("release", ["base"]), refs: [{ name: "upstream/release", kind: "remote" as const }] },
      createCommit("base")
    ];
    expect(buildCommitGraphLayout(commits, ["release", "upstream/release"]).nodes.map((node) => node.lane))
      .toEqual([1, 0, 0]);
  });

  it("prefers the local main tip when its remote is behind", () => {
    const commits = [
      createCommit("feature", ["base"]),
      { ...createCommit("local", ["remote"]), refs: [{ name: "main", kind: "branch" as const }] },
      { ...createCommit("remote", ["base"]), refs: [{ name: "origin/main", kind: "remote" as const }] },
      createCommit("base")
    ];
    expect(buildCommitGraphLayout(commits).nodes.map((node) => node.lane)).toEqual([1, 0, 0, 0]);
  });

  it("does not reserve a lane for tags or main tips outside the loaded history", () => {
    const commits = [
      createCommit("feature", ["base"]),
      { ...createCommit("base"), refs: [{ name: "main", kind: "tag" as const }] }
    ];
    expect(buildCommitGraphLayout(commits).nodes.map((node) => node.lane)).toEqual([0, 0]);
    expect(buildCommitGraphLayout(commits, ["missing"]).nodes.map((node) => node.lane)).toEqual([0, 0]);
  });

  it("places merge parents in adjacent lanes", () => {
    const layout = buildCommitGraphLayout([
      createCommit("merge", ["main-parent", "feature-parent"]),
      createCommit("main-parent", ["base"]),
      createCommit("feature-parent", ["base"]),
      createCommit("base")
    ]);

    expect(layout.nodes.map((node) => [node.hash, node.lane])).toEqual([
      ["merge", 0],
      ["main-parent", 0],
      ["feature-parent", 1],
      ["base", 0]
    ]);
    expect(layout.edges.find((edge) => edge.toHash === "feature-parent")).toMatchObject({
      fromHash: "merge",
      fromLane: 0,
      toLane: 1
    });
  });

  it("continues branch lanes across several rows", () => {
    const layout = buildCommitGraphLayout([
      createCommit("merge", ["main-1", "topic-1"]),
      createCommit("main-1", ["main-2"]),
      createCommit("topic-1", ["topic-2"]),
      createCommit("topic-2", ["base"]),
      createCommit("main-2", ["base"]),
      createCommit("base")
    ]);

    expect(layout.nodes.filter((node) => node.hash.startsWith("topic")).map((node) => node.lane)).toEqual([
      1,
      1
    ]);
  });

  it("continues missing parents to the bottom boundary without inventing a node", () => {
    const layout = buildCommitGraphLayout([
      createCommit("head", ["visible-parent", "hidden-parent"]),
      createCommit("visible-parent")
    ]);

    expect(layout.edges.find((edge) => edge.toHash === "hidden-parent")).toMatchObject({
      fromRow: 0,
      toRow: 2,
      toLane: 1,
      continues: true
    });
    expect(layout.edges.find((edge) => edge.toHash === "hidden-parent")?.path).toMatch(/ 56$/);
    expect(layout.nodes).toHaveLength(2);
  });

  it("assigns octopus merge parents without duplicate lanes", () => {
    const layout = buildCommitGraphLayout([
      createCommit("merge", ["first", "second", "third"]),
      createCommit("first"),
      createCommit("second"),
      createCommit("third")
    ]);

    const parentNodes = layout.nodes.filter((node) => node.hash !== "merge");
    expect(parentNodes.map((node) => node.lane)).toEqual([
      0,
      1,
      2
    ]);
    expect(new Set(parentNodes.map((node) => node.lane)).size).toBe(parentNodes.length);
  });

  it("draws continuation edges even when only the final commit is loaded", () => {
    const layout = buildCommitGraphLayout([createCommit("head", ["parent", "topic"])]);
    expect(layout.edges).toHaveLength(2);
    for (const edge of layout.edges) {
      expect(edge).toMatchObject({ fromRow: 0, toRow: 1, continues: true });
      expect(edge.path).toMatch(/ 28$/);
    }
  });

  it("keeps a joining branch's track and color until its actual ancestor", () => {
    const layout = buildCommitGraphLayout([
      createCommit("merge", ["main", "topic"]),
      createCommit("main", ["base"]),
      createCommit("topic", ["base"]),
      createCommit("unrelated"),
      createCommit("base")
    ]);
    expect(layout.nodes.map((node) => node.lane)).toEqual([0, 0, 1, 2, 0]);
    const edge = layout.edges.find((candidate) => candidate.fromHash === "topic");
    expect(edge).toMatchObject({ fromLane: 1, toLane: 0, colorLane: 1 });
    // Stay in the topic lane across the unrelated row, then bend into base.
    expect(edge?.path).toBe("M 32 70 L 32 112 C 32 119, 14 119, 14 126");
  });

  it("reuses lanes after a shared ancestor and after disconnected roots", () => {
    const layout = buildCommitGraphLayout([
      createCommit("merge", ["main", "topic"]),
      createCommit("topic", ["base"]),
      createCommit("main", ["base"]),
      createCommit("base"),
      createCommit("other", ["other-main", "other-topic"]),
      createCommit("other-topic"),
      createCommit("other-main")
    ]);
    expect(layout.nodes.map((node) => node.lane)).toEqual([0, 1, 0, 0, 0, 1, 0]);
  });

  it("connects a merge to an already active parent and preserves all endpoints", () => {
    const layout = buildCommitGraphLayout([
      createCommit("tip", ["base"]),
      createCommit("merge", ["topic", "base"]),
      createCommit("topic", ["base"]),
      createCommit("base")
    ]);
    expect(layout.nodes.map((node) => node.lane)).toEqual([0, 1, 1, 0]);
    expect(layout.edges.find((edge) => edge.fromHash === "merge" && edge.toHash === "base"))
      .toMatchObject({ fromLane: 1, toLane: 0, colorLane: 0 });
    expect(layout.nodes[1]?.isMerge).toBe(true);
  });

  it("deduplicates repeated parents without creating false merges or duplicate SVG keys", () => {
    const layout = buildCommitGraphLayout([createCommit("tip", ["base", "base"]), createCommit("base")]);
    expect(layout.edges).toHaveLength(1);
    expect(layout.nodes[0]?.isMerge).toBe(false);
  });

  it("handles an empty history", () => {
    expect(buildCommitGraphLayout([])).toMatchObject({
      width: COMMIT_GRAPH_MIN_WIDTH, height: 0, nodes: [], edges: []
    });
  });

  it("keeps node lanes stable when more history is loaded", () => {
    const commits = [
      createCommit("merge", ["main", "topic"]),
      createCommit("main", ["base"]),
      createCommit("topic", ["base"]),
      createCommit("base")
    ];
    const full = buildCommitGraphLayout(commits);
    for (let count = 1; count < commits.length; count += 1) {
      expect(buildCommitGraphLayout(commits.slice(0, count)).nodes).toEqual(full.nodes.slice(0, count));
    }
  });

  it("preserves ancestry and avoids unrelated nodes across varied topologies", () => {
    // Deterministic DAGs cover nested merges, shared parents, disconnected tips,
    // wide graphs, and history truncation without relying on wall-clock timing.
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = seed;
      const random = (): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
      };
      const commits = Array.from({ length: 80 }, (_, row) => createCommit(String(row),
        Array.from({ length: Math.floor(random() * 4) }, () => String(row + 1 + Math.floor(random() * (90 - row))))
      ));
      const layout = buildCommitGraphLayout(commits);
      expect(layout.edges).toHaveLength(commits.reduce((count, commit) => count + new Set(commit.parents).size, 0));
      expect(new Set(layout.edges.map((edge) => edge.id)).size).toBe(layout.edges.length);
      for (const edge of layout.edges) {
        const from = layout.nodes[edge.fromRow]!;
        const target = layout.nodes[edge.toRow];
        expect(edge.path.startsWith(`M ${from.x} ${from.y}`)).toBe(true);
        expect(edge.toRow).toBeGreaterThan(edge.fromRow);
        if (target) {
          expect(target.hash).toBe(edge.toHash);
          expect(edge.toLane).toBe(target.lane);
          expect(edge.path.endsWith(`${target.x} ${target.y}`)).toBe(true);
        } else {
          expect(edge.continues).toBe(true);
          expect(edge.path.endsWith(` ${layout.height}`)).toBe(true);
        }
        for (const node of layout.nodes.slice(edge.fromRow + 1, edge.toRow)) {
          expect(node.lane).not.toBe(edge.colorLane);
        }
      }
      for (const node of layout.nodes) expect(node.x + 7).toBeLessThan(layout.width);
    }
  });
});

function createCommit(hash: string, parents: string[] = []): GitCommitGraphRow {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    refs: [],
    subject: `commit ${hash}`,
    authorName: "Taylor Bombay",
    authorEmail: "taylor@example.test",
    authorDate: "2026-05-26T21:42:20-07:00",
    relativeDate: "2 hours ago"
  };
}
