import { describe, expect, it } from "vitest";
import { getRenderedColumnWidths, normalizeColumnLayout, reorderColumn, type ColumnDefinition } from "./columnLayout";

const columns = [
  { id: "name", label: "Name", defaultWidth: 200, minWidth: 100 },
  { id: "date", label: "Date", defaultWidth: 120, minWidth: 80 },
  { id: "author", label: "Author", defaultWidth: 140, minWidth: 90, defaultVisible: false }
] as const satisfies readonly ColumnDefinition<string>[];

describe("column layout", () => {
  it("keeps valid saved values and restores missing columns", () => {
    expect(normalizeColumnLayout({ version: 1, order: ["date", "removed"], widths: { date: 140, name: 20 } }, columns)).toEqual({
      order: ["date", "name", "author"],
      widths: { name: 100, date: 140, author: 140 },
      visibility: { name: true, date: true, author: false }
    });
  });

  it("restores saved visibility and uses defaults for new columns", () => {
    expect(normalizeColumnLayout({
      version: 2,
      order: ["name", "date"],
      widths: { name: 220, date: 120 },
      visibility: { name: true, date: false }
    }, columns)).toEqual({
      order: ["name", "date", "author"],
      widths: { name: 220, date: 120, author: 140 },
      visibility: { name: true, date: false, author: false }
    });
  });

  it("restores a default-visible column when saved visibility hides every column", () => {
    expect(normalizeColumnLayout({
      version: 2,
      order: ["date", "name", "author"],
      widths: {},
      visibility: { name: false, date: false, author: false }
    }, columns).visibility).toEqual({ name: true, date: false, author: false });
  });

  it("never clamps a column below its dynamic minimum width", () => {
    const wideColumns = [
      { id: "wide", label: "Wide", defaultWidth: 1_100, minWidth: 1_000 }
    ] as const satisfies readonly ColumnDefinition<string>[];

    expect(normalizeColumnLayout({ version: 2, order: ["wide"], widths: { wide: 1_100 } }, wideColumns).widths).toEqual({
      wide: 1_000
    });
  });

  it("fills spare space without changing saved widths or shrinking columns on narrow windows", () => {
    const layout = normalizeColumnLayout(null, columns);
    expect(getRenderedColumnWidths(layout, 600, "name")).toEqual({ name: 480, date: 120, author: 140 });
    expect(getRenderedColumnWidths(layout, 250, "name")).toEqual(layout.widths);
    expect(layout.widths.name).toBe(200);
    layout.visibility.date = false;
    expect(getRenderedColumnWidths(layout, 600, "name").name).toBe(600);
    layout.visibility.name = false;
    expect(getRenderedColumnWidths(layout, 600, "name")).toEqual(layout.widths);
  });

  it("moves a column to the target position", () => {
    expect(reorderColumn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(reorderColumn(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
});
