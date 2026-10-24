import { Archive, FolderGit2, GitBranch as GitBranchIcon, Info, Loader2, Pencil, Search, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { GitBranch, RepoCapabilities, VcsKind } from "../shared/types";
import { EmptyState } from "./EmptyState";
import { MotionPresence } from "./motion";

type Action = { kind: "rename"; branchName: string } | { kind: "remove"; branchName: string };

export interface BranchManagementDialogProps {
  open: boolean;
  repoPath: string;
  kind: VcsKind;
  capabilities: RepoCapabilities;
  branches: GitBranch[];
  busy: boolean;
  mutationBlocked?: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (branchName: string, newBranchName: string) => Promise<string | null>;
  onRemove: (branchNames: string[], force: boolean) => Promise<string | null>;
}

const BULK_PREVIEW_LIMIT = 5;

/** Current and worktree branches cannot be removed, so they never join a selection. */
function canRemove(branch: GitBranch, capabilities: RepoCapabilities): boolean {
  return capabilities.removeBranches && !branch.current && !branch.worktreePath;
}

export function BranchManagementDialog(props: BranchManagementDialogProps): ReactNode {
  const { open, repoPath, kind, capabilities, branches, busy, mutationBlocked = false, onOpenChange, onRename, onRemove } = props;
  const [action, setAction] = useState<Action | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [forceDelete, setForceDelete] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const archive = kind === "lore";
  const removeVerb = archive ? "Archive" : "Delete";

  const reset = (): void => { setAction(null); setName(""); setError(""); setForceDelete(false); setBulkConfirm(false); };
  const clearSelection = (): void => { setSelected(new Set()); setBulkConfirm(false); setError(""); setForceDelete(false); };

  useEffect(() => {
    if (!open) {
      reset();
      setQuery("");
    }
    setSelected(new Set());
  }, [open, repoPath]);

  // Deleted, renamed, or newly checked-out branches leave the selection after a refresh so a retry only targets what is still removable.
  useEffect(() => {
    if (busy) return;
    setSelected((current) => {
      if (!current.size) return current;
      const removable = new Set(branches.filter((branch) => canRemove(branch, capabilities)).map((branch) => branch.name));
      const next = new Set([...current].filter((branchName) => removable.has(branchName)));
      return next.size === current.size ? current : next;
    });
  }, [branches, busy, capabilities]);

  useEffect(() => {
    if (bulkConfirm && !busy && !selected.size) reset();
  }, [bulkConfirm, busy, selected.size]);

  // A refresh can remove the branch under an open inline action; drop the stale action instead of acting on a missing branch.
  useEffect(() => {
    if (action && !busy && !branches.some((branch) => branch.name === action.branchName)) reset();
  }, [action, branches, busy]);

  const visibleBranches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return branches
      .filter((branch) => branch.name === action?.branchName || branch.name.toLocaleLowerCase().includes(needle))
      .sort((left, right) => Number(right.current) - Number(left.current) || left.name.localeCompare(right.name));
  }, [action?.branchName, branches, query]);

  const selectableVisible = useMemo(() => visibleBranches.filter((branch) => canRemove(branch, capabilities)).map((branch) => branch.name), [capabilities, visibleBranches]);
  const selectedVisibleCount = selectableVisible.filter((branchName) => selected.has(branchName)).length;
  const selectedNames = useMemo(() => branches.filter((branch) => selected.has(branch.name)).map((branch) => branch.name).sort((left, right) => left.localeCompare(right)), [branches, selected]);

  const toggleSelected = (branchName: string, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(branchName); else next.delete(branchName);
      return next;
    });
  };
  const toggleAllVisible = (checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      for (const branchName of selectableVisible) {
        if (checked) next.add(branchName); else next.delete(branchName);
      }
      return next;
    });
  };

  const beginBulkRemove = (): void => { reset(); setBulkConfirm(true); };
  const beginRename = (branch: GitBranch): void => { reset(); setName(branch.name); setAction({ kind: "rename", branchName: branch.name }); };
  const beginRemove = (branch: GitBranch): void => { reset(); setAction({ kind: "remove", branchName: branch.name }); };
  const cancel = (): void => { if (busy) onOpenChange(false); else reset(); };

  const run = async (operation: () => Promise<string | null>, onSuccess: () => void = reset): Promise<void> => {
    setError("");
    const nextError = await operation();
    if (nextError) setError(nextError); else onSuccess();
  };
  const submitBulk = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || mutationBlocked || !bulkConfirm || !selectedNames.length) return;
    void run(() => onRemove(selectedNames, forceDelete), () => { reset(); setSelected(new Set()); });
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || mutationBlocked || !action) return;
    if (action.kind === "rename") {
      const nextName = name.trim();
      if (!nextName) return setError("Enter a branch name.");
      if (nextName === action.branchName) return setError("Enter a different branch name.");
      if (branches.some((branch) => branch.name === nextName)) return setError("Branch already exists.");
      void run(() => onRename(action.branchName, nextName));
    } else {
      void run(() => onRemove([action.branchName], forceDelete));
    }
  };

  const rowProps = { capabilities, busy, mutationBlocked, archive, error, onCancel: cancel, onSubmit: submit };
  const selectionCount = selected.size;
  const branchCountLabel = (count: number): string => `${count} ${count === 1 ? "branch" : "branches"}`;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      aria-busy={busy}
      onEscapeKeyDown={(event) => {
        // Escape backs out of an inline rename or delete before it closes the dialog.
        if ((action || bulkConfirm) && !busy) { event.preventDefault(); reset(); }
      }}
    >
      <DialogHeader className="border-b px-6 py-5 pr-14">
        <DialogTitle>Manage branches</DialogTitle>
        <DialogDescription className="text-pretty">{capabilities.renameBranches ? `Rename or ${removeVerb.toLocaleLowerCase()} local branches.` : `${removeVerb} local branches you no longer need.`}</DialogDescription>
        <TooltipTarget content={repoPath}>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FolderGit2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="selectable-text truncate">{repoPath}</span>
          </p>
        </TooltipTarget>
      </DialogHeader>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 px-6 py-5">
        {branches.length ? <div className="flex items-center gap-3">
          {capabilities.removeBranches ? <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-default">
            <input
              type="checkbox"
              className="size-[15px] cursor-pointer accent-primary disabled:cursor-default"
              aria-label={`Select all shown branches to ${removeVerb.toLocaleLowerCase()}`}
              disabled={busy || !selectableVisible.length}
              checked={selectableVisible.length > 0 && selectedVisibleCount === selectableVisible.length}
              ref={(input) => { if (input) input.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < selectableVisible.length; }}
              onChange={(event) => toggleAllVisible(event.target.checked)}
            />
          </label> : null}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search branches" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" className="pl-8" autoFocus />
          </div>
          <Badge variant="secondary" className="tabular-nums">{query.trim() ? `${visibleBranches.length} of ${branches.length}` : `${branches.length} ${branches.length === 1 ? "branch" : "branches"}`}</Badge>
        </div> : <span />}
        <div className="min-h-0 overflow-y-auto rounded-lg border bg-surface" role="list" aria-label="Local branches">
          {!visibleBranches.length ? <EmptyState
            icon={<GitBranchIcon />}
            title={branches.length ? "No matching branches" : "No local branches"}
            description={branches.length ? "Try a different search." : "Create a branch from the branch picker to see it here."}
          /> : visibleBranches.map((branch) => <BranchRow
            key={branch.name}
            {...rowProps}
            branch={branch}
            selected={selected.has(branch.name)}
            onSelectedChange={(checked) => toggleSelected(branch.name, checked)}
            action={action?.branchName === branch.name ? action.kind : null}
            name={name}
            forceDelete={forceDelete}
            onNameChange={(value) => { setName(value); setError(""); }}
            onForceDeleteChange={setForceDelete}
            onBeginRename={() => beginRename(branch)}
            onBeginRemove={() => beginRemove(branch)}
          />)}
        </div>
      </div>

      {bulkConfirm ? <form className="grid gap-3 border-t px-6 py-4" onSubmit={submitBulk} aria-label={`${removeVerb} selected branches`}>
        <div className="dialog-notice" data-tone="danger">
          <TriangleAlert aria-hidden="true" />
          <div className="min-w-0">
            <p className="dialog-notice-title">{archive ? "Archive" : forceDelete ? "Force delete" : "Delete"} {branchCountLabel(selectedNames.length)}?</p>
            <p className="mt-1 truncate text-xs leading-5 font-medium" title={selectedNames.join(", ")}>
              {selectedNames.slice(0, BULK_PREVIEW_LIMIT).join(", ")}{selectedNames.length > BULK_PREVIEW_LIMIT ? ` and ${selectedNames.length - BULK_PREVIEW_LIMIT} more` : ""}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{archive ? "The branches will be archived and hidden from normal Lore branch lists." : forceDelete ? "The local branches will be deleted even if they contain unmerged commits. This cannot be undone." : "Only the local branches are deleted. Git keeps any branch with unmerged commits, so nothing is lost."}</p>
          </div>
        </div>
        {!archive ? <label className="choice-card" data-tone="danger">
          <input type="checkbox" checked={forceDelete} onChange={(event) => setForceDelete(event.target.checked)} disabled={busy} />
          <span><strong>Force delete</strong><small>Delete even when a branch has commits that haven’t been merged.</small></span>
        </label> : null}
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" autoFocus onClick={cancel}>{busy ? "Cancel operation" : "Cancel"}</Button>
          <Button type="submit" variant="destructive" disabled={busy || mutationBlocked || !selectedNames.length}>{busy ? <Loader2 className="animate-spin" /> : null}{archive ? "Archive" : forceDelete ? "Force delete" : "Delete"} {branchCountLabel(selectedNames.length)}</Button>
        </div>
      </form> : <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
        {selectionCount ? <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium tabular-nums" aria-live="polite">{selectionCount} selected</span>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearSelection}>Clear</Button>
        </div> : <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{archive ? "Archived branches are hidden from normal Lore branch lists." : "Only local branches change. Remote branches are kept."}</span>
        </p>}
        <div className="flex shrink-0 items-center gap-2">
          {selectionCount ? <Button type="button" variant="destructive" disabled={busy || mutationBlocked} onClick={beginBulkRemove}>{archive ? <Archive /> : <Trash2 />}{removeVerb} {branchCountLabel(selectionCount)}…</Button> : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}

interface BranchRowProps {
  branch: GitBranch;
  action: Action["kind"] | null;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  capabilities: RepoCapabilities;
  busy: boolean;
  mutationBlocked: boolean;
  archive: boolean;
  name: string;
  error: string;
  forceDelete: boolean;
  onNameChange: (value: string) => void;
  onForceDeleteChange: (value: boolean) => void;
  onBeginRename: () => void;
  onBeginRemove: () => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}

function BranchRow({ branch, action, selected, onSelectedChange, capabilities, busy, mutationBlocked, archive, name, error, forceDelete, onNameChange, onForceDeleteChange, onBeginRename, onBeginRemove, onCancel, onSubmit }: BranchRowProps): ReactNode {
  const otherWorktree = Boolean(branch.worktreePath && !branch.current);
  const removeVerb = archive ? "Archive" : forceDelete ? "Force delete" : "Delete";
  const cancelLabel = busy ? "Cancel operation" : "Cancel";
  const errorId = `branch-error-${branch.name}`;
  const rowRef = useRef<HTMLDivElement>(null);

  // The confirmation expands the row; keep all of it visible inside the scrolling list.
  useEffect(() => {
    if (action !== "remove") return;
    const frame = requestAnimationFrame(() => rowRef.current?.scrollIntoView?.({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [action]);

  if (action === "rename") {
    return <form role="listitem" aria-label={`Rename ${branch.name}`} className="grid gap-2 border-b bg-selected px-4 py-3 last:border-b-0" onSubmit={onSubmit}>
      <div className="flex items-center gap-2">
        <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="New name"
          className="h-8 min-w-0 flex-1"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          disabled={busy}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="submit" size="sm" disabled={busy || mutationBlocked}>{busy ? <Loader2 className="animate-spin" /> : null}Rename branch</Button>
      </div>
      {error ? <p id={errorId} className="dialog-error pl-6" role="alert">{error}</p> : <p className="pl-6 text-xs text-muted-foreground">Renaming <span className="font-medium">{branch.name}</span>. Its remote branch is not changed.</p>}
    </form>;
  }

  const selectable = canRemove(branch, capabilities);
  return <div ref={rowRef} role="listitem" aria-label={branch.name} className={`border-b last:border-b-0 ${action === "remove" || selected ? "bg-selected" : ""}`}>
    <div className="group flex min-h-12 items-center gap-3 px-4 py-2">
      {capabilities.removeBranches ? <label className="-my-2 -ml-2 flex size-8 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-default">
        <input
          type="checkbox"
          className="size-[15px] cursor-pointer accent-primary disabled:cursor-default"
          aria-label={`Select ${branch.name}`}
          checked={selected}
          disabled={busy || !selectable}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
      </label> : null}
      <GitBranchIcon className={`size-4 shrink-0 ${branch.current ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <TooltipTarget content={branch.name}><span className="selectable-text truncate text-sm font-medium">{branch.name}</span></TooltipTarget>
          {branch.current ? <Badge>Current</Badge> : null}
          {otherWorktree ? <Badge variant="outline">Worktree</Badge> : null}
        </div>
        <BranchDetail branch={branch} otherWorktree={otherWorktree} archive={archive} />
      </div>
      {action === null ? <div className="flex shrink-0 items-center gap-0.5">
        {capabilities.renameBranches ? <TooltipButton type="button" variant="ghost" size="icon-sm" disabled={busy || otherWorktree} aria-label={`Rename ${branch.name}`} tooltip={`Rename ${branch.name}`} disabledTooltip={otherWorktree ? "Open this worktree before renaming its branch" : undefined} onClick={onBeginRename}><Pencil /></TooltipButton> : null}
        {capabilities.removeBranches ? <TooltipButton type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={busy || branch.current || Boolean(branch.worktreePath)} aria-label={`${archive ? "Archive" : "Delete"} ${branch.name}`} tooltip={`${archive ? "Archive" : "Delete"} ${branch.name}`} disabledTooltip={branch.worktreePath ? "Remove or switch the worktree using this branch first" : branch.current ? `Switch to another branch before ${archive ? "archiving" : "deleting"} this branch` : undefined} onClick={onBeginRemove}>{archive ? <Archive /> : <Trash2 />}</TooltipButton> : null}
      </div> : null}
    </div>
    <MotionPresence present={action === "remove"} className="overflow-hidden" initialY={-2}>
      <form className="grid gap-3 px-4 pb-4 pl-11" onSubmit={onSubmit} aria-label={`${removeVerb} ${branch.name}`}>
        <div className="dialog-notice" data-tone="danger">
          <TriangleAlert aria-hidden="true" />
          <div className="min-w-0">
            <p className="dialog-notice-title">{removeVerb} this branch?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{archive ? "The branch will be archived and hidden from normal Lore branch lists." : forceDelete ? "The local branch will be deleted even if it contains unmerged commits. This cannot be undone." : "Only the local branch is deleted. If it has unmerged commits, Git keeps it and nothing is lost."}</p>
          </div>
        </div>
        {!archive ? <label className="choice-card" data-tone="danger">
          <input type="checkbox" checked={forceDelete} onChange={(event) => onForceDeleteChange(event.target.checked)} disabled={busy} />
          <span><strong>Force delete</strong><small>Delete even when it has commits that haven’t been merged.</small></span>
        </label> : null}
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" autoFocus onClick={onCancel}>{cancelLabel}</Button>
          <Button type="submit" variant="destructive" size="sm" disabled={busy || mutationBlocked}>{busy ? <Loader2 className="animate-spin" /> : null}{removeVerb} branch</Button>
        </div>
      </form>
    </MotionPresence>
  </div>;
}

function BranchDetail({ branch, otherWorktree, archive }: { branch: GitBranch; otherWorktree: boolean; archive: boolean }): ReactNode {
  if (otherWorktree && branch.worktreePath) {
    return <TooltipTarget content={branch.worktreePath}><p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><FolderGit2 className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">Checked out in {branch.worktreePath}</span></p></TooltipTarget>;
  }
  if (branch.upstream) {
    return <TooltipTarget content={`Tracks ${branch.upstream}`}><p className="truncate text-xs text-muted-foreground">{branch.upstream}</p></TooltipTarget>;
  }
  return archive ? null : <p className="text-xs text-muted-foreground">Local only</p>;
}
