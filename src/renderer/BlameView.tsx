import { useMemo, useState, type ReactNode } from "react";
import type { GitFileBlameResult, GitFileHistoryEntry } from "../shared/types";
import { Button } from "@/components/ui/button";
import { TooltipTarget } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { FixedSizeVirtualList } from "./FixedSizeVirtualList";
import { FileVersionList, HistoricalFileLayout } from "./HistoricalFileLayout";
import { LoadingState } from "./LoadingState";

/** Matches the .blame-row height in styles.css. */
const BLAME_ROW_HEIGHT = 22;
const SHORT_HASH_LENGTH = 7;

export interface BlameViewProps {
  path: string;
  /** The blamed version. It is the selected row of the versions column. */
  hash: string;
  result: GitFileBlameResult | null;
  loading: boolean;
  error: string;
  backLabel: string;
  /** The loaded file history of this file, or null when the card takes the full width. */
  versions: readonly GitFileHistoryEntry[] | null;
  fileHistoryDisabled: boolean;
  onBack: () => void;
  onOpenRepositoryHistory: () => void;
  onShowFileHistory: () => void;
  onSelectVersion: (entry: GitFileHistoryEntry) => void;
  onRetry: () => void;
  onOpenCommit: (hash: string) => void;
}

/** Marks where each run of consecutive lines from one commit starts, and alternates a band per run. */
function getBlameRuns(result: GitFileBlameResult | null): { starts: boolean[]; bands: boolean[] } {
  const starts: boolean[] = [];
  const bands: boolean[] = [];
  if (result?.kind !== "text") return { starts, bands };
  let band = true;
  result.lines.forEach((line, index) => {
    const start = index === 0 || result.lines[index - 1]?.commitHash !== line.commitHash;
    if (start) band = !band;
    starts.push(start);
    bands.push(band);
  });
  return { starts, bands };
}

export function BlameView({ path, hash, result, loading, error, backLabel, versions, fileHistoryDisabled, onBack, onOpenRepositoryHistory, onShowFileHistory, onSelectVersion, onRetry, onOpenCommit }: BlameViewProps): ReactNode {
  const commits = useMemo(() => new Map(result?.kind === "text" ? result.commits.map((commit) => [commit.hash, commit]) : []), [result]);
  const runs = useMemo(() => getBlameRuns(result), [result]);
  const [detailOpen, setDetailOpen] = useState(true);
  const shortHash = commits.get(hash)?.shortHash
    ?? versions?.find((entry) => entry.hash === hash)?.shortHash
    ?? hash.slice(0, SHORT_HASH_LENGTH);
  const lineCount = result?.kind === "text" ? result.lines.length : null;

  let body: ReactNode;
  if (loading) {
    body = <LoadingState label="Loading blame" className="h-full" />;
  } else if (error) {
    body = <EmptyState tone="error" role="alert" title={error} action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>} />;
  } else if (result?.kind === "unavailable") {
    body = <EmptyState title={result.message} />;
  } else if (result?.kind === "text") {
    body = (
      <FixedSizeVirtualList
        items={result.lines}
        itemKey={(line) => String(line.finalLine)}
        rowHeight={BLAME_ROW_HEIGHT}
        ariaLabel={`Blame lines for ${path}`}
        multiSelectable={false}
        className="blame-list"
        renderItem={(line, index, rowProps) => {
          const commit = commits.get(line.commitHash);
          const lineHash = commit?.shortHash ?? line.commitHash.slice(0, SHORT_HASH_LENGTH);
          const author = commit?.authorName ?? "Unknown";
          const runStart = runs.starts[index] ?? true;
          return (
            <button
              type="button"
              role="option"
              aria-selected="false"
              data-virtual-index={index}
              className={cn(
                "blame-row",
                runStart && index > 0 && "is-run-start",
                runs.bands[index] && "is-banded",
                line.commitHash === hash && "is-blamed-version"
              )}
              onClick={() => onOpenCommit(line.commitHash)}
              title={commit?.summary}
              {...rowProps}
            >
              {runStart ? (
                <span className="blame-gutter">
                  <span className="blame-commit">{lineHash}</span>
                  <TooltipTarget content={commit ? `${commit.authorName} · ${commit.authorDate}` : undefined}><span className="blame-author">{author}</span></TooltipTarget>
                </span>
              ) : (
                // Later lines of a run show no commit, but each line still names it for assistive technology.
                <span className="blame-gutter"><span className="sr-only">{lineHash} {author}</span></span>
              )}
              <span className="blame-line-number">{line.finalLine}</span>
              <TooltipTarget content={line.originalPath && line.originalPath !== path ? `Originally ${line.originalPath}:${line.originalLine}` : undefined}><code className="blame-code">{line.text || " "}</code></TooltipTarget>
            </button>
          );
        }}
      />
    );
  } else {
    body = <EmptyState title="Select a file version to view blame." />;
  }

  const card = (
    <div className="blame-card">
      <div className="blame-card-header">
        <h3 className="blame-card-title">Blame at <code>{shortHash}</code></h3>
        {lineCount !== null ? <span className="blame-card-count">{lineCount.toLocaleString()} {lineCount === 1 ? "line" : "lines"}</span> : null}
      </div>
      {body}
    </div>
  );

  return (
    <HistoricalFileLayout
      label={`Blame for ${path}`}
      path={path}
      mode="blame"
      busy={loading}
      backLabel={backLabel}
      onBack={onBack}
      onOpenRepositoryHistory={onOpenRepositoryHistory}
      fileHistoryDisabled={fileHistoryDisabled}
      blameDisabled={false}
      onShowFileHistory={onShowFileHistory}
      // The Blame segment is the active one here, so it never fires.
      onShowBlame={() => undefined}
      list={versions && versions.length > 0 ? (
        <div className="file-history-column">
          <FileVersionList
            path={path}
            entries={versions}
            selectedHash={hash}
            isDisabled={(entry) => entry.status === "D"}
            onSelect={(entry) => {
              setDetailOpen(true);
              if (entry.hash !== hash) onSelectVersion(entry);
            }}
          />
        </div>
      ) : null}
      detail={card}
      detailOpen={detailOpen}
      onCloseDetail={() => setDetailOpen(false)}
    />
  );
}
