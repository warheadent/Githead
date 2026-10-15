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
import { OperationBanner } from "./OperationBanner";

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

  const kindLabel = operationKindName.toLowerCase();
  const firstConflict = state.conflictedPaths[0];
  const conflictsLocked = !emptyCommit && firstConflict !== undefined;

  return (
    <>
      <OperationBanner
        ariaLabel={`${operationName} recovery guide`}
        busy={busy}
        title={`Finish this ${kindLabel}`}
        description={state.summary}
        actionsLabel={`${operationName} recovery options`}
        actions={(
          <>
            {conflictsLocked ? (
              <>
                <Button type="button" size="xs" variant="ghost" title={firstConflict} disabled={busy} onClick={() => onOpenConflict(firstConflict)}>
                  Resolve conflict
                </Button>
                <Button type="button" size="xs" variant="ghost" title={firstConflict} disabled={busy} onClick={() => onOpenConflictFile(firstConflict)}>
                  <ExternalLink />Open file
                </Button>
              </>
            ) : null}
            {state.actions.skip.supported ? (
              <Button type="button" size="xs" variant="outline" disabled={busy || !state.actions.skip.enabled} onClick={() => requestAction("skip")}>
                <SkipForward />Skip commit…
              </Button>
            ) : null}
            {emptyCommit && state.actions["keep-empty"].supported ? (
              <Button type="button" size="xs" variant="outline" disabled={busy || !state.actions["keep-empty"].enabled} onClick={() => requestAction("keep-empty")}>
                <Check />Keep empty commit…
              </Button>
            ) : null}
            <Button type="button" size="xs" variant="outline" disabled={busy || !state.actions.abort.enabled} onClick={() => requestAction("abort")}>
              <RotateCcw />Abort {kindLabel}…
            </Button>
            {busy && cancellable ? (
              <Button type="button" size="xs" variant="destructive" onClick={onCancel}>Cancel command</Button>
            ) : null}
            {conflictsLocked ? (
              <>
                <span className="operation-banner-hint" title={continueReason ?? undefined}>Stage conflicts to unlock</span>
                <Button type="button" size="xs" disabled>
                  <LockKeyhole />Continue {kindLabel}
                </Button>
              </>
            ) : emptyCommit ? null : (
              <Button type="button" size="xs" disabled={busy || !state.actions.continue.enabled} onClick={() => requestAction("continue")}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                Continue {kindLabel}
              </Button>
            )}
          </>
        )}
      >
        <span className="operation-banner-meta">
          {operationName} recovery · Step {currentStep} of 3
          {state.sequence ? <> · Commit {state.sequence.current} of {state.sequence.total}</> : null}
          {branchName ? <> · {branchName}</> : null}
        </span>
        <ol className="operation-banner-steps" aria-label="Recovery steps">
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
            title={emptyCommit ? "Choose empty result" : `Continue ${kindLabel}`}
            detail={emptyCommit
              ? "Action needed"
              : readyToContinue
              ? "Ready"
              : "Locked"}
          />
        </ol>
        {emptyCommit ? (
          <span className="operation-banner-note">
            <AlertTriangle aria-hidden="true" />
            This commit produces no changes. Choose Skip commit, Keep empty commit, or Abort.
          </span>
        ) : conflictsLocked ? (
          <span className="operation-banner-note" title={firstConflict}>
            <FileWarning aria-hidden="true" />
            <strong>{formatConflictCount(state.conflictedPaths.length)}</strong>
            <span className="operation-banner-path">{firstConflict}</span>
            {state.conflictedPaths.length > 1 ? <span className="operation-banner-muted">+{state.conflictedPaths.length - 1} more</span> : null}
          </span>
        ) : (
          <span className="operation-banner-note" data-tone="success">
            <CheckCircle2 aria-hidden="true" />
            All conflicts are staged. Git is ready to finish the {kindLabel}.
          </span>
        )}
        {error ? <p className="dialog-error operation-banner-error" role="alert">{error}</p> : null}
      </OperationBanner>

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
  return (
    <li className="operation-banner-step" data-status={status} aria-current={status === "current" ? "step" : undefined}>
      <span className="operation-banner-step-marker">
        {status === "complete" ? <Check aria-hidden="true" /> : status === "locked" ? <LockKeyhole aria-hidden="true" /> : number}
      </span>
      <span className="operation-banner-step-title">{title}</span>
      <span className="operation-banner-muted">· {detail}</span>
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
