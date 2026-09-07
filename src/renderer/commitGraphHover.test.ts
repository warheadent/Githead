// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { attachCommitGraphHover } from "./commitGraphHover";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function setup() {
  document.body.innerHTML = `<div class="history-list"><svg>
    <g data-graph-hash="a"><circle class="commit-graph-node-hit" /></g>
    <g data-graph-hash="b"><circle class="commit-graph-node-hit" /></g>
    <g data-graph-hash="unrelated"><circle class="commit-graph-node-hit" /></g>
    <g data-graph-from="a" data-graph-to="b"><path class="commit-graph-edge-hit" /></g>
    <g data-graph-from="unrelated" data-graph-to="outside"><path class="commit-graph-edge-hit" /></g>
  </svg></div>`;
  const svg = document.querySelector("svg")!;
  const list = document.querySelector(".history-list")!;
  const frames: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const media = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal("matchMedia", () => media);
  Object.assign(svg, {
    getBoundingClientRect: () => new DOMRect(100, 50, 82, 200),
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x - 100, y: this.y - 50 }; } })
  });
  const nodeHits = Array.from(svg.querySelectorAll("circle")).map((circle) => {
    const hit = vi.fn(() => false);
    Object.assign(circle, { isPointInFill: hit });
    return hit;
  });
  const edgeHits = Array.from(svg.querySelectorAll("path")).map((path) => {
    const hit = vi.fn(() => false);
    Object.assign(path, { isPointInStroke: hit });
    return hit;
  });
  const dispose = attachCommitGraphHover(svg);
  cleanups.push(dispose);
  const move = (clientX = 114, clientY = 64, pointerType = "mouse") => {
    const event = new MouseEvent("pointermove", { clientX, clientY, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    list.dispatchEvent(event);
    return event;
  };
  const highlighted = () => Array.from(svg.querySelectorAll("[data-graph-hover]")).map((element) => element.getAttribute("data-graph-hash") ?? `${element.getAttribute("data-graph-from")}:${element.getAttribute("data-graph-to")}`);
  return { list, frames, request, cancel, media, nodeHits, edgeHits, move, highlighted, dispose };
}

describe("commit graph hover", () => {
  it("batches pointer movement and highlights only the hit node and its connected edges", () => {
    const h = setup();
    h.nodeHits[0]!.mockReturnValue(true);
    h.move(120, 70);
    expect(h.move().defaultPrevented).toBe(false);
    expect(h.request).toHaveBeenCalledTimes(1);
    h.frames[0]!(0);
    expect(h.nodeHits[0]).toHaveBeenCalledWith({ x: 14, y: 14 });
    expect(h.highlighted()).toEqual(["a", "a:b"]);
    expect(h.request).toHaveBeenCalledTimes(1); // No animation loop after settling.
    h.move(300, 64);
    h.frames[1]!(0);
    expect(h.highlighted()).toEqual([]);
  });

  it("lights an edge and its visible endpoints, then clears on scroll or cleanup", () => {
    const h = setup();
    h.edgeHits[0]!.mockReturnValue(true);
    h.move();
    h.frames[0]!(0);
    expect(h.highlighted()).toEqual(["a", "b", "a:b"]);
    h.move();
    h.list.dispatchEvent(new Event("scroll"));
    expect(h.cancel).toHaveBeenCalledWith(2);
    expect(h.highlighted()).toEqual([]);
    h.move();
    h.frames[2]!(0);
    expect(h.highlighted()).toHaveLength(3);
    h.dispose();
    expect(h.highlighted()).toEqual([]);
    h.move();
    expect(h.request).toHaveBeenCalledTimes(3);
  });

  it("ignores touch and coarse pointers and clears when hover capability changes", () => {
    const h = setup();
    h.nodeHits[0]!.mockReturnValue(true);
    h.move(114, 64, "touch");
    expect(h.request).not.toHaveBeenCalled();
    h.media.matches = false;
    h.move();
    expect(h.request).not.toHaveBeenCalled();
    h.media.matches = true;
    h.move();
    h.frames[0]!(0);
    expect(h.highlighted()).toHaveLength(2);
    h.media.matches = false;
    h.media.dispatchEvent(new Event("change"));
    expect(h.highlighted()).toEqual([]);
  });
});
