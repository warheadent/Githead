import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { GitConfigRequest, GitIgnoreFile } from "../shared/gitConfig";

export function GitIgnoreFileDialog({ open, request, onClose }: { open: boolean; request: GitConfigRequest; onClose: () => void }) {
  const [file, setFile] = useState<GitIgnoreFile | null>(null);
  const [contents, setContents] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setFile(null);
    setError("");
    setDiscard(false);
    void window.githead.getGitIgnoreFile({ repoPath: request.repoPath, scope: request.scope }).then((next) => {
      if (current) { setFile(next); setContents(next.contents); }
    }).catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : "Unable to open the ignore file."); });
    return () => { current = false; };
  }, [open, request.repoPath, request.scope]);
  const close = () => {
    if (saving) return;
    if (file && contents !== file.contents) setDiscard(true);
    else onClose();
  };
  const save = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await window.githead.saveGitIgnoreFile({ ...request, ...file, contents, operationId: `git-ignore-${crypto.randomUUID()}` });
      setFile(next);
      setContents(next.contents);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the ignore file."); }
    finally { setSaving(false); }
  };
  return <><Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent className="sm:max-w-[680px]">
      <DialogHeader><DialogTitle>Personal ignore file</DialogTitle><DialogDescription className="break-all">{file?.filePath ?? "Loading ignore file…"}</DialogDescription></DialogHeader>
      <Label htmlFor="git-ignore-patterns">Ignore patterns</Label>
      <textarea id="git-ignore-patterns" className="min-h-64 w-full rounded-md border bg-background p-3 font-mono text-sm" spellCheck={false} disabled={!file || saving} value={contents} onChange={(event) => setContents(event.target.value)} />
      <p className="text-sm text-muted-foreground">Enter one pattern per line. These rules do not remove files that Git already tracks.</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button><Button type="button" disabled={!file || saving || contents === file.contents} onClick={() => { void save(); }}>{saving ? "Saving…" : "Save ignore file"}</Button></DialogFooter>
    </DialogContent>
  </Dialog><Dialog open={discard} onOpenChange={setDiscard}><DialogContent><DialogHeader><DialogTitle>Discard ignore file edits?</DialogTitle><DialogDescription>Your unsaved patterns will be lost.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button type="button" variant="destructive" onClick={() => { setDiscard(false); onClose(); }}>Discard edits</Button></DialogFooter></DialogContent></Dialog></>;
}
