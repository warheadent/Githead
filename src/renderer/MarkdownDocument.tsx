import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Columns2, List, Search, X } from "lucide-react";
import { Button, TooltipButton } from "@/components/ui/button";
import type { GitFilePreviewSource } from "@/shared/types";
import { isMarkdownPath } from "@/shared/filePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownSource } from "./MarkdownSource";
import { useMarkdownFind } from "./useMarkdownFind";
import type { MarkdownHeading } from "./markdownTransforms";

export function MarkdownDocument({ text, repoPath, path, source, diff, refreshing = false, error = "", readingPosition, revision = 0 }: {
  text: string;
  repoPath: string;
  path: string;
  source: GitFilePreviewSource;
  diff?: ReactNode;
  refreshing?: boolean;
  error?: string;
  revision?: number;
  readingPosition?: { scrollTop: number };
}): ReactNode {
  const instanceId = useId();
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [outline, setOutline] = useState(false);
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [split, setSplit] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceLine, setSourceLine] = useState(1);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState([{ path, fragment: "", scroll: readingPosition?.scrollTop ?? 0 }]);
  const current = history[history.length - 1]!;
  const [loaded, setLoaded] = useState<{ path: string; text?: string; error?: string } | null>(null);
  const sourceKind = source.kind;
  const hash = source.kind === "commit" ? source.hash : "";
  const navigate = useCallback((nextPath: string, fragment: string) => {
    if (!isMarkdownPath(nextPath)) {
      setNotice("Only Markdown documents can be opened in this preview.");
      return;
    }
    setNotice("");
    const position = scroll.current?.scrollTop ?? 0;
    setHistory((entries) => [...entries.slice(0, -1), { ...entries[entries.length - 1]!, scroll: position }, { path: nextPath, fragment, scroll: 0 }]);
  }, [current.path]);
  useEffect(() => {
    if (current.path === path) { setLoaded(null); return; }
    let active = true;
    const requestId = `markdown-document:${instanceId}`;
    setLoaded(null);
    void window.githead.getFilePreview({ repoPath, path: current.path, source: sourceKind === "commit" ? { kind: "commit", hash } : { kind: sourceKind }, requestId })
      .then((result) => { if (active) setLoaded({ path: current.path, text: result.text }); })
      .catch((error: unknown) => { if (active) setLoaded({ path: current.path, error: error instanceof Error ? error.message : "Unable to load document." }); });
    return () => { active = false; void window.githead.cancelRepositoryRead({ requestId }).catch(() => undefined); };
  }, [current.path, path, repoPath, sourceKind, hash, instanceId, text, revision]);
  const content = current.path === path ? text : loaded?.path === current.path ? loaded.text : undefined;
  const restoredEntry = useRef<typeof current | null>(null);
  useEffect(() => {
    if (content === undefined || restoredEntry.current === current) return;
    restoredEntry.current = current;
    if (scroll.current && !current.fragment) scroll.current.scrollTop = current.scroll;
  }, [current, content]);
  const find = useMarkdownFind(root, findOpen ? query : "", content);
  const openFind = (): void => { setFindOpen(true); requestAnimationFrame(() => search.current?.focus()); };
  const jumpToHeading = (id: string): void => {
    const heading = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-heading-id]") ?? []).find((element) => element.dataset.headingId === id);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };
  const repository = useMemo(() => ({ repoPath, path: current.path, source, revision, onNavigate: navigate }), [repoPath, current.path, source, revision, navigate]);
  return <div ref={root} className="markdown-document" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); openFind(); }
    if (event.key === "Escape" && findOpen) { event.preventDefault(); setFindOpen(false); }
  }}>
    <style>{`::highlight(${find.names.all}) { background: #f6d365; color: #191919; } ::highlight(${find.names.current}) { background: #f59e0b; color: #191919; }`}</style>
    <div className="markdown-document-toolbar">
      {history.length > 1 ? <Button variant="ghost" size="sm" onClick={() => setHistory((entries) => entries.slice(0, -1))}><ArrowLeft /> Back</Button> : null}
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Document outline" aria-pressed={outline} tooltip="Document outline" onClick={() => setOutline(!outline)}><List /></TooltipButton>
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Split view" aria-pressed={split} tooltip="Show source or diff beside the preview" onClick={() => setSplit(!split)}><Columns2 /></TooltipButton>
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Find in preview" tooltip="Find in preview (Ctrl/Cmd+F)" onClick={openFind}><Search /></TooltipButton>
      <span className="markdown-document-path" title={current.path}>{current.path}</span>
      {refreshing ? <span role="status">Refreshing…</span> : null}
    </div>
    {findOpen ? <div className="markdown-find" role="search" aria-label="Find in Markdown preview">
      <input ref={search} type="search" aria-label="Find in preview" value={query} placeholder="Find in preview…" onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); find.next(event.shiftKey ? -1 : 1); } }} />
      <span role="status" aria-live="polite">{find.index} of {find.count}</span>
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Previous match" tooltip="Previous match" disabled={!find.count} onClick={() => find.next(-1)}><ChevronUp /></TooltipButton>
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Next match" tooltip="Next match" disabled={!find.count} onClick={() => find.next(1)}><ChevronDown /></TooltipButton>
      <TooltipButton variant="ghost" size="icon-sm" aria-label="Close find" tooltip="Close find" onClick={() => setFindOpen(false)}><X /></TooltipButton>
    </div> : null}
    {error || notice ? <p role="alert" className="markdown-document-notice">{error || notice}</p> : null}
    <div className={`markdown-document-body${split ? " is-split" : ""}`}>
      {split && content !== undefined ? <section className="markdown-source-pane" aria-label="Document comparison">
        <div className="markdown-source-toolbar">
          {diff && current.path === path ? <Button size="sm" variant={!sourceMode ? "secondary" : "ghost"} aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>Diff</Button> : null}
          <Button size="sm" variant={sourceMode || !diff || current.path !== path ? "secondary" : "ghost"} aria-pressed={sourceMode || !diff || current.path !== path} onClick={() => setSourceMode(true)}>Source</Button>
          <span>Click preview text to show its source.</span>
        </div>
        {!sourceMode && diff && current.path === path ? <div className="diff-output text">{diff}</div>
          : <MarkdownSource text={content} line={sourceLine} onLine={setSourceLine} />}
      </section> : null}
      <div ref={scroll} className="markdown-document-scroll" tabIndex={0} aria-label="Rendered Markdown" onScroll={(event) => { if (readingPosition && current.path === path) readingPosition.scrollTop = event.currentTarget.scrollTop; }} onClick={(event) => {
        if (!split || !(event.target instanceof Element) || event.target.closest("a,button,input")) return;
        const line = Number(event.target.closest<HTMLElement>("[data-source-line]")?.dataset.sourceLine);
        if (line > 0) { setSourceMode(true); setSourceLine(line); }
      }}>
        {loaded?.path === current.path && loaded.error ? <p role="alert" className="markdown-preview-status bad">{loaded.error}</p> : null}
        {content !== undefined ? <MarkdownPreview key={current.path} text={content} repository={repository} fragment={current.fragment} onHeadings={setHeadings} />
          : !loaded?.error ? <p role="status" className="markdown-preview-status">Loading Markdown…</p> : null}
      </div>
      {outline ? <nav className="markdown-outline" aria-label="Document outline">
        <p>On this page</p>
        {headings.length ? headings.map((heading) => <button key={heading.id} type="button" style={{ paddingLeft: `${8 + (heading.depth - 1) * 12}px` }} onClick={() => jumpToHeading(heading.id)}>{heading.text}</button>) : <span>No headings</span>}
      </nav> : null}
    </div>
  </div>;
}
