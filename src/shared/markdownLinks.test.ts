import { describe, expect, it } from "vite-plus/test";
import { resolveMarkdownLink } from "./markdownLinks";

describe("Markdown links", () => {
  it.each([
    ["../images/a%20b.png", "images/a b.png", ""],
    ["/README.md#hello-world", "README.md", "hello-world"],
    ["#install", "docs/guide.md", "install"],
    ["next.md?raw=1#part", "docs/next.md", "part"]
  ])("resolves %s relative to the document", (href, path, fragment) => {
    expect(resolveMarkdownLink("docs/guide.md", href)).toEqual({ kind: "repository", path, fragment });
  });
  it.each(["../../secret", "%2e%2e/%2e%2e/secret", "file:///tmp/secret", "javascript:alert(1)", "//host/file", "a%5cb", "%ZZ"])("rejects %s", (href) => {
    expect(resolveMarkdownLink("docs/guide.md", href)).toEqual({ kind: "invalid" });
  });
});
