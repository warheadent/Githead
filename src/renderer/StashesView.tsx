import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpDown, ChevronRight, Clock3, Files, GitBranch, MoreHorizontal, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { GitStashDetails, GitStashEntry } from "../shared/types";
import { findStashEntry } from "./stashIdentity";
import { LoadingState } from "./LoadingState";
import { FileStatusChip } from "./FileStatusChip";
import { getCommitFileStatusVisuals } from "./fileStatusVisuals";
import { fileName } from "./statusFileTree";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

export function StashesView({
  entries,
  loading,
  error,
  selectedRef,
  details,
  detailsLoading,
  detailsError,
  selectedFilePath,
  disabled,
  diffContent,
  onRefresh,
  onSelect,
  onSelectFile,
  onApply,
  onPop,
  onDrop,
  onCreateBranch
}: {
  entries: GitStashEntry[];
  loading: boolean;
  error: string;
  selectedRef: string | null;
  details: GitStashDetails | null;
  detailsLoading: boolean;
  detailsError: string;
  selectedFilePath: string | null;
  disabled: boolean;
  diffContent: ReactNode;
  onRefresh: () => void;
  onSelect: (stashRef: string) => void;
  onSelectFile: (path: string) => void;
  onApply: (stashRef: string) => void;
  onPop: (stashRef: string) => void;
  onDrop: (stashRef: string) => Promise<string | null>;
  onCreateBranch: (stashRef: string, branchName: string) => Promise<string | null>;
}): ReactNode {
  const [contextTarget, setContextTarget] = useState<GitStashEntry | null>(null);
  const [dropTarget, setDropTarget] = useState<{ entry: GitStashEntry; entries: GitStashEntry[] } | null>(null);
  const [branchTarget, setBranchTarget] = useState<{ entry: GitStashEntry; entries: GitStashEntry[] } | null>(null);
  const [branchName, setBranchName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = usePersistentWorkspacePanelState("stashes-search-query", "");
  const [filesCollapsed, setFilesCollapsed] = usePersistentWorkspacePanelState("stashes-files-collapsed", false);
  const selected = entries.find((entry) => entry.ref === selectedRef) ?? null;
  const actionsDisabled = disabled || loading;
  const currentDropTarget = findStashEntry(entries, dropTarget?.entry, dropTarget?.entries ?? []);
  const currentBranchTarget = findStashEntry(entries, branchTarget?.entry, branchTarget?.entries ?? []);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) => `${entry.message} ${entry.ref} ${entry.sourceBranch ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : entries;

  const focusableRef = (visibleEntries.find((entry) => entry.ref === selectedRef) ?? visibleEntries[0])?.ref;
  const focusableFilePath = (details?.files.find((file) => file.path === selectedFilePath) ?? details?.files[0])?.path;

  const openDropDialog = (entry: GitStashEntry): void => {
    setDialogError("");
    setDropTarget({ entry, entries });
  };

  const openBranchDialog = (entry: GitStashEntry): void => {
    setDialogError("");
    setBranchName("");
    setBranchTarget({ entry, entries });
  };

  const dropSelected = async (): Promise<void> => {
    if (!currentDropTarget || submitting || actionsDisabled) return;
    setSubmitting(true);
    setDialogError("");
    const nextError = await onDrop(currentDropTarget.ref);
    setSubmitting(false);
    if (nextError) setDialogError(nextError);
    else setDropTarget(null);
  };

  const createBranch = async (): Promise<void> => {
    if (!currentBranchTarget || submitting || actionsDisabled) return;
    setSubmitting(true);
    setDialogError("");
    const nextError = await onCreateBranch(currentBranchTarget.ref, branchName);
    setSubmitting(false);
    if (nextError) setDialogError(nextError);
    else {
      setBranchTarget(null);
      setBranchName("");
    }
  };

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="stash-workspace h-full min-h-0 bg-background">
        <ResizablePanel defaultSize="304px" minSize="240px" maxSize="400px" className="min-w-[240px]">
          <section className="stash-rail" aria-label="Stashes">
            <header className="stash-list-header">
              <div>
                <div className="stash-list-heading"><Archive aria-hidden="true" /><h2>Stashes</h2><Badge variant="secondary">{entries.length}</Badge></div>
                <p>Saved work, ready to resume.</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={loading ? "Refreshing stashes" : "Refresh stashes"} title="Refresh stashes" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>
            </header>
            <div className="stash-search">
              <Search aria-hidden="true" />
              <Input type="search" aria-label="Search stashes" placeholder="Search stashes..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              {searchQuery ? <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear stash search" onClick={() => setSearchQuery("")}><X /></Button> : null}
            </div>
            <div data-workspace-scroll-key="stash-list" className="stash-list-scroll">
              {error ? <div className="stash-empty"><p role="alert">{error}</p><Button type="button" variant="outline" size="sm" onClick={onRefresh}>Try again</Button></div>
                : loading && entries.length === 0 ? <LoadingState label="Loading stashes" />
                  : entries.length === 0 ? <div className="stash-empty"><Archive /><h3>No stashes</h3><p>Right-click changed files in File Status to create a stash.</p></div>
                    : visibleEntries.length === 0 ? <div className="stash-empty stash-filter-empty"><Search /><h3>No matching stashes</h3><p>Try another name, branch, or stash reference.</p><Button type="button" variant="outline" size="sm" onClick={() => setSearchQuery("")}>Clear search</Button></div>
                      : <div role="listbox" aria-label="Saved stashes" className="stash-list" onKeyDown={navigateStashList}>{visibleEntries.map((entry) => (
                      <ContextMenu key={entry.ref} open={contextTarget === entry} onOpenChange={(open) => setContextTarget(open ? entry : null)}>
                        <ContextMenuTrigger asChild>
                          <button type="button" role="option" aria-selected={entry.ref === selectedRef} tabIndex={entry.ref === focusableRef ? 0 : -1} title={entry.message} className={`stash-list-row ${entry.ref === selectedRef ? "is-selected" : ""}`} onClick={() => onSelect(entry.ref)}>
                            <span className="stash-list-row-top"><code>{entry.ref}</code><time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>{formatStashAge(entry.createdAt)}</time></span>
                            <span className="stash-list-row-title">{entry.message}</span>
                            <span className="stash-list-row-meta"><span title={entry.sourceBranch || "Detached HEAD"}><GitBranch aria-hidden="true" />{entry.sourceBranch || "Detached HEAD"}</span><ChevronRight className="stash-selection-arrow" aria-hidden="true" /></span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem disabled={actionsDisabled} onSelect={() => onApply(entry.ref)}><ArchiveRestore />Apply</ContextMenuItem>
                          <ContextMenuItem disabled={actionsDisabled} onSelect={() => onPop(entry.ref)}><ArchiveRestore />Pop</ContextMenuItem>
                          <ContextMenuItem disabled={actionsDisabled} onSelect={() => openBranchDialog(entry)}><GitBranch />Create branch...</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled={actionsDisabled} variant="destructive" onSelect={() => openDropDialog(entry)}><Trash2 />Delete stash...</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}</div>}
            </div>
            <footer className="stash-rail-footer"><span><ArrowUpDown aria-hidden="true" />Newest first</span><span role="status">{normalizedQuery ? `${visibleEntries.length} of ${entries.length}` : `${entries.length} saved`}</span></footer>
          </section>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="430px">
          {!selected ? <div className="stash-empty h-full"><Archive /><h3>Select a stash</h3><p>Select a saved stash to inspect its files.</p></div>
            : <section className="stash-details" aria-label={`Stash ${selected.message}`}>
              <header className="stash-details-header">
                <div className="min-w-0">
                  <div className="stash-details-label"><Archive aria-hidden="true" /><span>Saved stash</span><code>{selected.ref}</code></div>
                  <h2>{selected.message}</h2>
                  <div className="stash-details-meta">
                    <span><GitBranch />{selected.sourceBranch || "Detached HEAD"}</span>
                    {details ? <span><Files />{details.files.length} {details.files.length === 1 ? "file" : "files"}</span> : null}
                    <span><Clock3 />{formatStashAge(selected.createdAt)}</span>
                  </div>
                </div>
                <div className="stash-actions">
                  <div className="flex items-center justify-end gap-2">
                    <Button type="button" size="sm" disabled={actionsDisabled || detailsLoading} onClick={() => onApply(selected.ref)}><ArchiveRestore />Apply stash</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label="More stash actions" disabled={actionsDisabled}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="stash-action-menu">
                        <DropdownMenuItem disabled={actionsDisabled} onSelect={() => onPop(selected.ref)}><ArrowDownToLine /><span>Pop stash<small>Apply changes and remove this stash</small></span></DropdownMenuItem>
                        <DropdownMenuItem disabled={actionsDisabled} onSelect={() => openBranchDialog(selected)}><GitBranch /><span>Create branch...<small>Resume this work on a new branch</small></span></DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={actionsDisabled} variant="destructive" onSelect={() => openDropDialog(selected)}><Trash2 />Delete stash...</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p>Apply keeps this stash saved.</p>
                </div>
              </header>
              {detailsError ? <div className="stash-empty"><p role="alert">{detailsError}</p><Button type="button" variant="outline" size="sm" onClick={() => onSelect(selected.ref)}>Try again</Button></div>
                : detailsLoading || !details ? <LoadingState label="Loading stash details" className="h-full" />
                  : <div className={`stash-review-workspace ${filesCollapsed ? "files-collapsed" : ""}`}>
                      <aside className="stash-file-panel" aria-label="Changed files">
                        <div className="stash-file-panel-header">
                          {filesCollapsed ? null : <h3><Files aria-hidden="true" />Changed files <span>{details.files.length}</span></h3>}
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={filesCollapsed ? "Show changed files" : "Hide changed files"} aria-expanded={!filesCollapsed} onClick={() => setFilesCollapsed((current) => !current)}>
                            {filesCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                          </Button>
                        </div>
                        {filesCollapsed ? <span className="stash-file-count" aria-hidden="true">{details.files.length}</span> : <div role="listbox" aria-label="Stash files" className="stash-file-list" onKeyDown={navigateStashList}>{details.files.map((file) => (
                          <button key={`${file.status}:${file.path}`} type="button" role="option" aria-label={`${getCommitFileStatusVisuals(file.status).label} ${file.originalPath ? `${file.originalPath} → ` : ""}${file.path}`} aria-selected={file.path === selectedFilePath} tabIndex={file.path === focusableFilePath ? 0 : -1} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} className={`stash-file-row ${file.path === selectedFilePath ? "is-selected" : ""}`} onClick={() => onSelectFile(file.path)}>
                            <FileStatusChip visuals={getCommitFileStatusVisuals(file.status)} tooltip={false} />
                            <span className="stash-file-name"><span>{fileName(file.path)}</span><small>{file.originalPath ? `From ${file.originalPath}` : file.path.slice(0, file.path.lastIndexOf("/") + 1) || "Repository root"}</small></span>
                          </button>
                        ))}</div>}
                      </aside>
                      <div className="stash-diff-panel">{diffContent}</div>
                    </div>}
            </section>}
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={Boolean(dropTarget)} onOpenChange={(open) => { if (!open && !submitting) setDropTarget(null); }}>
        <DialogContent showCloseButton={!submitting} className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete this stash?</DialogTitle><DialogDescription>The saved changes in {currentDropTarget?.ref ?? dropTarget?.entry.ref} will be deleted. This action cannot be undone.</DialogDescription></DialogHeader>
          {!loading && dropTarget && !currentDropTarget ? <p role="alert">The stash list changed. Close this dialog and select the stash again.</p> : null}
          {dialogError ? <p className="text-sm text-destructive" role="alert">{dialogError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setDropTarget(null)}>Cancel</Button><Button type="button" variant="destructive" disabled={submitting || actionsDisabled || !currentDropTarget} onClick={() => { void dropSelected(); }}>{submitting ? "Deleting" : "Delete stash"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(branchTarget)} onOpenChange={(open) => { if (!open && !submitting) setBranchTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => { event.preventDefault(); void createBranch(); }}>
            <DialogHeader><DialogTitle>Create branch from stash</DialogTitle><DialogDescription>Git creates the branch at the stash base, applies the stash, and deletes it after success.</DialogDescription></DialogHeader>
            <div className="grid gap-2 py-5"><Label htmlFor="stash-branch-name">Branch name</Label><Input id="stash-branch-name" value={branchName} autoFocus onChange={(event) => setBranchName(event.target.value)} disabled={submitting} /></div>
            {!loading && branchTarget && !currentBranchTarget ? <p role="alert">The stash list changed. Close this dialog and select the stash again.</p> : null}
            {dialogError ? <p className="mb-4 text-sm text-destructive" role="alert">{dialogError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setBranchTarget(null)}>Cancel</Button><Button type="submit" disabled={submitting || actionsDisabled || !currentBranchTarget || !branchName.trim()}>{submitting ? "Creating branch" : "Create branch"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function navigateStashList(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
  const current = options.findIndex((option) => option === document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
  options[next]?.focus();
  options[next]?.click();
}

function formatStashAge(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value || "Unknown time";
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  if (absolute < 2_592_000) return formatter.format(Math.round(seconds / 86_400), "day");
  return new Date(timestamp).toLocaleDateString();
}
