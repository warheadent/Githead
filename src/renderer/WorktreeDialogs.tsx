import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FolderOpen, GitFork, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <Dialog open={open} onOpenChange={(next) => { if (!saving && !busy) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Worktree</DialogTitle>
          <DialogDescription>Check out another branch in a separate folder without disturbing this workspace.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { void submit(event); }}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Worktree branch mode">
            <Button type="button" variant={mode === "new-branch" ? "default" : "outline"} onClick={() => { setMode("new-branch"); setBranchName(""); setDestinationEdited(false); }}>New branch</Button>
            <Button type="button" variant={mode === "existing-branch" ? "default" : "outline"} onClick={() => { setMode("existing-branch"); setBranchName(existingBranches[0]?.name ?? ""); setDestinationEdited(false); }}>Existing branch</Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="worktree-branch">Branch</Label>
            {mode === "existing-branch" ? (
              <select id="worktree-branch" className="h-9 rounded-md border bg-background px-3 text-sm" value={branchName} onChange={(event) => { setBranchName(event.target.value); setDestinationEdited(false); }} disabled={saving || busy}>
                <option value="">Select a branch</option>
                {existingBranches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
              </select>
            ) : <Input id="worktree-branch" value={branchName} onChange={(event) => { setBranchName(event.target.value); if (!destinationEdited) setDestinationEdited(false); }} placeholder="feature/worktrees" disabled={saving || busy} autoFocus />}
          </div>
          {mode === "new-branch" ? <div className="grid gap-2"><Label htmlFor="worktree-start">Start from</Label><select id="worktree-start" className="h-9 rounded-md border bg-background px-3 text-sm" value={startPoint} onChange={(event) => setStartPoint(event.target.value)} disabled={saving || busy}>{startPoints.map((point) => <option key={point} value={point}>{point}</option>)}</select></div> : null}
          <div className="grid gap-2">
            <Label htmlFor="worktree-destination">Destination</Label>
            <div className="flex gap-2"><Input id="worktree-destination" value={destinationPath} onChange={(event) => { setDestinationPath(event.target.value); setDestinationEdited(true); }} disabled={saving || busy} /><Button type="button" variant="outline" size="icon" onClick={() => { void chooseParent(); }} disabled={saving || busy} aria-label="Choose worktree parent"><FolderOpen /></Button></div>
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || busy}>Cancel</Button><Button type="submit" disabled={saving || busy}>{saving || busy ? <Loader2 className="animate-spin" /> : <GitFork />}Create Worktree</Button></DialogFooter>
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
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Remove Worktree</DialogTitle><DialogDescription>Git will delete the linked worktree folder. The branch and its commits are not deleted.</DialogDescription></DialogHeader><div className="rounded-md border p-3"><p className="font-medium">{target?.branch ?? "Detached worktree"}</p><p className="break-all text-sm text-muted-foreground">{target?.path}</p></div>{checking ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking worktree…</p> : check?.reason ? <p className="text-sm text-destructive" role="alert">{check.reason}</p> : <p className="text-sm text-muted-foreground">This worktree is clean and can be removed safely.</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="button" variant="destructive" onClick={onRemove} disabled={busy || checking || !check?.canRemove}>{busy ? <Loader2 className="animate-spin" /> : <Trash2 />}Remove Worktree</Button></DialogFooter></DialogContent></Dialog>;
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
