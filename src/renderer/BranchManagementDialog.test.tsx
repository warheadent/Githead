// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gitCapabilities } from "../shared/types";
import { BranchManagementDialog } from "./BranchManagementDialog";

afterEach(cleanup);

describe("BranchManagementDialog motion", () => {
  it("swaps modes through the shared motion system and makes outgoing controls inert", () => {
    render(
      <BranchManagementDialog
        open
        repoPath="C:\\repo"
        kind="git"
        capabilities={gitCapabilities()}
        branches={[
          { name: "main", current: true, upstream: "origin/main" },
          { name: "feature", current: false, upstream: null }
        ]}
        busy={false}
        onOpenChange={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
      />,
      { wrapper: TooltipProvider }
    );

    fireEvent.click(screen.getByRole("button", { name: "Rename feature" }));

    const swap = document.querySelector<HTMLElement>(".branch-management-mode-swap");
    const outgoing = swap?.querySelector<HTMLElement>(".motion-swap-outgoing");
    const incoming = swap?.querySelector<HTMLElement>(".motion-presence:not(.motion-swap-outgoing)");
    expect(outgoing?.hasAttribute("inert")).toBe(true);
    expect(outgoing?.getAttribute("aria-hidden")).toBe("true");
    expect(outgoing?.querySelector<HTMLInputElement>('input[aria-label="Search branches"]')).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search branches" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "New name" })).toBeTruthy();
    expect(incoming?.dataset.motionState).toBe("entered");
  });
});
