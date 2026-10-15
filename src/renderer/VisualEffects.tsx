import { MotionConfig } from "motion/react";
import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_REDUCE_MOTION, DEFAULT_VISUAL_EFFECTS, type AppReduceMotion, type AppVisualEffects } from "../shared/types";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToSystemMotion(onChange: () => void): () => void {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
function systemReducesMotion(): boolean {
  return window.matchMedia?.(motionQuery).matches ?? false;
}

/** The --ease-out curve in styles.css, shared by every JS motion. motion.tsx re-exports it. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const VisualEffectsContext = createContext({ effects: DEFAULT_VISUAL_EFFECTS, reduceMotion: false });
export const useVisualEffects = () => useContext(VisualEffectsContext);

/** Also covers portalled dialogs, which live outside the app's DOM tree. */
export function applyVisualEffects(effects: AppVisualEffects, reduceMotion: AppReduceMotion): void {
  document.documentElement.dataset.visualEffects = effects;
  document.documentElement.dataset.reduceMotion = String(reduceMotion === "always" || systemReducesMotion());
}

export function VisualEffectsProvider({ effects, motionPreference, children }: {
  effects: AppVisualEffects;
  motionPreference: AppReduceMotion;
  children: ReactNode;
}): ReactNode {
  const systemReduce = useSyncExternalStore(subscribeToSystemMotion, systemReducesMotion, () => false);
  const reduceMotion = motionPreference === "always" || systemReduce;
  useLayoutEffect(() => {
    applyVisualEffects(effects, motionPreference);
  }, [effects, motionPreference, systemReduce]);

  const value = useMemo(() => ({ effects, reduceMotion }), [effects, reduceMotion]);
  return (
    <VisualEffectsContext value={value}>
      <MotionConfig reducedMotion={reduceMotion ? "always" : "never"} transition={{ duration: 0.12, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </VisualEffectsContext>
  );
}

export const defaultVisualPreferences = { visualEffects: DEFAULT_VISUAL_EFFECTS, reduceMotion: DEFAULT_REDUCE_MOTION };
