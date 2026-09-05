import { Clipboard, Eraser, WrapText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { ActivityLogState } from "./activityLog";
import { hasActivityLogOutput } from "./activityLog";
import { ActivityLogOutput } from "./ActivityLogOutput";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

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
  const [copyStatus, setCopyStatus] = useState("");
  const hasOutput = hasActivityLogOutput(log);
  const hasRawText = log.rawTextLength > 0;
  const title = hasOutput ? "Output Available" : "Empty";
  const showStatus = statusLabel !== title;
  const copy = async (runId?: string): Promise<void> => {
    try {
      await onCopyRawLog(runId);
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus("Unable to copy output. Try again.");
    }
  };

  return (
    <section className="activity-log-view" aria-label="Activity log">
      <div className="activity-log-header">
        <div className="min-w-0">
          <p className="eyebrow">Activity Log</p>
          <h2 className="text-sm font-semibold">{title}</h2>
          {showStatus ? <p className="activity-log-status">Status: {statusLabel}</p> : null}
        </div>
        <div className="activity-log-actions" aria-label="Activity log controls">
          <TooltipButton
                type="button"
                variant={wrapLines ? "default" : "secondary"}
                size="icon-sm"
                aria-label={wrapLines ? "Disable line wrap" : "Enable line wrap"}
                aria-pressed={wrapLines}
                disabled={!hasOutput}
                tooltip={wrapLines ? "Disable line wrap" : "Enable line wrap"}
                disabledTooltip="Line wrapping is available when the log has output"
                onClick={() => {
                  setWrapLines((current) => !current);
                }}
              >
                <WrapText />
          </TooltipButton>
          <Button type="button" variant="secondary" disabled={!hasRawText} onClick={() => { void copy(); }}>
            <Clipboard />
            Copy Raw
          </Button>
          <Button type="button" variant="secondary" disabled={!hasOutput} onClick={onClearLog}>
            <Eraser />
            Clear Log
          </Button>
        </div>
      </div>
      <span className="sr-only" role="status">{copyStatus}</span>
      <ActivityLogOutput log={log} wrapLines={wrapLines} onCopyRun={(runId) => { void copy(runId); }} />
    </section>
  );
}
