import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import type { GroupImperativeHandle, Layout, LayoutChangedMeta } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

/**
 * Every view reads this one width in pixels, so the list column has the same width in every view.
 * The library stores layouts as percentages of the group, which give different widths in groups
 * that were laid out at different window widths.
 */
const LIST_COLUMN_STORAGE_KEY = "githead.list-column";
const DEFAULT_LIST_COLUMN_WIDTH = 360;
const MIN_LIST_COLUMN_WIDTH = 280;
const MAX_LIST_COLUMN_WIDTH = 520;
/** The library rounds layout percentages, so a smaller difference is not a different width. */
const LIST_COLUMN_WIDTH_TOLERANCE = 1;
const NARROW_LAYOUT_QUERY = "(max-width: 839px)";
const SELECTED_ROW_SELECTOR = '[role="option"][aria-selected="true"], [role="treeitem"][aria-selected="true"]';
const LIST_SELECTOR = '[role="listbox"], [role="tree"]';

/** A width that localStorage refused. It applies for the rest of the session. */
let unsavedListColumnWidth: number | null = null;

/** History and Analytics stay mounted while hidden, so a width set in another view must reach them. */
const listColumnWidthListeners = new Set<() => void>();

function clampListColumnWidth(width: number): number {
  return Math.min(MAX_LIST_COLUMN_WIDTH, Math.max(MIN_LIST_COLUMN_WIDTH, width));
}

function readListColumnWidth(): number {
  if (unsavedListColumnWidth !== null) return unsavedListColumnWidth;
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(LIST_COLUMN_STORAGE_KEY);
  } catch {
    return DEFAULT_LIST_COLUMN_WIDTH;
  }
  const width = stored === null || stored.trim() === "" ? Number.NaN : Number(stored);
  return Number.isFinite(width) && width > 0 ? clampListColumnWidth(width) : DEFAULT_LIST_COLUMN_WIDTH;
}

function writeListColumnWidth(width: number): void {
  if (!Number.isFinite(width)) return;
  const nextWidth = Math.round(clampListColumnWidth(width));
  try {
    window.localStorage.setItem(LIST_COLUMN_STORAGE_KEY, String(nextWidth));
    unsavedListColumnWidth = null;
  } catch {
    unsavedListColumnWidth = nextWidth;
  }
  for (const listener of listColumnWidthListeners) listener();
}

function resetListColumnWidth(): void {
  writeListColumnWidth(DEFAULT_LIST_COLUMN_WIDTH);
}

function getNarrowLayoutQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(NARROW_LAYOUT_QUERY) ?? null;
}

function subscribeToNarrowLayout(onChange: () => void): () => void {
  const media = getNarrowLayoutQuery();
  if (typeof media?.addEventListener !== "function") return () => {};
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readNarrowLayout(): boolean {
  return getNarrowLayoutQuery()?.matches === true;
}

function readServerNarrowLayout(): boolean {
  return false;
}

/** Focuses the selected row, else the list, else the column. Returns keyboard focus to the list after Back. */
function focusListColumn(column: HTMLElement): void {
  const selectedRow = column.querySelector<HTMLElement>(SELECTED_ROW_SELECTOR);
  // A selected row may need to scroll into view. The list and the column stay where they are.
  selectedRow?.focus();
  if (selectedRow && document.activeElement === selectedRow) return;
  for (const target of [column.querySelector<HTMLElement>(LIST_SELECTOR), column]) {
    target?.focus({ preventScroll: true });
    if (target && document.activeElement === target) return;
  }
}

export interface ListDetailLayoutProps {
  /** Names the DOM ids and data attributes, so it must be unique among mounted layouts. */
  id: string;
  list: ReactNode;
  /** One element; it fills the detail pane, or the surface card when detailCard is set. */
  detail: ReactNode;
  /** In a narrow window, shows the detail instead of the list. A wide window always shows both. */
  detailOpen?: boolean;
  /** Called by the "Back to list" button that a narrow window shows with the detail. */
  onBack?: () => void;
  /** Wraps the detail in the raised surface card. Views that lay out their own cards turn it off. */
  detailCard?: boolean;
  /** A lowercase noun phrase that names the resize handle, for example "commit list". */
  listLabel?: string;
  className?: string;
}

/**
 * The list column and detail pane that every view uses. The column is resizable from 280px to
 * 520px and starts at 360px. Every view shows one persisted width in pixels, also after a window
 * resize. Below 840px the layout shows the list, or the detail with a back button.
 */
export function ListDetailLayout({
  id,
  list,
  detail,
  detailOpen = false,
  onBack,
  detailCard = true,
  listLabel = "list column",
  className
}: ListDetailLayoutProps): ReactNode {
  const narrow = useSyncExternalStore(subscribeToNarrowLayout, readNarrowLayout, readServerNarrowLayout);
  const detailContent = detailCard ? (
    <div className="detail-surface grid min-h-0 overflow-hidden rounded-lg border border-border bg-surface">{detail}</div>
  ) : detail;

  return narrow ? (
    <NarrowListDetailLayout
      id={id}
      list={list}
      detail={detailContent}
      detailOpen={detailOpen}
      onBack={onBack}
      className={className}
    />
  ) : (
    <WideListDetailLayout
      id={id}
      list={list}
      detail={detailContent}
      detailOpen={detailOpen}
      listLabel={listLabel}
      className={className}
    />
  );
}

function WideListDetailLayout({ id, list, detail, detailOpen, listLabel, className }: {
  id: string;
  list: ReactNode;
  detail: ReactNode;
  detailOpen: boolean;
  listLabel: string;
  className: string | undefined;
}): ReactNode {
  const listPanelId = `${id}-list`;
  const detailPanelId = `${id}-detail`;
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const listPanelRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  /** Set when the shared width changed while this view was hidden. */
  const widthPendingRef = useRef(false);
  // Read once per mount: a new defaultSize registers the panel again and resets the group layout.
  const [initialListWidth] = useState(readListColumnWidth);

  /** Measures the group as the library does, as the sum of its panels. A hidden group measures 0. */
  const measureGroupWidth = useCallback(
    () => (listPanelRef.current?.offsetWidth ?? 0) + (detailPanelRef.current?.offsetWidth ?? 0),
    []
  );

  /** Converts the shared pixel width to this group's layout. It does nothing when the width already matches. */
  const applySharedWidth = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    const groupWidth = measureGroupWidth();
    if (groupWidth <= 0) {
      // A hidden view has no width to convert with. It applies the width when it shows again.
      widthPendingRef.current = true;
      return;
    }
    widthPendingRef.current = false;
    const width = readListColumnWidth();
    try {
      const listSize = group.getLayout()[listPanelId];
      if (listSize !== undefined && Math.abs(listSize * groupWidth / 100 - width) < LIST_COLUMN_WIDTH_TOLERANCE) return;
      const nextListSize = width * 100 / groupWidth;
      group.setLayout({ [listPanelId]: nextListSize, [detailPanelId]: 100 - nextListSize });
    } catch {
      // The group unregistered during the update. It reads the shared width when it mounts again.
    }
  }, [detailPanelId, listPanelId, measureGroupWidth]);

  useEffect(() => {
    listColumnWidthListeners.add(applySharedWidth);
    return () => {
      listColumnWidthListeners.delete(applySharedWidth);
    };
  }, [applySharedWidth]);

  const handleLayoutChanged = useCallback((layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) {
      // After a mount, a window resize or a hidden view showing again, the library can hold a width
      // that a percentage of another group size gave. Only the user changes the shared width.
      applySharedWidth();
      return;
    }
    const listSize = (meta.requestedLayout ?? layout)[listPanelId];
    const groupWidth = measureGroupWidth();
    if (listSize === undefined || groupWidth <= 0) return;
    writeListColumnWidth(listSize * groupWidth / 100);
  }, [applySharedWidth, listPanelId, measureGroupWidth]);

  const handleListResize = useCallback(() => {
    // The library reports panel sizes after it measures the group, so the conversion uses the current
    // group width. A view that shows again at an unchanged size reports no layout change.
    if (widthPendingRef.current) applySharedWidth();
  }, [applySharedWidth]);

  return (
    <ResizablePanelGroup
      id={`${id}-list-detail`}
      orientation="horizontal"
      className={cn("list-detail h-full min-h-0 bg-background", className)}
      data-list-detail={id}
      data-layout="wide"
      data-detail-open={detailOpen ? "true" : "false"}
      groupRef={groupRef}
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id={listPanelId}
        elementRef={listPanelRef}
        defaultSize={`${initialListWidth}px`}
        minSize={`${MIN_LIST_COLUMN_WIDTH}px`}
        maxSize={`${MAX_LIST_COLUMN_WIDTH}px`}
        groupResizeBehavior="preserve-pixel-size"
        onResize={handleListResize}
        className="list-column min-h-0 border-r border-border bg-background"
      >
        {list}
      </ResizablePanel>
      <ResizableHandle
        aria-label={`Resize ${listLabel}`}
        // The library resets only this group to its mount width. The shared reset reaches every view.
        disableDoubleClick
        onDoubleClick={resetListColumnWidth}
        className="bg-transparent data-[separator=active]:bg-ring data-[separator=hover]:bg-ring/60"
      />
      <ResizablePanel
        id={detailPanelId}
        elementRef={detailPanelRef}
        minSize="420px"
        className="detail-pane grid min-h-0 grid-rows-[minmax(0,1fr)] bg-background p-4"
      >
        {detail}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function NarrowListDetailLayout({ id, list, detail, detailOpen, onBack, className }: {
  id: string;
  list: ReactNode;
  detail: ReactNode;
  detailOpen: boolean;
  onBack: (() => void) | undefined;
  className: string | undefined;
}): ReactNode {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const listColumnRef = useRef<HTMLDivElement>(null);
  const previousDetailOpenRef = useRef(detailOpen);

  useLayoutEffect(() => {
    const wasDetailOpen = previousDetailOpenRef.current;
    previousDetailOpenRef.current = detailOpen;
    if (detailOpen === wasDetailOpen) return;
    // The focused control unmounted with the pane it was in. Keep keyboard focus inside the layout.
    const activeElement = document.activeElement;
    if (activeElement !== null && activeElement !== document.body) return;
    if (detailOpen) backButtonRef.current?.focus();
    else if (listColumnRef.current) focusListColumn(listColumnRef.current);
  }, [detailOpen]);

  return (
    <div
      id={`${id}-list-detail`}
      className={cn("list-detail grid h-full min-h-0 grid-rows-[minmax(0,1fr)] bg-background", className)}
      data-list-detail={id}
      data-layout="narrow"
      data-detail-open={detailOpen ? "true" : "false"}
    >
      {detailOpen ? (
        <div id={`${id}-detail`} className="detail-pane grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 bg-background p-4">
          <div className="flex min-w-0 items-center">
            <Button
              ref={backButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Back to list"
              disabled={!onBack}
              onClick={() => onBack?.()}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          </div>
          {detail}
        </div>
      ) : (
        <div ref={listColumnRef} id={`${id}-list`} tabIndex={-1} className="list-column h-full min-h-0 overflow-auto bg-background">
          {list}
        </div>
      )}
    </div>
  );
}
