/** Formats an ISO timestamp relative to now, for example "2 hours ago". Returns the input when it cannot be parsed. */
export function formatRelativeDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value || "unknown";
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  if (absolute < 2_592_000) return formatter.format(Math.round(seconds / 86_400), "day");
  if (absolute < 31_536_000) return formatter.format(Math.round(seconds / 2_592_000), "month");
  return formatter.format(Math.round(seconds / 31_536_000), "year");
}

/** Formats an ISO timestamp as a medium date and short time. Returns the input when it cannot be parsed. */
export function formatDateTime(value: string, fallback = "unknown time"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
