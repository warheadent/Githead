// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitBranch } from "lucide-react";
import { ReferencePicker } from "./ReferencePicker";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReferencePicker", () => {
  it("filters options and selects with the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ReferencePicker
        value="main"
        options={[
          { value: "main", label: "main", detail: "current", icon: <GitBranch /> },
          { value: "feature/search", label: "feature/search", icon: <GitBranch /> }
        ]}
        ariaLabel="Select branch"
        searchPlaceholder="Search branches..."
        triggerIcon={<GitBranch />}
        onValueChange={onValueChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Select branch" }));
    const search = screen.getByRole("combobox", { name: "Search branches..." });
    await user.type(search, "feature");
    expect(screen.queryByRole("option", { name: /main/ })).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("feature/search");
  });

  it("accepts a custom reference when no listed option matches", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ReferencePicker
        value=""
        options={[]}
        ariaLabel="Choose clone branch"
        searchPlaceholder="Search or enter a branch..."
        customValueLabel={(query) => `Use branch “${query}”`}
        onValueChange={onValueChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Choose clone branch" }));
    await user.type(screen.getByRole("combobox", { name: "Search or enter a branch..." }), "release");
    await user.click(screen.getByRole("button", { name: "Use branch “release”" }));

    expect(onValueChange).toHaveBeenCalledWith("release");
  });
});
