import fs from "node:fs/promises";
import path from "node:path";
import { isMarkdownPath, MARKDOWN_PREVIEW_BYTE_LIMIT } from "../shared/filePreview";

export function validateMarkdownPreviewPath(filePath: string): string {
  const trimmedPath = validatePreviewPath(filePath);
  if (!isMarkdownPath(trimmedPath)) throw new Error("Only Markdown files can be previewed.");
  return trimmedPath;
}

export function validatePreviewPath(filePath: string): string {
  const trimmedPath = filePath.trim();
  if (!trimmedPath || /[\0\\]/.test(trimmedPath)) throw new Error("Select a valid repository file to preview.");
  if (path.isAbsolute(trimmedPath) || /^[a-z]:/i.test(trimmedPath)) throw new Error("File path must be relative to the repository.");

  const normalizedPath = path.normalize(trimmedPath);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
    throw new Error("File path must stay inside the repository.");
  }
  return trimmedPath;
}

export function validateMarkdownPreviewText(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MARKDOWN_PREVIEW_BYTE_LIMIT) {
    throw new Error("Markdown preview is unavailable for files larger than 1 MB.");
  }
  return text;
}

export async function readMarkdownPreviewFile(repoRoot: string, filePath: string): Promise<string> {
  const resolved = await resolvePreviewFile(repoRoot, filePath);
  const stats = await fs.stat(resolved);
  if (!stats.isFile()) throw new Error("Markdown preview is only available for files.");
  if (stats.size > MARKDOWN_PREVIEW_BYTE_LIMIT) {
    throw new Error("Markdown preview is unavailable for files larger than 1 MB.");
  }
  return validateMarkdownPreviewText(await fs.readFile(resolved, "utf8"));
}

export async function resolvePreviewFile(repoRoot: string, filePath: string): Promise<string> {
  validatePreviewPath(filePath);
  const root = await fs.realpath(repoRoot);
  const candidate = path.resolve(root, filePath);
  const resolved = await fs.realpath(candidate).catch(() => {
    throw new Error("File is missing from the selected version.");
  });
  if (!isPathInside(resolved, root)) throw new Error("File path must stay inside the repository.");

  return resolved;
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
