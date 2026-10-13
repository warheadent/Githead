import { useCallback, useState, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { ActivityLogState } from "./activityLog";
import { formatActivityAction, formatOutcome, hasActivityLogOutput, isActivityLogRunFailed } from "./activityLog";
import { ActivityLogOutput } from "./ActivityLogOutput";
import { ActivityLogRunList } from "./ActivityLogRunList";
import { ListDetailLayout } from "./ListDetailLayout";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

/**
 * The stored selection when the newest run is selected. The selection then moves to each run that
 * starts later, so the detail keeps showing the latest output.
 */
const NEWEST_RUN = "\u0000newest";

interface ActivityLogViewProps {
  log: ActivityLogState;
  statusLabel: string;
  onClearLog: () => void;
  onCopyRawLog: (runId?: string) => void | Promise<void>;
}

export function ActivityLogView({
  log,
  statusLabel,
  onClearLog,
  onCopyRawLog
}: ActivityLogViewProps): ReactNode {
  const [wrapLines, setWrapLines] = usePersistentWorkspacePanelState("activity-wrap-lines", false);
  /** Null shows all output. A run id shows that run, and NEWEST_RUN follows the newest run. */
  const [storedSelection, setStoredSelection] = usePersistentWorkspacePanelState<string | null>("activity-selected-run", null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const hasOutput = hasActivityLogOutput(log);
  const hasRawText = log.rawTextLength > 0;
  const newestRunId = log.runs.at(-1)?.id ?? null;
  // A cleared or trimmed run falls back to all output.
  const selectedRun = storedSelection === null
    ? null
    : log.runs.find((run) => run.id === (storedSelection === NEWEST_RUN ? newestRunId : storedSelection)) ?? null;
  const allOutputTitle = hasOutput ? "Output Available" : "Empty";
  const failed = selectedRun ? isActivityLogRunFailed(selectedRun) : false;
  const startedAt = selectedRun ? new Date(selectedRun.startedAt) : null;

  const copy = useCallback(async (runId?: string): Promise<void> => {
    try {
      await onCopyRawLog(runId);
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus("Unable to copy output. Try again.");
    }
  }, [onCopyRawLog]);
  const copyRun = useCallback((runId: string) => { void copy(runId); }, [copy]);
  const selectRun = useCallback((runId: string | null) => {
    setStoredSelection(runId !== null && runId === newestRunId ? NEWEST_RUN : runId);
    setDetailOpen(true);
  }, [newestRunId, setStoredSelection]);

  return (
    <ListDetailLayout
      id="activity-log"
      listLabel="run list"
      detailCard={false}
      detailOpen={detailOpen}
      onBack={() => setDetailOpen(false)}
      list={<ActivityLogRunList runs={log.runs} selectedRunId={selectedRun?.id ?? null} onSelect={selectRun} onCopyRun={copyRun} />}
      detail={(
        <section className="activity-log-view" aria-label="Activity log">
          <header className="activity-log-header">
            <div className="min-w-0">
              {selectedRun ? (
                <>
                  <h2>{formatActivityAction(selectedRun.action)}</h2>
                  <p className="activity-log-status" data-failed={failed}>
                    {formatOutcome(selectedRun)}
                    {startedAt && Number.isFinite(startedAt.getTime()) ? ` · started ${startedAt.toLocaleTimeString()}` : null}
                  </p>
                </>
              ) : (
                <>
                  <h2>{allOutputTitle}</h2>
                  {statusLabel !== allOutputTitle ? <p className="activity-log-status">Status: {statusLabel}</p> : null}
                </>
              )}
            </div>
            <div className="activity-log-actions" role="group" aria-label="Activity log controls">
              <TooltipButton
                type="button"
                variant="outline"
                size="sm"
                aria-label={wrapLines ? "Disable line wrap" : "Enable line wrap"}
                aria-pressed={wrapLines}
                disabled={!hasOutput}
                tooltip={wrapLines ? "Disable line wrap" : "Enable line wrap"}
                disabledTooltip="Line wrapping is available when the log has output"
                onClick={() => {
                  setWrapLines((current) => !current);
                }}
              >
                Wrap
              </TooltipButton>
              <Button type="button" variant="outline" size="sm" disabled={!hasRawText} onClick={() => { void copy(); }}>
                Copy Raw
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!hasOutput} onClick={onClearLog}>
                Clear Log
              </Button>
            </div>
          </header>
          <span className="sr-only" role="status">{copyStatus}</span>
          <div className="activity-log-output-card">
            {/* A new key lays out the other selection from scratch: at its end while following, else at its top. */}
            <ActivityLogOutput key={selectedRun?.id ?? ""} log={log} wrapLines={wrapLines} runId={selectedRun?.id ?? null} onCopyRun={copyRun} />
          </div>
        </section>
      )}
    />
  );
}
