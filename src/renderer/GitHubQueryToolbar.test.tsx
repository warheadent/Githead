// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubQueryToolbar } from "./GitHubQueryToolbar";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("GitHubQueryToolbar", () => {
  it("labels controls and applies select changes immediately", () => {
    const onPresetChange = vi.fn();
    render(<GitHubQueryToolbar view="issues" search="" preset="all" presets={[{ value: "all", label: "All open" }, { value: "custom", label: "Custom" }]} sort="updated-desc" sortOptions={[{ value: "updated-desc", label: "Recently updated" }]} viewerAvailable status="3 matching" onSearchChange={vi.fn()} onPresetChange={onPresetChange} onSortChange={vi.fn()} onClear={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Preset"), { target: { value: "custom" } });
    expect(onPresetChange).toHaveBeenCalledWith("custom");
    expect(screen.getByRole("status").textContent).toBe("3 matching");
  });

  it("debounces server search", () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    render(<GitHubQueryToolbar view="pullRequests" search="" preset="all" presets={[{ value: "all", label: "All open" }]} sort="updated-desc" sortOptions={[{ value: "updated-desc", label: "Recently updated" }]} viewerAvailable status="" onSearchChange={onSearchChange} onPresetChange={vi.fn()} onSortChange={vi.fn()} onClear={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "fix" } });
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onSearchChange).toHaveBeenCalledWith("fix");
  });
});
