import { FolderOpen, Loader2, MapPinned, Settings, Trash2 } from "lucide-react";
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
}

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
  onRemoveWorktree
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

  const renderMenuItems = useCallback<RenderRepositoryMenuItems>((path, { group, worktree } = {}) => {
    if (worktree) {
      const unavailable = worktree.isBare || worktree.prunable;
      const workspaceActive = isSamePath(worktree.path, activeRepoPath);
      return (
        <>
          <ContextMenuItem disabled={unavailable} onSelect={() => onOpenRepositorySettings(worktree.path)}><Settings />Repository Settings…</ContextMenuItem>
          <ContextMenuItem disabled={unavailable} onSelect={() => onShowInExplorer(worktree.path)}><MapPinned />Show in Explorer</ContextMenuItem>
          {!worktree.isMain && !workspaceActive && onRemoveWorktree ? <ContextMenuItem disabled={disabled || unavailable || worktree.locked} onSelect={() => onRemoveWorktree(worktree)}><Trash2 />Remove Worktree…</ContextMenuItem> : null}
        </>
      );
    }

    const navigationWorktree = group?.worktrees.find((candidate) => isSamePath(candidate.path, group.lastUsedPath));
    const navigationUnavailable = Boolean(navigationWorktree?.isBare || navigationWorktree?.prunable);
    const settingsPath = group?.lastUsedPath ?? path;
    return (
      <>
        <RepositoryOrganizationMenu
          preference={repositoryPreference(organization, path)}
          onChange={(patch) => { changePreference(path, patch); }}
          onOrganize={() => setOrganizerQuery(path)}
          onRename={() => setRenamePath(path)}
        />
        <ContextMenuItem disabled={navigationUnavailable} onSelect={() => onOpenRepositorySettings(settingsPath)}>
          <Settings />
          Repository Settings…
        </ContextMenuItem>
        <ContextMenuItem disabled={navigationUnavailable} onSelect={() => onShowInExplorer(path)}>
          <MapPinned />
          Show in Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => setRemoveTarget(path)}>
          <Trash2 />
          Remove Repository
        </ContextMenuItem>
      </>
    );
  }, [activeRepoPath, changePreference, disabled, onOpenRepositorySettings, onRemoveWorktree, onShowInExplorer, organization]);

  const dialogs = (
    <>
      {renamePath !== null ? <RepositoryAliasDialog key={renamePath} path={renamePath} alias={repositoryPreference(organization, renamePath).alias} onClose={() => setRenamePath(null)} onSave={(alias) => changePreference(renamePath, { alias })} /> : null}
      {organizerQuery !== null ? <RepositoryOrganizationDialog organization={organization} paths={repoPaths} initialQuery={organizerQuery} onClose={() => setOrganizerQuery(null)} onSave={(draft) => updateOrganization((current) => ({ ...draft, expandedWorktrees: current.expandedWorktrees }))} /> : null}
      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Remove Repository?</DialogTitle>
            <DialogDescription>
              This repository will no longer be tracked by Githead. The repository and all of its files will remain on disk.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md border bg-muted/30 p-3 text-sm">{removeTarget}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => {
              if (!removeTarget) return;
              onRemove(removeTarget);
              setRemoveTarget(null);
            }}><Trash2 />Remove Repository</Button>
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
            <DialogTitle>Repository Unavailable</DialogTitle>
            <DialogDescription className="min-w-0 break-words">
              Githead cannot open this saved repository. Choose its new location if it still exists, or remove it from Githead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-md border bg-muted/30 p-3 text-sm">
            <p className="break-all font-medium">{recoveryTarget?.repoPath}</p>
            <p className="break-words text-destructive">{recoveryTarget?.reason}</p>
          </div>
          {recoveryError ? <p className="text-sm text-destructive" role="alert">{recoveryError}</p> : null}
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
            }}><Trash2 />Remove Repository</Button>
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
              {recoveryRunning ? "Checking Location" : "Choose New Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { renderMenuItems, changePreference, openRemove, openRecovery, openOrganizer, dialogs };
}

function isSamePath(left: string, right: string): boolean {
  return getRepoPathKey(left) === getRepoPathKey(right);
}
