import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from "react";
import { Columns3, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const STORAGE_VERSION = 2;
const WIDTH_STEP = 10;

export interface ColumnDefinition<Id extends string> {
  id: Id;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
  defaultVisible?: boolean;
}

export interface ColumnLayout<Id extends string> {
  order: Id[];
  widths: Record<Id, number>;
  visibility: Record<Id, boolean>;
}

interface StoredColumnLayout {
  version: number;
  order: string[];
  widths: Record<string, number>;
  visibility?: Record<string, boolean>;
}

export function normalizeColumnLayout<Id extends string>(
  value: Partial<StoredColumnLayout> | null,
  columns: readonly ColumnDefinition<Id>[]
): ColumnLayout<Id> {
  const ids = columns.map((column) => column.id);
  const validIds = new Set<Id>(ids);
  const savedOrder = Array.isArray(value?.order)
    ? value.order.filter((id): id is Id => validIds.has(id as Id))
    : [];
  const order = [...new Set(savedOrder), ...ids.filter((id) => !savedOrder.includes(id))];
  const widths = {} as Record<Id, number>;
  const visibility = {} as Record<Id, boolean>;
  for (const column of columns) {
    const savedWidth = value?.widths?.[column.id];
    const width = typeof savedWidth === "number" && Number.isFinite(savedWidth)
      ? savedWidth
      : column.defaultWidth;
    widths[column.id] = clampWidth(width, column);
    const savedVisibility = value?.visibility?.[column.id];
    visibility[column.id] = typeof savedVisibility === "boolean" ? savedVisibility : column.defaultVisible !== false;
  }
  if (ids.length > 0 && !Object.values(visibility).some(Boolean)) {
    const fallback = columns.find((column) => column.defaultVisible !== false) ?? columns[0];
    if (fallback) visibility[fallback.id] = true;
  }
  return { order, widths, visibility };
}

export function reorderColumn<Id extends string>(order: readonly Id[], source: Id, target: Id): Id[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return [...order];
  const next = order.filter((id) => id !== source);
  const targetIndex = order.indexOf(target);
  next.splice(targetIndex, 0, source);
  return next;
}

function getMaxWidth<Id extends string>(column: ColumnDefinition<Id>): number {
  return Math.max(column.minWidth, column.maxWidth ?? 900);
}

function clampWidth<Id extends string>(width: number, column: ColumnDefinition<Id>): number {
  return Math.round(Math.min(getMaxWidth(column), Math.max(column.minWidth, width)));
}

function loadLayout<Id extends string>(storageKey: string, columns: readonly ColumnDefinition<Id>[]): ColumnLayout<Id> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return normalizeColumnLayout(null, columns);
    const stored = JSON.parse(raw) as Partial<StoredColumnLayout>;
    return normalizeColumnLayout(stored.version === 1 || stored.version === STORAGE_VERSION ? stored : null, columns);
  } catch {
    return normalizeColumnLayout(null, columns);
  }
}

function saveLayout<Id extends string>(storageKey: string, layout: ColumnLayout<Id>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ version: STORAGE_VERSION, ...layout }));
  } catch {
    // A read-only storage area must not stop column interactions.
  }
}

export function getRenderedColumnWidths<Id extends string>(
  layout: ColumnLayout<Id>,
  availableWidth: number,
  fillColumn?: Id
): Record<Id, number> {
  const widths = { ...layout.widths };
  if (fillColumn && layout.visibility[fillColumn]) {
    const usedWidth = layout.order.filter((id) => layout.visibility[id])
      .reduce((total, id) => total + widths[id], 0);
    widths[fillColumn] += Math.max(0, availableWidth - usedWidth);
  }
  return widths;
}

function getLayoutStyle<Id extends string>(layout: ColumnLayout<Id>, availableWidth: number, fillColumn?: Id): CSSProperties {
  const widths = getRenderedColumnWidths(layout, availableWidth, fillColumn);
  const style: Record<string, string> = {
    "--data-grid-columns": layout.order.filter((id) => layout.visibility[id]).map((id) => `${widths[id]}px`).join(" ")
  };
  for (const id of layout.order) style[`--data-grid-width-${id}`] = `${widths[id]}px`;
  return style as CSSProperties;
}

export interface PersistentColumnLayout<Id extends string> {
  layout: ColumnLayout<Id>;
  visibleOrder: Id[];
  containerRef: RefObject<HTMLElement | null>;
  style: CSSProperties;
  previewWidth: (id: Id, width: number) => number;
  commitWidth: (id: Id, width: number) => void;
  resetWidth: (id: Id) => void;
  move: (id: Id, direction: -1 | 1) => void;
  reorder: (source: Id, target: Id) => void;
  setVisibility: (id: Id, visible: boolean) => void;
  canHide: (id: Id) => boolean;
}

export function usePersistentColumnLayout<Id extends string>(
  storageKey: string,
  columns: readonly ColumnDefinition<Id>[],
  sizing?: { fillColumn: Id; gap: number; padding: number }
): PersistentColumnLayout<Id> {
  const columnsById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const [layout, setLayout] = useState<ColumnLayout<Id>>(() => loadLayout(storageKey, columns));
  const containerRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const fillColumn = sizing?.fillColumn;
  const gap = sizing?.gap ?? 0;
  const padding = sizing?.padding ?? 0;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fillColumn) return;
    setContainerWidth(container.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setContainerWidth(container.clientWidth));
    observer.observe(container);
    return () => observer.disconnect();
  }, [fillColumn]);
  const visibleCount = layout.order.filter((id) => layout.visibility[id]).length;
  const availableWidth = containerWidth - padding - Math.max(0, visibleCount - 1) * gap;

  useEffect(() => {
    setLayout((current) => normalizeColumnLayout({ version: STORAGE_VERSION, ...current }, columns));
  }, [columns]);

  useEffect(() => {
    saveLayout(storageKey, layout);
  }, [layout, storageKey]);

  const applyPreview = useCallback((next: ColumnLayout<Id>) => {
    const style = getLayoutStyle(next, availableWidth, fillColumn);
    for (const [name, value] of Object.entries(style)) containerRef.current?.style.setProperty(name, String(value));
  }, [availableWidth, fillColumn]);

  const previewWidth = useCallback((id: Id, width: number): number => {
    const column = columnsById.get(id);
    if (!column) return width;
    const nextWidth = clampWidth(width, column);
    applyPreview({ ...layout, widths: { ...layout.widths, [id]: nextWidth } });
    return nextWidth;
  }, [applyPreview, columnsById, layout]);

  const commitWidth = useCallback((id: Id, width: number) => {
    const column = columnsById.get(id);
    if (!column) return;
    setLayout((current) => ({ ...current, widths: { ...current.widths, [id]: clampWidth(width, column) } }));
  }, [columnsById]);

  const resetWidth = useCallback((id: Id) => {
    const column = columnsById.get(id);
    if (column) commitWidth(id, column.defaultWidth);
  }, [columnsById, commitWidth]);

  const move = useCallback((id: Id, direction: -1 | 1) => {
    setLayout((current) => {
      const visibleOrder = current.order.filter((columnId) => current.visibility[columnId]);
      const index = visibleOrder.indexOf(id);
      const target = visibleOrder[index + direction];
      return target ? { ...current, order: reorderColumn(current.order, id, target) } : current;
    });
  }, []);

  const reorder = useCallback((source: Id, target: Id) => {
    setLayout((current) => ({ ...current, order: reorderColumn(current.order, source, target) }));
  }, []);

  const setVisibility = useCallback((id: Id, visible: boolean) => {
    setLayout((current) => {
      if (!visible && current.visibility[id] && Object.values(current.visibility).filter(Boolean).length === 1) return current;
      return { ...current, visibility: { ...current.visibility, [id]: visible } };
    });
  }, []);

  const canHide = useCallback((id: Id): boolean => {
    return !layout.visibility[id] || Object.values(layout.visibility).filter(Boolean).length > 1;
  }, [layout.visibility]);

  const visibleOrder = layout.order.filter((id) => layout.visibility[id]);

  return {
    layout,
    visibleOrder,
    containerRef,
    style: getLayoutStyle(layout, availableWidth, fillColumn),
    previewWidth,
    commitWidth,
    resetWidth,
    move,
    reorder,
    setVisibility,
    canHide
  };
}

export function AdjustableColumnHeader<Id extends string>({
  columns,
  controller,
  className
}: {
  columns: readonly ColumnDefinition<Id>[];
  controller: PersistentColumnLayout<Id>;
  className: string;
}): ReactNode {
  const columnsById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const labelPrefix = useId();
  const draggedId = useRef<Id | null>(null);
  const resize = useRef<{ id: Id; startX: number; startWidth: number; width: number } | null>(null);

  const renderedWidth = (id: Id): number => {
    const width = Number.parseFloat(String(controller.style[`--data-grid-width-${id}` as keyof CSSProperties] ?? ""));
    return Number.isFinite(width) ? width : controller.layout.widths[id];
  };

  const startResize = (event: PointerEvent<HTMLSpanElement>, id: Id): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { id, startX: event.clientX, startWidth: renderedWidth(id), width: renderedWidth(id) };
  };

  const updateResize = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!resize.current) return;
    resize.current.width = controller.previewWidth(resize.current.id, resize.current.startWidth + event.clientX - resize.current.startX);
  };

  const finishResize = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!resize.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    controller.commitWidth(resize.current.id, resize.current.width);
    resize.current = null;
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLSpanElement>, id: Id): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : WIDTH_STEP);
    controller.commitWidth(id, renderedWidth(id) + delta);
  };

  return (
    <div className={className} role="row">
      {controller.visibleOrder.map((id) => {
        const column = columnsById.get(id);
        if (!column) return null;
        return (
          <span
            key={id}
            className="adjustable-column-header"
            data-column-id={id}
            role="columnheader"
            tabIndex={0}
            draggable
            title={`Drag ${column.label} to move it, or press Alt and an arrow key`}
            onKeyDown={(event) => {
              if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              controller.move(id, event.key === "ArrowLeft" ? -1 : 1);
            }}
            onDragStart={(event) => {
              draggedId.current = id;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
            }}
            onDragEnd={() => { draggedId.current = null; }}
            onDragOver={(event) => {
              if (draggedId.current && draggedId.current !== id) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId.current) controller.reorder(draggedId.current, id);
              draggedId.current = null;
            }}
          >
            <GripVertical className="adjustable-column-grip" aria-hidden="true" />
            <span id={`${labelPrefix}-${id}`} className="truncate">{column.label}</span>
            <span
              className="column-resize-handle"
              role="separator"
              tabIndex={0}
              aria-label="Resize column"
              aria-describedby={`${labelPrefix}-${id}`}
              aria-orientation="vertical"
              aria-valuemin={column.minWidth}
              aria-valuemax={Math.max(getMaxWidth(column), renderedWidth(id))}
              aria-valuenow={renderedWidth(id)}
              onPointerDown={(event) => startResize(event, id)}
              onPointerMove={updateResize}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
              onDoubleClick={() => controller.resetWidth(id)}
              onKeyDown={(event) => resizeWithKeyboard(event, id)}
            />
          </span>
        );
      })}
    </div>
  );
}

export function ColumnVisibilityMenu<Id extends string>({
  columns,
  controller,
  buttonSize = "xs"
}: {
  columns: readonly ColumnDefinition<Id>[];
  controller: PersistentColumnLayout<Id>;
  buttonSize?: "xs" | "sm";
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={buttonSize} aria-label="Choose table columns">
          <Columns3 aria-hidden="true" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={controller.layout.visibility[column.id]}
            disabled={!controller.canHide(column.id)}
            onCheckedChange={(checked) => controller.setVisibility(column.id, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrderedCells<Id extends string>({ order, cells }: { order: readonly Id[]; cells: Record<Id, ReactNode> }): ReactNode {
  return <>{order.map((id) => <FragmentWithKey key={id}>{cells[id]}</FragmentWithKey>)}</>;
}

function FragmentWithKey({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
