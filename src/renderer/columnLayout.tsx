import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { Button, TooltipButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const STORAGE_VERSION = 2;

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
    // A read-only storage area must not stop column visibility changes.
  }
}

export interface PersistentColumnLayout<Id extends string> {
  layout: ColumnLayout<Id>;
  setVisibility: (id: Id, visible: boolean) => void;
  canHide: (id: Id) => boolean;
}

export function usePersistentColumnLayout<Id extends string>(
  storageKey: string,
  columns: readonly ColumnDefinition<Id>[]
): PersistentColumnLayout<Id> {
  const [layout, setLayout] = useState<ColumnLayout<Id>>(() => loadLayout(storageKey, columns));

  useEffect(() => {
    setLayout((current) => normalizeColumnLayout({ version: STORAGE_VERSION, ...current }, columns));
  }, [columns]);

  useEffect(() => {
    saveLayout(storageKey, layout);
  }, [layout, storageKey]);

  const setVisibility = useCallback((id: Id, visible: boolean) => {
    setLayout((current) => {
      if (!visible && current.visibility[id] && Object.values(current.visibility).filter(Boolean).length === 1) return current;
      return { ...current, visibility: { ...current.visibility, [id]: visible } };
    });
  }, []);

  const canHide = useCallback((id: Id): boolean => {
    return !layout.visibility[id] || Object.values(layout.visibility).filter(Boolean).length > 1;
  }, [layout.visibility]);

  return { layout, setVisibility, canHide };
}

export function ColumnVisibilityMenu<Id extends string>({
  columns,
  controller,
  buttonSize = "xs",
  iconOnly = false
}: {
  columns: readonly ColumnDefinition<Id>[];
  controller: PersistentColumnLayout<Id>;
  buttonSize?: "xs" | "sm";
  /** Shows a ghost icon button with a tooltip instead of the outlined "Columns" button. */
  iconOnly?: boolean;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {iconOnly ? (
          <TooltipButton
            type="button"
            variant="ghost"
            size={buttonSize === "xs" ? "icon-xs" : "icon-sm"}
            aria-label="Choose table columns"
            tooltip="Choose columns"
          >
            <Columns3 aria-hidden="true" />
          </TooltipButton>
        ) : (
          <Button type="button" variant="outline" size={buttonSize} aria-label="Choose table columns">
            <Columns3 aria-hidden="true" />
            Columns
          </Button>
        )}
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
