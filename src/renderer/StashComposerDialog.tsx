import { Archive, Loader2, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitOperationResult, GitStashCreateRequest, GitStashScope, GitStashSelection, GitStatusFile } from "../shared/types";

export type StashCreateDraft = Omit<GitStashCreateRequest, "repoPath">;

export function StashComposerDialog({
  open,
  branch,
  files,
  selectedPaths,
  disabled,
  canGenerateMessage,
  generateTitle,
  onClose,
  onManage,
  onCreate,
  onGenerateMessage
}: {
  open: boolean;
  branch: string | null;
  files: GitStatusFile[];
  selectedPaths: string[];
  disabled: boolean;
  canGenerateMessage: boolean;
  generateTitle: string;
  onClose: () => void;
  onManage: () => void;
  onCreate: (draft: StashCreateDraft) => Promise<string | null>;
  onGenerateMessage: (selection: GitStashSelection) => Promise<GitOperationResult>;
}): ReactNode {
  const messageInputRef = useRef<HTMLInputElement>(null);
  const scopeDescriptionId = useId();
  const contextKey = selectedPaths.join("\0");
  const selectedFiles = useMemo(() => {
    const selected = new Set(selectedPaths);
    return files.filter((file) => selected.has(file.path));
  }, [files, selectedPaths]);
  const stagedCount = files.filter((file) => file.isStaged).length;
  const hasSelectedUntracked = selectedFiles.some(isUntrackedFile);
  const [scope, setScope] = useState<GitStashScope>("selected");
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(hasSelectedUntracked);
  const [keepIndex, setKeepIndex] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setScope("selected");
    setMessage("");
    setIncludeUntracked(hasSelectedUntracked);
    setKeepIndex(false);
    setSubmitting(false);
    setGenerating(false);
    setError("");
    requestAnimationFrame(() => messageInputRef.current?.focus());
  }, [contextKey, hasSelectedUntracked, open]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || generating || disabled) return;
    setSubmitting(true);
    setError("");
    const nextError = await onCreate({
      message,
      scope,
      paths: scope === "selected" ? selectedPaths : [],
      includeUntracked: scope === "staged" ? false : includeUntracked,
      keepIndex: scope === "staged" ? false : keepIndex
    });
    setSubmitting(false);
    if (nextError) setError(nextError);
  };

  const selection = (): GitStashSelection => ({
    scope,
    paths: scope === "selected" ? selectedPaths : [],
    includeUntracked: scope === "staged" ? false : includeUntracked,
    keepIndex: scope === "staged" ? false : keepIndex
  });

  const generateMessage = async (): Promise<void> => {
    if (generating || submitting || disabled || !canGenerateMessage) return;
    setGenerating(true);
    setError("");
    const result = await onGenerateMessage(selection());
    setGenerating(false);
    if (result.exitCode === 0) setMessage(result.stdout.trim());
    else setError(result.stderr.trim() || "Unable to generate a stash message.");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting && !generating) onClose(); }}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[640px]"
        showCloseButton={!submitting && !generating}
        aria-busy={submitting || generating}
      >
        <form className="flex min-h-0 flex-col" onSubmit={(event) => { void submit(event); }}>
          <DialogHeader className="stash-composer-header">
            <div className="min-w-0">
              <DialogTitle>New stash</DialogTitle>
              <DialogDescription className="mt-1.5 truncate">Source branch: {branch || "Detached HEAD"}</DialogDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onManage} disabled={submitting || generating}>Manage stashes</Button>
          </DialogHeader>

          <div className="stash-composer-body">
            <p className="text-sm text-muted-foreground">Save working changes without committing them.</p>

            <div className="grid gap-2">
              <Label htmlFor="stash-message">Message</Label>
              <div className="flex gap-2">
                <Input ref={messageInputRef} id="stash-message" value={message} placeholder="Describe these changes" onChange={(event) => setMessage(event.target.value)} disabled={disabled || submitting || generating} />
                <Button type="button" variant="outline" size="icon" aria-label="Generate stash message" title={generateTitle} disabled={disabled || submitting || generating || !canGenerateMessage} onClick={() => { void generateMessage(); }}>
                  {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                </Button>
              </div>
            </div>

            <fieldset className="grid gap-2" aria-describedby={scopeDescriptionId}>
              <legend className="text-sm font-medium">Scope</legend>
              <p id={scopeDescriptionId} className="sr-only">Choose which working changes to save.</p>
              <div className="stash-scope-grid">
                <StashScopeChoice checked={scope === "all"} label="All changes" description="Staged and unstaged files." disabled={disabled || submitting} onChange={() => setScope("all")} />
                <StashScopeChoice checked={scope === "selected"} label={`Selected files (${selectedFiles.length})`} description="Only the current selection." disabled={disabled || submitting || selectedFiles.length === 0} onChange={() => setScope("selected")} />
                <StashScopeChoice checked={scope === "staged"} label="Staged only" description="Only staged changes." disabled={disabled || submitting || stagedCount === 0} onChange={() => setScope("staged")} />
              </div>
            </fieldset>

            {scope === "selected" ? (
              <section aria-label="Included files">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Included files</h3>
                  <span className="text-xs text-muted-foreground">{selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"}</span>
                </div>
                <div className="stash-composer-files">
                  {selectedFiles.slice(0, 5).map((file) => <div key={file.path} className="stash-composer-file"><Archive /><span>{file.path}</span></div>)}
                  {selectedFiles.length > 5 ? <p className="px-3 py-2 text-xs text-muted-foreground">{selectedFiles.length - 5} more files</p> : null}
                </div>
              </section>
            ) : null}

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Options</legend>
              <div className="stash-options-grid">
                <label className={`stash-option ${scope === "staged" ? "is-disabled" : ""}`}>
                  <input type="checkbox" checked={scope !== "staged" && includeUntracked} disabled={disabled || submitting || scope === "staged"} onChange={(event) => setIncludeUntracked(event.target.checked)} />
                  <span><strong>Include untracked files</strong><small>Save files that Git does not track.</small></span>
                </label>
                <label className={`stash-option ${scope === "staged" ? "is-disabled" : ""}`}>
                  <input type="checkbox" checked={scope !== "staged" && keepIndex} disabled={disabled || submitting || scope === "staged"} onChange={(event) => setKeepIndex(event.target.checked)} />
                  <span><strong>Keep staged changes</strong><small>Leave staged changes in the working tree.</small></span>
                </label>
              </div>
            </fieldset>

            <p className="text-xs text-muted-foreground">Ignored files always stay in the working tree.</p>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </div>

          <footer className="stash-composer-footer">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting || generating}>Cancel</Button>
            <Button type="submit" disabled={disabled || submitting || generating || (scope === "selected" && selectedFiles.length === 0)}>
              <Archive />
              {submitting ? "Creating stash" : "Create stash"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StashScopeChoice({ checked, label, description, disabled, onChange }: {
  checked: boolean;
  label: string;
  description: string;
  disabled: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <label className={`stash-scope-choice ${disabled ? "is-disabled" : ""}`}>
      <input type="radio" name="stash-scope" checked={checked} disabled={disabled} onChange={onChange} />
      <span><strong>{label}</strong><small>{description}</small></span>
    </label>
  );
}

function isUntrackedFile(file: GitStatusFile): boolean {
  return file.indexStatus === "?" && file.worktreeStatus === "?";
}
