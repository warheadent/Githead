import { ArrowLeft, GitFork, History } from "lucide-react";
import type { ReactNode } from "react";
import type { GitFileHistoryEntry } from "../shared/types";
import { Button } from "@/components/ui/button";
import { TooltipTarget } from "@/components/ui/tooltip";

export interface FileHistoryViewProps {
  path: string;
  entries: GitFileHistoryEntry[];
  selectedHash: string | null;
  loading: boolean;
  error: string;
  hasMore: boolean;
  diffContent: ReactNode;
  onBack: () => void;
  onRetry: () => void;
  onSelect: (entry: GitFileHistoryEntry) => void;
  onBlame: (entry: GitFileHistoryEntry) => void;
}

export function FileHistoryView({ path, entries, selectedHash, loading, error, hasMore, diffContent, onBack, onRetry, onSelect, onBlame }: FileHistoryViewProps): ReactNode {
  const selected = entries.find((entry) => entry.hash === selectedHash) ?? null;
  return (
    <section className="historical-file-view" aria-label={`File History for ${path}`} aria-busy={loading}>
      <header className="historical-file-header">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft />Back</Button>
        <History aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">File History</p>
          <TooltipTarget content={path}><h2 className="truncate text-sm font-semibold">{path}</h2></TooltipTarget>
        </div>
        {selected ? <Button type="button" variant="outline" size="sm" disabled={selected.status === "D"} onClick={() => onBlame(selected)}><GitFork />Blame this version</Button> : null}
      </header>
      <div className="historical-file-body">
        <div className="file-history-list" role="listbox" aria-label={`History for ${path}`}>
          {loading && entries.length === 0 ? <p className="empty-state" role="status">Loading file history...</p> : null}
          {error && entries.length === 0 ? <div className="empty-state bad" role="alert"><p>{error}</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : null}
          {!loading && !error && entries.length === 0 ? <p className="empty-state">No history is available for this file.</p> : null}
          {entries.map((entry) => (
            <button key={entry.hash} type="button" role="option" aria-selected={entry.hash === selectedHash} className={`file-history-row ${entry.hash === selectedHash ? "is-selected" : ""}`} onClick={() => onSelect(entry)}>
              <span className="commit-type-badge">{entry.status}</span>
              <span className="min-w-0">
                <span className="file-history-subject">{entry.subject || "(no subject)"}</span>
                <span className="file-history-meta">{entry.authorName} · {entry.relativeDate || entry.authorDate}</span>
                {entry.originalPath ? <span className="file-history-rename">{entry.originalPath} → {entry.path}</span> : null}
              </span>
              <code>{entry.shortHash}</code>
            </button>
          ))}
          {hasMore ? <p className="file-history-limit" role="status">Showing the newest 200 changes for this file.</p> : null}
          {loading && entries.length > 0 ? <span className="sr-only" role="status">Refreshing file history</span> : null}
        </div>
        <div className="historical-file-content">{diffContent}</div>
      </div>
    </section>
  );
}
