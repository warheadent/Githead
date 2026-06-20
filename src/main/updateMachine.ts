import type { AppUpdateReleaseNotes, AppUpdateState, AppUpdateStatus } from "../shared/types";

export function createInitialAppUpdateState(currentVersion: string): AppUpdateState {
  return {
    enabled: false,
    status: "disabled",
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false
  };
}

export function enableAppUpdateState(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    enabled: true,
    status: "idle",
    message: null,
    errorContext: null,
    canRetry: false
  };
}

export function disableAppUpdateState(state: AppUpdateState, message: string): AppUpdateState {
  return {
    ...state,
    enabled: false,
    status: "disabled",
    message,
    releaseNotes: null,
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnCheckStart(
  state: AppUpdateState,
  checkedAt: string
): AppUpdateState {
  return {
    ...state,
    status: "checking",
    checkedAt,
    message: null,
    downloadPercent: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnCheckFailure(
  state: AppUpdateState,
  message: string,
  checkedAt: string
): AppUpdateState {
  return {
    ...state,
    status: "error",
    message,
    checkedAt,
    downloadPercent: null,
    errorContext: "check",
    canRetry: true
  };
}

export function reduceAppUpdateStateOnUpdateAvailable(
  state: AppUpdateState,
  version: string,
  checkedAt: string
): AppUpdateState {
  return {
    ...state,
    status: "available",
    availableVersion: version,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt,
    message: null,
    releaseNotes: getReleaseNotesForVersion(state, version) ?? createReleaseNotesForVersion(version),
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnNoUpdate(
  state: AppUpdateState,
  checkedAt: string
): AppUpdateState {
  return {
    ...state,
    status: "up-to-date",
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt,
    message: null,
    releaseNotes: null,
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnDownloadStart(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    status: "downloading",
    downloadPercent: 0,
    message: null,
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnDownloadProgress(
  state: AppUpdateState,
  percent: number
): AppUpdateState {
  return {
    ...state,
    status: "downloading",
    downloadPercent: Math.max(0, Math.min(100, percent)),
    message: null,
    errorContext: null,
    canRetry: false
  };
}

export function reduceAppUpdateStateOnDownloadFailure(
  state: AppUpdateState,
  message: string
): AppUpdateState {
  return {
    ...state,
    status: getStatusAfterDownloadFailure(state),
    message,
    downloadPercent: null,
    errorContext: "download",
    canRetry: Boolean(state.availableVersion)
  };
}

export function reduceAppUpdateStateOnDownloadComplete(
  state: AppUpdateState,
  version: string
): AppUpdateState {
  return {
    ...state,
    status: "downloaded",
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    releaseNotes: getReleaseNotesForVersion(state, version) ?? createReleaseNotesForVersion(version),
    errorContext: null,
    canRetry: true
  };
}

export function reduceAppUpdateStateOnReleaseNotesLoaded(
  state: AppUpdateState,
  releaseNotes: AppUpdateReleaseNotes
): AppUpdateState {
  if (!state.releaseNotes || state.releaseNotes.version !== releaseNotes.version) {
    return state;
  }

  return {
    ...state,
    releaseNotes: {
      ...releaseNotes,
      loading: false
    }
  };
}

export function reduceAppUpdateStateOnReleaseNotesFailure(
  state: AppUpdateState,
  version: string,
  error: string
): AppUpdateState {
  if (!state.releaseNotes || state.releaseNotes.version !== version) {
    return state;
  }

  return {
    ...state,
    releaseNotes: {
      ...state.releaseNotes,
      loading: false,
      error
    }
  };
}

export function reduceAppUpdateStateOnInstallFailure(
  state: AppUpdateState,
  message: string
): AppUpdateState {
  return {
    ...state,
    status: "downloaded",
    message,
    errorContext: "install",
    canRetry: true
  };
}

function getStatusAfterDownloadFailure(state: AppUpdateState): AppUpdateStatus {
  return state.availableVersion ? "available" : "error";
}

function createLoadingReleaseNotes(version: string): AppUpdateReleaseNotes {
  return {
    version,
    url: null,
    title: null,
    body: null,
    loading: true,
    error: null
  };
}

function createReleaseNotesForVersion(version: string): AppUpdateReleaseNotes | null {
  return version === "unknown" ? null : createLoadingReleaseNotes(version);
}

function getReleaseNotesForVersion(
  state: AppUpdateState,
  version: string
): AppUpdateReleaseNotes | null {
  return state.releaseNotes?.version === version ? state.releaseNotes : null;
}
