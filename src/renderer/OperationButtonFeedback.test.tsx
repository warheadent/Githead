// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  OPERATION_BUTTON_FEEDBACK_HOLD_MS,
  OperationButtonFeedback,
  type OperationButtonFeedbackEvent
} from "./OperationButtonFeedback";

function createFeedbackEvent(overrides: Partial<OperationButtonFeedbackEvent> = {}): OperationButtonFeedbackEvent {
  return {
    action: "fetch",
    expiresAt: Date.now() + OPERATION_BUTTON_FEEDBACK_HOLD_MS,
    operationId: "operation-1",
    outcome: "success",
    repoPath: "/repo",
    surface: "action-bar",
    ...overrides
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OperationButtonFeedback", () => {
  it("shows a matching success event and returns to idle after the hold", () => {
    vi.useFakeTimers();
    const successEvent = createFeedbackEvent();
    const view = render(
      <OperationButtonFeedback action="fetch" event={null} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    view.rerender(
      <OperationButtonFeedback action="fetch" event={successEvent} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    const feedback = view.container.querySelector(".operation-button-feedback");
    expect(feedback?.getAttribute("data-feedback")).toBe("success");
    expect(feedback?.querySelector(".operation-button-feedback-idle")?.getAttribute("aria-hidden")).toBeNull();
    expect(feedback?.querySelector(".operation-button-feedback-success")?.getAttribute("aria-hidden")).toBe("true");
    expect(view.getByRole("status").textContent).toBe("Fetched.");

    act(() => {
      vi.advanceTimersByTime(OPERATION_BUTTON_FEEDBACK_HOLD_MS);
    });

    expect(feedback?.getAttribute("data-feedback")).toBe("idle");
    expect(view.queryByRole("status")).toBeNull();
  });

  it("ignores success from another button surface", () => {
    const view = render(
      <OperationButtonFeedback action="fetch" event={createFeedbackEvent({ surface: "commit-panel" })} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    expect(view.container.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("idle");
  });

  it("does not replay an expired event when the button remounts", () => {
    const view = render(
      <OperationButtonFeedback action="fetch" event={createFeedbackEvent({ expiresAt: Date.now() - 1 })} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    expect(view.container.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("idle");
  });

  it("shows error feedback for a matching failed operation", () => {
    const view = render(
      <OperationButtonFeedback action="fetch" event={createFeedbackEvent({ outcome: "error" })} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    expect(view.container.querySelector(".operation-button-feedback")?.getAttribute("data-feedback")).toBe("error");
    expect(view.getByRole("status").textContent).toBe("Failed.");
  });
});
