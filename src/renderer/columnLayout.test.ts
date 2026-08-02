import { describe, expect, it } from "vitest";
import { normalizeColumnLayout, reorderColumn, type ColumnDefinition } from "./columnLayout";

const columns = [
  { id: "name", label: "Name", defaultWidth: 200, minWidth: 100 },
  { id: "date", label: "Date", defaultWidth: 120, minWidth: 80 }
] as const satisfies readonly ColumnDefinition<string>[];

describe("column layout", () => {
  it("keeps valid saved values and restores missing columns", () => {
    expect(normalizeColumnLayout({ version: 1, order: ["date", "removed"], widths: { date: 140, name: 20 } }, columns)).toEqual({
      order: ["date", "name"],
      widths: { name: 100, date: 140 }
    });
  });

  it("moves a column to the target position", () => {
    expect(reorderColumn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(reorderColumn(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
});
