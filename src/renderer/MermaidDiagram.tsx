import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownMediaViewer } from "./MarkdownMediaViewer";

type DiagramState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

// Pele colors diagrams through these variables (set in styles.css), so theme changes need no re-render.
const THEME_VARIABLES = [
  "--pele-bg", "--pele-fg", "--pele-muted", "--pele-line", "--pele-surface", "--pele-surface-alt",
  "--pele-border", "--pele-accent", "--pele-critical"
] as const;

const fontListeners = new Set<() => void>();
let fontObserver: MutationObserver | null = null;

function getFontSnapshot(): string {
  const { uiFont = "", codeFont = "" } = document.documentElement.dataset;
  return `${uiFont}|${codeFont}`;
}

function subscribeToFonts(listener: () => void): () => void {
  fontListeners.add(listener);
  if (!fontObserver) {
    fontObserver = new MutationObserver(() => {
      for (const currentListener of fontListeners) currentListener();
    });
    fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-font", "data-code-font"] });
  }

  return () => {
    fontListeners.delete(listener);
    if (fontListeners.size === 0) {
      fontObserver?.disconnect();
      fontObserver = null;
    }
  };
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The diagram syntax is not valid.";
  const firstLine = error.message.split(/\r?\n/, 1)[0]?.trim();
  return firstLine || "The diagram syntax is not valid.";
}

async function renderDiagram(element: HTMLElement, idPrefix: string, definition: string): Promise<string> {
  // Pele measures labels when it lays out the diagram, so wait for pending web fonts first.
  const [{ renderAsync }] = await Promise.all([import("pele/lazy"), "fonts" in document ? document.fonts.ready : undefined]);
  const style = getComputedStyle(element);
  const result = await renderAsync(definition, {
    idPrefix,
    fontFamily: style.fontFamily,
    fontFamilyMono: style.getPropertyValue("--font-code").trim() || "monospace",
    // Like Mermaid's strict security level: diagrams cannot navigate or load remote images.
    links: false,
    images: false
  });
  return result.svg;
}

// The expanded viewer shows the SVG as an image, which cannot inherit the page's CSS variables.
function withResolvedTheme(svg: string, element: Element | null): string {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (element && root instanceof SVGSVGElement) {
    const style = getComputedStyle(element);
    for (const name of THEME_VARIABLES) {
      const value = style.getPropertyValue(name).trim();
      if (value) root.style.setProperty(name, value);
    }
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(parsed))}`;
}

export function MermaidDiagram({ definition, fallback }: { definition: string; fallback: ReactNode }): ReactNode {
  const reactId = useId();
  const idPrefix = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const fontSnapshot = useSyncExternalStore(subscribeToFonts, getFontSnapshot);
  const root = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [state, setState] = useState<DiagramState>({ status: "loading" });

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let active = true;

    void renderDiagram(element, idPrefix, definition).then(
      (svg) => {
        if (active) setState({ status: "ready", svg });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", message: getErrorMessage(error) });
      }
    );

    return () => {
      active = false;
    };
  }, [definition, idPrefix, fontSnapshot]);

  if (state.status === "loading") {
    return <div ref={root} className="markdown-mermaid-status" role="status">Rendering Mermaid diagram...</div>;
  }

  if (state.status === "error") {
    return (
      <div ref={root} className="markdown-mermaid-error">
        <p role="alert">Unable to render Mermaid diagram. {state.message}</p>
        {fallback}
      </div>
    );
  }

  return (
    <div ref={root} className="markdown-mermaid-frame">
      <div className="markdown-mermaid-toolbar">
        <span>Mermaid</span>
        <Button type="button" variant="ghost" size="sm" aria-pressed={showSource} onClick={() => setShowSource(!showSource)}>{showSource ? "Show diagram" : "Show source"}</Button>
        <MarkdownMediaViewer src={() => withResolvedTheme(state.svg, root.current)} label="Mermaid diagram" kind="diagram" />
      </div>
      {showSource ? fallback : <div
        className="markdown-mermaid"
        role="img"
        aria-label="Mermaid diagram"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />}
    </div>
  );
}
