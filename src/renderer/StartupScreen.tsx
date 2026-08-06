import { Loader2, Plus, Settings } from "lucide-react";
import type { ReactNode } from "react";

const repositoryRows = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
const fileRows = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;
const diffRows = ["one", "two", "three", "four"] as const;

export function StartupScreen({ repositoryName }: { repositoryName: string }): ReactNode {
  const openingLabel = repositoryName ? `Opening ${repositoryName}…` : "Opening your workspace…";
  const detailLabel = repositoryName ? "Loading repository state" : "Loading saved repositories";

  return (
    <section className="startup-screen" aria-busy="true" aria-label="Opening Githead">
      <aside className="startup-sidebar" aria-hidden="true">
        <div className="startup-sidebar-heading">
          <span className="startup-skeleton startup-skeleton-label" />
          <span className="startup-icon-placeholder"><Plus /></span>
        </div>
        <div className="startup-repository-list">
          {repositoryRows.map((row, index) => (
            <div className="startup-repository-row" key={row}>
              <span className="startup-skeleton startup-skeleton-icon" />
              <span className={`startup-skeleton startup-skeleton-repository startup-skeleton-width-${(index % 3) + 1}`} />
              <span className="startup-skeleton startup-skeleton-action" />
            </div>
          ))}
        </div>
        <div className="startup-sidebar-card">
          <span className="startup-skeleton startup-skeleton-card-label" />
          <span className="startup-skeleton startup-skeleton-card-value" />
          <span className="startup-skeleton startup-skeleton-card-label" />
          <span className="startup-skeleton startup-skeleton-card-value is-short" />
        </div>
        <div className="startup-settings-placeholder">
          <Settings />
          <span className="startup-skeleton startup-skeleton-settings" />
        </div>
      </aside>

      <div className="startup-workspace" aria-hidden="true">
        <div className="startup-toolbar-placeholder">
          <div className="startup-toolbar-copy">
            <span className="startup-skeleton startup-skeleton-toolbar-label" />
            <span className="startup-skeleton startup-skeleton-toolbar-title" />
          </div>
          <div className="startup-toolbar-actions">
            <span className="startup-skeleton" />
            <span className="startup-skeleton" />
            <span className="startup-skeleton" />
            <span className="startup-skeleton" />
            <span className="startup-skeleton" />
          </div>
        </div>
        <div className="startup-tabs-placeholder">
          <span className="startup-skeleton is-active" />
          <span className="startup-skeleton" />
          <span className="startup-skeleton" />
          <span className="startup-skeleton" />
          <span className="startup-skeleton" />
          <span className="startup-skeleton" />
          <span className="startup-skeleton" />
        </div>
        <div className="startup-workspace-body">
          <div className="startup-files-placeholder">
            <div className="startup-section-heading">
              <span className="startup-skeleton startup-skeleton-section-title" />
              <span className="startup-skeleton startup-skeleton-section-action" />
            </div>
            <div className="startup-file-list">
              {fileRows.map((row, index) => (
                <div className="startup-file-row" key={row}>
                  <span className="startup-skeleton startup-skeleton-file-icon" />
                  <span className={`startup-skeleton startup-skeleton-file startup-skeleton-width-${(index % 3) + 1}`} />
                </div>
              ))}
            </div>
            <div className="startup-section-heading startup-section-heading-lower">
              <span className="startup-skeleton startup-skeleton-section-title" />
              <span className="startup-skeleton startup-skeleton-section-action" />
            </div>
          </div>
          <div className="startup-diff-placeholder">
            <div className="startup-section-heading">
              <span className="startup-skeleton startup-skeleton-diff-title" />
              <span className="startup-skeleton startup-skeleton-section-action" />
            </div>
            {diffRows.map((row) => (
              <div className="startup-diff-block" key={row}>
                <span className="startup-skeleton startup-skeleton-diff-line is-wide" />
                <span className="startup-skeleton startup-skeleton-diff-line" />
                <span className="startup-skeleton startup-skeleton-diff-line is-short" />
              </div>
            ))}
          </div>
        </div>
        <div className="startup-commit-placeholder">
          <span className="startup-skeleton startup-skeleton-commit-label" />
          <span className="startup-skeleton startup-skeleton-commit-field" />
        </div>
      </div>

      <div className="startup-status" role="status" aria-live="polite" aria-atomic="true">
        <Loader2 className="startup-spinner" aria-hidden="true" />
        <span className="startup-status-copy">
          <strong>{openingLabel}</strong>
          <span>{detailLabel}</span>
        </span>
      </div>
    </section>
  );
}
