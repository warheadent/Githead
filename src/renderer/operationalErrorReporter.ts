import {
  captureException,
  metrics,
  withScope,
  type SeverityLevel
} from "@sentry/electron/renderer";
import { createReportableError } from "../shared/reportableError";

export type RendererFailureKind = "react-caught" | "react-recoverable" | "react-uncaught";

export function reportRendererFailure(
  error: unknown,
  kind: RendererFailureKind,
  level: SeverityLevel
): void {
  try {
    const attributes = { subsystem: "renderer", operation: "react-render", category: kind };
    metrics.count("githead.operation.failure", 1, { attributes });
    withScope((scope) => {
      scope.setLevel(level);
      scope.setFingerprint(["githead-renderer-error", kind]);
      scope.setTags(attributes);
      captureException(createReportableError(error));
    });
  } catch {
    // Error reporting must never change renderer behavior.
  }
}
