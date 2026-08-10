import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "motion/react";
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
  try {
    const settings = await window.githead.getAppSettings();
    setRendererTelemetryEnabled(settings.privacy.shareAnonymousDiagnostics);
  } catch {
    setRendererTelemetryEnabled(false);
  }
  subscribeToTelemetryPreference(setRendererTelemetryEnabled);

  createRoot(appRoot, {
    onCaughtError: (error) => handleReactError(error, "react-caught", "warning"),
    onRecoverableError: (error) => handleReactError(error, "react-recoverable", "warning"),
    onUncaughtError: (error) => handleReactError(error, "react-uncaught", "error")
  }).render(
    <StrictMode>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.12, ease: "easeOut" }}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </MotionConfig>
    </StrictMode>
  );
}

void startRenderer(app);
