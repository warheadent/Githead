import { describe, expect, it, vi } from "vite-plus/test";
import {
  PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT,
  PerformanceDiagnostics,
  PerformanceDiagnosticsSessionRegistry
} from "./performanceDiagnostics";

describe("PerformanceDiagnostics", () => {
  it("retains only the newest samples in insertion order", () => {
    const diagnostics = new PerformanceDiagnostics({ sampleLimit: 3, now: () => 100 });
    diagnostics.recordQueueDepth(1);
    diagnostics.recordQueueDepth(2);
    diagnostics.recordQueueDepth(3);
    diagnostics.recordQueueDepth(4);

    const session = diagnostics.openSession();
    const snapshot = session.snapshot();
    session.close();

    expect(snapshot.samples.map((sample) => sample.queueDepth)).toEqual([2, 3, 4]);
    expect(snapshot.retainedSampleLimit).toBe(3);
    expect(snapshot.droppedSampleCount).toBe(1);
    expect(diagnostics.retainedSampleCount).toBe(3);
  });

  it("records bounded scalar command and refresh fields without command text", () => {
    const diagnostics = new PerformanceDiagnostics({ now: () => 123.6 });
    diagnostics.recordCommand({
      commandKind: "git",
      durationMs: 44.4,
      outcome: "truncated",
      outputBytes: 8_388_608,
      queueDepth: 2
    });
    diagnostics.recordRefresh({
      refreshKind: "status",
      requestCount: 4,
      coalescedCount: 9,
      queueDepth: 1
    });

    const session = diagnostics.openSession();
    const snapshot = session.snapshot();
    session.close();

    expect(snapshot.samples).toEqual([
      {
        type: "command",
        sequence: 1,
        recordedAtMs: 124,
        commandKind: "git",
        durationMs: 44,
        outcome: "truncated",
        outputBytes: 8_388_608,
        queueDepth: 2
      },
      {
        type: "refresh",
        sequence: 2,
        recordedAtMs: 124,
        refreshKind: "status",
        refreshRequestCount: 4,
        refreshCoalescedCount: 4,
        queueDepth: 1
      }
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/repo|path|commandText|commandLine/i);
  });

  it("uses fallback labels for invalid runtime input", () => {
    const diagnostics = new PerformanceDiagnostics({ now: () => Number.NaN });
    diagnostics.recordCommand({
      commandKind: "unexpected" as never,
      durationMs: -1,
      outcome: "unexpected" as never,
      outputBytes: Number.POSITIVE_INFINITY
    });
    diagnostics.recordRefresh({
      refreshKind: "unexpected" as never,
      requestCount: 1,
      coalescedCount: 0,
      queueDepth: 0
    });

    const session = diagnostics.openSession();
    const snapshot = session.snapshot();
    session.close();

    expect(snapshot.samples[0]).toMatchObject({
      commandKind: "other",
      durationMs: 0,
      outcome: "failure",
      outputBytes: 0,
      recordedAtMs: 0
    });
    expect(snapshot.samples[1]).toMatchObject({ refreshKind: "other" });
  });

  it("collects Electron metrics only for an active on-demand snapshot", () => {
    const getAppMetrics = vi.fn(() => [{
      type: "Tab",
      serviceName: "sensitive-service-name",
      cpu: { percentCPUUsage: 3.7, idleWakeupsPerSecond: 2.2 },
      memory: { workingSetSize: 1_024, peakWorkingSetSize: 2_048, privateBytes: 512 }
    }]);
    const diagnostics = new PerformanceDiagnostics({ appMetricsSource: { getAppMetrics } });

    expect(getAppMetrics).not.toHaveBeenCalled();
    expect(diagnostics.hasActiveSessions).toBe(false);

    const session = diagnostics.openSession();
    expect(diagnostics.hasActiveSessions).toBe(true);
    const snapshot = session.snapshot();
    expect(getAppMetrics).toHaveBeenCalledTimes(1);
    expect(snapshot.processMetricsStatus).toBe("available");
    expect(snapshot.processMetrics).toEqual([{
      processKind: "renderer",
      percentCpuUsage: 4,
      idleWakeupsPerSecond: 2,
      workingSetKilobytes: 1_024,
      peakWorkingSetKilobytes: 2_048,
      privateKilobytes: 512
    }]);
    expect(JSON.stringify(snapshot)).not.toContain("sensitive-service-name");

    session.close();
    session.close();
    expect(diagnostics.hasActiveSessions).toBe(false);
    expect(() => session.snapshot()).toThrow("session is closed");
    expect(getAppMetrics).toHaveBeenCalledTimes(1);
  });

  it("bounds Electron process metrics in each snapshot", () => {
    const metricCount = PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT + 3;
    const diagnostics = new PerformanceDiagnostics({
      appMetricsSource: {
        getAppMetrics: () => Array.from({ length: metricCount }, () => ({ type: "Utility" }))
      }
    });
    const session = diagnostics.openSession();

    const snapshot = session.snapshot();

    expect(snapshot.processMetrics).toHaveLength(PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT);
    expect(snapshot.processMetricLimit).toBe(PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT);
    expect(snapshot.droppedProcessMetricCount).toBe(3);
    session.close();
  });

  it("isolates Electron metric failures", () => {
    const diagnostics = new PerformanceDiagnostics({
      appMetricsSource: { getAppMetrics: () => { throw new Error("metric failure"); } }
    });
    const session = diagnostics.openSession();

    expect(session.snapshot()).toMatchObject({
      processMetrics: [],
      processMetricsStatus: "unavailable"
    });
    session.close();
  });

  it("validates the retained sample limit and clears retained data", () => {
    expect(() => new PerformanceDiagnostics({ sampleLimit: 0 })).toThrow(RangeError);
    expect(() => new PerformanceDiagnostics({ sampleLimit: 1.5 })).toThrow(RangeError);

    const diagnostics = new PerformanceDiagnostics({ sampleLimit: 1 });
    diagnostics.recordQueueDepth(1);
    diagnostics.recordQueueDepth(2);
    diagnostics.clear();
    const session = diagnostics.openSession();
    expect(session.snapshot()).toMatchObject({ samples: [], droppedSampleCount: 0 });
    session.close();
  });

  it("keeps one diagnostics session per owner and closes all sessions", () => {
    const getAppMetrics = vi.fn(() => []);
    const diagnostics = new PerformanceDiagnostics({ appMetricsSource: { getAppMetrics } });
    const sessions = new PerformanceDiagnosticsSessionRegistry(diagnostics);
    const firstOwner = {};
    const secondOwner = {};

    sessions.start(firstOwner);
    sessions.start(firstOwner);
    sessions.start(secondOwner);

    expect(sessions.size).toBe(2);
    expect(getAppMetrics).toHaveBeenCalledTimes(3);
    sessions.stop(firstOwner);
    sessions.stop(firstOwner);
    expect(sessions.has(firstOwner)).toBe(false);
    expect(sessions.size).toBe(1);

    sessions.stopAll();
    expect(sessions.size).toBe(0);
    expect(diagnostics.hasActiveSessions).toBe(false);
    expect(() => sessions.snapshot(secondOwner)).toThrow("not active");
  });
});
