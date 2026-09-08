import GithubSlugger from "github-slugger";
import type { Root as MarkdownRoot, Nodes as MarkdownNode } from "mdast";
import type { Root, Element, Nodes } from "hast";

export interface MarkdownHeading { id: string; text: string; depth: number }

function nodeText(node: Nodes): string {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "img") return String(node.properties.alt ?? "");
  return "children" in node ? node.children.map(nodeText).join("") : "";
}

export function remarkAlerts() {
  return (tree: MarkdownRoot): void => {
    function visit(node: MarkdownNode): void {
      if (node.type === "blockquote") {
        const first = node.children[0];
        const text = first?.type === "paragraph" ? first.children[0] : null;
        const match = text?.type === "text" ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/.exec(text.value) : null;
        if (match && text?.type === "text") {
          const kind = match[1]!.toLowerCase();
          text.value = text.value.slice(match[0].length);
          node.data = { ...node.data, hProperties: { className: ["markdown-alert", `markdown-alert-${kind}`] } };
          node.children.unshift({ type: "paragraph", data: { hProperties: { className: ["markdown-alert-title"] } }, children: [{ type: "text", value: kind[0]!.toUpperCase() + kind.slice(1) }] });
        }
      }
      if ("children" in node) node.children.forEach(visit);
    }
    visit(tree);
  };
}

export function rehypeMarkdownNavigation(options: { prefix: string; headings: MarkdownHeading[] }) {
  return (tree: Root): void => {
    const slugger = new GithubSlugger();
    options.headings.length = 0;
    function visit(node: Nodes): void {
      if (node.type === "element") {
        const line = node.position?.start.line;
        if (line) node.properties["data-source-line"] = line;
        if (/^h[1-6]$/.test(node.tagName)) {
          const text = nodeText(node);
          const id = slugger.slug(text);
          node.properties.id = `${options.prefix}${id}`;
          node.properties["data-heading-id"] = id;
          node.properties.tabIndex = -1;
          node.properties.ariaLabel = text;
          options.headings.push({ id, text, depth: Number(node.tagName[1]) });
          const link: Element = { type: "element", tagName: "a", properties: { href: `#${encodeURIComponent(id)}`, className: ["markdown-heading-link"], ariaLabel: `Link to ${text}` }, children: [{ type: "text", value: "#" }] };
          node.children.push(link);
        }
      }
      if ("children" in node) node.children.forEach(visit);
    }
    visit(tree);
  };
}

export function scrollToMarkdownHeading(root: ParentNode | null, target: string): void {
  const heading = Array.from(root?.querySelectorAll<HTMLElement>("[data-heading-id]") ?? [])
    .find((element) => element.dataset.headingId === target);
  if (heading) scrollWithinMarkdown(heading, "start");
  heading?.focus({ preventScroll: true });
}

export function scrollWithinMarkdown(element: HTMLElement, block: "start" | "center"): void {
  const scroller = element.closest<HTMLElement>(".markdown-document-scroll");
  if (!scroller) { element.scrollIntoView({ block }); return; }
  const target = element.getBoundingClientRect();
  const viewport = scroller.getBoundingClientRect();
  const offset = block === "center" ? (scroller.clientHeight - target.height) / 2 : 16;
  scroller.scrollTop += target.top - viewport.top - offset;
}
