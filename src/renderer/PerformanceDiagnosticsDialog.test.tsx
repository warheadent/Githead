// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitheadApi, PerformanceDiagnosticsSnapshot } from "../shared/types";
import { PerformanceDiagnosticsDialog } from "./PerformanceDiagnosticsDialog";

const startPerformanceDiagnostics = vi.fn<GitheadApi["startPerformanceDiagnostics"]>();
const getPerformanceDiagnosticsSnapshot = vi.fn<GitheadApi["getPerformanceDiagnosticsSnapshot"]>();
const stopPerformanceDiagnostics = vi.fn<GitheadApi["stopPerformanceDiagnostics"]>();

const initialSnapshot: PerformanceDiagnosticsSnapshot = {
  samples: [
    {
      type: "command",
      sequence: 1,
      recordedAtMs: 100,
      commandKind: "git",
      durationMs: 100,
      outcome: "success",
      outputBytes: 1_024,
      queueDepth: 2
    },
    {
      type: "command",
      sequence: 2,
      recordedAtMs: 200,
      commandKind: "git",
      durationMs: 300,
      outcome: "failure",
      outputBytes: 2_048,
      queueDepth: 3
    },
    {
      type: "refresh",
      sequence: 3,
      recordedAtMs: 300,
      refreshKind: "status",
      refreshRequestCount: 4,
      refreshCoalescedCount: 2,
      queueDepth: 1
    }
  ],
  processMetrics: [{
    processKind: "renderer",
    percentCpuUsage: 12,
    idleWakeupsPerSecond: 3,
    workingSetKilobytes: 2_048,
    peakWorkingSetKilobytes: 4_096,
    privateKilobytes: 1_024
  }],
  processMetricsStatus: "available",
  processMetricLimit: 64,
  droppedProcessMetricCount: 0,
  retainedSampleLimit: 600,
  droppedSampleCount: 5
};

beforeEach(() => {
  startPerformanceDiagnostics.mockReset().mockResolvedValue(initialSnapshot);
  getPerformanceDiagnosticsSnapshot.mockReset().mockResolvedValue(initialSnapshot);
  stopPerformanceDiagnostics.mockReset().mockResolvedValue(undefined);
  window.githead = {
    startPerformanceDiagnostics,
    getPerformanceDiagnosticsSnapshot,
    stopPerformanceDiagnostics
  } as unknown as GitheadApi;
});

afterEach(cleanup);

describe("PerformanceDiagnosticsDialog", () => {
  it("starts collection only while the dialog is open", async () => {
    const view = render(<PerformanceDiagnosticsDialog open={false} onOpenChange={vi.fn()} />);

    expect(startPerformanceDiagnostics).not.toHaveBeenCalled();
    expect(getPerformanceDiagnosticsSnapshot).not.toHaveBeenCalled();

    view.rerender(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);

    await vi.waitFor(() => expect(startPerformanceDiagnostics).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Performance Diagnostics" })).toBeTruthy();
    expect(getPerformanceDiagnosticsSnapshot).not.toHaveBeenCalled();
  });

  it("shows bounded command, refresh, and process summaries", async () => {
    render(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);

    await screen.findByText("3 of 600");
    expect(screen.getByRole("table", { name: "Command performance summary" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Refresh performance summary" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Electron process performance summary" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Git" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Renderer" })).toBeTruthy();
    expect(screen.getByText("200 ms")).toBeTruthy();
    expect(screen.getByText("3.0 KiB")).toBeTruthy();
    expect(screen.getByText("2.0 MiB")).toBeTruthy();
  });

  it("limits the visible process rows", async () => {
    startPerformanceDiagnostics.mockResolvedValue({
      ...initialSnapshot,
      processMetricLimit: 100,
      processMetrics: Array.from({ length: 70 }, () => initialSnapshot.processMetrics[0]!)
    });
    render(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);

    await screen.findByRole("table", { name: "Electron process performance summary" });

    expect(screen.getAllByRole("cell", { name: "Renderer" })).toHaveLength(64);
  });

  it("refreshes only after an explicit user action", async () => {
    const refreshedSnapshot: PerformanceDiagnosticsSnapshot = {
      ...initialSnapshot,
      samples: [{
        type: "command",
        sequence: 4,
        recordedAtMs: 400,
        commandKind: "lore",
        durationMs: 50,
        outcome: "success",
        outputBytes: 10,
        queueDepth: 0
      }]
    };
    getPerformanceDiagnosticsSnapshot.mockResolvedValue(refreshedSnapshot);
    render(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);

    await screen.findByRole("cell", { name: "Git" });
    expect(getPerformanceDiagnosticsSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await vi.waitFor(() => expect(getPerformanceDiagnosticsSnapshot).toHaveBeenCalledOnce());
    expect(await screen.findByRole("cell", { name: "Lore" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Diagnostics refreshed.");
  });

  it("stops collection when the controlled dialog closes", async () => {
    function ControlledDialog() {
      const [open, setOpen] = useState(true);
      return <PerformanceDiagnosticsDialog open={open} onOpenChange={setOpen} />;
    }
    render(<ControlledDialog />);
    await vi.waitFor(() => expect(startPerformanceDiagnostics).toHaveBeenCalledOnce());

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);

    await vi.waitFor(() => expect(stopPerformanceDiagnostics).toHaveBeenCalledOnce());
  });

  it("stops collection when the component unmounts", async () => {
    const view = render(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);
    await vi.waitFor(() => expect(startPerformanceDiagnostics).toHaveBeenCalledOnce());

    view.unmount();

    await vi.waitFor(() => expect(stopPerformanceDiagnostics).toHaveBeenCalledOnce());
  });

  it("does not display sensitive text from a diagnostics failure", async () => {
    startPerformanceDiagnostics.mockRejectedValue(new Error("C:\\secret-repository git push --force"));
    render(<PerformanceDiagnosticsDialog open onOpenChange={vi.fn()} />);

    expect((await screen.findByRole("alert")).textContent).toBe("Githead did not load performance diagnostics.");
    expect(screen.queryByText(/secret-repository/)).toBeNull();
    expect(screen.queryByText(/push --force/)).toBeNull();
  });
});
