import { ArrowLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { GitFileHistoryEntry } from "../shared/types";
import { Button, TooltipButton } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { TooltipTarget } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FileStatusChip } from "./FileStatusChip";
import { getCommitFileStatusVisuals } from "./fileStatusVisuals";
import { DetailSurface, ListDetailLayout } from "./ListDetailLayout";

// Only the lazy FileHistoryView and BlameView import this module, so it stays in their chunks.
// App.tsx must not import it.

export type HistoricalFileMode = "file" | "blame";

export interface HistoricalFileLayoutProps {
  /** Names the outer region. The path bar, the list and the card render inside it. */
  label: string;
  path: string;
  mode: HistoricalFileMode;
  busy: boolean;
  backLabel: string;
  onBack: () => void;
  /** The "History" crumb, which returns to the commit history. */
  onOpenRepositoryHistory: () => void;
  fileHistoryDisabled: boolean;
  blameDisabled: boolean;
  onShowFileHistory: () => void;
  onShowBlame: () => void;
  /** The versions column. Null gives the card the full width. */
  list: ReactNode | null;
  /** One element that fills the surface card. */
  detail: ReactNode;
  /** In a narrow window, shows the card instead of the versions column. */
  detailOpen: boolean;
  onCloseDetail: () => void;
}

/** The File History and Blame layout: a path bar, the versions column and one card. */
export function HistoricalFileLayout({
  label,
  path,
  mode,
  busy,
  backLabel,
  onBack,
  onOpenRepositoryHistory,
  fileHistoryDisabled,
  blameDisabled,
  onShowFileHistory,
  onShowBlame,
  list,
  detail,
  detailOpen,
  onCloseDetail
}: HistoricalFileLayoutProps): ReactNode {
  const modeOptions: readonly SegmentedOption<HistoricalFileMode>[] = [
    { value: "file", label: "File history", disabled: fileHistoryDisabled },
    { value: "blame", label: "Blame", ariaLabel: "Blame this version", disabled: blameDisabled }
  ];
  return (
    <section className="historical-file-view" aria-label={label} aria-busy={busy}>
      <div className="historical-file-path-bar">
        <TooltipButton type="button" variant="ghost" size="icon-xs" aria-label={backLabel} tooltip={backLabel} onClick={onBack}>
          <ArrowLeft />
        </TooltipButton>
        <div className="historical-file-crumbs">
          <Button type="button" variant="ghost" size="xs" className="historical-file-crumb" onClick={onOpenRepositoryHistory}>History</Button>
          <ChevronRight className="historical-file-crumb-separator" aria-hidden="true" />
          <TooltipTarget overflowOnly content={path}>
            <h2 className="historical-file-path">{path}</h2>
          </TooltipTarget>
        </div>
        <Segmented
          label="File view"
          size="sm"
          options={modeOptions}
          value={mode}
          onChange={(next) => {
            if (next === "file") onShowFileHistory();
            else onShowBlame();
          }}
        />
      </div>
      {list === null ? (
        <div className="historical-file-body">
          <DetailSurface>{detail}</DetailSurface>
        </div>
      ) : (
        <ListDetailLayout
          id="file-history"
          listLabel="file versions"
          list={list}
          detail={detail}
          detailOpen={detailOpen}
          onBack={onCloseDetail}
        />
      )}
    </section>
  );
}

/** The versions column rows: status chip, two-line subject, author · time, short SHA and the rename line. */
export function FileVersionList({ path, entries, selectedHash, isDisabled, onSelect }: {
  path: string;
  entries: readonly GitFileHistoryEntry[];
  selectedHash: string | null;
  /** A disabled version stays visible but cannot be chosen. */
  isDisabled?: (entry: GitFileHistoryEntry) => boolean;
  onSelect: (entry: GitFileHistoryEntry) => void;
}): ReactNode {
  return (
    <div className="file-history-list" role="listbox" aria-label={`History for ${path}`}>
      {entries.map((entry) => {
        const selected = entry.hash === selectedHash;
        const disabled = isDisabled?.(entry) ?? false;
        return (
          <button
            key={entry.hash}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={disabled || undefined}
            className={cn("file-history-row", selected && "is-selected")}
            onClick={() => {
              if (!disabled) onSelect(entry);
            }}
          >
            <FileStatusChip visuals={getCommitFileStatusVisuals(entry.status)} tooltip={false} />
            <span className="file-history-row-content">
              <span className="file-history-subject">{entry.subject || "(no subject)"}</span>
              <span className="file-history-meta">{entry.authorName} · {entry.relativeDate || entry.authorDate}</span>
              {entry.originalPath ? <span className="file-history-rename">{entry.originalPath} → {entry.path}</span> : null}
            </span>
            <code className="file-history-hash">{entry.shortHash}</code>
          </button>
        );
      })}
    </div>
  );
}
