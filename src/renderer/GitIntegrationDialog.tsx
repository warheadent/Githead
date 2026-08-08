import { AlertTriangle, ArrowDown, CheckCircle2, ChevronDown, GitMerge, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  GitCommitGraphRow,
  GitIntegrationExecuteRequest,
  GitIntegrationPreview,
  GitIntegrationPreviewRequest,
  GitIntegrationRef,
  GitIntegrationResult,
  GitMergeMode,
  GitRemoteBranch,
  GitBranch
} from "../shared/types";

export interface GitIntegrationDialogProps {
  open: boolean;
  kind: "merge" | "rebase" | "cherry-pick";
  repoPath: string;
  currentBranch: string | null;
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  commit: GitCommitGraphRow | null;
  allowAlreadyContainedCherryPick: boolean;
  busy: boolean;
  onOpenChange(open: boolean): void;
  onRun(request: GitIntegrationExecuteRequest): Promise<GitIntegrationResult | null>;
}

export function GitIntegrationDialog(props: GitIntegrationDialogProps): ReactNode {
  const { open, kind, repoPath, currentBranch, branches, remoteBranches, commit, allowAlreadyContainedCherryPick, busy, onOpenChange, onRun } = props;
  const options = useMemo(() => createRefOptions(branches, remoteBranches, currentBranch), [branches, remoteBranches, currentBranch]);
  const [selectedValue, setSelectedValue] = useState("");
  const [preview, setPreview] = useState<GitIntegrationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mergeMode, setMergeMode] = useState<GitMergeMode>("normal");
  const [noCommit, setNoCommit] = useState(false);
  const [preserveMerges, setPreserveMerges] = useState(false);
  const [rewriteAcknowledged, setRewriteAcknowledged] = useState(false);

  const selectedRef = parseRefValue(selectedValue);
  const previewRequest: GitIntegrationPreviewRequest | null = kind === "cherry-pick"
    ? commit ? {
        kind,
        repoPath,
        commitOids: [commit.hash],
        allowAlreadyContained: allowAlreadyContainedCherryPick
      } : null
    : selectedRef ? kind === "merge" ? { kind, repoPath, source: selectedRef } : { kind, repoPath, newBase: selectedRef } : null;

  const loadPreview = async (request: GitIntegrationPreviewRequest): Promise<void> => {
    setLoading(true);
    setPreview(null);
    setError("");
    try {
      const result = await window.githead.getIntegrationPreview(request);
      setPreview(result.preview);
      if (result.outcome === "failed") setError(result.message);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the integration preview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setSelectedValue("");
      setPreview(null);
      setError("");
      setMergeMode("normal");
      setNoCommit(false);
      setPreserveMerges(false);
      setRewriteAcknowledged(false);
      return;
    }
    if (kind !== "cherry-pick" && !selectedValue && options[0]) setSelectedValue(options[0].value);
  }, [kind, open, options, selectedValue]);

  useEffect(() => {
    if (!open || !previewRequest) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError("");
    void window.githead.getIntegrationPreview(previewRequest).then((result) => {
      if (cancelled) return;
      setPreview(result.preview);
      if (result.outcome === "failed") setError(result.message);
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load the integration preview.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, repoPath, kind, selectedValue, commit?.hash, allowAlreadyContainedCherryPick]);

  const blocked = !preview || preview.blockingReasons.length > 0;
  const publishedRewrite = preview?.kind === "rebase" && preview.published && preview.expectedRewrittenCommitCount > 0;
  const canConfirm = !busy && !loading && !blocked && (!publishedRewrite || rewriteAcknowledged);

  const submit = async (): Promise<void> => {
    if (!preview || !canConfirm) return;
    setError("");
    const request: GitIntegrationExecuteRequest = preview.kind === "merge"
      ? { kind: "merge", repoPath, source: preview.source, mode: mergeMode, expectedSnapshotId: preview.snapshotId }
      : preview.kind === "rebase"
        ? { kind: "rebase", repoPath, newBase: preview.newBase, preserveMerges, expectedSnapshotId: preview.snapshotId }
        : {
            kind: "cherry-pick",
            repoPath,
            commitOids: preview.commitOids,
            noCommit,
            allowAlreadyContained: allowAlreadyContainedCherryPick,
            expectedSnapshotId: preview.snapshotId
          };
    const result = await onRun(request);
    if (!result) return;
    if (result.outcome === "stale") {
      setError(result.message);
      await loadPreview(previewRequest!);
      return;
    }
    if (result.outcome === "failed") {
      setError(result.message || result.stderr);
      await loadPreview(previewRequest!);
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy || next) onOpenChange(next); }}>
      <DialogContent className={`max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden ${kind === "merge" ? "sm:max-w-xl" : "sm:max-w-3xl"}`} aria-busy={loading || busy}>
        <DialogHeader>
          {kind === "merge" ? null : <p className="eyebrow">Integrate changes</p>}
          <DialogTitle>{kind === "merge" ? `Merge into ${currentBranch ?? "current branch"}` : dialogTitle(kind)}</DialogTitle>
          <DialogDescription>{kind === "merge" ? "Choose a branch to bring into the branch you’re on." : dialogDescription(kind)}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
          {kind !== "cherry-pick" ? (
            <div className="grid gap-2">
              <Label htmlFor="integration-ref">{kind === "merge" ? "Branch to merge" : "New base"}</Label>
              <select
                id="integration-ref"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedValue}
                disabled={busy || loading}
                onChange={(event) => { setSelectedValue(event.target.value); setRewriteAcknowledged(false); }}
                autoFocus
              >
                {options.length === 0 ? <option value="">No other branches available</option> : null}
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          ) : null}

          {kind === "merge" ? null : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-md border bg-muted/25 p-3" aria-label="Integration direction">
              <div className="min-w-0"><p className="text-xs text-muted-foreground">{kind === "rebase" ? "Commits from" : "Source"}</p><p className="truncate font-medium">{sourceLabel(kind, preview, commit)}</p></div>
              <ArrowDown className="size-4 -rotate-90 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0"><p className="text-xs text-muted-foreground">{kind === "rebase" ? "Replay onto" : "Destination"}</p><p className="truncate font-medium">{destinationLabel(kind, preview, currentBranch)}</p></div>
            </div>
          )}

          {loading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Loading a fresh Git preview…</div> : null}

          {!loading && preview ? (
            <>
              {preview.kind === "merge" ? null : <PreviewFacts preview={preview} />}
              {preview.blockingReasons.map((reason) => <p key={reason} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{reason} {reason.includes("stash") ? "Open File Status to use the stash action." : ""}</p>)}
              {preview.warnings.map((warning) => <p key={warning} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status"><AlertTriangle className="mr-2 inline size-4" />{warning}</p>)}
              {preview.kind === "merge" ? (
                <MergePreview preview={preview} mode={mergeMode} busy={busy} onModeChange={setMergeMode} />
              ) : (
                <>
                  <CommitPreview preview={preview} />
                  {preview.kind === "cherry-pick" ? <label className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1" checked={noCommit} disabled={busy} onChange={(event) => setNoCommit(event.target.checked)} /><span><span className="block font-medium">Apply without committing</span><span className="block text-sm text-muted-foreground">Stage the selected commit’s changes so you can review or combine them before committing.</span></span></label> : null}
                  {preview.kind === "rebase" ? <><label className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1" checked={preserveMerges} disabled={busy} onChange={(event) => setPreserveMerges(event.target.checked)} /><span><span className="block font-medium">Preserve merge commits</span><span className="block text-sm text-muted-foreground">Use Git’s noninteractive rebase-merges mode. Interactive editing is not included.</span></span></label>{publishedRewrite ? <label className="flex items-start gap-3 rounded-md border border-amber-500/45 bg-amber-500/10 p-3"><input type="checkbox" className="mt-1" checked={rewriteAcknowledged} disabled={busy} onChange={(event) => setRewriteAcknowledged(event.target.checked)} /><span><span className="block font-medium">I understand this rewrites a published branch</span><span className="block text-sm text-muted-foreground">Githead will not push. Publishing rewritten history later requires a separate force-with-lease action; plain force is never used.</span></span></label> : null}</> : null}
                </>
              )}
            </>
          ) : null}

          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <p className="sr-only" aria-live="polite">{loading ? "Integration preview loading" : preview ? `${preview.commits.length} commits in preview` : error}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          {kind === "merge" ? null : <Button type="button" variant="outline" disabled={busy || loading || !previewRequest} onClick={() => { if (previewRequest) void loadPreview(previewRequest); }}><RefreshCw />Refresh preview</Button>}
          <Button type="button" disabled={!canConfirm} onClick={() => { void submit(); }}>{busy ? <Loader2 className="animate-spin" /> : <GitMerge />}{confirmLabel(kind, mergeMode, noCommit)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergePreview({
  preview,
  mode,
  busy,
  onModeChange
}: {
  preview: Extract<GitIntegrationPreview, { kind: "merge" }>;
  mode: GitMergeMode;
  busy: boolean;
  onModeChange(mode: GitMergeMode): void;
}): ReactNode {
  const commitCount = preview.commits.length;
  const fileCount = preview.files.length;
  const headline = preview.alreadyUpToDate
    ? `${preview.currentBranch ?? "The current branch"} is already up to date`
    : `Bring ${commitCount} ${commitCount === 1 ? "commit" : "commits"} from ${preview.source.name} into ${preview.currentBranch ?? "the current branch"}`;
  const outcome = mergeOutcome(preview, mode);

  return (
    <div className="grid gap-3">
      <div className="rounded-md border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium leading-snug">{headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{mergeExplanation(preview, mode)}</p>
          </div>
          <Badge variant="outline" className="shrink-0">{outcome}</Badge>
        </div>
        {!preview.alreadyUpToDate ? <p className="mt-3 text-xs text-muted-foreground">{commitCount} {commitCount === 1 ? "commit" : "commits"} · {fileCount} {fileCount === 1 ? "file" : "files"}</p> : null}
      </div>

      <details className="group rounded-md border">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>Advanced</span>
          <span className="text-xs font-normal text-muted-foreground">{mode === "normal" ? "Git’s default merge behavior" : mergeModeLabel(mode)}</span>
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-4 border-t p-3">
          <div className="grid gap-2">
            <Label htmlFor="merge-mode">Merge behavior</Label>
            <select id="merge-mode" className="h-9 rounded-md border bg-background px-3 text-sm" value={mode} disabled={busy} onChange={(event) => onModeChange(event.target.value as GitMergeMode)}>
              <option value="normal">Default — follow this repository’s Git settings</option>
              <option value="ff-only">Fast-forward only — stop if histories diverged</option>
              <option value="no-ff">Always create a merge commit</option>
              <option value="squash">Squash — stage one combined change</option>
            </select>
            {mode === "squash" ? <p className="text-xs text-muted-foreground">This stages the combined changes without creating a commit. Finish in the existing commit composer.</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">The destination has {preview.ahead} unique {preview.ahead === 1 ? "commit" : "commits"}; the source has {preview.behind} to integrate.</p>
          <CommitPreview preview={preview} />
        </div>
      </details>
    </div>
  );
}

function mergeOutcome(preview: Extract<GitIntegrationPreview, { kind: "merge" }>, mode: GitMergeMode): string {
  if (preview.alreadyUpToDate) return "Up to date";
  if (mode === "squash") return "Stage changes";
  if (mode === "no-ff") return "Merge commit";
  if (mode === "ff-only") return "Fast-forward only";
  return preview.canFastForward ? "Fast-forward" : "Merge commit";
}

function mergeExplanation(preview: Extract<GitIntegrationPreview, { kind: "merge" }>, mode: GitMergeMode): string {
  if (preview.alreadyUpToDate) return `There are no new commits to bring in from ${preview.source.name}.`;
  if (mode === "squash") return "Githead will stage one combined change so you can review and commit it yourself.";
  if (mode === "no-ff") return "Githead will preserve the branch boundary by creating a merge commit.";
  if (mode === "ff-only") return preview.canFastForward ? "The branch can move forward directly without creating a merge commit." : "The branches have diverged, so this setting will stop without changing anything.";
  return preview.canFastForward ? "Git can move the current branch forward directly without creating a merge commit." : "Git will combine the two branch histories in a merge commit.";
}

function mergeModeLabel(mode: GitMergeMode): string {
  if (mode === "ff-only") return "Fast-forward only";
  if (mode === "no-ff") return "Always create a merge commit";
  if (mode === "squash") return "Squash and stage";
  return "Default";
}

function PreviewFacts({ preview }: { preview: GitIntegrationPreview }): ReactNode {
  if (preview.kind === "merge") return <div className="grid grid-cols-3 gap-2 text-sm"><Fact label="Destination ahead" value={preview.ahead} /><Fact label="Source ahead" value={preview.behind} /><Fact label="Result" value={preview.alreadyUpToDate ? "No-op" : preview.canFastForward ? "Can fast-forward" : "Merge commit"} /></div>;
  if (preview.kind === "rebase") return <div className="grid grid-cols-3 gap-2 text-sm"><Fact label="Commits replayed" value={preview.expectedRewrittenCommitCount} /><Fact label="Published" value={preview.published ? "Yes" : "No"} /><Fact label="Result" value={preview.alreadyUpToDate ? "Already based" : "Rewritten history"} /></div>;
  return <div className="grid grid-cols-2 gap-2 text-sm"><Fact label="Commits" value={preview.commits.length} /><Fact label="Application order" value="Oldest to newest" /></div>;
}

function Fact({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

function CommitPreview({ preview }: { preview: GitIntegrationPreview }): ReactNode {
  return <div className="grid gap-2"><div className="flex items-center justify-between"><Label>Commits and affected files</Label><Badge variant="outline">{preview.commits.length} {preview.commits.length === 1 ? "commit" : "commits"} · {preview.files.length} {preview.files.length === 1 ? "file" : "files"}</Badge></div><div className="max-h-48 overflow-auto rounded-md border"><ol className="divide-y">{preview.commits.length === 0 ? <li className="p-3 text-sm text-muted-foreground"><CheckCircle2 className="mr-2 inline size-4" />No commits need integrating.</li> : preview.commits.map((commit, index) => <li key={commit.oid} className="p-3"><div className="flex items-baseline gap-2"><span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{commit.subject || "Untitled commit"}</span><code className="text-xs">{commit.shortOid}</code></div><p className="mt-1 pl-5 text-xs text-muted-foreground">{commit.authorName} · {commit.files.length} affected {commit.files.length === 1 ? "file" : "files"}</p>{commit.files.length > 0 ? <p className="mt-1 truncate pl-5 text-xs text-muted-foreground" title={commit.files.map((file) => file.path).join("\n")}>{commit.files.slice(0, 3).map((file) => file.path).join(", ")}{commit.files.length > 3 ? `, +${commit.files.length - 3} more` : ""}</p> : null}</li>)}</ol></div></div>;
}

function createRefOptions(branches: GitBranch[], remotes: GitRemoteBranch[], currentBranch: string | null): Array<{ value: string; label: string }> {
  return [
    ...branches.filter((branch) => branch.name !== currentBranch).map((branch) => ({ value: refValue({ kind: "local", name: branch.name }), label: `${branch.name} — local${branch.worktreePath ? " (open in another worktree)" : ""}` })),
    ...remotes.map((branch) => ({ value: refValue({ kind: "remote", name: branch.name }), label: `${branch.name} — fetched remote` }))
  ];
}

function refValue(ref: GitIntegrationRef): string { return `${ref.kind}\0${ref.name}`; }
function parseRefValue(value: string): GitIntegrationRef | null { const split = value.indexOf("\0"); if (split < 0) return null; const kind = value.slice(0, split); const name = value.slice(split + 1); return (kind === "local" || kind === "remote") && name ? { kind, name } : null; }
function dialogTitle(kind: GitIntegrationDialogProps["kind"]): string { return kind === "merge" ? "Merge a branch" : kind === "rebase" ? "Rebase current branch" : "Cherry-pick commit"; }
function dialogDescription(kind: GitIntegrationDialogProps["kind"]): string { return kind === "merge" ? "Bring another branch’s commits into the currently checked-out branch." : kind === "rebase" ? "Replay the current branch’s commits on a new base. This rewrites those commits." : "Apply this commit’s changes to the current checkout as a new commit."; }
function sourceLabel(kind: GitIntegrationDialogProps["kind"], preview: GitIntegrationPreview | null, commit: GitCommitGraphRow | null): string { if (kind === "cherry-pick") return commit ? `${commit.shortHash} ${commit.subject}` : "Selected commit"; if (preview?.kind === "merge") return preview.source.name; return currentBranchFromPreview(preview) ?? "Current branch"; }
function destinationLabel(kind: GitIntegrationDialogProps["kind"], preview: GitIntegrationPreview | null, currentBranch: string | null): string { if (kind === "rebase" && preview?.kind === "rebase") return preview.newBase.name; return currentBranch ?? "Detached HEAD"; }
function currentBranchFromPreview(preview: GitIntegrationPreview | null): string | null { return preview?.currentBranch ?? null; }
function confirmLabel(kind: GitIntegrationDialogProps["kind"], mergeMode: GitMergeMode, noCommit: boolean): string { if (kind === "merge") return mergeMode === "squash" ? "Stage squash" : "Merge"; if (kind === "rebase") return "Rebase branch"; return noCommit ? "Apply changes" : "Cherry-pick commit"; }
