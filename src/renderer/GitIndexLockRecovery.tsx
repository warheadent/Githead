import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GitIndexLockInspection, GitOperationResult } from "../shared/types";
import { isGitIndexLockError } from "../shared/gitIndexLock";

interface Props {
  repoPath: string;
  operationResult: GitOperationResult | null;
  actionResult: GitOperationResult | null;
  busy: boolean;
  onRemove: (fingerprint: string) => Promise<GitOperationResult | null>;
}

export function GitIndexLockRecovery({ repoPath, operationResult, actionResult, busy, onRemove }: Props) {
  const seen = useRef(new WeakSet<object>());
  const [failure, setFailure] = useState<GitOperationResult | null>(null);
  useEffect(() => {
    if (busy) return;
    const results = [operationResult, actionResult].filter((result): result is GitOperationResult => result !== null && !seen.current.has(result));
    for (const result of results) seen.current.add(result);
    const lockFailure = results.find((result) => result.repoPath === repoPath && result.exitCode !== 0 && isGitIndexLockError(result.stderr));
    if (lockFailure) setFailure(lockFailure);
  }, [operationResult, actionResult, repoPath, busy]);

  return failure ? <IndexLockDialog repoPath={repoPath} busy={busy} onClose={() => setFailure(null)} onRemove={onRemove} /> : null;
}

function IndexLockDialog({ repoPath, busy, onClose, onRemove }: Pick<Props, "repoPath" | "busy" | "onRemove"> & { onClose: () => void }) {
  const [inspection, setInspection] = useState<GitIndexLockInspection | null>(null);
  const [checking, setChecking] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setChecking(true);
    setConfirmed(false);
    setInspection(null);
    setError("");
    void window.githead.inspectGitIndexLock({ repoPath, operationId: crypto.randomUUID() }).then((result) => {
      if (!current) return;
      setInspection(result);
      if (result.exitCode !== 0) setError(result.stderr);
    }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : "Unable to check the index lock.");
    }).finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [repoPath, revision]);

  const remove = async () => {
    if (!inspection?.lock || !confirmed || busy || deleting || checking) return;
    setDeleting(true);
    setError("");
    try {
      const result = await onRemove(inspection.lock.fingerprint);
      if (result?.exitCode === 0) { onClose(); return; }
      setError(result?.stderr || "The lock was not deleted. Check again before retrying.");
      setInspection(null);
      setConfirmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete the index lock.");
      setInspection(null);
      setConfirmed(false);
    } finally {
      setDeleting(false);
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
    <DialogContent showCloseButton={!deleting}>
      <DialogHeader>
        <DialogTitle>Recover Git index lock</DialogTitle>
        <DialogDescription>
          A lock blocked the last action. It may remain after a Git process stops unexpectedly.
          Close other Git clients and let any Git commands finish before deleting it.
        </DialogDescription>
      </DialogHeader>
      {checking ? <p role="status" className="text-sm text-muted-foreground">Checking the lock and running Git processes…</p> : null}
      {inspection?.lock ? <>
        <div className="rounded-md border p-3 text-sm">
          <p className="selectable-text break-all font-mono">{inspection.lock.path}</p>
          <p className="mt-2 text-muted-foreground">Last modified {new Date(inspection.lock.modifiedAt).toLocaleString()}</p>
        </div>
        <p className="text-sm text-muted-foreground">No running Git process was detected. This does not prove the lock is unused. Deleting an active lock can interfere with another Git operation.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={confirmed} disabled={deleting || busy} onChange={(event) => setConfirmed(event.target.checked)} />
          No Git operation is running for this repository.
        </label>
      </> : null}
      {error ? <p role="alert" className="selectable-text text-sm text-destructive">{error}</p> : null}
      <p className="text-sm text-muted-foreground">Only the lock file will be deleted. Your staged changes will be kept. Retry the failed action after recovery.</p>
      <DialogFooter>
        <Button variant="outline" disabled={deleting} onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={checking || deleting || busy} onClick={() => setRevision((value) => value + 1)}>Check again</Button>
        <Button variant="destructive" disabled={!inspection?.lock || !confirmed || checking || deleting || busy} onClick={() => { void remove(); }}>{deleting ? "Deleting…" : "Delete lock"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
