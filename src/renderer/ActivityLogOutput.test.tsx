// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ActivityLogOutput } from "./ActivityLogOutput";
import { appendActivityLogEvent, createActivityLogState } from "./activityLog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function history() {
  let log = createActivityLogState();
  for (const id of ["first", "second"]) log = appendActivityLogEvent(log, {
    runId: id, action: id, repoPath: "/repo", stream: "stdout", text: `${id} output\n`,
    timestamp: "2026-09-04T12:00:02Z", startedAt: "2026-09-04T12:00:00Z", exitCode: id === "first" ? 1 : 0
  });
  return log;
}

describe("ActivityLogOutput", () => {
  it("shows outcomes and durations and copies only the requested run", () => {
    const copy = vi.fn();
    render(<ActivityLogOutput log={history()} wrapLines={false} onCopyRun={copy} />);
    expect(screen.getByText("Failed, code 1 · 2.0s")).toBeTruthy();
    expect(screen.getByText("Succeeded · 2.0s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy first run" }));
    expect(copy).toHaveBeenCalledWith("first");
  });

  it("collapses and expands a completed run without hiding another run", () => {
    render(<ActivityLogOutput log={history()} wrapLines={false} onCopyRun={() => {}} />);
    const toggle = screen.getByRole("button", { name: "first" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("first output")).toBeNull();
    expect(screen.getByText("second output")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText("first output")).toBeTruthy();
  });

  it("mounts a bounded window of long output and reaches both ends when scrolling", () => {
    let log = createActivityLogState();
    for (let index = 0; index < 500; index++) log = appendActivityLogEvent(log, {
      runId: "long", action: "Build", stream: index % 2 ? "stderr" : "stdout", text: `line ${index}\n`, timestamp: "2026-09-04T12:00:00Z"
    });
    const view = render(<ActivityLogOutput log={log} wrapLines={false} onCopyRun={() => {}} />);
    const output = screen.getByRole("log");
    // jsdom has no layout. Supply the viewport and scroll extent for the scroll handler.
    Object.defineProperties(output, { clientHeight: { value: 400 }, scrollHeight: { value: 12_044 } });
    fireEvent.scroll(output, { target: { scrollTop: 0 } });
    expect(screen.getByText("line 0")).toBeTruthy();
    expect(view.container.querySelectorAll(".activity-log-block").length).toBeLessThan(60);
    fireEvent.scroll(output, { target: { scrollTop: 11_644 } });
    expect(screen.getByText("line 499")).toBeTruthy();
    expect(screen.queryByText("line 0")).toBeNull();
    expect(view.container.querySelectorAll(".activity-log-block").length).toBeLessThan(60);
  });
});
