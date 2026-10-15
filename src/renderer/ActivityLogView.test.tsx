// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ACTIVITY_LOG_MAX_RUNS, appendActivityLogEvent, createActivityLogState, type ActivityLogState } from "./activityLog";
import { ActivityLogView } from "./ActivityLogView";
import { WorkspacePanelStateProvider, WorkspacePanelStateStore } from "./workspacePanelState";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityLogView", () => {
  it("shows all output first and keeps it selected when a run starts", () => {
    const view = renderView(withRuns(createActivityLogState(), "fetch", "pull"));
    expect(heading()).toBe("Output available");
    expect(runButton(/^All output/).getAttribute("aria-pressed")).toBe("true");

    view.update(withRuns(view.log, "push"));
    expect(heading()).toBe("Output available");
    expect(runButton(/^All output/).getAttribute("aria-pressed")).toBe("true");
  });

  it("follows each newer run while the newest run is selected", () => {
    const view = renderView(withRuns(createActivityLogState(), "fetch", "pull"));
    fireEvent.click(runButton(/^Pull/));
    expect(heading()).toBe("Pull");

    view.update(withRuns(view.log, "push"));
    expect(heading()).toBe("Push");
    expect(runButton(/^Push/).getAttribute("aria-pressed")).toBe("true");
    expect(runButton(/^Pull/).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps an older run selected when a newer run starts", () => {
    const view = renderView(withRuns(createActivityLogState(), "fetch", "pull"));
    fireEvent.click(runButton(/^Fetch/));
    expect(heading()).toBe("Fetch");

    view.update(withRuns(view.log, "push"));
    expect(heading()).toBe("Fetch");
    expect(runButton(/^Fetch/).getAttribute("aria-pressed")).toBe("true");
    expect(runButton(/^Push/).getAttribute("aria-pressed")).toBe("false");
  });

  it("falls back to all output when the log is cleared", () => {
    const view = renderView(withRuns(createActivityLogState(), "fetch", "pull"));
    fireEvent.click(runButton(/^Fetch/));

    view.update(createActivityLogState());
    expect(heading()).toBe("Empty");
    expect(runButton(/^All output/).getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to all output when the selected run is trimmed", () => {
    const view = renderView(withRuns(createActivityLogState(), "fetch", "pull"));
    fireEvent.click(runButton(/^Fetch/));

    let log = view.log;
    for (let index = 0; index < ACTIVITY_LOG_MAX_RUNS; index++) log = withRuns(log, `run-${index}`);
    expect(log.runs.some((run) => run.id === "fetch-run")).toBe(false);
    view.update(log);
    expect(heading()).toBe("Output available");
    expect(runButton(/^All output/).getAttribute("aria-pressed")).toBe("true");
  });

  it("restores the selected run after the panel remounts", () => {
    const store = new WorkspacePanelStateStore();
    const log = withRuns(createActivityLogState(), "fetch", "pull");
    const first = renderView(log, { store });
    fireEvent.click(runButton(/^Fetch/));
    first.unmount();

    renderView(log, { store });
    expect(heading()).toBe("Fetch");
    expect(runButton(/^Fetch/).getAttribute("aria-pressed")).toBe("true");
  });

  it("copies one run from the run list and the whole log from Copy raw", async () => {
    const onCopyRawLog = vi.fn();
    renderView(withRuns(createActivityLogState(), "fetch", "pull"), { onCopyRawLog });

    fireEvent.click(within(runList()).getByRole("button", { name: "Copy fetch run" }));
    expect(onCopyRawLog).toHaveBeenLastCalledWith("fetch-run");
    expect(await screen.findByText("Copied to clipboard.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy raw" }));
    expect(onCopyRawLog).toHaveBeenLastCalledWith(undefined);
  });
});

/** Appends one finished run per action. Each run id is the action followed by "-run". */
function withRuns(log: ActivityLogState, ...actions: string[]): ActivityLogState {
  let next = log;
  for (const action of actions) {
    next = appendActivityLogEvent(next, {
      runId: `${action}-run`, action, repoPath: "/repo", stream: "stdout", text: `${action} output\n`,
      timestamp: "2026-09-04T12:00:02Z", startedAt: "2026-09-04T12:00:00Z", exitCode: 0
    });
  }
  return next;
}

function renderView(initialLog: ActivityLogState, {
  store = new WorkspacePanelStateStore(),
  onCopyRawLog = vi.fn()
}: { store?: WorkspacePanelStateStore; onCopyRawLog?: (runId?: string) => void } = {}) {
  const view = (log: ActivityLogState) => (
    <TooltipProvider>
      <WorkspacePanelStateProvider store={store} namespace="D:/repo">
        <ActivityLogView log={log} statusLabel="Idle" onClearLog={vi.fn()} onCopyRawLog={onCopyRawLog} />
      </WorkspacePanelStateProvider>
    </TooltipProvider>
  );
  const result = render(view(initialLog));
  const handle = {
    log: initialLog,
    unmount: result.unmount,
    update(log: ActivityLogState) {
      handle.log = log;
      result.rerender(view(log));
    }
  };
  return handle;
}

function heading(): string | null {
  return screen.getByRole("heading", { level: 2 }).textContent;
}

function runList(): HTMLElement {
  return screen.getByRole("list", { name: "Activity runs" });
}

function runButton(name: RegExp): HTMLElement {
  return within(runList()).getByRole("button", { name });
}
