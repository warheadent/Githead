import {
  addBreadcrumb,
  captureException,
  captureMessage,
  init,
  metrics,
  withScope
} from "@sentry/electron/main";
import { app } from "electron";
import { configureOperationalErrorReporter } from "./operationalErrorReporter";

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

  configureOperationalErrorReporter({
    addBreadcrumb,
    countMetric: (name, attributes) => metrics.count(name, 1, { attributes }),
    captureException: (error, context) => {
      withScope((scope) => {
        scope.setLevel(context.level);
        scope.setFingerprint(context.fingerprint);
        scope.setTags(context.tags);
        captureException(error);
      });
    },
    captureMessage: (message, context) => {
      withScope((scope) => {
        scope.setLevel(context.level);
        scope.setFingerprint(context.fingerprint);
        scope.setTags(context.tags);
        captureMessage(message);
      });
    }
  });
}
