import type { AnalyticsBinUnit } from "../shared/types";

/** Calendar helpers for analytics bins. All values are Unix seconds in the machine's local time zone. */

export function startOfLocalDay(time: number): number {
  const date = new Date(time * 1000);
  date.setHours(0, 0, 0, 0);
  return date.getTime() / 1000;
}

export function addLocalDays(time: number, days: number): number {
  const date = new Date(time * 1000);
  date.setDate(date.getDate() + days);
  return date.getTime() / 1000;
}

/** Weeks start on Monday. */
export function startOfLocalWeek(time: number): number {
  const date = new Date(startOfLocalDay(time) * 1000);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime() / 1000;
}

export function startOfLocalMonth(time: number): number {
  const date = new Date(time * 1000);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000;
}

export function nextBin(start: number, unit: AnalyticsBinUnit): number {
  if (unit === "day") return addLocalDays(start, 1);
  if (unit === "week") return addLocalDays(start, 7);
  const date = new Date(start * 1000);
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() / 1000;
}

/** Bin starts from `from` through the bin that contains `to`. */
export function binStarts(from: number, to: number, unit: AnalyticsBinUnit): number[] {
  const bins: number[] = [];
  for (let start = from; start <= to; start = nextBin(start, unit)) bins.push(start);
  return bins;
}

/** Index of the bin that contains `time`, or -1 when it is before the first bin. */
export function binIndex(bins: readonly number[], time: number): number {
  let low = 0;
  let high = bins.length - 1;
  if (high < 0 || time < bins[0]!) return -1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (bins[middle]! <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
