import { useEffect, useRef } from "react";

const MAX_AUTO_REFRESH_DELAY_MS = 60_000;

export interface GitHubAutoRefreshOptions {
  enabled: boolean;
  intervalMs: number;
  refreshing?: boolean;
  refresh: () => Promise<unknown>;
}

export function useGitHubAutoRefresh({
  enabled,
  intervalMs,
  refreshing = false,
  refresh
}: GitHubAutoRefreshOptions): void {
  const refreshRef = useRef(refresh);
  const refreshingRef = useRef(refreshing);
  refreshRef.current = refresh;
  refreshingRef.current = refreshing;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let foreground = document.visibilityState !== "hidden";
    let running = false;
    let consecutiveFailures = 0;
    let timer: number | undefined;

    const clearTimer = (): void => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (): void => {
      clearTimer();
      if (stopped || !foreground) return;
      const delay = Math.min(intervalMs * (2 ** consecutiveFailures), MAX_AUTO_REFRESH_DELAY_MS);
      timer = window.setTimeout(() => { void poll(); }, delay);
    };
    const poll = async (): Promise<void> => {
      clearTimer();
      if (stopped || !foreground) return;
      if (running || refreshingRef.current) {
        schedule();
        return;
      }

      running = true;
      try {
        await refreshRef.current();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
      } finally {
        running = false;
        schedule();
      }
    };
    const pause = (): void => {
      foreground = false;
      clearTimer();
    };
    const resume = (): void => {
      if (foreground || stopped) return;
      foreground = true;
      void poll();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") pause();
      else resume();
    };

    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();

    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
