import { Activity, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type {
  PerformanceCommandKind,
  PerformanceCommandSample,
  PerformanceDiagnosticSample,
  PerformanceDiagnosticsSnapshot,
  PerformanceProcessKind,
  PerformanceRefreshKind,
  PerformanceRefreshSample
} from "../shared/types";

const MAX_VISIBLE_PROCESS_METRICS = 64;
const MAX_VISIBLE_DIAGNOSTIC_SAMPLES = 600;

export interface PerformanceDiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandSummary {
  commandKind: PerformanceCommandKind;
  runCount: number;
  nonSuccessCount: number;
  totalDurationMs: number;
  maximumDurationMs: number;
  outputBytes: number;
  maximumQueueDepth: number;
}

interface RefreshSummary {
  refreshKind: PerformanceRefreshKind;
  requestCount: number;
  coalescedCount: number;
  maximumQueueDepth: number;
}

export function PerformanceDiagnosticsDialog({
  open,
  onOpenChange
}: PerformanceDiagnosticsDialogProps): ReactNode {
  const [snapshot, setSnapshot] = useState<PerformanceDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!open) {
      setSnapshot(null);
      setLoading(false);
      setRefreshing(false);
      setError("");
      setStatus("");
      return;
    }

    setSnapshot(null);
    setLoading(true);
    setRefreshing(false);
    setError("");
    setStatus("Githead loads diagnostics.");

    void window.githead.startPerformanceDiagnostics().then((nextSnapshot) => {
      if (requestGenerationRef.current !== requestGeneration) return;
      setSnapshot(nextSnapshot);
      setLoading(false);
      setStatus("Diagnostics are ready.");
    }).catch(() => {
      if (requestGenerationRef.current !== requestGeneration) return;
      setLoading(false);
      setError("Githead did not load performance diagnostics.");
      setStatus("");
    });

    return () => {
      requestGenerationRef.current += 1;
      void window.githead.stopPerformanceDiagnostics().catch(() => undefined);
    };
  }, [open]);

  const diagnosticSamples = useMemo(
    () => snapshot?.samples.slice(-MAX_VISIBLE_DIAGNOSTIC_SAMPLES) ?? [],
    [snapshot]
  );
  const commandSummaries = useMemo(
    () => summarizeCommands(diagnosticSamples),
    [diagnosticSamples]
  );
  const refreshSummaries = useMemo(
    () => summarizeRefreshes(diagnosticSamples),
    [diagnosticSamples]
  );
  const processMetricCount = Math.max(
    0,
    Math.min(snapshot?.processMetricLimit ?? 0, MAX_VISIBLE_PROCESS_METRICS)
  );
  const processMetrics = snapshot?.processMetrics.slice(
    0,
    processMetricCount
  ) ?? [];

  const refresh = async (): Promise<void> => {
    const requestGeneration = requestGenerationRef.current;
    setRefreshing(true);
    setError("");
    setStatus("Githead refreshes diagnostics.");
    try {
      const nextSnapshot = await window.githead.getPerformanceDiagnosticsSnapshot();
      if (requestGenerationRef.current !== requestGeneration) return;
      setSnapshot(nextSnapshot);
      setStatus("Diagnostics refreshed.");
    } catch {
      if (requestGenerationRef.current !== requestGeneration) return;
      setError("Githead did not refresh performance diagnostics.");
      setStatus("");
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setRefreshing(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(860px,calc(100vh-2rem))] flex-col overflow-hidden p-0 sm:max-w-4xl"
        aria-busy={loading || refreshing}
      >
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            <DialogTitle>Performance Diagnostics</DialogTitle>
          </div>
          <DialogDescription>
            Githead keeps bounded command summaries. It collects process metrics only while this dialog is open.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Retained samples"
                value={snapshot ? `${snapshot.samples.length} of ${snapshot.retainedSampleLimit}` : "Not available"}
              />
              <SummaryCard
                label="Dropped samples"
                value={snapshot ? formatInteger(snapshot.droppedSampleCount) : "Not available"}
              />
              <SummaryCard
                label="Process metrics"
                value={snapshot?.processMetricsStatus === "available" ? "Available" : "Not available"}
              />
            </div>

            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {!error && loading ? <p className="text-sm text-muted-foreground">Githead loads diagnostics.</p> : null}

            {snapshot ? (
              <>
                <DiagnosticsSection
                  heading="Command summary"
                  description="The table groups bounded command samples by command type."
                >
                  {commandSummaries.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <caption className="sr-only">Command performance summary</caption>
                        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <TableHeading>Type</TableHeading>
                            <TableHeading align="right">Runs</TableHeading>
                            <TableHeading align="right">Not successful</TableHeading>
                            <TableHeading align="right">Average time</TableHeading>
                            <TableHeading align="right">Maximum time</TableHeading>
                            <TableHeading align="right">Output</TableHeading>
                            <TableHeading align="right">Peak queue</TableHeading>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {commandSummaries.map((summary) => (
                            <tr key={summary.commandKind}>
                              <TableCell><Badge variant="outline">{formatCommandKind(summary.commandKind)}</Badge></TableCell>
                              <TableCell align="right">{formatInteger(summary.runCount)}</TableCell>
                              <TableCell align="right">{formatInteger(summary.nonSuccessCount)}</TableCell>
                              <TableCell align="right">{formatDuration(summary.totalDurationMs / summary.runCount)}</TableCell>
                              <TableCell align="right">{formatDuration(summary.maximumDurationMs)}</TableCell>
                              <TableCell align="right">{formatBytes(summary.outputBytes)}</TableCell>
                              <TableCell align="right">{formatInteger(summary.maximumQueueDepth)}</TableCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <EmptySummary>No command samples are available.</EmptySummary>}
                </DiagnosticsSection>

                <DiagnosticsSection
                  heading="Refresh summary"
                  description="The table groups refresh requests and merged requests by refresh type."
                >
                  {refreshSummaries.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[480px] text-left text-sm">
                        <caption className="sr-only">Refresh performance summary</caption>
                        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <TableHeading>Type</TableHeading>
                            <TableHeading align="right">Requests</TableHeading>
                            <TableHeading align="right">Merged</TableHeading>
                            <TableHeading align="right">Peak queue</TableHeading>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {refreshSummaries.map((summary) => (
                            <tr key={summary.refreshKind}>
                              <TableCell><Badge variant="outline">{formatRefreshKind(summary.refreshKind)}</Badge></TableCell>
                              <TableCell align="right">{formatInteger(summary.requestCount)}</TableCell>
                              <TableCell align="right">{formatInteger(summary.coalescedCount)}</TableCell>
                              <TableCell align="right">{formatInteger(summary.maximumQueueDepth)}</TableCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <EmptySummary>No refresh samples are available.</EmptySummary>}
                </DiagnosticsSection>

                <DiagnosticsSection
                  heading="Process summary"
                  description="The table shows the current Electron process metrics."
                >
                  {snapshot.processMetricsStatus === "available" && processMetrics.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <caption className="sr-only">Electron process performance summary</caption>
                        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <TableHeading>Type</TableHeading>
                            <TableHeading align="right">CPU</TableHeading>
                            <TableHeading align="right">Working set</TableHeading>
                            <TableHeading align="right">Peak working set</TableHeading>
                            <TableHeading align="right">Private memory</TableHeading>
                            <TableHeading align="right">Idle wakeups</TableHeading>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {processMetrics.map((metric, index) => (
                            <tr key={`${metric.processKind}-${index}`}>
                              <TableCell><Badge variant="outline">{formatProcessKind(metric.processKind)}</Badge></TableCell>
                              <TableCell align="right">{formatPercent(metric.percentCpuUsage)}</TableCell>
                              <TableCell align="right">{formatKilobytes(metric.workingSetKilobytes)}</TableCell>
                              <TableCell align="right">{formatKilobytes(metric.peakWorkingSetKilobytes)}</TableCell>
                              <TableCell align="right">{formatKilobytes(metric.privateKilobytes)}</TableCell>
                              <TableCell align="right">{formatRate(metric.idleWakeupsPerSecond)}</TableCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <EmptySummary>Process metrics are not available.</EmptySummary>}
                  {snapshot.droppedProcessMetricCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Githead omitted {formatInteger(snapshot.droppedProcessMetricCount)} process metrics from this bounded snapshot.
                    </p>
                  ) : null}
                </DiagnosticsSection>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:items-center sm:justify-between">
          <p className="min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button type="button" onClick={() => void refresh()} disabled={loading || refreshing || snapshot === null}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
              {refreshing ? "Refresh in progress" : "Refresh"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DiagnosticsSection({
  heading,
  description,
  children
}: {
  heading: string;
  description: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="grid gap-3" aria-labelledby={`performance-${heading.toLocaleLowerCase().replaceAll(" ", "-")}`}>
      <div>
        <h2 id={`performance-${heading.toLocaleLowerCase().replaceAll(" ", "-")}`} className="text-sm font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptySummary({ children }: { children: ReactNode }): ReactNode {
  return <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

function TableHeading({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }): ReactNode {
  return <th scope="col" className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function TableCell({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }): ReactNode {
  return <td className={`px-3 py-2 tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function summarizeCommands(samples: PerformanceDiagnosticSample[]): CommandSummary[] {
  const summaries = new Map<PerformanceCommandKind, CommandSummary>();
  for (const sample of samples) {
    if (sample.type !== "command") continue;
    const summary = summaries.get(sample.commandKind) ?? createCommandSummary(sample.commandKind);
    addCommandSample(summary, sample);
    summaries.set(sample.commandKind, summary);
  }
  return [...summaries.values()].sort((left, right) => right.totalDurationMs - left.totalDurationMs);
}

function createCommandSummary(commandKind: PerformanceCommandKind): CommandSummary {
  return {
    commandKind,
    runCount: 0,
    nonSuccessCount: 0,
    totalDurationMs: 0,
    maximumDurationMs: 0,
    outputBytes: 0,
    maximumQueueDepth: 0
  };
}

function addCommandSample(summary: CommandSummary, sample: PerformanceCommandSample): void {
  summary.runCount += 1;
  summary.nonSuccessCount += sample.outcome === "success" ? 0 : 1;
  summary.totalDurationMs += sample.durationMs;
  summary.maximumDurationMs = Math.max(summary.maximumDurationMs, sample.durationMs);
  summary.outputBytes += sample.outputBytes;
  summary.maximumQueueDepth = Math.max(summary.maximumQueueDepth, sample.queueDepth);
}

function summarizeRefreshes(samples: PerformanceDiagnosticSample[]): RefreshSummary[] {
  const summaries = new Map<PerformanceRefreshKind, RefreshSummary>();
  for (const sample of samples) {
    if (sample.type !== "refresh") continue;
    const summary = summaries.get(sample.refreshKind) ?? createRefreshSummary(sample.refreshKind);
    addRefreshSample(summary, sample);
    summaries.set(sample.refreshKind, summary);
  }
  return [...summaries.values()].sort((left, right) => right.requestCount - left.requestCount);
}

function createRefreshSummary(refreshKind: PerformanceRefreshKind): RefreshSummary {
  return { refreshKind, requestCount: 0, coalescedCount: 0, maximumQueueDepth: 0 };
}

function addRefreshSample(summary: RefreshSummary, sample: PerformanceRefreshSample): void {
  summary.requestCount += sample.refreshRequestCount;
  summary.coalescedCount += sample.refreshCoalescedCount;
  summary.maximumQueueDepth = Math.max(summary.maximumQueueDepth, sample.queueDepth);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatDuration(value: number): string {
  if (value < 1_000) return `${formatInteger(value)} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${formatInteger(value)} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MiB`;
  return `${(value / 1_073_741_824).toFixed(1)} GiB`;
}

function formatKilobytes(value: number): string {
  if (value < 1_024) return `${formatInteger(value)} KiB`;
  return `${(value / 1_024).toFixed(1)} MiB`;
}

function formatPercent(value: number): string {
  return `${formatInteger(value)}%`;
}

function formatRate(value: number): string {
  return `${formatInteger(value)}/s`;
}

function formatCommandKind(kind: PerformanceCommandKind): string {
  switch (kind) {
    case "ai": return "AI";
    case "configured-action": return "Configured action";
    case "github": return "GitHub";
    case "git": return "Git";
    case "lore": return "Lore";
    case "system": return "System";
    case "other": return "Other";
  }
}

function formatRefreshKind(kind: PerformanceRefreshKind): string {
  switch (kind) {
    case "github": return "GitHub";
    case "metadata": return "Metadata";
    case "references": return "References";
    case "snapshot": return "Snapshot";
    case "status": return "Status";
    case "other": return "Other";
  }
}

function formatProcessKind(kind: PerformanceProcessKind): string {
  switch (kind) {
    case "browser": return "Main";
    case "renderer": return "Renderer";
    case "gpu": return "GPU";
    case "utility": return "Utility";
    case "other": return "Other";
  }
}
