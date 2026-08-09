import { AlertTriangle, CheckCircle2, GitCommitHorizontal, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  GitAmendEntryPoint,
  GitAmendExecuteRequest,
  GitAmendMode,
  GitAmendPreview,
  GitAmendRecoveryPoint,
  GitAmendRestoreRequest,
  GitAmendRestoreResult,
  GitAmendResult
} from "../shared/types";

interface AmendDialogProps {
  open: boolean;
  repoPath: string;
  source: GitAmendEntryPoint;
  busy: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onRun: (request: GitAmendExecuteRequest) => Promise<GitAmendResult | null>;
  onRestore: (request: GitAmendRestoreRequest) => Promise<GitAmendRestoreResult | null>;
}

export function AmendDialog({
  open,
  repoPath,
  source,
  busy,
  returnFocusRef,
  onOpenChange,
  onRun,
  onRestore
}: AmendDialogProps): ReactNode {
  const [mode, setMode] = useState<GitAmendMode | null>(null);
  const [preview, setPreview] = useState<GitAmendPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<GitAmendResult | GitAmendRestoreResult | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<GitAmendRecoveryPoint | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadedHeadRef = useRef("");

  useEffect(() => {
    if (!open) {
      setMode(null);
      setPreview(null);
      setMessage("");
      setLoading(false);
      setError("");
      setStale(false);
      setResult(null);
      setRestoreTarget(null);
      loadedHeadRef.current = "";
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void window.githead.getAmendPreview({
      repoPath,
      source,
      ...(mode ? { mode } : {})
    }).then((next) => {
      if (cancelled) return;
      setLoading(false);
      if (!next.preview) {
        setPreview(null);
        setError(next.message);
        return;
      }
      setPreview(next.preview);
      setMode(next.preview.mode);
      setStale(false);
      if (loadedHeadRef.current !== next.preview.headOid) {
        loadedHeadRef.current = next.preview.headOid;
        setMessage(next.preview.message);
      }
      if (next.outcome === "blocked") setError(next.message);
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setLoading(false);
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "Unable to load the amend preview.");
    });
    return () => { cancelled = true; };
  }, [mode, open, refreshVersion, repoPath, source]);

  const selectedMode = mode ?? preview?.mode ?? "message-only";
  const selectedMessage = selectedMode === "staged-keep" ? preview?.message ?? "" : message;
  const messageInvalid = selectedMode !== "staged-keep" && !selectedMessage.trim();
  const unchangedMessage = selectedMode === "message-only"
    && normalizeMessage(selectedMessage) === normalizeMessage(preview?.message ?? "");
  const canConfirm = Boolean(
    preview
    && !loading
    && !busy
    && !stale
    && preview.blockingReasons.length === 0
    && !messageInvalid
    && !unchangedMessage
  );
  const latestRecovery = preview?.recoveryPoints[0] ?? null;
  const successRecovery = result?.outcome === "completed" && result.recoveryRef
    ? preview?.recoveryPoints.find((point) => point.ref === result.recoveryRef) ?? null
    : null;

  const submit = async (): Promise<void> => {
    if (!preview || !canConfirm) return;
    setError("");
    const next = await onRun({
      repoPath,
      source,
      mode: selectedMode,
      message: selectedMessage,
      expectedSnapshotId: preview.snapshotId
    });
    if (!next) return;
    setResult(next);
    if (next.outcome === "completed") {
      setRefreshVersion((value) => value + 1);
      return;
    }
    setError(next.message || next.stderr || "Git could not amend the commit.");
    if (next.outcome === "stale" || next.amendErrorKind === "stale") setStale(true);
  };

  const restore = async (): Promise<void> => {
    if (!restoreTarget || busy) return;
    setError("");
    const next = await onRestore({
      repoPath,
      recoveryRef: restoreTarget.ref,
      expectedRestoreToken: restoreTarget.restoreToken
    });
    if (!next) return;
    setResult(next);
    setRestoreTarget(null);
    if (next.outcome === "completed") {
      loadedHeadRef.current = "";
      setMode(null);
      setRefreshVersion((value) => value + 1);
    } else {
      setError(next.message || next.stderr || "Git could not restore the old commit.");
      if (next.outcome === "stale") setStale(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"
        aria-busy={loading || busy}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <p className="eyebrow">Commit history</p>
          <DialogTitle>Amend last commit</DialogTitle>
          <DialogDescription>
            Amend creates a replacement commit with a new commit ID. Githead does not push it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {loading && !preview ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" />
              Loading amend preview
            </div>
          ) : result?.outcome === "completed" ? (
            <div className="grid gap-4" role="status" aria-live="polite">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="font-medium"><CheckCircle2 className="mr-2 inline size-4" />{result.message}</p>
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Old commit</dt><dd><code>{result.previousHeadOid?.slice(0, 12)}</code></dd>
                  <dt className="text-muted-foreground">Current commit</dt><dd><code>{result.headOid?.slice(0, 12)}</code></dd>
                  <dt className="text-muted-foreground">Recovery</dt><dd className="truncate"><code>{shortRecoveryRef(result.recoveryRef)}</code></dd>
                </dl>
              </div>
              {"viewRefreshWarning" in result && result.viewRefreshWarning ? (
                <p className="rounded-md border border-amber-500/45 bg-amber-500/10 p-3 text-sm" role="alert">
                  <AlertTriangle className="mr-2 inline size-4" />{result.viewRefreshWarning}
                </p>
              ) : null}
              {successRecovery ? (
                <RecoveryCard point={successRecovery} onRestore={() => setRestoreTarget(successRecovery)} />
              ) : result.recoveryRef ? (
                <p className="text-sm text-muted-foreground">Loading the recovery point…</p>
              ) : null}
            </div>
          ) : preview ? (
            <div className="grid gap-4">
              <CommitFacts preview={preview} />
              <PublicationNotice preview={preview} />

              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Amend mode</legend>
                <ModeOption
                  mode="message-only"
                  selected={selectedMode}
                  disabled={busy}
                  title="Change message only"
                  detail="Change the last commit message. Keep staged and unstaged changes out of the replacement commit."
                  onChange={setMode}
                />
                <ModeOption
                  mode="staged-edit"
                  selected={selectedMode}
                  disabled={busy || preview.stagedFiles.length === 0}
                  title="Add staged changes and edit message"
                  detail="Add the current index and use the message below. Unstaged files stay unchanged."
                  onChange={setMode}
                />
                <ModeOption
                  mode="staged-keep"
                  selected={selectedMode}
                  disabled={busy || preview.stagedFiles.length === 0}
                  title="Add staged changes and keep message"
                  detail="Add the current index and keep the existing full message. Unstaged files stay unchanged."
                  onChange={setMode}
                />
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor="amend-commit-message">Commit message</Label>
                <Textarea
                  id="amend-commit-message"
                  rows={6}
                  value={selectedMode === "staged-keep" ? preview.message : message}
                  disabled={busy || selectedMode === "staged-keep"}
                  onChange={(event) => {
                    setMessage(event.currentTarget.value);
                    setError("");
                    setStale(false);
                  }}
                />
                {unchangedMessage ? <p className="text-xs text-muted-foreground">Change the message to use message-only amend.</p> : null}
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Staged files that can be added</p>
                  <Badge variant="outline">{preview.stagedFiles.length}</Badge>
                </div>
                <div className="max-h-32 overflow-auto rounded-md border">
                  {preview.stagedFiles.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No staged files.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {preview.stagedFiles.map((file) => (
                        <li key={`${file.originalPath ?? ""}:${file.path}`} className="flex gap-3 px-3 py-2">
                          <code className="w-5 text-muted-foreground">{file.status}</code>
                          <span className="min-w-0 truncate">{file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {latestRecovery ? (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Latest amend recovery point</p>
                  <RecoveryCard point={latestRecovery} onRestore={() => setRestoreTarget(latestRecovery)} />
                  <p className="text-xs text-muted-foreground">Githead keeps the 20 newest amend recovery refs. These refs are hidden from normal history.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {restoreTarget ? (
            <div className="mt-4 grid gap-3 rounded-md border border-amber-500/45 bg-amber-500/10 p-4" role="alertdialog" aria-label="Confirm amend recovery restore">
              <p className="font-medium">Restore {restoreTarget.shortOid} as HEAD?</p>
              <p className="text-sm">Githead will use a soft reset. It will keep the index and working files. Changes from newer commits may become staged. Githead will not use a hard reset.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setRestoreTarget(null)}>Keep current commit</Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => { void restore(); }}>
                  {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restore old commit
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {result?.outcome === "completed" ? "Close" : "Cancel"}
          </Button>
          {!result || result.outcome !== "completed" ? (
            <Button type="button" disabled={!canConfirm} onClick={() => { void submit(); }}>
              {busy ? <Loader2 className="animate-spin" /> : <GitCommitHorizontal />}
              Amend last commit
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitFacts({ preview }: { preview: GitAmendPreview }): ReactNode {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{preview.subject || "Untitled commit"}</p>
          <p className="mt-1 text-sm text-muted-foreground"><code>{preview.shortHeadOid}</code> · {preview.currentBranch ?? "Detached HEAD"}</p>
        </div>
        <Badge variant="outline">HEAD</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Author</dt><dd>{preview.authorName} &lt;{preview.authorEmail}&gt;</dd>
        <dt className="text-muted-foreground">Commit date</dt><dd>{formatDate(preview.commitDate)}</dd>
        <dt className="text-muted-foreground">Upstream</dt><dd>{preview.upstream ?? "Not configured"}</dd>
        <dt className="text-muted-foreground">Published</dt><dd>{publicationLabel(preview.publication)}</dd>
      </dl>
    </div>
  );
}

function PublicationNotice({ preview }: { preview: GitAmendPreview }): ReactNode {
  if (preview.publication === "published") {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
        <p className="font-medium"><AlertTriangle className="mr-2 inline size-4" />Published history</p>
        <p className="mt-1 text-sm">Amending this commit rewrites published history. Pushing it again may require Force with Lease.</p>
        {preview.publishedRefs.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">Fetched remote refs: {preview.publishedRefs.join(", ")}</p> : null}
      </div>
    );
  }
  if (preview.publication === "local-ahead") {
    return <p className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm" role="status">This commit appears local and ahead of {preview.upstream}. Amend will not push it.</p>;
  }
  if (!preview.currentBranch) {
    return <p className="rounded-md border border-amber-500/45 bg-amber-500/10 p-3 text-sm" role="status"><AlertTriangle className="mr-2 inline size-4" />HEAD is detached. Amend replaces the detached commit and does not move a branch.</p>;
  }
  return <p className="rounded-md border p-3 text-sm text-muted-foreground" role="status">This commit does not appear in a fetched remote ref. Amend will not push it.</p>;
}

function ModeOption({
  mode,
  selected,
  disabled,
  title,
  detail,
  onChange
}: {
  mode: GitAmendMode;
  selected: GitAmendMode;
  disabled: boolean;
  title: string;
  detail: string;
  onChange: (mode: GitAmendMode) => void;
}): ReactNode {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 has-checked:border-primary has-checked:bg-primary/5">
      <input
        type="radio"
        name="amend-mode"
        value={mode}
        checked={selected === mode}
        disabled={disabled}
        className="mt-1"
        onChange={() => onChange(mode)}
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

function RecoveryCard({ point, onRestore }: { point: GitAmendRecoveryPoint; onRestore: () => void }): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{point.subject || "Untitled commit"}</p>
        <p className="mt-1 text-xs text-muted-foreground"><code>{point.shortOid}</code> · {formatDate(point.commitDate)}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRestore}><RotateCcw />Restore…</Button>
    </div>
  );
}

function publicationLabel(publication: GitAmendPreview["publication"]): string {
  if (publication === "published") return "Yes, in a fetched remote ref";
  if (publication === "local-ahead") return "No, local and ahead";
  if (publication === "local") return "No fetched remote match";
  return "Could not confirm";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function shortRecoveryRef(value: string | null): string {
  return value?.replace("refs/githead/amend-recovery/", "") ?? "Not available";
}

function normalizeMessage(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}
