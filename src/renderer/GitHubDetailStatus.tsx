import { Loader2, RefreshCw } from "lucide-react";
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
