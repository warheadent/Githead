import { describe, expect, it } from "vite-plus/test";
import { canOpenRepositoryFile, getOpenRepositoryFileError } from "./openFilePolicy";

describe("openFilePolicy", () => {
  it.each([
    "README.md",
    "notes.txt",
    "report.pdf",
    "image.png",
    "archive.zip",
    "data.csv",
    "document.docx"
  ])("allows passive repository file %s", (filePath) => {
    expect(canOpenRepositoryFile(filePath)).toBe(true);
    expect(getOpenRepositoryFileError(filePath)).toBeNull();
  });

  it.each([
    "tool.exe",
    "script.bat",
    "script.cmd",
    "script.ps1",
    "installer.msi",
    "shortcut.lnk",
    "website.url",
    "script.js",
    "script.vbs",
    "screensaver.scr",
    "vector.svg",
    "legacy.doc",
    "legacy.xls",
    "unknown.custom",
    "LICENSE"
  ])("blocks active or unknown repository file %s", (filePath) => {
    expect(canOpenRepositoryFile(filePath)).toBe(false);
    expect(getOpenRepositoryFileError(filePath)).toMatch(/blocked/);
  });
});
