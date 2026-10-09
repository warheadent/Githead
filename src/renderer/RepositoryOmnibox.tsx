import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, ClipboardPaste, CornerDownLeft, FolderOpen, GitFork, Globe, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseRepositorySource, type RepositorySource } from "../shared/repositorySource";
import type { GitHubCloneRepository, GitHubFailure, GitHubRepositoryDiscovery } from "../shared/types";
import { repositoryMeta, type CloneRepositoryControls } from "./cloneRepository";
import { RepositoryComposer } from "./RepositoryComposer";

interface RepositoryOmniboxProps extends CloneRepositoryControls {
  open: boolean;
  disabled: boolean;
  trigger: ReactNode;
  onOpenChange(open: boolean): void;
  onOpenLocal(path?: string): void;
  onConnectGitHub(): void;
  onAbandonCheck(): void;
}

export function RepositoryOmnibox(props: RepositoryOmniboxProps) {
  const [selected, setSelected] = useState<{ source: RepositorySource; repository?: GitHubCloneRepository } | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const back = () => {
    if (props.cloneRunning) return;
    props.onAbandonCheck();
    setSelected(null);
  };
  const changeOpen = (open: boolean) => {
    if (!open && props.cloneRunning) return;
    if (!open) props.onAbandonCheck();
    if (open) { setSelected(null); setQuery(""); }
    props.onOpenChange(open);
  };
  const openLocal = (path?: string) => {
    if (props.disabled && !props.cloneCheckRunning) return;
    changeOpen(false);
    props.onOpenLocal(path);
  };
  return <Popover open={props.open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
    <PopoverContent align="start" side="right" sideOffset={12} collisionPadding={12} className="repo-omnibox-popover"
      aria-label="Add repository"
      onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
      onEscapeKeyDown={(event) => {
        if (selected) { event.preventDefault(); back(); }
        else if (props.cloneRunning) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
          event.preventDefault(); event.stopPropagation(); openLocal();
        }
      }}>
      {selected ? <RepositoryComposer {...props} selection={selected} onBack={back} /> :
        <RepositoryPicker inputRef={inputRef} query={query} onQueryChange={setQuery} disabled={props.disabled}
          onClose={() => changeOpen(false)} onOpenLocal={openLocal}
          onConnectGitHub={() => { changeOpen(false); props.onConnectGitHub(); }}
          onSelect={(source, repository) => {
            if (source.kind === "local") { openLocal(source.source); return; }
            props.onCloneSourceChange({ ...props.cloneDraft, source: source.source, directoryName: source.name,
              branchName: source.branchName, sourceRefPath: source.refPath });
            setSelected({ source, ...(repository ? { repository } : {}) });
          }} />}
    </PopoverContent>
  </Popover>;
}

interface Choice {
  key: string;
  group: string;
  source?: RepositorySource;
  repository?: GitHubCloneRepository;
  search?: boolean;
  groupDetail?: string;
}

function RepositoryPicker({ inputRef, query, onQueryChange, disabled, onSelect, onClose, onOpenLocal, onConnectGitHub }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange(query: string): void;
  disabled: boolean;
  onSelect(source: RepositorySource, repository?: GitHubCloneRepository): void;
  onClose(): void;
  onOpenLocal(): void;
  onConnectGitHub(): void;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [clipboard, setClipboard] = useState<RepositorySource | null>(null);
  const [discovery, setDiscovery] = useState<GitHubRepositoryDiscovery | null>(null);
  const [failure, setFailure] = useState<GitHubFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState(false);
  const [searchResult, setSearchResult] = useState<{ query: string; data: GitHubRepositoryDiscovery } | null>(null);
  const [searchFailure, setSearchFailure] = useState<GitHubFailure | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const parsed = parseRepositorySource(query);
  const normalizedQuery = query.trim().toLowerCase();
  const hasSource = parsed !== null;

  useEffect(() => {
    inputRef.current?.focus();
    let current = true;
    void window.githead.readRepositoryClipboard().then((source) => { if (current) setClipboard(source); }).catch(() => undefined);
    return () => { current = false; };
  }, [inputRef]);

  useEffect(() => {
    let current = true;
    const requestId = `repository-list:${crypto.randomUUID()}`;
    setLoading(true);
    setFailure(null);
    void window.githead.getGitHubRepositories({ page, requestId }).then((result) => {
      if (!current) return;
      if (!result.ok) { setFailure(result.error); return; }
      setDiscovery((previous) => ({ ...result.data, repositories: page === 1 ? result.data.repositories :
        deduplicateRepositories([...(previous?.repositories ?? []), ...result.data.repositories]) }));
    }).catch((error: unknown) => { if (current) setFailure(localFailure(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; void window.githead.cancelGitHubRequest({ requestId }).catch(() => undefined); };
  }, [page, retry]);

  useEffect(() => {
    setSearchFailure(null);
    if (!remote || !normalizedQuery || hasSource) { setSearching(false); return; }
    let current = true;
    const requestId = `repository-search:${crypto.randomUUID()}`;
    setSearching(true);
    const timer = setTimeout(() => {
      void window.githead.getGitHubRepositories({ query: query.trim(), requestId }).then((result) => {
        if (!current) return;
        if (!result.ok) { setSearchFailure(result.error); return; }
        setSearchResult({ query: normalizedQuery, data: result.data });
      }).catch((error: unknown) => { if (current) setSearchFailure(localFailure(error)); })
        .finally(() => { if (current) setSearching(false); });
    }, 350);
    return () => { current = false; clearTimeout(timer); void window.githead.cancelGitHubRequest({ requestId }).catch(() => undefined); };
  }, [remote, normalizedQuery, query, hasSource, retry]);

  const choices = useMemo(() => {
    const result: Choice[] = [];
    const direct = parseRepositorySource(query);
    if (direct) result.push({ key: "source", group: direct.kind === "local" ? "Local folder" : "Repository source", source: direct });
    if (!normalizedQuery && clipboard) result.push({ key: "clipboard", group: "From clipboard", source: clipboard });
    const local = (discovery?.repositories ?? []).filter((repo) => `${repo.fullName} ${repo.description}`.toLowerCase().includes(normalizedQuery));
    const addRepos = (repos: GitHubCloneRepository[], remoteResults: boolean) => {
      const grouped = new Map<string, GitHubCloneRepository[]>();
      for (const repo of repos) {
        const group = remoteResults ? "GitHub results" : repo.owner;
        grouped.set(group, [...(grouped.get(group) ?? []), repo]);
      }
      for (const [group, repositories] of grouped) {
        for (const repo of repositories) result.push({ key: repo.fullName, group, repository: repo,
          source: parseRepositorySource(repo.fullName)! });
      }
    };
    if (normalizedQuery && local[0]) {
      const best = local[0];
      result.push({ key: best.fullName, group: "Best match", groupDetail: `${local.length} ${local.length === 1 ? "repository" : "repositories"}`,
        repository: best, source: parseRepositorySource(best.fullName)! });
      addRepos(local.slice(1), false);
    } else addRepos(local, false);
    if (remote && searchResult?.query === normalizedQuery && !direct) {
      const localKeys = new Set(local.map((repo) => repo.fullName));
      addRepos(searchResult.data.repositories.filter((repo) => !localKeys.has(repo.fullName)), true);
    }
    if (normalizedQuery && !direct) result.push({ key: "search", group: "", search: true });
    return result;
  }, [query, normalizedQuery, clipboard, discovery, searchResult, remote]);
  const defaultIndex = Math.max(0, choices.findIndex((choice) => choice.repository));
  const selectedIndex = Math.min(activeIndex ?? defaultIndex, Math.max(0, choices.length - 1));
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [selectedIndex]);
  const pick = (choice: Choice | undefined) => {
    if (!choice || disabled) return;
    if (choice.search) { setRemote(true); if (remote) setRetry((value) => value + 1); }
    else if (choice.source) onSelect(choice.source, choice.repository);
  };
  const notConnected = discovery?.connection.state === "anonymous";
  return <>
    <div className="repo-omnibox-header">
      <Search aria-hidden="true" />
      <input ref={inputRef} role="combobox" aria-label="Search repositories or paste a source" aria-autocomplete="list"
        aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={choices.length ? `${id}-option-${selectedIndex}` : undefined}
        placeholder={notConnected ? "Paste a URL, owner/repo, or local path" : "Search your repositories or paste a URL / path"}
        value={query} autoComplete="off" spellCheck={false}
        onChange={(event) => { onQueryChange(event.target.value); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % Math.max(1, choices.length));
          } else if (event.key === "Enter") { event.preventDefault(); pick(choices[selectedIndex]); }
        }} />
      {query ? <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => { onQueryChange(""); setActiveIndex(0); inputRef.current?.focus(); }}><X /></Button> :
        <button type="button" onClick={onClose} aria-label="Close add repository"><kbd>Esc</kbd></button>}
    </div>
    <div className="repo-omnibox-scroll">
      <div ref={listRef} id={`${id}-list`} role="listbox" aria-label="Repositories" aria-busy={loading || searching}>
        {choices.map((choice, index) => <Fragment key={choice.key}>
          {choice.group && choices[index - 1]?.group !== choice.group ? <div className="repo-omnibox-group" role="presentation">
            <span>{choice.group}</span>{choice.groupDetail ? <span>{choice.groupDetail}</span> : !normalizedQuery && index === (clipboard ? 1 : 0) && choice.repository ? <span>Recently pushed</span> : null}
          </div> : null}
          <div id={`${id}-option-${index}`} role="option" aria-selected={selectedIndex === index} aria-disabled={disabled}
            className={`repo-omnibox-option${choice.search ? " is-search" : ""}`}
            onMouseMove={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(choice)}>
            <span className="repo-omnibox-avatar" aria-hidden="true">{choice.search ? <Globe /> : choice.key === "clipboard" ? <ClipboardPaste /> : choice.repository ? initials(choice.repository.owner) : choice.source?.kind === "local" ? <FolderOpen /> : <GitFork />}</span>
            <span className="repo-omnibox-option-copy">
              <span className="repo-omnibox-identity">{choice.search ? `Search GitHub for "${query.trim()}"` : <Highlight text={choice.source?.label ?? ""} query={query} />}
                {choice.repository?.private ? <span className="repo-omnibox-badge">Private</span> : null}
                {choice.repository?.fork ? <span className="repo-omnibox-badge">Fork</span> : null}</span>
              <span className="repo-omnibox-meta">{choice.search ? "github.com · repositories you can access" : choice.repository ? repositoryMeta(choice.repository) : choice.source?.github ? "github.com" : choice.source?.kind === "local" ? "Open an existing repository" : choice.source?.source}</span>
            </span>
            <span className="repo-omnibox-row-action">{choice.search ? "Search" : choice.source?.kind === "local" ? "Open" : "Clone"}{selectedIndex === index ? <kbd><CornerDownLeft /></kbd> : null}</span>
          </div>
        </Fragment>)}
      </div>
      {loading ? <p className="repo-omnibox-notice" role="status"><Loader2 className="animate-spin" />Loading repositories…</p> : null}
      {failure ? <DiscoveryFailure failure={failure} onRetry={() => setRetry((value) => value + 1)} /> : null}
      {failure?.kind === "authentication" || failure?.kind === "authorization" ? <div className="repo-omnibox-notice"><Button type="button" variant="outline" onClick={onConnectGitHub}><GitFork />Reconnect GitHub</Button></div> : null}
      {notConnected ? <div className="repo-omnibox-empty">
        <span className="repo-omnibox-empty-icon"><GitFork /></span>
        <h3>Your repositories will appear here</h3>
        <p>URLs, owner/repo and local paths still work without connecting.</p>
        <Button type="button" variant="outline" onClick={onConnectGitHub}><GitFork />Connect GitHub</Button>
      </div> : !loading && !failure && !choices.length ? <p className="repo-omnibox-notice">No repositories available. Paste a URL or open a local folder.</p> : null}
      {discovery?.connection.source === "githubApp" ? <p className="repo-omnibox-notice">Only repositories available to the Githead GitHub App are listed. Check the app's installation access if a repository is missing.</p> : null}
      {discovery?.hasMore ? <Button type="button" variant="ghost" className="repo-omnibox-load-more" disabled={loading || !!failure} onClick={() => setPage((value) => value + 1)}>Load more repositories</Button> : null}
      {searching ? <p className="repo-omnibox-notice" role="status"><Loader2 className="animate-spin" />Searching GitHub…</p> : null}
      {searchFailure ? <DiscoveryFailure failure={searchFailure} onRetry={() => setRetry((value) => value + 1)} /> : null}
      {remote && searchResult?.query === normalizedQuery && !searching ? <p className="repo-omnibox-notice" role="status">{searchResult.data.repositories.length ? `${searchResult.data.repositories.length} GitHub results${searchResult.data.hasMore || searchResult.data.incomplete ? ". Refine your search to see more." : "."}` : "No GitHub repositories match this search."}</p> : null}
    </div>
    <div className="repo-omnibox-footer">
      <button type="button" className="repo-omnibox-local" aria-label="Open local folder…" onClick={onOpenLocal} disabled={disabled}><FolderOpen />Open local folder…<kbd>{/Mac/.test(navigator.platform) ? "⌘ O" : "Ctrl O"}</kbd></button>
      <span className="repo-omnibox-hints"><kbd><ArrowDownUp /></kbd>Move <kbd><CornerDownLeft /></kbd>Select</span>
    </div>
  </>;
}

function DiscoveryFailure({ failure, onRetry }: { failure: GitHubFailure; onRetry(): void }) {
  return <div className="repo-omnibox-notice is-error" role="alert">
    <span>{failure.message}{failure.retryAfterAt ? ` Retry after ${new Date(failure.retryAfterAt).toLocaleTimeString()}.` : ""}</span>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
  </div>;
}

function localFailure(error: unknown): GitHubFailure {
  return { kind: "unexpected", message: error instanceof Error ? error.message : "Unable to load repositories.", retryable: true,
    retryAfterAt: null, outcomeUnknown: false, source: "rest", rateLimit: null };
}

function deduplicateRepositories(repositories: GitHubCloneRepository[]): GitHubCloneRepository[] {
  return [...new Map(repositories.map((repo) => [repo.fullName, repo])).values()];
}

function initials(owner: string): string { return owner.slice(0, 2).toUpperCase(); }

function Highlight({ text, query }: { text: string; query: string }) {
  const start = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  return start < 0 ? <>{text}</> : <>{text.slice(0, start)}<mark>{text.slice(start, start + query.length)}</mark>{text.slice(start + query.length)}</>;
}
