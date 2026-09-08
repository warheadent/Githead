// @vitest-environment jsdom
import { expect, it } from "vite-plus/test";
import { collectMarkdownMatches } from "./useMarkdownFind";

it("finds literal text across inline formatting but excludes preview controls", () => {
  const article = document.createElement("article");
  article.innerHTML = '<p>Read <strong>this</strong> guide.</p><p>Read this guide.</p><button>Read this</button><span class="markdown-code-language">Read this</span>';
  const matches = collectMarkdownMatches(article, "read this");
  expect(matches).toHaveLength(2);
  expect(matches.map((range) => range.toString())).toEqual(["Read this", "Read this"]);
});

it("does not join separate paragraphs and escapes regex characters", () => {
  const article = document.createElement("article");
  article.innerHTML = '<p>first</p><p>second [a+b]</p>';
  expect(collectMarkdownMatches(article, "firstsecond")).toHaveLength(0);
  expect(collectMarkdownMatches(article, "[a+b]")[0]?.toString()).toBe("[a+b]");
  expect(collectMarkdownMatches(article, "")).toEqual([]);
});
