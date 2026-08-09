// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  it("does not submit an unchanged search when callback identity changes", () => {
    vi.useFakeTimers();
    const firstSearchChange = vi.fn();
    const nextSearchChange = vi.fn();
    const props: React.ComponentProps<typeof GitHubQueryToolbar> = {
      view: "pullRequests",
      search: "",
      preset: "all",
      presets: [{ value: "all", label: "All open" }],
      sort: "updated-desc",
      sortOptions: [{ value: "updated-desc", label: "Recently updated" }],
      viewerAvailable: true,
      status: "",
      onSearchChange: firstSearchChange,
      onPresetChange: vi.fn(),
      onSortChange: vi.fn(),
      onClear: vi.fn()
    };
    const { rerender } = render(<GitHubQueryToolbar {...props} />);
    rerender(<GitHubQueryToolbar {...props} preset="drafts" onSearchChange={nextSearchChange} />);

    act(() => vi.advanceTimersByTime(300));

    expect(firstSearchChange).not.toHaveBeenCalled();
    expect(nextSearchChange).not.toHaveBeenCalled();
  });

  it("uses the themed menu for compact sorting", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<GitHubQueryToolbar compact view="pullRequests" search="" preset="all" presets={[{ value: "all", label: "All open" }]} sort="updated-desc" sortOptions={[{ value: "updated-desc", label: "Recently updated" }, { value: "created-desc", label: "Newest" }]} viewerAvailable status="" onSearchChange={vi.fn()} onPresetChange={vi.fn()} onSortChange={onSortChange} onClear={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sort: Recently updated" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Newest" }));

    expect(onSortChange).toHaveBeenCalledWith("created-desc");
  });

  it("applies compact workflow search immediately and exposes a specific refresh label", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onRefresh = vi.fn();
    render(<TooltipProvider><GitHubQueryToolbar compact view="workflows" search="" preset="all" presets={[{ value: "all", label: "All runs" }]} sort="desc" sortOptions={[{ value: "desc", label: "Newest" }]} viewerAvailable status="" onSearchChange={onSearchChange} onPresetChange={vi.fn()} onSortChange={vi.fn()} onClear={vi.fn()} onRefresh={onRefresh} /></TooltipProvider>);

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "linux");
    expect(onSearchChange).toHaveBeenLastCalledWith("linux");
    await user.click(screen.getByRole("button", { name: "Refresh workflow runs" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps advanced pull-request filters in a compact popover", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onRefresh = vi.fn();
    render(<TooltipProvider><GitHubQueryToolbar compact activeFilterCount={2} view="pullRequests" search="" preset="drafts" presets={[{ value: "all", label: "All open" }, { value: "drafts", label: "Drafts" }]} sort="updated-desc" sortOptions={[{ value: "updated-desc", label: "Recently updated" }]} viewerAvailable status="3 matching" onSearchChange={vi.fn()} onPresetChange={vi.fn()} onSortChange={vi.fn()} onClear={onClear} onRefresh={onRefresh}><label>Label<input /></label></GitHubQueryToolbar></TooltipProvider>);

    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeTruthy();
    expect(screen.queryByLabelText("Preset")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filters, 2 active" }));
    expect(screen.getByLabelText("Preset")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Refresh pull requests" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
