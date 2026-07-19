import { ArrowLeft, GitFork } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { GitFileBlameResult } from "../shared/types";
import { Button } from "@/components/ui/button";
import { TooltipTarget } from "@/components/ui/tooltip";
import { FixedSizeVirtualList } from "./FixedSizeVirtualList";

export interface BlameViewProps {
  path: string;
  result: GitFileBlameResult | null;
  loading: boolean;
  error: string;
  backLabel: string;
  onBack: () => void;
  onRetry: () => void;
  onOpenCommit: (hash: string) => void;
}

export function BlameView({ path, result, loading, error, backLabel, onBack, onRetry, onOpenCommit }: BlameViewProps): ReactNode {
  const commits = useMemo(() => new Map(result?.kind === "text" ? result.commits.map((commit) => [commit.hash, commit]) : []), [result]);
  return (
    <section className="blame-view" aria-label={`Blame for ${path}`} aria-busy={loading}>
      <header className="historical-file-header">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft />{backLabel}</Button>
        <GitFork aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="eyebrow">Blame</p><TooltipTarget content={path}><h2 className="truncate text-sm font-semibold">{path}</h2></TooltipTarget></div>
        {result?.kind === "text" ? <span className="text-xs text-muted-foreground">{result.lines.length.toLocaleString()} lines</span> : null}
      </header>
      {loading ? <p className="empty-state" role="status">Loading blame...</p> : error ? (
        <div className="empty-state bad" role="alert"><p>{error}</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>
      ) : result?.kind === "unavailable" ? (
        <div className="empty-state"><p>{result.message}</p></div>
      ) : result?.kind === "text" ? (
        <FixedSizeVirtualList
          items={result.lines}
          itemKey={(line) => String(line.finalLine)}
          rowHeight={28}
          ariaLabel={`Blame lines for ${path}`}
          multiSelectable={false}
          className="blame-list"
          renderItem={(line, index, rowProps) => {
            const commit = commits.get(line.commitHash);
            return (
              <button type="button" role="option" aria-selected="false" data-virtual-index={index} className="blame-row" onClick={() => onOpenCommit(line.commitHash)} title={commit?.summary} {...rowProps}>
                <span className="blame-commit">{commit?.shortHash ?? line.commitHash.slice(0, 10)}</span>
                <TooltipTarget content={commit ? `${commit.authorName} · ${commit.authorDate}` : undefined}><span className="blame-author">{commit?.authorName ?? "Unknown"}</span></TooltipTarget>
                <span className="blame-line-number">{line.finalLine}</span>
                <TooltipTarget content={line.originalPath && line.originalPath !== path ? `Originally ${line.originalPath}:${line.originalLine}` : undefined}><code className="blame-code">{line.text || " "}</code></TooltipTarget>
              </button>
            );
          }}
        />
      ) : <p className="empty-state">Select a file version to view blame.</p>}
    </section>
  );
}
