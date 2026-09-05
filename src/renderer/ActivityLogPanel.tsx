import { memo, useSyncExternalStore, type ReactNode } from "react";
import { ActivityLogView } from "./ActivityLogView";
import { hasActivityLogOutput } from "./activityLog";
import type { ActivityLogStore } from "./activityLogStore";

export const ActivityLogPanel = memo(function ActivityLogPanel({
  store,
  operationStatus,
  onCopyRawLog
}: {
  store: ActivityLogStore;
  operationStatus: string | null;
  onCopyRawLog: (runId?: string) => void | Promise<void>;
}): ReactNode {
  const log = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const statusLabel = operationStatus ?? (hasActivityLogOutput(log) ? "Output Available" : "Empty");

  return (
    <ActivityLogView
      log={log}
      statusLabel={statusLabel}
      onClearLog={() => store.clear()}
      onCopyRawLog={onCopyRawLog}
    />
  );
});
