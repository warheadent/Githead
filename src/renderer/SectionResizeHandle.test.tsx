// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SectionResizeHandle, usePersistentSectionHeight } from "./SectionResizeHandle";

const STORAGE_KEY = "test.section-height";

function Harness({ maxHeight = 300 }: { maxHeight?: number }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = usePersistentSectionHeight(STORAGE_KEY);
  return (
    <>
      <div ref={ref} data-testid="section" style={height === null ? undefined : { maxHeight: height }} />
      <SectionResizeHandle
        label="Resize section"
        targetRef={ref}
        height={height}
        minHeight={40}
        getMaxHeight={() => maxHeight}
        onHeightChange={setHeight}
      />
    </>
  );
}

function mockSectionHeight(height: number): void {
  vi.spyOn(screen.getByTestId("section"), "getBoundingClientRect").mockReturnValue({ height } as DOMRect);
}

describe("SectionResizeHandle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true)
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("drags the section height within its bounds and saves it on release", () => {
    render(<Harness />);
    mockSectionHeight(100);
    const handle = screen.getByRole("separator", { name: "Resize section" });
    const section = screen.getByTestId("section");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 260 });
    expect(section.style.maxHeight).toBe("160px");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 900 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 900 });
    expect(section.style.maxHeight).toBe("300px");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("300");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
  });

  it("resizes with the keyboard and resets on double-click", () => {
    render(<Harness />);
    mockSectionHeight(100);
    const handle = screen.getByRole("separator", { name: "Resize section" });
    const section = screen.getByTestId("section");

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("116");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(section.style.maxHeight).toBe("40px");

    fireEvent.doubleClick(handle);
    expect(section.style.maxHeight).toBe("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("restores a saved height", () => {
    window.localStorage.setItem(STORAGE_KEY, "220");
    render(<Harness />);
    expect(screen.getByTestId("section").style.maxHeight).toBe("220px");
  });
});
