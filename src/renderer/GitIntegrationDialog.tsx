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
  const publishedRewrite = preview?.kind === "rebase" && preview.published && preview.expectedRewrittenCommitCount > 0 && !preview.alreadyUpToDate;
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
      <DialogContent className={`max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden ${kind === "cherry-pick" ? "sm:max-w-3xl" : "sm:max-w-xl"}`} aria-busy={loading || busy}>
        <DialogHeader>
          {kind === "cherry-pick" ? <p className="eyebrow">Integrate changes</p> : null}
          <DialogTitle>{kind === "merge" ? `Merge into ${currentBranch ?? "current branch"}` : kind === "rebase" ? `Rebase ${currentBranch ?? "current branch"}` : dialogTitle(kind)}</DialogTitle>
          <DialogDescription>{kind === "merge" ? "Choose a branch to bring into the branch you’re on." : kind === "rebase" ? "Choose a new base for this branch." : dialogDescription(kind)}</DialogDescription>
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

          {kind === "cherry-pick" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-md border bg-muted/25 p-3" aria-label="Integration direction">
              <div className="min-w-0"><p className="text-xs text-muted-foreground">Source</p><p className="truncate font-medium">{commit ? `${commit.shortHash} ${commit.subject}` : "Selected commit"}</p></div>
              <ArrowDown className="size-4 -rotate-90 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0"><p className="text-xs text-muted-foreground">Destination</p><p className="truncate font-medium">{currentBranch ?? "Detached HEAD"}</p></div>
            </div>
          ) : null}

          {loading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Loading a fresh Git preview…</div> : null}

          {!loading && preview ? (
            <>
              {preview.kind === "cherry-pick" ? <PreviewFacts preview={preview} /> : null}
              {preview.blockingReasons.map((reason) => <p key={reason} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{reason} {reason.includes("stash") ? "Open File Status to use the stash action." : ""}</p>)}
              {preview.kind === "rebase" ? null : preview.warnings.map((warning) => <p key={warning} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status"><AlertTriangle className="mr-2 inline size-4" />{warning}</p>)}
              {preview.kind === "merge" ? (
                <MergePreview preview={preview} mode={mergeMode} busy={busy} onModeChange={setMergeMode} />
              ) : preview.kind === "rebase" ? (
                <RebasePreview
                  preview={preview}
                  busy={busy}
                  preserveMerges={preserveMerges}
                  rewriteAcknowledged={rewriteAcknowledged}
                  onPreserveMergesChange={setPreserveMerges}
                  onRewriteAcknowledgedChange={setRewriteAcknowledged}
                />
              ) : (
                <>
                  <CommitPreview preview={preview} />
                  <label className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1" checked={noCommit} disabled={busy} onChange={(event) => setNoCommit(event.target.checked)} /><span><span className="block font-medium">Apply without committing</span><span className="block text-sm text-muted-foreground">Stage the selected commit’s changes so you can review or combine them before committing.</span></span></label>
                </>
              )}
            </>
          ) : null}

          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <p className="sr-only" aria-live="polite">{loading ? "Integration preview loading" : preview ? `${preview.commits.length} commits in preview` : error}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          {kind === "cherry-pick" ? <Button type="button" variant="outline" disabled={busy || loading || !previewRequest} onClick={() => { if (previewRequest) void loadPreview(previewRequest); }}><RefreshCw />Refresh preview</Button> : null}
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
      <IntegrationSummaryCard
        headline={headline}
        explanation={mergeExplanation(preview, mode)}
        outcome={outcome}
        meta={preview.alreadyUpToDate ? null : `${commitCount} ${commitCount === 1 ? "commit" : "commits"} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`}
      />

      <AdvancedSection summary={mode === "normal" ? "Git’s default merge behavior" : mergeModeLabel(mode)}>
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
      </AdvancedSection>
    </div>
  );
}

function RebasePreview({
  preview,
  busy,
  preserveMerges,
  rewriteAcknowledged,
  onPreserveMergesChange,
  onRewriteAcknowledgedChange
}: {
  preview: Extract<GitIntegrationPreview, { kind: "rebase" }>;
  busy: boolean;
  preserveMerges: boolean;
  rewriteAcknowledged: boolean;
  onPreserveMergesChange(value: boolean): void;
  onRewriteAcknowledgedChange(value: boolean): void;
}): ReactNode {
  const commitCount = preview.expectedRewrittenCommitCount;
  const fileCount = preview.files.length;
  const publishedRewrite = preview.published && commitCount > 0 && !preview.alreadyUpToDate;
  const branchName = preview.currentBranch ?? "The current branch";
  const headline = preview.alreadyUpToDate
    ? `${branchName} is already based on ${preview.newBase.name}`
    : `Replay ${commitCount} ${commitCount === 1 ? "commit" : "commits"} from ${branchName} onto ${preview.newBase.name}`;

  return (
    <div className="grid gap-3">
      <IntegrationSummaryCard
        headline={headline}
        explanation={preview.alreadyUpToDate
          ? "No commits need to be replayed."
          : publishedRewrite
            ? "This creates new IDs for published commits. Githead will not push."
            : "This creates new commit IDs. Githead will not push."}
        outcome={preview.alreadyUpToDate ? "Up to date" : publishedRewrite ? "Published rewrite" : "Rewrites commits"}
        meta={preview.alreadyUpToDate ? null : `${commitCount} ${commitCount === 1 ? "commit" : "commits"} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`}
      />

      {publishedRewrite ? (
        <label className="flex items-start gap-3 rounded-md border border-amber-500/45 bg-amber-500/10 p-3 font-normal normal-case">
          <input type="checkbox" className="mt-1" checked={rewriteAcknowledged} disabled={busy} onChange={(event) => onRewriteAcknowledgedChange(event.target.checked)} />
          <span>
            <span className="block text-sm font-medium normal-case">Allow rewriting {preview.upstream ?? "the published branch"}</span>
            <span className="block text-xs font-normal normal-case text-muted-foreground">Publishing later needs a separate force-with-lease push. Plain force is never used.</span>
          </span>
        </label>
      ) : null}

      <AdvancedSection summary={preview.alreadyUpToDate ? "Options and details" : `${commitCount} ${commitCount === 1 ? "commit" : "commits"} and options`}>
        <label className="flex items-start gap-3 rounded-md border p-3 font-normal normal-case">
          <input type="checkbox" className="mt-1" checked={preserveMerges} disabled={busy} onChange={(event) => onPreserveMergesChange(event.target.checked)} />
          <span>
            <span className="block text-sm font-medium normal-case">Keep merge commits</span>
            <span className="block text-xs font-normal normal-case text-muted-foreground">Keep the branch’s existing merge structure.</span>
          </span>
        </label>
        {preview.warnings.length > 0 ? (
          <div className="grid gap-2">
            <Label>Notes</Label>
            <ul className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              {preview.warnings.map((warning) => <li key={warning} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{warning}</span></li>)}
            </ul>
          </div>
        ) : null}
        <CommitPreview preview={preview} />
      </AdvancedSection>
    </div>
  );
}

function IntegrationSummaryCard({ headline, explanation, outcome, meta }: { headline: string; explanation: string; outcome: string; meta: string | null }): ReactNode {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{explanation}</p>
        </div>
        <Badge variant="outline" className="shrink-0">{outcome}</Badge>
      </div>
      {meta ? <p className="mt-3 text-xs text-muted-foreground">{meta}</p> : null}
    </div>
  );
}

function AdvancedSection({ summary, children }: { summary: string; children: ReactNode }): ReactNode {
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>Advanced</span>
        <span className="text-xs font-normal text-muted-foreground">{summary}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-4 border-t p-3">{children}</div>
    </details>
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

function PreviewFacts({ preview }: { preview: Extract<GitIntegrationPreview, { kind: "cherry-pick" }> }): ReactNode {
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
function dialogTitle(kind: GitIntegrationDialogProps["kind"]): string { return kind === "cherry-pick" ? "Cherry-pick commit" : "Integrate changes"; }
function dialogDescription(kind: GitIntegrationDialogProps["kind"]): string { return kind === "cherry-pick" ? "Apply this commit’s changes to the current checkout as a new commit." : "Choose how to integrate these changes."; }
function confirmLabel(kind: GitIntegrationDialogProps["kind"], mergeMode: GitMergeMode, noCommit: boolean): string { if (kind === "merge") return mergeMode === "squash" ? "Stage squash" : "Merge"; if (kind === "rebase") return "Rebase"; return noCommit ? "Apply changes" : "Cherry-pick commit"; }
