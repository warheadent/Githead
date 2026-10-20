import type { GitHubFailure } from "../shared/types";
import {
  reportOperationalFailure,
  type OperationalFailureCategory
} from "./operationalErrorReporter";

export type GitHubOperationKind = "connection" | "read" | "mutation";

export function reportGitHubFailure(
  operation: GitHubOperationKind,
  failure: GitHubFailure,
  cause?: { httpStatus?: number | undefined; error?: unknown }
): void {
  const category = toOperationalCategory(failure.kind);
  const errorName = cause?.error instanceof Error ? cause.error.name : undefined;
  reportOperationalFailure({
    subsystem: "github",
    operation,
    category,
    retryable: failure.retryable,
    outcomeUnknown: failure.outcomeUnknown,
    ...(cause?.httpStatus === undefined ? {} : { httpStatus: cause.httpStatus }),
    ...(errorName ? { errorName } : {})
  }, shouldCreateIssue(category) ? {
    issue: category === "unexpected" ? "error" : "warning"
  } : {});
}

function toOperationalCategory(kind: GitHubFailure["kind"]): OperationalFailureCategory {
  switch (kind) {
    case "rateLimited": return "rate-limit";
    case "notFound": return "not-found";
    case "offline": return "network";
    default: return kind;
  }
}

/** Going offline is the user's connection, not a defect, so it is only counted. */
function shouldCreateIssue(category: OperationalFailureCategory): boolean {
  return ["rate-limit", "timeout", "transient", "unexpected"].includes(category);
}
