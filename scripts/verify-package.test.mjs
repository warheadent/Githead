import { describe, expect, it } from "vitest";
import {
  inspectAsarEntries,
  inspectLocaleFiles,
  normalizeAsarEntry,
  unpackedDirectoryName
} from "./verify-package.mjs";

const VALID_ENTRIES = [
  "dist/main/main/main.js",
  "dist/main/main/preload.js",
  "dist/renderer/index.html",
  "resources/icon.png",
  "resources/icon.ico",
  "node_modules/@sentry/electron/package.json",
  "node_modules/electron-updater/package.json",
  "package.json"
];

describe("package verification", () => {
  it("accepts a complete runtime archive", () => {
    expect(inspectAsarEntries(VALID_ENTRIES)).toEqual([]);
  });

  it("normalizes Windows archive paths", () => {
    expect(normalizeAsarEntry("\\dist\\renderer\\index.html")).toBe(
      "dist/renderer/index.html"
    );
  });

  it("rejects application source maps and renderer-only dependencies", () => {
    const errors = inspectAsarEntries([
      ...VALID_ENTRIES,
      "dist/renderer/assets/index.js.map",
      "node_modules/mermaid/package.json"
    ]);

    expect(errors).toEqual([
      "Packaged source maps: dist/renderer/assets/index.js.map",
      "Packaged renderer-only dependency: mermaid"
    ]);
  });

  it("requires only the supported Electron locale", () => {
    expect(inspectLocaleFiles(["en-US.pak"])).toEqual([]);
    expect(inspectLocaleFiles(["de.pak"])).toEqual([
      "Missing Electron locale: en-US.pak"
    ]);
    expect(inspectLocaleFiles(["en-US.pak", "fr.pak"])).toEqual([
      "Unexpected Electron locales: fr.pak"
    ]);
  });

  it("maps supported package platforms to stable directories", () => {
    expect(unpackedDirectoryName("win")).toBe("win-unpacked");
    expect(unpackedDirectoryName("linux")).toBe("linux-unpacked");
    expect(() => unpackedDirectoryName("darwin")).toThrow(
      "Unsupported package platform: darwin"
    );
  });
});
