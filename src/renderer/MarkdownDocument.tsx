import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GitFilePreviewSource } from "@/shared/types";
import { isMarkdownPath } from "@/shared/filePreview";
import { MarkdownPreview } from "./MarkdownPreview";

export function MarkdownDocument({ text, repoPath, path, source }: {
  text: string;
  repoPath: string;
  path: string;
  source: GitFilePreviewSource;
}): ReactNode {
  const instanceId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState([{ path, fragment: "", scroll: 0 }]);
  const current = history[history.length - 1]!;
  const [loaded, setLoaded] = useState<{ path: string; text?: string; error?: string } | null>(null);
  const sourceKind = source.kind;
  const hash = source.kind === "commit" ? source.hash : "";
  const navigate = useCallback((nextPath: string, fragment: string) => {
    if (!isMarkdownPath(nextPath)) {
      setLoaded({ path: current.path, error: "Only Markdown documents can be opened in this preview." });
      return;
    }
    const scroll = root.current?.closest(".markdown-preview-output")?.scrollTop ?? 0;
    setHistory((entries) => [...entries.slice(0, -1), { ...entries[entries.length - 1]!, scroll }, { path: nextPath, fragment, scroll: 0 }]);
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
  }, [current.path, path, repoPath, sourceKind, hash, instanceId, text]);
  const content = current.path === path ? text : loaded?.path === current.path ? loaded.text : undefined;
  useEffect(() => {
    const scroll = root.current?.closest(".markdown-preview-output");
    if (scroll && content !== undefined && !current.fragment) scroll.scrollTop = current.scroll;
  }, [current, content]);
  const repository = useMemo(() => ({ repoPath, path: current.path, source, onNavigate: navigate }), [repoPath, current.path, source, navigate]);
  return <div ref={root} className="markdown-document">
    {history.length > 1 ? <div className="markdown-document-toolbar">
      <Button variant="ghost" size="sm" onClick={() => setHistory((entries) => entries.slice(0, -1))}><ArrowLeft /> Back</Button>
      <span className="truncate font-mono text-xs">{current.path}</span>
    </div> : null}
    {loaded?.path === current.path && loaded.error ? <p role="alert" className="markdown-preview-status bad">{loaded.error}</p> : null}
    {content !== undefined ? <MarkdownPreview text={content} repository={repository} fragment={current.fragment} />
      : !loaded?.error ? <p role="status" className="markdown-preview-status">Loading Markdown…</p> : null}
  </div>;
}
