import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  GitConfiguredAction,
  GitConfiguredActionFile,
  GitConfiguredActionFileConfig,
  RepoSummary
} from "../shared/types";
import { GIT_CONFIGURED_ACTION_SHELLS } from "../shared/types";

export interface RepositoryActionDraft extends GitConfiguredAction {
  id: string;
}

export interface RepositoryActionManagerDraft {
  shared: RepositoryActionDraft[];
  local: RepositoryActionDraft[];
}

interface DeletedAction {
  action: RepositoryActionDraft;
  index: number;
}

interface FileValidation {
  actionId: string | null;
  field: "name" | "command" | null;
}

export function RepositoryActionsDialog({
  open,
  summary,
  draft,
  savingTarget,
  error,
  onOpenChange,
  onDraftChange,
  onAddAction,
  onDeleteAction,
  onRestoreAction,
  onMoveAction,
  onSave
}: {
  open: boolean;
  summary: RepoSummary | null;
  draft: RepositoryActionManagerDraft;
  savingTarget: GitConfiguredActionFile | null;
  error: string;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (target: GitConfiguredActionFile, index: number, patch: Partial<GitConfiguredAction>) => void;
  onAddAction: (target: GitConfiguredActionFile) => void;
  onDeleteAction: (target: GitConfiguredActionFile, index: number) => void;
  onRestoreAction: (target: GitConfiguredActionFile, index: number, action: RepositoryActionDraft) => void;
  onMoveAction: (target: GitConfiguredActionFile, index: number, direction: -1 | 1) => void;
  onSave: (target: GitConfiguredActionFile) => void;
}): ReactNode {
  const [activeTarget, setActiveTarget] = useState<GitConfiguredActionFile>("shared");
  const [selectedIds, setSelectedIds] = useState<Record<GitConfiguredActionFile, string | null>>({
    shared: null,
    local: null
  });
  const [deletedActions, setDeletedActions] = useState<Record<GitConfiguredActionFile, DeletedAction[]>>({
    shared: [],
    local: []
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const previousLengths = useRef({ shared: 0, local: 0 });
  const wasOpen = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const actionsConfig = summary?.actionsConfig;
  const sharedConfig = actionsConfig?.shared ?? createFallbackActionFileConfig("shared");
  const localConfig = actionsConfig?.local ?? createFallbackActionFileConfig("local");
  const baseline = useMemo(() => ({
    shared: serializeActions(sharedConfig.actions),
    local: serializeActions(localConfig.actions)
  }), [sharedConfig.actions, localConfig.actions]);
  const dirty = {
    shared: serializeActions(draft.shared) !== baseline.shared,
    local: serializeActions(draft.local) !== baseline.local
  };
  const hasDirtyFiles = dirty.shared || dirty.local;
  const saving = savingTarget !== null;
  const sharedActionNames = useMemo(
    () => new Set(draft.shared.map((action) => getRepositoryActionKey(action.name))),
    [draft.shared]
  );

  useEffect(() => {
    if (!open) {
      setActiveTarget("shared");
      setSelectedIds({ shared: null, local: null });
      setDeletedActions({ shared: [], local: [] });
      setConfirmDiscard(false);
      previousLengths.current = { shared: 0, local: 0 };
      wasOpen.current = false;
      return;
    }

    if (!wasOpen.current) {
      previousLengths.current = { shared: draft.shared.length, local: draft.local.length };
      wasOpen.current = true;
    }

    setSelectedIds((current) => ({
      shared: findAvailableSelection(current.shared, draft.shared),
      local: findAvailableSelection(current.local, draft.local)
    }));
  }, [open, draft.shared, draft.local]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousLength = previousLengths.current[activeTarget];
    const actions = draft[activeTarget];
    if (actions.length > previousLength) {
      const addedAction = actions.at(-1);
      if (addedAction) {
        setSelectedIds((current) => ({ ...current, [activeTarget]: addedAction.id }));
        requestAnimationFrame(() => nameInputRef.current?.focus());
      }
    }
    previousLengths.current = { shared: draft.shared.length, local: draft.local.length };
  }, [activeTarget, draft, open]);

  useEffect(() => {
    if (!savingTarget) {
      return;
    }
    setDeletedActions((current) => ({ ...current, [savingTarget]: [] }));
  }, [savingTarget]);

  useEffect(() => {
    const validation = getValidation(error, draft[activeTarget]);
    if (validation.actionId) {
      setSelectedIds((current) => ({ ...current, [activeTarget]: validation.actionId }));
    }
  }, [activeTarget, draft, error]);

  const requestClose = (): void => {
    if (saving) {
      return;
    }
    if (hasDirtyFiles) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const deleteAction = (target: GitConfiguredActionFile, index: number): void => {
    const action = draft[target][index];
    if (!action) {
      return;
    }
    setDeletedActions((current) => ({
      ...current,
      [target]: [...current[target], { action, index }]
    }));
    onDeleteAction(target, index);
  };

  const undoDelete = (target: GitConfiguredActionFile): void => {
    const history = deletedActions[target];
    const deleted = history.at(-1);
    if (!deleted) {
      return;
    }
    setDeletedActions((current) => ({ ...current, [target]: current[target].slice(0, -1) }));
    onRestoreAction(target, deleted.index, deleted.action);
    setSelectedIds((current) => ({ ...current, [target]: deleted.action.id }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          requestClose();
        }
      }}>
        <DialogContent
          className="h-[min(760px,calc(100vh-2rem))] max-h-[min(760px,calc(100vh-2rem))] overflow-hidden p-0 sm:max-w-5xl"
          showCloseButton={false}
          onEscapeKeyDown={(event) => {
            if (saving || hasDirtyFiles) {
              event.preventDefault();
              requestClose();
            }
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b px-6 py-5 pr-14">
              <p className="eyebrow">Repository</p>
              <div className="flex items-center gap-2">
                <Workflow className="size-5 text-muted-foreground" aria-hidden="true" />
                <DialogTitle>Repository Actions</DialogTitle>
              </div>
              <DialogDescription>
                Create commands that run from this repository through the Actions menu.
              </DialogDescription>
            </DialogHeader>

            <Tabs
              value={activeTarget}
              onValueChange={(value) => setActiveTarget(value as GitConfiguredActionFile)}
              className="min-h-0 flex-1 gap-0"
            >
              <div className="flex items-center justify-between border-b px-6">
                <TabsList variant="line" aria-label="Repository action files">
                  <FileTab target="shared" count={draft.shared.length} dirty={dirty.shared} />
                  <FileTab target="local" count={draft.local.length} dirty={dirty.local} />
                </TabsList>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {activeTarget === "shared" ? "Committed with the repository" : "Private to this machine"}
                </p>
              </div>

              <FilePanel
                target="shared"
                config={sharedConfig}
                actions={draft.shared}
                selectedId={selectedIds.shared}
                deletedCount={deletedActions.shared.length}
                dirty={dirty.shared}
                saving={saving}
                isSaving={savingTarget === "shared"}
                overrideNames={new Set()}
                error={activeTarget === "shared" ? error : ""}
                nameInputRef={nameInputRef}
                onSelect={(id) => setSelectedIds((current) => ({ ...current, shared: id }))}
                onDraftChange={onDraftChange}
                onAdd={onAddAction}
                onDelete={deleteAction}
                onUndo={undoDelete}
                onMove={onMoveAction}
                onSave={onSave}
              />
              <FilePanel
                target="local"
                config={localConfig}
                actions={draft.local}
                selectedId={selectedIds.local}
                deletedCount={deletedActions.local.length}
                dirty={dirty.local}
                saving={saving}
                isSaving={savingTarget === "local"}
                overrideNames={sharedActionNames}
                error={activeTarget === "local" ? error : ""}
                nameInputRef={nameInputRef}
                onSelect={(id) => setSelectedIds((current) => ({ ...current, local: id }))}
                onDraftChange={onDraftChange}
                onAdd={onAddAction}
                onDelete={deleteAction}
                onUndo={undoDelete}
                onMove={onMoveAction}
                onSave={onSave}
              />
            </Tabs>

            <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
              <p className="min-w-0 truncate text-xs text-muted-foreground" role="status" aria-live="polite">
                {error || (dirty[activeTarget] ? `Unsaved changes in ${getActionFileLabel(activeTarget)} actions` : "All changes saved")}
              </p>
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Changes to {formatDirtyFiles(dirty)} have not been saved and will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button type="button" variant="destructive" onClick={() => {
              setConfirmDiscard(false);
              onOpenChange(false);
            }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FileTab({ target, count, dirty }: { target: GitConfiguredActionFile; count: number; dirty: boolean }): ReactNode {
  const label = getActionFileLabel(target);
  return (
    <TabsTrigger value={target} className="min-w-28 px-4 py-3">
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      {dirty ? <span className="size-1.5 rounded-full bg-primary" aria-label={`${label} has unsaved changes`} /> : null}
    </TabsTrigger>
  );
}

function FilePanel({
  target,
  config,
  actions,
  selectedId,
  deletedCount,
  dirty,
  saving,
  isSaving,
  overrideNames,
  error,
  nameInputRef,
  onSelect,
  onDraftChange,
  onAdd,
  onDelete,
  onUndo,
  onMove,
  onSave
}: {
  target: GitConfiguredActionFile;
  config: GitConfiguredActionFileConfig;
  actions: RepositoryActionDraft[];
  selectedId: string | null;
  deletedCount: number;
  dirty: boolean;
  saving: boolean;
  isSaving: boolean;
  overrideNames: Set<string>;
  error: string;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;
  onSelect: (id: string) => void;
  onDraftChange: (target: GitConfiguredActionFile, index: number, patch: Partial<GitConfiguredAction>) => void;
  onAdd: (target: GitConfiguredActionFile) => void;
  onDelete: (target: GitConfiguredActionFile, index: number) => void;
  onUndo: (target: GitConfiguredActionFile) => void;
  onMove: (target: GitConfiguredActionFile, index: number, direction: -1 | 1) => void;
  onSave: (target: GitConfiguredActionFile) => void;
}): ReactNode {
  const blockedMessage = config.error || config.blockedReason;
  const disabled = saving || Boolean(blockedMessage) || !config.writable;
  const selectedIndex = actions.findIndex((action) => action.id === selectedId);
  const selectedAction = selectedIndex >= 0 ? actions[selectedIndex] ?? null : null;
  const validation = getValidation(error, actions);
  const fileLabel = `.githead/${config.fileName}`;

  return (
    <TabsContent value={target} className="min-h-0 overflow-hidden" data-testid={`repository-actions-${target}-panel`}>
      <div className="grid h-full min-h-0 md:grid-cols-[minmax(220px,0.72fr)_minmax(360px,1.5fr)]" data-testid="repository-actions-scroll-area">
        <aside className="flex min-h-0 flex-col overflow-x-hidden border-b bg-muted/20 md:border-r md:border-b-0" aria-label={`${getActionFileLabel(target)} actions`}>
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{getActionFileLabel(target)} actions</p>
              <p className="truncate text-xs text-muted-foreground" title={fileLabel}>{fileLabel}</p>
            </div>
            <TooltipButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Add ${getActionFileLabel(target).toLowerCase()} action`}
              tooltip="Add action"
              disabled={disabled}
              onClick={() => onAdd(target)}
            ><Plus /></TooltipButton>
          </div>

          {blockedMessage ? (
            <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
              <p className="font-medium">Read-only configuration</p>
              <p className="mt-1 text-xs text-muted-foreground">{blockedMessage}</p>
            </div>
          ) : null}

          <div className="min-h-24 flex-1 overflow-x-hidden overflow-y-auto p-2">
            {actions.length === 0 ? (
              <div className="grid h-full min-h-32 place-content-center gap-3 px-4 text-center">
                <div>
                  <p className="text-sm font-medium">No {getActionFileLabel(target).toLowerCase()} actions</p>
                  <p className="mt-1 text-xs text-muted-foreground">Add a command to make it available from the Actions menu.</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onAdd(target)}>
                  <Plus /> Add action
                </Button>
              </div>
            ) : (
              <ol className="grid gap-1">
                {actions.map((action, index) => {
                  const selected = action.id === selectedId;
                  const overridden = target === "local" && overrideNames.has(getRepositoryActionKey(action.name));
                  return (
                    <li key={action.id}>
                      <button
                        type="button"
                        className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelect(action.id)}
                      >
                        <span className="grid size-6 shrink-0 place-content-center rounded bg-background text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{action.name.trim() || "Untitled action"}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{action.shell}</span>
                            {overridden ? <><span aria-hidden="true">·</span><span>Overrides shared</span></> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {deletedCount > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs" role="status">
              <span>{deletedCount} {deletedCount === 1 ? "action" : "actions"} removed</span>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => onUndo(target)}>
                <RotateCcw /> Undo
              </Button>
            </div>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col bg-card" aria-label="Action editor">
          {selectedAction ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{selectedAction.name.trim() || "Untitled action"}</h3>
                    {target === "local" && overrideNames.has(getRepositoryActionKey(selectedAction.name)) ? <Badge variant="secondary">Overrides Shared</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">Action {selectedIndex + 1} of {actions.length}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <TooltipButton type="button" size="icon-sm" variant="ghost" aria-label={`Move ${selectedAction.name || "action"} up`} tooltip="Move up" disabled={disabled || selectedIndex === 0} onClick={() => onMove(target, selectedIndex, -1)}><ArrowUp /></TooltipButton>
                  <TooltipButton type="button" size="icon-sm" variant="ghost" aria-label={`Move ${selectedAction.name || "action"} down`} tooltip="Move down" disabled={disabled || selectedIndex === actions.length - 1} onClick={() => onMove(target, selectedIndex, 1)}><ArrowDown /></TooltipButton>
                  <TooltipButton type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${selectedAction.name || "action"}`} tooltip="Delete action" disabled={disabled} onClick={() => onDelete(target, selectedIndex)}><Trash2 /></TooltipButton>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="mx-auto grid max-w-2xl gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor={`${target}-action-${selectedAction.id}-name`}>Name</Label>
                    <Input ref={nameInputRef} id={`${target}-action-${selectedAction.id}-name`} value={selectedAction.name} disabled={disabled} aria-invalid={validation.actionId === selectedAction.id && validation.field === "name"} onChange={(event) => onDraftChange(target, selectedIndex, { name: event.target.value })} />
                    <p className="text-xs text-muted-foreground">Displayed in the repository Actions menu.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${target}-action-${selectedAction.id}-command`}>Command</Label>
                    <Textarea id={`${target}-action-${selectedAction.id}-command`} value={selectedAction.command} disabled={disabled} aria-invalid={validation.actionId === selectedAction.id && validation.field === "command"} className="min-h-32 resize-y font-mono text-sm" onChange={(event) => onDraftChange(target, selectedIndex, { command: event.target.value })} />
                    <p className="text-xs text-muted-foreground">Runs from the repository root.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] sm:items-start sm:gap-5">
                    <div className="grid gap-2">
                      <Label htmlFor={`${target}-action-${selectedAction.id}-shell`}>Shell</Label>
                      <ActionShellSelect id={`${target}-action-${selectedAction.id}-shell`} value={selectedAction.shell} disabled={disabled} onValueChange={(shell) => onDraftChange(target, selectedIndex, { shell })} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${target}-action-${selectedAction.id}-description`}>Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Textarea id={`${target}-action-${selectedAction.id}-description`} value={selectedAction.description} disabled={disabled} className="min-h-20 resize-y" onChange={(event) => onDraftChange(target, selectedIndex, { description: event.target.value })} />
                    </div>
                  </div>
                  {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="grid h-full min-h-48 place-content-center px-6 text-center">
              <Workflow className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">Select an action to edit</p>
              <p className="mt-1 max-w-72 text-xs text-muted-foreground">Choose an action from the list, or add a new one to configure its command.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t bg-muted/15 px-5 py-3">
            <p className="text-xs text-muted-foreground">{dirty ? "This file has unsaved changes" : "No unsaved changes"}</p>
            <Button type="button" size="sm" disabled={disabled || !dirty} onClick={() => onSave(target)}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
              {isSaving ? "Saving" : `Save ${getActionFileLabel(target)}`}
            </Button>
          </div>
        </section>
      </div>
    </TabsContent>
  );
}

function ActionShellSelect({ id, value, disabled, onValueChange }: { id: string; value: GitConfiguredAction["shell"]; disabled: boolean; onValueChange: (shell: GitConfiguredAction["shell"]) => void }): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className="h-9 w-full justify-between px-3 font-normal"><span>{value}</span><ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => {
          if (isRepositoryActionShell(nextValue)) {
            onValueChange(nextValue);
          }
        }}>
          {GIT_CONFIGURED_ACTION_SHELLS.map((shell) => <DropdownMenuRadioItem key={shell} value={shell}>{shell}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function serializeActions(actions: GitConfiguredAction[]): string {
  return JSON.stringify(actions.map(({ name, description, command, shell }) => ({ name, description, command, shell })));
}

function findAvailableSelection(selectedId: string | null, actions: RepositoryActionDraft[]): string | null {
  if (selectedId && actions.some((action) => action.id === selectedId)) {
    return selectedId;
  }
  return actions[0]?.id ?? null;
}

function getValidation(error: string, actions: RepositoryActionDraft[]): FileValidation {
  if (!error) {
    return { actionId: null, field: null };
  }
  const numbered = error.match(/action (\d+) is missing a name/i);
  if (numbered) {
    return { actionId: actions[Number(numbered[1]) - 1]?.id ?? null, field: "name" };
  }
  const named = error.match(/action "([^"]+)" is missing a command/i);
  if (named) {
    const key = getRepositoryActionKey(named[1] ?? "");
    return { actionId: actions.find((action) => getRepositoryActionKey(action.name) === key)?.id ?? null, field: "command" };
  }
  return { actionId: null, field: null };
}

function formatDirtyFiles(dirty: Record<GitConfiguredActionFile, boolean>): string {
  if (dirty.shared && dirty.local) {
    return "Shared and Local actions";
  }
  return dirty.shared ? "Shared actions" : "Local actions";
}

function getActionFileLabel(target: GitConfiguredActionFile): string {
  return target === "shared" ? "Shared" : "Local";
}

function getRepositoryActionKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isRepositoryActionShell(value: string): value is GitConfiguredAction["shell"] {
  return GIT_CONFIGURED_ACTION_SHELLS.includes(value as GitConfiguredAction["shell"]);
}

function createFallbackActionFileConfig(target: GitConfiguredActionFile): GitConfiguredActionFileConfig {
  return {
    target,
    fileName: target === "shared" ? "actions.toml" : "actions.local.toml",
    exists: false,
    actions: [],
    error: "",
    writable: true,
    blockedReason: ""
  };
}
