import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";

interface RenderedDiagram {
  svg: string;
  bindFunctions?: ((element: Element) => void) | undefined;
}

type DiagramState =
  | { status: "loading" }
  | { status: "ready"; diagram: RenderedDiagram }
  | { status: "error"; message: string };

let renderQueue = Promise.resolve();
const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function getThemeSnapshot(): string {
  return getDiagramTheme();
}

function subscribeToTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      for (const currentListener of themeListeners) currentListener();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = null;
    }
  };
}

function getDiagramTheme(): "dark" | "default" {
  return document.documentElement.classList.contains("dark") ? "dark" : "default";
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The diagram syntax is not valid.";
  const firstLine = error.message.split(/\r?\n/, 1)[0]?.trim();
  return firstLine || "The diagram syntax is not valid.";
}

function renderDiagram(id: string, definition: string, theme: "dark" | "default"): Promise<RenderedDiagram> {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme
    });
    return mermaid.render(id, definition);
  });

  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}

export function MermaidDiagram({ definition, fallback }: { definition: string; fallback: ReactNode }): ReactNode {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const themeSnapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot);
  const [state, setState] = useState<DiagramState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    void renderDiagram(diagramId, definition, getDiagramTheme()).then(
      (diagram) => {
        if (active) setState({ status: "ready", diagram });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", message: getErrorMessage(error) });
      }
    );

    return () => {
      active = false;
    };
  }, [definition, diagramId, themeSnapshot]);

  if (state.status === "loading") {
    return <div className="markdown-mermaid-status" role="status">Rendering Mermaid diagram...</div>;
  }

  if (state.status === "error") {
    return (
      <div className="markdown-mermaid-error">
        <p role="alert">Unable to render Mermaid diagram. {state.message}</p>
        {fallback}
      </div>
    );
  }

  return (
    <div
      className="markdown-mermaid"
      role="img"
      aria-label="Mermaid diagram"
      ref={(element) => {
        if (element) state.diagram.bindFunctions?.(element);
      }}
      dangerouslySetInnerHTML={{ __html: state.diagram.svg }}
    />
  );
}
