import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  CloudUpload,
  Ellipsis,
  GitBranch,
  Loader2,
  Play,
  Plus,
  Search,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
  X
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  MenuItemDescription
} from "@/components/ui/dropdown-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  AppUpdateState,
  GitAction,
  GitConfiguredAction,
  GitPullRecovery,
  OperationCancelStatus,
  RepoSummary
} from "../shared/types";
import type { ActivityLogAttention } from "./activityLogStore";
import { AppUpdateControl, resolveAppUpdateAction } from "./AppUpdateControl";
import { getPullableCommitCount, getPushableCommitCount } from "./commitActions";
import {
  buildConfiguredActionMenu,
  CONFIGURED_ACTION_GROUP_SEPARATOR,
  flattenConfiguredActionMenu,
  type ConfiguredActionMenuSectionItem,
  type ConfiguredActionOutcome,
  type ConfiguredActionRun
} from "./configuredActionMenu";
import {
  OPERATION_BUTTON_FEEDBACK_HOLD_MS,
  OperationButtonFeedback,
  type OperationButtonFeedbackEvent
} from "./OperationButtonFeedback";
import {
  formatActionCountLabel,
  formatCommitCountLabel,
  getPushRemotes,
  getRepositoryActionKey,
  shouldPublishInsteadOfPush
} from "./remoteActions";
import { SyncCountChip } from "./SyncCountChip";
import { WindowControls } from "./WindowControls";
import { WorkflowDuration } from "./WorkflowDuration";
import { WORKSPACE_VIEW_ICONS, WORKSPACE_VIEW_LABELS, type GuestView } from "./workspaceViews";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

/** Where the quick switcher opens: every section, or only branch content. */
export type RepositoryHeaderSwitcherMode = "all" | "branches";

export interface ConfiguredActionCancelTarget {
  kind: "configured";
  id: number;
  operationId: string;
}

export interface RepositoryHeaderProps {
  repoPath: string;
  /** The repository alias, or its folder name when it has none. */
  displayName: string;
  summary: RepoSummary | null;
  isMaximized: boolean;
  /** Changed file count shown on the Changes segment. */
  changesCount: number;
  guestView: GuestView | null;
  /** Count for the guest segment: stashes, open pull requests or issues. Null hides it. */
  guestCount: number | string | null;
  /** Activity log attention. The caller passes "none" while the activity log is the active view. */
  activityAttention: ActivityLogAttention;
  /** Operation status text from getActionHeading, announced politely. */
  actionHeading: string;
  runningAction: string | null;
  feedbackEvent: OperationButtonFeedbackEvent | null;
  configuredActionRuns: ConfiguredActionRun[];
  configuredActionOutcome: ConfiguredActionOutcome | null;
  /** Disables Fetch, Pull and Push, for example while another operation runs. */
  disabled: boolean;
  pullRecovery: GitPullRecovery | null;
  cancellable: boolean;
  cancelStatus: OperationCancelStatus;
  cancelLabel: string;
  cancelingLabel: string;
  appUpdate: AppUpdateState;
  /** Receives the repository switcher button, for example to return focus to it. */
  repoSwitcherRef?: Ref<HTMLButtonElement>;
  /** Wraps the repository switcher, for example in the add-repository popover anchor. The node is a DOM element, so it accepts a ref. */
  wrapRepoSwitcher?: (node: ReactNode) => ReactNode;
  /** Context menu items for the open repository. Without it the switcher has no context menu. */
  renderRepositoryMenuItems?: () => ReactNode;
  onOpenSwitcher: (mode: RepositoryHeaderSwitcherMode) => void;
  onCloseGuest: () => void;
  /** The views the + menu can open as the guest tab, built like the quick switcher's Go to section. */
  addViewOptions: readonly AddViewOption[];
  onOpenView: (view: GuestView) => void;
  onRunAction: (action: GitAction) => void;
  onPullWithAction: (action: GitConfiguredAction) => void;
  onOpenPushToBranch: () => void;
  onRunConfiguredAction: (action: GitConfiguredAction) => void;
  onManageActions: () => void;
  onCancel: () => void;
  onCancelOperation: (target: ConfiguredActionCancelTarget) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
}

/**
 * The single V2 header strip: repository and branch on the left, the view switch in the
 * centre, Git actions and window controls on the right. It is also the window drag region.
 * Render it inside the workspace Tabs root and pass stable callbacks so the memo holds.
 */
export const RepositoryHeader = memo(function RepositoryHeader({
  repoPath,
  displayName,
  summary,
  isMaximized,
  changesCount,
  guestView,
  guestCount,
  activityAttention,
  actionHeading,
  runningAction,
  feedbackEvent,
  configuredActionRuns,
  configuredActionOutcome,
  disabled,
  pullRecovery,
  cancellable,
  cancelStatus,
  cancelLabel,
  cancelingLabel,
  appUpdate,
  repoSwitcherRef,
  wrapRepoSwitcher,
  renderRepositoryMenuItems,
  onOpenSwitcher,
  onCloseGuest,
  addViewOptions,
  onOpenView,
  onRunAction,
  onPullWithAction,
  onOpenPushToBranch,
  onRunConfiguredAction,
  onManageActions,
  onCancel,
  onCancelOperation,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onMinimize,
  onToggleMaximize,
  onCloseWindow
}: RepositoryHeaderProps): ReactNode {
  // A repository that failed validation keeps only the controls that lead away from it.
  const invalid = summary?.isValid === false;
  // A plain element wraps the switcher so a popover anchor (Radix Slot) can attach its ref to it
  // while the button keeps its own ref and context menu trigger.
  const repoSwitcher = (
    <div className="repo-switcher-anchor">
      <RepoSwitcher
        repoPath={repoPath}
        displayName={displayName}
        buttonRef={repoSwitcherRef}
        renderMenuItems={renderRepositoryMenuItems}
        onOpen={() => onOpenSwitcher("all")}
      />
    </div>
  );

  return (
    <header className="repository-header" data-maximized={isMaximized ? "true" : "false"}>
      {/* The header is the size container; this bar is the layout its container queries change. */}
      <div className="repository-header-bar">
        <nav className="repository-header-left" aria-label="Workspace navigation">
          {wrapRepoSwitcher ? wrapRepoSwitcher(repoSwitcher) : repoSwitcher}
          {invalid ? null : (
            <>
              <span className="header-separator" aria-hidden="true">/</span>
              <BranchPill summary={summary} onOpen={() => onOpenSwitcher("branches")} />
            </>
          )}
        </nav>
        <div className="repository-header-center">
          {invalid ? null : (
            <ViewSwitch
              changesCount={changesCount}
              guestView={guestView}
              guestCount={guestCount}
              activityAttention={activityAttention}
              onCloseGuest={onCloseGuest}
              addViewOptions={addViewOptions}
              onOpenView={onOpenView}
              onOpenSwitcher={onOpenSwitcher}
            />
          )}
        </div>
        <div className="repository-header-right">
          {invalid ? null : (
            <>
              <div className="header-git-actions" role="group" aria-label="Git actions">
                {cancellable ? (
                  <HeaderCancelButton
                    label={cancelStatus === "canceling" ? cancelingLabel : cancelStatus === "error" ? `Retry ${cancelLabel}` : cancelLabel}
                    canceling={cancelStatus === "canceling"}
                    onCancel={onCancel}
                  />
                ) : null}
                <RepositoryActionsButton
                  summary={summary}
                  runs={configuredActionRuns}
                  outcome={configuredActionOutcome}
                  activityAttention={activityAttention}
                  onRunConfiguredAction={onRunConfiguredAction}
                  onCancelOperation={onCancelOperation}
                  onManageActions={onManageActions}
                />
                <RemoteActionsGroup
                  summary={summary}
                  runningAction={runningAction}
                  feedbackEvent={feedbackEvent}
                  disabled={disabled}
                  pullRecovery={pullRecovery}
                  onRunAction={onRunAction}
                  onPullWithAction={onPullWithAction}
                  onOpenPushToBranch={onOpenPushToBranch}
                />
              </div>
              <AppUpdateControl
                state={appUpdate}
                onCheck={onCheckForUpdates}
                onDownload={onDownloadUpdate}
                onInstall={onInstallUpdate}
              />
            </>
          )}
          {invalid ? null : (
            <ActivityLogButton attention={activityAttention} onOpen={() => onOpenView("activity")} />
          )}
          <MoreButton
            updateAvailable={resolveAppUpdateAction(appUpdate) !== "none"}
            onOpen={() => onOpenSwitcher("all")}
          />
          <WindowControls
            isMaximized={isMaximized}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onCloseWindow}
          />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{actionHeading}</p>
    </header>
  );
});

/** Cancel for the running operation. Narrow headers hide its label, so the tooltip carries it. */
function HeaderCancelButton({
  label,
  canceling,
  onCancel
}: {
  label: string;
  canceling: boolean;
  onCancel: () => void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" className="header-cancel" disabled={canceling} onClick={onCancel}>
          {canceling ? <Loader2 className="animate-spin" /> : <X />}
          <span className="header-cancel-label">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Focuses the selected tab of the header's view switch, or its first tab when none is selected. Without a list it
 * uses the view switch in the document. Returns whether a tab took focus.
 */
export function focusActiveViewTab(list: ParentNode | null = document.querySelector(".view-switch-list")): boolean {
  const tabs = list?.querySelectorAll<HTMLElement>('[role="tab"]');
  const target = Array.from(tabs ?? []).find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs?.[0];
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

/** The dark repository tile used by the header switcher and the start screens. */
export function RepositoryTile({ className }: { className?: string }): ReactNode {
  return (
    <span className={cn("repo-switcher-tile", className)} aria-hidden="true">
      <GitBranch />
    </span>
  );
}

function RepoSwitcher({
  repoPath,
  displayName,
  buttonRef,
  renderMenuItems,
  onOpen
}: {
  repoPath: string;
  displayName: string;
  buttonRef: Ref<HTMLButtonElement> | undefined;
  renderMenuItems: (() => ReactNode) | undefined;
  onOpen: () => void;
}): ReactNode {
  const button = (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      className="repo-switcher"
      aria-label={`Switch repository: ${displayName}`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <RepositoryTile />
      <span className="repo-switcher-name">{displayName}</span>
      <ChevronDown className="repo-switcher-chevron" />
    </Button>
  );

  return renderMenuItems ? (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent className="w-72">
        <ContextMenuLabel className="repo-recent-menu-path">{repoPath}</ContextMenuLabel>
        <ContextMenuSeparator />
        {renderMenuItems()}
      </ContextMenuContent>
    </ContextMenu>
  ) : button;
}

function BranchPill({
  summary,
  onOpen
}: {
  summary: RepoSummary | null;
  onOpen: () => void;
}): ReactNode {
  const nameId = useId();
  const flagId = useId();
  const branch = summary?.branch ?? null;
  const tag = summary?.currentTag ?? null;
  const label = summary ? branch ?? (tag ? `Tag: ${tag}` : "Detached HEAD") : "";
  const showLocalFlag = Boolean(branch && !summary?.upstream && summary?.capabilities.setUpstream);

  return (
    <Button
      type="button"
      variant="ghost"
      className="branch-pill"
      aria-label="Switch branch"
      aria-haspopup="dialog"
      aria-describedby={showLocalFlag ? `${nameId} ${flagId}` : nameId}
      // Branch actions stay reachable while operations run; only an unusable repository disables it.
      disabled={!summary?.isValid}
      onClick={onOpen}
    >
      <span className="branch-pill-dot" data-ref-kind={branch ? "branch" : tag ? "tag" : "detached"} aria-hidden="true" />
      <span id={nameId} className="branch-pill-name">{label}</span>
      {showLocalFlag ? <span id={flagId} className="branch-pill-flag">local</span> : null}
      <ChevronDown className="branch-pill-chevron" />
    </Button>
  );
}

function ViewSwitch({
  changesCount,
  guestView,
  guestCount,
  activityAttention,
  onCloseGuest,
  addViewOptions,
  onOpenView,
  onOpenSwitcher
}: {
  changesCount: number;
  guestView: GuestView | null;
  guestCount: number | string | null;
  activityAttention: ActivityLogAttention;
  onCloseGuest: () => void;
  addViewOptions: readonly AddViewOption[];
  onOpenView: (view: GuestView) => void;
  onOpenSwitcher: (mode: RepositoryHeaderSwitcherMode) => void;
}): ReactNode {
  const guestLabel = guestView ? WORKSPACE_VIEW_LABELS[guestView] : "";
  // Narrow headers show these icons in place of the labels, which still name the tabs.
  const ChangesIcon = WORKSPACE_VIEW_ICONS.status;
  const HistoryIcon = WORKSPACE_VIEW_ICONS.history;
  const GuestIcon = guestView ? WORKSPACE_VIEW_ICONS[guestView] : null;
  const isActivityGuest = guestView === "activity";
  const showGuestCount = !isActivityGuest && guestCount !== null && guestCount !== "" && guestCount !== 0;
  const guestAriaLabel = isActivityGuest
    ? formatActivityLogLabel(activityAttention)
    : showGuestCount ? `${guestLabel} ${guestCount}` : guestLabel;
  const listRef = useRef<HTMLDivElement>(null);
  // The guest whose close button had focus when it was pressed. Its segment and the button
  // unmount together, so focus moves to the tab that is active once the guest is gone.
  const closingGuestRef = useRef<GuestView | null>(null);

  const closeGuest = useCallback((event: { currentTarget: HTMLButtonElement }): void => {
    closingGuestRef.current = event.currentTarget.contains(document.activeElement) ? guestView : null;
    onCloseGuest();
  }, [guestView, onCloseGuest]);

  useLayoutEffect(() => {
    const closing = closingGuestRef.current;
    if (!closing || guestView === closing) return;
    closingGuestRef.current = null;
    // Another control may have taken focus in the meantime; only recover focus that was dropped.
    if (guestView !== null || (document.activeElement && document.activeElement !== document.body)) return;
    focusActiveViewTab(listRef.current);
  }, [guestView]);

  return (
    <div className="view-switch" data-guest={guestView ? "true" : "false"}>
      <TabsList ref={listRef} className="view-switch-list">
        <TabsTrigger
          value="status"
          className="view-switch-tab"
          aria-label={changesCount ? `${WORKSPACE_VIEW_LABELS.status} ${changesCount}` : WORKSPACE_VIEW_LABELS.status}
        >
          <ChangesIcon className="view-switch-icon" aria-hidden="true" />
          <span className="view-switch-label">{WORKSPACE_VIEW_LABELS.status}</span>
          {changesCount ? <span className="workspace-tab-count">{changesCount}</span> : null}
        </TabsTrigger>
        <TabsTrigger value="history" className="view-switch-tab">
          <HistoryIcon className="view-switch-icon" aria-hidden="true" />
          <span className="view-switch-label">{WORKSPACE_VIEW_LABELS.history}</span>
        </TabsTrigger>
        {guestView ? (
          <TabsTrigger
            value={guestView}
            className="view-switch-tab view-switch-guest"
            aria-label={guestAriaLabel}
            data-attention={isActivityGuest ? activityAttention : undefined}
          >
            {GuestIcon ? <GuestIcon className="view-switch-icon" aria-hidden="true" /> : null}
            <span className="view-switch-label">{guestLabel}</span>
            {showGuestCount ? <span className="workspace-tab-count">{guestCount}</span> : null}
            {isActivityGuest && activityAttention !== "none" ? (
              <span className="header-attention-dot" data-attention={activityAttention} aria-hidden="true" />
            ) : null}
          </TabsTrigger>
        ) : null}
      </TabsList>
      {guestView ? (
        <TooltipButton
          type="button"
          variant="ghost"
          size="icon-xs"
          className="view-switch-close"
          aria-label={`Close ${guestLabel} view`}
          tooltip={`Close ${guestLabel}`}
          onClick={closeGuest}
        >
          <X />
        </TooltipButton>
      ) : null}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" className="view-switch-add" aria-label="Open a view">
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Open a view</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Open a view</DropdownMenuLabel>
          {addViewOptions.map((option) => {
            const Icon = WORKSPACE_VIEW_ICONS[option.view];
            return (
              <DropdownMenuItem
                key={option.view}
                aria-label={option.view === guestView ? `${option.label}, open` : option.label}
                onSelect={() => onOpenView(option.view)}
              >
                <Icon />
                {option.title}
                {option.meta ? <DropdownMenuShortcut>{option.meta}</DropdownMenuShortcut> : null}
                {option.view === guestView ? <Check className="ml-auto" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onOpenSwitcher("all")}>
            <Search />
            Quick switcher…
            <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** One view the view switch's + menu can open as the guest tab. */
export interface AddViewOption {
  view: GuestView;
  /** The visible name. */
  title: string;
  /** The accessible name, including any count. */
  label: string;
  /** A short count shown at the end of the row. */
  meta?: string | undefined;
}

function formatActivityLogLabel(attention: ActivityLogAttention): string {
  if (attention === "error") return `${WORKSPACE_VIEW_LABELS.activity}, unread error details available`;
  if (attention === "unread") return `${WORKSPACE_VIEW_LABELS.activity}, unread output available`;
  return WORKSPACE_VIEW_LABELS.activity;
}

type RepositoryActionsButtonState =
  | { kind: "idle" }
  | { kind: "running" | "passed" | "failed"; text: string };

function RepositoryActionsButton({
  summary,
  runs,
  outcome,
  activityAttention,
  onRunConfiguredAction,
  onCancelOperation,
  onManageActions
}: {
  summary: RepoSummary | null;
  runs: ConfiguredActionRun[];
  outcome: ConfiguredActionOutcome | null;
  activityAttention: ActivityLogAttention;
  onRunConfiguredAction: (action: GitConfiguredAction) => void;
  onCancelOperation: (target: ConfiguredActionCancelTarget) => void;
  onManageActions: () => void;
}): ReactNode {
  const textId = useId();
  const passedUntil = outcome?.exitCode === 0 ? outcome.finishedAt + OPERATION_BUTTON_FEEDBACK_HOLD_MS : 0;
  const [expiredOutcomeId, setExpiredOutcomeId] = useState<string | null>(null);

  useEffect(() => {
    // Only a fresh success needs a timer; idle and failed states never schedule one.
    if (!outcome || outcome.exitCode !== 0) return;
    const remaining = passedUntil - Date.now();
    if (remaining <= 0) return;
    const timeout = window.setTimeout(() => setExpiredOutcomeId(outcome.operationId), remaining);
    return () => window.clearTimeout(timeout);
  }, [outcome, passedUntil]);

  const passed = outcome?.exitCode === 0 && expiredOutcomeId !== outcome.operationId && passedUntil > Date.now();
  const buttonState: RepositoryActionsButtonState = runs.length === 1
    ? { kind: "running", text: runs[0]?.name ?? "Action" }
    : runs.length > 1
      ? { kind: "running", text: `${runs.length} running` }
      : outcome && outcome.exitCode !== 0 && activityAttention === "error"
        ? { kind: "failed", text: `${outcome.name} failed` }
        : outcome && passed
          ? { kind: "passed", text: `${outcome.name} passed` }
          : { kind: "idle" };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="repo-actions-button"
          // Radix owns data-state on menu triggers, so the run state uses its own attribute.
          data-actions-state={buttonState.kind}
          disabled={!summary?.isValid}
          aria-label="Repository actions"
          aria-describedby={buttonState.kind === "idle" ? undefined : textId}
        >
          {buttonState.kind === "running" ? <Loader2 className="animate-spin" />
            : buttonState.kind === "passed" ? <CircleCheck className="repo-actions-button-passed" />
              : buttonState.kind === "failed" ? <CircleX className="repo-actions-button-failed" />
                : <Workflow />}
          <span id={textId} className="repo-actions-button-text">
            {buttonState.kind === "idle" ? "Actions" : buttonState.text}
          </span>
          <ChevronDown className="repo-actions-button-chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="repo-actions-menu">
        <RepositoryActionsMenuBody
          summary={summary}
          runs={runs}
          onRunConfiguredAction={onRunConfiguredAction}
          onCancelOperation={onCancelOperation}
          onManageActions={onManageActions}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu body mounts only while the menu is open, so closed menus do no work. */
function RepositoryActionsMenuBody({
  summary,
  runs,
  onRunConfiguredAction,
  onCancelOperation,
  onManageActions
}: {
  summary: RepoSummary | null;
  runs: ConfiguredActionRun[];
  onRunConfiguredAction: (action: GitConfiguredAction) => void;
  onCancelOperation: (target: ConfiguredActionCancelTarget) => void;
  onManageActions: () => void;
}): ReactNode {
  const actionsConfig = summary?.actionsConfig;
  const configuredActions = actionsConfig?.actions ?? [];
  const configError = actionsConfig?.error.trim() ?? "";
  // Folders start open; the ones the user closed are remembered for this repository.
  const [collapsedFolders, setCollapsedFolders] = usePersistentWorkspacePanelState<readonly string[]>("repository-action-folders-collapsed", () => []);
  const setFolderCollapsed = (key: string, collapsed: boolean): void => setCollapsedFolders((current) => {
    if (collapsed === current.includes(key)) return current;
    return collapsed ? [...current, key] : current.filter((folder) => folder !== key);
  });

  return (
    <>
      <DropdownMenuLabel>Repository actions</DropdownMenuLabel>
      {runs.map((run) => (
        <RunningConfiguredAction
          key={run.id}
          run={run}
          command={configuredActions.find((action) => action.name === run.name)?.command ?? ""}
          onCancel={() => onCancelOperation({ kind: "configured", id: run.id, operationId: run.operationId })}
        />
      ))}
      {configError ? (
        <DropdownMenuItem disabled className="repo-actions-error">
          {configError}
        </DropdownMenuItem>
      ) : configuredActions.length > 0 ? (
        flattenConfiguredActionMenu(buildConfiguredActionMenu(configuredActions)).map((section, index) => {
          const collapsed = section.heading !== null && collapsedFolders.includes(section.key);
          return (
            <Fragment key={section.key}>
              {/* Each top-level folder is a section: a separator, then a toggle row with its name and count. */}
              {section.heading ? <>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <ConfiguredActionFolderRow
                  heading={section.heading}
                  count={section.items.length}
                  running={runs.filter((run) => section.items.some((item) => item.action.name === run.name)).length}
                  collapsed={collapsed}
                  onToggle={(open) => setFolderCollapsed(section.key, !open)}
                />
              </> : null}
              {collapsed ? null : section.items.map((item) => (
                <ConfiguredActionItem key={item.key} item={item} onRun={onRunConfiguredAction} />
              ))}
            </Fragment>
          );
        })
      ) : (
        <DropdownMenuItem disabled>No configured actions</DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onManageActions}>
        <SlidersHorizontal />
        Manage repository actions…
      </DropdownMenuItem>
    </>
  );
}

/** A running action row. It mounts only while the menu is open, so its elapsed clock ticks only then. */
function RunningConfiguredAction({
  run,
  command,
  onCancel
}: {
  run: ConfiguredActionRun;
  command: string;
  onCancel: () => void;
}): ReactNode {
  const detailId = useId();
  const status = run.cancelStatus === "canceling"
    ? "Cancelling"
    : run.cancelStatus === "error" ? run.cancelError || "Cancel failed" : "Running";

  return (
    <div className="repo-actions-run" data-cancel-status={run.cancelStatus}>
      <Loader2 className="repo-actions-run-icon animate-spin" aria-hidden="true" />
      <span className="repo-actions-run-text">
        <span className="repo-actions-run-name">{run.name}</span>
        <span id={detailId} className="repo-actions-run-detail">
          {status} · <WorkflowDuration startedAt={new Date(run.startedAt).toISOString()} completedAt="" running active />
          {command ? <span className="repo-actions-run-command"> · {command}</span> : null}
        </span>
      </span>
      <DropdownMenuItem
        variant="destructive"
        className="repo-actions-run-cancel"
        aria-label={`Cancel ${run.name}`}
        aria-describedby={detailId}
        disabled={run.cancelStatus === "canceling"}
        onSelect={onCancel}
      >
        Cancel
      </DropdownMenuItem>
    </div>
  );
}

/** A folder's toggle row. It opens and closes the folder without closing the menu. */
function ConfiguredActionFolderRow({
  heading,
  count,
  running,
  collapsed,
  onToggle
}: {
  heading: string;
  count: number;
  running: number;
  collapsed: boolean;
  onToggle: (open: boolean) => void;
}): ReactNode {
  const label = `${heading}, ${count} ${count === 1 ? "action" : "actions"}${running > 0 ? `, ${running} running` : ""}`;
  return (
    <DropdownMenuItem
      className="repo-actions-folder"
      aria-label={label}
      aria-expanded={!collapsed}
      onSelect={(event) => {
        event.preventDefault();
        onToggle(collapsed);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && collapsed) {
          event.preventDefault();
          onToggle(true);
        } else if (event.key === "ArrowLeft" && !collapsed) {
          event.preventDefault();
          onToggle(false);
        }
      }}
    >
      {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      <span className="repo-actions-folder-name">{heading}</span>
      <span className="repo-actions-folder-count" aria-hidden="true">{count}</span>
      {collapsed && running > 0 ? (
        <span className="repo-actions-folder-running" aria-hidden="true">
          <Loader2 className="animate-spin" />
          {running} running
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

function ConfiguredActionItem({
  item,
  onRun
}: {
  item: ConfiguredActionMenuSectionItem;
  onRun: (action: GitConfiguredAction) => void;
}): ReactNode {
  const descriptionId = useId();
  const badgeId = useId();
  const description = item.action.description.trim();
  const afterPull = Boolean(item.action.bindToPull);
  const describedBy = [description ? descriptionId : "", afterPull ? badgeId : ""].filter(Boolean).join(" ");

  return (
    <DropdownMenuItem
      className="repo-actions-item"
      aria-label={[...item.path, item.label].join(CONFIGURED_ACTION_GROUP_SEPARATOR)}
      aria-describedby={describedBy || undefined}
      onSelect={() => onRun(item.action)}
    >
      <Play />
      <span className="repo-actions-item-text">
        <span className="repo-actions-item-title">
          {item.path.length > 0 ? (
            <span className="repo-actions-item-path" aria-hidden="true">{item.path.join(CONFIGURED_ACTION_GROUP_SEPARATOR)} ›</span>
          ) : null}
          <span className="repo-actions-item-name">{item.label}</span>
          {afterPull ? (
            <span id={badgeId} className="repo-actions-after-pull">
              <ArrowDown aria-hidden="true" />
              after Pull
            </span>
          ) : null}
        </span>
        {description ? <MenuItemDescription id={descriptionId} className="repo-actions-item-description" title={description}>{description}</MenuItemDescription> : null}
      </span>
    </DropdownMenuItem>
  );
}

function RemoteActionsGroup({
  summary,
  runningAction,
  feedbackEvent,
  disabled,
  pullRecovery,
  onRunAction,
  onPullWithAction,
  onOpenPushToBranch
}: {
  summary: RepoSummary | null;
  runningAction: string | null;
  feedbackEvent: OperationButtonFeedbackEvent | null;
  disabled: boolean;
  pullRecovery: GitPullRecovery | null;
  onRunAction: (action: GitAction) => void;
  onPullWithAction: (action: GitConfiguredAction) => void;
  onOpenPushToBranch: () => void;
}): ReactNode {
  const capabilities = summary?.capabilities ?? null;
  // Lore is centralized: it has no "fetch", and "pull" maps to `lore sync`.
  const showFetch = capabilities?.fetch ?? true;
  const usesSync = capabilities?.sync ?? false;
  const pullableCommitCount = getPullableCommitCount(summary);
  const pushableCommitCount = getPushableCommitCount(summary);
  const publishInsteadOfPush = shouldPublishInsteadOfPush(summary);
  const pullLabel = pullRecovery ? "Resolve" : usesSync ? "Sync" : "Pull";
  const pullName = pullRecovery
    ? "Resolve remote history change"
    : !usesSync && pullableCommitCount > 0
      ? formatActionCountLabel("Pull", pullableCommitCount)
      : pullLabel;
  const pushLabel = publishInsteadOfPush ? "Publish" : "Push";
  const pushName = publishInsteadOfPush
    ? "Publish branch"
    : pushableCommitCount > 0
      ? formatActionCountLabel("Push", pushableCommitCount)
      : pushLabel;
  const pullDisabledReason = summary?.kind === "git" && !summary.branch && !pullRecovery
    ? "Switch to a branch before pulling."
    : undefined;
  const pullDisabled = disabled || Boolean(pullDisabledReason);
  const pushMenuDisabled = disabled || !summary?.branch || getPushRemotes(summary).length === 0;
  const pullBoundActions = !usesSync && !pullRecovery
    ? (summary?.actionsConfig.actions ?? []).filter((action) => action.bindToPull)
    : [];
  const showPushToBranch = capabilities?.pushToBranch ?? false;
  const fetchRunning = runningAction === "fetch";
  const pullRunning = runningAction === "pull";
  const pushRunning = runningAction === "push";
  // A segment with nothing to move is dimmed. Sync repositories (Lore) report no counts, so they never dim.
  const pullIdle = !pullRunning && !pullRecovery && !usesSync && pullableCommitCount === 0;
  const pushIdle = !pushRunning && !publishInsteadOfPush && !usesSync && pushableCommitCount === 0;

  return (
    <div className="remote-actions" data-running={fetchRunning || pullRunning || pushRunning ? "true" : undefined}>
      {showFetch ? (
        <TooltipButton
          type="button"
          variant="ghost"
          className="remote-actions-segment"
          data-action="fetch"
          data-idle="false"
          data-running={fetchRunning ? "true" : undefined}
          disabled={disabled}
          tooltip="Fetch"
          aria-label="Fetch"
          onClick={() => onRunAction("fetch")}
        >
          <OperationButtonFeedback action="fetch" event={feedbackEvent} successLabel="Fetched" surface="action-bar">
            {fetchRunning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            <span className="remote-actions-label">{fetchRunning ? "Fetching…" : "Fetch"}</span>
          </OperationButtonFeedback>
        </TooltipButton>
      ) : null}
      <TooltipButton
        type="button"
        variant="ghost"
        className="remote-actions-segment"
        data-action="pull"
        data-idle={pullIdle ? "true" : "false"}
        data-running={pullRunning ? "true" : undefined}
        data-recovery={pullRecovery ? "true" : undefined}
        disabled={pullDisabled}
        tooltip={pullName}
        disabledTooltip={pullDisabledReason}
        aria-label={pullName}
        onClick={() => onRunAction("pull")}
      >
        <OperationButtonFeedback
          action="pull"
          event={feedbackEvent}
          successLabel={usesSync ? "Synced" : "Pulled"}
          surface="action-bar"
        >
          {pullRunning ? <Loader2 className="animate-spin" />
            : pullRecovery ? <TriangleAlert />
              : usesSync ? <ArrowDownUp />
                : <ArrowDown />}
          <span className="remote-actions-label">
            {pullRunning ? usesSync ? "Syncing…" : "Pulling…" : pullLabel}
          </span>
          {!pullRecovery && !usesSync && pullableCommitCount > 0 ? (
            <SyncCountChip className="remote-actions-count" title={formatCommitCountLabel(pullableCommitCount, "behind")}>
              {pullableCommitCount}
            </SyncCountChip>
          ) : null}
        </OperationButtonFeedback>
      </TooltipButton>
      <TooltipButton
        type="button"
        variant="ghost"
        className="remote-actions-segment"
        data-action="push"
        data-idle={pushIdle ? "true" : "false"}
        data-running={pushRunning ? "true" : undefined}
        disabled={disabled}
        tooltip={pushName}
        aria-label={pushName}
        onClick={() => onRunAction("push")}
      >
        <OperationButtonFeedback action="push" event={feedbackEvent} successLabel="Pushed" surface="action-bar">
          {pushRunning ? <Loader2 className="animate-spin" /> : publishInsteadOfPush ? <CloudUpload /> : <ArrowUp />}
          <span className="remote-actions-label">{pushRunning ? "Pushing…" : pushLabel}</span>
          {!publishInsteadOfPush && pushableCommitCount > 0 ? (
            <SyncCountChip className="remote-actions-count" title={formatCommitCountLabel(pushableCommitCount, "ahead")}>
              {pushableCommitCount}
            </SyncCountChip>
          ) : null}
        </OperationButtonFeedback>
      </TooltipButton>
      {pullBoundActions.length > 0 || showPushToBranch ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TooltipButton
              type="button"
              variant="ghost"
              className="remote-actions-segment remote-actions-more"
              tooltip="More pull and push actions"
              aria-label="More pull and push actions"
            >
              <ChevronDown />
            </TooltipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="remote-actions-menu">
            {pullBoundActions.length > 0 ? (
              <>
                <DropdownMenuLabel>Pull, then run</DropdownMenuLabel>
                {pullBoundActions.map((action) => (
                  <DropdownMenuItem
                    key={getRepositoryActionKey(action.name)}
                    disabled={pullDisabled}
                    onSelect={() => onPullWithAction(action)}
                  >
                    <Play />
                    {action.name}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            {pullBoundActions.length > 0 && showPushToBranch ? <DropdownMenuSeparator /> : null}
            {showPushToBranch ? (
              <DropdownMenuItem disabled={pushMenuDisabled} onSelect={onOpenPushToBranch}>
                <GitBranch />
                Push to another branch…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** Opens the activity log. Its dot marks unread output, red when it holds unread error details. */
function ActivityLogButton({
  attention,
  onOpen
}: {
  attention: ActivityLogAttention;
  onOpen: () => void;
}): ReactNode {
  const ActivityIcon = WORKSPACE_VIEW_ICONS.activity;
  const tooltip = attention === "error"
    ? "View unread error details in the activity log"
    : attention === "unread" ? "View unread activity log output" : WORKSPACE_VIEW_LABELS.activity;

  return (
    <TooltipButton
      type="button"
      variant="ghost"
      size="icon"
      className="header-activity-log"
      data-attention={attention}
      aria-label={formatActivityLogLabel(attention)}
      tooltip={tooltip}
      onClick={onOpen}
    >
      <ActivityIcon />
      {attention === "none" ? null : (
        <span className="header-attention-dot activity-log-attention-indicator" data-attention={attention} aria-hidden="true" />
      )}
    </TooltipButton>
  );
}

function MoreButton({
  updateAvailable,
  onOpen
}: {
  updateAvailable: boolean;
  onOpen: () => void;
}): ReactNode {
  const descriptionId = useId();
  const attention = updateAvailable ? "update" : "none";
  const description = updateAvailable ? "An app update is available" : "";

  return (
    <>
      <TooltipButton
        type="button"
        variant="ghost"
        size="icon"
        className="header-more"
        data-attention={attention}
        aria-label="More"
        aria-haspopup="dialog"
        aria-describedby={description ? descriptionId : undefined}
        tooltip="Quick switcher (Ctrl+K)"
        onClick={onOpen}
      >
        <Ellipsis />
        {attention === "none" ? null : (
          <span className="header-attention-dot" data-attention={attention} aria-hidden="true" />
        )}
      </TooltipButton>
      {description ? <span id={descriptionId} hidden>{description}</span> : null}
    </>
  );
}
