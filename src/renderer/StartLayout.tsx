import type { ReactNode } from "react";
import { RepositoryTile } from "./RepositoryHeader";

/** Shared frame for the startup, welcome and prerequisite screens: one calm centred column under the brand. */
export function StartLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <section className="start-layout" aria-label="Welcome to Githead">
      <div className="start-column">
        <div className="start-brand"><RepositoryTile />Githead</div>
        {children}
      </div>
    </section>
  );
}
