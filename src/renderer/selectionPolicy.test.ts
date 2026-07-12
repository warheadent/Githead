/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const styles = readFileSync(resolve(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("renderer text-selection policy", () => {
  it("disables selection at the app boundary", () => {
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s);
  });

  it("opts editable and copy-worthy content back into text selection", () => {
    expect(styles).toMatch(/\.selectable-text,[^{]*input,[^{]*textarea,[^{]*\[contenteditable="true"\][^{]*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/s);
    expect(styles).toMatch(/\.diff-output,[^{]*\.activity-log-output,[^{]*\.app-update-release-notes-body,[^{]*\.commit-meta-card/s);
  });

  it("keeps diff gutters out of copied source text", () => {
    expect(styles).toMatch(/\.diff-line-number\s*\{[^}]*user-select:\s*none;/s);
    expect(styles).toMatch(/\.diff-marker\s*\{[^}]*user-select:\s*none;/s);
    expect(styles).toMatch(/\.image-diff-label\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s);
  });
});
