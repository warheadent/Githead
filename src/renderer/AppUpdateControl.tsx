import { Download, ExternalLink, Loader2, RefreshCw, RotateCcw, ScrollText } from "lucide-react";
import { lazy, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** "panel" is the bordered sidebar card; "compact" is a single header button. */
export type AppUpdateControlVariant = "panel" | "compact";

export function AppUpdateControl({
  state,
  variant = "panel",
  onCheck,
  onDownload,
  onInstall
}: {
  state: AppUpdateState;
  variant?: AppUpdateControlVariant;
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

  const compact = variant === "compact";
  const buttonVariant = compact ? "ghost" : visibleState.status === "error" ? "outline" : "secondary";
  const buttonSize = compact ? "sm" : "default";
  const buttonClassName = compact ? "app-update-compact-button" : undefined;
  // A narrow header hides the compact label visually; it still names the button.
  const labelNode = compact ? <span className="app-update-label">{label}</span> : label;
  // The compact button can be icon-only, so it always has a tooltip.
  const tooltip = visibleState.message || (compact ? label : "");
  const plainButton = (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={buttonClassName}
      disabled={disabled}
      onClick={runAction}
      aria-label={visibleState.message ? `${label}: ${visibleState.message}` : undefined}
    >
      {icon}
      {labelNode}
    </Button>
  );
  const button = tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>{plainButton}</TooltipTrigger>
      <TooltipContent className="[--tooltip-max-width:18rem]">{tooltip}</TooltipContent>
    </Tooltip>
  ) : plainButton;

  if (compact) {
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
        {button}
        {version ? <span className="sr-only">Version {version}</span> : null}
        {visibleState.releaseNotes ? <AppUpdateReleaseNotesPopover state={visibleState} compact /> : null}
      </MotionPresence>
    );
  }

  return (
    <MotionPresence
      present={present}
      className={`app-update-control is-${visibleState.status}`}
      element="section"
      ariaLabel="App update"
      enterDuration={200}
      initialY={4}
    >
      {button}
      {version ? (
        <div className="app-update-version-row">
          <p className="app-update-version">Version {version}</p>
          {visibleState.releaseNotes ? <AppUpdateReleaseNotesPopover state={visibleState} /> : null}
        </div>
      ) : null}
    </MotionPresence>
  );
}

function AppUpdateReleaseNotesPopover({
  state,
  compact = false
}: {
  state: AppUpdateState;
  /** The header trigger: an icon with a label that narrow headers hide, so it has a tooltip. */
  compact?: boolean;
}): ReactNode {
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
    <Popover>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="app-update-release-notes-trigger">
                <ScrollText />
                <span className="app-update-release-notes-label">Release Notes</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Release Notes</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="app-update-release-notes-trigger">
            Release Notes
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent className="app-update-release-notes-popover" align="end">
        <div className="app-update-release-notes-header">
          <div className="min-w-0">
            <p className="eyebrow">Release</p>
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
      </PopoverContent>
    </Popover>
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
