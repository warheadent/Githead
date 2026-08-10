const TELEMETRY_PREFERENCE_EVENT = "githead:telemetry-preference-changed";

export function publishTelemetryPreference(shareAnonymousDiagnostics: boolean): void {
  window.dispatchEvent(new CustomEvent<boolean>(TELEMETRY_PREFERENCE_EVENT, {
    detail: shareAnonymousDiagnostics
  }));
}

export function subscribeToTelemetryPreference(listener: (enabled: boolean) => void): () => void {
  const handlePreference = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === "boolean") {
      listener(event.detail);
    }
  };
  window.addEventListener(TELEMETRY_PREFERENCE_EVENT, handlePreference);
  return () => window.removeEventListener(TELEMETRY_PREFERENCE_EVENT, handlePreference);
}
