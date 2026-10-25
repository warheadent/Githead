import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";

const KEYBOARD_STEP = 16;

function readStoredHeight(storageKey: string): number | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  const height = stored === null || stored.trim() === "" ? Number.NaN : Number(stored);
  return Number.isFinite(height) && height > 0 ? height : null;
}

/** A height in pixels that the user set by dragging. Null means the section keeps its CSS default. */
export function usePersistentSectionHeight(storageKey: string): [number | null, (height: number | null) => void] {
  const [height, setHeight] = useState(() => readStoredHeight(storageKey));
  const updateHeight = useCallback((next: number | null) => {
    const rounded = next === null ? null : Math.round(next);
    setHeight(rounded);
    try {
      if (rounded === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, String(rounded));
    } catch {
      // A read-only storage area keeps the height for this session only.
    }
  }, [storageKey]);
  return [height, updateHeight];
}

/**
 * A horizontal bar that sets the max-height of the section above it. Dragging writes the height to
 * the element directly and reports it once on release, so a drag does not render the card each frame.
 * Double-click resets the section to its CSS default.
 */
export function SectionResizeHandle({
  label,
  targetRef,
  height,
  minHeight,
  getMaxHeight,
  onHeightChange
}: {
  /** Names the handle, for example "Resize commit message". */
  label: string;
  targetRef: RefObject<HTMLElement | null>;
  height: number | null;
  minHeight: number;
  /** The largest height the section can take now. Read once per drag or key press. */
  getMaxHeight: (target: HTMLElement) => number;
  onHeightChange: (height: number | null) => void;
}): ReactNode {
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number; maxHeight: number; height: number | null } | null>(null);

  const clamp = (value: number, maxHeight: number) => Math.min(Math.max(minHeight, maxHeight), Math.max(minHeight, value));

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = targetRef.current;
    if (event.button !== 0 || !target) return;
    // The card text is selectable. A drag must not start a selection.
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: target.getBoundingClientRect().height,
      maxHeight: getMaxHeight(target),
      height: null
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const target = targetRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !target) return;
    drag.height = Math.round(clamp(drag.startHeight + event.clientY - drag.startY, drag.maxHeight));
    target.style.maxHeight = `${drag.height}px`;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.height !== null) onHeightChange(drag.height);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = targetRef.current;
    if (!target) return;
    const current = target.getBoundingClientRect().height;
    const next = event.key === "ArrowUp" ? current - KEYBOARD_STEP
      : event.key === "ArrowDown" ? current + KEYBOARD_STEP
      : event.key === "Home" ? minHeight
      : event.key === "End" ? Number.POSITIVE_INFINITY
      : null;
    if (next === null) return;
    event.preventDefault();
    onHeightChange(clamp(next, getMaxHeight(target)));
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={minHeight}
      aria-valuenow={height ?? undefined}
      tabIndex={0}
      className="section-resize-handle"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onHeightChange(null)}
      onKeyDown={handleKeyDown}
    />
  );
}
