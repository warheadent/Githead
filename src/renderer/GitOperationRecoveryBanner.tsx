import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Loader2,
  LockKeyhole,
  Play,
  RotateCcw,
  SkipForward
} from "lucide-react";
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
  onOpenConflictFile(path: string): void;
  onCancel(): void;
}

export function GitOperationRecoveryBanner({
  state,
  busy,
  cancellable,
  error,
  onAction,
  onOpenConflict,
  onOpenConflictFile,
  onCancel
}: GitOperationRecoveryBannerProps): ReactNode {
  const [confirmationAction, setConfirmationAction] = useState<"skip" | "keep-empty" | "abort" | null>(null);
  const operationName = formatOperationName(state);
  const operationKindName = formatOperationKindName(state.kind);
  const continueReason = state.actions.continue.disabledReason;
  const readyToContinue = !state.hasConflicts && state.actions.continue.enabled;
  const emptyCommit = state.phase === "empty-commit";
  const currentStep = readyToContinue || emptyCommit ? 3 : 1;
  const branchName = state.originalBranch ?? state.currentBranch;

  useEffect(() => {
    setConfirmationAction(null);
  }, [state.stateId]);

  const requestAction = (action: GitRepositoryOperationAction): void => {
    if ((action === "skip" || action === "keep-empty" || action === "abort") && state.actions[action].requiresConfirmation) {
      setConfirmationAction(action);
      return;
    }
    onAction(action);
  };

  return (
    <>
      <section
        className="border-b border-amber-500/35 bg-amber-500/[0.08] px-6 py-2.5"
        aria-label={`${operationName} recovery guide`}
        aria-busy={busy}
      >
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-amber-800 dark:text-amber-300">
                {operationName} recovery · Step {currentStep} of 3
                {state.sequence ? <span>· Commit {state.sequence.current} of {state.sequence.total}</span> : null}
                {branchName ? <span>· {branchName}</span> : null}
              </div>
              <div className="mt-0.5 flex min-w-0 items-baseline gap-2.5">
                <h3 className="shrink-0 text-sm font-semibold">Finish this {operationKindName.toLowerCase()}</h3>
                <p className="truncate text-[11px] text-muted-foreground" title={state.summary}>
                  {state.summary}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`${operationName} recovery options`}>
            {state.actions.skip.supported ? (
              <Button type="button" size="sm" variant="outline" disabled={busy || !state.actions.skip.enabled} onClick={() => requestAction("skip")}>
                <SkipForward />Skip commit…
              </Button>
            ) : null}
            {emptyCommit && state.actions["keep-empty"].supported ? (
              <Button type="button" size="sm" variant="outline" disabled={busy || !state.actions["keep-empty"].enabled} onClick={() => requestAction("keep-empty")}>
                <Check />Keep empty commit…
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled={busy || !state.actions.abort.enabled} onClick={() => requestAction("abort")}>
              <RotateCcw />Abort {operationKindName.toLowerCase()}…
            </Button>
            {busy && cancellable ? (
              <Button type="button" size="sm" variant="destructive" onClick={onCancel}>Cancel command</Button>
            ) : null}
          </div>
        </div>

        <ol className="mt-2 grid grid-cols-3 gap-1.5" aria-label="Recovery steps">
          <RecoveryStep
            number={1}
            status={readyToContinue || emptyCommit ? "complete" : "current"}
            title="Review and resolve"
            detail={readyToContinue
              ? "Complete"
              : formatConflictCount(state.conflictedPaths.length)}
          />
          <RecoveryStep
            number={2}
            status={readyToContinue || emptyCommit ? "complete" : "pending"}
            title="Stage resolutions"
            detail={readyToContinue
              ? "Complete"
              : "Stage below"}
          />
          <RecoveryStep
            number={3}
            status={readyToContinue || emptyCommit ? "current" : "locked"}
            title={emptyCommit ? "Choose empty result" : `Continue ${operationKindName.toLowerCase()}`}
            detail={emptyCommit
              ? "Action needed"
              : readyToContinue
              ? "Ready"
              : "Locked"}
          />
        </ol>

        {emptyCommit ? (
          <div className="mt-2 flex items-center justify-between gap-4 rounded-md border border-amber-500/35 bg-background/75 px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <p className="truncate text-xs font-semibold">This commit produces no changes. Choose Skip commit, Keep empty commit, or Abort above.</p>
            </div>
          </div>
        ) : state.conflictedPaths.length > 0 ? (
          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-amber-500/30 bg-background/75 px-2.5 py-1.5" aria-label="Conflicted files">
            <FileWarning className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span className="shrink-0 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {formatConflictCount(state.conflictedPaths.length)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium" title={state.conflictedPaths[0]}>{state.conflictedPaths[0]}</span>
            {state.conflictedPaths.length > 1 ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">+{state.conflictedPaths.length - 1} more</span>
            ) : null}
            <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => onOpenConflict(state.conflictedPaths[0]!)}>
              Resolve conflict
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => onOpenConflictFile(state.conflictedPaths[0]!)}>
              <ExternalLink className="size-3.5" />Open file
            </Button>
            <span className="ml-1 shrink-0 border-l pl-3 text-[11px] font-medium text-amber-800 dark:text-amber-300" title={continueReason ?? undefined}>
              Stage conflicts to unlock
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" disabled>
              <LockKeyhole />Continue {operationKindName.toLowerCase()}
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-4 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <p className="truncate text-xs font-semibold">All conflicts are staged. Git is ready to finish the {operationKindName.toLowerCase()}.</p>
            </div>
            <Button type="button" size="sm" className="h-7" disabled={busy || !state.actions.continue.enabled} onClick={() => requestAction("continue")}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />}
              Continue {operationKindName.toLowerCase()}
            </Button>
          </div>
        )}

        {error ? <p className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive" role="alert">{error}</p> : null}
      </section>

      <Dialog open={confirmationAction !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmationAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmationAction === "abort"
              ? `Abort ${operationKindName.toLowerCase()}?`
              : confirmationAction === "keep-empty"
                ? "Keep an empty commit?"
                : `Skip the current ${operationKindName.toLowerCase()} commit?`}</DialogTitle>
            <DialogDescription>
              {confirmationAction === "abort"
                ? "Git may discard conflict-resolution work made during this operation. Untracked files are not automatically removed."
                : confirmationAction === "keep-empty"
                  ? "Git will create a commit with the original message but no file changes, then continue the cherry-pick sequence."
                : "Git will discard conflict-resolution work for the current commit and omit that commit from the sequence."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmationAction(null)}>Go back</Button>
            <Button
              type="button"
              variant={confirmationAction === "keep-empty" ? "default" : "destructive"}
              disabled={busy || confirmationAction === null}
              onClick={() => {
                if (!confirmationAction) return;
                const action = confirmationAction;
                setConfirmationAction(null);
                onAction(action);
              }}
            >
              {confirmationAction === "abort" ? "Abort operation" : confirmationAction === "keep-empty" ? "Keep empty commit" : "Skip commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecoveryStep({
  number,
  status,
  title,
  detail
}: {
  number: number;
  status: "complete" | "current" | "pending" | "locked";
  title: string;
  detail: string;
}): ReactNode {
  const complete = status === "complete";
  const current = status === "current";
  return (
    <li
      className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 ${
        complete
          ? "border-emerald-500/35 bg-emerald-500/10"
          : current
            ? "border-amber-500/45 bg-background shadow-sm"
            : "border-border/70 bg-muted/35"
      }`}
      aria-current={current ? "step" : undefined}
    >
      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        complete
          ? "bg-emerald-600 text-white"
          : current
            ? "bg-amber-500 text-amber-950"
            : "border bg-background text-muted-foreground"
      }`}>
        {complete ? <Check className="size-3" aria-hidden="true" /> : status === "locked" ? <LockKeyhole className="size-2.5" aria-hidden="true" /> : number}
      </span>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <p className="truncate text-xs font-semibold">{title}</p>
        <p className="shrink-0 text-[10px] text-muted-foreground">· {detail}</p>
      </div>
    </li>
  );
}

function formatConflictCount(count: number): string {
  return `${count} unresolved ${count === 1 ? "file" : "files"}`;
}

function formatOperationKindName(kind: GitRepositoryOperationState["kind"]): string {
  if (kind === "cherry-pick") return "Cherry-pick";
  return `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;
}

function formatOperationName(state: GitRepositoryOperationState): string {
  const name = formatOperationKindName(state.kind);
  return state.kind === "rebase" && state.backend ? `${name} (${state.backend} backend)` : name;
}
