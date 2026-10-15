// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { FixedSizeVirtualList } from "./FixedSizeVirtualList";

let resizeCallback: ResizeObserverCallback | null;
let resizeCallbacks: ResizeObserverCallback[];
let observedElements: Element[];
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

const CONTAINER_TOP = 40;
const files = Array.from({ length: 100 }, (_, index) => `file-${index}`);

/** jsdom has no layout, so the container reports each list's offset through its spacer rect. */
function createScrollContainer(offsets: Record<string, number>, { scrollPaddingTop = "auto" } = {}) {
  const container = document.createElement("div");
  const host = document.createElement("div");
  container.append(host);
  document.body.append(container);
  let scrollTop = 0;
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => { scrollTop = Math.max(0, value); }
  });
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === container) return { top: CONTAINER_TOP, width: 300, height: 100 } as DOMRect;
    const label = this.classList.contains("virtual-list-spacer") ? this.parentElement?.getAttribute("aria-label") : null;
    const offset = label ? offsets[label] : undefined;
    return offset === undefined ? getBoundingClientRect.call(this) : { top: CONTAINER_TOP + offset - scrollTop } as DOMRect;
  });
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudoElement) => (
    element === container ? { scrollPaddingTop } as CSSStyleDeclaration : getComputedStyle(element, pseudoElement)
  ));
  return {
    container,
    host,
    scrollTo(value: number) {
      act(() => {
        container.scrollTop = value;
        fireEvent.scroll(container);
      });
    }
  };
}

function EmbeddedList({ label, items = files, container, selectedKey, revealSelection, onNavigate }: {
  label: string;
  items?: readonly string[];
  container: HTMLElement | null;
  selectedKey?: string;
  revealSelection?: boolean;
  onNavigate?: (item: string, event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <FixedSizeVirtualList
      items={items}
      itemKey={(item) => item}
      rowHeight={20}
      overscan={2}
      ariaLabel={label}
      selectedKey={selectedKey}
      {...(revealSelection === undefined ? {} : { revealSelection })}
      className="file-list"
      scrollContainer={container}
      {...(onNavigate ? { onNavigate } : {})}
      renderItem={(item, index, props) => <button key={item} role="option" data-virtual-index={index} {...props}>{item}</button>}
    />
  );
}

function optionNames(listName: string): string[] {
  return within(screen.getByRole("listbox", { name: listName })).getAllByRole("option").map((option) => option.textContent ?? "");
}

describe("FixedSizeVirtualList", () => {
  beforeEach(() => {
    resizeCallback = null;
    resizeCallbacks = [];
    observedElements = [];
    disconnect.mockClear();
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 100 });
    vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        resizeCallbacks.push(callback);
      }
      observe(element: Element): void { observedElements.push(element); }
      unobserve(): void {}
      disconnect(): void { disconnect(); }
    });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
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

  it("supports a single-selection listbox contract", () => {
    render(
      <FixedSizeVirtualList items={["line"]} itemKey={(item) => item} rowHeight={20} ariaLabel="Blame" multiSelectable={false}
        renderItem={(item, index, props) => <div role="option" aria-selected="false" data-virtual-index={index} {...props}>{item}</div>} />
    );
    expect(screen.getByRole("listbox", { name: "Blame" }).getAttribute("aria-multiselectable")).toBe("false");
  });

  it("supports a virtual tree contract", () => {
    render(
      <FixedSizeVirtualList items={["folder"]} itemKey={(item) => item} rowHeight={20} ariaLabel="Folders" role="tree"
        renderItem={(item, index, props) => <button role="treeitem" data-virtual-index={index} {...props}>{item}</button>} />
    );
    expect(screen.getByRole("tree", { name: "Folders" }).getAttribute("aria-multiselectable")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "folder" })).toBeTruthy();
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

  describe("with an external scroll container", () => {
    it("derives the window from the container scroll position and the list offset", () => {
      const { container, host, scrollTo } = createScrollContainer({ Files: 200 });
      render(<EmbeddedList label="Files" container={container} />, { container: host });
      const list = screen.getByRole("listbox", { name: "Files" });
      expect(list.className).toBe("file-list is-embedded");
      expect(list.getAttribute("aria-multiselectable")).toBe("true");
      expect(optionNames("Files")).toEqual(["file-0", "file-1", "file-2"]);

      scrollTo(600);
      expect(optionNames("Files")).toEqual(Array.from({ length: 9 }, (_, index) => `file-${index + 18}`));

      Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 1_900 });
      fireEvent.scroll(list);
      expect(optionNames("Files")[0]).toBe("file-18");

      scrollTo(2_300);
      expect(optionNames("Files")).toEqual(["file-97", "file-98", "file-99"]);
    });

    it("shares one container between two lists and follows content that moves them", () => {
      const offsets = { Staged: 0, Unstaged: 240 };
      const staged = Array.from({ length: 10 }, (_, index) => `staged-${index}`);
      const unstaged = Array.from({ length: 100 }, (_, index) => `unstaged-${index}`);
      const { container, host, scrollTo } = createScrollContainer(offsets);
      render(
        <>
          <EmbeddedList label="Staged" items={staged} container={container} />
          <EmbeddedList label="Unstaged" items={unstaged} container={container} />
        </>,
        { container: host }
      );
      expect(observedElements).toEqual(expect.arrayContaining([container, host]));

      scrollTo(250);
      expect(optionNames("Staged")).toEqual(["staged-7", "staged-8", "staged-9"]);
      expect(optionNames("Unstaged")).toEqual(Array.from({ length: 7 }, (_, index) => `unstaged-${index}`));

      offsets.Unstaged = 400;
      act(() => {
        for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
      });
      expect(optionNames("Staged")).toEqual(["staged-7", "staged-8", "staged-9"]);
      expect(optionNames("Unstaged")).toEqual(["unstaged-0", "unstaged-1", "unstaged-2"]);
    });

    it("scrolls the container for Home and End below its scroll padding", () => {
      const { container, host } = createScrollContainer({ Files: 200 }, { scrollPaddingTop: "32px" });
      const onNavigate = vi.fn();
      render(<EmbeddedList label="Files" container={container} onNavigate={onNavigate} />, { container: host });
      const first = screen.getByRole("option", { name: "file-0" });
      first.focus();

      fireEvent.keyDown(first, { key: "End" });
      expect(container.scrollTop).toBe(2_100);
      expect(document.activeElement?.textContent).toBe("file-99");
      expect(onNavigate).toHaveBeenLastCalledWith("file-99", expect.anything());

      fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
      expect(container.scrollTop).toBe(2_100);
      expect(document.activeElement?.textContent).toBe("file-98");

      fireEvent.keyDown(document.activeElement!, { key: "Home" });
      expect(container.scrollTop).toBe(168);
      expect(document.activeElement?.textContent).toBe("file-0");
      expect(onNavigate).toHaveBeenLastCalledWith("file-0", expect.anything());
    });

    it("reveals a newly selected row by scrolling the container", () => {
      const { container, host } = createScrollContainer({ Files: 200 }, { scrollPaddingTop: "32px" });
      const view = render(<EmbeddedList label="Files" container={container} />, { container: host });

      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-50" />);
      expect(container.scrollTop).toBe(1_120);
      expect(screen.getByRole("option", { name: "file-50" })).toBeTruthy();

      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-10" />);
      expect(container.scrollTop).toBe(368);
      expect(screen.getByRole("option", { name: "file-10" })).toBeTruthy();
    });

    it("takes a selection without scrolling when it must not reveal it", () => {
      const { container, host } = createScrollContainer({ Files: 200 }, { scrollPaddingTop: "32px" });
      const view = render(<EmbeddedList label="Files" container={container} />, { container: host });

      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-50" revealSelection={false} />);
      expect(container.scrollTop).toBe(0);
      // Allowing reveals again does not reveal the selection that arrived while they were off.
      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-50" />);
      expect(container.scrollTop).toBe(0);

      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-10" />);
      expect(container.scrollTop).toBe(320);
    });

    it("moves focus to the list before a focused row scrolls out of the container", () => {
      const { container, host, scrollTo } = createScrollContainer({ Files: 0 });
      render(<EmbeddedList label="Files" container={container} />, { container: host });
      screen.getByRole("option", { name: "file-0" }).focus();

      scrollTo(1_500);
      expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "Files" }));
    });

    it("keeps the last offset while the container has no layout box", () => {
      const { container, host, scrollTo } = createScrollContainer({ Files: 200 });
      render(<EmbeddedList label="Files" container={container} />, { container: host });
      scrollTo(600);
      expect(optionNames("Files")[0]).toBe("file-18");

      // A hidden tab, like jsdom, reports empty rects for every element.
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => ({ top: 0, width: 0, height: 0 }) as DOMRect);
      scrollTo(1_000);
      expect(optionNames("Files")).toEqual(Array.from({ length: 9 }, (_, index) => `file-${index + 38}`));
    });

    it("waits for a pending container and unsubscribes when it unmounts", () => {
      const { container, host } = createScrollContainer({ Files: 0 });
      const addListener = vi.spyOn(container, "addEventListener");
      const removeListener = vi.spyOn(container, "removeEventListener");
      const view = render(<EmbeddedList label="Files" container={null} />, { container: host });
      expect(screen.getByRole("listbox", { name: "Files" }).className).toBe("file-list is-embedded");
      expect(optionNames("Files")).toEqual(["file-0", "file-1", "file-2"]);
      expect(addListener).not.toHaveBeenCalled();

      view.rerender(<EmbeddedList label="Files" container={container} selectedKey="file-20" />);
      expect(container.scrollTop).toBe(320);
      expect(optionNames("Files")).toContain("file-20");
      const scrollListener = addListener.mock.calls.find(([type]) => type === "scroll")?.[1];
      expect(addListener).toHaveBeenCalledWith("scroll", scrollListener, { passive: true });

      disconnect.mockClear();
      view.unmount();
      expect(removeListener).toHaveBeenCalledWith("scroll", scrollListener);
      expect(disconnect).toHaveBeenCalledOnce();
    });
  });
});
