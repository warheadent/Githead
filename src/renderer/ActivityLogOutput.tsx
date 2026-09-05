import { ArrowDown, ChevronDown, ChevronRight, Clipboard } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityLogBlock, ActivityLogRun, ActivityLogState } from "./activityLog";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

type LogRow = { key: string; block: ActivityLogBlock; run?: never } | { key: string; run: ActivityLogRun; block?: never };
interface PositionedRow { row: LogRow; top: number; height: number }

export function ActivityLogOutput({ log, wrapLines, onCopyRun }: {
  log: ActivityLogState;
  wrapLines: boolean;
  onCopyRun: (runId: string) => void;
}): ReactNode {
  const outputRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = usePersistentWorkspacePanelState<string[]>("activity-collapsed-runs", []);
  const [following, setFollowing] = usePersistentWorkspacePanelState("activity-follow-output", true);
  const followingRef = useRef(following);
  followingRef.current = following;
  const [viewport, setViewport] = useState({ top: 0, height: 600, width: 0 });
  const [measurements, setMeasurements] = useState<Map<string, { height: number; width: number; wrapped: boolean; content: unknown }>>(() => new Map());
  const programmaticScrollTop = useRef<number | null>(null);
  const previousLayout = useRef<PositionedRow[]>([]);
  const rows = useMemo(() => {
    const byRun = new Map<string, ActivityLogBlock[]>();
    for (const block of log.blocks) {
      const blocks = byRun.get(block.runId) ?? [];
      blocks.push(block);
      byRun.set(block.runId, blocks);
    }
    const result: LogRow[] = [];
    for (const block of log.blocks) if (block.kind === "notice") result.push({ key: `block-${block.id}`, block });
    for (const run of log.runs) {
      result.push({ key: `run-${run.id}`, run });
      if (!collapsed.includes(run.id)) {
        for (const block of byRun.get(run.id) ?? []) result.push({ key: `block-${block.id}`, block });
      }
    }
    return result;
  }, [log.blocks, log.runs, collapsed]);

  const layout = useMemo(() => {
    let top = 0;
    return rows.map((row) => {
      const measurement = measurements.get(row.key);
      const content = row.block?.html ?? row.run?.endedAt;
      const height = measurement && measurement.width === viewport.width && measurement.wrapped === wrapLines && measurement.content === content
        ? measurement.height
        : estimateHeight(row, wrapLines, viewport.width);
      const positioned = { row, top, height };
      top += height;
      return positioned;
    });
  }, [rows, measurements, viewport.width, wrapLines]);
  const totalHeight = layout.at(-1) ? layout.at(-1)!.top + layout.at(-1)!.height : 0;
  const visible = layout.filter(({ top, height }) => top + height >= viewport.top - 600 && top <= viewport.top + viewport.height + 600);

  useLayoutEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    const old = previousLayout.current;
    if (followingRef.current) {
      output.scrollTop = Math.max(0, totalHeight - output.clientHeight);
    } else {
      const anchor = old.find(({ top, height }) => top <= output.scrollTop && top + height > output.scrollTop);
      const next = anchor && layout.find(({ row }) => row.key === anchor.row.key);
      if (anchor && next) output.scrollTop += next.top - anchor.top;
    }
    programmaticScrollTop.current = output.scrollTop;
    previousLayout.current = layout;
    setViewport((current) => ({ ...current, top: output.scrollTop, height: output.clientHeight || current.height, width: output.clientWidth }));
  }, [layout, totalHeight, viewport.height]);

  useLayoutEffect(() => {
    const output = outputRef.current;
    if (!output || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const width = output.clientWidth;
      setViewport((current) => current.width === width && current.height === output.clientHeight ? current : { ...current, width, height: output.clientHeight });
      setMeasurements((current) => {
        let next = current;
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.logRow;
          const row = key && rows.find((item) => item.key === key);
          if (!key || !row) continue;
          const height = entry.target.getBoundingClientRect().height;
          const content = row.block?.html ?? row.run?.endedAt;
          const previous = current.get(key);
          if (height > 0 && (previous?.height !== height || previous.width !== width || previous.wrapped !== wrapLines || previous.content !== content)) {
            if (next === current) next = new Map(current);
            next.set(key, { height, width, wrapped: wrapLines, content });
          }
        }
        return next;
      });
    });
    observer.observe(output);
    for (const row of output.querySelectorAll("[data-log-row]")) observer.observe(row);
    return () => observer.disconnect();
  }, [rows, viewport.top, viewport.height, wrapLines]);

  useLayoutEffect(() => {
    const retained = new Set(rows.map((row) => row.key));
    setMeasurements((current) => {
      if ([...current.keys()].every((key) => retained.has(key))) return current;
      return new Map([...current].filter(([key]) => retained.has(key)));
    });
    const runIds = new Set(log.runs.map((run) => run.id));
    if (collapsed.some((id) => !runIds.has(id))) setCollapsed(collapsed.filter((id) => runIds.has(id)));
  }, [rows, log.runs, collapsed, setCollapsed]);

  const toggleRun = useCallback((id: string) => {
    // Collapsing output is an explicit reading action, so keep the selected header in place.
    setFollowing(false);
    setCollapsed((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, [setCollapsed, setFollowing]);

  const latestRun = log.runs.at(-1);
  return <>
    <span className="sr-only" role="status">{latestRun ? `${latestRun.action}: ${formatOutcome(latestRun)}` : ""}</span>
    <div ref={outputRef} data-workspace-scroll-key="activity-output"
      className={`log-output activity-log-output${wrapLines ? " is-wrapped" : ""}`} role="log" aria-label="Command output" tabIndex={0}
      aria-live="off" onScroll={(event) => {
        const output = event.currentTarget;
        const focused = document.activeElement;
        const focusedRow = focused instanceof HTMLElement ? focused.closest<HTMLElement>("[data-log-row]") : null;
        const position = focusedRow && layout.find(({ row }) => row.key === focusedRow.dataset.logRow);
        if (position && (position.top + position.height < output.scrollTop - 600 || position.top > output.scrollTop + output.clientHeight + 600)) output.focus({ preventScroll: true });
        setViewport((current) => ({ ...current, top: output.scrollTop }));
        if (programmaticScrollTop.current === null || Math.abs(programmaticScrollTop.current - output.scrollTop) > 1) {
          setFollowing(output.scrollHeight - output.scrollTop - output.clientHeight <= 12);
        }
        programmaticScrollTop.current = null;
      }}>
      {rows.length ? <div className="activity-log-virtual-space" role="list" style={{ height: totalHeight }}>
        {visible.map(({ row, top }) => <div key={row.key} data-log-row={row.key} className="activity-log-virtual-row" style={{ top }} role="listitem">
          {row.run ? <div className="activity-log-run-header">
            <Button variant="ghost" size="sm" aria-expanded={!collapsed.includes(row.run.id)} onClick={() => toggleRun(row.run.id)}>
              {collapsed.includes(row.run.id) ? <ChevronRight /> : <ChevronDown />}
              {row.run.action}
            </Button>
            <time dateTime={row.run.startedAt} title={new Date(row.run.startedAt).toLocaleString()}>{new Date(row.run.startedAt).toLocaleTimeString()}</time>
            <span className="activity-log-run-outcome" data-failed={row.run.exitCode !== null && row.run.exitCode !== 0}>
              {formatOutcome(row.run)}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={`Copy ${row.run.action} run`} onClick={() => onCopyRun(row.run.id)}><Clipboard /></Button>
          </div> : <ActivityLogBlockView block={row.block} />}
        </div>)}
      </div> : <div className="activity-log-empty">No command output yet.</div>}
    </div>
    {!following && rows.length > 0 ? <Button type="button" className="activity-log-jump" size="sm" onClick={() => {
      const output = outputRef.current;
      if (output) output.scrollTop = output.scrollHeight;
      setFollowing(true);
      setViewport((current) => ({ ...current, top: output?.scrollTop ?? 0 }));
    }}><ArrowDown />Jump to latest</Button> : null}
  </>;
}

const ActivityLogBlockView = memo(function ActivityLogBlockView({ block }: { block: ActivityLogBlock }): ReactNode {
  return <div className={`activity-log-block${block.kind === "notice" ? " activity-log-notice" : ""}`} data-stream={block.stream}>
    {block.kind === "output" ? <span className="activity-log-stream-label">{block.stream === "system" ? block.rawText.trimStart().startsWith(">") ? "cmd" : "sys" : block.stream}</span> : null}
    <span className="activity-log-line" dangerouslySetInnerHTML={{ __html: block.html || "&nbsp;" }} />
  </div>;
});

function formatOutcome(run: ActivityLogRun): string {
  if (run.exitCode === null || !run.endedAt) return "Running";
  const seconds = Math.max(0, Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000;
  const outcome = run.exitCode === 0 ? "Succeeded" : `Failed, code ${run.exitCode}`;
  return seconds > 0 ? `${outcome} · ${seconds.toFixed(1)}s` : outcome;
}

const estimatedBlockHeights = new WeakMap<ActivityLogBlock, { width: number; wrapped: boolean; height: number }>();

function estimateHeight(row: LogRow, wrapped: boolean, width: number): number {
  if (row.run) return 44;
  const previous = estimatedBlockHeights.get(row.block);
  if (previous && previous.width === width && previous.wrapped === wrapped) return previous.height;
  const columns = wrapped ? Math.max(20, Math.floor((width - 120) / 8)) : Infinity;
  const lines = row.block.rawText.replace(/\n$/, "").split("\n");
  const height = Math.max(24, lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / columns)), 0) * 24);
  estimatedBlockHeights.set(row.block, { width, wrapped, height });
  return height;
}
