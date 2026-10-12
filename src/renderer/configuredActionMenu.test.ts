import { describe, expect, it } from "vite-plus/test";
import type { GitConfiguredAction } from "../shared/types";
import { buildConfiguredActionMenu, flattenConfiguredActionMenu } from "./configuredActionMenu";

describe("buildConfiguredActionMenu", () => {
  it("groups action names separated by greater-than signs", () => {
    const typecheck = action("Typecheck");
    const packageWindows = action("Packaging > Package for Windows");
    const packageAndLaunch = action("Packaging>Package and Launch for Windows");

    expect(buildConfiguredActionMenu([typecheck, packageWindows, packageAndLaunch])).toEqual([
      {
        type: "action",
        key: "action:Typecheck",
        label: "Typecheck",
        action: typecheck
      },
      {
        type: "group",
        key: "group:Packaging",
        label: "Packaging",
        entries: [
          {
            type: "action",
            key: "action:Packaging > Package for Windows",
            label: "Package for Windows",
            action: packageWindows
          },
          {
            type: "action",
            key: "action:Packaging>Package and Launch for Windows",
            label: "Package and Launch for Windows",
            action: packageAndLaunch
          }
        ]
      }
    ]);
  });

  it("supports deeper menus and preserves first-seen ordering", () => {
    const first = action("Release > Windows > Package");
    const middle = action("Typecheck");
    const second = action("Release > Linux > Package");

    const menu = buildConfiguredActionMenu([first, middle, second]);

    expect(menu.map((entry) => entry.label)).toEqual(["Release", "Typecheck"]);
    expect(menu[0]?.type === "group" && menu[0].entries.map((entry) => entry.label)).toEqual([
      "Windows",
      "Linux"
    ]);
  });

  it("keeps malformed paths as regular action names", () => {
    const malformed = action("Packaging > > Package");

    expect(buildConfiguredActionMenu([malformed])).toEqual([
      {
        type: "action",
        key: "action:Packaging > > Package",
        label: "Packaging > > Package",
        action: malformed
      }
    ]);
  });
});

describe("flattenConfiguredActionMenu", () => {
  it("lists top-level actions first and turns each group into a labelled section", () => {
    const typecheck = action("Typecheck");
    const packageWindows = action("Packaging > Package for Windows");
    const lint = action("Lint");
    const packageAndLaunch = action("Packaging>Package and Launch for Windows");

    expect(flattenConfiguredActionMenu(buildConfiguredActionMenu([typecheck, packageWindows, lint, packageAndLaunch]))).toEqual([
      {
        key: "root",
        heading: null,
        items: [
          { type: "action", key: "action:Typecheck", label: "Typecheck", action: typecheck },
          { type: "action", key: "action:Lint", label: "Lint", action: lint }
        ]
      },
      {
        key: "group:Packaging",
        heading: "Packaging",
        items: [
          { type: "action", key: "action:Packaging > Package for Windows", label: "Package for Windows", action: packageWindows },
          {
            type: "action",
            key: "action:Packaging>Package and Launch for Windows",
            label: "Package and Launch for Windows",
            action: packageAndLaunch
          }
        ]
      }
    ]);
  });

  it("joins nested group paths and skips headings for groups without their own actions", () => {
    const windows = action("Release > Windows > Package");
    const notes = action("Release > Notes");
    const linux = action("Release > Linux > Package");

    const sections = flattenConfiguredActionMenu(buildConfiguredActionMenu([windows, notes, linux]));

    expect(sections.map((section) => section.heading)).toEqual([
      "Release",
      "Release › Windows",
      "Release › Linux"
    ]);
    expect(sections.map((section) => section.items.map((item) => item.label))).toEqual([
      ["Notes"],
      ["Package"],
      ["Package"]
    ]);
    expect(new Set(sections.map((section) => section.key)).size).toBe(sections.length);
  });

  it("omits a heading-only section when a group only holds subgroups", () => {
    const package_ = action("Release > Windows > Package");

    expect(flattenConfiguredActionMenu(buildConfiguredActionMenu([package_]))).toEqual([
      {
        key: "group:Release>Windows",
        heading: "Release › Windows",
        items: [{ type: "action", key: "action:Release > Windows > Package", label: "Package", action: package_ }]
      }
    ]);
  });

  it("returns no sections for an empty action list", () => {
    expect(flattenConfiguredActionMenu(buildConfiguredActionMenu([]))).toEqual([]);
  });
});

function action(name: string): GitConfiguredAction {
  return {
    name,
    description: "",
    command: "npm run example",
    shell: "powershell"
  };
}
