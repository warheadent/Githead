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
    fireEvent.click(screen.getByRole("button", { name: "Rename branch" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Force delete branch" }));

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith(["feature"], true));
  });

  it("keeps the dialog open and shows errors next to the inline action", async () => {
    const { props } = renderDialog({ onRemove: vi.fn().mockResolvedValue("Branch is not fully merged.") });

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete branch" }));

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
    expect(screen.getByRole("button", { name: "Delete branch" })).toBeTruthy();
  });

  it("bulk deletes the selected branches after confirming in the footer", async () => {
    const { props } = renderDialog();

    expect((screen.getByRole("checkbox", { name: "Select main" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select release" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select feature" }));
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete 2 branches…" }));
    expect(screen.getByText("feature, release")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 branches" }));

    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith(["feature", "release"], false));
    await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull());
  });

  it("selects every removable branch shown by the search", () => {
    renderDialog({ branches: [...branches, { name: "feature/two", current: false, upstream: null }] });

    fireEvent.change(screen.getByRole("textbox", { name: "Search branches" }), { target: { value: "feature" } });
    const selectAll = screen.getByRole("checkbox", { name: /Select all shown branches/ }) as HTMLInputElement;
    fireEvent.click(selectAll);
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Search branches" }), { target: { value: "" } });
    expect(selectAll.indeterminate).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Select release" }) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps only the branches that survived a partial bulk delete selected", async () => {
    const onRemove = vi.fn().mockResolvedValue("feature has commits that haven’t been merged and was kept.");
    const { rerender, props } = renderDialog({ onRemove });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select feature" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select release" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 branches…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 branches" }));
    expect((await screen.findByRole("alert")).textContent).toContain("was kept");

    rerender(<BranchManagementDialog {...props} branches={branches.filter((branch) => branch.name !== "release")} />);
    expect(screen.getByText("Delete 1 branch?")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Force delete/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force delete 1 branch" }));
    await waitFor(() => expect(onRemove).toHaveBeenLastCalledWith(["feature"], true));
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
