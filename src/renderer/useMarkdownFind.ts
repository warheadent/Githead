import { useEffect, useId, useMemo, useState, type RefObject } from "react";

export function collectMarkdownMatches(article: HTMLElement, query: string): Range[] {
  if (!query) return [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = "";
  let block: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || parent.closest("button, svg, .sr-only, .markdown-heading-link, .markdown-code-language, .markdown-image-status")) continue;
    const nextBlock = parent.closest("p, li, pre, h1, h2, h3, h4, h5, h6, td, th");
    if (block !== nextBlock) text += "\n";
    block = nextBlock;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const ranges: Range[] = [];
  let nodeIndex = 0;
  for (const match of text.matchAll(expression)) {
    const start = match.index;
    const end = start + match[0].length;
    while (nodeIndex < nodes.length && nodes[nodeIndex]!.end <= start) nodeIndex++;
    const first = nodes[nodeIndex];
    let lastIndex = nodeIndex;
    while (lastIndex < nodes.length && nodes[lastIndex]!.end < end) lastIndex++;
    const last = nodes[lastIndex];
    if (!first || !last || start < first.start || end > last.end) continue;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    ranges.push(range);
  }
  return ranges;
}

export function useMarkdownFind(root: RefObject<HTMLDivElement | null>, query: string, content: string | undefined) {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const names = useMemo(() => ({ all: `markdown-find-${id}`, current: `markdown-current-${id}` }), [id]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const article = root.current?.querySelector<HTMLElement>(".markdown-preview");
    setIndex(0);
    if (!article || !query) { setRanges([]); return; }
    const update = () => setRanges(collectMarkdownMatches(article, query));
    update();
    const observer = new MutationObserver(update);
    observer.observe(article, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [root, query, content]);
  const activeIndex = ranges.length ? Math.min(index, ranges.length - 1) : 0;
  useEffect(() => {
    if (typeof Highlight !== "undefined" && typeof CSS !== "undefined" && CSS.highlights) {
      CSS.highlights.set(names.all, new Highlight(...ranges));
      CSS.highlights.set(names.current, new Highlight(...(ranges[activeIndex] ? [ranges[activeIndex]] : [])));
      return () => { CSS.highlights.delete(names.all); CSS.highlights.delete(names.current); };
    }
  }, [ranges, activeIndex, names]);
  useEffect(() => {
    const range = ranges[activeIndex];
    range?.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }, [ranges, activeIndex]);
  return { names, count: ranges.length, index: ranges.length ? activeIndex + 1 : 0,
    next: (direction: number) => setIndex((current) => ranges.length ? (current + direction + ranges.length) % ranges.length : 0) };
}
