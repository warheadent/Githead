import {
  addBreadcrumb,
  captureException,
  captureMessage,
  getCurrentScope,
  init,
  metrics,
  withScope
} from "@sentry/electron/main";
import { app } from "electron";
import { configureOperationalErrorReporter } from "./operationalErrorReporter";

declare const __SENTRY_DSN__: string;
declare const __SENTRY_ENVIRONMENT__: string;
declare const __SENTRY_RELEASE__: string;

let telemetryEnabled = false;
let initialized = false;
let available = false;

export function initializeSentry(): boolean {
  if (initialized) return available;
  initialized = true;

  const dsn = process.env.SENTRY_DSN?.trim() || (typeof __SENTRY_DSN__ === "string" ? __SENTRY_DSN__ : "");
  if (!dsn) return false;

  init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      (typeof __SENTRY_ENVIRONMENT__ === "string" ? __SENTRY_ENVIRONMENT__ : "") ||
      (app.isPackaged ? "production" : "development"),
    release: process.env.SENTRY_RELEASE?.trim() || (typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : "") || `githead@${app.getVersion()}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    enableRendererProfiling: false,
    includeLocalVariables: false,
    beforeSend: (event) => telemetryEnabled ? event : null
  });
  available = true;
  return true;
}

export function setSentryTelemetryEnabled(enabled: boolean): void {
  if (enabled === telemetryEnabled) return;
  telemetryEnabled = enabled;
  if (!enabled) {
    configureOperationalErrorReporter(null);
    getCurrentScope().clearBreadcrumbs();
    return;
  }

  if (!initializeSentry()) return;

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
