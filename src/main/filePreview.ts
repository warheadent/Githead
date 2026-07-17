import fs from "node:fs/promises";
import path from "node:path";
import { isMarkdownPath, MARKDOWN_PREVIEW_BYTE_LIMIT } from "../shared/filePreview";

export function validateMarkdownPreviewPath(filePath: string): string {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) throw new Error("Select a Markdown file to preview.");
  if (path.isAbsolute(trimmedPath)) throw new Error("File path must be relative to the repository.");

  const normalizedPath = path.normalize(trimmedPath);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
    throw new Error("File path must stay inside the repository.");
  }
  if (!isMarkdownPath(trimmedPath)) throw new Error("Only Markdown files can be previewed.");
  return trimmedPath;
}

export function validateMarkdownPreviewText(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MARKDOWN_PREVIEW_BYTE_LIMIT) {
    throw new Error("Markdown preview is unavailable for files larger than 1 MB.");
  }
  return text;
}

export async function readMarkdownPreviewFile(repoRoot: string, filePath: string): Promise<string> {
  const root = await fs.realpath(repoRoot);
  const candidate = path.resolve(root, filePath);
  const resolved = await fs.realpath(candidate).catch(() => {
    throw new Error("Markdown file is missing from the selected version.");
  });
  if (!isPathInside(resolved, root)) throw new Error("File path must stay inside the repository.");

  const stats = await fs.stat(resolved);
  if (!stats.isFile()) throw new Error("Markdown preview is only available for files.");
  if (stats.size > MARKDOWN_PREVIEW_BYTE_LIMIT) {
    throw new Error("Markdown preview is unavailable for files larger than 1 MB.");
  }
  return validateMarkdownPreviewText(await fs.readFile(resolved, "utf8"));
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
