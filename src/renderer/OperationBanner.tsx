import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OperationBannerTone = "warning" | "danger";

export interface OperationBannerProps {
  /** Accessible name of the banner region. */
  ariaLabel: string;
  title: ReactNode;
  /** One sentence. Long text is truncated on one line and kept in the tooltip. */
  description?: ReactNode;
  icon?: ReactNode;
  tone?: OperationBannerTone;
  /** Small buttons with the primary action last. */
  actions?: ReactNode;
  /** Gives the action slot role=group with this name. */
  actionsLabel?: string;
  busy?: boolean;
  /** An optional row under the title, for progress, details and errors. */
  children?: ReactNode;
  /** "is-inline" draws the banner as a bordered card inside a column instead of a strip under the header. */
  className?: string;
}

/**
 * The one banner style for operations that need attention, shown under the repository header.
 */
export function OperationBanner({
  ariaLabel,
  title,
  description,
  icon,
  tone = "warning",
  actions,
  actionsLabel,
  busy,
  children,
  className
}: OperationBannerProps): ReactNode {
  return (
    <section className={cn("operation-banner", className)} data-tone={tone} aria-label={ariaLabel} aria-busy={busy}>
      <div className="operation-banner-main">
        <span className="operation-banner-icon" aria-hidden="true">{icon ?? <AlertTriangle />}</span>
        <div className="operation-banner-text">
          <h3 className="operation-banner-title">{title}</h3>
          {description ? (
            <p className="operation-banner-description" title={typeof description === "string" ? description : undefined}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="operation-banner-actions" role={actionsLabel ? "group" : undefined} aria-label={actionsLabel}>
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="operation-banner-details">{children}</div> : null}
    </section>
  );
}
