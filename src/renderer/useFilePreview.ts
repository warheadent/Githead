import { useEffect, useId, useRef, useState } from "react";
import type { GitFilePreviewRequest, GitImageVersion } from "@/shared/types";

interface PreviewState<T> { revision: number; key: string; value: T | null; loading: boolean; error: string }

const readMarkdown = async (request: GitFilePreviewRequest): Promise<string> => (await window.githead.getFilePreview(request)).text;
const readImage = (request: GitFilePreviewRequest): Promise<GitImageVersion> => window.githead.getFilePreviewImage(request);

/** Keep the last readable document while refreshing, and cancel superseded reads. */
function useFilePreview<T>(request: GitFilePreviewRequest | null, version: unknown, enabled: boolean,
  read: (request: GitFilePreviewRequest) => Promise<T>, fallbackError: string): PreviewState<T> {
  const instance = useId();
  const generation = useRef(0);
  const cache = useRef<{ key: string; version: unknown; revision: number; value: T } | null>(null);
  const key = request ? `${request.repoPath}\0${request.path}\0${request.source.kind}\0${request.source.kind === "commit" ? request.source.hash : ""}` : "";
  const [state, setState] = useState<PreviewState<T>>({ revision: 0, key: "", value: null, loading: false, error: "" });
  // Request identity is described by key; callers may construct an equivalent object each render.
  const latestRequest = useRef(request);
  latestRequest.current = request;
  useEffect(() => {
    const current = latestRequest.current;
    if (!enabled || !current) return;
    const cached = cache.current;
    if (cached?.key === key && cached.version === version) {
      setState({ revision: cached.revision, key, value: cached.value, loading: false, error: "" });
      return;
    }
    let active = true;
    const requestId = `file-preview:${instance}:${++generation.current}`;
    setState({ revision: cached?.revision ?? 0, key, value: cached?.key === key ? cached.value : null, loading: true, error: "" });
    void read({ ...current, requestId }).then((value) => {
      if (!active) return;
      cache.current = { key, version, revision: generation.current, value };
      setState({ revision: generation.current, key, value, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (active) setState({ revision: cached?.revision ?? 0, key, value: cached?.key === key ? cached.value : null, loading: false,
        error: error instanceof Error ? error.message : fallbackError });
    });
    return () => {
      active = false;
      void window.githead.cancelRepositoryRead({ requestId }).catch(() => undefined);
    };
  }, [key, version, enabled, instance, read, fallbackError]);
  return state.key === key ? state : { revision: 0, key, value: null, loading: enabled, error: "" };
}

export function useMarkdownFilePreview(request: GitFilePreviewRequest | null, version: unknown, enabled: boolean) {
  const state = useFilePreview(request, version, enabled, readMarkdown, "Unable to load Markdown preview.");
  return { ...state, text: state.value };
}

export function useImageFilePreview(request: GitFilePreviewRequest | null, version: unknown, enabled: boolean) {
  const state = useFilePreview(request, version, enabled, readImage, "Unable to load image preview.");
  return { ...state, image: state.value };
}
