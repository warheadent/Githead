import type { AppSettings } from "../shared/types";
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyVisualEffects, defaultVisualPreferences } from "./VisualEffects";
import { App } from "./App";
import { reportRendererFailure } from "./operationalErrorReporter";
import { setRendererTelemetryEnabled } from "./sentry";
import { subscribeToTelemetryPreference } from "./telemetryPreference";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

function handleReactError(
  error: unknown,
  kind: "react-caught" | "react-recoverable" | "react-uncaught",
  level: "warning" | "error"
): void {
  reportRendererFailure(error, kind, level);
  console.error(`React ${kind} error.`, error);
}

async function startRenderer(appRoot: HTMLDivElement): Promise<void> {
  let initialAppSettings: AppSettings | null = null;
  try {
    const settings = await window.githead.getAppSettings();
    setRendererTelemetryEnabled(settings.privacy.shareAnonymousDiagnostics);
    applyVisualEffects(settings.visualEffects, settings.reduceMotion);
    initialAppSettings = settings;
  } catch {
    setRendererTelemetryEnabled(false);
    applyVisualEffects(defaultVisualPreferences.visualEffects, defaultVisualPreferences.reduceMotion);
  }
  subscribeToTelemetryPreference(setRendererTelemetryEnabled);

  createRoot(appRoot, {
    onCaughtError: (error) => handleReactError(error, "react-caught", "warning"),
    onRecoverableError: (error) => handleReactError(error, "react-recoverable", "warning"),
    onUncaughtError: (error) => handleReactError(error, "react-uncaught", "error")
  }).render(
    <StrictMode>
      <TooltipProvider>
        <App initialAppSettings={initialAppSettings} />
      </TooltipProvider>
    </StrictMode>
  );
}

void startRenderer(app);
