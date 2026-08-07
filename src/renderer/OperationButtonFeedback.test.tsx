// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  OPERATION_BUTTON_SUCCESS_HOLD_MS,
  OperationButtonFeedback,
  type OperationButtonSuccessEvent
} from "./OperationButtonFeedback";

function createSuccessEvent(overrides: Partial<OperationButtonSuccessEvent> = {}): OperationButtonSuccessEvent {
  return {
    action: "fetch",
    expiresAt: Date.now() + OPERATION_BUTTON_SUCCESS_HOLD_MS,
    operationId: "operation-1",
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
    const successEvent = createSuccessEvent();
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
    expect(feedback?.getAttribute("data-success")).toBe("true");
    expect(view.getByRole("status").textContent).toBe("Fetched.");

    act(() => {
      vi.advanceTimersByTime(OPERATION_BUTTON_SUCCESS_HOLD_MS);
    });

    expect(feedback?.getAttribute("data-success")).toBe("false");
    expect(view.queryByRole("status")).toBeNull();
  });

  it("ignores success from another button surface", () => {
    const view = render(
      <OperationButtonFeedback action="fetch" event={createSuccessEvent({ surface: "commit-panel" })} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    expect(view.container.querySelector(".operation-button-feedback")?.getAttribute("data-success")).toBe("false");
  });

  it("does not replay an expired event when the button remounts", () => {
    const view = render(
      <OperationButtonFeedback action="fetch" event={createSuccessEvent({ expiresAt: Date.now() - 1 })} successLabel="Fetched" surface="action-bar">
        Fetch
      </OperationButtonFeedback>
    );

    expect(view.container.querySelector(".operation-button-feedback")?.getAttribute("data-success")).toBe("false");
  });
});
