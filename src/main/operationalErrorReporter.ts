import { createReportableError } from "../shared/reportableError";
import type { AiCommitMessageProvider, PerformanceCommandKind } from "../shared/types";

type OperationalSeverity = "info" | "warning" | "error";
type OperationalAttribute = string | number | boolean;
type OperationalAttributes = Record<string, OperationalAttribute>;

export interface OperationalErrorSink {
  addBreadcrumb(input: {
    category: string;
    level: OperationalSeverity;
    message: string;
    data: OperationalAttributes;
  }): void;
  captureException(error: Error, context: {
    level: "error";
    fingerprint: string[];
    tags: Record<string, string>;
  }): void;
  captureMessage(message: string, context: {
    level: "warning" | "error";
    fingerprint: string[];
    tags: Record<string, string>;
  }): void;
  countMetric(name: string, attributes: OperationalAttributes): void;
}

export type OperationalSubsystem =
  | "ai"
  | "github"
  | "process"
  | "repository"
  | "renderer"
  | "update";

export type OperationalOperation =
  | "command"
  | "commit-message"
  | "commit-plan"
  | "pull-request-title"
  | "pull-request-description"
  | "connection"
  | "read"
  | "mutation"
  | "check"
  | "download"
  | "install"
  | "release-notes"
  | "config-repair"
  | "repository-operation"
  | "react-render";

export type OperationalFailureCategory =
  | "authentication"
  | "authorization"
  | "cancelled"
  | "conflict"
  | "configuration"
  | "network"
  | "not-found"
  | "output-limit"
  | "process-exit"
  | "provider"
  | "quota"
  | "rate-limit"
  | "spawn-failed"
  | "timeout"
  | "transient"
  | "unexpected"
  | "validation";

export interface OperationalErrorContext {
  subsystem: OperationalSubsystem;
  operation: OperationalOperation;
  category: OperationalFailureCategory;
  provider?: AiCommitMessageProvider;
  commandKind?: PerformanceCommandKind;
  exitCode?: number;
  retryable?: boolean;
  outcomeUnknown?: boolean;
}

export interface OperationalIssueOptions {
  issue?: "warning" | "error";
}

const OPERATIONAL_ISSUE_THROTTLE_MS = 10 * 60 * 1_000;
const nextIssueAt = new Map<string, number>();
const capturedUnexpectedErrors = new WeakSet<object>();
let sink: OperationalErrorSink | null = null;

export function configureOperationalErrorReporter(nextSink: OperationalErrorSink | null): void {
  sink = nextSink;
}

/**
 * Sends fixed-cardinality labels and numbers only. Callers cannot attach paths,
 * command output, prompts, diffs, or other repository content.
 */
export function reportOperationalFailure(
  context: OperationalErrorContext,
  options: OperationalIssueOptions = {}
): void {
  if (!sink) return;
  const attributes = safeAttributes(context);
  safely(() => {
    sink?.countMetric("githead.operation.failure", attributes);
    sink?.addBreadcrumb({
      category: "githead.operation",
      level: options.issue ?? "info",
      message: "Operation failed",
      data: attributes
    });
  });

  if (options.issue) {
    captureOperationalIssue(attributes, options.issue);
  }
}

export function reportUnexpectedError(
  error: unknown,
  context: Omit<OperationalErrorContext, "category">
): void {
  if (!sink) return;
  const failureContext: OperationalErrorContext = { ...context, category: "unexpected" };
  const attributes = safeAttributes(failureContext);
  safely(() => {
    sink?.countMetric("githead.operation.failure", attributes);
    if (typeof error === "object" && error !== null) {
      if (capturedUnexpectedErrors.has(error)) return;
      capturedUnexpectedErrors.add(error);
    }
    sink?.captureException(createReportableError(error), {
      level: "error",
      fingerprint: [
        "githead-operational-error",
        attributes.subsystem,
        attributes.operation,
        attributes.category,
        attributes.command_kind ?? "none"
      ],
      tags: stringTags(attributes)
    });
  });
}

export function recordOperationalRecovery(
  context: Omit<OperationalErrorContext, "category"> & { category: "output-limit" }
): void {
  if (!sink) return;
  const attributes = safeAttributes(context);
  safely(() => {
    sink?.countMetric("githead.operation.recovery", attributes);
    sink?.addBreadcrumb({
      category: "githead.operation",
      level: "info",
      message: "Operation recovered",
      data: attributes
    });
  });
}

export function recordOperationOutcome(
  context: Omit<OperationalErrorContext, "category"> & { outcome: "success" | "failure" | "cancelled" }
): void {
  if (!sink) return;
  const attributes = {
    ...safeAttributes({ ...context, category: context.outcome === "cancelled" ? "cancelled" : "process-exit" }),
    outcome: context.outcome
  };
  safely(() => {
    sink?.countMetric("githead.process.outcome", attributes);
    sink?.addBreadcrumb({
      category: "githead.process",
      level: context.outcome === "failure" ? "warning" : "info",
      message: "Process completed",
      data: attributes
    });
  });
}

function captureOperationalIssue(
  attributes: ReturnType<typeof safeAttributes>,
  level: "warning" | "error"
): void {
  const issueKey = [
    attributes.subsystem,
    attributes.operation,
    attributes.category,
    attributes.provider ?? "",
    attributes.command_kind ?? ""
  ].join(":");
  const now = Date.now();
  if ((nextIssueAt.get(issueKey) ?? 0) > now) {
    return;
  }
  nextIssueAt.set(issueKey, now + OPERATIONAL_ISSUE_THROTTLE_MS);

  safely(() => {
    sink?.captureMessage("Githead operational failure", {
      level,
      fingerprint: [
        "githead-operational-failure",
        attributes.subsystem,
        attributes.operation,
        attributes.category,
        attributes.provider ?? "none",
        attributes.command_kind ?? "none"
      ],
      tags: stringTags(attributes)
    });
  });
}

function safeAttributes(context: OperationalErrorContext) {
  return {
    subsystem: safeLabel(context.subsystem),
    operation: safeLabel(context.operation),
    category: safeLabel(context.category),
    ...(context.provider ? { provider: safeLabel(context.provider) } : {}),
    ...(context.commandKind ? { command_kind: safeLabel(context.commandKind) } : {}),
    ...(Number.isFinite(context.exitCode) ? { exit_code: Math.trunc(context.exitCode!) } : {}),
    ...(context.retryable === undefined ? {} : { retryable: context.retryable }),
    ...(context.outcomeUnknown === undefined ? {} : { outcome_unknown: context.outcomeUnknown })
  };
}

function safeLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 64) || "unknown";
}

function stringTags(attributes: ReturnType<typeof safeAttributes>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key, String(value)])
  );
}

function safely(operation: () => void): void {
  try {
    operation();
  } catch {
    // Error reporting must never change application behavior.
  }
}
