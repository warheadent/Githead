import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init as initializeSentry } from "@sentry/electron/renderer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "motion/react";
import { App } from "./App";
import "./styles.css";

declare const __SENTRY_ENABLED__: boolean;

if (__SENTRY_ENABLED__) {
  initializeSentry();
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

createRoot(app).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.12, ease: "easeOut" }}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>
);
