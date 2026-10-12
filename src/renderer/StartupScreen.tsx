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
        {/* The same card as the setup recents list, so startup resolves into setup without a jump. */}
        <div className="start-card startup-skeleton" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div className="startup-skeleton-row" key={row}>
              <span />
              <span />
            </div>
          ))}
        </div>
      </section>
    </StartLayout>
  );
}
