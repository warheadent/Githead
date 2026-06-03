import path from "node:path";

const PASSIVE_FILE_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".csv",
  ".diff",
  ".docx",
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".json",
  ".log",
  ".md",
  ".patch",
  ".pdf",
  ".png",
  ".rar",
  ".rtf",
  ".tar",
  ".text",
  ".tif",
  ".tiff",
  ".toml",
  ".tsv",
  ".txt",
  ".webp",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zip"
]);

export function canOpenRepositoryFile(filePath: string): boolean {
  return PASSIVE_FILE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase());
}

export function getOpenRepositoryFileError(filePath: string): string | null {
  if (canOpenRepositoryFile(filePath)) {
    return null;
  }

  const extension = path.extname(filePath).toLocaleLowerCase();
  return extension
    ? `Opening ${extension} files from a repository is blocked because this file type can launch active OS handlers.`
    : "Opening files without a passive file extension from a repository is blocked.";
}
