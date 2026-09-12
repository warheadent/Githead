import {
  Fragment,
  useCallback,
  useEffect,
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
  onNavigate?: (item: T, event: KeyboardEvent<HTMLDivElement>) => void;
  onItemKeyDown?: (item: T, index: number, event: KeyboardEvent<HTMLDivElement>) => number | undefined;
  renderOverlay?: (range: Readonly<VisibleRange>) => ReactNode;
  renderItem: (item: T, index: number, rowProps: VirtualRowProps) => ReactNode;
}

interface VisibleRange {
  start: number;
  end: number;
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
  onNavigate,
  onItemKeyDown,
  renderOverlay,
  renderItem
}: FixedSizeVirtualListProps<T>): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const previousSelectedKeyRef = useRef<string | null | undefined>(undefined);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const pendingFocusRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const nextHeight = scrollerRef.current?.clientHeight ?? 0;
    setViewportHeight((current) => current === nextHeight ? current : nextHeight);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(scroller);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const maxScrollTop = Math.max(0, items.length * rowHeight - scroller.clientHeight);
    if (scroller.scrollTop <= maxScrollTop) return;
    scroller.scrollTop = maxScrollTop;
    setScrollTop(maxScrollTop);
  }, [items.length, rowHeight]);

  useLayoutEffect(() => {
    const previousSelectedKey = previousSelectedKeyRef.current;
    previousSelectedKeyRef.current = selectedKey;
    if (!selectedKey || selectedKey === previousSelectedKey) return;

    const index = items.findIndex((item) => itemKey(item) === selectedKey);
    const scroller = scrollerRef.current;
    if (index === -1 || !scroller) return;

    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const viewportTop = scroller.scrollTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    const nextScrollTop = rowTop < viewportTop
      ? rowTop
      : rowBottom > viewportBottom
        ? rowBottom - scroller.clientHeight
        : viewportTop;
    if (nextScrollTop !== viewportTop) {
      scroller.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [itemKey, items, rowHeight, selectedKey]);

  const range = getVisibleRange(items.length, scrollTop, viewportHeight, rowHeight, Math.max(0, overscan));
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
    const scroller = scrollerRef.current;
    if (!scroller) return;
    measure();
    const top = nextIndex * rowHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + rowHeight > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = Math.max(0, top + rowHeight - scroller.clientHeight);
    }
    pendingFocusRef.current = nextIndex;
    setScrollTop(scroller.scrollTop);
    setFocusedKey(itemKey(nextItem));
    onNavigate(nextItem, event);
    // A boundary key can keep both state values unchanged.
    const mountedRow = scroller.querySelector<HTMLElement>(`[data-virtual-index="${nextIndex}"]`);
    if (mountedRow) {
      pendingFocusRef.current = null;
      mountedRow.focus({ preventScroll: true });
    }
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const scroller = event.currentTarget;
    const nextScrollTop = scroller.scrollTop;
    const nextRange = getVisibleRange(items.length, nextScrollTop, scroller.clientHeight, rowHeight, Math.max(0, overscan));
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && scroller.contains(activeElement) && activeElement.matches('[role="option"], [role="treeitem"]')) {
      const activeIndex = Number(activeElement.dataset.virtualIndex);
      if (Number.isFinite(activeIndex) && (activeIndex < nextRange.start || activeIndex >= nextRange.end)) {
        scroller.focus({ preventScroll: true });
      }
    }
    setScrollTop(nextScrollTop);
  };

  return (
    <div
      ref={scrollerRef}
      className={className}
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
      onScroll={handleScroll}
    >
      <div className="virtual-list-spacer" style={{ height: `${items.length * rowHeight}px` }}>
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
