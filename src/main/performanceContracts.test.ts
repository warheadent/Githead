import { describe, expect, it } from "vite-plus/test";
import {
  ACTIVITY_LOG_MAX_BLOCKS,
  ACTIVITY_LOG_MAX_RAW_CHARS
} from "../renderer/activityLog";
import { REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS } from "../renderer/repositorySnapshotCache";
import {
  DEFAULT_PERFORMANCE_DIAGNOSTIC_SAMPLE_LIMIT,
  PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT
} from "./performanceDiagnostics";
import { DEFAULT_PROCESS_MAX_OUTPUT_BYTES } from "./processRunner";

describe("deterministic performance contracts", () => {
  it("keeps buffered text process output at or below eight MiB", () => {
    expect(DEFAULT_PROCESS_MAX_OUTPUT_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it("keeps renderer retained-item limits explicit and finite", () => {
    expect(REPOSITORY_SNAPSHOT_MAX_RETAINED_ITEMS).toBeLessThanOrEqual(20_000);
    expect(ACTIVITY_LOG_MAX_BLOCKS).toBeLessThanOrEqual(3_000);
    expect(ACTIVITY_LOG_MAX_RAW_CHARS).toBeLessThanOrEqual(2_000_000);
  });

  it("keeps diagnostic retention limits explicit and finite", () => {
    expect(DEFAULT_PERFORMANCE_DIAGNOSTIC_SAMPLE_LIMIT).toBeLessThanOrEqual(600);
    expect(PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT).toBeLessThanOrEqual(64);
  });
});
