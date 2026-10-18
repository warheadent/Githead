// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DiffRows, type DiffHunkAction } from "./DiffRows";

let frameCallbacks: FrameRequestCallback[];
let intersectionCallback: IntersectionObserverCallback | null;

function additionDiff(rowCount: number): string {
  const lines = Array.from({ length: rowCount }, (_, index) => `+const value${index} = ${index};`);
  return ["diff --git a/file.ts b/file.ts", "--- a/file.ts", "+++ b/file.ts", `@@ -0,0 +1,${rowCount} @@`, ...lines].join("\n");
}

/** Runs one mount step: the pending frame, then the timer that follows it. */
async function runMountStep(): Promise<void> {
  await act(async () => {
    for (const callback of frameCallbacks.splice(0)) callback(performance.now());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rows(): NodeListOf<Element> {
  return document.querySelectorAll(".diff-row");
}

function diffRoot(): HTMLElement {
  return document.querySelector<HTMLElement>(".diff-rows")!;
}

beforeEach(() => {
  frameCallbacks = [];
  intersectionCallback = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frameCallbacks.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.getSelection()?.removeAllRanges();
});

describe("DiffRows", () => {
  it("renders a small diff in one commit", async () => {
    render(<DiffRows filePath="file.ts" text={additionDiff(12)} truncated={false} />);

    await waitFor(() => expect(rows()).toHaveLength(12));
    expect(diffRoot().getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector("[data-pending]")).toBeNull();
    expect(screen.getByText("@@ -0,0 +1,12 @@")).toBeTruthy();
  });

  it("mounts a large diff over several frames and keeps the space of pending rows", async () => {
    render(<DiffRows filePath="file.ts" text={additionDiff(1_000)} truncated={false} />);

    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const initialRows = rows().length;
    expect(initialRows).toBeLessThan(1_000);
    expect(diffRoot().getAttribute("aria-busy")).toBe("true");
    const pending = document.querySelector<HTMLElement>("[data-pending]")!;
    expect(pending.style.getPropertyValue("--diff-chunk-height")).toBe("1280px");
    expect(pending.style.getPropertyValue("--diff-chunk-width")).toMatch(/^calc\(166px \+ \d+ch\)$/);

    await runMountStep();
    expect(rows().length).toBeGreaterThan(initialRows);

    for (let step = 0; step < 100 && diffRoot().getAttribute("aria-busy") === "true"; step += 1) await runMountStep();
    expect(rows()).toHaveLength(1_000);
    expect(diffRoot().getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector("[data-pending]")).toBeNull();
    expect(document.querySelectorAll(".diff-hunk-toolbar")).toHaveLength(1);
  });

  it("mounts every pending row before a copy of a selection in the diff", async () => {
    render(<DiffRows filePath="file.ts" text={additionDiff(1_000)} truncated={false} />);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThan(1_000);

    const range = document.createRange();
    range.selectNodeContents(document.body);
    document.getSelection()!.addRange(range);
    fireEvent.copy(document.body);

    expect(rows()).toHaveLength(1_000);
    expect(diffRoot().getAttribute("aria-busy")).toBe("false");
  });

  it("mounts the chunks near the viewport before the earlier pending chunks", async () => {
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
    render(<DiffRows filePath="file.ts" text={additionDiff(1_000)} truncated={false} />);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const chunk = (index: number) => document.querySelector<HTMLElement>(`[data-diff-chunk="${index}"]`)!;
    expect(chunk(12).hasAttribute("data-pending")).toBe(true);

    act(() => intersectionCallback!([{ target: chunk(12), isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    await runMountStep();

    expect(chunk(12).hasAttribute("data-pending")).toBe(false);
    expect(chunk(12).querySelectorAll(".diff-row").length).toBeGreaterThan(0);
    expect(chunk(10).hasAttribute("data-pending")).toBe(true);
  });

  it("disables line and hunk actions without remounting rows and applies a line patch when enabled", async () => {
    const onApply = vi.fn();
    const action = (disabled: boolean): DiffHunkAction => ({ side: "unstaged", disabled, onApply });
    const text = additionDiff(3);
    const { rerender } = render(<DiffRows filePath="file.ts" text={text} truncated={false} hunkAction={action(false)} />);
    const lineButton = await screen.findByRole("button", { name: "Stage added line 2" });
    const row = lineButton.closest(".diff-row");

    rerender(<DiffRows filePath="file.ts" text={text} truncated={false} hunkAction={action(true)} />);

    expect(lineButton.closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Stage hunk" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Stage added line 2" })).toBe(lineButton);
    expect(lineButton.closest(".diff-row")).toBe(row);
    fireEvent.click(lineButton);
    expect(onApply).not.toHaveBeenCalled();

    rerender(<DiffRows filePath="file.ts" text={text} truncated={false} hunkAction={action(false)} />);

    expect(lineButton.closest("fieldset")?.disabled).toBe(false);
    fireEvent.click(lineButton);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toContain("+const value1 = 1;");
    expect(onApply.mock.calls[0]![0]).not.toContain("+const value2 = 2;");
  });
});
