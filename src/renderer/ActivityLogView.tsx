import { ArrowDown, Clipboard, Eraser, WrapText } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { ActivityLogBlock, ActivityLogState } from "./activityLog";
import { hasActivityLogOutput } from "./activityLog";
import { MotionPresence } from "./motion";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

interface ActivityLogViewProps {
  log: ActivityLogState;
  statusLabel: string;
  onClearLog: () => void;
  onCopyRawLog: () => void;
}

export function ActivityLogView({
  log,
  statusLabel,
  onClearLog,
  onCopyRawLog
}: ActivityLogViewProps): ReactNode {
  const outputRef = useRef<HTMLDivElement | null>(null);
  const [wrapLines, setWrapLines] = usePersistentWorkspacePanelState("activity-wrap-lines", false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const hasOutput = hasActivityLogOutput(log);
  const hasRawText = log.rawTextLength > 0;
  const title = hasOutput ? "Output Available" : "Empty";
  const showStatus = statusLabel !== title;

  useEffect(() => {
    if (!stickToBottom || !outputRef.current) {
      return;
    }

    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [log.version, stickToBottom]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    setStickToBottom(distanceFromBottom <= 12);
  }, []);

  const jumpToLatest = useCallback(() => {
    const output = outputRef.current;
    if (!output) {
      return;
    }

    output.scrollTop = output.scrollHeight;
    setStickToBottom(true);
  }, []);

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
          <Button type="button" variant="secondary" disabled={!hasRawText} onClick={onCopyRawLog}>
            <Clipboard />
            Copy Raw
          </Button>
          <Button type="button" variant="secondary" disabled={!hasOutput} onClick={onClearLog}>
            <Eraser />
            Clear Log
          </Button>
        </div>
      </div>
      <div
        ref={outputRef}
        data-workspace-scroll-key="activity-output"
        className={`log-output activity-log-output${wrapLines ? " is-wrapped" : ""}`}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={handleScroll}
      >
        {log.blocks.length > 0 ? (
          <div className="activity-log-blocks" role="list">
            {log.blocks.map((block) => (
              <ActivityLogBlockView key={block.id} block={block} />
            ))}
          </div>
        ) : (
          <div className="activity-log-empty">No command output yet.</div>
        )}
      </div>
      <MotionPresence
        present={hasOutput && !stickToBottom}
        className="activity-log-jump-presence"
        initialY={4}
        initialScale={0.97}
      >
        <Button type="button" className="activity-log-jump" size="sm" onClick={jumpToLatest}>
          <ArrowDown />
          Jump to latest
        </Button>
      </MotionPresence>
    </section>
  );
}

const ActivityLogBlockView = memo(function ActivityLogBlockView({ block }: { block: ActivityLogBlock }): ReactNode {
  if (block.kind === "notice") {
    return (
      <div className="activity-log-block activity-log-notice" role="listitem">
        <span className="activity-log-line" dangerouslySetInnerHTML={{ __html: block.html }} />
      </div>
    );
  }

  return (
    <div className="activity-log-block" data-stream={block.stream} role="listitem">
      <span className="activity-log-stream-label">{getStreamLabel(block)}</span>
      <span
        className="activity-log-line"
        dangerouslySetInnerHTML={{ __html: `<span class="sr-only">Stream ${getStreamLabel(block)}. </span>${block.html || "&nbsp;"}` }}
      />
    </div>
  );
});

function getStreamLabel(block: ActivityLogBlock): string {
  if (block.stream === "system") {
    return block.rawText.trimStart().startsWith(">") ? "cmd" : "sys";
  }

  return block.stream;
}
