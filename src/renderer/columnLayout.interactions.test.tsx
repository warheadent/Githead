// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  AdjustableColumnHeader,
  type ColumnDefinition,
  type PersistentColumnLayout
} from "./columnLayout";

afterEach(cleanup);

const columns = [
  { id: "name", label: "Name", defaultWidth: 200, minWidth: 100 }
] as const satisfies readonly ColumnDefinition<"name">[];

describe("adjustable column header", () => {
  it("resizes without also moving the column when Alt and an arrow key are pressed on the separator", () => {
    const commitWidth = vi.fn();
    const move = vi.fn();
    const controller: PersistentColumnLayout<"name"> = {
      layout: {
        order: ["name"],
        widths: { name: 200 },
        visibility: { name: true }
      },
      visibleOrder: ["name"],
      containerRef: { current: null },
      style: {},
      previewWidth: vi.fn(),
      commitWidth,
      resetWidth: vi.fn(),
      move,
      reorder: vi.fn(),
      setVisibility: vi.fn(),
      canHide: vi.fn()
    };

    render(<AdjustableColumnHeader columns={columns} controller={controller} className="header" />);

    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize column" }), {
      key: "ArrowRight",
      altKey: true
    });

    expect(commitWidth).toHaveBeenCalledWith("name", 210);
    expect(move).not.toHaveBeenCalled();
  });
});
