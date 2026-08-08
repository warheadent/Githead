import { AlertTriangle, FileWarning, Loader2, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GitRepositoryOperationAction, GitRepositoryOperationState } from "../shared/types";

export interface GitOperationRecoveryBannerProps {
  state: GitRepositoryOperationState;
  busy: boolean;
  cancellable: boolean;
  error: string;
  onAction(action: GitRepositoryOperationAction): void;
  onOpenConflict(path: string): void;
  onCancel(): void;
}

export function GitOperationRecoveryBanner({
  state,
  busy,
  cancellable,
  error,
  onAction,
  onOpenConflict,
  onCancel
}: GitOperationRecoveryBannerProps): ReactNode {
  const [confirmationAction, setConfirmationAction] = useState<"skip" | "abort" | null>(null);
  const operationName = formatOperationName(state);
  const continueReason = state.actions.continue.disabledReason;

  useEffect(() => {
    setConfirmationAction(null);
  }, [state.stateId]);

  const requestAction = (action: GitRepositoryOperationAction): void => {
    if ((action === "skip" || action === "abort") && state.actions[action].requiresConfirmation) {
      setConfirmationAction(action);
      return;
    }
    onAction(action);
  };

  return (
    <>
      <section
        className="border-b border-amber-500/35 bg-amber-500/10 px-6 py-3"
        aria-label={`${operationName} recovery`}
        aria-busy={busy}
      >
        <div className="flex min-w-0 items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{operationName} in progress</h3>
              {state.sequence ? (
                <span className="rounded-full border border-amber-500/35 bg-background/70 px-2 py-0.5 text-[11px] font-medium">
                  {state.sequence.current} of {state.sequence.total}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{state.summary}</p>
            {state.originalBranch || state.currentBranch ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {state.originalBranch ? <>Original branch: <span className="font-medium text-foreground">{state.originalBranch}</span></> : null}
                {state.originalBranch && state.currentBranch && state.originalBranch !== state.currentBranch ? " · " : null}
                {state.currentBranch && state.originalBranch !== state.currentBranch ? <>Current branch: <span className="font-medium text-foreground">{state.currentBranch}</span></> : null}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`${operationName} recovery actions`}>
            {state.actions.skip.supported ? (
              <Button type="button" size="sm" variant="outline" disabled={busy || !state.actions.skip.enabled} onClick={() => requestAction("skip")}>
                <SkipForward />Skip
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled={busy || !state.actions.abort.enabled} onClick={() => requestAction("abort")}>
              <RotateCcw />Abort
            </Button>
            <Button type="button" size="sm" disabled={busy || !state.actions.continue.enabled} onClick={() => requestAction("continue")}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />}
              Continue
            </Button>
            {busy && cancellable ? (
              <Button type="button" size="sm" variant="destructive" onClick={onCancel}>Cancel command</Button>
            ) : null}
          </div>
        </div>

        {continueReason ? <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">Continue is disabled: {continueReason}</p> : null}
        {state.conflictedPaths.length > 0 ? (
          <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto" aria-label="Conflicted files">
            {state.conflictedPaths.map((filePath) => (
              <Button key={filePath} type="button" size="sm" variant="outline" className="h-7 max-w-full bg-background/70 px-2 text-xs" disabled={busy} onClick={() => onOpenConflict(filePath)}>
                <FileWarning className="size-3.5" />
                <span className="truncate">{filePath}</span>
              </Button>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive" role="alert">{error}</p> : null}
      </section>

      <Dialog open={confirmationAction !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmationAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmationAction === "abort" ? `Abort ${operationName.toLowerCase()}?` : `Skip the current ${operationName.toLowerCase()} commit?`}</DialogTitle>
            <DialogDescription>
              {confirmationAction === "abort"
                ? "Git may discard conflict-resolution work made during this operation. Untracked files are not automatically removed."
                : "Git will discard conflict-resolution work for the current commit and omit that commit from the sequence."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmationAction(null)}>Keep resolving</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || confirmationAction === null}
              onClick={() => {
                if (!confirmationAction) return;
                const action = confirmationAction;
                setConfirmationAction(null);
                onAction(action);
              }}
            >
              {confirmationAction === "abort" ? "Abort operation" : "Skip commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatOperationName(state: GitRepositoryOperationState): string {
  if (state.kind === "cherry-pick") return "Cherry-pick";
  const name = `${state.kind[0]?.toUpperCase() ?? ""}${state.kind.slice(1)}`;
  return state.kind === "rebase" && state.backend ? `${name} (${state.backend} backend)` : name;
}
