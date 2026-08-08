export const DEFAULT_AUTO_FETCH_INTERVAL_MINUTES = 10;
export const MIN_AUTO_FETCH_INTERVAL_MINUTES = 0;
export const MAX_AUTO_FETCH_INTERVAL_MINUTES = 1440;

export function parseStoredAutoFetchInterval(value: unknown): number {
  return isValidAutoFetchInterval(value) ? value : DEFAULT_AUTO_FETCH_INTERVAL_MINUTES;
}

export function normalizeAutoFetchIntervalForSave(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error("Auto-fetch interval must be a whole number of minutes.");
  }
  if (value < MIN_AUTO_FETCH_INTERVAL_MINUTES) {
    throw new Error("Auto-fetch interval cannot be negative.");
  }
  if (value > MAX_AUTO_FETCH_INTERVAL_MINUTES) {
    throw new Error(`Auto-fetch interval cannot exceed ${MAX_AUTO_FETCH_INTERVAL_MINUTES} minutes.`);
  }
  return value;
}

export function isValidAutoFetchInterval(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MIN_AUTO_FETCH_INTERVAL_MINUTES
    && value <= MAX_AUTO_FETCH_INTERVAL_MINUTES;
}
