import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_APPEARANCE_MODES,
  APP_CODE_FONTS,
  APP_COLOR_THEMES,
  APP_UI_FONTS,
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  type WorkspaceTrustDialogContext,
  type WorkspaceTrustResponse
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

  // A fixed-size frameless window cannot show a radius or shadow, so the page itself takes the dialog look.
  return (
    <main
      className="workspace-trust"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-trust-title"
      aria-describedby="workspace-trust-description"
    >
      <header className="workspace-trust-header">
        <span className="notice-tile" aria-hidden="true">
          <ShieldCheck />
        </span>
        <div className="workspace-trust-heading">
          <h1 id="workspace-trust-title">Do you trust this workspace?</h1>
          <p id="workspace-trust-description">
            Githead needs your approval before it runs Git operations in this workspace.
          </p>
        </div>
      </header>

      <div className="workspace-trust-field">
        <p className="workspace-trust-label">Workspace</p>
        <p className="workspace-trust-path dialog-code-block" title={dialogContext.repoPath}>
          {dialogContext.repoPath}
        </p>
      </div>

      <div className="workspace-trust-warning">
        <TriangleAlert aria-hidden="true" />
        <p>Trusted Git operations may execute hooks, helpers, filters, or local configuration.</p>
      </div>

      <footer className="workspace-trust-footer">
        <Button type="button" variant="secondary" disabled={responding} autoFocus onClick={() => respond("cancel")}>
          Cancel
        </Button>
        <Button type="button" disabled={responding} onClick={() => respond("trust")}>
          Trust workspace
        </Button>
      </footer>
    </main>
  );
}

function readContext(params: URLSearchParams): WorkspaceTrustDialogContext {
  return {
    repoPath: params.get("repoPath") ?? "",
    appearanceMode: readEnum(params.get("appearanceMode"), APP_APPEARANCE_MODES, "system"),
    colorTheme: readEnum(params.get("colorTheme"), APP_COLOR_THEMES, "githead"),
    uiFont: readEnum(params.get("uiFont"), APP_UI_FONTS, DEFAULT_UI_FONT),
    codeFont: readEnum(params.get("codeFont"), APP_CODE_FONTS, DEFAULT_CODE_FONT),
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
