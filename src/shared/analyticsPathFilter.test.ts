import { describe, expect, it } from "vite-plus/test";
import { compileExcludedPaths, MAX_ANALYTICS_EXCLUDED_PATHS, normalizeExcludedPaths } from "./analyticsPathFilter";

describe("compileExcludedPaths", () => {
  it("matches folder names at any depth unless the pattern is anchored", () => {
    const excluded = compileExcludedPaths(["node_modules/", "/build/", "docs/generated/"]);
    expect(excluded("node_modules/react/index.js")).toBe(true);
    expect(excluded("web/node_modules/react/index.js")).toBe(true);
    expect(excluded("build/out.js")).toBe(true);
    expect(excluded("tools/build/out.js")).toBe(false);
    expect(excluded("docs/generated/api.md")).toBe(true);
    expect(excluded("site/docs/generated/api.md")).toBe(false);
  });

  it("requires a folder for a trailing slash and allows files without one", () => {
    expect(compileExcludedPaths(["Plugins/"])("Plugins")).toBe(false);
    const files = compileExcludedPaths(["package-lock.json"]);
    expect(files("package-lock.json")).toBe(true);
    expect(files("web/package-lock.json")).toBe(true);
    expect(files("package-lock.json.bak")).toBe(false);
  });

  it("applies wildcards and lets later negations re-include paths", () => {
    const excluded = compileExcludedPaths(["Plugins/", "Content/*/", "!Content/Myrion/", "**/*.generated.h"]);
    expect(excluded("Plugins/PlayFab/Source/A.cpp")).toBe(true);
    expect(excluded("Content/ARPG_Pack/Hero.uasset")).toBe(true);
    expect(excluded("Content/Myrion/Hero.uasset")).toBe(false);
    expect(excluded("Content/Map.umap")).toBe(false);
    expect(excluded("Source/Game/Hero.generated.h")).toBe(true);
    expect(excluded("Source/Game/Hero.h")).toBe(false);
  });

  it("ignores case and treats regex characters literally", () => {
    const excluded = compileExcludedPaths(["thirdparty/", "a+b(1)/"]);
    expect(excluded("Source/ThirdParty/zlib.c")).toBe(true);
    expect(excluded("a+b(1)/x")).toBe(true);
    expect(excluded("aab1/x")).toBe(false);
  });

  it("matches nothing without patterns", () => {
    expect(compileExcludedPaths([])("anything")).toBe(false);
  });
});

describe("normalizeExcludedPaths", () => {
  it("drops blanks, comments, and duplicates, and normalizes separators", () => {
    expect(normalizeExcludedPaths(["  vendor/ ", "", "# note", "vendor/", "Plugins\\Vendor\\", "!"])).toEqual(["vendor/", "Plugins/Vendor/"]);
  });

  it("caps the number of patterns", () => {
    const many = Array.from({ length: MAX_ANALYTICS_EXCLUDED_PATHS + 5 }, (_, index) => `dir${index}/`);
    expect(normalizeExcludedPaths(many)).toHaveLength(MAX_ANALYTICS_EXCLUDED_PATHS);
  });
});
