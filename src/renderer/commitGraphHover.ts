/** Observe the list without taking pointer events away from its commit rows. */
export function attachCommitGraphHover(svg: SVGSVGElement): () => void {
  const list = svg.closest<HTMLElement>(".history-list");
  if (!list) return () => undefined;
  const media = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  if (!media) return () => undefined;
  const nodes = Array.from(svg.querySelectorAll<SVGCircleElement>(".commit-graph-node-hit")).map((hit) => ({
    hit,
    group: hit.parentElement!,
    hash: hit.parentElement!.getAttribute("data-graph-hash")
  }));
  const edges = Array.from(svg.querySelectorAll<SVGPathElement>(".commit-graph-edge-hit")).map((hit) => ({
    hit,
    group: hit.parentElement!,
    from: hit.parentElement!.getAttribute("data-graph-from"),
    to: hit.parentElement!.getAttribute("data-graph-to")
  }));
  let highlighted = new Set<Element>();
  let frame: number | null = null;
  let pointer: PointerEvent | null = null;

  const show = (next: Set<Element>): void => {
    for (const element of highlighted) if (!next.has(element)) element.removeAttribute("data-graph-hover");
    for (const element of next) if (!highlighted.has(element)) element.setAttribute("data-graph-hover", "true");
    highlighted = next;
  };
  const clear = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    pointer = null;
    show(new Set());
  };
  const update = (): void => {
    frame = null;
    if (!pointer) return;
    const bounds = svg.getBoundingClientRect();
    if (pointer.clientX < bounds.left || pointer.clientX > bounds.right || pointer.clientY < bounds.top || pointer.clientY > bounds.bottom) {
      show(new Set());
      return;
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) { clear(); return; }
    const point = svg.createSVGPoint();
    point.x = pointer.clientX;
    point.y = pointer.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const node = nodes.find(({ hit }) => hit.isPointInFill(local));
    const next = new Set<Element>();
    if (node) {
      next.add(node.group);
      for (const edge of edges) if (edge.from === node.hash || edge.to === node.hash) next.add(edge.group);
    } else {
      // Last painted edge wins at a crossing, matching the visible track.
      const edge = edges.findLast(({ hit }) => hit.isPointInStroke(local));
      if (edge) {
        next.add(edge.group);
        for (const endpoint of nodes) if (endpoint.hash === edge.from || endpoint.hash === edge.to) next.add(endpoint.group);
      }
    }
    show(next);
  };
  const move = (event: PointerEvent): void => {
    if (!media.matches || event.pointerType !== "mouse") { clear(); return; }
    pointer = event;
    if (frame === null) frame = window.requestAnimationFrame(update);
  };

  const pointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") clear();
  };

  list.addEventListener("pointermove", move, { passive: true });
  list.addEventListener("pointerleave", clear);
  list.addEventListener("scroll", clear, true);
  list.addEventListener("pointerdown", pointerDown);
  window.addEventListener("blur", clear);
  media.addEventListener("change", clear);
  return () => {
    clear();
    list.removeEventListener("pointermove", move);
    list.removeEventListener("pointerleave", clear);
    list.removeEventListener("scroll", clear, true);
    list.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("blur", clear);
    media.removeEventListener("change", clear);
  };
}
