import { Clipboard, GitBranch, GitCommitHorizontal, GitFork, RotateCcw, Tag, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { GitCommitGraphRow } from "../shared/types";

export type CommitContextActionKind = "amend" | "tag" | "reset" | "revert" | "cherry-pick" | "copy";

export const CHERRY_PICK_CONTAINED_REASON = "This commit is already included in the current branch.";
const AMEND_BUSY_REASON = "Wait for the current Git operation to finish.";

export interface CommitActionItem {
  action: CommitContextActionKind;
  label: string;
  icon: LucideIcon;
  /** Set when the item is disabled. The menu shows it as the item's tooltip. */
  disabledReason: string | null;
  /** Starts a new group, so the menu draws a separator before the item. */
  groupStart: boolean;
}

export interface CommitActionOptions {
  tagsEnabled: boolean;
  cherryPickDisabled: boolean;
  cherryPickDisabledReason?: string;
  isHead: boolean;
  amendDisabled: boolean;
  amendDisabledReason: string | null;
}

/**
 * The commit actions that the History row context menu and the commit card menu both show.
 * Only actions with a backend appear here.
 */
export function getCommitActionItems({
  tagsEnabled,
  cherryPickDisabled,
  cherryPickDisabledReason = CHERRY_PICK_CONTAINED_REASON,
  isHead,
  amendDisabled,
  amendDisabledReason
}: CommitActionOptions): CommitActionItem[] {
  const items: CommitActionItem[] = [];
  if (tagsEnabled) items.push({ action: "tag", label: "Tag", icon: Tag, disabledReason: null, groupStart: false });
  items.push(
    {
      action: "cherry-pick",
      label: "Cherry-pick commit…",
      icon: GitFork,
      disabledReason: cherryPickDisabled ? cherryPickDisabledReason : null,
      groupStart: false
    },
    { action: "reset", label: "Reset current branch to this commit", icon: GitBranch, disabledReason: null, groupStart: true },
    { action: "revert", label: "Reverse commit", icon: RotateCcw, disabledReason: null, groupStart: false }
  );
  if (isHead) {
    items.push({
      action: "amend",
      label: "Amend last commit…",
      icon: GitCommitHorizontal,
      disabledReason: amendDisabled ? amendDisabledReason ?? AMEND_BUSY_REASON : null,
      groupStart: false
    });
  }
  items.push({ action: "copy", label: "Copy SHA to clipboard", icon: Clipboard, disabledReason: null, groupStart: true });
  return items;
}

interface CommitActionMenuItemsProps {
  items: readonly CommitActionItem[];
  commit: GitCommitGraphRow;
  onAction: (commit: GitCommitGraphRow, action: CommitContextActionKind) => void;
}

export function CommitActionContextMenuItems({ items, commit, onAction }: CommitActionMenuItemsProps): ReactNode {
  return items.map((item, index) => {
    const Icon = item.icon;
    const disabled = item.disabledReason !== null;
    return (
      <Fragment key={item.action}>
        {item.groupStart && index > 0 ? <ContextMenuSeparator /> : null}
        <TooltipTarget content={item.disabledReason ?? undefined} contentProps={{ side: "right", sideOffset: 8 }}>
          <ContextMenuItem
            disabled={disabled}
            className={disabled ? "data-[disabled]:pointer-events-auto" : undefined}
            onSelect={() => onAction(commit, item.action)}
          >
            <Icon />
            {item.label}
          </ContextMenuItem>
        </TooltipTarget>
      </Fragment>
    );
  });
}

export function CommitActionDropdownMenuItems({ items, commit, onAction }: CommitActionMenuItemsProps): ReactNode {
  return items.map((item, index) => {
    const Icon = item.icon;
    const disabled = item.disabledReason !== null;
    return (
      <Fragment key={item.action}>
        {item.groupStart && index > 0 ? <DropdownMenuSeparator /> : null}
        <TooltipTarget content={item.disabledReason ?? undefined} contentProps={{ side: "left", sideOffset: 8 }}>
          <DropdownMenuItem
            disabled={disabled}
            className={disabled ? "data-[disabled]:pointer-events-auto" : undefined}
            onSelect={() => onAction(commit, item.action)}
          >
            <Icon />
            {item.label}
          </DropdownMenuItem>
        </TooltipTarget>
      </Fragment>
    );
  });
}
