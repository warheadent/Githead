import type { AiCommitMessageProvider } from "../shared/types";
import {
  classifyAiProviderFailure,
  type AiProviderFailureKind
} from "./commitMessageProviders";
import {
  recordOperationalRecovery,
  reportOperationalFailure,
  reportUnexpectedError,
  type OperationalFailureCategory
} from "./operationalErrorReporter";

export type AiGenerationOperation =
  | "commit-message"
  | "commit-plan"
  | "pull-request-title"
  | "pull-request-description";

export function reportAiGenerationFailure(
  operation: AiGenerationOperation,
  provider: AiCommitMessageProvider | undefined,
  error: unknown
): void {
  const kind = classifyAiProviderFailure(error);
  if (kind === "unexpected") {
    reportUnexpectedError(error, {
      subsystem: "ai",
      operation,
      ...(provider ? { provider } : {})
    });
    return;
  }

  reportOperationalFailure({
    subsystem: "ai",
    operation,
    category: toOperationalCategory(kind),
    ...(provider ? { provider } : {})
  }, shouldCreateIssue(kind) ? { issue: "warning" } : {});
}

export function recordAiGenerationRecovery(
  operation: AiGenerationOperation,
  provider: AiCommitMessageProvider
): void {
  recordOperationalRecovery({
    subsystem: "ai",
    operation,
    category: "output-limit",
    provider
  });
}

export function recordAiPreflightFailure(
  operation: AiGenerationOperation,
  provider: AiCommitMessageProvider,
  category: "authentication" | "configuration"
): void {
  reportOperationalFailure({
    subsystem: "ai",
    operation,
    category,
    provider
  });
}

export function reportAiEmptyResponse(
  operation: AiGenerationOperation,
  provider: AiCommitMessageProvider
): void {
  reportOperationalFailure({
    subsystem: "ai",
    operation,
    category: "provider",
    provider
  }, { issue: "warning" });
}

function toOperationalCategory(kind: AiProviderFailureKind): OperationalFailureCategory {
  return kind === "cli" ? "provider" : kind;
}

function shouldCreateIssue(kind: AiProviderFailureKind): boolean {
  return kind !== "authentication" && kind !== "configuration";
}
