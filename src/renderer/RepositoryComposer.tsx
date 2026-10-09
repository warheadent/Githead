import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, CornerDownLeft, FolderOpen, GitBranch, GitFork, Info, Layers, Loader2, LockKeyhole,TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RepositorySource } from "../shared/repositorySource";
import type { CloneDestinationStatus, GitHubCloneDetails, GitHubCloneRepository } from "../shared/types";
import { repositoryMeta, type CloneRepositoryControls } from "./cloneRepository";
import { CloneOptions, cloneOptionsSummary } from "./CloneOptions";
import { ReferencePicker } from "./ReferencePicker";

interface Props extends CloneRepositoryControls {
  selection: { source: RepositorySource; repository?: GitHubCloneRepository };
  onBack(): void;
  onAbandonCheck(): void;
}

export function RepositoryComposer(props: Props) {
  const { cloneDraft: draft, selection, cloneRunning, cloneCheckRunning, onCloneDraftChange, onCheckRepositoryAccess, onAbandonCheck } = props;
  const id = useId();
  const [details, setDetails] = useState<GitHubCloneDetails | null>(null);
  const [metadataError, setMetadataError] = useState("");
  const [metadataLoading, setMetadataLoading] = useState(Boolean(selection.source.github));
  const [destination, setDestination] = useState<{ key: string; status: CloneDestinationStatus } | null>(null);
  const [destinationError, setDestinationError] = useState<{ key: string; message: string } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const forkRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const source = selection.source.source;
  const lore = selection.source.kind === "lore";
  const destinationKey = `${draft.parentPath}\u0000${draft.directoryName}`;
  const destinationStatus = destination?.key === destinationKey ? destination.status : null;
  const folderError = destinationError?.key === destinationKey ? destinationError.message : destinationStatus?.error;
  const busy = cloneRunning || cloneCheckRunning;
  const repository = details?.repository ?? selection.repository;
  const cannotPush = repository?.canPush === false;
  const canClone = !busy && props.cloneCheckStatus === "success" && !!destinationStatus && !destinationStatus.error && !destinationStatus.exists;

  useEffect(() => {
    formRef.current?.focus();
  }, []);
  useEffect(() => {
    // StrictMode replays effect setup/cleanup. Defer to avoid starting and
    // immediately cancelling a check before the real mount has settled.
    let current = true;
    queueMicrotask(() => { if (current) onCheckRepositoryAccess(); });
    return () => { current = false; onAbandonCheck(); };
  }, [source, onCheckRepositoryAccess, onAbandonCheck]);

  useEffect(() => {
    if (!selection.source.github) return;
    let current = true;
    const requestId = `repository-details:${crypto.randomUUID()}`;
    setMetadataLoading(true);
    void window.githead.getGitHubCloneDetails({ source, requestId }).then((result) => {
      if (!current) return;
      if (result.ok) setDetails(result.data);
      else setMetadataError(result.error.message);
    }).catch((error: unknown) => { if (current) setMetadataError(error instanceof Error ? error.message : "Unable to load GitHub details."); })
      .finally(() => { if (current) setMetadataLoading(false); });
    return () => { current = false; void window.githead.cancelGitHubRequest({ requestId }).catch(() => undefined); };
  }, [source, selection.source.github]);

  useEffect(() => {
    if (cloneRunning) return;
    let current = true;
    setDestination(null);
    setDestinationError(null);
    const timer = setTimeout(() => {
      if (!draft.parentPath.trim() || !draft.directoryName.trim()) return;
      void window.githead.getCloneDestination({ parentPath: draft.parentPath, directoryName: draft.directoryName }).then((status) => {
        if (current) setDestination({ key: destinationKey, status });
      }).catch((error: unknown) => {
        if (current) setDestinationError({ key: destinationKey, message: error instanceof Error ? error.message : "Unable to check the destination folder." });
      });
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [draft.parentPath, draft.directoryName, destinationKey, cloneRunning]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const fork = forkRef.current;
    forkRef.current = false;
    if (!canClone || (fork && (!details || details.forkDisabledReason || metadataLoading))) { event.preventDefault(); return; }
    props.onClone(event, fork);
  };
  const pathSeparator = draft.parentPath.includes("\\") ? "\\" : "/";
  const displayPath = draft.parentPath ? `${draft.parentPath.replace(/[\\/]$/, "")}${pathSeparator}${draft.directoryName}` : "Choose destination folder";
  const forkReason = metadataLoading ? "Checking GitHub fork permissions…" : metadataError || details?.forkDisabledReason;

  return <form ref={formRef} tabIndex={-1} className="repo-composer" onSubmit={submit} aria-label="Clone repository"
    onKeyDown={(event) => {
      if (event.key === "Enter" && event.target === event.currentTarget && !event.nativeEvent.isComposing) {
        event.preventDefault();
        forkRef.current = false;
        if (canClone) event.currentTarget.requestSubmit();
      }
    }}>
    <div className="repo-omnibox-header">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Back to search" disabled={cloneRunning} onClick={props.onBack}><ArrowLeft /></Button>
      <span className="repo-composer-source" title={source}>{lore ? source : selection.source.label}</span>
      {lore ? <span className="repo-omnibox-badge is-lore"><Layers />Lore</span> : cannotPush && !forkReason ? <span className="repo-omnibox-badge"><GitFork />Forkable</span> : null}
      <button type="button" aria-label="Back to search with Escape" disabled={cloneRunning} onClick={props.onBack}><kbd>Esc</kbd></button>
    </div>
    <div className="repo-composer-body">
      <div className="repo-composer-identity">
        <span className={`repo-omnibox-avatar${lore ? " is-lore" : ""}`} aria-hidden="true">{lore ? <Layers /> : selection.source.github ? selection.source.github.owner.slice(0, 2).toUpperCase() : <GitFork />}</span>
        <div><h3>{selection.source.name}</h3>
          <p>{repository?.description || (lore ? `Lore repository · ${new URL(source).host}` : source)}</p>
          {repository ? <span className="repo-omnibox-meta">{[repository.private ? "Private" : "Public", repositoryMeta(repository)].filter(Boolean).join(" · ")}</span> : null}
        </div>
      </div>
      <div className="repo-composer-chips">
        <Popover>
          <PopoverTrigger asChild><Button type="button" variant="outline" className={`repo-composer-destination${destinationStatus?.exists ? " has-warning" : ""}`} disabled={cloneRunning} aria-label="Destination folder" title={displayPath}>
            <FolderOpen /><span>{displayPath}</span><ChevronDown />
          </Button></PopoverTrigger>
          <PopoverContent className="repo-composer-destination-editor" align="start">
            <Label htmlFor={`${id}-parent`}>Destination folder</Label>
            <div className="setup-clone-input-row"><Input id={`${id}-parent`} value={draft.parentPath} placeholder="Choose a parent folder" disabled={cloneRunning}
              onChange={(event) => onCloneDraftChange({ ...draft, parentPath: event.target.value })} />
              <Button type="button" variant="outline" disabled={cloneRunning} onClick={props.onChooseCloneParent}><FolderOpen />Browse</Button></div>
            <Label htmlFor={`${id}-name`}>Folder name</Label>
            <Input id={`${id}-name`} value={draft.directoryName} disabled={cloneRunning}
              onChange={(event) => onCloneDraftChange({ ...draft, directoryName: event.target.value })} />
          </PopoverContent>
        </Popover>
        <ReferencePicker value={draft.branchName} displayValue={draft.branchName || "Default branch"} ariaLabel="Choose branch"
          options={[{ value: "", label: "Default branch", icon: <GitBranch /> }, ...props.cloneBranches.map((branch) => ({ value: branch, label: branch, icon: <GitBranch /> }))]}
          disabled={busy} triggerIcon={cloneCheckRunning ? <Loader2 className="animate-spin" /> : <GitBranch />}
          searchPlaceholder="Search or enter a branch..." emptyMessage="No branches returned. Enter a branch name."
          customValueLabel={(branch) => `Use branch "${branch}"`} onValueChange={(branchName) => onCloneDraftChange({ ...draft, branchName, sourceRefPath: "" })} />
      </div>
      {destinationStatus?.exists ? <p className="repo-composer-warning" role="alert"><TriangleAlert /><span>{destinationStatus.path} already exists{destinationStatus.suggestedName ? <>. <button type="button" disabled={cloneRunning} onClick={() => onCloneDraftChange({ ...draft, directoryName: destinationStatus.suggestedName! })}>Use {destinationStatus.suggestedName}?</button></> : ". Choose another folder name."}</span></p> : null}
      {folderError ? <p className="setup-error" role="alert">{folderError}</p> : null}
      {lore ? <p className="repo-omnibox-notice"><Info />Lore clones the working tree. Remote branch listing is unavailable; choose Default branch or enter a branch name.</p> : <div className="repo-composer-options">
        <button type="button" className="repo-composer-options-summary" aria-expanded={optionsOpen} aria-controls={`${id}-options`} onClick={() => setOptionsOpen((open) => !open)}>
          {optionsOpen ? <ChevronDown /> : <ChevronRight />}<span>Clone options</span><span className="repo-omnibox-meta">{cloneOptionsSummary(draft)}</span>
        </button>
        {optionsOpen ? <div id={`${id}-options`}><CloneOptions draft={draft} disabled={cloneRunning} idPrefix={id} onChange={onCloneDraftChange} /></div> : null}
      </div>}
      {cloneCheckRunning ? <p className="repo-omnibox-notice" role="status"><Loader2 className="animate-spin" />Checking repository access and loading branches…</p> : props.cloneCheckStatus === "error" ? <div className="repo-omnibox-notice is-error" role="alert"><span>{props.cloneCheckMessage}</span><Button type="button" variant="outline" size="sm" onClick={onCheckRepositoryAccess}>Retry</Button></div> : null}
      {props.cloneError ? <p className="setup-error selectable-text" role="alert">{props.cloneError}</p> : null}
      {metadataError ? <p className="repo-omnibox-notice" role="status">{metadataError} You can still clone using Git.</p> : null}
      {props.cancelError ? <p className="setup-error" role="alert">{props.cancelError}</p> : null}
      {cannotPush && forkReason ? <p id={`${id}-fork-reason`} className="repo-omnibox-notice">{forkReason}</p> : null}
    </div>
    <div className="repo-omnibox-footer repo-composer-footer">
      <span className="repo-composer-permission">{cannotPush ? <><LockKeyhole />You can't push to this repo</> : lore ? <><kbd>Esc</kbd>Back to search</> : null}</span>
      {busy ? <Button type="button" variant="outline" disabled={props.cancelStatus === "canceling"} onClick={props.onCancelOperation}>{props.cancelStatus === "canceling" ? <Loader2 className="animate-spin" /> : <X />}{props.cancelStatus === "canceling" ? "Cancelling" : cloneCheckRunning ? "Cancel Check" : "Cancel Clone"}</Button> : cannotPush ?
        <Button type="button" variant="outline" disabled={!canClone || !details || !!forkReason} aria-describedby={forkReason ? `${id}-fork-reason` : undefined} title={forkReason ?? "Fork on GitHub and clone locally"} onClick={() => { forkRef.current = true; formRef.current?.requestSubmit(); }}><GitFork />Fork &amp; clone</Button> : null}
      <Button type="submit" disabled={!canClone} aria-label={cloneRunning ? "Cloning repository" : "Clone repository"} onClick={() => { forkRef.current = false; }}>
        {cloneRunning ? <><Loader2 className="animate-spin" />Cloning…</> : <>Clone<kbd><CornerDownLeft /></kbd></>}
      </Button>
    </div>
  </form>;
}
