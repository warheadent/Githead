import { describe, expect, it } from "vite-plus/test";
import type { GitCommitGraphRow } from "../shared/types";
import {
  buildCommitGraphLayout,
  COMMIT_GRAPH_MIN_WIDTH,
  COMMIT_GRAPH_ROW_HEIGHT
} from "./commitGraph";

describe("commit graph layout", () => {
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

  it("ends an edge at the last visible row when the parent is outside the history window", () => {
    const layout = buildCommitGraphLayout([
      createCommit("head", ["visible-parent", "hidden-parent"]),
      createCommit("visible-parent")
    ]);

    expect(layout.edges.find((edge) => edge.toHash === "hidden-parent")).toMatchObject({
      fromRow: 0,
      toRow: 1,
      toLane: 1
    });
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
