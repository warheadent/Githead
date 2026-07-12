import { Archive, GitBranch as GitBranchIcon, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitBranch, RepoCapabilities, VcsKind } from "../shared/types";

type Mode = { kind: "list" } | { kind: "rename"; branch: GitBranch } | { kind: "remove"; branch: GitBranch };

export interface BranchManagementDialogProps {
  open: boolean;
  repoPath: string;
  kind: VcsKind;
  capabilities: RepoCapabilities;
  branches: GitBranch[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (branchName: string, newBranchName: string) => Promise<string | null>;
  onRemove: (branchName: string, force: boolean) => Promise<string | null>;
}

export function BranchManagementDialog(props: BranchManagementDialogProps): ReactNode {
  const { open, repoPath, kind, capabilities, branches, busy, onOpenChange, onRename, onRemove } = props;
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [forceDelete, setForceDelete] = useState(false);
  const archive = kind === "lore";

  useEffect(() => {
    if (!open) {
      setMode({ kind: "list" });
      setQuery("");
      setName("");
      setError("");
      setForceDelete(false);
    }
  }, [open, repoPath]);

  const visibleBranches = useMemo(() => branches
    .filter((branch) => branch.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => Number(right.current) - Number(left.current) || left.name.localeCompare(right.name)), [branches, query]);

  const back = (): void => { setMode({ kind: "list" }); setName(""); setError(""); setForceDelete(false); };
  const beginRename = (branch: GitBranch): void => { setMode({ kind: "rename", branch }); setName(branch.name); setError(""); };
  const run = async (operation: () => Promise<string | null>): Promise<void> => {
    setError("");
    const nextError = await operation();
    if (nextError) setError(nextError); else back();
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || mode.kind === "list") return;
    if (mode.kind === "rename") {
      const nextName = name.trim();
      if (!nextName) return setError("Enter a branch name.");
      if (nextName === mode.branch.name) return setError("Enter a different branch name.");
      if (branches.some((branch) => branch.name === nextName)) return setError("Branch already exists.");
      void run(() => onRename(mode.branch.name, nextName));
    } else {
      void run(() => onRemove(mode.branch.name, forceDelete));
    }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl" showCloseButton={!busy}>
      <DialogHeader>
        <p className="eyebrow">Repository</p>
        <DialogTitle>Manage Branches</DialogTitle>
        <DialogDescription className="truncate" title={repoPath}>{repoPath}</DialogDescription>
      </DialogHeader>
      {mode.kind === "list" ? <div className="grid min-h-0 gap-4 overflow-hidden">
        {branches.length ? <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search branches" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" className="pl-9" autoFocus /></div> : null}
        <div className="grid min-h-0 gap-2 overflow-auto" role="list" aria-label="Local branches">
          {!visibleBranches.length ? <p className="py-8 text-center text-sm text-muted-foreground">{branches.length ? "No branches match your search." : "No local branches found."}</p> : visibleBranches.map((branch) => <div key={branch.name} role="listitem" className="flex items-center gap-3 rounded-md border p-3">
            <GitBranchIcon className="size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-medium" title={branch.name}>{branch.name}</span>{branch.current ? <Badge>Current</Badge> : null}</div>{branch.upstream ? <p className="truncate text-xs text-muted-foreground" title={branch.upstream}>{branch.upstream}</p> : null}</div>
            {capabilities.renameBranches ? <TooltipButton type="button" variant="ghost" size="icon" disabled={busy} aria-label={`Rename ${branch.name}`} tooltip={`Rename ${branch.name}`} onClick={() => beginRename(branch)}><Pencil /></TooltipButton> : null}
            {capabilities.removeBranches ? <TooltipButton type="button" variant="ghost" size="icon" disabled={busy || branch.current} aria-label={`${archive ? "Archive" : "Delete"} ${branch.name}`} tooltip={`${archive ? "Archive" : "Delete"} ${branch.name}`} disabledTooltip={branch.current ? `Switch to another branch before ${archive ? "archiving" : "deleting"} this branch` : undefined} onClick={() => { setError(""); setForceDelete(false); setMode({ kind: "remove", branch }); }}>{archive ? <Archive /> : <Trash2 />}</TooltipButton> : null}
          </div>)}
        </div>
      </div> : <form className="grid gap-5" onSubmit={submit}>
        {mode.kind === "rename" ? <div className="grid gap-2"><Label htmlFor="branch-new-name">New name</Label><Input id="branch-new-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} /><p className="text-xs text-muted-foreground">Rename {mode.branch.name}. Remote branches are not changed.</p></div> : <><div className="rounded-md border border-destructive/40 bg-destructive/5 p-4"><p className="font-medium">{archive ? "Archive" : forceDelete ? "Force delete" : "Delete"} {mode.branch.name}?</p><p className="mt-1 text-sm text-muted-foreground">{archive ? "The branch will be archived and hidden from normal Lore branch lists." : forceDelete ? "The local branch will be deleted even if it contains unmerged commits. This cannot be undone. Its remote branch will not be changed." : "Only the local branch will be deleted. Its remote branch will not be changed, and unmerged work will be preserved."}</p></div>{!archive ? <label className="flex items-start gap-3 rounded-md border p-3"><input type="checkbox" className="mt-1" checked={forceDelete} onChange={(event) => setForceDelete(event.target.checked)} disabled={busy} /><span><span className="block font-medium">Force delete</span><span className="block text-sm text-muted-foreground">Delete this branch even when it has commits that haven’t been merged.</span></span></label> : null}</>}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={back}>Back</Button><Button type="submit" variant={mode.kind === "remove" ? "destructive" : "default"} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{mode.kind === "rename" ? "Rename Branch" : `${archive ? "Archive" : forceDelete ? "Force Delete" : "Delete"} Branch`}</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
