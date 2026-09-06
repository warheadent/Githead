import appIconUrl from "../../resources/icon.svg";
import type { ReactNode } from "react";

/** Shared frame for welcome, startup, and prerequisite screens. */
export function StartLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <section className="start-layout" aria-label="Welcome to Githead">
      <div className="start-frame">
        <aside className="start-intro">
          <div className="start-brand"><img src={appIconUrl} alt="" width="36" height="36" />Githead</div>
          <div className="start-intro-copy">
            <h1>A clear view<br />of your code.</h1>
            <p>Review changes, manage branches, and keep your repositories in sync.</p>
          </div>
          <svg className="start-graph" viewBox="0 0 360 180" fill="none" aria-hidden="true">
            <path className="start-graph-track" d="M24 148H336M24 84H336M24 20H336" />
            <path className="start-graph-main" d="M32 148H328" />
            <path className="start-graph-branch" d="M76 148C112 148 100 52 144 52H216C260 52 248 148 288 148" />
            <path className="start-graph-secondary" d="M144 52C174 52 164 100 196 100H228" />
            {[32, 76, 288, 328].map((x) => <circle className="start-graph-node" key={x} cx={x} cy="148" r="5" />)}
            {[144, 216].map((x) => <circle className="start-graph-node is-branch" key={x} cx={x} cy="52" r="6" />)}
            <circle className="start-graph-node is-secondary" cx="228" cy="100" r="5" />
          </svg>
        </aside>
        <div className="start-content">{children}</div>
      </div>
    </section>
  );
}
