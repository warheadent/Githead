import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode,
  type RefObject
} from "react";

type PresenceState = "entering" | "entered" | "exiting" | "unmounted";

interface MotionPresenceProps {
  present: boolean;
  children: ReactNode;
  className: string;
  element?: "div" | "section";
  id?: string;
  ariaLabel?: string;
  presenceKey?: Key;
  enterDuration?: number;
  exitDuration?: number;
}

interface MotionStyle extends CSSProperties {
  "--motion-enter-duration": string;
  "--motion-exit-duration": string;
}

function scheduleFrame(callback: () => void): () => void {
  if (typeof window.requestAnimationFrame === "function") {
    let completed = false;
    const runOnce = (): void => {
      if (completed) {
        return;
      }

      completed = true;
      callback();
    };
    const frame = window.requestAnimationFrame(runOnce);
    const fallbackTimer = window.setTimeout(runOnce, 34);
    return () => {
      completed = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
    };
  }

  const timer = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timer);
}

/**
 * Keeps exiting content mounted long enough to animate while making it
 * immediately unavailable to pointer, keyboard, and assistive-technology input.
 */
export function MotionPresence({
  present,
  children,
  className,
  element = "div",
  id,
  ariaLabel,
  presenceKey,
  enterDuration = 120,
  exitDuration = 120
}: MotionPresenceProps): ReactNode {
  const [state, setState] = useState<PresenceState>(() => present ? "entering" : "unmounted");
  const stateRef = useRef(state);
  const lastChildrenRef = useRef(children);

  if (present) {
    lastChildrenRef.current = children;
  }

  useLayoutEffect(() => {
    let cancelScheduledWork = (): void => {};

    if (present) {
      stateRef.current = "entering";
      setState("entering");
      cancelScheduledWork = scheduleFrame(() => {
        stateRef.current = "entered";
        setState("entered");
      });
    } else if (stateRef.current !== "unmounted") {
      stateRef.current = "exiting";
      setState("exiting");
      const timer = window.setTimeout(() => {
        stateRef.current = "unmounted";
        setState("unmounted");
      }, exitDuration);
      cancelScheduledWork = () => window.clearTimeout(timer);
    }

    return cancelScheduledWork;
  }, [exitDuration, presenceKey, present]);

  if (state === "unmounted") {
    return null;
  }

  const exiting = state === "exiting";
  const style: MotionStyle = {
    "--motion-enter-duration": `${enterDuration}ms`,
    "--motion-exit-duration": `${exitDuration}ms`
  };

  return createElement(element, {
    ...(id ? { id } : {}),
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    className: `motion-presence ${className}`,
    "data-motion-state": state,
    "aria-hidden": exiting ? true : undefined,
    inert: exiting ? true : undefined,
    style
  }, present ? children : lastChildrenRef.current);
}

interface MotionSwapItem {
  key: Key;
  content: ReactNode;
}

interface MotionSwapProps {
  item: MotionSwapItem | null;
  className: string;
  presenceClassName: string;
  exitDuration?: number;
}

/** Cross-fades keyed content while exposing only the newest live-region node. */
export function MotionSwap({
  item,
  className,
  presenceClassName,
  exitDuration = 120
}: MotionSwapProps): ReactNode {
  const previousItemRef = useRef<MotionSwapItem | null>(item);
  const [outgoingItem, setOutgoingItem] = useState<MotionSwapItem | null>(null);

  useLayoutEffect(() => {
    const previousItem = previousItemRef.current;
    previousItemRef.current = item;
    if (!item) {
      setOutgoingItem(null);
      return;
    }
    if (!previousItem || previousItem.key === item.key) {
      return;
    }

    setOutgoingItem(previousItem);
    const timer = window.setTimeout(() => {
      setOutgoingItem((current) => current?.key === previousItem.key ? null : current);
    }, exitDuration);
    return () => window.clearTimeout(timer);
  }, [exitDuration, item?.key]);

  return (
    <div className={className}>
      {outgoingItem ? (
        <div className="motion-swap-outgoing" aria-hidden="true" inert>
          {outgoingItem.content}
        </div>
      ) : null}
      <MotionPresence
        present={Boolean(item)}
        className={presenceClassName}
        exitDuration={exitDuration}
        {...(item ? { presenceKey: item.key } : {})}
      >
        {item?.content}
      </MotionPresence>
    </div>
  );
}

interface FlipAnimationEntry {
  animation: Animation;
  cleanupTimer: number;
  element: HTMLElement;
}

function cancelFlipAnimation(entry: FlipAnimationEntry): void {
  window.clearTimeout(entry.cleanupTimer);
  entry.animation.cancel();
}

function getElementPositions(elements: Map<string, HTMLElement>): Map<string, DOMRect> {
  return new Map([...elements].map(([key, element]) => [key, element.getBoundingClientRect()]));
}

/**
 * Animates only rows whose vertical layout position changed. Call capture before
 * a synchronous reorder so rapid changes begin from the currently painted layout.
 */
export function useFlipList(
  order: readonly string[],
  elementsRef: RefObject<Map<string, HTMLElement>>
): () => void {
  const beforePositionsRef = useRef<Map<string, DOMRect> | null>(null);
  const lastPositionsRef = useRef(new Map<string, DOMRect>());
  const animationsRef = useRef(new Map<string, FlipAnimationEntry>());
  const orderSignature = order.join("\u0000");

  const capture = useCallback(() => {
    beforePositionsRef.current = getElementPositions(elementsRef.current);
  }, [elementsRef]);

  useLayoutEffect(() => {
    const elements = elementsRef.current;
    const currentPositions = getElementPositions(elements);
    const beforePositions = beforePositionsRef.current ?? lastPositionsRef.current;
    beforePositionsRef.current = null;
    lastPositionsRef.current = currentPositions;

    for (const [key, entry] of animationsRef.current) {
      if (!elements.has(key) || elements.get(key) !== entry.element) {
        cancelFlipAnimation(entry);
        animationsRef.current.delete(key);
      }
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    for (const [key, currentRect] of currentPositions) {
      const previousRect = beforePositions.get(key);
      const element = elements.get(key);
      const deltaY = previousRect ? previousRect.top - currentRect.top : 0;
      if (!element || Math.abs(deltaY) < 0.5 || typeof element.animate !== "function") {
        continue;
      }

      const previousAnimation = animationsRef.current.get(key);
      if (previousAnimation) {
        cancelFlipAnimation(previousAnimation);
      }
      const animation = element.animate(
        reducedMotion
          ? [{ opacity: 0.92 }, { opacity: 1 }]
          : [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: 120, easing: "ease" }
      );
      const entry: FlipAnimationEntry = {
        animation,
        cleanupTimer: window.setTimeout(() => {
          if (animationsRef.current.get(key) === entry) {
            animationsRef.current.delete(key);
            animation.cancel();
          }
        }, 200),
        element
      };
      animationsRef.current.set(key, entry);
      void animation.finished.then(() => {
        if (animationsRef.current.get(key) === entry) {
          window.clearTimeout(entry.cleanupTimer);
          animationsRef.current.delete(key);
        }
      }).catch(() => {
        // Cancellation is expected when another reorder supersedes this one.
      });
    }
  }, [elementsRef, orderSignature]);

  useEffect(() => () => {
    for (const entry of animationsRef.current.values()) {
      cancelFlipAnimation(entry);
    }
    animationsRef.current.clear();
    beforePositionsRef.current = null;
    lastPositionsRef.current.clear();
  }, []);

  return capture;
}
