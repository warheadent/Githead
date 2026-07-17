import { describe, expect, it } from "vite-plus/test";
import { isMarkdownPath } from "./filePreview";

describe("isMarkdownPath", () => {
  it("recognizes supported Markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("README.md")).toBe(true);
    expect(isMarkdownPath("docs/guide.MARKDOWN")).toBe(true);
  });

  it("rejects non-Markdown and suffix-only paths", () => {
    expect(isMarkdownPath("README.md.txt")).toBe(false);
    expect(isMarkdownPath("markdown")).toBe(false);
  });
});
