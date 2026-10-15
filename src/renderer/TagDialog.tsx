import { AlertTriangle, Loader2, Tag, Trash2 } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { GitCommitGraphRow } from "../shared/types";
import { EmptyState } from "./EmptyState";

export interface TagDialogState {
  open: boolean;
  hash: string;
  tab: "add" | "remove";
  tagName: string;
  message: string;
  lightweight: boolean;
  force: boolean;
  pushRemote: string | null;
  deleteTagName: string;
  deletePushRemote: string | null;
  deleteConfirmed: boolean;
  error: string;
}

export interface TagDialogProps {
  state: TagDialogState;
  commit: GitCommitGraphRow | null;
  remotes: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onStateChange: (state: TagDialogState) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (event: FormEvent<HTMLFormElement>) => void;
}

const fieldClass = "grid gap-2";

function commitTags(commit: GitCommitGraphRow | null): string[] {
  return commit?.refs.filter((ref) => ref.kind === "tag").map((ref) => ref.name) ?? [];
}

function update(state: TagDialogState, patch: Partial<TagDialogState>): TagDialogState {
  return { ...state, ...patch };
}

export function TagDialog({ state, commit, remotes, saving, onOpenChange, onStateChange, onCreate, onDelete }: TagDialogProps): ReactNode {
  const tags = commitTags(commit);
  const shortHash = commit?.shortHash || state.hash.slice(0, 7);
  const subject = commit?.subject || "Selected commit";
  const removeRemote = state.deletePushRemote;
  const removeDescription = removeRemote
    ? `This removes the local tag and deletes it from ${removeRemote}. Other remotes are not changed.`
    : "This removes only the local tag. Tags on remotes are not changed.";
  const set = (patch: Partial<TagDialogState>): void => onStateChange(update(state, patch));

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-busy={saving}>
        <DialogHeader className="pr-8">
          <p className="eyebrow">Commit action</p>
          <DialogTitle>Manage tag</DialogTitle>
          <DialogDescription>Create or remove a tag for this commit.</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-surface p-3" aria-label="Target commit">
          <code className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">{shortHash}</code>
          <TooltipTarget content={subject}><span className="min-w-0 truncate text-sm font-medium text-foreground">{subject}</span></TooltipTarget>
        </div>

        <Tabs value={state.tab} onValueChange={(value) => set({ tab: value === "remove" ? "remove" : "add", error: "", deleteConfirmed: false })}>
          <TabsList className="grid w-full grid-cols-2" aria-label="Tag action">
            <TabsTrigger value="add" disabled={saving}><Tag />Create</TabsTrigger>
            <TabsTrigger value="remove" disabled={saving}><Trash2 />Remove{tags.length ? ` (${tags.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="pt-3">
            <form className="grid gap-5" onSubmit={(event) => {
              if (saving) {
                event.preventDefault();
                return;
              }
              onCreate(event);
            }} noValidate>
              <div className={fieldClass}>
                <Label htmlFor="tag-name">Tag name</Label>
                <Input id="tag-name" value={state.tagName} disabled={saving} autoFocus autoComplete="off" aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "tag-create-error" : "tag-name-help"} onChange={(event) => set({ tagName: event.currentTarget.value, error: "" })} />
                <p id="tag-name-help" className="text-xs text-muted-foreground">Use a version or release name such as v1.2.3.</p>
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Tag type</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="choice-card">
                    <input type="radio" name="tag-type" value="annotated" checked={!state.lightweight} disabled={saving} onChange={() => set({ lightweight: false, error: "" })} />
                    <span><strong>Annotated</strong><small>Stores a message, author, and date. Best for releases.</small></span>
                  </label>
                  <label className="choice-card">
                    <input type="radio" name="tag-type" value="lightweight" checked={state.lightweight} disabled={saving} onChange={() => set({ lightweight: true, error: "" })} />
                    <span><strong>Lightweight</strong><small>A simple name pointing directly to this commit.</small></span>
                  </label>
                </div>
              </fieldset>

              {!state.lightweight ? <div className={fieldClass}>
                <Label htmlFor="tag-message">Message <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="tag-message" value={state.message} rows={3} disabled={saving} placeholder="Describe this release" onChange={(event) => set({ message: event.currentTarget.value, error: "" })} />
                <p className="text-xs text-muted-foreground">If left blank, the tag name is used as the message.</p>
              </div> : null}

              <div className={fieldClass}>
                <Label htmlFor="tag-push-remote">Push after creating</Label>
                <select id="tag-push-remote" className="form-select" value={state.pushRemote ?? ""} disabled={saving || remotes.length === 0} onChange={(event) => set({ pushRemote: event.currentTarget.value || null, error: "" })}>
                  <option value="">Do not push</option>
                  {remotes.map((remote) => <option key={remote} value={remote}>{remote}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{remotes.length ? "The tag stays local unless you select a remote." : "No push remotes are configured; the tag will stay local."}</p>
              </div>

              <label className="choice-card" data-tone="danger">
                <input type="checkbox" checked={state.force} disabled={saving} onChange={(event) => set({ force: event.currentTarget.checked, error: "" })} />
                <span><strong>Move an existing tag</strong><small>Allow this tag name to be reassigned to the selected commit.</small>{state.force ? <span className="mt-1 flex gap-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Existing references to this tag may now resolve to a different commit.</span> : null}</span>
              </label>

              {state.error ? <p id="tag-create-error" className="dialog-error" role="alert">{state.error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{saving ? "Cancel operation" : "Cancel"}</Button>
                <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Tag />}{saving ? "Creating…" : "Create tag"}</Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="remove" className="pt-3">
            {tags.length === 0 ? <EmptyState className="rounded-lg border border-dashed" icon={<Tag />} title="No tags on this commit" description="Create a tag first, or choose another commit that already has one." /> : <form className="grid gap-5" onSubmit={(event) => {
              if (saving) {
                event.preventDefault();
                return;
              }
              onDelete(event);
            }}>
              <div className={fieldClass}>
                <Label htmlFor="tag-remove-name">Local tag</Label>
                <select id="tag-remove-name" className="form-select" value={state.deleteTagName} disabled={saving} onChange={(event) => set({ deleteTagName: event.currentTarget.value, deleteConfirmed: false, error: "" })}>
                  {tags.map((name) => <option key={`${state.hash}:${name}`} value={name}>{name}</option>)}
                </select>
              </div>
              <div className={fieldClass}>
                <Label htmlFor="tag-delete-push-remote">Also delete from remote</Label>
                <select id="tag-delete-push-remote" className="form-select" value={removeRemote ?? ""} disabled={saving || remotes.length === 0} onChange={(event) => set({ deletePushRemote: event.currentTarget.value || null, deleteConfirmed: false, error: "" })}>
                  <option value="">Do not delete from a remote</option>
                  {remotes.map((remote) => <option key={remote} value={remote}>{remote}</option>)}
                </select>
                {!remotes.length ? <p className="text-xs text-muted-foreground">No push remotes are configured.</p> : null}
              </div>
              <div className="dialog-notice" data-tone="danger">
                <AlertTriangle aria-hidden="true" />
                <div><p className="dialog-notice-title">Remove {state.deleteTagName}?</p><p className="mt-1 text-muted-foreground">{removeDescription}</p></div>
              </div>
              <label className="choice-card">
                <input type="checkbox" checked={state.deleteConfirmed} disabled={saving} onChange={(event) => set({ deleteConfirmed: event.currentTarget.checked, error: "" })} />
                <span>I understand this tag reference will be removed.</span>
              </label>
              {state.error ? <p id="tag-remove-error" className="dialog-error" role="alert">{state.error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{saving ? "Cancel operation" : "Cancel"}</Button>
                <Button type="submit" variant="destructive" disabled={saving || !state.deleteConfirmed}>{saving ? <Loader2 className="animate-spin" /> : <Trash2 />}{saving ? "Removing…" : "Remove tag"}</Button>
              </DialogFooter>
            </form>}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
