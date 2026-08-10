import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const sentry = vi.hoisted(() => {
  const currentScope = { clearBreadcrumbs: vi.fn() };
  const scope = {
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTags: vi.fn()
  };
  return {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    currentScope,
    getCurrentScope: vi.fn(() => currentScope),
    init: vi.fn(),
    metrics: { count: vi.fn() },
    withScope: vi.fn((callback: (value: typeof scope) => void) => callback(scope))
  };
});

vi.mock("@sentry/electron/main", () => sentry);
vi.mock("electron", () => ({
  app: {
    getVersion: () => "1.0.0",
    isPackaged: true
  }
}));

import { reportOperationalFailure } from "./operationalErrorReporter";
import { initializeSentry, setSentryTelemetryEnabled } from "./sentry";

afterEach(() => {
  setSentryTelemetryEnabled(false);
  delete process.env.SENTRY_DSN;
  vi.clearAllMocks();
});

describe("Sentry privacy preference", () => {
  it("starts reporting when enabled and stops the active client when disabled", () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";

    initializeSentry();
    expect(sentry.init).toHaveBeenCalledOnce();

    setSentryTelemetryEnabled(true);

    const options = sentry.init.mock.calls[0]?.[0] as {
      beforeSend: (event: { message: string }) => { message: string } | null;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
    };
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeSend({ message: "allowed" })).toEqual({ message: "allowed" });

    reportOperationalFailure({
      subsystem: "repository",
      operation: "read",
      category: "unexpected"
    });
    expect(sentry.metrics.count).toHaveBeenCalledOnce();

    setSentryTelemetryEnabled(false);

    expect(sentry.currentScope.clearBreadcrumbs).toHaveBeenCalledOnce();
    expect(options.beforeSend({ message: "blocked" })).toBeNull();
    reportOperationalFailure({
      subsystem: "repository",
      operation: "read",
      category: "unexpected"
    });
    expect(sentry.metrics.count).toHaveBeenCalledOnce();

    setSentryTelemetryEnabled(true);
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(options.beforeSend({ message: "allowed again" })).toEqual({ message: "allowed again" });
  });
});
