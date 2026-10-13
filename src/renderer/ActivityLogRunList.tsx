import { CircleCheck, CircleX, Clipboard, Loader2, ScrollText } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatActivityAction, formatOutcome, isActivityLogRunFailed, type ActivityLogRun } from "./activityLog";

/** Formatters are built once; constructing them per row on every streamed event is costly. */
const RUN_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const RUN_TITLE_FORMAT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });

/** The list column of the Activity log: an "All output" entry, then every run, newest first. */
export const ActivityLogRunList = memo(function ActivityLogRunList({
  runs,
  selectedRunId,
  onSelect,
  onCopyRun
}: {
  /** Runs in the order they started, oldest first. */
  runs: readonly ActivityLogRun[];
  /** The run that the detail shows, or null for all output. */
  selectedRunId: string | null;
  onSelect: (runId: string | null) => void;
  onCopyRun: (runId: string) => void;
}): ReactNode {
  const newestFirst = [...runs].reverse();

  return (
    <div className="activity-run-list">
      {/* The labelled list is also the scroll restoration target. */}
      <div role="list" aria-label="Activity runs" className="activity-run-list-items">
        <div role="listitem" className={`activity-run-row${selectedRunId === null ? " is-selected" : ""}`} aria-current={selectedRunId === null ? "true" : undefined}>
          <button type="button" className="activity-run-row-button" aria-pressed={selectedRunId === null} onClick={() => onSelect(null)}>
            <span className="activity-run-row-icon" aria-hidden="true"><ScrollText /></span>
            <span className="activity-run-row-body">
              <span className="activity-run-row-title">All output</span>
              <span className="activity-run-row-caption">{runs.length === 1 ? "1 run" : `${runs.length} runs`}</span>
            </span>
          </button>
        </div>
        {newestFirst.map((run) => (
          <ActivityLogRunRow key={run.id} run={run} selected={run.id === selectedRunId} onSelect={onSelect} onCopyRun={onCopyRun} />
        ))}
      </div>
    </div>
  );
});

/**
 * Memoized so a streamed output event re-renders only the run it changed: the log keeps the
 * identity of unchanged runs and the callbacks are stable.
 */
const ActivityLogRunRow = memo(function ActivityLogRunRow({ run, selected, onSelect, onCopyRun }: {
  run: ActivityLogRun;
  selected: boolean;
  onSelect: (runId: string) => void;
  onCopyRun: (runId: string) => void;
}): ReactNode {
  const failed = isActivityLogRunFailed(run);
  const running = run.exitCode === null || !run.endedAt;
  const startedAt = new Date(run.startedAt);
  const validStart = Number.isFinite(startedAt.getTime());

  return (
    <div role="listitem" className={`activity-run-row${selected ? " is-selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <button type="button" className="activity-run-row-button" aria-pressed={selected} onClick={() => onSelect(run.id)}>
        <span className="activity-run-row-icon" data-outcome={running ? "running" : failed ? "failed" : "succeeded"} aria-hidden="true">
          {running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : failed ? <CircleX /> : <CircleCheck />}
        </span>
        <span className="activity-run-row-body">
          <span className="activity-run-row-title">{formatActivityAction(run.action)}</span>
          <span className="activity-run-row-caption" data-failed={failed}>{formatOutcome(run)}</span>
        </span>
        {validStart ? (
          <time className="activity-run-row-time" dateTime={run.startedAt} title={RUN_TITLE_FORMAT.format(startedAt)}>
            {RUN_TIME_FORMAT.format(startedAt)}
          </time>
        ) : null}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="activity-run-row-copy"
        aria-label={`Copy ${run.action} run`}
        title="Copy this run's output"
        onClick={() => onCopyRun(run.id)}
      >
        <Clipboard />
      </Button>
    </div>
  );
});
