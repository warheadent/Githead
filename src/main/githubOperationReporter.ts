import type { GitHubFailure } from "../shared/types";
import {
  reportOperationalFailure,
  type OperationalFailureCategory
} from "./operationalErrorReporter";

export type GitHubOperationKind = "connection" | "read" | "mutation";

export function reportGitHubFailure(
  operation: GitHubOperationKind,
  failure: GitHubFailure
): void {
  const category = toOperationalCategory(failure.kind);
  reportOperationalFailure({
    subsystem: "github",
    operation,
    category,
    retryable: failure.retryable,
    outcomeUnknown: failure.outcomeUnknown
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

function shouldCreateIssue(category: OperationalFailureCategory): boolean {
  return ["network", "rate-limit", "timeout", "transient", "unexpected"].includes(category);
}
