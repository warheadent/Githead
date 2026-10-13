import { useState, type ReactNode } from "react";
import type { GitFileHistoryEntry } from "../shared/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { FileVersionList, HistoricalFileLayout } from "./HistoricalFileLayout";
import { LoadingState } from "./LoadingState";

export interface FileHistoryViewProps {
  path: string;
  entries: GitFileHistoryEntry[];
  selectedHash: string | null;
  loading: boolean;
  error: string;
  hasMore: boolean;
  diffContent: ReactNode;
  onBack: () => void;
  onOpenRepositoryHistory: () => void;
  onRetry: () => void;
  onSelect: (entry: GitFileHistoryEntry) => void;
  onBlame: (entry: GitFileHistoryEntry) => void;
}

export function FileHistoryView({ path, entries, selectedHash, loading, error, hasMore, diffContent, onBack, onOpenRepositoryHistory, onRetry, onSelect, onBlame }: FileHistoryViewProps): ReactNode {
  const selected = entries.find((entry) => entry.hash === selectedHash) ?? null;
  const [detailOpen, setDetailOpen] = useState(false);
  const blameDisabled = !selected || selected.status === "D";
  const list = (
    <div className="file-history-column">
      {loading && entries.length === 0 ? <LoadingState label="Loading file history" /> : null}
      {error && entries.length === 0 ? (
        <EmptyState tone="error" role="alert" title={error} action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>} />
      ) : null}
      {!loading && !error && entries.length === 0 ? <EmptyState title="No history is available for this file." /> : null}
      {entries.length > 0 ? (
        <FileVersionList
          path={path}
          entries={entries}
          selectedHash={selectedHash}
          onSelect={(entry) => {
            setDetailOpen(true);
            onSelect(entry);
          }}
        />
      ) : null}
      {hasMore ? <p className="file-history-limit" role="status">Showing the newest 200 changes for this file.</p> : null}
      {loading && entries.length > 0 ? <span className="sr-only" role="status">Refreshing file history</span> : null}
    </div>
  );
  return (
    <HistoricalFileLayout
      label={`File history for ${path}`}
      path={path}
      mode="file"
      busy={loading}
      backLabel="Back"
      onBack={onBack}
      onOpenRepositoryHistory={onOpenRepositoryHistory}
      fileHistoryDisabled={false}
      blameDisabled={blameDisabled}
      // The File history segment is the active one here, so it never fires.
      onShowFileHistory={() => undefined}
      onShowBlame={() => {
        if (selected && !blameDisabled) onBlame(selected);
      }}
      list={list}
      detail={diffContent}
      detailOpen={detailOpen && selected !== null}
      onCloseDetail={() => setDetailOpen(false)}
    />
  );
}
