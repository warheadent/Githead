import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const sentry = (() => {
  const scope = {
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTags: vi.fn()
  };
  return {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    metrics: { count: vi.fn() },
    scope,
    withScope: vi.fn((callback: (value: typeof scope) => void) => callback(scope))
  };
})();

import {
  configureOperationalErrorReporter,
  recordOperationalRecovery,
  reportOperationalFailure,
  reportUnexpectedError
} from "./operationalErrorReporter";

beforeEach(() => {
  vi.clearAllMocks();
  configureOperationalErrorReporter({
    addBreadcrumb: sentry.addBreadcrumb,
    countMetric: (name, attributes) => sentry.metrics.count(name, 1, { attributes }),
    captureException: (error, context) => {
      sentry.withScope((scope) => {
        scope.setLevel(context.level);
        scope.setFingerprint(context.fingerprint);
        scope.setTags(context.tags);
        sentry.captureException(error);
      });
    },
    captureMessage: (message, context) => {
      sentry.withScope((scope) => {
        scope.setLevel(context.level);
        scope.setFingerprint(context.fingerprint);
        scope.setTags(context.tags);
        sentry.captureMessage(message);
      });
    }
  });
});

describe("operational error reporting", () => {
  it("reports only safe operational attributes", () => {
    reportOperationalFailure({
      subsystem: "ai",
      operation: "commit-message",
      category: "quota",
      provider: "codex-cli",
      exitCode: 1,
      retryable: false
    }, { issue: "warning" });

    expect(sentry.metrics.count).toHaveBeenCalledWith("githead.operation.failure", 1, {
      attributes: {
        subsystem: "ai",
        operation: "commit-message",
        category: "quota",
        provider: "codex-cli",
        exit_code: 1,
        retryable: false
      }
    });
    expect(sentry.captureMessage).toHaveBeenCalledWith("Githead operational failure");
    expect(sentry.scope.setTags).toHaveBeenCalledWith(expect.objectContaining({
      subsystem: "ai",
      operation: "commit-message",
      category: "quota",
      provider: "codex-cli"
    }));
  });

  it("does not create issues for expected failures", () => {
    reportOperationalFailure({
      subsystem: "process",
      operation: "command",
      category: "conflict",
      commandKind: "git",
      exitCode: 1
    });

    expect(sentry.metrics.count).toHaveBeenCalledOnce();
    expect(sentry.addBreadcrumb).toHaveBeenCalledOnce();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("removes raw exception messages before capture", () => {
    const error = new Error("secret token in /private/repository");

    reportUnexpectedError(error, {
      subsystem: "update",
      operation: "config-repair"
    });

    const reportable = sentry.captureException.mock.calls[0]?.[0] as Error;
    expect(reportable).toBeInstanceOf(Error);
    expect(reportable.message).toBe("Unexpected operational failure.");
    expect(reportable.stack).not.toContain("secret token");
    expect(reportable.stack).not.toContain("/private/repository");
  });

  it("counts a successful recovery without creating an issue", () => {
    recordOperationalRecovery({
      subsystem: "ai",
      operation: "commit-plan",
      category: "output-limit",
      provider: "openai"
    });

    expect(sentry.metrics.count).toHaveBeenCalledWith("githead.operation.recovery", 1, {
      attributes: expect.objectContaining({
        operation: "commit-plan",
        category: "output-limit"
      })
    });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
