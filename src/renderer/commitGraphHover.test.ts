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
    <g class="commit-graph-node" data-graph-hash="a" />
    <g class="commit-graph-node" data-graph-hash="b" />
    <g class="commit-graph-node" data-graph-hash="unrelated" />
    <g class="commit-graph-edge" data-graph-from="a" data-graph-to="b" />
    <g class="commit-graph-edge" data-graph-from="unrelated" data-graph-to="outside" />
  </svg>
  <div class="history-row" data-commit-hash="a"><span class="graph"></span><span class="description">Commit A</span><span class="author">Author</span><span class="date">Date</span></div>
  <div class="history-row" data-commit-hash="b"><span class="description">Commit B</span></div>
  <div class="history-row" data-commit-hash="unrelated"><span class="description">Other commit</span></div>
  </div>`;
  const svg = document.querySelector("svg")!;
  const list = document.querySelector(".history-list")!;
  const media = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal("matchMedia", () => media);
  const dispose = attachCommitGraphHover(svg);
  cleanups.push(dispose);
  const enter = (selector: string, pointerType = "mouse") => {
    const event = new MouseEvent("pointerover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    list.querySelector(selector)!.dispatchEvent(event);
    return event;
  };
  const highlighted = () => Array.from(svg.querySelectorAll("[data-graph-hover]")).map((element) => element.getAttribute("data-graph-hash") ?? `${element.getAttribute("data-graph-from")}:${element.getAttribute("data-graph-to")}`);
  return { list, svg, media, enter, highlighted, dispose };
}

describe("commit row graph hover", () => {
  it("highlights the commit and its connected lines from every column without changing selection", () => {
    const h = setup();
    for (const column of ["graph", "description", "author", "date"]) {
      expect(h.enter(`[data-commit-hash="a"] .${column}`).defaultPrevented).toBe(false);
      expect(h.highlighted()).toEqual(["a", "a:b"]);
    }
    expect(h.list.querySelector("[aria-selected=true]")).toBeNull();
    h.enter('[data-commit-hash="b"] .description');
    expect(h.highlighted()).toEqual(["b", "a:b"]);
    h.enter('[data-commit-hash="unrelated"] .description');
    expect(h.highlighted()).toEqual(["unrelated", "unrelated:outside"]);
  });

  it("clears on scroll, pointer exit, or cleanup and ignores later events", () => {
    const h = setup();
    const row = '[data-commit-hash="a"] .description';
    h.enter(row);
    h.list.dispatchEvent(new Event("scroll"));
    expect(h.highlighted()).toEqual([]);
    h.enter(row);
    h.list.dispatchEvent(new Event("pointerleave"));
    expect(h.highlighted()).toEqual([]);
    h.enter(row);
    h.dispose();
    expect(h.highlighted()).toEqual([]);
    h.enter(row);
    expect(h.highlighted()).toEqual([]);
  });

  it("ignores touch and coarse pointers and clears when hover capability changes", () => {
    const h = setup();
    const row = '[data-commit-hash="a"] .description';
    h.enter(row, "touch");
    expect(h.highlighted()).toEqual([]);
    h.media.matches = false;
    h.enter(row);
    expect(h.highlighted()).toEqual([]);
    h.media.matches = true;
    h.enter(row);
    expect(h.highlighted()).toHaveLength(2);
    h.media.matches = false;
    h.media.dispatchEvent(new Event("change"));
    expect(h.highlighted()).toEqual([]);
  });
});
