import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent
} from "react";

export interface VirtualRowProps {
  style: CSSProperties;
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
  renderItem
}: FixedSizeVirtualListProps<T>): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const previousSelectedKeyRef = useRef<string | null | undefined>(undefined);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

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

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const scroller = event.currentTarget;
    const nextScrollTop = scroller.scrollTop;
    const nextRange = getVisibleRange(items.length, nextScrollTop, scroller.clientHeight, rowHeight, Math.max(0, overscan));
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && scroller.contains(activeElement) && activeElement.matches('[role="option"]')) {
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
      role="listbox"
      aria-label={ariaLabel}
      aria-multiselectable="true"
      tabIndex={0}
      onScroll={handleScroll}
    >
      <div className="virtual-list-spacer" style={{ height: `${items.length * rowHeight}px` }}>
        {visibleItems.map((item, offset) => {
          const index = range.start + offset;
          return <Fragment key={itemKey(item)}>{renderItem(item, index, {
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
