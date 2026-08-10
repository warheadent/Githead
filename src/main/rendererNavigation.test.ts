import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { isAllowedRendererNavigation } from "./rendererNavigation";

describe("isAllowedRendererNavigation", () => {
  it("allows renderer routes on the configured development origin", () => {
    expect(isAllowedRendererNavigation(
      "http://127.0.0.1:5173/settings?tab=updates#notes",
      "http://127.0.0.1:5173/"
    )).toBe(true);
  });

  it("blocks remote pages from replacing the privileged renderer", () => {
    expect(isAllowedRendererNavigation(
      "https://example.test/release-notes",
      "http://127.0.0.1:5173/"
    )).toBe(false);
  });

  it("allows only the packaged renderer file", () => {
    const entry = pathToFileURL(path.join("/app", "renderer", "index.html")).href;
    expect(isAllowedRendererNavigation(`${entry}?tab=updates#notes`, entry)).toBe(true);
    expect(isAllowedRendererNavigation(pathToFileURL(path.join("/tmp", "remote.html")).href, entry)).toBe(false);
  });
});
