import { useCallback, useContext, useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import type { ExtraProps } from "react-markdown";
import { resolveMarkdownLink } from "@/shared/markdownLinks";
import { MarkdownMediaViewer } from "./MarkdownMediaViewer";
import { MarkdownContext } from "./markdownContext";

export function MarkdownImage({ src, alt, node: _node, ...props }: ComponentProps<"img"> & ExtraProps): ReactNode {
  const { repository } = useContext(MarkdownContext);
  const requestId = useId();
  const [failedUrl, setFailedUrl] = useState("");
  const [linkedImage, setLinkedImage] = useState(false);
  const imageFrame = useCallback((element: HTMLSpanElement | null) => { if (element) setLinkedImage(Boolean(element.closest("a"))); }, []);
  const [loaded, setLoaded] = useState<{ key: string; url?: string; error?: string } | null>(null);
  const source = typeof src === "string" ? src : "";
  const link = resolveMarkdownLink(repository?.path ?? "", source);
  const localPath = link.kind === "repository" ? link.path : "";
  const sourceKind = repository?.source.kind;
  const hash = repository?.source.kind === "commit" ? repository.source.hash : "";
  const repoPath = repository?.repoPath;
  const revision = repository?.revision ?? 0;
  const key = `${repoPath}\0${localPath}\0${sourceKind}\0${hash}`;

  useEffect(() => {
    if (!repoPath || !localPath || !sourceKind) return;
    let active = true;
    const id = `markdown-image:${requestId}:${key}:${revision}`;
    void window.githead.getFilePreviewImage({
      repoPath, path: localPath,
      source: sourceKind === "commit" ? { kind: "commit", hash } : { kind: sourceKind }, requestId: id
    }).then((image) => {
      if (!active) return;
      const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(image.data)], { type: image.mimeType }));
      setLoaded({ key, url: objectUrl });
    }).catch((error: unknown) => {
      if (active) setLoaded({ key, error: error instanceof Error ? error.message : "Unable to load image." });
    });
    return () => {
      active = false;
      void window.githead.cancelRepositoryRead({ requestId: id }).catch(() => undefined);
    };
  }, [repoPath, localPath, sourceKind, hash, requestId, key, revision]);
  useEffect(() => () => { if (loaded?.url) URL.revokeObjectURL(loaded.url); }, [loaded?.url]);

  const url = link.kind === "external" && /^https?:/i.test(link.url)
    ? link.url : loaded?.key === key ? loaded.url : undefined;
  if (!url) {
    const error = loaded?.key === key ? loaded.error : undefined;
    return <span className="markdown-image-status" role={error ? "status" : undefined}>
      {alt || "Image"}: {error || (repository && localPath ? "Loading image…" : "Image path is unavailable.")}
    </span>;
  }
  if (failedUrl === url) return <span className="markdown-image-status" role="status">{alt || "Image"}: Unable to display image.</span>;
  return <span className="markdown-image-frame" ref={imageFrame}>
    <img {...props} src={url} alt={alt ?? ""} loading="lazy" onError={() => setFailedUrl(url)} />
    {!linkedImage ? <span className="markdown-image-expand"><MarkdownMediaViewer src={url} label={alt ?? "Image"} /></span> : null}
  </span>;
}
