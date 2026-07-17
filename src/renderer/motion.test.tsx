// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MotionPresence, MotionSwap, useFlipList } from "./motion";

const nativeAnimateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
    window.setTimeout(() => callback(0), 1)
  ));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame));
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (nativeAnimateDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "animate", nativeAnimateDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

describe("MotionPresence", () => {
  it("reverses a rapid exit without unmounting or leaving content inert", () => {
    const { container, rerender } = render(
      <MotionPresence present className="test-presence"><button type="button">Action</button></MotionPresence>
    );
    act(() => vi.runOnlyPendingTimers());
    expect(container.querySelector(".motion-presence")?.getAttribute("data-motion-state")).toBe("entered");

    rerender(
      <MotionPresence present={false} className="test-presence"><button type="button">Action</button></MotionPresence>
    );
    const exiting = container.querySelector<HTMLElement>(".motion-presence");
    expect(exiting?.getAttribute("data-motion-state")).toBe("exiting");
    expect(exiting?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Action" })).toBeNull();

    rerender(
      <MotionPresence present className="test-presence"><button type="button">Action</button></MotionPresence>
    );
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("button", { name: "Action" })).toBeTruthy();
    expect(container.querySelector(".motion-presence")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector(".motion-presence")?.getAttribute("data-motion-state")).toBe("entered");
  });

  it("cleans scheduled enter and exit work on unmount", () => {
    const { rerender, unmount } = render(
      <MotionPresence present className="test-presence">Content</MotionPresence>
    );
    rerender(<MotionPresence present={false} className="test-presence">Content</MotionPresence>);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles entering content when animation frames are throttled", () => {
    window.requestAnimationFrame = vi.fn(() => 1);
    const { container } = render(
      <MotionPresence present className="test-presence">Content</MotionPresence>
    );
    expect(container.querySelector(".motion-presence")?.getAttribute("data-motion-state")).toBe("entering");

    act(() => vi.advanceTimersByTime(34));
    expect(container.querySelector(".motion-presence")?.getAttribute("data-motion-state")).toBe("entered");
  });
});

describe("MotionSwap", () => {
  it("announces replacement content immediately and cleans rapid outgoing layers", () => {
    const makeItem = (value: string): { key: string; content: ReactNode } => ({
      key: value,
      content: <p role="status">{value}</p>
    });
    const { container, rerender } = render(
      <MotionSwap item={makeItem("First")} className="swap" presenceClassName="current" />
    );
    act(() => vi.runOnlyPendingTimers());

    rerender(<MotionSwap item={makeItem("Second")} className="swap" presenceClassName="current" />);
    expect(screen.getByRole("status").textContent).toBe("Second");
    expect(container.querySelector(".motion-swap-outgoing")?.textContent).toBe("First");

    rerender(<MotionSwap item={makeItem("Third")} className="swap" presenceClassName="current" />);
    expect(screen.getByRole("status").textContent).toBe("Third");
    expect(container.querySelector(".motion-swap-outgoing")?.textContent).toBe("Second");
    act(() => vi.runOnlyPendingTimers());
    expect(container.querySelector(".motion-swap-outgoing")).toBeNull();
  });
});

describe("useFlipList", () => {
  it("animates moved rows, cancels superseded work, and cleans removed rows", () => {
    const animations: Array<{ cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }> = [];
    const animate = vi.fn(() => {
      const animation = { cancel: vi.fn(), finished: new Promise<void>(() => undefined) };
      animations.push(animation);
      return animation as unknown as Animation;
    });
    vi.stubGlobal("Animation", class AnimationMock {});
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
      const top = index * 40;
      return { x: 0, y: top, top, left: 0, right: 200, bottom: top + 32, width: 200, height: 32, toJSON: () => ({}) };
    });

    function Harness(): ReactNode {
      const [order, setOrder] = useState(["a", "b"]);
      const elementsRef = useRef(new Map<string, HTMLElement>());
      const capture = useFlipList(order, elementsRef);
      const update = (next: string[]): void => {
        capture();
        setOrder(next);
      };
      return <div>
        <button type="button" onClick={() => update([...order].reverse())}>Reverse</button>
        <button type="button" onClick={() => update(order.filter((key) => key !== "a"))}>Remove</button>
        <div>{order.map((key) => <div key={key} ref={(element) => { if (element) elementsRef.current.set(key, element); else elementsRef.current.delete(key); }}>{key}</div>)}</div>
      </div>;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateY(40px)" }, { transform: "translateY(0)" }],
      { duration: 120, easing: "ease" }
    );

    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(animate).toHaveBeenCalledTimes(4);
    expect(animations[0]?.cancel).toHaveBeenCalledTimes(1);
    expect(animations[1]?.cancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(animations.some((animation) => animation.cancel.mock.calls.length > 0)).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(animations.at(-1)?.cancel).toHaveBeenCalledTimes(1);
  });

  it("uses opacity-only feedback for moved rows with reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise<void>(() => undefined) } as unknown as Animation));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
      const top = index * 40;
      return { x: 0, y: top, top, left: 0, right: 200, bottom: top + 32, width: 200, height: 32, toJSON: () => ({}) };
    });

    function Harness(): ReactNode {
      const [order, setOrder] = useState(["a", "b"]);
      const elementsRef = useRef(new Map<string, HTMLElement>());
      const capture = useFlipList(order, elementsRef);
      return <div>
        <button type="button" onClick={() => { capture(); setOrder(["b", "a"]); }}>Reverse</button>
        <div>{order.map((key) => <div key={key} ref={(element) => { if (element) elementsRef.current.set(key, element); else elementsRef.current.delete(key); }}>{key}</div>)}</div>
      </div>;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0.92 }, { opacity: 1 }],
      { duration: 120, easing: "ease" }
    );
  });
});
