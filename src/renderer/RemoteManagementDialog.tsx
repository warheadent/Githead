import { ArrowDown, ArrowLeft, ArrowUp, FolderGit2, GitBranch, Info, Link2, Loader2, Network, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { GitRemoteConfig } from "../shared/types";
import { LoadingState } from "./LoadingState";

type RemoteDialogMode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "rename"; remote: GitRemoteConfig }
  | { kind: "edit"; remote: GitRemoteConfig }
  | { kind: "remove"; remote: GitRemoteConfig };

export interface RemoteManagementDialogProps {
  open: boolean;
  repoPath: string;
  remotes: GitRemoteConfig[];
  loading: boolean;
  busy: boolean;
  mutationBlocked?: boolean;
  loadError: string;
  hasGitHubOrigin: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onRefreshRemote: (name: string) => Promise<GitRemoteConfig | null>;
  onAdd: (name: string, url: string) => Promise<string | null>;
  onRename: (currentName: string, newName: string) => Promise<string | null>;
  onSetUrl: (name: string, url: string) => Promise<string | null>;
  onRemove: (name: string) => Promise<string | null>;
}

export function RemoteManagementDialog({
  open,
  repoPath,
  remotes,
  loading,
  busy,
  mutationBlocked = false,
  loadError,
  hasGitHubOrigin,
  onOpenChange,
  onReload,
  onRefreshRemote,
  onAdd,
  onRename,
  onSetUrl,
  onRemove
}: RemoteManagementDialogProps): ReactNode {
  const [mode, setMode] = useState<RemoteDialogMode>({ kind: "list" });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMode({ kind: "list" });
      setName("");
      setUrl("");
      setError("");
    }
  }, [open, repoPath]);

  const returnToList = (): void => {
    setMode({ kind: "list" });
    setName("");
    setUrl("");
    setError("");
  };

  const beginAdd = (): void => {
    setName(remotes.some((remote) => remote.name === "origin") ? "" : "origin");
    setUrl("");
    setError("");
    setMode({ kind: "add" });
  };

  const beginRename = (remote: GitRemoteConfig): void => {
    setName(remote.name);
    setError("");
    setMode({ kind: "rename", remote });
  };

  const beginEdit = (remote: GitRemoteConfig): void => {
    setUrl(remote.fetchUrls[0] ?? "");
    setError("");
    setMode({ kind: "edit", remote });
  };

  const runMutation = async (operation: () => Promise<string | null>): Promise<void> => {
    setError("");
    const operationError = await operation();
    if (operationError) {
      setError(operationError);
      return;
    }
    returnToList();
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || mutationBlocked) {
      return;
    }
    if (mode.kind === "add") {
      if (!name.trim() || !url.trim()) {
        setError("Enter a remote name and URL.");
        return;
      }
      void runMutation(() => onAdd(name, url));
    } else if (mode.kind === "rename") {
      if (!name.trim()) {
        setError("Enter a remote name.");
        return;
      }
      if (name.trim() === mode.remote.name) {
        setError("Enter a different remote name.");
        return;
      }
      void runMutation(() => onRename(mode.remote.name, name));
    } else if (mode.kind === "edit") {
      if (!url.trim()) {
        setError("Enter a remote URL.");
        return;
      }
      void runMutation(() => onSetUrl(mode.remote.name, url));
    } else if (mode.kind === "remove") {
      void runMutation(() => onRemove(mode.remote.name));
    }
  };

  const selectedRemote = mode.kind === "rename" || mode.kind === "edit" || mode.kind === "remove"
    ? mode.remote
    : null;
  const impactsGitHub = selectedRemote?.name === "origin" && hasGitHubOrigin;
  const title = mode.kind === "list" ? "Manage Remotes"
    : mode.kind === "add" ? "Add Remote"
    : mode.kind === "rename" ? "Rename Remote"
    : mode.kind === "edit" ? "Edit Remote URL"
    : "Remove Remote";
  const description = mode.kind === "list" ? "Manage the repositories you fetch from and push to."
    : mode.kind === "add" ? "Connect this repository to another location."
    : mode.kind === "rename" ? "Choose a new local name for this remote."
    : mode.kind === "edit" ? "Update the address used for fetch and push."
    : "Review what will change before removing this remote.";
  const HeaderIcon = mode.kind === "remove" ? Trash2 : mode.kind === "edit" ? Link2 : Network;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 ${mode.kind === "list" ? "sm:max-w-2xl" : "sm:max-w-xl"}`}
        aria-busy={busy}
      >
        <DialogHeader className="gap-4 border-b px-6 py-5 text-left">
          <div className="flex items-start gap-3 pr-6">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${mode.kind === "remove" ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-primary/15 bg-primary/10 text-primary"}`}>
              <HeaderIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <DialogTitle className="leading-6">{title}</DialogTitle>
              <DialogDescription className="text-pretty leading-5">{description}</DialogDescription>
            </div>
          </div>
          <TooltipTarget content={repoPath}>
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <FolderGit2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="selectable-text truncate">{repoPath}</span>
            </p>
          </TooltipTarget>
        </DialogHeader>

        {mode.kind === "list" ? (
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            <RemoteList
              remotes={remotes}
              loading={loading}
              busy={busy}
              error={loadError}
              onReload={onReload}
              onAdd={beginAdd}
              onRename={(remote) => {
                void onRefreshRemote(remote.name).then((freshRemote) => {
                  if (freshRemote) {
                    beginRename(freshRemote);
                  }
                });
              }}
              onEdit={beginEdit}
              onRemove={(remote) => {
                void onRefreshRemote(remote.name).then((freshRemote) => {
                  if (freshRemote) {
                    setError("");
                    setMode({ kind: "remove", remote: freshRemote });
                  }
                });
              }}
            />
            <div className="flex items-center justify-between gap-4 border-t bg-muted/20 px-6 py-4">
              <LocalChangesNote />
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form key={mode.kind} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" onSubmit={submit}>
            <div className="grid content-start gap-5 overflow-y-auto px-6 py-5">
              {selectedRemote ? (
                <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Network className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="selectable-text break-all text-sm font-semibold">{selectedRemote.name}</span>
                  </div>
                  <RemoteUrls remote={selectedRemote} />
                </div>
              ) : null}
              {mode.kind === "add" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="remote-name">Name</Label>
                    <Input id="remote-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? "remote-error" : undefined} autoComplete="off" spellCheck={false} />
                    <p className="text-xs leading-5 text-muted-foreground">A short name, such as origin or upstream.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="remote-url">URL</Label>
                    <Input id="remote-url" className="font-mono md:text-xs" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} placeholder="https://host/owner/repository.git" aria-invalid={Boolean(error)} aria-describedby={error ? "remote-error" : "remote-url-hint"} autoComplete="off" spellCheck={false} />
                    <p id="remote-url-hint" className="text-xs leading-5 text-muted-foreground">Use an HTTPS or SSH URL. Used for both fetch and push.</p>
                  </div>
                </>
              ) : null}

              {mode.kind === "rename" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="remote-new-name">New name</Label>
                    <Input id="remote-new-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? "remote-error" : undefined} autoComplete="off" spellCheck={false} />
                  </div>
                  {mode.remote.trackedBranches.length > 0 || impactsGitHub ? (
                    <div className="grid gap-4 rounded-lg border bg-muted/20 p-4">
                      {mode.remote.trackedBranches.length > 0 ? (
                        <ImpactNotice title="Branch tracking will be updated">
                          Git will update the upstream configuration for {formatBranches(mode.remote.trackedBranches)}.
                        </ImpactNotice>
                      ) : null}
                      {impactsGitHub ? <GitHubImpactNotice action="renaming" /> : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {mode.kind === "edit" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="remote-edit-url">New URL</Label>
                    <Input id="remote-edit-url" className="font-mono md:text-xs" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? "remote-error" : undefined} autoComplete="off" spellCheck={false} />
                    <p className="text-xs leading-5 text-muted-foreground">Used for both fetch and push. No connection is made when you save.</p>
                  </div>
                </>
              ) : null}

              {mode.kind === "remove" ? (
                <>
                  <div className="grid gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                    <ImpactNotice title="Remote connection will be removed" destructive>
                      This removes the local remote configuration and remote-tracking references. Your local branches and the remote repository are kept.
                    </ImpactNotice>
                    {mode.remote.trackedBranches.length > 0 ? (
                      <ImpactNotice title="Branch tracking will be cleared" destructive>
                        The upstream will be removed from {formatBranches(mode.remote.trackedBranches)}.
                      </ImpactNotice>
                    ) : null}
                    {impactsGitHub ? <GitHubImpactNotice action="removing" /> : null}
                  </div>
                </>
              ) : null}

              {error ? <p id="remote-error" className="selectable-text break-words rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
            </div>

            <div className="grid gap-4 border-t bg-muted/20 px-6 py-4">
              <LocalChangesNote />
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="outline" autoFocus={mode.kind === "remove"} onClick={busy ? () => onOpenChange(false) : returnToList}>
                  {!busy ? <ArrowLeft aria-hidden="true" /> : null}{busy ? "Cancel operation" : "Back"}
                </Button>
                <Button type="submit" variant={mode.kind === "remove" ? "destructive" : "default"} disabled={busy || mutationBlocked}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {mode.kind === "add" ? "Add Remote" : mode.kind === "rename" ? "Rename Remote" : mode.kind === "edit" ? "Save URL" : "Remove Remote"}
                </Button>
              </DialogFooter>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RemoteList({
  remotes,
  loading,
  busy,
  error,
  onReload,
  onAdd,
  onRename,
  onEdit,
  onRemove
}: {
  remotes: GitRemoteConfig[];
  loading: boolean;
  busy: boolean;
  error: string;
  onReload: () => void;
  onAdd: () => void;
  onRename: (remote: GitRemoteConfig) => void;
  onEdit: (remote: GitRemoteConfig) => void;
  onRemove: (remote: GitRemoteConfig) => void;
}): ReactNode {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">Configured remotes <Badge variant="secondary" className="tabular-nums">{remotes.length}</Badge></p>
        <Button type="button" size="sm" onClick={onAdd} disabled={loading || busy}>
          <Plus /> Add Remote
        </Button>
      </div>
      <div className="space-y-3 overflow-y-auto" aria-live="polite" aria-busy={loading}>
        {loading ? <LoadingState label="Loading remotes" /> : null}
        {!loading && error ? (
          <div className="grid gap-3 rounded-md border border-destructive/40 p-4" role="alert">
            <p className="error-text selectable-text">{error}</p>
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onReload}>Try Again</Button>
          </div>
        ) : null}
        {!loading && !error && remotes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
            <Network className="mb-1 size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No remotes configured</p>
            <p className="max-w-xs text-sm leading-5 text-muted-foreground">Add a remote to fetch changes or push your commits to another repository.</p>
          </div>
        ) : null}
        {!loading && !error ? remotes.map((remote) => {
          const advanced = !isRemoteUrlEditable(remote);
          return (
            <section key={remote.name} className="overflow-hidden rounded-lg border bg-card" aria-label={`Remote ${remote.name}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Network className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <h3 className="selectable-text break-all text-sm font-semibold">{remote.name}</h3>
                  {advanced ? <Badge variant="secondary">Advanced</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRename(remote)}><Pencil /> Rename</Button>
                  <TooltipButton type="button" variant="ghost" size="sm" disabled={busy || advanced} tooltip="Edit remote URL" disabledTooltip={advanced ? "Use the Git CLI to edit advanced URL configuration" : undefined} onClick={() => onEdit(remote)}><Link2 /> Edit URL</TooltipButton>
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => onRemove(remote)}><Trash2 /> Remove</Button>
                </div>
              </div>
              <div className="grid gap-3 p-4">
                <RemoteUrls remote={remote} />
                {advanced ? <p className="text-xs leading-5 text-muted-foreground">Use the Git CLI to edit this advanced URL configuration.</p> : null}
                {remote.trackedBranches.length > 0 ? (
                  <div className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
                    <p className="selectable-text min-w-0 break-words">Tracks {remote.trackedBranches.join(", ")}</p>
                  </div>
                ) : null}
              </div>
            </section>
          );
        }) : null}
      </div>
    </div>
  );
}

function RemoteUrls({ remote }: { remote: GitRemoteConfig }): ReactNode {
  return (
    <dl className="selectable-text grid min-w-0 gap-2.5 text-xs leading-5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <dt className="flex items-center gap-1.5 text-muted-foreground"><ArrowDown className="size-3" aria-hidden="true" />Fetch</dt>
        <dd className="grid gap-1">{remote.fetchUrls.length > 0 ? remote.fetchUrls.map((value, index) => <code key={`${index}:${value}`} className="break-all">{value}</code>) : <span>Not configured</span>}</dd>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <dt className="flex items-center gap-1.5 text-muted-foreground"><ArrowUp className="size-3" aria-hidden="true" />Push</dt>
        <dd className="grid gap-1">{remote.pushUrls.length > 0 ? remote.pushUrls.map((value, index) => <code key={`${index}:${value}`} className="break-all">{value}</code>) : <span className="text-muted-foreground">Same as fetch</span>}</dd>
      </div>
    </dl>
  );
}

function LocalChangesNote(): ReactNode {
  return (
    <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>Changes are saved locally. Use Fetch to contact a remote.</span>
    </p>
  );
}

function ImpactNotice({ title, destructive = false, children }: { title: string; destructive?: boolean; children: ReactNode }): ReactNode {
  const Icon = destructive ? TriangleAlert : Info;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${destructive ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="selectable-text mt-1 break-words text-xs leading-5 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function GitHubImpactNotice({ action }: { action: "renaming" | "removing" }): ReactNode {
  return (
    <ImpactNotice title="GitHub views will be disconnected" destructive={action === "removing"}>
      {action === "renaming" ? "Renaming" : "Removing"} origin disables Workflow Runs, Pull Requests, and Issues until a supported GitHub remote is named origin again.
    </ImpactNotice>
  );
}

function isRemoteUrlEditable(remote: GitRemoteConfig): boolean {
  return remote.fetchUrls.length === 1 && remote.pushUrls.length === 0;
}

function formatBranches(branches: string[]): string {
  if (branches.length === 1) {
    return `branch ${branches[0]}`;
  }
  return `branches ${branches.join(", ")}`;
}
