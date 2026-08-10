import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { sentry, telemetry } = vi.hoisted(() => {
  const scope = {
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTags: vi.fn()
  };
  return {
    sentry: {
      captureException: vi.fn(),
      metrics: { count: vi.fn() },
      scope,
      withScope: vi.fn((callback: (value: typeof scope) => void) => callback(scope))
    },
    telemetry: { enabled: false }
  };
});
vi.mock("@sentry/electron/renderer", () => sentry);
vi.mock("./sentry", () => ({
  isRendererTelemetryEnabled: () => telemetry.enabled
}));

import { reportRendererFailure } from "./operationalErrorReporter";

beforeEach(() => {
  telemetry.enabled = false;
  vi.clearAllMocks();
});

describe("renderer error reporting privacy", () => {
  it("does not record or capture renderer failures while telemetry is disabled", () => {
    reportRendererFailure(new Error("private failure"), "react-uncaught", "error");

    expect(sentry.metrics.count).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports sanitized renderer failures while telemetry is enabled", () => {
    telemetry.enabled = true;

    reportRendererFailure(new Error("private failure"), "react-uncaught", "error");

    expect(sentry.metrics.count).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const captured = sentry.captureException.mock.calls[0]?.[0] as Error | undefined;
    expect(captured?.message).toBe("Unexpected operational failure.");
  });
});
