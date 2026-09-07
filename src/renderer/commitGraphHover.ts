/** Observe commit rows without taking pointer events away from selection or menus. */
export function attachCommitGraphHover(svg: SVGSVGElement): () => void {
  const list = svg.closest<HTMLElement>(".history-list");
  if (!list) return () => undefined;
  const media = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  if (!media) return () => undefined;
  const targetsByHash = new Map<string, Set<Element>>();
  for (const node of svg.querySelectorAll(".commit-graph-node[data-graph-hash]")) {
    targetsByHash.set(node.getAttribute("data-graph-hash")!, new Set([node]));
  }
  for (const edge of svg.querySelectorAll(".commit-graph-edge[data-graph-from][data-graph-to]")) {
    targetsByHash.get(edge.getAttribute("data-graph-from")!)?.add(edge);
    targetsByHash.get(edge.getAttribute("data-graph-to")!)?.add(edge);
  }
  let highlighted = new Set<Element>();
  let hoveredHash: string | null = null;
  const show = (hash: string | null): void => {
    if (hash === hoveredHash) return;
    const next = hash ? targetsByHash.get(hash) ?? new Set<Element>() : new Set<Element>();
    for (const element of highlighted) if (!next.has(element)) element.removeAttribute("data-graph-hover");
    for (const element of next) if (!highlighted.has(element)) element.setAttribute("data-graph-hover", "true");
    highlighted = next;
    hoveredHash = hash;
  };
  const clear = (): void => show(null);
  const enter = (event: PointerEvent): void => {
    if (!media.matches || event.pointerType !== "mouse") { clear(); return; }
    const row = event.target instanceof Element
      ? event.target.closest(".history-row[data-commit-hash]")
      : null;
    show(row && list.contains(row) ? row.getAttribute("data-commit-hash") : null);
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") clear();
  };

  list.addEventListener("pointerover", enter, { passive: true });
  list.addEventListener("pointerleave", clear);
  list.addEventListener("scroll", clear, true);
  list.addEventListener("pointerdown", pointerDown);
  window.addEventListener("blur", clear);
  media.addEventListener("change", clear);
  return () => {
    clear();
    list.removeEventListener("pointerover", enter);
    list.removeEventListener("pointerleave", clear);
    list.removeEventListener("scroll", clear, true);
    list.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("blur", clear);
    media.removeEventListener("change", clear);
  };
}
