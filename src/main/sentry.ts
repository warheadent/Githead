import { init } from "@sentry/electron/main";
import { app } from "electron";

declare const __SENTRY_DSN__: string;
declare const __SENTRY_ENVIRONMENT__: string;
declare const __SENTRY_RELEASE__: string;

export function initializeSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim() || __SENTRY_DSN__;
  if (!dsn) {
    return;
  }

  init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      __SENTRY_ENVIRONMENT__ ||
      (app.isPackaged ? "production" : "development"),
    release: process.env.SENTRY_RELEASE?.trim() || __SENTRY_RELEASE__ || `githead@${app.getVersion()}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    enableRendererProfiling: false,
    includeLocalVariables: false
  });
}
