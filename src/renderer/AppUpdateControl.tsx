import { Download, ExternalLink, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { lazy, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppUpdateState } from "../shared/types";
import { LoadingState } from "./LoadingState";
import { MotionPresence } from "./motion";
import { OptionalFeatureBoundary } from "./OptionalFeatureBoundary";

const BasicMarkdown = lazy(() => import("./BasicMarkdown.js").then((module) => ({ default: module.BasicMarkdown })));

/** Asks before the restart that installs a downloaded update. */
export function confirmAppUpdateInstall(): boolean {
  return window.confirm("Restart Githead now to install the downloaded update?");
}

/** The header's app update control: one button whose release notes open while it is hovered or focused. */
export function AppUpdateControl({
  state,
  onCheck,
  onDownload,
  onInstall
}: {
  state: AppUpdateState;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}): ReactNode {
  const action = resolveAppUpdateAction(state);
  const present = action !== "none";
  const visibleStateRef = useRef(state);
  if (present) {
    visibleStateRef.current = state;
  }
  const visibleState = present ? state : visibleStateRef.current;
  const visibleAction = resolveAppUpdateAction(visibleState);
  const version = visibleState.downloadedVersion ?? visibleState.availableVersion;
  const label = getAppUpdateButtonLabel(visibleState);
  const disabled = visibleState.status === "checking" || visibleState.status === "downloading";
  const icon = visibleState.status === "downloaded"
    ? <RotateCcw />
    : visibleState.status === "checking" || visibleState.status === "downloading"
      ? <Loader2 className="animate-spin" />
      : visibleAction === "check"
        ? <RefreshCw />
        : <Download />;

  const runAction = (): void => {
    if (visibleAction === "check") {
      onCheck();
      return;
    }

    if (visibleAction === "download") {
      onDownload();
      return;
    }

    if (confirmAppUpdateInstall()) {
      onInstall();
    }
  };

  // The header shows the icon only so the view switch stays centred; the label stays the accessible
  // name, and the tooltip or the release notes card shows the same words.
  const tooltip = visibleState.message || label;

  const updateButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="app-update-compact-button"
      disabled={disabled}
      onClick={runAction}
      aria-label={visibleState.message ? `${label}: ${visibleState.message}` : undefined}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  // Opacity only: the header grid must not shift while the control enters or leaves.
  return (
    <MotionPresence
      present={present}
      className={`app-update-control is-compact is-${visibleState.status}`}
      element="section"
      ariaLabel="App update"
      enterDuration={180}
      exitDuration={180}
      initialY={0}
    >
      {visibleState.releaseNotes ? (
        <HoverCard openDelay={150} closeDelay={200}>
          {/* The span keeps hover working while the button is disabled during checks and downloads. */}
          <HoverCardTrigger asChild>
            <span className="app-update-hover-target">{updateButton}</span>
          </HoverCardTrigger>
          <HoverCardContent className="app-update-release-notes-popover" align="end">
            <p className="app-update-release-notes-status">{tooltip}</p>
            <AppUpdateReleaseNotes state={visibleState} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{updateButton}</TooltipTrigger>
          <TooltipContent className="[--tooltip-max-width:18rem]">{tooltip}</TooltipContent>
        </Tooltip>
      )}
      {version ? <span className="sr-only">Version {version}</span> : null}
    </MotionPresence>
  );
}

function AppUpdateReleaseNotes({ state }: { state: AppUpdateState }): ReactNode {
  const releaseNotes = state.releaseNotes;
  if (!releaseNotes) {
    return null;
  }

  const openReleaseNotes = (): void => {
    if (releaseNotes.url) {
      void window.githead.openExternalUrl({ url: releaseNotes.url });
    }
  };

  return (
    <>
      <div className="app-update-release-notes-header">
        <div className="min-w-0">
          <p className="eyebrow">Release notes</p>
          <h3>{releaseNotes.title || `Version ${releaseNotes.version}`}</h3>
        </div>
        {releaseNotes.url ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={openReleaseNotes}
          >
            <ExternalLink />
            Open on GitHub
          </Button>
        ) : null}
      </div>
      {releaseNotes.loading ? (
        <LoadingState label="Loading release notes" className="min-h-10 p-2" />
      ) : releaseNotes.error ? (
        <p className="app-update-release-notes-error" role="status" aria-live="polite">{releaseNotes.error}</p>
      ) : releaseNotes.body ? (
        <div className="app-update-release-notes-body selectable-text">
          <OptionalFeatureBoundary name="release notes">
            <BasicMarkdown externalLinks>{releaseNotes.body}</BasicMarkdown>
          </OptionalFeatureBoundary>
        </div>
      ) : (
        <p className="app-update-release-notes-status">No release notes published for this version.</p>
      )}
    </>
  );
}

export type AppUpdateAction = "check" | "download" | "install" | "none";

export function resolveAppUpdateAction(state: AppUpdateState): AppUpdateAction {
  if (state.status === "available") {
    return "download";
  }

  if (state.status === "downloaded") {
    return "install";
  }

  if (state.status === "error" && state.canRetry) {
    return "check";
  }

  if (state.status === "checking" || state.status === "downloading") {
    return "check";
  }

  return "none";
}

export function getAppUpdateButtonLabel(state: AppUpdateState): string {
  if (state.status === "checking") {
    return "Checking for updates";
  }

  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? `Downloading ${Math.floor(state.downloadPercent)}%`
      : "Downloading update";
  }

  if (state.status === "downloaded") {
    return "Restart to update";
  }

  if (state.status === "error") {
    return getAppUpdateMessageSummary(state);
  }

  if (state.status === "available" && state.errorContext === "download") {
    return "Retry update download";
  }

  return "Update available";
}

export function getAppUpdateMessageSummary(state: AppUpdateState): string {
  if (state.status !== "error") {
    return state.message ?? "";
  }

  if (state.errorContext === "download") {
    return "Update download failed";
  }

  if (state.errorContext === "install") {
    return "Update install failed";
  }

  return "Update check failed";
}
