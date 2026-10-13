import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { StartLayout } from "./StartLayout";

export function StartupScreen({ repositoryName }: { repositoryName: string }): ReactNode {
  const openingLabel = repositoryName ? `Opening ${repositoryName}…` : "Opening your workspace…";
  const detailLabel = repositoryName ? "Loading repository state" : "Loading saved repositories";

  return (
    <StartLayout>
      <section className="startup-screen" aria-busy="true" aria-label="Opening Githead">
        <div className="startup-status" role="status" aria-live="polite" aria-atomic="true">
          <Loader2 className="startup-spinner" aria-hidden="true" />
          <div className="startup-status-copy"><h2>{openingLabel}</h2><p>{detailLabel}</p></div>
        </div>
        {/* Mirrors the setup screen (action card, recents label, recents card), so startup resolves into setup without a jump. */}
        <div className="start-card" aria-hidden="true">
          {[0, 1].map((row) => (
            <div className="startup-skeleton-action" key={row}>
              <span />
              <span />
            </div>
          ))}
        </div>
        <div className="setup-recent-section" aria-hidden="true">
          <div className="setup-recent-title"><span className="startup-skeleton-label" /></div>
          <div className="start-card startup-skeleton">
            {[0, 1, 2].map((row) => (
              <div className="startup-skeleton-row" key={row}>
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
      </section>
    </StartLayout>
  );
}
