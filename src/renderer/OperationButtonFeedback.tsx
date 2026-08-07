import { Check, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { GitAction } from "../shared/types";

export type OperationButtonFeedbackAction = GitAction | "commit";
export type OperationButtonFeedbackSurface = "action-bar" | "commit-panel";

export type OperationButtonFeedbackOutcome = "error" | "success";

export interface OperationButtonFeedbackEvent {
  action: OperationButtonFeedbackAction;
  expiresAt: number;
  operationId: string;
  outcome: OperationButtonFeedbackOutcome;
  repoPath: string;
  surface: OperationButtonFeedbackSurface;
}

export const OPERATION_BUTTON_FEEDBACK_HOLD_MS = 1_600;

export function createOperationButtonFeedbackEvent(
  action: OperationButtonFeedbackAction,
  operationId: string,
  repoPath: string,
  surface: OperationButtonFeedbackSurface,
  outcome: OperationButtonFeedbackOutcome
): OperationButtonFeedbackEvent {
  return {
    action,
    expiresAt: Date.now() + OPERATION_BUTTON_FEEDBACK_HOLD_MS,
    operationId,
    outcome,
    repoPath,
    surface
  };
}

export function OperationButtonFeedback({
  action,
  children,
  event,
  errorLabel = "Failed",
  successLabel,
  surface
}: {
  action: OperationButtonFeedbackAction;
  children: ReactNode;
  event: OperationButtonFeedbackEvent | null;
  errorLabel?: string;
  successLabel: string;
  surface: OperationButtonFeedbackSurface;
}): ReactNode {
  const matchingEvent = event?.action === action && event.surface === surface
    ? event
    : null;
  const eventId = matchingEvent?.operationId ?? null;
  const [expiredEventId, setExpiredEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!matchingEvent || matchingEvent.expiresAt <= Date.now()) return;

    const timeout = window.setTimeout(() => {
      setExpiredEventId(matchingEvent.operationId);
    }, matchingEvent.expiresAt - Date.now());

    return () => {
      window.clearTimeout(timeout);
    };
  }, [matchingEvent]);

  const activeOutcome = matchingEvent !== null
    && matchingEvent.expiresAt > Date.now()
    && expiredEventId !== eventId
    ? matchingEvent.outcome
    : null;

  return (
    <span className="operation-button-feedback" data-feedback={activeOutcome ?? "idle"}>
      <span
        className="operation-button-feedback-state operation-button-feedback-idle"
        aria-hidden={activeOutcome !== null}
      >
        {children}
      </span>
      <span
        className="operation-button-feedback-state operation-button-feedback-success"
        aria-hidden={activeOutcome !== "success"}
        aria-label={successLabel}
        data-success-label={successLabel}
      >
        <Check />
      </span>
      <span
        className="operation-button-feedback-state operation-button-feedback-error"
        aria-hidden={activeOutcome !== "error"}
        aria-label={errorLabel}
        data-error-label={errorLabel}
      >
        <X />
      </span>
      {activeOutcome ? (
        <span className="sr-only" role="status" aria-live="polite">
          {activeOutcome === "success" ? successLabel : errorLabel}.
        </span>
      ) : null}
    </span>
  );
}
