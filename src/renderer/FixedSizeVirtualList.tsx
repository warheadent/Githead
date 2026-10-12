import {
  Fragment,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent
} from "react";

export interface VirtualRowProps {
  style: CSSProperties;
  tabIndex?: number;
  "aria-posinset": number;
  "aria-setsize": number;
}

interface FixedSizeVirtualListProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  rowHeight: number;
  overscan?: number;
  ariaLabel: string;
  selectedKey?: string | null | undefined;
  className?: string;
  multiSelectable?: boolean;
  role?: "listbox" | "tree";
  /**
   * Embeds the list in an outer scroller that it shares with other content, such as sticky group
   * headers or a second list. The list then has no scroll of its own and gets the is-embedded class,
   * so its CSS must not make it scroll. Pass null while the scroller's ref is pending. Leave the prop
   * unset for a standalone list that scrolls itself.
   */
  scrollContainer?: HTMLElement | null;
  onNavigate?: (item: T, event: KeyboardEvent<HTMLDivElement>) => void;
  onItemKeyDown?: (item: T, index: number, event: KeyboardEvent<HTMLDivElement>) => number | undefined;
  renderOverlay?: (range: Readonly<VisibleRange>) => ReactNode;
  renderItem: (item: T, index: number, rowProps: VirtualRowProps) => ReactNode;
}

interface VisibleRange {
  start: number;
  end: number;
}

/** The element that scrolls the rows, and the top of the first row inside its scrolled content. */
interface ScrollFrame {
  scroller: HTMLElement;
  offset: number;
}

function getVisibleRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number
): VisibleRange {
  if (itemCount === 0) return { start: 0, end: 0 };

  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleCount = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight));
  return {
    start: Math.max(0, firstVisible - overscan),
    end: Math.min(itemCount, firstVisible + visibleCount + overscan)
  };
}

/**
 * Intersects the outer viewport with the list. A list scrolled out of view still renders a small
 * window at its nearest edge, so it keeps a tab stop.
 */
function getEmbeddedVisibleRange(
  itemCount: number,
  viewTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number
): VisibleRange {
  const listHeight = itemCount * rowHeight;
  const top = Math.min(Math.max(0, viewTop), Math.max(0, listHeight - rowHeight));
  const bottom = Math.min(listHeight, viewTop + viewportHeight);
  return getVisibleRange(itemCount, top, bottom - top, rowHeight, overscan);
}

/**
 * Measures the spacer rather than the list root, so the root's padding is not counted as rows.
 * A container without a layout box, such as a hidden tab, keeps the last known offset.
 */
function getSpacerOffset(container: HTMLElement, spacer: HTMLElement, lastOffset: number): number {
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width === 0 && containerRect.height === 0) return lastOffset;
  return spacer.getBoundingClientRect().top - containerRect.top - container.clientTop + container.scrollTop;
}

function getScrollPaddingTop(container: HTMLElement): number {
  const value = Number.parseFloat(window.getComputedStyle(container).scrollPaddingTop);
  return Number.isFinite(value) ? value : 0;
}

/** Scrolls the least distance that shows the row below the scroll padding, such as a sticky header. */
function revealRow(frame: Readonly<ScrollFrame>, index: number, rowHeight: number, scrollPaddingTop: number): void {
  const { scroller, offset } = frame;
  const rowTop = offset + index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  if (rowTop < scroller.scrollTop + scrollPaddingTop) scroller.scrollTop = Math.max(0, rowTop - scrollPaddingTop);
  else if (rowBottom > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = Math.max(0, rowBottom - scroller.clientHeight);
  }
}

export function FixedSizeVirtualList<T>({
  items,
  itemKey,
  rowHeight,
  overscan = 4,
  ariaLabel,
  selectedKey,
  className,
  multiSelectable = true,
  role = "listbox",
  scrollContainer,
  onNavigate,
  onItemKeyDown,
  renderOverlay,
  renderItem
}: FixedSizeVirtualListProps<T>): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const embeddedOffsetRef = useRef(0);
  const previousSelectedKeyRef = useRef<string | null | undefined>(undefined);
  const [viewportHeight, setViewportHeight] = useState(0);
  // Embedded lists store the outer scroll position relative to their first row, so it can be negative.
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const pendingFocusRef = useRef<number | null>(null);
  const embedded = scrollContainer !== undefined;
  const boundedOverscan = Math.max(0, overscan);

  const measure = useCallback(() => {
    const nextHeight = scrollerRef.current?.clientHeight ?? 0;
    setViewportHeight((current) => current === nextHeight ? current : nextHeight);
  }, []);

  const getScrollFrame = useCallback((): ScrollFrame | null => {
    if (scrollContainer === undefined) {
      const scroller = scrollerRef.current;
      return scroller ? { scroller, offset: 0 } : null;
    }
    const spacer = spacerRef.current;
    if (!scrollContainer || !spacer) return null;
    embeddedOffsetRef.current = getSpacerOffset(scrollContainer, spacer, embeddedOffsetRef.current);
    return { scroller: scrollContainer, offset: embeddedOffsetRef.current };
  }, [scrollContainer]);

  const syncScrollState = useCallback((frame: Readonly<ScrollFrame>) => {
    setScrollTop(frame.scroller.scrollTop - frame.offset);
    setViewportHeight(frame.scroller.clientHeight);
  }, []);

  const getScrollPadding = useCallback(
    (frame: Readonly<ScrollFrame>) => scrollContainer ? getScrollPaddingTop(frame.scroller) : 0,
    [scrollContainer]
  );

  /** Moves focus to the list before the browser drops it with an unmounted row. */
  const keepFocusInList = useCallback((nextRange: Readonly<VisibleRange>) => {
    const list = scrollerRef.current;
    const activeElement = document.activeElement;
    if (!list || !(activeElement instanceof HTMLElement) || !list.contains(activeElement)) return;
    if (!activeElement.matches('[role="option"], [role="treeitem"]')) return;
    const activeIndex = Number(activeElement.dataset.virtualIndex);
    if (Number.isFinite(activeIndex) && (activeIndex < nextRange.start || activeIndex >= nextRange.end)) {
      list.focus({ preventScroll: true });
    }
  }, []);

  useLayoutEffect(() => {
    if (!embedded) measure();
  }, [embedded, measure]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (embedded || !scroller) return;

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(scroller);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [embedded, measure]);

  const syncEmbeddedViewport = useEffectEvent(() => {
    const frame = getScrollFrame();
    if (!frame) return;
    keepFocusInList(getEmbeddedVisibleRange(
      items.length,
      frame.scroller.scrollTop - frame.offset,
      frame.scroller.clientHeight,
      rowHeight,
      boundedOverscan
    ));
    syncScrollState(frame);
  });

  useLayoutEffect(() => {
    if (!scrollContainer) return;
    const frame = getScrollFrame();
    if (frame) syncScrollState(frame);
  }, [getScrollFrame, scrollContainer, syncScrollState]);

  useEffect(() => {
    if (!scrollContainer) return;
    const container = scrollContainer;
    const handleViewportChange = (): void => syncEmbeddedViewport();
    container.addEventListener("scroll", handleViewportChange, { passive: true });

    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", handleViewportChange);
      return () => {
        container.removeEventListener("scroll", handleViewportChange);
        window.removeEventListener("resize", handleViewportChange);
      };
    }

    // Content above the list, such as a sibling list that grows, moves it without a scroll event.
    const observer = new ResizeObserver(handleViewportChange);
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    return () => {
      container.removeEventListener("scroll", handleViewportChange);
      observer.disconnect();
    };
  }, [scrollContainer]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    // The outer scroller clamps itself when embedded content shrinks.
    if (embedded || !scroller) return;
    const maxScrollTop = Math.max(0, items.length * rowHeight - scroller.clientHeight);
    if (scroller.scrollTop <= maxScrollTop) return;
    scroller.scrollTop = maxScrollTop;
    setScrollTop(maxScrollTop);
  }, [embedded, items.length, rowHeight]);

  useLayoutEffect(() => {
    if (!selectedKey || selectedKey === previousSelectedKeyRef.current) {
      previousSelectedKeyRef.current = selectedKey;
      return;
    }

    const frame = getScrollFrame();
    // An embedded list reveals the selection once its scroller is available.
    if (!frame) return;
    previousSelectedKeyRef.current = selectedKey;
    const index = items.findIndex((item) => itemKey(item) === selectedKey);
    if (index === -1) return;
    revealRow(frame, index, rowHeight, getScrollPadding(frame));
    syncScrollState(frame);
  }, [getScrollFrame, getScrollPadding, itemKey, items, rowHeight, selectedKey, syncScrollState]);

  const range = embedded
    ? getEmbeddedVisibleRange(items.length, scrollTop, viewportHeight, rowHeight, boundedOverscan)
    : getVisibleRange(items.length, scrollTop, viewportHeight, rowHeight, boundedOverscan);
  const visibleItems = useMemo(() => items.slice(range.start, range.end), [items, range.end, range.start]);
  const focusIndex = onNavigate ? items.findIndex((item) => itemKey(item) === (focusedKey ?? selectedKey)) : -1;
  const tabStopIndex = focusIndex >= range.start && focusIndex < range.end ? focusIndex : range.start;

  useLayoutEffect(() => {
    const index = pendingFocusRef.current;
    if (index === null) return;
    const row = scrollerRef.current?.querySelector<HTMLElement>(`[data-virtual-index="${index}"]`);
    if (row) {
      pendingFocusRef.current = null;
      row.focus({ preventScroll: true });
    }
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onNavigate || event.defaultPrevented || items.length === 0) return;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-virtual-index]") : null;
    const index = row ? Number(row.dataset.virtualIndex) : Math.max(0, focusIndex);
    const item = items[index];
    if (item === undefined) return;
    let nextIndex = onItemKeyDown?.(item, index, event);
    if (nextIndex === undefined && !event.defaultPrevented) {
      if (event.key === "ArrowDown") nextIndex = Math.min(items.length - 1, index + 1);
      else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = items.length - 1;
    }
    const nextItem = nextIndex === undefined ? undefined : items[nextIndex];
    if (nextIndex === undefined || nextItem === undefined) return;
    event.preventDefault();
    const frame = getScrollFrame();
    if (!frame) return;
    revealRow(frame, nextIndex, rowHeight, getScrollPadding(frame));
    pendingFocusRef.current = nextIndex;
    syncScrollState(frame);
    setFocusedKey(itemKey(nextItem));
    onNavigate(nextItem, event);
    // A boundary key can keep both state values unchanged.
    const mountedRow = scrollerRef.current?.querySelector<HTMLElement>(`[data-virtual-index="${nextIndex}"]`);
    if (mountedRow) {
      pendingFocusRef.current = null;
      mountedRow.focus({ preventScroll: true });
    }
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const scroller = event.currentTarget;
    const nextScrollTop = scroller.scrollTop;
    keepFocusInList(getVisibleRange(items.length, nextScrollTop, scroller.clientHeight, rowHeight, boundedOverscan));
    setScrollTop(nextScrollTop);
  };

  return (
    <div
      ref={scrollerRef}
      className={embedded ? (className ? `${className} is-embedded` : "is-embedded") : className}
      role={role}
      aria-label={ariaLabel}
      aria-multiselectable={multiSelectable}
      tabIndex={onNavigate && items.length > 0 ? -1 : 0}
      onKeyDown={handleKeyDown}
      onFocusCapture={onNavigate ? (event) => {
        const row = event.target.closest<HTMLElement>("[data-virtual-index]");
        const item = row ? items[Number(row.dataset.virtualIndex)] : undefined;
        if (item !== undefined) setFocusedKey(itemKey(item));
      } : undefined}
      onScroll={embedded ? undefined : handleScroll}
    >
      <div ref={spacerRef} className="virtual-list-spacer" style={{ height: `${items.length * rowHeight}px` }}>
        {renderOverlay?.(range)}
        {visibleItems.map((item, offset) => {
          const index = range.start + offset;
          return <Fragment key={itemKey(item)}>{renderItem(item, index, {
            ...(onNavigate ? { tabIndex: index === tabStopIndex ? 0 : -1 } : {}),
            style: {
              position: "absolute",
              top: `${index * rowHeight}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`
            },
            "aria-posinset": index + 1,
            "aria-setsize": items.length
          })}</Fragment>;
        })}
      </div>
    </div>
  );
}
