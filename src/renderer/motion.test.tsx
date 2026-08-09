// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MotionList, MotionPresence, MotionSwap, type MotionListItem } from "./motion";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MotionPresence", () => {
  it("makes exiting content inert until Motion removes it", async () => {
    const onExitComplete = vi.fn();
    const { container, rerender } = render(
      <MotionPresence present className="test-presence" onExitComplete={onExitComplete}>
        <button type="button">Action</button>
      </MotionPresence>
    );

    rerender(
      <MotionPresence present={false} className="test-presence" onExitComplete={onExitComplete}>
        <button type="button">Action</button>
      </MotionPresence>
    );

    const exiting = container.querySelector<HTMLElement>(".motion-presence");
    expect(exiting?.dataset.motionState).toBe("exiting");
    expect(exiting?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Action" })).toBeNull();
    await waitFor(() => expect(container.querySelector(".motion-presence")).toBeNull());
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("reverses a rapid exit without leaving content inert", () => {
    const { container, rerender } = render(
      <MotionPresence present className="test-presence"><button type="button">Action</button></MotionPresence>
    );
    rerender(
      <MotionPresence present={false} className="test-presence"><button type="button">Action</button></MotionPresence>
    );
    rerender(
      <MotionPresence present className="test-presence"><button type="button">Action</button></MotionPresence>
    );

    expect(screen.getByRole("button", { name: "Action" })).toBeTruthy();
    expect(container.querySelector(".motion-presence")?.hasAttribute("inert")).toBe(false);
  });
});

describe("MotionSwap", () => {
  it("announces replacement content and hides outgoing live regions", async () => {
    const makeItem = (value: string): { key: string; content: ReactNode } => ({
      key: value,
      content: <p role="status">{value}</p>
    });
    const { container, rerender } = render(
      <MotionSwap item={makeItem("First")} className="swap" presenceClassName="current" />
    );

    rerender(<MotionSwap item={makeItem("Second")} className="swap" presenceClassName="current" />);
    expect(screen.getByRole("status").textContent).toBe("Second");
    expect(container.querySelector(".motion-swap-outgoing")?.textContent).toBe("First");
    expect(container.querySelector(".motion-swap-outgoing")?.getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(container.querySelector(".motion-swap-outgoing")).toBeNull());
  });
});

describe("MotionList", () => {
  function makeItems(keys: readonly string[]): MotionListItem[] {
    return keys.map((key) => ({ key, content: <button type="button">{key}</button> }));
  }

  it("retains an inert removed item until its exit completes", async () => {
    const onItemExitComplete = vi.fn();
    const { rerender } = render(
      <MotionList items={makeItems(["a", "b"])} itemClassName="row" element="article" onItemExitComplete={onItemExitComplete} />
    );

    rerender(
      <MotionList items={makeItems(["b"])} itemClassName="row" element="article" onItemExitComplete={onItemExitComplete} />
    );

    const exiting = screen.getByText("a").closest("article");
    expect(exiting?.dataset.motionState).toBe("exiting");
    expect(exiting?.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "a" })).toBeNull();
    await waitFor(() => expect(screen.queryByText("a")).toBeNull());
    expect(onItemExitComplete).toHaveBeenCalledWith("a");
  });
});
