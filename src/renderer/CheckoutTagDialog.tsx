import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GitBranch, Loader2, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReferencePicker } from "./ReferencePicker";
import type { GitCheckoutTag, GitRemote, GitTagCheckoutRequest } from "../shared/types";

export function CheckoutTagDialog({ repoPath, remotes, busy, onClose, onCheckout }: {
  repoPath: string;
  remotes: GitRemote[];
  busy: boolean;
  onClose: () => void;
  onCheckout: (request: GitTagCheckoutRequest) => Promise<string | null>;
}): ReactNode {
  const [source, setSource] = useState("");
  const [revision, setRevision] = useState(0);
  const [tags, setTags] = useState<GitCheckoutTag[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createBranch, setCreateBranch] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const saving = busy || submitting;
  const selected = tags.find((tag) => tag.name === selectedName);
  const remoteNames = [...new Set(remotes.filter((remote) => remote.direction === "fetch").map((remote) => remote.name))];
  const options = useMemo(() => tags.map((tag) => ({
    value: tag.name, label: tag.name, detail: tag.description || (tag.commitId ?? tag.objectId).slice(0, 12), icon: <Tag />
  })), [tags]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setTags([]);
    setSelectedName("");
    void window.githead.getCheckoutTags({ repoPath, ...(source ? { remoteName: source } : {}) }).then((result) => {
      if (active) setTags(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load tags.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, source, revision]);

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-[480px]" aria-busy={saving}>
      <form className="grid gap-5" onSubmit={async (event) => {
        event.preventDefault();
        if (!selected || loading || saving || (createBranch && !branchName.trim())) return;
        setSubmitting(true);
        setError("");
        try {
          const failure = await onCheckout({ repoPath, tagName: selected.name, expectedObjectId: selected.objectId,
            ...(source ? { remoteName: source } : {}), ...(createBranch ? { branchName: branchName.trim() } : {}) });
          if (failure) setError(failure);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Unable to check out tag.");
        } finally { setSubmitting(false); }
      }}>
        <DialogHeader>
          <DialogTitle>Check out tag</DialogTitle>
          <DialogDescription>Open the project at a tagged version.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="checkout-tag-source">Tags from</Label>
          <div className="flex gap-2">
            <select id="checkout-tag-source" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" value={source} disabled={saving} onChange={(event) => {
              setSource(event.target.value); setTags([]); setSelectedName(""); setLoading(true);
            }}>
              <option value="">Local tags</option>
              {remoteNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <Button type="button" variant="outline" size="icon" aria-label="Refresh tags" disabled={saving || loading} onClick={() => { setLoading(true); setSelectedName(""); setRevision((value) => value + 1); }}><RefreshCw /></Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="checkout-tag-picker">Tag</Label>
          <ReferencePicker id="checkout-tag-picker" value={selectedName} options={options} ariaLabel="Select tag" placeholder={loading ? "Loading tags…" : "Select a tag"} searchPlaceholder="Search tags…" emptyMessage="No tags found." disabled={saving || loading} onValueChange={setSelectedName} />
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading tags…</p> : !tags.length && !error ? <p className="text-sm text-muted-foreground">No tags found in {source || "this repository"}.</p> : null}
        </div>
        {selected ? <div className="grid gap-1 rounded-md border p-3 text-sm">
          <p className="break-all font-medium">{selected.name}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{selected.commitId ? `Commit ${selected.commitId}` : `Tag object ${selected.objectId}`}</p>
          {selected.description ? <p className="break-words">{selected.description}</p> : null}
          {source ? <p className="text-muted-foreground">The selected tag will be fetched from {source} before checkout.</p> : null}
        </div> : null}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createBranch} disabled={saving} onChange={(event) => setCreateBranch(event.target.checked)} />Create a branch from this tag</label>
        {createBranch ? <div className="grid gap-2"><Label htmlFor="checkout-tag-branch">New branch name</Label><Input id="checkout-tag-branch" value={branchName} disabled={saving} onChange={(event) => setBranchName(event.target.value)} placeholder="release-fix" /></div>
          : <p className="text-sm text-muted-foreground">View this version without being on a branch. Create a branch when you’re ready to make commits.</p>}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || loading || !selected || (createBranch && !branchName.trim())}>{saving ? <Loader2 className="animate-spin" /> : createBranch ? <GitBranch /> : <Tag />}{createBranch ? "Create branch from tag" : "Check out tag"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
