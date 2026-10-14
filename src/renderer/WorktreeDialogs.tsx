import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, Download, FolderOpen, GitBranch as GitBranchIcon, GitFork, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { getRepoPathKey } from "./repositorySnapshotCache";
import { ReferencePicker } from "./ReferencePicker";
import type { GitBranch, GitRemoteBranch, GitWorktree, GitWorktreeCreateDraft, GitWorktreeRemovalCheck, RepositoryGroup } from "../shared/types";

export function WorktreeCreateDialog({ open, group, branches, remoteBranches, busy, cancelling = false, cancelError = "", onCancel, onOpenChange, onChooseParent, onCreate }: {
  open: boolean;
  group: RepositoryGroup | null;
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  busy: boolean;
  cancelling?: boolean;
  cancelError?: string;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  onChooseParent: (defaultPath: string) => Promise<string | null>;
  onCreate: (request: GitWorktreeCreateDraft) => Promise<string | null>;
}): ReactNode {
  const [mode, setMode] = useState<"new-branch" | "existing-branch">("new-branch");
  const [branchName, setBranchName] = useState("");
  const [startPoint, setStartPoint] = useState("HEAD");
  const [destinationPath, setDestinationPath] = useState("");
  const [destinationEdited, setDestinationEdited] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const active = saving || busy;
  const mainPath = group?.worktrees.find((worktree) => worktree.isMain && !worktree.isBare)?.path ?? group?.anchorPath ?? "";
  const existingBranches = useMemo(() => branches.filter((branch) => !branch.worktreePath), [branches]);
  const startPoints = useMemo(() => ["HEAD", ...branches.map((branch) => branch.name), ...remoteBranches.map((branch) => branch.name)].filter((value, index, values) => values.indexOf(value) === index), [branches, remoteBranches]);
  const effectiveBranch = mode === "existing-branch" ? branchName : branchName.trim();

  useEffect(() => {
    if (!open) return;
    setMode("new-branch");
    setBranchName("");
    setStartPoint("HEAD");
    setDestinationPath("");
    setDestinationEdited(false);
    setError("");
    setSaving(false);
    setProgress("");
  }, [open, group?.id]);

  useEffect(() => {
    if (!open || !active) return;
    let tail = "";
    return window.githead?.onGitOutput((event) => {
      if (event.action !== "worktree-add" || !event.text || !group?.worktrees.some((worktree) => getRepoPathKey(worktree.path) === getRepoPathKey(event.repoPath ?? ""))) return;
      tail = (tail + event.text).slice(-2048);
      setProgress(tail.split(/[\r\n]/).filter((line) => line.trim()).at(-1)?.trim().slice(-300) ?? "");
    });
  }, [open, active, group]);

  useEffect(() => {
    if (!open || destinationEdited) return;
    setDestinationPath(suggestWorktreePath(mainPath, effectiveBranch));
  }, [destinationEdited, effectiveBranch, mainPath, open]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (saving || busy) return;
    const name = branchName.trim();
    if (!name) return setError(mode === "existing-branch" ? "Select a branch." : "Enter a branch name.");
    if (!destinationPath.trim()) return setError("Enter a destination path.");
    setSaving(true);
    setError("");
    setProgress("");
    const track = remoteBranches.some((branch) => branch.name === startPoint);
    const request: GitWorktreeCreateDraft = mode === "existing-branch"
      ? { mode, branchName: name, destinationPath: destinationPath.trim() }
      : { mode, branchName: name, destinationPath: destinationPath.trim(), startPoint, track };
    try {
      const nextError = await onCreate(request);
      if (nextError) setError(nextError);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create worktree.");
    } finally {
      setSaving(false);
    }
  };

  const chooseParent = async (): Promise<void> => {
    const parent = await onChooseParent(getParentPath(destinationPath || mainPath));
    if (!parent) return;
    const leaf = getPathLeaf(suggestWorktreePath(mainPath, effectiveBranch));
    const separator = parent.includes("\\") ? "\\" : "/";
    setDestinationPath(`${parent.replace(/[\\/]+$/, "")}${separator}${leaf}`);
    setDestinationEdited(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-xl" aria-busy={active} showCloseButton={!active}>
        <DialogHeader>
          <DialogTitle>Add worktree</DialogTitle>
          <DialogDescription>Check out another branch in a separate folder without disturbing this workspace.</DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-col gap-5" onSubmit={(event) => { void submit(event); }}>
          <div className="-m-1 grid min-h-0 gap-4 overflow-y-auto p-1">
            <Segmented
              label="Worktree branch mode"
              className="grid w-full grid-cols-2"
              value={mode}
              options={[
                { value: "new-branch", label: "New branch", disabled: saving || busy },
                { value: "existing-branch", label: "Existing branch", disabled: saving || busy }
              ]}
              onChange={(nextMode) => {
                setMode(nextMode);
                setBranchName(nextMode === "existing-branch" ? existingBranches[0]?.name ?? "" : "");
                setDestinationEdited(false);
              }}
            />
            <div className="grid gap-2">
              <Label htmlFor="worktree-branch">Branch</Label>
              {mode === "existing-branch" ? (
                <ReferencePicker
                  id="worktree-branch"
                  value={branchName}
                  displayValue={branchName || "Select a branch"}
                  options={existingBranches.map((branch) => ({ value: branch.name, label: branch.name, icon: <GitBranchIcon /> }))}
                  disabled={saving || busy}
                  ariaLabel="Select worktree branch"
                  placeholder="Select a branch"
                  searchPlaceholder="Search branches..."
                  emptyMessage="No available branches."
                  triggerIcon={<GitBranchIcon />}
                  onValueChange={(value) => { setBranchName(value); setDestinationEdited(false); }}
                />
              ) : <Input id="worktree-branch" value={branchName} onChange={(event) => { setBranchName(event.target.value); if (!destinationEdited) setDestinationEdited(false); }} placeholder="feature/worktrees" disabled={saving || busy} autoFocus />}
            </div>
            {mode === "new-branch" ? (
              <div className="grid gap-2">
                <Label htmlFor="worktree-start">Start from</Label>
                <ReferencePicker
                  id="worktree-start"
                  value={startPoint}
                  options={startPoints.map((point) => ({
                    value: point,
                    label: point,
                    icon: remoteBranches.some((branch) => branch.name === point) ? <Download /> : <GitBranchIcon />
                  }))}
                  disabled={saving || busy}
                  ariaLabel="Select worktree start point"
                  searchPlaceholder="Search references..."
                  triggerIcon={<GitBranchIcon />}
                  onValueChange={setStartPoint}
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="worktree-destination">Destination</Label>
              <div className="flex gap-2"><Input id="worktree-destination" value={destinationPath} onChange={(event) => { setDestinationPath(event.target.value); setDestinationEdited(true); }} disabled={saving || busy} /><Button type="button" variant="outline" size="icon" onClick={() => { void chooseParent(); }} disabled={saving || busy} aria-label="Choose worktree parent"><FolderOpen /></Button></div>
            </div>
            <p className="text-xs text-muted-foreground">Githead opens the new worktree when creation is complete.</p>
            {active ? <div className="dialog-notice" data-tone="neutral" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-medium"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{cancelling ? "Cancelling worktree creation..." : "Creating worktree..."}</p>
              <p className="break-words text-sm text-muted-foreground">{cancelling ? "Waiting for Git to stop. Keep this dialog open." : progress || "Preparing the branch and checking out files."}</p>
              {!cancelling ? <p className="text-xs text-muted-foreground">Large repositories can take several minutes. You can cancel at any time.</p> : null}
            </div> : null}
            {error && !active ? <div className="dialog-notice" data-tone="danger" role="alert">
              <CircleAlert aria-hidden="true" />
              <div className="grid min-w-0 gap-2">
                <p className="dialog-notice-title">{error.includes("Worktree creation was cancelled.") ? "Worktree creation cancelled" : "Unable to create worktree"}</p>
                <p className="max-h-24 overflow-y-auto break-words text-muted-foreground">{summarizeWorktreeError(error)}</p>
                <details className="min-w-0 text-xs"><summary className="cursor-pointer text-muted-foreground">Show details</summary><pre className="dialog-code-block mt-2 max-h-36 overflow-auto whitespace-pre-wrap">{error.slice(-16_384)}</pre></details>
              </div>
            </div> : null}
            {cancelError ? <p className="dialog-error" role="alert">{cancelError}</p> : null}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4"><Button type="button" variant="outline" disabled={cancelling} onClick={() => { if (active) onCancel(); else onOpenChange(false); }}>{cancelling ? "Cancelling..." : active ? "Cancel operation" : "Cancel"}</Button><Button type="submit" disabled={active || !effectiveBranch || !destinationPath.trim()}>{active ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <GitFork />}{active ? "Creating worktree..." : "Create worktree"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorktreeRemoveDialog({ target, check, checking, busy, onClose, onRemove }: {
  target: GitWorktree | null;
  check: GitWorktreeRemovalCheck | null;
  checking: boolean;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}): ReactNode {
  const [forceRemovalCountdown, setForceRemovalCountdown] = useState({ worktreePath: "", secondsRemaining: 3 });

  useEffect(() => {
    const worktreePath = target?.path ?? "";
    setForceRemovalCountdown({ worktreePath, secondsRemaining: 3 });
    if (!target) return;
    const interval = window.setInterval(() => {
      setForceRemovalCountdown((current) => {
        if (current.worktreePath !== worktreePath) return current;
        if (current.secondsRemaining <= 1) {
          window.clearInterval(interval);
          return { ...current, secondsRemaining: 0 };
        }
        return { ...current, secondsRemaining: current.secondsRemaining - 1 };
      });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [target?.path]);

  const secondsRemaining = forceRemovalCountdown.worktreePath === target?.path ? forceRemovalCountdown.secondsRemaining : 3;
  const forceRemovalArmed = secondsRemaining === 0;
  const canRemove = Boolean(check?.canRemove || (check?.canForceRemove && forceRemovalArmed));
  const removeLabel = check?.canForceRemove && !forceRemovalArmed ? `Remove worktree (${secondsRemaining})` : "Remove worktree";
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent aria-busy={busy}><DialogHeader><DialogTitle>Remove worktree?</DialogTitle><DialogDescription>This deletes the worktree folder from your computer. Its branch and committed changes remain in the repository.</DialogDescription></DialogHeader><div className="grid gap-1 rounded-lg border bg-surface p-3"><p className="font-medium">{target?.branch ?? "Detached worktree"}</p><p className="selectable-text break-all text-xs text-muted-foreground">{target?.path}</p></div>{checking ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking worktree…</p> : check?.reason ? <div className="dialog-notice" data-tone="danger" role="alert"><CircleAlert aria-hidden="true" /><div className="grid gap-1"><p>{check.reason}</p>{check.canForceRemove && forceRemovalArmed ? <p>Removing it will permanently discard those files.</p> : null}</div></div> : <p className="text-sm text-muted-foreground">This worktree is clean and can be removed safely.</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>{busy ? "Cancel operation" : "Cancel"}</Button><Button type="button" variant="destructive" onClick={onRemove} disabled={busy || checking || !canRemove}>{busy ? <Loader2 className="animate-spin" /> : <Trash2 />}{removeLabel}</Button></DialogFooter></DialogContent></Dialog>;
}

function suggestWorktreePath(mainPath: string, branchName: string): string {
  if (!mainPath || !branchName.trim()) return "";
  const parent = getParentPath(mainPath);
  const repository = getPathLeaf(mainPath);
  const slug = branchName.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  const separator = mainPath.includes("\\") ? "\\" : "/";
  return `${parent}${separator}${repository}-${slug}`;
}

function getParentPath(value: string): string {
  return value.trim().replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "");
}

function getPathLeaf(value: string): string {
  return /[^\\/]+$/.exec(value.trim().replace(/[\\/]+$/, ""))?.[0] ?? "worktree";
}

function summarizeWorktreeError(error: string): string {
  const lines = error.split(/[\r\n]/).map((line) => line.trim()).filter(Boolean);
  return lines.findLast((line) => /^(fatal:|error:|Worktree creation was cancelled\.)/i.test(line))
    ?? lines.at(-1)?.slice(-500)
    ?? "Git could not complete the operation. See details for more information.";
}
