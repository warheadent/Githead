import {
  PERFORMANCE_COMMAND_KINDS,
  PERFORMANCE_COMMAND_OUTCOMES,
  PERFORMANCE_REFRESH_KINDS,
  type PerformanceCommandKind,
  type PerformanceCommandOutcome,
  type PerformanceDiagnosticSample,
  type PerformanceDiagnosticsSnapshot,
  type PerformanceProcessKind,
  type PerformanceProcessMetric,
  type PerformanceRefreshRecord,
  type PerformanceRefreshKind
} from "../shared/types";

export const DEFAULT_PERFORMANCE_DIAGNOSTIC_SAMPLE_LIMIT = 600;
export const PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT = 64;

interface ElectronProcessMetricLike {
  type?: string;
  cpu?: {
    percentCPUUsage?: number;
    idleWakeupsPerSecond?: number;
  };
  memory?: {
    workingSetSize?: number;
    peakWorkingSetSize?: number;
    privateBytes?: number;
  };
}

export interface ElectronAppMetricsSource {
  getAppMetrics(): ElectronProcessMetricLike[];
}

export interface RecordPerformanceCommandInput {
  commandKind: PerformanceCommandKind;
  durationMs: number;
  outcome: PerformanceCommandOutcome;
  outputBytes: number;
  queueDepth?: number;
}

export interface PerformanceDiagnosticsOptions {
  sampleLimit?: number;
  now?: () => number;
  appMetricsSource?: ElectronAppMetricsSource;
}

export interface PerformanceDiagnosticsSession {
  snapshot(): PerformanceDiagnosticsSnapshot;
  close(): void;
}

export class PerformanceDiagnosticsSessionRegistry<Owner extends object> {
  private readonly sessions = new Map<Owner, PerformanceDiagnosticsSession>();

  constructor(private readonly diagnostics: PerformanceDiagnostics) {}

  start(owner: Owner): PerformanceDiagnosticsSnapshot {
    let session = this.sessions.get(owner);
    if (!session) {
      session = this.diagnostics.openSession();
      this.sessions.set(owner, session);
    }
    return session.snapshot();
  }

  snapshot(owner: Owner): PerformanceDiagnosticsSnapshot {
    const session = this.sessions.get(owner);
    if (!session) {
      throw new Error("Performance diagnostics are not active for this renderer.");
    }
    return session.snapshot();
  }

  stop(owner: Owner): void {
    const session = this.sessions.get(owner);
    if (!session) return;
    this.sessions.delete(owner);
    session.close();
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  has(owner: Owner): boolean {
    return this.sessions.has(owner);
  }

  get size(): number {
    return this.sessions.size;
  }
}

/**
 * Stores only bounded numeric measurements and fixed-cardinality labels.
 * This type has no fields for paths, repository names, or command text.
 */
export class PerformanceDiagnostics {
  private readonly samples: BoundedRing<PerformanceDiagnosticSample>;
  private readonly now: () => number;
  private readonly appMetricsSource: ElectronAppMetricsSource | undefined;
  private nextSequence = 1;
  private droppedSampleCount = 0;
  private activeSessionCount = 0;

  constructor(options: PerformanceDiagnosticsOptions = {}) {
    const sampleLimit = options.sampleLimit ?? DEFAULT_PERFORMANCE_DIAGNOSTIC_SAMPLE_LIMIT;
    this.samples = new BoundedRing(sampleLimit);
    this.now = options.now ?? Date.now;
    this.appMetricsSource = options.appMetricsSource;
  }

  recordCommand(input: RecordPerformanceCommandInput): void {
    this.push({
      type: "command",
      sequence: this.nextSequence++,
      recordedAtMs: normalizeMeasurement(this.now()),
      commandKind: normalizeCommandKind(input.commandKind),
      durationMs: normalizeMeasurement(input.durationMs),
      outcome: normalizeCommandOutcome(input.outcome),
      outputBytes: normalizeMeasurement(input.outputBytes),
      queueDepth: normalizeMeasurement(input.queueDepth ?? 0)
    });
  }

  recordQueueDepth(queueDepth: number): void {
    this.push({
      type: "queue",
      sequence: this.nextSequence++,
      recordedAtMs: normalizeMeasurement(this.now()),
      queueDepth: normalizeMeasurement(queueDepth)
    });
  }

  recordRefresh(input: PerformanceRefreshRecord): void {
    const requestCount = normalizeMeasurement(input.requestCount);
    const coalescedCount = Math.min(
      requestCount,
      normalizeMeasurement(input.coalescedCount)
    );
    this.push({
      type: "refresh",
      sequence: this.nextSequence++,
      recordedAtMs: normalizeMeasurement(this.now()),
      refreshKind: normalizeRefreshKind(input.refreshKind),
      refreshRequestCount: requestCount,
      refreshCoalescedCount: coalescedCount,
      queueDepth: normalizeMeasurement(input.queueDepth)
    });
  }

  openSession(): PerformanceDiagnosticsSession {
    this.activeSessionCount += 1;
    let closed = false;
    return {
      snapshot: () => {
        if (closed) {
          throw new Error("The performance diagnostics session is closed.");
        }
        return this.createSnapshot();
      },
      close: () => {
        if (closed) return;
        closed = true;
        this.activeSessionCount -= 1;
      }
    };
  }

  clear(): void {
    this.samples.clear();
    this.droppedSampleCount = 0;
  }

  get retainedSampleCount(): number {
    return this.samples.size;
  }

  get hasActiveSessions(): boolean {
    return this.activeSessionCount > 0;
  }

  private push(sample: PerformanceDiagnosticSample): void {
    if (this.samples.push(Object.freeze(sample))) {
      this.droppedSampleCount += 1;
    }
  }

  private createSnapshot(): PerformanceDiagnosticsSnapshot {
    let processMetrics: PerformanceProcessMetric[] = [];
    let droppedProcessMetricCount = 0;
    let processMetricsStatus: PerformanceDiagnosticsSnapshot["processMetricsStatus"] = "unavailable";
    if (this.activeSessionCount > 0 && this.appMetricsSource) {
      try {
        const electronMetrics = this.appMetricsSource.getAppMetrics();
        droppedProcessMetricCount = Math.max(
          0,
          electronMetrics.length - PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT
        );
        processMetrics = electronMetrics
          .slice(0, PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT)
          .map(normalizeProcessMetric);
        processMetricsStatus = "available";
      } catch {
        // Diagnostics must not affect the application when Electron metrics fail.
      }
    }
    return {
      samples: this.samples.values(),
      processMetrics,
      processMetricsStatus,
      processMetricLimit: PERFORMANCE_DIAGNOSTIC_PROCESS_METRIC_LIMIT,
      droppedProcessMetricCount,
      retainedSampleLimit: this.samples.capacity,
      droppedSampleCount: this.droppedSampleCount
    };
  }
}

class BoundedRing<T> {
  private readonly items: Array<T | undefined>;
  private start = 0;
  private itemCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("The performance diagnostics sample limit must be a positive integer.");
    }
    this.items = Array.from<T | undefined>({ length: capacity });
  }

  get size(): number {
    return this.itemCount;
  }

  push(value: T): boolean {
    const replaced = this.itemCount === this.capacity;
    if (replaced) {
      this.items[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
      return true;
    }
    this.items[(this.start + this.itemCount) % this.capacity] = value;
    this.itemCount += 1;
    return false;
  }

  values(): T[] {
    return Array.from({ length: this.itemCount }, (_unused, index) => {
      const value = this.items[(this.start + index) % this.capacity];
      if (value === undefined) {
        throw new Error("The performance diagnostics ring is inconsistent.");
      }
      return value;
    });
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.itemCount = 0;
  }
}

function normalizeMeasurement(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value));
}

function normalizeCommandKind(value: PerformanceCommandKind): PerformanceCommandKind {
  return includes(PERFORMANCE_COMMAND_KINDS, value) ? value : "other";
}

function normalizeCommandOutcome(value: PerformanceCommandOutcome): PerformanceCommandOutcome {
  return includes(PERFORMANCE_COMMAND_OUTCOMES, value) ? value : "failure";
}

function normalizeRefreshKind(value: PerformanceRefreshKind): PerformanceRefreshKind {
  return includes(PERFORMANCE_REFRESH_KINDS, value) ? value : "other";
}

function includes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}

function normalizeProcessMetric(metric: ElectronProcessMetricLike): PerformanceProcessMetric {
  return {
    processKind: normalizeProcessKind(metric.type),
    percentCpuUsage: normalizeMeasurement(metric.cpu?.percentCPUUsage ?? 0),
    idleWakeupsPerSecond: normalizeMeasurement(metric.cpu?.idleWakeupsPerSecond ?? 0),
    workingSetKilobytes: normalizeMeasurement(metric.memory?.workingSetSize ?? 0),
    peakWorkingSetKilobytes: normalizeMeasurement(metric.memory?.peakWorkingSetSize ?? 0),
    privateKilobytes: normalizeMeasurement(metric.memory?.privateBytes ?? 0)
  };
}

function normalizeProcessKind(value: string | undefined): PerformanceProcessKind {
  switch (value?.trim().toLocaleLowerCase()) {
    case "browser":
      return "browser";
    case "tab":
    case "renderer":
      return "renderer";
    case "gpu":
    case "gpu process":
      return "gpu";
    case "utility":
    case "utility process":
      return "utility";
    default:
      return "other";
  }
}
