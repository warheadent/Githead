import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileWarning,
  GitMerge,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type {
  GitConflictResolution,
  GitConflictResolutionSaveRequest,
  GitRepositoryOperationState
} from "../shared/types";
import { containsGitConflictMarkers } from "../shared/conflictMarkers";

export interface ConflictResolutionDialogProps {
  open: boolean;
  repoPath: string;
  initialPath: string | null;
  operation: GitRepositoryOperationState | null;
  busy: boolean;
  onOpenChange(open: boolean): void;
  onOpenFile(path: string): void;
  onSave(request: GitConflictResolutionSaveRequest): Promise<string | null>;
}

export function ConflictResolutionDialog({
  open,
  repoPath,
  initialPath,
  operation,
  busy,
  onOpenChange,
  onOpenFile,
  onSave
}: ConflictResolutionDialogProps): ReactNode {
  const [selectedPath, setSelectedPath] = useState(initialPath ?? "");
  const [resolution, setResolution] = useState<GitConflictResolution | null>(null);
  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const loadGeneration = useRef(0);
  const conflictedPaths = operation?.conflictedPaths ?? [];

  useEffect(() => {
    if (!open) return;
    if (initialPath && conflictedPaths.includes(initialPath)) {
      setSelectedPath(initialPath);
      return;
    }
    if (!conflictedPaths.includes(selectedPath)) setSelectedPath(conflictedPaths[0] ?? "");
  }, [conflictedPaths, initialPath, open, selectedPath]);

  useEffect(() => {
    if (open && operation && conflictedPaths.length === 0) onOpenChange(false);
  }, [conflictedPaths.length, onOpenChange, open, operation]);

  useEffect(() => {
    if (!open || !operation || !selectedPath) return;
    const generation = ++loadGeneration.current;
    const requestId = `conflict-resolution:${generation}:${Date.now()}`;
    setLoading(true);
    setError("");
    setResolution(null);
    void window.githead.getConflictResolution({
      repoPath,
      path: selectedPath,
      expectedKind: operation.kind,
      expectedStateId: operation.stateId,
      requestId
    }).then((next) => {
      if (generation !== loadGeneration.current) return;
      setResolution(next);
      if (next.outcome === "ready") {
        setResultText(next.workingText ?? "");
      } else {
        setResultText("");
        setError(next.message);
      }
    }).catch((loadError: unknown) => {
      if (generation !== loadGeneration.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load this conflict.");
    }).finally(() => {
      if (generation === loadGeneration.current) setLoading(false);
    });
    return () => {
      if (generation === loadGeneration.current) loadGeneration.current += 1;
      void window.githead.cancelRepositoryRead({ requestId }).catch(() => undefined);
    };
  }, [open, operation, reloadGeneration, repoPath, selectedPath]);

  const hasMarkers = containsGitConflictMarkers(resultText);
  const ready = resolution?.outcome === "ready" && Boolean(resolution.workingHash);
  const changed = ready && resultText !== (resolution.workingText ?? "");
  const position = Math.max(0, conflictedPaths.indexOf(selectedPath));
  const labels = useMemo(() => conflictSideLabels(operation?.kind), [operation?.kind]);

  const save = useCallback(async (): Promise<void> => {
    if (!operation || !resolution?.workingHash || hasMarkers) return;
    setError("");
    const saveError = await onSave({
      repoPath,
      path: selectedPath,
      expectedKind: operation.kind,
      expectedStateId: operation.stateId,
      expectedWorkingHash: resolution.workingHash,
      resolvedText: resultText
    });
    if (saveError) {
      setError(saveError);
      if (/changed|reload/i.test(saveError)) setReloadGeneration((value) => value + 1);
      return;
    }
    onOpenChange(false);
  }, [hasMarkers, onOpenChange, onSave, operation, repoPath, resolution?.workingHash, resultText, selectedPath]);

  return (
    <Dialog open={open && Boolean(operation)} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
      <DialogContent
        className="h-[min(84vh,760px)] w-[min(94vw,1180px)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-none"
        aria-busy={busy || loading}
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <GitMerge className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">Resolve {selectedPath || "conflict"}</DialogTitle>
              <DialogDescription className="mt-1">
                {operation ? `${formatOperation(operation.kind)} recovery · Conflict ${position + 1} of ${conflictedPaths.length}` : "Conflict recovery"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[190px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r bg-muted/20 p-3" aria-label="Unresolved files">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Unresolved files · {conflictedPaths.length}
            </p>
            <div className="grid gap-1">
              {conflictedPaths.map((filePath, index) => (
                <button
                  key={filePath}
                  type="button"
                  className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${filePath === selectedPath ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-accent/60"}`}
                  aria-current={filePath === selectedPath ? "true" : undefined}
                  disabled={busy}
                  onClick={() => setSelectedPath(filePath)}
                >
                  <FileWarning className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" title={filePath}>{filePath}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/10 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                Compare both sides, edit the result, then stage it. Nothing is selected automatically.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={busy || loading} onClick={() => setReloadGeneration((value) => value + 1)}>
                  <RefreshCw />Reload
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || !selectedPath} onClick={() => onOpenFile(selectedPath)}>
                  <ExternalLink />Open in editor
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-0 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />Loading conflict versions…
              </div>
            ) : ready && resolution ? (
              <div className="grid min-h-0 grid-cols-3 divide-x">
                <ConflictSide title={labels.current} detail="Read-only" text={resolution.currentText} tone="current" />

                <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-background" aria-label="Resolution result">
                  <div className="flex items-start justify-between gap-3 border-b border-t-2 border-t-emerald-500 px-3 py-2.5">
                    <div>
                      <h3 className="text-xs font-semibold">Result</h3>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Editable working file</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${hasMarkers ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>
                      {hasMarkers ? "Markers remain" : "Ready to stage"}
                    </span>
                  </div>
                  <div className="grid h-10 grid-cols-3 items-center gap-1 border-b bg-muted/20 px-3">
                    <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setResultText(resolution.currentText ?? "")}>Use current</Button>
                    <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setResultText(joinConflictSides(resolution.currentText, resolution.incomingText))}>Use both</Button>
                    <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => setResultText(resolution.incomingText ?? "")}>Use incoming</Button>
                  </div>
                  <Textarea
                    aria-label="Resolved file content"
                    className="h-full min-h-0 resize-none rounded-none border-0 bg-background p-3 font-mono text-xs leading-5 shadow-none focus-visible:ring-0"
                    spellCheck={false}
                    wrap="off"
                    value={resultText}
                    disabled={busy}
                    onChange={(event) => setResultText(event.currentTarget.value)}
                  />
                </section>

                <ConflictSide title={labels.incoming} detail="Read-only" text={resolution.incomingText} tone="incoming" />
              </div>
            ) : (
              <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-8 text-center">
                <FileWarning className="size-8 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">This conflict cannot be edited here</h3>
                  <p className="mt-1 max-w-lg text-xs text-muted-foreground">{error || resolution?.message || "Reload the conflict or open it in your configured editor."}</p>
                </div>
                <Button type="button" variant="outline" disabled={busy || !selectedPath} onClick={() => onOpenFile(selectedPath)}>
                  <ExternalLink />Open in editor
                </Button>
              </div>
            )}
          </main>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t bg-muted/10 px-5 py-3">
          <div className="min-w-0">
            {error && ready ? <p className="truncate text-xs text-destructive" role="alert" title={error}>{error}</p> : null}
            {!error && ready ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {hasMarkers
                  ? <><FileWarning className="size-3.5 text-amber-700 dark:text-amber-400" />Remove every conflict marker before staging.</>
                  : <><CheckCircle2 className="size-3.5 text-emerald-600" />The result has no conflict markers{changed ? " and is ready to save." : "."}</>}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={busy || loading || !ready || hasMarkers} onClick={() => { void save(); }}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Save and stage
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ConflictSide({
  title,
  detail,
  text,
  tone
}: {
  title: string;
  detail: string;
  text: string | null;
  tone: "current" | "incoming";
}): ReactNode {
  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-muted/10" aria-label={title}>
      <div className={`border-b border-t-2 px-3 py-2.5 ${tone === "current" ? "border-t-sky-500" : "border-t-violet-500"}`}>
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
      </div>
      <div className="h-10 border-b bg-muted/20" aria-hidden="true" />
      <pre className="min-h-0 overflow-auto whitespace-pre p-3 font-mono text-xs leading-5 selectable-text">
        {text === null ? <span className="italic text-muted-foreground">File deleted on this side</span> : text}
      </pre>
    </section>
  );
}

function joinConflictSides(current: string | null, incoming: string | null): string {
  const left = current ?? "";
  const right = incoming ?? "";
  if (!left) return right;
  if (!right) return left;
  return `${left}${left.endsWith("\n") ? "" : "\n"}${right}`;
}

function conflictSideLabels(kind: GitRepositoryOperationState["kind"] | undefined): { current: string; incoming: string } {
  if (kind === "rebase") return { current: "Target branch", incoming: "Replayed commit" };
  if (kind === "cherry-pick") return { current: "Current branch", incoming: "Picked commit" };
  if (kind === "revert") return { current: "Current branch", incoming: "Reverted result" };
  return { current: "Current branch", incoming: "Incoming branch" };
}

function formatOperation(kind: GitRepositoryOperationState["kind"]): string {
  if (kind === "cherry-pick") return "Cherry-pick";
  return `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;
}
