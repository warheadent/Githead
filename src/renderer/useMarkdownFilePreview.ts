import { useEffect, useId, useRef, useState } from "react";
import type { GitFilePreviewRequest } from "@/shared/types";

interface PreviewState { revision: number; key: string; text: string | null; loading: boolean; error: string }

/** Keep the last readable document while refreshing, and cancel superseded reads. */
export function useMarkdownFilePreview(request: GitFilePreviewRequest | null, version: unknown, enabled: boolean) {
  const instance = useId();
  const generation = useRef(0);
  const cache = useRef<{ key: string; version: unknown; revision: number; text: string } | null>(null);
  const key = request ? `${request.repoPath}\0${request.path}\0${request.source.kind}\0${request.source.kind === "commit" ? request.source.hash : ""}` : "";
  const [state, setState] = useState<PreviewState>({ revision: 0, key: "", text: null, loading: false, error: "" });
  // Request identity is described by key; callers may construct an equivalent object each render.
  const latestRequest = useRef(request);
  latestRequest.current = request;
  useEffect(() => {
    const current = latestRequest.current;
    if (!enabled || !current) return;
    const cached = cache.current;
    if (cached?.key === key && cached.version === version) {
      setState({ revision: cached.revision, key, text: cached.text, loading: false, error: "" });
      return;
    }
    let active = true;
    const requestId = `file-preview:${instance}:${++generation.current}`;
    setState({ revision: cached?.revision ?? 0, key, text: cached?.key === key ? cached.text : null, loading: true, error: "" });
    void window.githead.getFilePreview({ ...current, requestId }).then((result) => {
      if (!active) return;
      cache.current = { key, version, revision: generation.current, text: result.text };
      setState({ revision: generation.current, key, text: result.text, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (active) setState({ revision: cached?.revision ?? 0, key, text: cached?.key === key ? cached.text : null, loading: false,
        error: error instanceof Error ? error.message : "Unable to load Markdown preview." });
    });
    return () => {
      active = false;
      void window.githead.cancelRepositoryRead({ requestId }).catch(() => undefined);
    };
  }, [key, version, enabled, instance]);
  return state.key === key ? state : { revision: 0, key, text: null, loading: enabled, error: "" };
}
