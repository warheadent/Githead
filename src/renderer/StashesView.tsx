import { Archive, ArchiveRestore, ArrowDownToLine, ChevronDown, ChevronRight, GitBranch, MoreHorizontal, RefreshCw, Search, SearchX, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, TooltipButton } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitStashDetails, GitStashEntry } from "../shared/types";
import { findStashEntry } from "./stashIdentity";
import { EmptyState } from "./EmptyState";
import { ListDetailLayout } from "./ListDetailLayout";
import { LoadingState } from "./LoadingState";
import { FileStatusChip } from "./FileStatusChip";
import { getCommitFileStatusVisuals } from "./fileStatusVisuals";
import { formatRelativeDate } from "./relativeTime";
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
  /** In a narrow window, Back shows the list until the user selects a stash again. */
  const [listShownNarrow, setListShownNarrow] = useState(false);
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

  const selectStash = (stashRef: string): void => {
    setListShownNarrow(false);
    onSelect(stashRef);
  };

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
      <ListDetailLayout
        id="stashes"
        listLabel="stash list"
        detailOpen={selected !== null && !listShownNarrow}
        onBack={() => setListShownNarrow(true)}
        list={(
          <section className="stash-rail" aria-label="Stashes">
            <div className="stash-list-toolbar">
              <div className="stash-search">
                <Search aria-hidden="true" />
                <Input type="search" aria-label="Search stashes" placeholder="Search stashes" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                {searchQuery ? <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear stash search" onClick={() => setSearchQuery("")}><X /></Button> : null}
              </div>
              <TooltipButton type="button" variant="ghost" size="icon-sm" aria-label={loading ? "Refreshing stashes" : "Refresh stashes"} tooltip="Refresh stashes" disabled={loading} onClick={onRefresh}>
                <RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
              </TooltipButton>
            </div>
            <div data-workspace-scroll-key="stash-list" className="stash-list-scroll">
              {error ? <EmptyState tone="error" role="alert" title={error} action={<Button type="button" variant="outline" size="sm" onClick={onRefresh}>Try again</Button>} />
                : loading && entries.length === 0 ? <LoadingState label="Loading stashes" />
                  : entries.length === 0 ? <EmptyState icon={<Archive />} headingLevel={3} title="No stashes" description="Right-click changed files in File Status to create a stash." />
                    : visibleEntries.length === 0 ? <EmptyState icon={<SearchX />} headingLevel={3} title="No matching stashes" description="Try another name, branch, or stash reference." action={<Button type="button" variant="outline" size="sm" onClick={() => setSearchQuery("")}>Clear search</Button>} />
                      : <div role="listbox" aria-label="Saved stashes" className="stash-list" onKeyDown={(event) => navigateStashList(event, (option) => {
                        // Arrow keys move the selection only. A click or Enter opens the detail in a narrow window.
                        const stashRef = option.dataset.stashRef;
                        if (stashRef) onSelect(stashRef);
                      })}>{visibleEntries.map((entry) => (
                      <ContextMenu key={entry.ref} open={contextTarget === entry} onOpenChange={(open) => setContextTarget(open ? entry : null)}>
                        <ContextMenuTrigger asChild>
                          <button type="button" role="option" aria-selected={entry.ref === selectedRef} tabIndex={entry.ref === focusableRef ? 0 : -1} title={entry.message} data-stash-ref={entry.ref} className={`stash-list-row ${entry.ref === selectedRef ? "is-selected" : ""}`} onClick={() => selectStash(entry.ref)}>
                            <Archive className="stash-list-row-icon" aria-hidden="true" />
                            <span className="stash-list-row-top"><code>{entry.ref}</code><time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>{formatRelativeDate(entry.createdAt)}</time></span>
                            <span className="stash-list-row-title">{entry.message}</span>
                            <span className="stash-list-row-branch">{entry.sourceBranch || "Detached HEAD"}</span>
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
            <p className="stash-rail-footer">Newest first · <span role="status">{normalizedQuery ? `${visibleEntries.length} of ${entries.length}` : `${entries.length} saved`}</span></p>
          </section>
        )}
        detail={!selected ? <EmptyState as="section" className="h-full" headingLevel={2} icon={<Archive />} title="Select a stash" description="Select a saved stash to inspect its files." />
          : <section className="stash-details" aria-label={`Stash ${selected.message}`}>
              <header className="stash-details-header">
                <div className="min-w-0">
                  <h2>{selected.message}</h2>
                  <p className="stash-details-meta">
                    <code>{selected.ref}</code>
                    {` on ${selected.sourceBranch || "Detached HEAD"}`}
                    {details ? ` · ${details.files.length} ${details.files.length === 1 ? "file" : "files"}` : null}
                    {` · ${formatRelativeDate(selected.createdAt)} · `}
                    Apply keeps this stash saved.
                  </p>
                </div>
                <div className="stash-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="More stash actions" disabled={actionsDisabled}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="stash-action-menu">
                      <DropdownMenuItem disabled={actionsDisabled} onSelect={() => onPop(selected.ref)}><ArrowDownToLine /><span>Pop stash<small>Apply changes and remove this stash</small></span></DropdownMenuItem>
                      <DropdownMenuItem disabled={actionsDisabled} onSelect={() => openBranchDialog(selected)}><GitBranch /><span>Create branch...<small>Resume this work on a new branch</small></span></DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={actionsDisabled} variant="destructive" onSelect={() => openDropDialog(selected)}><Trash2 />Delete stash...</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" disabled={actionsDisabled || detailsLoading} onClick={() => onApply(selected.ref)}>Apply stash</Button>
                </div>
              </header>
              {detailsError ? <EmptyState tone="error" role="alert" title={detailsError} action={<Button type="button" variant="outline" size="sm" onClick={() => onSelect(selected.ref)}>Try again</Button>} />
                : detailsLoading || !details ? <LoadingState label="Loading stash details" className="h-full" />
                  : <div className={`stash-review-workspace ${filesCollapsed ? "files-collapsed" : ""}`}>
                      <div className="stash-file-panel">
                        <div className="stash-file-panel-header">
                          <h3>Changed files <span>{details.files.length}</span></h3>
                          <Button type="button" variant="ghost" size="icon-xs" aria-label={filesCollapsed ? "Show changed files" : "Hide changed files"} aria-expanded={!filesCollapsed} onClick={() => setFilesCollapsed((current) => !current)}>
                            {filesCollapsed ? <ChevronRight /> : <ChevronDown />}
                          </Button>
                        </div>
                        {filesCollapsed ? null : <div role="listbox" aria-label="Stash files" className="stash-file-list" onKeyDown={(event) => navigateStashList(event, (option) => option.click())}>{details.files.map((file) => (
                          <button key={`${file.status}:${file.path}`} type="button" role="option" aria-label={`${getCommitFileStatusVisuals(file.status).label} ${file.originalPath ? `${file.originalPath} → ` : ""}${file.path}`} aria-selected={file.path === selectedFilePath} tabIndex={file.path === focusableFilePath ? 0 : -1} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} className={`stash-file-row ${file.path === selectedFilePath ? "is-selected" : ""}`} onClick={() => onSelectFile(file.path)}>
                            <FileStatusChip visuals={getCommitFileStatusVisuals(file.status)} tooltip={false} />
                            <span className="stash-file-name"><span>{fileName(file.path)}</span><small>{file.originalPath ? `From ${file.originalPath}` : file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "Repository root"}</small></span>
                          </button>
                        ))}</div>}
                      </div>
                      <div className="stash-diff-panel">{diffContent}</div>
                    </div>}
            </section>}
      />

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

/** Moves focus between the options of a listbox and passes the focused option to select. */
function navigateStashList(event: KeyboardEvent<HTMLDivElement>, select: (option: HTMLButtonElement) => void): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
  const current = options.findIndex((option) => option === document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
  const option = options[next];
  if (!option) return;
  option.focus();
  select(option);
}
