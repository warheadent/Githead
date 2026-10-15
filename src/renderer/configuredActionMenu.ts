import type { GitConfiguredAction, OperationCancelStatus } from "../shared/types";

export interface ConfiguredActionRun {
  id: number;
  operationId: string;
  name: string;
  repoPath: string;
  /** Epoch milliseconds when the renderer started the run. */
  startedAt: number;
  cancelStatus: OperationCancelStatus;
  cancelError: string;
}

/** The most recent configured action run that settled. */
export interface ConfiguredActionOutcome {
  name: string;
  exitCode: number;
  operationId: string;
  /** Epoch milliseconds when the run settled. */
  finishedAt: number;
}

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

export type ConfiguredActionMenuItem = Extract<ConfiguredActionMenuEntry, { type: "action" }>;

/** An action in a menu section, with the subfolders between the section's folder and the action. */
export interface ConfiguredActionMenuSectionItem extends ConfiguredActionMenuItem {
  /** Folder names below the section's top-level folder; empty for actions directly in it. */
  path: string[];
}

export interface ConfiguredActionMenuSection {
  key: string;
  /** The top-level folder name, or null for actions that are not in a folder. */
  heading: string | null;
  items: ConfiguredActionMenuSectionItem[];
}

export const CONFIGURED_ACTION_GROUP_SEPARATOR = " › ";

/**
 * Flattens the nested menu into one section per top-level folder, after the actions that are not in a folder.
 * Deeper folders stay inside their top-level section: each action keeps the subfolder path below that folder,
 * and a folder's own actions come before its subfolders.
 */
export function flattenConfiguredActionMenu(entries: ConfiguredActionMenuEntry[]): ConfiguredActionMenuSection[] {
  const sections: ConfiguredActionMenuSection[] = [];
  const collect = (groupEntries: ConfiguredActionMenuEntry[], path: string[]): ConfiguredActionMenuSectionItem[] => [
    ...groupEntries.flatMap((entry) => entry.type === "action" ? [{ ...entry, path }] : []),
    ...groupEntries.flatMap((entry) => entry.type === "group" ? collect(entry.entries, [...path, entry.label]) : [])
  ];

  const rootItems = entries.flatMap((entry) => entry.type === "action" ? [{ ...entry, path: [] }] : []);
  if (rootItems.length > 0) sections.push({ key: "root", heading: null, items: rootItems });
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    const items = collect(entry.entries, []);
    if (items.length > 0) sections.push({ key: entry.key, heading: entry.label, items });
  }
  return sections;
}

function getActionPathSegments(name: string): string[] {
  const segments = name.split(">").map((segment) => segment.trim());
  return segments.length > 1 && segments.every(Boolean) ? segments : [name];
}
