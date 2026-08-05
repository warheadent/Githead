import { Archive, ArchiveRestore, Clock3, Files, GitBranch, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { GitStashDetails, GitStashEntry } from "../shared/types";

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
  const [dropTarget, setDropTarget] = useState<GitStashEntry | null>(null);
  const [branchTarget, setBranchTarget] = useState<GitStashEntry | null>(null);
  const [branchName, setBranchName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const selected = entries.find((entry) => entry.ref === selectedRef) ?? null;
  const searchEnabled = entries.length > 3;
  const normalizedQuery = searchEnabled ? searchQuery.trim().toLocaleLowerCase() : "";
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) => `${entry.message} ${entry.ref} ${entry.sourceBranch ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : entries;

  const dropSelected = async (): Promise<void> => {
    if (!dropTarget || submitting) return;
    setSubmitting(true);
    setDialogError("");
    const nextError = await onDrop(dropTarget.ref);
    setSubmitting(false);
    if (nextError) setDialogError(nextError);
    else setDropTarget(null);
  };

  const createBranch = async (): Promise<void> => {
    if (!branchTarget || submitting) return;
    setSubmitting(true);
    setDialogError("");
    const nextError = await onCreateBranch(branchTarget.ref, branchName);
    setSubmitting(false);
    if (nextError) setDialogError(nextError);
    else {
      setBranchTarget(null);
      setBranchName("");
    }
  };

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 bg-background">
        <ResizablePanel defaultSize="280px" minSize="240px" maxSize="380px" className="min-w-[240px]">
          <section className="stash-rail" aria-label="Stashes">
            <header className="stash-list-header">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Stashes</h2>
                <Badge variant="secondary">{entries.length}</Badge>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>{loading ? "Refreshing" : "Refresh"}</Button>
            </header>
            {searchEnabled ? (
              <div className="stash-search">
                <Search aria-hidden="true" />
                <Input type="search" aria-label="Search stashes" placeholder="Search stashes" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </div>
            ) : null}
            <div className="min-h-0 overflow-y-auto">
              {error ? <div className="stash-empty"><p role="alert">{error}</p><Button type="button" variant="outline" size="sm" onClick={onRefresh}>Try again</Button></div>
                : loading && entries.length === 0 ? <p className="empty-state">Loading stashes...</p>
                  : entries.length === 0 ? <div className="stash-empty"><Archive /><h3>No stashes</h3><p>Right-click changed files in File Status to create a stash.</p></div>
                    : visibleEntries.length === 0 ? <div className="stash-empty stash-filter-empty"><Search /><h3>No matching stashes</h3><p>Change the search text to see other stashes.</p></div>
                      : <div role="listbox" aria-label="Saved stashes" className="stash-list">{visibleEntries.map((entry) => (
                      <button key={entry.ref} type="button" role="option" aria-selected={entry.ref === selectedRef} className={`stash-list-row ${entry.ref === selectedRef ? "is-selected" : ""}`} onClick={() => onSelect(entry.ref)}>
                        <span className="stash-list-row-title"><span>{entry.message}</span><code>{entry.ref}</code></span>
                        <span className="stash-list-row-meta"><span><GitBranch />{entry.sourceBranch || "Detached HEAD"}</span><time dateTime={entry.createdAt}>{formatStashAge(entry.createdAt)}</time></span>
                      </button>
                    ))}</div>}
            </div>
            <footer className="stash-rail-footer">{entries.length} {entries.length === 1 ? "stash" : "stashes"}</footer>
          </section>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="430px">
          {!selected ? <div className="stash-empty h-full"><Archive /><h3>Select a stash</h3><p>Select a saved stash to inspect its files.</p></div>
            : <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" aria-label={`Stash ${selected.message}`}>
              <header className="stash-details-header">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-base font-semibold">{selected.message}</h2><Badge variant="outline">{selected.ref}</Badge></div>
                  <div className="stash-details-meta">
                    <span><GitBranch />{selected.sourceBranch || "Detached HEAD"}</span>
                    {details ? <span><Files />{details.files.length} {details.files.length === 1 ? "file" : "files"}</span> : null}
                    <span><Clock3 />{formatStashAge(selected.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" disabled={disabled || detailsLoading} onClick={() => onApply(selected.ref)}><ArchiveRestore />Apply</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label="More stash actions" disabled={disabled}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onPop(selected.ref)}><ArchiveRestore />Pop</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setDialogError(""); setBranchName(""); setBranchTarget(selected); }}><GitBranch />Create branch...</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => { setDialogError(""); setDropTarget(selected); }}><Trash2 />Delete stash...</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>
              {detailsError ? <div className="stash-empty"><p role="alert">{detailsError}</p><Button type="button" variant="outline" size="sm" onClick={() => onSelect(selected.ref)}>Try again</Button></div>
                : detailsLoading || !details ? <p className="empty-state">Loading stash details...</p>
                  : <div className={`stash-review-workspace ${filesCollapsed ? "files-collapsed" : ""}`}>
                      <aside className="stash-file-panel" aria-label="Changed files">
                        <div className="stash-file-panel-header">
                          {filesCollapsed ? null : <h3>Changed files ({details.files.length})</h3>}
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={filesCollapsed ? "Show changed files" : "Hide changed files"} aria-expanded={!filesCollapsed} onClick={() => setFilesCollapsed((current) => !current)}>
                            {filesCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                          </Button>
                        </div>
                        {filesCollapsed ? <span className="stash-file-count" aria-hidden="true">{details.files.length}</span> : <div role="listbox" aria-label="Stash files" className="min-h-0 overflow-y-auto">{details.files.map((file) => (
                          <button key={`${file.status}:${file.path}`} type="button" role="option" aria-selected={file.path === selectedFilePath} className={`stash-file-row ${file.path === selectedFilePath ? "is-selected" : ""}`} onClick={() => onSelectFile(file.path)}>
                            <Badge variant="outline">{file.status.charAt(0)}</Badge><span>{file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}</span>
                          </button>
                        ))}</div>}
                      </aside>
                      <div className="min-h-0 min-w-0">{diffContent}</div>
                    </div>}
            </section>}
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={Boolean(dropTarget)} onOpenChange={(open) => { if (!open && !submitting) setDropTarget(null); }}>
        <DialogContent showCloseButton={!submitting} className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete this stash?</DialogTitle><DialogDescription>The saved changes in {dropTarget?.ref} will be deleted. This action cannot be undone.</DialogDescription></DialogHeader>
          {dialogError ? <p className="text-sm text-destructive" role="alert">{dialogError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setDropTarget(null)}>Cancel</Button><Button type="button" variant="destructive" disabled={submitting} onClick={() => { void dropSelected(); }}>{submitting ? "Deleting" : "Delete stash"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(branchTarget)} onOpenChange={(open) => { if (!open && !submitting) setBranchTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => { event.preventDefault(); void createBranch(); }}>
            <DialogHeader><DialogTitle>Create branch from stash</DialogTitle><DialogDescription>Git creates the branch at the stash base, applies the stash, and deletes it after success.</DialogDescription></DialogHeader>
            <div className="grid gap-2 py-5"><Label htmlFor="stash-branch-name">Branch name</Label><Input id="stash-branch-name" value={branchName} autoFocus onChange={(event) => setBranchName(event.target.value)} disabled={submitting} /></div>
            {dialogError ? <p className="mb-4 text-sm text-destructive" role="alert">{dialogError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setBranchTarget(null)}>Cancel</Button><Button type="submit" disabled={submitting || !branchName.trim()}>{submitting ? "Creating branch" : "Create branch"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
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
