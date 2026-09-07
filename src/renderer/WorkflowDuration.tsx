import { useSyncExternalStore, type ReactNode } from "react";

const listeners = new Set<() => void>();
let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function updateTime(): void {
  currentTime = Date.now();
  listeners.forEach((listener) => listener());
}

function scheduleClock(): void {
  clearInterval(timer);
  timer = undefined;
  if (document.visibilityState === "hidden") return;
  updateTime();
  timer = setInterval(updateTime, 1_000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", scheduleClock);
    scheduleClock();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearInterval(timer);
    timer = undefined;
    document.removeEventListener("visibilitychange", scheduleClock);
  };
}

const getCurrentTime = (): number => currentTime;
const getInactiveTime = (): null => null;
const subscribeInactive = (): (() => void) => () => undefined;

export function WorkflowDuration({ startedAt, completedAt, running, active }: {
  startedAt: string;
  completedAt: string;
  running: boolean;
  active: boolean;
}): ReactNode {
  const start = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  const live = running && Number.isFinite(start) && !Number.isFinite(completed);
  const ticking = active && live;
  const now = useSyncExternalStore<number | null>(ticking ? subscribe : subscribeInactive, ticking ? getCurrentTime : getInactiveTime);
  const end = live ? now ?? Date.now() : completed;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const totalSeconds = Math.max(0, Math.round((end - start) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
