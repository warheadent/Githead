import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { GitHubQuerySnapshot } from "./githubQueryStore";

type DetailQuery = Pick<GitHubQuerySnapshot<unknown>, "status" | "data" | "error"> & { refresh: () => Promise<void> };

function refreshDetail(detail: DetailQuery): void {
  void detail.refresh().catch(() => undefined);
}

export function GitHubDetailRefreshButton({ detail, label = "Refresh details" }: { detail: DetailQuery; label?: string }): ReactNode {
  const refreshing = detail.status === "loading" || detail.status === "refreshing";
  return <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label={label} tooltip={label} disabled={refreshing} onClick={() => refreshDetail(detail)}>
    {refreshing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RefreshCw />}
  </TooltipButton>;
}

export function GitHubDetailStatus({ detail, label = "details" }: { detail: DetailQuery; label?: string }): ReactNode {
  if ((detail.status === "loading" || detail.status === "idle") && !detail.data) {
    return <div className="review-console-loading" role="status" aria-live="polite"><Loader2 className="animate-spin motion-reduce:animate-none" />Loading {label}</div>;
  }
  if (detail.status === "refreshing") return <span className="sr-only" role="status" aria-live="polite">Refreshing {label}</span>;
  if (!detail.error) return null;
  const retry = <Button type="button" variant="outline" size="sm" onClick={() => refreshDetail(detail)}>Retry</Button>;
  if (!detail.data) return <div className="review-console-load-error" role="alert"><p>{detail.error}</p>{retry}</div>;
  return <div className="review-console-stale-error" role="status"><span>Showing cached {label}. Refresh failed: {detail.error}</span>{retry}</div>;
}

/** Opens the item on GitHub. Icon-only, so the tooltip shows its name. */
export function OpenOnGitHubButton({ onOpen }: { onOpen: () => void }): ReactNode {
  return <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label="Open on GitHub" tooltip="Open on GitHub" onClick={onOpen}>
    <ExternalLink />
  </TooltipButton>;
}

/**
 * The header of a GitHub detail card. The number follows the h2, outside it, so a region that is
 * labelled by the h2 keeps the title as its whole name.
 */
export function DetailCardHeader({ titleId, title, number, meta, actions, divider = true }: {
  titleId?: string;
  title: string;
  number?: string;
  meta: ReactNode;
  actions: ReactNode;
  /** Draws the line under the header. A header that tabs follow leaves it to the tab list. */
  divider?: boolean;
}): ReactNode {
  return (
    <header className="github-detail-header" data-divider={divider ? "true" : "false"}>
      <div className="github-detail-heading">
        <div className="github-detail-title-line">
          <h2 id={titleId} title={title}>{title}</h2>
          {number ? <span className="github-detail-number">{number}</span> : null}
        </div>
        <div className="github-detail-meta">{meta}</div>
      </div>
      <div className="github-detail-actions">{actions}</div>
    </header>
  );
}

export type StateBadgeTone = "success" | "danger" | "warning" | "info" | "neutral";

/** An outline pill that names the state of a pull request, issue or workflow run. */
export function StateBadge({ tone, icon, children }: { tone: StateBadgeTone; icon?: ReactNode; children: ReactNode }): ReactNode {
  return <span className="github-state-badge" data-tone={tone}>{icon}{children}</span>;
}

/** The 240px facts column of a GitHub detail card. It stacks below the main column in a narrow card. */
export function FactsSidebar({ label, heading, children }: { label: string; heading: string; children: ReactNode }): ReactNode {
  return (
    <aside className="github-facts" aria-label={label}>
      <h3 className="github-facts-heading">{heading}</h3>
      {children}
    </aside>
  );
}

export function FactRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return <div className="github-fact-row"><span>{label}</span><div>{children}</div></div>;
}
