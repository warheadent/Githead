import { useLayoutEffect, useRef, useState } from "react";
import type { HistoryRoute, HistoricalFileTarget } from "./historyNavigation";
import { getRepoPathKey } from "./repositorySnapshotCache";

export type WorkspaceView = "status" | "stashes" | "history" | "workflows" | "pullRequests" | "issues" | "activity";

export interface WorkspaceLocation {
  repoPath: string;
  activeView: WorkspaceView;
  historyRoute: HistoryRoute;
  fileHistoryOrigin: HistoricalFileTarget | null;
  selectedCommitHash: string | null;
  selectedCommitFilePath: string | null;
}

function locationKey(location: WorkspaceLocation): string {
  return JSON.stringify([
    getRepoPathKey(location.repoPath),
    location.activeView,
    location.activeView === "history" ? location.historyRoute : null
  ]);
}

function historyPosition(state: unknown): number | null {
  if (!state || typeof state !== "object" || !("githeadNavigation" in state)
    || typeof state.githeadNavigation !== "string" || !("index" in state)
    || typeof state.index !== "number" || !Number.isSafeInteger(state.index) || state.index < 0) return null;
  return state.index;
}

// Retain locations, not repository data or diffs. Old entries from another
// renderer session are ignored, so a reload cannot replay stale app state.
export function useWorkspaceNavigation(
  location: WorkspaceLocation | null,
  restore: (location: WorkspaceLocation) => void
): { canGoBack: boolean; canGoForward: boolean; back: () => void; forward: () => void } {
  const [session] = useState(() => crypto.randomUUID());
  const [initialIndex] = useState(() => historyPosition(window.history.state) ?? 0);
  const entries = useRef<WorkspaceLocation[]>([]);
  const index = useRef(initialIndex - 1);
  const firstIndex = useRef(initialIndex);
  const restoring = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const [availability, setAvailability] = useState({ canGoBack: false, canGoForward: false });

  const updateAvailability = (): void => {
    setAvailability({
      canGoBack: index.current > firstIndex.current,
      canGoForward: index.current < firstIndex.current + entries.current.length - 1
    });
  };

  useLayoutEffect(() => {
    if (!location) return;
    const current = entries.current[index.current - firstIndex.current];
    if (!current || (!restoring.current && locationKey(current) !== locationKey(location))) {
      entries.current.splice(index.current - firstIndex.current + 1);
      entries.current.push(location);
      index.current += 1;
      const state = { githeadNavigation: session, index: index.current };
      if (current) window.history.pushState(state, "");
      else window.history.replaceState(state, "");
      if (entries.current.length > 100) {
        entries.current.shift();
        firstIndex.current += 1;
      }
      updateAvailability();
    } else {
      // Selection and refreshed data must not create extra Back steps.
      entries.current[index.current - firstIndex.current] = location;
    }
    restoring.current = false;
  });

  useLayoutEffect(() => {
    const onPopState = (event: PopStateEvent): void => {
      const position = historyPosition(event.state);
      if (position === null || entries.current.length === 0 || position === index.current) return;
      const target = entries.current[position - firstIndex.current];
      if (!target || document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        window.history.go(index.current - position);
        return;
      }
      index.current = position;
      restoring.current = true;
      restoreRef.current(target);
      updateAvailability();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (event.key === "ArrowLeft" && index.current > firstIndex.current) window.history.back();
      if (event.key === "ArrowRight" && index.current < firstIndex.current + entries.current.length - 1) window.history.forward();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return {
    ...availability,
    back: () => { if (index.current > firstIndex.current) window.history.back(); },
    forward: () => { if (index.current < firstIndex.current + entries.current.length - 1) window.history.forward(); }
  };
}
