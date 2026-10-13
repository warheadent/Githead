import { ArrowDown, ArrowUp, CircleAlert, FolderOpen, Loader2, MapPinned, Settings, Trash2 } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { GitWorktree, RepositoryGroup } from "../shared/types";
import { RepositoryAliasDialog, RepositoryOrganizationDialog, RepositoryOrganizationMenu } from "./RepositoryOrganizationDialog";
import { repositoryPreference, type RepositoryOrganization, type RepositoryPreference } from "./repositoryOrganization";
import { getRepoPathKey } from "./repositorySnapshotCache";

export type RepositoryRecoveryResult =
  | { status: "success" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** The organization state and writer returned by useRepositoryOrganization. */
export interface RepositoryOrganizationState {
  organization: RepositoryOrganization;
  update: (change: (current: RepositoryOrganization) => RepositoryOrganization) => boolean;
}

/** Identifies the row a menu belongs to. Without a group or worktree the path is a plain saved repository. */
export interface RepositoryMenuTarget {
  /** The worktree group whose heading row owns the menu. */
  group?: RepositoryGroup;
  /** The worktree row that owns the menu. Its own path is used for every action. */
  worktree?: GitWorktree;
  /** Adds "Move up" and "Move down" for a saved repository. Needs the onReorder option. */
  reorder?: boolean;
}

export type RepositoryDropPosition = "before" | "after";
export type RepositoryMoveDirection = "up" | "down";

export type RenderRepositoryMenuItems = (path: string, target?: RepositoryMenuTarget) => ReactNode;

export interface RepositoryRowActionsOptions {
  /** Saved repository paths in display order; the organize dialog lists them. */
  repoPaths: string[];
  /** The open workspace path, or an empty string when no repository is open. */
  activeRepoPath: string;
  disabled: boolean;
  organization: RepositoryOrganizationState;
  onRemove: (repoPath: string) => void;
  onRecover: (repoPath: string) => Promise<RepositoryRecoveryResult>;
  onShowInExplorer: (repoPath: string) => void;
  onOpenRepositorySettings: (repoPath: string) => void;
  onRemoveWorktree?: (worktree: GitWorktree) => void;
  /** Saves a new repository order. Required for the "Move up" and "Move down" items. */
  onReorder?: (repoPaths: string[]) => void;
  /**
   * Runs before a menu action opens a dialog, a settings page or another window, so a surface that owns the menu,
   * such as the quick switcher, can close first. Pin, hide and move keep that surface open.
   */
  onBeforeOpen?: () => void;
}

export interface RepositoryRowActions {
  /** Context menu items for a repository row. Callers render the path label above them. */
  renderMenuItems: RenderRepositoryMenuItems;
  changePreference: (path: string, patch: Partial<RepositoryPreference>) => boolean;
  openRemove: (repoPath: string) => void;
  openRecovery: (repoPath: string, reason: string) => void;
  openOrganizer: (initialQuery?: string) => void;
  /** The rename, organize, remove and repair dialogs. Mount them outside any surface that can close first. */
  dialogs: ReactNode;
}

export function useRepositoryRowActions({
  repoPaths,
  activeRepoPath,
  disabled,
  organization: { organization, update: updateOrganization },
  onRemove,
  onRecover,
  onShowInExplorer,
  onOpenRepositorySettings,
  onRemoveWorktree,
  onReorder,
  onBeforeOpen
}: RepositoryRowActionsOptions): RepositoryRowActions {
  const [organizerQuery, setOrganizerQuery] = useState<string | null>(null);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<{ repoPath: string; reason: string } | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryRunning, setRecoveryRunning] = useState(false);

  const changePreference = useCallback((path: string, patch: Partial<RepositoryPreference>): boolean => updateOrganization((current) => ({
    ...current, repositories: { ...current.repositories, [getRepoPathKey(path)]: { ...repositoryPreference(current, path), ...patch } }
  })), [updateOrganization]);

  const openRemove = useCallback((repoPath: string): void => {
    setRemoveTarget(repoPath);
  }, []);

  const openRecovery = useCallback((repoPath: string, reason: string): void => {
    setRecoveryError("");
    setRecoveryTarget({ repoPath, reason });
  }, []);

  const openOrganizer = useCallback((initialQuery = ""): void => {
    setOrganizerQuery(initialQuery);
  }, []);

  const renderMenuItems = useCallback<RenderRepositoryMenuItems>((path, { group, worktree, reorder = false } = {}) => {
    const open = (action: () => void) => (): void => {
      onBeforeOpen?.();
      action();
    };
    if (worktree) {
      const unavailable = worktree.isBare || worktree.prunable;
      const workspaceActive = isSamePath(worktree.path, activeRepoPath);
      return (
        <>
          <ContextMenuItem disabled={unavailable} onSelect={open(() => onOpenRepositorySettings(worktree.path))}><Settings />Repository settings…</ContextMenuItem>
          <ContextMenuItem disabled={unavailable} onSelect={open(() => onShowInExplorer(worktree.path))}><MapPinned />Show in Explorer</ContextMenuItem>
          {!worktree.isMain && !workspaceActive && onRemoveWorktree ? <ContextMenuItem disabled={disabled || unavailable || worktree.locked} onSelect={open(() => onRemoveWorktree(worktree))}><Trash2 />Remove worktree…</ContextMenuItem> : null}
        </>
      );
    }

    const navigationWorktree = group?.worktrees.find((candidate) => isSamePath(candidate.path, group.lastUsedPath));
    const navigationUnavailable = Boolean(navigationWorktree?.isBare || navigationWorktree?.prunable);
    const settingsPath = group?.lastUsedPath ?? path;
    const moveTargets = reorder && onReorder
      ? {
          up: getRepositoryMoveTarget(repoPaths, organization, path, "up"),
          down: getRepositoryMoveTarget(repoPaths, organization, path, "down")
        }
      : null;
    const move = (direction: RepositoryMoveDirection): void => {
      const target = moveTargets?.[direction];
      if (!target || !onReorder) return;
      const next = moveRepoPath(repoPaths, path, target, direction === "up" ? "before" : "after");
      if (next !== repoPaths) onReorder(next);
    };
    return (
      <>
        <RepositoryOrganizationMenu
          preference={repositoryPreference(organization, path)}
          onChange={(patch) => { changePreference(path, patch); }}
          onOrganize={open(() => setOrganizerQuery(path))}
          onRename={open(() => setRenamePath(path))}
        />
        {moveTargets ? (
          <>
            <ContextMenuItem disabled={!moveTargets.up} onSelect={() => move("up")}>
              <ArrowUp />
              Move up
            </ContextMenuItem>
            <ContextMenuItem disabled={!moveTargets.down} onSelect={() => move("down")}>
              <ArrowDown />
              Move down
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem disabled={navigationUnavailable} onSelect={open(() => onOpenRepositorySettings(settingsPath))}>
          <Settings />
          Repository settings…
        </ContextMenuItem>
        <ContextMenuItem disabled={navigationUnavailable} onSelect={open(() => onShowInExplorer(path))}>
          <MapPinned />
          Show in Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={open(() => setRemoveTarget(path))}>
          <Trash2 />
          Remove repository
        </ContextMenuItem>
      </>
    );
  }, [activeRepoPath, changePreference, disabled, onBeforeOpen, onOpenRepositorySettings, onRemoveWorktree, onReorder, onShowInExplorer, organization, repoPaths]);

  const dialogs = (
    <>
      {renamePath !== null ? <RepositoryAliasDialog key={renamePath} path={renamePath} alias={repositoryPreference(organization, renamePath).alias} onClose={() => setRenamePath(null)} onSave={(alias) => changePreference(renamePath, { alias })} /> : null}
      {organizerQuery !== null ? <RepositoryOrganizationDialog organization={organization} paths={repoPaths} initialQuery={organizerQuery} onClose={() => setOrganizerQuery(null)} onSave={(draft) => updateOrganization((current) => ({ ...draft, expandedWorktrees: current.expandedWorktrees }))} /> : null}
      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Remove repository?</DialogTitle>
            <DialogDescription>
              This repository will no longer be tracked by Githead. The repository and all of its files will remain on disk.
            </DialogDescription>
          </DialogHeader>
          <p className="dialog-code-block">{removeTarget}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => {
              if (!removeTarget) return;
              onRemove(removeTarget);
              setRemoveTarget(null);
            }}><Trash2 />Remove repository</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(recoveryTarget)} onOpenChange={(open) => {
        if (!open && !recoveryRunning) {
          setRecoveryTarget(null);
          setRecoveryError("");
        }
      }}>
        <DialogContent className="min-w-0 overflow-hidden sm:max-w-[480px]" showCloseButton={!recoveryRunning}>
          <DialogHeader className="min-w-0">
            <DialogTitle>Repository unavailable</DialogTitle>
            <DialogDescription className="min-w-0 break-words">
              Githead cannot open this saved repository. Choose its new location if it still exists, or remove it from Githead.
            </DialogDescription>
          </DialogHeader>
          <p className="dialog-code-block">{recoveryTarget?.repoPath}</p>
          <p className="dialog-notice" data-tone="danger"><CircleAlert aria-hidden="true" /><span>{recoveryTarget?.reason}</span></p>
          {recoveryError ? <p className="dialog-error" role="alert">{recoveryError}</p> : null}
          <DialogFooter className="min-w-0 sm:flex-wrap">
            <Button type="button" variant="outline" disabled={recoveryRunning} onClick={() => {
              setRecoveryTarget(null);
              setRecoveryError("");
            }}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={recoveryRunning} onClick={() => {
              if (!recoveryTarget) return;
              onRemove(recoveryTarget.repoPath);
              setRecoveryTarget(null);
              setRecoveryError("");
            }}><Trash2 />Remove repository</Button>
            <Button type="button" disabled={recoveryRunning} onClick={() => {
              if (!recoveryTarget) return;
              setRecoveryRunning(true);
              setRecoveryError("");
              void onRecover(recoveryTarget.repoPath).then((result) => {
                if (result.status === "success") {
                  setRecoveryTarget(null);
                } else if (result.status === "error") {
                  setRecoveryError(result.message);
                }
              }).finally(() => setRecoveryRunning(false));
            }}>
              {recoveryRunning ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              {recoveryRunning ? "Checking location" : "Choose new location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { renderMenuItems, changePreference, openRemove, openRecovery, openOrganizer, dialogs };
}

/**
 * The saved repository that a row moves past: the next one up or down among the repositories with the same pinned
 * state, in saved order. A visible repository skips hidden ones, so a move always changes what the user sees.
 */
export function getRepositoryMoveTarget(
  repoPaths: readonly string[],
  organization: RepositoryOrganization,
  path: string,
  direction: RepositoryMoveDirection
): string | null {
  const preference = repositoryPreference(organization, path);
  const peers = repoPaths.filter((candidate) => {
    const candidatePreference = repositoryPreference(organization, candidate);
    return candidatePreference.pinned === preference.pinned && (preference.hidden || !candidatePreference.hidden);
  });
  const index = peers.findIndex((candidate) => isSamePath(candidate, path));
  if (index < 0) return null;
  return peers[direction === "up" ? index - 1 : index + 1] ?? null;
}

/** Moves a saved repository before or after another one. Returns the same array when nothing moves. */
export function moveRepoPath(repoPaths: string[], fromRepoPath: string, toRepoPath: string, position: RepositoryDropPosition): string[] {
  const fromIndex = repoPaths.findIndex((repoPath) => isSamePath(repoPath, fromRepoPath));
  const toIndex = repoPaths.findIndex((repoPath) => isSamePath(repoPath, toRepoPath));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return repoPaths;
  }

  const next = [...repoPaths];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return repoPaths;
  }

  const adjustedToIndex = next.findIndex((repoPath) => isSamePath(repoPath, toRepoPath));
  if (adjustedToIndex < 0) {
    return repoPaths;
  }

  next.splice(position === "before" ? adjustedToIndex : adjustedToIndex + 1, 0, moved);
  return next;
}

function isSamePath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}
