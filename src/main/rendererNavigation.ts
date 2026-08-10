import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The renderer may reload its own entry URL, but it must never replace the
 * privileged BrowserWindow with web content from another origin or file.
 */
export function isAllowedRendererNavigation(candidateUrl: string, rendererEntryUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const entry = new URL(rendererEntryUrl);
    if (entry.protocol === "http:" || entry.protocol === "https:") {
      return candidate.origin === entry.origin;
    }
    if (entry.protocol !== "file:" || candidate.protocol !== "file:") {
      return false;
    }
    return path.resolve(fileURLToPath(candidate)) === path.resolve(fileURLToPath(entry));
  } catch {
    return false;
  }
}
