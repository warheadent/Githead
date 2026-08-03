// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSelectionSafeValue } from "./useSelectionSafeValue";
import { afterEach, describe, expect, it } from "vite-plus/test";

afterEach(cleanup);

function Harness(): React.JSX.Element {
  const { value, requestValue, rootRef, onPointerDownCapture } = useSelectionSafeValue("plain");
  return (
    <div>
      <div ref={rootRef} onPointerDownCapture={onPointerDownCapture} data-testid="selection-root">selected text</div>
      <output>{value}</output>
      <button type="button" onClick={() => requestValue("highlighted")}>Highlight</button>
    </div>
  );
}

describe("useSelectionSafeValue", () => {
  it("defers a value update until a selection leaves the root", () => {
    render(<Harness />);
    const root = screen.getByTestId("selection-root");
    const text = root.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.pointerDown(root);
    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    fireEvent.pointerUp(document);
    expect(screen.getByText("plain", { selector: "output" })).toBeTruthy();

    selection.removeAllRanges();
    fireEvent(document, new Event("selectionchange"));
    expect(screen.getByText("highlighted", { selector: "output" })).toBeTruthy();
  });

  it("applies an update when no selection is active", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    expect(screen.getByText("highlighted", { selector: "output" })).toBeTruthy();
  });
});
