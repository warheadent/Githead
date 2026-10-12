// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { GroupImperativeHandle, Layout, LayoutChangedMeta } from "react-resizable-panels";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vite-plus/test";
import { ListDetailLayout } from "./ListDetailLayout";

interface MockGroup {
  /** The layout the library holds. setLayout and the layout helpers below update it. */
  layout: Layout;
  onLayoutChanged: ((layout: Layout, meta: LayoutChangedMeta) => void) | undefined;
  setLayout: Mock<(layout: Layout) => Layout>;
}

const resizable = vi.hoisted(() => ({
  useLibrary: false,
  groups: new Map<string, MockGroup>(),
  panels: new Map<string, { onResize: (() => void) | undefined }>()
}));

// Records the props the layout passes, like the AppTestHarness mock, or renders the real library.
vi.mock("@/components/ui/resizable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/resizable")>();
  type GroupProps = Parameters<typeof actual.ResizablePanelGroup>[0];
  type PanelProps = Parameters<typeof actual.ResizablePanel>[0];
  type HandleProps = Parameters<typeof actual.ResizableHandle>[0];
  return {
    ResizablePanelGroup: (props: GroupProps) => {
      if (resizable.useLibrary) return <actual.ResizablePanelGroup {...props} />;
      const { children, className, id, onLayoutChanged, groupRef } = props;
      const key = String(id);
      let group = resizable.groups.get(key);
      if (!group) {
        const record: MockGroup = {
          layout: {},
          onLayoutChanged: undefined,
          setLayout: vi.fn((layout: Layout) => {
            record.layout = layout;
            return layout;
          })
        };
        resizable.groups.set(key, record);
        group = record;
      }
      group.onLayoutChanged = onLayoutChanged;
      const handle: GroupImperativeHandle = { getLayout: () => group.layout, setLayout: group.setLayout };
      if (groupRef && typeof groupRef === "object") {
        (groupRef as { current: GroupImperativeHandle | null }).current = handle;
      }
      return <div className={className} data-testid="group" data-group-id={key}>{children as ReactNode}</div>;
    },
    ResizablePanel: (props: PanelProps) => {
      if (resizable.useLibrary) return <actual.ResizablePanel {...props} />;
      const { children, className, id, defaultSize, minSize, maxSize, groupResizeBehavior, elementRef, onResize } = props;
      resizable.panels.set(String(id), {
        onResize: onResize ? () => onResize({ asPercentage: 0, inPixels: 0 }, id, undefined) : undefined
      });
      return (
        <div ref={elementRef} id={String(id)} className={className} data-default-size={defaultSize} data-min-size={minSize}
          data-max-size={maxSize} data-group-resize-behavior={groupResizeBehavior}>
          {children as ReactNode}
        </div>
      );
    },
    ResizableHandle: (props: HandleProps) => {
      if (resizable.useLibrary) return <actual.ResizableHandle {...props} />;
      return (
        <div role="separator" aria-label={props["aria-label"]} className={props.className}
          data-disable-double-click={props.disableDoubleClick ? "true" : undefined} onDoubleClick={props.onDoubleClick} />
      );
    }
  };
});

const STORAGE_KEY = "githead.list-column";

let narrowMedia: { matches: boolean; addEventListener: EventTarget["addEventListener"]; removeEventListener: EventTarget["removeEventListener"] };
let narrowMediaEvents: EventTarget;

function setNarrow(matches: boolean): void {
  act(() => {
    narrowMedia.matches = matches;
    narrowMediaEvents.dispatchEvent(new Event("change"));
  });
}

function renderLayout(props: Partial<Parameters<typeof ListDetailLayout>[0]> = {}) {
  const element = (overrides: Partial<Parameters<typeof ListDetailLayout>[0]> = {}) => (
    <ListDetailLayout
      id="changes"
      list={<ul aria-label="Changed files"><li>App.tsx</li></ul>}
      detail={<section aria-label="Diff">diff</section>}
      {...props}
      {...overrides}
    />
  );
  const view = render(element());
  return { ...view, rerenderLayout: (overrides: Partial<Parameters<typeof ListDetailLayout>[0]>) => view.rerender(element(overrides)) };
}

function Views({ ids }: { ids: readonly string[] }): ReactNode {
  return ids.map((id) => <ListDetailLayout key={id} id={id} list={`${id} list`} detail={`${id} detail`} />);
}

function group(id: string): MockGroup {
  const record = resizable.groups.get(`${id}-list-detail`);
  if (!record) throw new Error(`The ${id} layout did not render a group`);
  return record;
}

/** Sets the group width that the layout measures. A hidden view (display: none) measures 0. */
function setGroupWidth(id: string, width: number): void {
  const listWidth = Math.round(width / 4);
  for (const [panelId, panelWidth] of [[`${id}-list`, listWidth], [`${id}-detail`, width - listWidth]] as const) {
    const panel = document.getElementById(panelId);
    if (!panel) throw new Error(`Missing panel ${panelId}`);
    Object.defineProperty(panel, "offsetWidth", { configurable: true, get: () => panelWidth });
  }
}

/** Reports a layout from the library, for example after a mount or a window resize. */
function libraryLayout(id: string, listSize: number): void {
  const layout = { [`${id}-list`]: listSize, [`${id}-detail`]: 100 - listSize };
  act(() => {
    group(id).layout = layout;
    group(id).onLayoutChanged?.(layout, { isUserInteraction: false });
  });
}

function userResize(id: string, listSize: number, requestedListSize?: number): void {
  const layout = { [`${id}-list`]: listSize, [`${id}-detail`]: 100 - listSize };
  const requestedLayout = requestedListSize === undefined
    ? undefined
    : { [`${id}-list`]: requestedListSize, [`${id}-detail`]: 100 - requestedListSize };
  act(() => {
    group(id).layout = layout;
    group(id).onLayoutChanged?.(layout, { isUserInteraction: true, ...(requestedLayout ? { requestedLayout } : {}) });
  });
}

function NarrowViewWithBack({ list, onBack }: { list: ReactNode; onBack?: () => void }): ReactNode {
  const [detailOpen, setDetailOpen] = useState(true);
  return (
    <ListDetailLayout
      id="changes"
      list={list}
      detail={<section aria-label="Diff">diff</section>}
      detailOpen={detailOpen}
      onBack={() => {
        onBack?.();
        setDetailOpen(false);
      }}
    />
  );
}

function pressBack(): void {
  const back = screen.getByRole("button", { name: "Back to list" });
  back.focus();
  expect(document.activeElement).toBe(back);
  fireEvent.click(back);
}

describe("ListDetailLayout", () => {
  beforeEach(() => {
    resizable.useLibrary = false;
    resizable.groups.clear();
    resizable.panels.clear();
    window.localStorage.clear();
    narrowMediaEvents = new EventTarget();
    narrowMedia = {
      matches: false,
      addEventListener: narrowMediaEvents.addEventListener.bind(narrowMediaEvents),
      removeEventListener: narrowMediaEvents.removeEventListener.bind(narrowMediaEvents)
    };
    vi.stubGlobal("matchMedia", vi.fn((query: string) => query === "(max-width: 839px)" ? narrowMedia : { matches: false }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders the list column and the detail inside one surface card", () => {
    renderLayout({ listLabel: "changed files" });
    const list = screen.getByRole("list", { name: "Changed files" });
    const listColumn = list.closest(".list-column");
    expect(listColumn?.id).toBe("changes-list");
    expect(listColumn?.getAttribute("data-default-size")).toBe("360px");
    expect(listColumn?.getAttribute("data-min-size")).toBe("280px");
    expect(listColumn?.getAttribute("data-max-size")).toBe("520px");
    expect(listColumn?.getAttribute("data-group-resize-behavior")).toBe("preserve-pixel-size");

    const detail = screen.getByRole("region", { name: "Diff" });
    expect(detail.parentElement?.className).toContain("detail-surface");
    expect(detail.closest(".detail-pane")?.id).toBe("changes-detail");
    expect(screen.getByTestId("group").className).toContain("list-detail");
    const separator = screen.getByRole("separator", { name: "Resize changed files" });
    expect(separator.getAttribute("data-disable-double-click")).toBe("true");
    expect(screen.queryByRole("button", { name: "Back to list" })).toBeNull();
  });

  it("leaves the detail unwrapped without the card and shows both panes in a wide window", () => {
    renderLayout({ detailCard: false, detailOpen: false });
    const detail = screen.getByRole("region", { name: "Diff" });
    expect(document.querySelector(".detail-surface")).toBeNull();
    expect(detail.parentElement?.classList.contains("detail-pane")).toBe(true);
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize list column" })).toBeTruthy();
  });

  it("shows the list or the detail with a back button in a narrow window", () => {
    narrowMedia.matches = true;
    const onBack = vi.fn();
    const view = renderLayout({ onBack });
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Diff" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();

    view.rerenderLayout({ detailOpen: true });
    expect(screen.queryByRole("list", { name: "Changed files" })).toBeNull();
    expect(screen.getByRole("region", { name: "Diff" }).parentElement?.className).toContain("detail-surface");
    const back = screen.getByRole("button", { name: "Back to list" });
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledWith();
  });

  it.each([
    {
      target: "the selected row",
      list: (
        <div role="listbox" aria-label="Changed files" tabIndex={-1}>
          <div role="option" aria-selected="false" tabIndex={-1}>README.md</div>
          <div role="option" aria-selected="true" tabIndex={-1}>App.tsx</div>
        </div>
      ),
      expected: () => screen.getByRole("option", { name: "App.tsx" })
    },
    {
      target: "the list when no row is selected",
      list: (
        <div role="listbox" aria-label="Changed files" tabIndex={-1}>
          <div role="option" aria-selected="false">README.md</div>
        </div>
      ),
      expected: () => screen.getByRole("listbox", { name: "Changed files" })
    },
    {
      target: "the list column when it has no list",
      list: <p>No changes</p>,
      expected: () => document.getElementById("changes-list")
    }
  ])("moves focus to $target after Back in a narrow window", ({ list, expected }) => {
    narrowMedia.matches = true;
    render(<NarrowViewWithBack list={list} />);
    pressBack();
    expect(screen.queryByRole("button", { name: "Back to list" })).toBeNull();
    const target = expected();
    expect(target).toBeTruthy();
    expect(document.activeElement).toBe(target);
  });

  it("keeps focus that the view moved before it closed the detail", () => {
    narrowMedia.matches = true;
    render(
      <>
        <input aria-label="Search" />
        <NarrowViewWithBack list={<p>No changes</p>} onBack={() => screen.getByRole("textbox", { name: "Search" }).focus()} />
      </>
    );
    pressBack();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }));
  });

  it("follows the window across the narrow breakpoint", () => {
    const view = renderLayout({ detailOpen: true, onBack: vi.fn() });
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to list" })).toBeNull();

    setNarrow(true);
    expect(screen.queryByRole("list", { name: "Changed files" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeTruthy();

    view.rerenderLayout({ detailOpen: false });
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();

    setNarrow(false);
    expect(screen.getByRole("region", { name: "Diff" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
  });

  it("falls back to the wide layout without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderLayout({ detailOpen: true });
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Diff" })).toBeTruthy();
  });

  it("saves only user resizes, in pixels, under the one shared key", () => {
    renderLayout();
    setGroupWidth("changes", 1200);
    libraryLayout("changes", 25);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    // 25% of 1200px is 300px, so the layout goes back to the shared 360px.
    expect(group("changes").setLayout).toHaveBeenCalledWith({ "changes-list": 30, "changes-detail": 70 });

    userResize("changes", 30, 28);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("336");
  });

  it.each([
    { stored: "420", expected: "420px" },
    { stored: "900", expected: "520px" },
    { stored: "100", expected: "280px" },
    { stored: "{not json", expected: "360px" },
    { stored: "", expected: "360px" },
    { stored: "-5", expected: "360px" }
  ])("starts a view at the shared width $stored as $expected", ({ stored, expected }) => {
    window.localStorage.setItem(STORAGE_KEY, stored);
    renderLayout({ id: "history" });
    expect(document.getElementById("history-list")?.getAttribute("data-default-size")).toBe(expected);
  });

  it("keeps a mounted view and a view that mounts later at one width after a window resize", () => {
    const view = render(<Views ids={["changes"]} />);
    setGroupWidth("changes", 1280);
    userResize("changes", 25);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("320");

    // The window is maximized. The library keeps the mounted column at 320px and saves nothing.
    setGroupWidth("changes", 1920);
    libraryLayout("changes", 16.667);
    expect(group("changes").setLayout).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("320");

    view.rerender(<Views ids={["changes", "stashes"]} />);
    expect(document.getElementById("stashes-list")?.getAttribute("data-default-size")).toBe("320px");
  });

  it("moves the column of other visible views to the same pixel width", () => {
    render(<Views ids={["changes", "stashes"]} />);
    setGroupWidth("changes", 1200);
    setGroupWidth("stashes", 1000);
    userResize("changes", 25);

    expect(group("stashes").setLayout).toHaveBeenCalledWith({ "stashes-list": 30, "stashes-detail": 70 });
    expect(group("changes").setLayout).not.toHaveBeenCalled();
  });

  it("applies a width set in another view when a hidden view shows again", () => {
    render(<Views ids={["changes", "history"]} />);
    setGroupWidth("changes", 1280);
    setGroupWidth("history", 0);
    userResize("changes", 25);
    expect(group("history").setLayout).not.toHaveBeenCalled();

    // History shows again in a wider window. The library measures it and then reports the panel size.
    setGroupWidth("history", 1600);
    act(() => resizable.panels.get("history-list")?.onResize?.());
    expect(group("history").setLayout).toHaveBeenCalledWith({ "history-list": 20, "history-detail": 80 });

    // Later panel resizes, for example while the user drags the handle, do not apply the width again.
    group("history").setLayout.mockClear();
    group("history").layout = { "history-list": 25, "history-detail": 75 };
    act(() => resizable.panels.get("history-list")?.onResize?.());
    expect(group("history").setLayout).not.toHaveBeenCalled();
  });

  it("corrects a width that the library restored from a stale group size", () => {
    window.localStorage.setItem(STORAGE_KEY, "320");
    render(<Views ids={["history"]} />);
    setGroupWidth("history", 1600);
    // The library kept the 400px that the group had before it was hidden.
    libraryLayout("history", 25);
    expect(group("history").setLayout).toHaveBeenCalledWith({ "history-list": 20, "history-detail": 80 });
  });

  it("resets the shared width in every view on a double-click on the handle", () => {
    render(<Views ids={["changes", "stashes"]} />);
    setGroupWidth("changes", 1200);
    setGroupWidth("stashes", 1200);
    userResize("changes", 25);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("300");

    const [changesSeparator] = screen.getAllByRole("separator", { name: "Resize list column" });
    fireEvent.doubleClick(changesSeparator as HTMLElement);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("360");
    expect(group("changes").setLayout).toHaveBeenLastCalledWith({ "changes-list": 30, "changes-detail": 70 });
    expect(group("stashes").setLayout).toHaveBeenLastCalledWith({ "stashes-list": 30, "stashes-detail": 70 });
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    renderLayout();
    expect(screen.getByRole("list", { name: "Changed files" })).toBeTruthy();
    expect(document.getElementById("changes-list")?.getAttribute("data-default-size")).toBe("360px");
  });

  it("keeps a width that storage refused for the rest of the session", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const first = renderLayout();
    setGroupWidth("changes", 1000);
    userResize("changes", 40);
    first.unmount();

    renderLayout({ id: "stashes" });
    expect(document.getElementById("stashes-list")?.getAttribute("data-default-size")).toBe("400px");
    setItem.mockRestore();

    setGroupWidth("stashes", 1000);
    userResize("stashes", 30);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("300");
  });

  it("mounts the real resizable panels with a saved width", () => {
    resizable.useLibrary = true;
    vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
    window.localStorage.setItem(STORAGE_KEY, "300");
    renderLayout({ listLabel: "changed files" });

    const group = document.getElementById("changes-list-detail");
    expect(group?.getAttribute("data-list-detail")).toBe("changes");
    expect(group?.getAttribute("data-layout")).toBe("wide");
    expect(document.getElementById("changes-list")?.hasAttribute("data-panel")).toBe(true);
    expect(document.getElementById("changes-detail")?.hasAttribute("data-panel")).toBe(true);
    expect(screen.getByRole("list", { name: "Changed files" }).closest(".list-column")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Diff" }).closest(".detail-surface")).toBeTruthy();
    const separator = screen.getByRole("separator", { name: "Resize changed files" });
    fireEvent.doubleClick(separator);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("360");
  });
});
