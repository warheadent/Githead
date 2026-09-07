// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { WorkflowDuration } from "./WorkflowDuration";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

const startedAt = "2026-09-07T12:00:00Z";

describe("WorkflowDuration", () => {
  it("shares a clock and catches up after a hidden window becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:10Z"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { unmount } = render(<><span><WorkflowDuration startedAt={startedAt} completedAt="" running active /></span><span><WorkflowDuration startedAt={startedAt} completedAt="" running active /></span></>);
    expect(screen.getAllByText("10s")).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);

    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getAllByText("10s")).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);

    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getAllByText("40s")).toHaveLength(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps completed durations fixed and leaves jobs without a start time empty", () => {
    vi.useFakeTimers();
    render(<><span><WorkflowDuration startedAt={startedAt} completedAt="2026-09-07T12:00:05Z" running={false} active /></span><span><WorkflowDuration startedAt="" completedAt="" running={false} active /></span></>);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("5s")).toBeTruthy();
    expect(screen.getByText("-")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
