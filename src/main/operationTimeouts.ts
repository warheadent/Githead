export const LOCAL_OPERATION_TIMEOUT_MS = 10 * 60_000;
export const NETWORK_OPERATION_TIMEOUT_MS = 30 * 60_000;
// User-defined actions (builds, editors) can legitimately run for hours; they stay cancelable.
export const CONFIGURED_ACTION_TIMEOUT_MS = 0;
