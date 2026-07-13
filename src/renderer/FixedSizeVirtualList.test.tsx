// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { FixedSizeVirtualList } from "./FixedSizeVirtualList";

let resizeCallback: ResizeObserverCallback | null;
const disconnect = vi.fn();

function renderList(items = Array.from({ length: 100 }, (_, index) => `file-${index}`), selectedKey?: string) {
  return render(
    <FixedSizeVirtualList
      items={items}
      itemKey={(item) => item}
      rowHeight={20}
      overscan={2}
      ariaLabel="Files"
      selectedKey={selectedKey}
      className="file-list"
      renderItem={(item, index, props) => (
        <button key={item} role="option" data-virtual-index={index} {...props}>{item}</button>
      )}
    />
  );
}

describe("FixedSizeVirtualList", () => {
  beforeEach(() => {
    resizeCallback = null;
    disconnect.mockClear();
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 100 });
    vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void { disconnect(); }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only the initial viewport with bounded overscan and accessible positions", () => {
    renderList();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(7);
    expect(options[0]?.textContent).toBe("file-0");
    expect(options[0]?.getAttribute("aria-posinset")).toBe("1");
    expect(options[0]?.getAttribute("aria-setsize")).toBe("100");
    expect(screen.queryByText("file-7")).toBeNull();
  });

  it("updates the window on scroll and clamps overscan at the end", () => {
    renderList();
    const list = screen.getByRole("listbox", { name: "Files" });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 1_900 });
    fireEvent.scroll(list);
    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toBe("file-93");
    expect(options.at(-1)?.textContent).toBe("file-99");
  });

  it("remeasures through ResizeObserver", () => {
    let height = 100;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => height });
    renderList();
    expect(screen.getAllByRole("option")).toHaveLength(7);
    height = 200;
    act(() => resizeCallback?.([], {} as ResizeObserver));
    expect(screen.getAllByRole("option")).toHaveLength(12);
  });

  it("handles an empty list and disconnects its observer", () => {
    const view = renderList([]);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("uses and cleans up the window resize fallback", () => {
    vi.unstubAllGlobals();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const view = renderList();
    expect(add).toHaveBeenCalledWith("resize", expect.any(Function));
    const listener = add.mock.calls.find(([type]) => type === "resize")?.[1];
    view.unmount();
    expect(remove).toHaveBeenCalledWith("resize", listener);
  });

  it("scrolls a newly selected offscreen item into view", () => {
    const items = Array.from({ length: 100 }, (_, index) => `file-${index}`);
    const view = renderList(items);
    const list = screen.getByRole("listbox", { name: "Files" });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });
    view.rerender(
      <FixedSizeVirtualList items={items} itemKey={(item) => item} rowHeight={20} overscan={2} ariaLabel="Files"
        selectedKey="file-50" className="file-list" renderItem={(item, index, props) => <button key={item} role="option" data-virtual-index={index} {...props}>{item}</button>} />
    );
    expect(list.scrollTop).toBe(920);
    expect(screen.getByText("file-50")).toBeTruthy();
  });

  it("clamps scroll position when the item set shrinks", () => {
    const items = Array.from({ length: 100 }, (_, index) => `file-${index}`);
    const view = renderList(items);
    const list = screen.getByRole("listbox", { name: "Files" });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 1_900 });
    fireEvent.scroll(list);
    view.rerender(
      <FixedSizeVirtualList items={items.slice(0, 10)} itemKey={(item) => item} rowHeight={20} overscan={2} ariaLabel="Files"
        className="file-list" renderItem={(item, index, props) => <button key={item} role="option" data-virtual-index={index} {...props}>{item}</button>} />
    );
    expect(list.scrollTop).toBe(100);
    expect(screen.getByText("file-9")).toBeTruthy();
  });

  it("moves focus to the listbox before a focused row is unmounted", () => {
    renderList();
    const list = screen.getByRole("listbox", { name: "Files" });
    const first = screen.getByText("file-0");
    first.focus();
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 1_000 });
    fireEvent.scroll(list);
    expect(document.activeElement).toBe(list);
  });
});
