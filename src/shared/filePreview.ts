export const MARKDOWN_PREVIEW_BYTE_LIMIT = 1_000_000;

const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown)$/i;

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSION_PATTERN.test(filePath.trim());
}
