import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCompact, niceScale, splitPath } from "./analyticsFormat";

/** Categorical colors in their validated order. Assign by entity, never by rank. */
export const SERIES_COLORS = Array.from({ length: 8 }, (_, index) => `var(--analytics-series-${index + 1})`);
export const OTHER_COLOR = "var(--analytics-other)";
export const POSITIVE_COLOR = "var(--analytics-positive)";
export const NEGATIVE_COLOR = "var(--analytics-negative)";
export const GOOD_COLOR = "var(--analytics-good)";
export const CRITICAL_COLOR = "var(--analytics-critical)";
export const NEUTRAL_COLOR = "var(--analytics-neutral)";
export const SEQUENTIAL_COLORS = Array.from({ length: 7 }, (_, index) => `var(--analytics-sequential-${index + 1})`);
export const ORDINAL_COLORS = Array.from({ length: 5 }, (_, index) => `var(--analytics-ordinal-${index + 1})`);

const FALLBACK_WIDTH = 640;
const BAR_GAP = 2;
const MAX_BAR = 24;

export interface TooltipRow {
  value: string;
  label?: string;
  color?: string;
}

export interface TooltipContent {
  title: string;
  rows: TooltipRow[];
}

interface TooltipState {
  content: TooltipContent;
  x: number;
  y: number;
}

function useChartTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const show = useCallback((content: TooltipContent, x: number, y: number) => setTooltip({ content, x, y }), []);
  const hide = useCallback(() => setTooltip(null), []);
  return { tooltip, show, hide };
}

/** Values lead and labels follow; rows are keyed with a short line in the series color. */
function ChartTooltip({ tooltip }: { tooltip: TooltipState | null }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!tooltip || !element) return;
    const { width, height } = element.getBoundingClientRect();
    let left = tooltip.x + 14;
    let top = tooltip.y + 14;
    if (left + width > window.innerWidth - 8) left = tooltip.x - width - 14;
    if (top + height > window.innerHeight - 8) top = tooltip.y - height - 14;
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tooltip]);
  if (!tooltip) return null;
  return createPortal(
    <div ref={ref} className="analytics-tooltip" role="tooltip" style={{ left: position.left, top: position.top }}>
      <div className="analytics-tooltip-title">{tooltip.content.title}</div>
      {tooltip.content.rows.map((row, index) => (
        <div key={index} className="analytics-tooltip-row">
          {row.color ? <span className="analytics-tooltip-key" style={{ background: row.color }} /> : null}
          <span className="analytics-tooltip-value">{row.value}</span>
          {row.label ? <span className="analytics-tooltip-label">{row.label}</span> : null}
        </div>
      ))}
    </div>,
    document.body
  );
}

function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.floor(element.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width || FALLBACK_WIDTH];
}

export interface TableData {
  columns: Array<{ label: string; numeric?: boolean }>;
  rows: Array<Array<string | number>>;
}

export function DataTable({ data, caption }: { data: TableData; caption: string }): ReactNode {
  return (
    <table className="analytics-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>{data.columns.map((column) => <th key={column.label} scope="col" className={column.numeric ? "is-numeric" : undefined}>{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, cellIndex) => (
            <td key={cellIndex} className={data.columns[cellIndex]?.numeric ? "is-numeric" : undefined}>{typeof cell === "number" ? cell.toLocaleString() : cell}</td>
          ))}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** A titled chart with an optional legend, actions, and a table view of the same data. */
export function ChartCard({
  title,
  description,
  legend,
  actions,
  table,
  className,
  children
}: {
  title: string;
  description?: ReactNode;
  legend?: ReactNode;
  actions?: ReactNode;
  table?: () => TableData;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();
  return (
    <section className={cn("analytics-card", className)} aria-labelledby={headingId}>
      <header className="analytics-card-header">
        <div className="min-w-0">
          <h3 id={headingId}>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="analytics-card-actions">
          {actions}
          {table ? (
            <Button type="button" variant="outline" size="xs" aria-pressed={showTable} onClick={() => setShowTable((value) => !value)}>
              {showTable ? "Chart" : "Table"}
            </Button>
          ) : null}
        </div>
      </header>
      {showTable && table ? (
        <div className="analytics-table-scroll"><DataTable data={table()} caption={title} /></div>
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
    </section>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  shape?: "square" | "line";
  icon?: ReactNode;
  hidden?: boolean;
}

export function ChartLegend({ items, onToggle }: { items: LegendItem[]; onToggle?: (key: string) => void }): ReactNode {
  return (
    <div className="analytics-legend">
      {items.map((item) => {
        const swatch = item.icon ?? <span className={item.shape === "line" ? "analytics-legend-line" : "analytics-legend-swatch"} style={{ background: item.color }} aria-hidden="true" />;
        return onToggle ? (
          <button key={item.key} type="button" aria-pressed={!item.hidden} className="analytics-legend-item" onClick={() => onToggle(item.key)}>
            {swatch}{item.label}
          </button>
        ) : (
          <span key={item.key} className="analytics-legend-item">{swatch}{item.label}</span>
        );
      })}
    </div>
  );
}

const roundTop = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${y + height}Z`;
};
const roundBottom = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y}H${x + width}V${y + height - r}A${r},${r} 0 0 1 ${x + width - r},${y + height}H${x + r}A${r},${r} 0 0 1 ${x},${y + height - r}Z`;
};
const rect = (x: number, y: number, width: number, height: number) => `M${x},${y}h${width}v${height}h${-width}Z`;

function YAxis({ ticks, x, right, y, format }: { ticks: number[]; x: number; right: number; y: (value: number) => number; format: (value: number) => string }): ReactNode {
  return (
    <g aria-hidden="true">
      {ticks.map((value) => {
        const position = Math.round(y(value)) + 0.5;
        return (
          <g key={value}>
            <line x1={x} x2={right} y1={position} y2={position} className={value === 0 ? "analytics-baseline" : "analytics-gridline"} />
            <text x={x - 6} y={position + 3.5} textAnchor="end" className="analytics-axis-text">{format(value)}</text>
          </g>
        );
      })}
    </g>
  );
}

function axisTicks(max: number, step: number, min = 0): number[] {
  const ticks: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return ticks;
}

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/** Stacked columns from one baseline, with a 2px surface gap between segments. */
export function ColumnChart({
  ariaLabel,
  series,
  count,
  height = 200,
  xTicks,
  xLabel,
  tooltipTitle,
  tooltipExtra,
  markers = [],
  valueLabel,
  yFormat = formatCompact,
  valueFormat = (value) => value.toLocaleString(),
  maxBarWidth = MAX_BAR
}: {
  ariaLabel: string;
  series: ColumnSeries[];
  count: number;
  height?: number;
  xTicks: (plotWidth: number) => number[];
  xLabel: (index: number) => string;
  tooltipTitle: (index: number) => string;
  tooltipExtra?: (index: number) => TooltipRow[];
  markers?: Array<{ index: number; label: string }>;
  valueLabel?: (index: number) => string | null;
  yFormat?: (value: number) => string;
  valueFormat?: (value: number) => string;
  maxBarWidth?: number;
}): ReactNode {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();
  const [hovered, setHovered] = useState<number | null>(null);
  const margin = { left: 44, right: 8, top: markers.length || valueLabel ? 22 : 8, bottom: 24 };
  const plotWidth = Math.max(10, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const totals = Array.from({ length: count }, (_, index) => series.reduce((total, item) => total + (item.values[index] ?? 0), 0));
  const { max, step } = niceScale(Math.max(1, ...totals));
  const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;
  const slot = plotWidth / Math.max(1, count);
  const bar = Math.max(1.5, Math.min(maxBarWidth, slot - BAR_GAP));
  const center = (index: number) => margin.left + slot * index + slot / 2;
  const focusable = count <= 40;
  // Dense tags become noise: label only markers whose text has room, and drop the lines when they would crowd the plot.
  let lastLabelEnd = -Infinity;
  const visibleMarkers = markers.length > plotWidth / 16 ? [] : [...markers].sort((a, b) => a.index - b.index).map((marker) => {
    const x = center(marker.index);
    const half = (marker.label.length * 6 + 8) / 2;
    const labeled = x - half >= lastLabelEnd + 6;
    if (labeled) lastLabelEnd = x + half;
    return { ...marker, labeled };
  });
  const content = (index: number): TooltipContent => ({
    title: tooltipTitle(index),
    rows: [
      ...series.filter((item) => series.length === 1 || item.values[index]).map((item) => ({ value: valueFormat(item.values[index] ?? 0), label: item.label, color: item.color })),
      ...(series.filter((item) => item.values[index]).length > 1 ? [{ value: valueFormat(totals[index] ?? 0), label: "total" }] : []),
      ...(tooltipExtra?.(index) ?? [])
    ]
  });
  return (
    <div ref={ref} className="analytics-chart">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <YAxis ticks={axisTicks(max, step)} x={margin.left} right={width - margin.right} y={y} format={yFormat} />
        {xTicks(plotWidth).map((index) => (
          <text key={index} x={Math.min(Math.max(center(index), margin.left + 16), width - margin.right - 16)} y={height - 7} textAnchor="middle" className="analytics-axis-text" aria-hidden="true">{xLabel(index)}</text>
        ))}
        {visibleMarkers.map((marker) => {
          const x = Math.round(center(marker.index)) + 0.5;
          return (
            <g key={`${marker.index}-${marker.label}`} aria-hidden="true">
              <line x1={x} x2={x} y1={margin.top - 4} y2={margin.top + plotHeight} className="analytics-marker" />
              {marker.labeled ? <text x={Math.min(Math.max(x, margin.left + 28), width - margin.right - 28)} y={margin.top - 8} textAnchor="middle" className="analytics-marker-text">{marker.label}</text> : null}
            </g>
          );
        })}
        {totals.map((total, index) => {
          const x = margin.left + slot * index + (slot - bar) / 2;
          const visible = series.filter((item) => (item.values[index] ?? 0) > 0);
          let accumulated = 0;
          const label = valueLabel?.(index);
          return (
            <g key={index} className={cn("analytics-column", hovered === index && "is-hovered")}>
              {visible.map((item, position) => {
                const value = item.values[index] ?? 0;
                let top = y(accumulated + value);
                let bottom = y(accumulated);
                accumulated += value;
                if (position > 0) bottom -= BAR_GAP / 2;
                if (position < visible.length - 1) top += BAR_GAP / 2;
                const segmentHeight = Math.max(0.75, bottom - top);
                const isTop = position === visible.length - 1;
                return <path key={item.key} d={isTop ? roundTop(x, bottom - segmentHeight, bar, segmentHeight, 4) : rect(x, bottom - segmentHeight, bar, segmentHeight)} style={{ fill: item.color }} />;
              })}
              {label && total > 0 ? <text x={x + bar / 2} y={y(total) - 6} textAnchor="middle" className="analytics-value-text">{label}</text> : null}
              <rect
                x={margin.left + slot * index}
                y={margin.top}
                width={slot}
                height={plotHeight}
                className="analytics-hit"
                tabIndex={focusable ? 0 : undefined}
                aria-label={focusable ? `${tooltipTitle(index)}: ${valueFormat(total)}` : undefined}
                onPointerMove={(event: PointerEvent) => { setHovered(index); show(content(index), event.clientX, event.clientY); }}
                onPointerLeave={() => { setHovered(null); hide(); }}
                onFocus={(event) => { const box = event.currentTarget.getBoundingClientRect(); setHovered(index); show(content(index), box.left + box.width / 2, box.top); }}
                onBlur={() => { setHovered(null); hide(); }}
              />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

/** Columns above and below a zero baseline, for added and removed amounts. */
export function DivergingColumnChart({
  ariaLabel,
  positive,
  negative,
  positiveLabel,
  negativeLabel,
  height = 220,
  xTicks,
  xLabel,
  tooltipTitle
}: {
  ariaLabel: string;
  positive: number[];
  negative: number[];
  positiveLabel: string;
  negativeLabel: string;
  height?: number;
  xTicks: (plotWidth: number) => number[];
  xLabel: (index: number) => string;
  tooltipTitle: (index: number) => string;
}): ReactNode {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();
  const [hovered, setHovered] = useState<number | null>(null);
  const margin = { left: 48, right: 8, top: 8, bottom: 24 };
  const count = positive.length;
  const plotWidth = Math.max(10, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const { max, step } = niceScale(Math.max(1, ...positive, ...negative), 2);
  const zero = margin.top + plotHeight / 2;
  const scale = plotHeight / 2 / max;
  const slot = plotWidth / Math.max(1, count);
  const bar = Math.max(1.5, Math.min(MAX_BAR, slot - BAR_GAP));
  const center = (index: number) => margin.left + slot * index + slot / 2;
  const focusable = count <= 40;
  const content = (index: number): TooltipContent => {
    const net = (positive[index] ?? 0) - (negative[index] ?? 0);
    return {
      title: tooltipTitle(index),
      rows: [
        { value: `+${(positive[index] ?? 0).toLocaleString()}`, label: positiveLabel, color: POSITIVE_COLOR },
        { value: `−${(negative[index] ?? 0).toLocaleString()}`, label: negativeLabel, color: NEGATIVE_COLOR },
        { value: `${net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString()}`, label: "net" }
      ]
    };
  };
  return (
    <div ref={ref} className="analytics-chart">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <YAxis
          ticks={axisTicks(max, step, -max)}
          x={margin.left}
          right={width - margin.right}
          y={(value) => zero - value * scale}
          format={(value) => (value > 0 ? `+${formatCompact(value)}` : value < 0 ? `−${formatCompact(-value)}` : "0")}
        />
        {xTicks(plotWidth).map((index) => (
          <text key={index} x={Math.min(Math.max(center(index), margin.left + 16), width - margin.right - 16)} y={height - 7} textAnchor="middle" className="analytics-axis-text" aria-hidden="true">{xLabel(index)}</text>
        ))}
        {positive.map((added, index) => {
          const removed = negative[index] ?? 0;
          const x = margin.left + slot * index + (slot - bar) / 2;
          return (
            <g key={index} className={cn("analytics-column", hovered === index && "is-hovered")}>
              {added > 0 ? <path d={roundTop(x, zero - 1 - Math.max(0.75, added * scale - 1), bar, Math.max(0.75, added * scale - 1), 4)} style={{ fill: POSITIVE_COLOR }} /> : null}
              {removed > 0 ? <path d={roundBottom(x, zero + 1, bar, Math.max(0.75, removed * scale - 1), 4)} style={{ fill: NEGATIVE_COLOR }} /> : null}
              <rect
                x={margin.left + slot * index}
                y={margin.top}
                width={slot}
                height={plotHeight}
                className="analytics-hit"
                tabIndex={focusable ? 0 : undefined}
                aria-label={focusable ? `${tooltipTitle(index)}: ${added} ${positiveLabel}, ${removed} ${negativeLabel}` : undefined}
                onPointerMove={(event: PointerEvent) => { setHovered(index); show(content(index), event.clientX, event.clientY); }}
                onPointerLeave={() => { setHovered(null); hide(); }}
                onFocus={(event) => { const box = event.currentTarget.getBoundingClientRect(); setHovered(index); show(content(index), box.left + box.width / 2, box.top); }}
                onBlur={() => { setHovered(null); hide(); }}
              />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

/** Lines with a crosshair that snaps to the nearest point and lists every series. */
export function LineChart({
  ariaLabel,
  series,
  height = 200,
  area = false,
  reference,
  xTicks,
  xLabel,
  tooltipTitle,
  tooltipExtra,
  yFormat,
  valueFormat,
  endLabel
}: {
  ariaLabel: string;
  series: LineSeries[];
  height?: number;
  area?: boolean;
  reference?: { value: number; label: string };
  xTicks: (plotWidth: number) => number[];
  xLabel: (index: number) => string;
  tooltipTitle: (index: number) => string;
  tooltipExtra?: (index: number) => TooltipRow[];
  yFormat: (value: number) => string;
  valueFormat: (value: number) => string;
  endLabel?: (value: number) => string;
}): ReactNode {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const { tooltip, show, hide } = useChartTooltip();
  const count = Math.max(0, ...series.map((item) => item.values.length));
  const [active, setActive] = useState<number | null>(null);
  const margin = { left: 52, right: endLabel ? 72 : 12, top: 12, bottom: 24 };
  const plotWidth = Math.max(10, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const values = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const { max, step } = niceScale(Math.max(0.001, ...values, reference?.value ?? 0));
  const x = (index: number) => margin.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;
  const ends = series.flatMap((item) => {
    let index = item.values.length - 1;
    while (index >= 0 && item.values[index] === null) index -= 1;
    return index < 0 ? [] : [{ item, index, value: item.values[index]! }];
  });
  const labelsCollide = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(y(a.value) - y(b.value)) < 14));
  const content = (index: number): TooltipContent => ({
    title: tooltipTitle(index),
    rows: [
      ...series.map((item) => ({ value: item.values[index] === null || item.values[index] === undefined ? "No data" : valueFormat(item.values[index]!), label: item.label, color: item.color })),
      ...(tooltipExtra?.(index) ?? [])
    ]
  });
  const showAt = (index: number, clientX?: number, clientY?: number) => {
    setActive(index);
    const box = svgRef.current?.getBoundingClientRect();
    show(content(index), clientX ?? (box?.left ?? 0) + x(index), clientY ?? (box?.top ?? 0) + margin.top);
  };
  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || count === 0) return;
    const index = Math.max(0, Math.min(count - 1, Math.round(((event.clientX - box.left - margin.left) / plotWidth) * (count - 1))));
    showAt(index, event.clientX, event.clientY);
  };
  const onKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    showAt(Math.max(0, Math.min(count - 1, (active ?? count - 1) + (event.key === "ArrowRight" ? 1 : -1))));
  };
  return (
    <div ref={ref} className="analytics-chart">
      <svg ref={svgRef} width={width} height={height} role="img" aria-label={ariaLabel}>
        <YAxis ticks={axisTicks(max, step)} x={margin.left} right={margin.left + plotWidth} y={y} format={yFormat} />
        {xTicks(plotWidth).map((index) => (
          <text key={index} x={Math.min(Math.max(x(index), margin.left + 16), margin.left + plotWidth - 12)} y={height - 7} textAnchor="middle" className="analytics-axis-text" aria-hidden="true">{xLabel(index)}</text>
        ))}
        {reference ? (
          <g aria-hidden="true">
            <line x1={margin.left} x2={margin.left + plotWidth} y1={Math.round(y(reference.value)) + 0.5} y2={Math.round(y(reference.value)) + 0.5} className="analytics-marker" />
            <text x={margin.left + 6} y={y(reference.value) - 6} className="analytics-marker-text">{reference.label}</text>
          </g>
        ) : null}
        {series.map((item) => {
          const segments: Array<Array<[number, number]>> = [];
          let current: Array<[number, number]> = [];
          item.values.forEach((value, index) => {
            if (value === null) {
              if (current.length) segments.push(current);
              current = [];
            } else current.push([x(index), y(value)]);
          });
          if (current.length) segments.push(current);
          return (
            <g key={item.key} aria-hidden="true">
              {segments.map((points, index) => points.length === 1 ? (
                <circle key={index} cx={points[0]![0]} cy={points[0]![1]} r={2.5} style={{ fill: item.color }} />
              ) : (
                <g key={index}>
                  {area ? <path d={`M${points[0]![0]},${y(0)}L${points.map((point) => point.join(",")).join("L")}L${points.at(-1)![0]},${y(0)}Z`} className="analytics-area" style={{ fill: item.color }} /> : null}
                  <path d={`M${points.map((point) => point.join(",")).join("L")}`} className="analytics-line" style={{ stroke: item.color }} />
                </g>
              ))}
            </g>
          );
        })}
        {ends.map(({ item, index, value }) => (
          <g key={item.key} aria-hidden="true">
            <circle cx={x(index)} cy={y(value)} r={4} className="analytics-dot" style={{ fill: item.color }} />
            {endLabel && !labelsCollide ? <text x={x(index) + 8} y={y(value) + 4} className="analytics-end-text">{endLabel(value)}</text> : null}
          </g>
        ))}
        {active !== null ? (
          <g aria-hidden="true">
            <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotHeight} className="analytics-crosshair" />
            {series.map((item) => {
              const value = item.values[active];
              return value === null || value === undefined ? null : <circle key={item.key} cx={x(active)} cy={y(value)} r={4} className="analytics-dot" style={{ fill: item.color }} />;
            })}
          </g>
        ) : null}
        <rect
          x={margin.left - 4}
          y={margin.top}
          width={plotWidth + 8}
          height={plotHeight}
          className="analytics-hit"
          tabIndex={0}
          aria-label={`${ariaLabel}. Use the arrow keys to read values.`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => { setActive(null); hide(); }}
          onFocus={() => showAt(active ?? count - 1)}
          onBlur={() => { setActive(null); hide(); }}
          onKeyDown={onKeyDown}
        />
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

export interface BarSegment {
  value: number;
  color: string;
}

export interface BarRow {
  key: string;
  /** Rendered as a folder and file name when it contains a slash. */
  label: string;
  isPath?: boolean;
  badge?: ReactNode;
  segments: BarSegment[];
  display: ReactNode;
  tooltip: TooltipContent;
  onSelect?: () => void;
  selectLabel?: string;
}

/** Horizontal bars in HTML so long labels can truncate the folder and keep the file name. */
export function BarList({ rows, max, ariaLabel }: { rows: BarRow[]; max?: number; ariaLabel: string }): ReactNode {
  const { tooltip, show, hide } = useChartTooltip();
  const top = max ?? Math.max(1, ...rows.map((row) => row.segments.reduce((total, segment) => total + segment.value, 0)));
  return (
    <div className="analytics-bar-list" role="list" aria-label={ariaLabel}>
      {rows.map((row) => {
        const visible = row.segments.filter((segment) => segment.value > 0);
        const { folder, name } = row.isPath ? splitPath(row.label) : { folder: "", name: row.label };
        const label = (
          <span className="analytics-bar-label" title={row.label}>
            {folder ? <span className="analytics-bar-folder">{folder}</span> : null}
            <span className="analytics-bar-name">{name}</span>
            {row.badge}
          </span>
        );
        const handlers = {
          onPointerMove: (event: PointerEvent) => show(row.tooltip, event.clientX, event.clientY),
          onPointerLeave: hide
        };
        const track = (
          <span className="analytics-bar-track" aria-hidden="true">
            {visible.map((segment, index) => (
              <span
                key={index}
                className="analytics-bar"
                style={{ width: `calc(${(segment.value / top) * 100}% - ${visible.length > 1 ? BAR_GAP : 0}px)`, background: segment.color }}
              />
            ))}
          </span>
        );
        const value = <span className="analytics-bar-value">{row.display}</span>;
        return (
          <div key={row.key} role="listitem">
            {row.onSelect ? (
              <button type="button" className="analytics-bar-row is-interactive" aria-label={row.selectLabel} onClick={row.onSelect} {...handlers}>
                {label}{track}{value}
              </button>
            ) : (
              <div className="analytics-bar-row" {...handlers}>{label}{track}{value}</div>
            )}
          </div>
        );
      })}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;

/** Weekday × hour heatmap on a single-hue sequential scale. */
export function PunchCard({ values, ariaLabel }: { values: number[]; ariaLabel: string }): ReactNode {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useChartTooltip();
  const [hovered, setHovered] = useState<number | null>(null);
  const labelWidth = 36;
  const gap = 2;
  const cell = Math.max(8, Math.min(24, Math.floor((width - labelWidth) / 24) - gap));
  const height = 7 * (cell + gap) + 20;
  const max = Math.max(1, ...values);
  return (
    <div ref={ref} className="analytics-chart">
      <svg width={labelWidth + 24 * (cell + gap)} height={height} role="img" aria-label={ariaLabel}>
        {WEEKDAYS.map((day, row) => <text key={day} x={0} y={row * (cell + gap) + cell / 2 + 4} className="analytics-axis-text" aria-hidden="true">{day}</text>)}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
          <text key={hour} x={labelWidth + hour * (cell + gap) + cell / 2} y={height - 5} textAnchor="middle" className="analytics-axis-text" aria-hidden="true">{hourLabel(hour).replace(" ", "").toLowerCase().replace("m", "")}</text>
        ))}
        {values.map((value, index) => {
          const row = Math.floor(index / 24);
          const hour = index % 24;
          const level = value === 0 ? 0 : Math.max(1, Math.ceil((value / max) * 7));
          const content = { title: `${WEEKDAYS[row]} · ${hourLabel(hour)}–${hourLabel(hour + 1)}`, rows: [{ value: value.toLocaleString(), label: value === 1 ? "commit" : "commits" }] };
          return (
            <rect
              key={index}
              x={labelWidth + hour * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              className={cn("analytics-heat-cell", hovered === index && "is-hovered")}
              style={{ fill: level === 0 ? "var(--analytics-empty)" : SEQUENTIAL_COLORS[level - 1] }}
              onPointerMove={(event) => { setHovered(index); show(content, event.clientX, event.clientY); }}
              onPointerLeave={() => { setHovered(null); hide(); }}
            />
          );
        })}
      </svg>
      <div className="analytics-scale" aria-hidden="true">
        <span>Fewer</span>
        <i style={{ background: "var(--analytics-empty)" }} />
        {SEQUENTIAL_COLORS.map((color) => <i key={color} style={{ background: color }} />)}
        <span>More</span>
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

export function Sparkline({ values, ariaHidden = true }: { values: number[]; ariaHidden?: boolean }): ReactNode {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = 28;
  if (values.length < 2) return null;
  const max = Math.max(1e-9, ...values);
  const points = values.map((value, index) => [3 + (index / (values.length - 1)) * (width - 6), height - 4 - (value / max) * (height - 8)] as const);
  const last = points.at(-1)!;
  return (
    <div ref={ref} className="analytics-sparkline" aria-hidden={ariaHidden}>
      <svg width={width} height={height}>
        <polyline points={points.map((point) => point.join(",")).join(" ")} className="analytics-sparkline-line" />
        <circle cx={last[0]} cy={last[1]} r={3} style={{ fill: SERIES_COLORS[0] }} />
      </svg>
    </div>
  );
}

export interface StatDelta {
  direction: -1 | 0 | 1;
  text: string;
  /** Whether an increase is good. Omit for neutral changes. */
  upIsGood?: boolean;
}

export function StatTile({ label, value, unit, delta, note, sparkline }: {
  label: string;
  value: string;
  unit?: string;
  delta?: StatDelta | null;
  note?: ReactNode;
  sparkline?: number[];
}): ReactNode {
  const tone = delta && delta.direction !== 0 && delta.upIsGood !== undefined
    ? (delta.direction > 0) === delta.upIsGood ? "is-good" : "is-bad"
    : undefined;
  return (
    <section className="analytics-tile" aria-label={label}>
      <div className="analytics-tile-label">{label}</div>
      <div className="analytics-tile-value">{value}{unit ? <small>{unit}</small> : null}</div>
      {delta ? (
        <div className={cn("analytics-tile-delta", tone)}>
          {delta.direction > 0 ? <ArrowUpRight aria-hidden="true" /> : delta.direction < 0 ? <ArrowDownRight aria-hidden="true" /> : null}
          <span>{delta.text}</span>
        </div>
      ) : null}
      {note ? <div className="analytics-tile-note">{note}</div> : null}
      {sparkline ? <Sparkline values={sparkline} /> : null}
    </section>
  );
}
