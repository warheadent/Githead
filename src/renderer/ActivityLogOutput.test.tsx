// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ActivityLogOutput } from "./ActivityLogOutput";
import { appendActivityLogEvent, appendActivityOperationResult, createActivityLogState } from "./activityLog";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
    // jsdom has no layout. Supply the viewport and the scroll extent: a 40px run header and 500 lines of 20px.
    Object.defineProperties(output, { clientHeight: { value: 400 }, offsetHeight: { value: 400 }, scrollHeight: { value: 10_040 } });
    fireEvent.scroll(output, { target: { scrollTop: 0 } });
    expect(screen.getByText("line 0")).toBeTruthy();
    expect(view.container.querySelectorAll(".activity-log-block").length).toBeLessThan(60);
    fireEvent.scroll(output, { target: { scrollTop: 9_640 } });
    expect(screen.getByText("line 499")).toBeTruthy();
    expect(screen.queryByText("line 0")).toBeNull();
    expect(view.container.querySelectorAll(".activity-log-block").length).toBeLessThan(60);
  });

  it("shows only the selected run's output and the notices, without run headers", () => {
    let log = history();
    log = appendActivityOperationResult(log, "Pull", { repoPath: "/repo", exitCode: 1, stdout: "", stderr: "fatal: diverged" }, "pull");
    render(<ActivityLogOutput log={log} wrapLines={false} runId="first" onCopyRun={() => {}} />);

    expect(screen.getByText("first output")).toBeTruthy();
    expect(screen.queryByText("second output")).toBeNull();
    expect(screen.queryByText(/fatal: diverged/)).toBeNull();
    expect(screen.queryByRole("button", { name: "first" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy first run" })).toBeNull();
    expect(screen.getByRole("log", { name: "Command output" })).toBeTruthy();
  });

  it("keeps the trimmed-output notice above a filtered run", () => {
    let log = createActivityLogState();
    for (let index = 0; index < 101; index++) log = appendActivityLogEvent(log, {
      runId: `run-${index}`, action: "fetch", repoPath: "/repo", stream: "stdout", text: `output ${index}
`, timestamp: "2026-09-04T12:00:00Z"
    });
    expect(log.trimmed).toBe(true);
    const view = render(<ActivityLogOutput log={log} wrapLines={false} runId="run-100" onCopyRun={() => {}} />);

    expect(view.container.querySelector(".activity-log-notice")?.textContent).toContain("older output trimmed");
    expect(screen.getByText("output 100")).toBeTruthy();
    expect(screen.queryByText("output 99")).toBeNull();
  });

  it("keeps a stable layout when measured rows add a scrollbar that estimated rows remove", () => {
    let observe: ResizeObserverCallback = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { observe = callback; }
      observe() {}
      disconnect() {}
    });
    let log = createActivityLogState();
    for (let index = 0; index < 15; index++) log = appendActivityLogEvent(log, {
      runId: "wrap", action: "Build", stream: index % 2 ? "stderr" : "stdout", text: `line ${index}\n`, timestamp: "2026-09-04T12:00:00Z"
    });
    // Mount the log row into a box whose vertical scrollbar takes 15px of client width once the content overflows 400px.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      const space = this.querySelector<HTMLElement>(".activity-log-virtual-space");
      return space && parseFloat(space.style.height) > 400 ? 585 : 600;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    const view = render(<ActivityLogOutput log={log} wrapLines onCopyRun={() => {}} />);
    const blocks = [...view.container.querySelectorAll<HTMLElement>("[data-log-row^='block-']")];
    for (const block of blocks) vi.spyOn(block, "getBoundingClientRect").mockReturnValue({ height: 60 } as DOMRect);

    // The rendered rows wrap to three lines each: 15 × 60px overflows, where the 20px estimates did not.
    act(() => observe(blocks.map((target) => ({ target }) as unknown as ResizeObserverEntry), {} as ResizeObserver));

    const space = view.container.querySelector<HTMLElement>(".activity-log-virtual-space");
    expect(space?.style.height).toBe("940px");
  });

  it("shows the empty state for a run that has no output", () => {
    const log = appendActivityLogEvent(createActivityLogState(), {
      runId: "silent", action: "fetch", repoPath: "/repo", stream: "system", text: "", timestamp: "2026-09-04T12:00:02Z",
      startedAt: "2026-09-04T12:00:00Z", exitCode: 0
    });
    render(<ActivityLogOutput log={log} wrapLines={false} runId="silent" onCopyRun={() => {}} />);

    expect(screen.getByText("No command output yet.")).toBeTruthy();
  });
});
