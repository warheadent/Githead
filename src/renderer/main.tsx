import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init as initializeSentry } from "@sentry/electron/renderer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "motion/react";
import { App } from "./App";
import { reportRendererFailure } from "./operationalErrorReporter";
import "./styles.css";

declare const __SENTRY_ENABLED__: boolean;

if (__SENTRY_ENABLED__) {
  initializeSentry({
    beforeBreadcrumb: (breadcrumb) => breadcrumb.category?.startsWith("githead.") ? breadcrumb : null
  });
}

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

createRoot(app, {
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
