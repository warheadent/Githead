import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
    if (busy) {
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!busy) {
        onOpenChange(nextOpen);
      }
    }}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl" showCloseButton={!busy}>
        <DialogHeader>
          <p className="eyebrow">Repository</p>
          <DialogTitle>Manage Remotes</DialogTitle>
          <TooltipTarget content={repoPath}>
            <DialogDescription className="truncate">
              {repoPath}. Changes are saved locally; use Fetch when you want to contact a remote.
            </DialogDescription>
          </TooltipTarget>
        </DialogHeader>

        {mode.kind === "list" ? (
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
        ) : (
          <form className="grid min-h-0 gap-5 overflow-auto" onSubmit={submit}>
            {mode.kind === "add" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="remote-name">Name</Label>
                  <Input id="remote-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="remote-url">URL</Label>
                  <Input id="remote-url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} placeholder="https://host/owner/repository.git" aria-invalid={Boolean(error)} />
                  <p className="text-xs text-muted-foreground">The URL will be used for both fetch and push.</p>
                </div>
              </>
            ) : null}

            {mode.kind === "rename" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="remote-new-name">New name</Label>
                  <Input id="remote-new-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} />
                </div>
                {mode.remote.trackedBranches.length > 0 ? (
                  <ImpactNotice title="Branch tracking will be updated">
                    Git will update the upstream configuration for {formatBranches(mode.remote.trackedBranches)}.
                  </ImpactNotice>
                ) : null}
                {impactsGitHub ? <GitHubImpactNotice action="renaming" /> : null}
              </>
            ) : null}

            {mode.kind === "edit" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="remote-edit-url">URL for {mode.remote.name}</Label>
                  <Input id="remote-edit-url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} autoFocus aria-invalid={Boolean(error)} />
                </div>
                <p className="text-sm text-muted-foreground">This changes local configuration only and does not fetch.</p>
              </>
            ) : null}

            {mode.kind === "remove" ? (
              <>
                <ImpactNotice title={`Remove ${mode.remote.name}?`} destructive>
                  Remote configuration and remote-tracking refs will be removed.
                </ImpactNotice>
                {mode.remote.trackedBranches.length > 0 ? (
                  <ImpactNotice title="Branch tracking will be cleared" destructive>
                    The upstream will be removed from {formatBranches(mode.remote.trackedBranches)}.
                  </ImpactNotice>
                ) : null}
                {impactsGitHub ? <GitHubImpactNotice action="removing" /> : null}
              </>
            ) : null}

            {error ? <p className="error-text selectable-text" role="alert">{error}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={returnToList}>Back</Button>
              <Button type="submit" variant={mode.kind === "remove" ? "destructive" : "default"} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {mode.kind === "add" ? "Add Remote" : mode.kind === "rename" ? "Rename Remote" : mode.kind === "edit" ? "Save URL" : "Remove Remote"}
              </Button>
            </DialogFooter>
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
    <div className="grid min-h-0 gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{remotes.length} configured {remotes.length === 1 ? "remote" : "remotes"}</p>
        <Button type="button" size="sm" onClick={onAdd} disabled={loading || busy}>
          <Plus /> Add Remote
        </Button>
      </div>
      <div className="max-h-[55vh] space-y-3 overflow-auto pr-1" aria-live="polite" aria-busy={loading}>
        {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" /> Loading remotes…</p> : null}
        {!loading && error ? (
          <div className="grid gap-3 rounded-md border border-destructive/40 p-4" role="alert">
            <p className="error-text selectable-text">{error}</p>
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onReload}>Try Again</Button>
          </div>
        ) : null}
        {!loading && !error && remotes.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No remotes configured.</div>
        ) : null}
        {!loading && !error ? remotes.map((remote) => {
          const advanced = !isRemoteUrlEditable(remote);
          return (
            <section key={remote.name} className="grid gap-3 rounded-md border bg-card p-4" aria-label={`Remote ${remote.name}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{remote.name}</h3>
                  {advanced ? <Badge variant="secondary">Advanced</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => onRename(remote)}><Pencil /> Rename</Button>
                  <TooltipButton type="button" variant="outline" size="xs" disabled={busy || advanced} tooltip="Edit remote URL" disabledTooltip={advanced ? "Use the Git CLI to edit advanced URL configuration" : undefined} onClick={() => onEdit(remote)}><Pencil /> Edit URL</TooltipButton>
                  <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => onRemove(remote)}><Trash2 /> Remove</Button>
                </div>
              </div>
              <RemoteUrls remote={remote} />
              {advanced ? <p className="text-xs text-muted-foreground">Githead protects advanced URL configuration. Use the Git CLI to edit these URLs.</p> : <p className="text-xs text-muted-foreground">Used for fetch and push.</p>}
              {remote.trackedBranches.length > 0 ? <p className="selectable-text text-xs text-muted-foreground">Tracks: {remote.trackedBranches.join(", ")}</p> : null}
            </section>
          );
        }) : null}
      </div>
    </div>
  );
}

function RemoteUrls({ remote }: { remote: GitRemoteConfig }): ReactNode {
  return (
    <dl className="selectable-text grid gap-2 text-xs">
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
        <dt className="text-muted-foreground">Fetch</dt>
        <dd className="grid gap-1">{remote.fetchUrls.length > 0 ? remote.fetchUrls.map((value, index) => <code key={`${index}:${value}`} className="break-all">{value}</code>) : <span>Not configured</span>}</dd>
      </div>
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
        <dt className="text-muted-foreground">Push</dt>
        <dd className="grid gap-1">{remote.pushUrls.length > 0 ? remote.pushUrls.map((value, index) => <code key={`${index}:${value}`} className="break-all">{value}</code>) : <span>Uses fetch URL</span>}</dd>
      </div>
    </dl>
  );
}

function ImpactNotice({ title, destructive = false, children }: { title: string; destructive?: boolean; children: ReactNode }): ReactNode {
  return (
    <div className={destructive ? "rounded-md border border-destructive/40 bg-destructive/5 p-4" : "rounded-md border bg-muted/40 p-4"}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
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
