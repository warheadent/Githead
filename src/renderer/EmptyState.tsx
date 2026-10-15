import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Decorative 20px icon. */
  icon?: ReactNode;
  /** One message, rendered as a single text node so exact text queries keep matching. */
  title: string;
  description?: string;
  tone?: "default" | "error";
  action?: ReactNode;
  as?: "div" | "section" | "li";
  /** Renders the title as a heading instead of a paragraph. */
  headingLevel?: 2 | 3 | 4;
  /** No "status": a persistent status region would compete with the app's own live status messages. */
  role?: "alert" | "note";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  tone = "default",
  action,
  as: Root = "div",
  headingLevel,
  role,
  className
}: EmptyStateProps): ReactNode {
  const Title = headingLevel ? (`h${headingLevel}` as const) : "p";

  return (
    <Root className={cn("empty-state", tone === "error" && "is-error", className)} role={role}>
      {icon ? <span className="empty-state-icon" aria-hidden="true">{icon}</span> : null}
      <Title className="empty-state-title">{title}</Title>
      {description ? <p className="empty-state-description">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </Root>
  );
}
