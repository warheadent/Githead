export type MarkdownLink =
  | { kind: "external"; url: string }
  | { kind: "repository"; path: string; fragment: string }
  | { kind: "invalid" };

/** Resolve URL paths, not platform paths. A leading slash starts at the repository root. */
export function resolveMarkdownLink(documentPath: string, href: string): MarkdownLink {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: "external", url: href };
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || /[\\\0]/.test(href)) return { kind: "invalid" };
  try {
    const hash = href.indexOf("#");
    const fragment = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
    const urlPath = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split("?")[0]!);
    if (/[\\\0]/.test(urlPath)) return { kind: "invalid" };
    if (!urlPath) return { kind: "repository", path: documentPath, fragment };
    const segments = urlPath.startsWith("/") ? [] : documentPath.split("/").slice(0, -1);
    for (const segment of urlPath.split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (!segments.length) return { kind: "invalid" };
        segments.pop();
      } else segments.push(segment);
    }
    return segments.length ? { kind: "repository", path: segments.join("/"), fragment } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}
