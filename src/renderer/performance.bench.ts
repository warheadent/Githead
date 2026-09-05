import { bench, describe } from "vite-plus/test";
import type { GitCommitGraphRow, GitStatusFile } from "../shared/types";
import { appendActivityLogEvent, createActivityLogState, getActivityLogRawText } from "./activityLog";
import { buildCommitGraphLayout } from "./commitGraph";
import { processDiff } from "./diffProcessing";
import { processDiffPlain } from "./diffProcessingPlain";
import { buildStatusFileTree, flattenStatusFileTree } from "./statusFileTree";

// Run separately from tests/builds to avoid CPU contention. Compare the same
// fixtures across revisions; these timings are not CI pass/fail thresholds.
const options = { time: 1_000, iterations: 10, warmupTime: 500 };
const context = Array.from({ length: 1_000 }, (_, index) => ` const value${index} = ${index};`);
const addition = {
  filePath: "example.ts",
  text: ["@@ -1,1000 +1,1001 @@", ...context, "+const added = true;"].join("\n"),
  truncated: false
};
const replacement = {
  ...addition,
  text: ["@@ -1,1001 +1,1001 @@", ...context, "-const removed = false;", "+const added = true;"].join("\n")
};
const files: GitStatusFile[] = Array.from({ length: 10_000 }, (_, index) => ({
  path: `src/package${index % 100}/file${index}.ts`,
  indexStatus: " ", worktreeStatus: "M", isStaged: false, isUnstaged: true, isConflicted: false
}));
const commits: GitCommitGraphRow[] = Array.from({ length: 10_000 }, (_, index) => ({
  hash: String(index), shortHash: String(index), parents: [String(index + 1)], refs: [],
  subject: "Example commit", authorName: "Example", authorEmail: "example@example.com",
  authorDate: "2026-01-01T00:00:00Z", relativeDate: "1 day ago"
}));
const chunk = "Build output line\n".repeat(64);

describe("repository-sized workloads", () => {
  bench("highlight addition with 1,000 context lines", () => { processDiff(addition); }, options);
  bench("highlight replacement with 1,000 context lines", () => { processDiff(replacement); }, options);
  bench("parse 1,000-line diff without highlighting", () => { processDiffPlain(addition); }, options);
  bench("build and flatten 10,000 status files", () => { flattenStatusFileTree(buildStatusFileTree(files), new Set()); }, options);
  bench("layout 10,000 linear commits", () => { buildCommitGraphLayout(commits); }, options);
  bench("append 1,000 log chunks in one stream", () => {
    let state = createActivityLogState();
    for (let index = 0; index < 1_000; index += 1) {
      state = appendActivityLogEvent(state, {
        runId: "benchmark", action: "build", stream: "stdout", text: chunk, timestamp: "2026-01-01T00:00:00Z"
      });
    }
    // Materialize retained output once, as when opening or copying a log after
    // a command. This does not measure DOM updates while the log is visible.
    if (!getActivityLogRawText(state).endsWith(chunk) || !state.blocks.map((block) => block.html).join("").endsWith(chunk)) {
      throw new Error("Benchmark log output is incomplete.");
    }
  }, options);
  bench("append 200 log chunks after reaching the retention limit", () => {
    let state = appendActivityLogEvent(createActivityLogState(), {
      runId: "benchmark", action: "build", stream: "stdout", text: "x".repeat(2_000_000), timestamp: "2026-01-01T00:00:00Z"
    });
    for (let index = 0; index < 200; index++) state = appendActivityLogEvent(state, {
      runId: "benchmark", action: "build", stream: "stdout", text: chunk, timestamp: "2026-01-01T00:00:00Z"
    });
    if (!getActivityLogRawText(state).endsWith(chunk)) throw new Error("Latest output was lost.");
  }, options);
  bench("append 200 chunks containing terminal hyperlinks", () => {
    let state = createActivityLogState();
    const text = "\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007\n" + chunk;
    for (let index = 0; index < 200; index++) state = appendActivityLogEvent(state, {
      runId: "benchmark", action: "build", stream: "stdout", text, timestamp: "2026-01-01T00:00:00Z"
    });
    if (!getActivityLogRawText(state).endsWith(chunk)) throw new Error("Latest output was lost.");
  }, options);
  bench("append 2,000 interleaved chunks from four runs", () => {
    let state = createActivityLogState();
    for (let index = 0; index < 2_000; index++) state = appendActivityLogEvent(state, {
      runId: `run-${index % 4}`, action: "build", stream: index % 2 ? "stderr" : "stdout", text: "progress\n", timestamp: "2026-01-01T00:00:00Z"
    });
    if (!getActivityLogRawText(state).endsWith("progress\n")) throw new Error("Latest output was lost.");
  }, options);

});
