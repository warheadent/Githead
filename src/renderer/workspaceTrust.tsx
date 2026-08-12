import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  WorkspaceTrustDialogContext,
  WorkspaceTrustResponse
} from "../shared/types";
import "./workspaceTrust.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Workspace trust dialog root was not found.");
}

const context = readContext(new URLSearchParams(window.location.search));
applyAppearance(context);

function WorkspaceTrustDialog({ dialogContext }: { dialogContext: WorkspaceTrustDialogContext }): ReactNode {
  const [responding, setResponding] = useState(false);
  const respondedRef = useRef(false);

  const respond = useCallback((response: WorkspaceTrustResponse): void => {
    if (respondedRef.current) return;
    respondedRef.current = true;
    setResponding(true);
    window.workspaceTrust.respond(response);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") respond("cancel");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [respond]);

  return (
    <main
      className="flex h-full flex-col bg-popover text-popover-foreground"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-trust-title"
      aria-describedby="workspace-trust-description"
    >
      <section className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-5">
        <header className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 id="workspace-trust-title" className="text-xl font-semibold tracking-[-0.015em]">
              Do you trust this workspace?
            </h1>
            <p id="workspace-trust-description" className="text-sm leading-5 text-muted-foreground">
              Githead needs your approval before it runs Git operations in this workspace.
            </p>
          </div>
        </header>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Workspace</p>
          <p className="truncate rounded-md border bg-muted/50 px-3 py-2.5 font-mono text-sm" title={dialogContext.repoPath}>
            {dialogContext.repoPath}
          </p>
        </div>

        <div className="flex gap-3 rounded-md border bg-muted/35 px-3 py-3 text-sm leading-5 text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
          <p>Trusted Git operations may execute hooks, helpers, filters, or local configuration.</p>
        </div>
      </section>

      <footer className="flex justify-end gap-2 border-t bg-muted/25 px-6 py-4">
        <Button type="button" variant="outline" disabled={responding} autoFocus onClick={() => respond("cancel")}>
          Cancel
        </Button>
        <Button type="button" disabled={responding} onClick={() => respond("trust")}>
          Trust Workspace
        </Button>
      </footer>
    </main>
  );
}

function readContext(params: URLSearchParams): WorkspaceTrustDialogContext {
  return {
    repoPath: params.get("repoPath") ?? "",
    appearanceMode: readEnum(params.get("appearanceMode"), ["system", "light", "dark"], "system"),
    colorTheme: readEnum(params.get("colorTheme"), ["githead", "tidepool", "ember", "orchid", "evergreen", "rosewood", "glacier", "sunbeam", "graphite", "copper", "sakura", "midnight"], "githead"),
    uiFont: readEnum(params.get("uiFont"), ["system", "inter", "ibm-plex-sans", "roboto"], "inter"),
    codeFont: readEnum(params.get("codeFont"), ["system-mono", "jetbrains-mono", "fira-code", "source-code-pro", "ibm-plex-mono"], "system-mono"),
    zoomFactor: readZoomFactor(params.get("zoomFactor"))
  };
}

function readEnum<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value && values.includes(value as T) ? value as T : fallback;
}

function readZoomFactor(value: string | null): number {
  const zoomFactor = Number(value);
  return Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
}

function applyAppearance(dialogContext: WorkspaceTrustDialogContext): void {
  document.documentElement.dataset.theme = dialogContext.colorTheme;
  document.documentElement.dataset.uiFont = dialogContext.uiFont;
  document.documentElement.dataset.codeFont = dialogContext.codeFont;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = (): void => {
    document.documentElement.classList.toggle(
      "dark",
      dialogContext.appearanceMode === "dark" || (dialogContext.appearanceMode === "system" && media.matches)
    );
  };
  sync();
  if (dialogContext.appearanceMode === "system") media.addEventListener("change", sync);
}

createRoot(app).render(
  <StrictMode>
    <WorkspaceTrustDialog dialogContext={context} />
  </StrictMode>
);
