import { AlertTriangle, GitCompareArrows, History, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GitPullRecovery, GitPullRecoveryAction } from "../shared/types";

export interface PullRecoveryDialogProps {
  recovery: GitPullRecovery | null;
  open: boolean;
  busy: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onAction: (action: GitPullRecoveryAction) => void;
  onReview: () => void;
  onOpenFileStatus: () => void;
  onOpenActivityLog: () => void;
  onCancel: () => void;
}

export function PullRecoveryDialog({
  recovery,
  open,
  busy,
  error,
  onOpenChange,
  onAction,
  onReview,
  onOpenFileStatus,
  onOpenActivityLog,
  onCancel
}: PullRecoveryDialogProps): ReactNode {
  const localCommitLabel = `${recovery?.localCommitCount ?? 0} local ${recovery?.localCommitCount === 1 ? "commit" : "commits"}`;
  const isConflict = recovery?.phase === "rebase-conflicts";
  const canReapply = Boolean(recovery?.canReapply && recovery.localCommitCount > 0 && !recovery.hasWorkingChanges);
  const canMatch = Boolean(recovery && !recovery.hasWorkingChanges);

  return (
    <Dialog open={open && Boolean(recovery)} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl" aria-busy={busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {isConflict ? "Reapply paused because of conflicts" : "Remote branch history changed"}
          </DialogTitle>
          <DialogDescription>
            {isConflict
              ? "Resolve the conflicting files, then continue. You can also abort and return to the branch state from before recovery."
              : `${recovery?.upstreamName ?? "The remote branch"} was rewritten. Githead did not change your local branch or working files.`}
          </DialogDescription>
        </DialogHeader>

        {recovery ? (
          <div className="grid gap-4">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-md border bg-muted/20 p-4 text-sm">
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="min-w-0 truncate font-medium">{recovery.branchName}</dd>
              <dt className="text-muted-foreground">Remote change</dt>
              <dd className="font-mono text-xs">{shortOid(recovery.oldUpstreamOid)} → {shortOid(recovery.newUpstreamOid)}</dd>
              <dt className="text-muted-foreground">Local work</dt>
              <dd>{localCommitLabel}</dd>
              <dt className="text-muted-foreground">Working files</dt>
              <dd>{recovery.hasWorkingChanges ? "Changes present" : "Clean"}</dd>
            </dl>

            {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}

            {isConflict ? (
              <div className="grid gap-2">
                <Button type="button" onClick={onOpenFileStatus} disabled={busy} className="justify-start">
                  <GitCompareArrows />Open File Status
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => onAction("abort")} disabled={busy}>
                    <RotateCcw />Abort and restore
                  </Button>
                  <Button type="button" onClick={() => onAction("continue")} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                    Continue after resolution
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {recovery.hasWorkingChanges ? (
                  <p className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
                    Commit or stash working-file changes before recovery. Githead will not discard them.
                  </p>
                ) : null}
                <Button type="button" onClick={() => onAction(recovery.localCommitCount > 0 ? "reapply" : "match")} disabled={busy || (recovery.localCommitCount > 0 ? !canReapply : !canMatch)} className="justify-start">
                  {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  {recovery.localCommitCount > 0 ? `Reapply my ${localCommitLabel}` : "Match the remote branch"}
                </Button>
                {recovery.localCommitCount > 0 ? (
                  <Button type="button" variant="outline" onClick={() => onAction("match")} disabled={busy || !canMatch} className="justify-start">
                    <RotateCcw />Match the remote branch
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={onReview} disabled={busy} className="justify-start">
                  <History />Review commit history
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={onOpenActivityLog} disabled={busy}>View activity log</Button>
          {busy
            ? <Button type="button" variant="destructive" onClick={onCancel}>Cancel operation</Button>
            : <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Keep current branch</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function shortOid(oid: string): string {
  return oid.slice(0, 8);
}
