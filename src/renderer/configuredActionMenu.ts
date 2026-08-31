import type { GitConfiguredAction } from "../shared/types";

export type ConfiguredActionMenuEntry =
  | {
      type: "action";
      key: string;
      label: string;
      action: GitConfiguredAction;
    }
  | {
      type: "group";
      key: string;
      label: string;
      entries: ConfiguredActionMenuEntry[];
    };

interface MutableActionMenuGroup {
  entries: ConfiguredActionMenuEntry[];
  groups: Map<string, MutableActionMenuGroup>;
}

export function buildConfiguredActionMenu(actions: GitConfiguredAction[]): ConfiguredActionMenuEntry[] {
  const root: MutableActionMenuGroup = {
    entries: [],
    groups: new Map()
  };

  for (const action of actions) {
    const segments = getActionPathSegments(action.name);
    let group = root;
    const groupPath: string[] = [];

    for (const segment of segments.slice(0, -1)) {
      groupPath.push(segment);
      let childGroup = group.groups.get(segment);
      if (!childGroup) {
        childGroup = {
          entries: [],
          groups: new Map()
        };
        group.groups.set(segment, childGroup);
        group.entries.push({
          type: "group",
          key: `group:${groupPath.join(">")}`,
          label: segment,
          entries: childGroup.entries
        });
      }
      group = childGroup;
    }

    group.entries.push({
      type: "action",
      key: `action:${action.name}`,
      label: segments.at(-1) ?? action.name,
      action
    });
  }

  return root.entries;
}

function getActionPathSegments(name: string): string[] {
  const segments = name.split(">").map((segment) => segment.trim());
  return segments.length > 1 && segments.every(Boolean) ? segments : [name];
}
