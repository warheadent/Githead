import { describe, expect, it } from "vitest";
import type { GitConfiguredAction } from "../shared/types";
import { buildConfiguredActionMenu } from "./configuredActionMenu";

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

function action(name: string): GitConfiguredAction {
  return {
    name,
    description: "",
    command: "npm run example",
    shell: "powershell"
  };
}
