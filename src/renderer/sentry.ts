import {
  getClient,
  getCurrentScope,
  init
} from "@sentry/electron/renderer";

declare const __SENTRY_ENABLED__: boolean;

let telemetryEnabled = false;

export function setRendererTelemetryEnabled(enabled: boolean): void {
  const buildEnabled = typeof __SENTRY_ENABLED__ === "boolean" && __SENTRY_ENABLED__;
  const nextEnabled = buildEnabled && enabled;
  if (nextEnabled === telemetryEnabled) return;
  telemetryEnabled = nextEnabled;

  if (!nextEnabled) {
    getCurrentScope().clearBreadcrumbs();
    const client = getClient();
    if (client) {
      client.getOptions().enabled = false;
      void client.close(0);
    }
    return;
  }

  init({
    beforeBreadcrumb: (breadcrumb) => breadcrumb.category?.startsWith("githead.") ? breadcrumb : null,
    beforeSend: (event) => telemetryEnabled ? event : null
  });
}

export function isRendererTelemetryEnabled(): boolean {
  return telemetryEnabled;
}
