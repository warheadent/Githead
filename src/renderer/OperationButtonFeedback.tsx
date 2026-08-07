import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { GitAction } from "../shared/types";

export type OperationButtonFeedbackAction = GitAction | "commit";
export type OperationButtonFeedbackSurface = "action-bar" | "commit-panel";

export interface OperationButtonSuccessEvent {
  action: OperationButtonFeedbackAction;
  expiresAt: number;
  operationId: string;
  repoPath: string;
  surface: OperationButtonFeedbackSurface;
}

export const OPERATION_BUTTON_SUCCESS_HOLD_MS = 1_600;

export function createOperationButtonSuccessEvent(
  action: OperationButtonFeedbackAction,
  operationId: string,
  repoPath: string,
  surface: OperationButtonFeedbackSurface
): OperationButtonSuccessEvent {
  return {
    action,
    expiresAt: Date.now() + OPERATION_BUTTON_SUCCESS_HOLD_MS,
    operationId,
    repoPath,
    surface
  };
}

export function OperationButtonFeedback({
  action,
  children,
  event,
  successLabel,
  surface
}: {
  action: OperationButtonFeedbackAction;
  children: ReactNode;
  event: OperationButtonSuccessEvent | null;
  successLabel: string;
  surface: OperationButtonFeedbackSurface;
}): ReactNode {
  const matchingEvent = event?.action === action && event.surface === surface
    ? event
    : null;
  const successId = matchingEvent?.operationId ?? null;
  const [expiredSuccessId, setExpiredSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (!matchingEvent || matchingEvent.expiresAt <= Date.now()) return;

    const timeout = window.setTimeout(() => {
      setExpiredSuccessId(matchingEvent.operationId);
    }, matchingEvent.expiresAt - Date.now());

    return () => {
      window.clearTimeout(timeout);
    };
  }, [matchingEvent]);

  const successful = matchingEvent !== null
    && matchingEvent.expiresAt > Date.now()
    && expiredSuccessId !== successId;

  return (
    <span className="operation-button-feedback" data-success={successful ? "true" : "false"}>
      <span
        className="operation-button-feedback-state operation-button-feedback-idle"
        aria-hidden={successful}
      >
        {children}
      </span>
      <span
        className="operation-button-feedback-state operation-button-feedback-success"
        aria-hidden={!successful}
        aria-label={successLabel}
        data-success-label={successLabel}
      >
        <Check />
      </span>
      {successful ? (
        <span className="sr-only" role="status" aria-live="polite">
          {successLabel}.
        </span>
      ) : null}
    </span>
  );
}
