import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Download, FolderOpen, GitBranch as GitBranchIcon, GitFork, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferencePicker } from "./ReferencePicker";
import type { GitBranch, GitRemoteBranch, GitWorktree, GitWorktreeCreateDraft, GitWorktreeRemovalCheck, RepositoryGroup } from "../shared/types";

export function WorktreeCreateDialog({ open, group, branches, remoteBranches, busy, onOpenChange, onChooseParent, onCreate }: {
  open: boolean;
  group: RepositoryGroup | null;
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  busy: boolean;
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
  }, [open, group?.id]);

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
    const track = remoteBranches.some((branch) => branch.name === startPoint);
    const request: GitWorktreeCreateDraft = mode === "existing-branch"
      ? { mode, branchName: name, destinationPath: destinationPath.trim() }
      : { mode, branchName: name, destinationPath: destinationPath.trim(), startPoint, track };
    const nextError = await onCreate(request);
    setSaving(false);
    if (nextError) setError(nextError);
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
      <DialogContent aria-busy={saving || busy}>
        <DialogHeader>
          <DialogTitle>Add Worktree</DialogTitle>
          <DialogDescription>Check out another branch in a separate folder without disturbing this workspace.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { void submit(event); }}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Worktree branch mode">
            <Button type="button" variant={mode === "new-branch" ? "default" : "outline"} disabled={saving || busy} onClick={() => { setMode("new-branch"); setBranchName(""); setDestinationEdited(false); }}>New branch</Button>
            <Button type="button" variant={mode === "existing-branch" ? "default" : "outline"} disabled={saving || busy} onClick={() => { setMode("existing-branch"); setBranchName(existingBranches[0]?.name ?? ""); setDestinationEdited(false); }}>Existing branch</Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="worktree-branch">Branch</Label>
            {mode === "existing-branch" ? (
              <ReferencePicker
                id="worktree-branch"
                value={branchName}
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
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{saving || busy ? "Cancel operation" : "Cancel"}</Button><Button type="submit" disabled={saving || busy}>{saving || busy ? <Loader2 className="animate-spin" /> : <GitFork />}Create Worktree</Button></DialogFooter>
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
  const removeLabel = check?.canForceRemove && !forceRemovalArmed ? `Remove Worktree (${secondsRemaining})` : "Remove Worktree";
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent aria-busy={busy}><DialogHeader><DialogTitle>Remove worktree?</DialogTitle><DialogDescription>This deletes the worktree folder from your computer. Its branch and committed changes remain in the repository.</DialogDescription></DialogHeader><div className="rounded-md border p-3"><p className="font-medium">{target?.branch ?? "Detached worktree"}</p><p className="break-all text-sm text-muted-foreground">{target?.path}</p></div>{checking ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking worktree…</p> : check?.reason ? <div className="grid gap-1 text-sm text-destructive" role="alert"><p>{check.reason}</p>{check.canForceRemove && forceRemovalArmed ? <p>Removing it will permanently discard those files.</p> : null}</div> : <p className="text-sm text-muted-foreground">This worktree is clean and can be removed safely.</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>{busy ? "Cancel operation" : "Cancel"}</Button><Button type="button" variant="destructive" onClick={onRemove} disabled={busy || checking || !canRemove}>{busy ? <Loader2 className="animate-spin" /> : <Trash2 />}{removeLabel}</Button></DialogFooter></DialogContent></Dialog>;
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
