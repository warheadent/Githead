// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gitCapabilities, type GitBranch } from "../shared/types";
import { BranchManagementDialog, type BranchManagementDialogProps } from "./BranchManagementDialog";

afterEach(cleanup);

const branches: GitBranch[] = [
  { name: "main", current: true, upstream: "origin/main" },
  { name: "feature", current: false, upstream: null },
  { name: "release", current: false, upstream: "origin/release" }
];

function renderDialog(overrides: Partial<BranchManagementDialogProps> = {}) {
  const props: BranchManagementDialogProps = {
    open: true,
    repoPath: "C:\\repo",
    kind: "git",
    capabilities: gitCapabilities(),
    branches,
    busy: false,
    onOpenChange: vi.fn(),
    onRename: vi.fn().mockResolvedValue(null),
    onRemove: vi.fn().mockResolvedValue(null),
    ...overrides
  };
  return { props, ...render(<BranchManagementDialog {...props} />, { wrapper: TooltipProvider }) };
}

describe("BranchManagementDialog", () => {
  it("renames inline while keeping the rest of the list in place", async () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Rename feature" }));

    expect(screen.getByRole("textbox", { name: "Search branches" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete release" })).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "New name" }) as HTMLInputElement;
    expect(input.value).toBe("feature");
    fireEvent.change(input, { target: { value: "feature/renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Branch" }));

    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith("feature", "feature/renamed"));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "New name" })).toBeNull());
  });

  it("confirms deletion inside the selected row and passes the force choice", async () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));

    const row = screen.getByRole("listitem", { name: "feature" });
    expect(row.querySelector("form")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete release" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Force delete/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force Delete Branch" }));

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith("feature", true));
  });

  it("keeps the dialog open and shows errors next to the inline action", async () => {
    const { props } = renderDialog({ onRemove: vi.fn().mockResolvedValue("Branch is not fully merged.") });

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Branch" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Branch is not fully merged.");
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("cancels an inline action with Escape before closing the dialog", () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Rename feature" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New name" }), { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "New name" })).toBeNull();
    expect(props.onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search branches" }), { key: "Escape" });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("switches the inline action when another row is chosen", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Rename feature" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete release" }));

    expect(screen.queryByRole("textbox", { name: "New name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete Branch" })).toBeTruthy();
  });

  it("keeps the active row visible while the search changes", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search branches" }), { target: { value: "release" } });

    expect(screen.getByRole("listitem", { name: "feature" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "release" })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "main" })).toBeNull();
  });
});
