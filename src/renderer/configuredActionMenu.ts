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

export interface ConfiguredActionMenuSection {
  key: string;
  /** The group path joined with " › ", or null for top-level actions. */
  heading: string | null;
  items: ConfiguredActionMenuItem[];
}

export const CONFIGURED_ACTION_GROUP_SEPARATOR = " › ";

/**
 * Flattens the nested menu into labelled sections so one menu lists every action.
 * At each level a group's own actions come before its subgroups, so a heading always
 * covers exactly the items listed under it. Groups without direct actions get no heading.
 */
export function flattenConfiguredActionMenu(entries: ConfiguredActionMenuEntry[]): ConfiguredActionMenuSection[] {
  const sections: ConfiguredActionMenuSection[] = [];

  const visit = (groupEntries: ConfiguredActionMenuEntry[], path: string[], key: string): void => {
    const items = groupEntries.filter((entry): entry is ConfiguredActionMenuItem => entry.type === "action");
    if (items.length > 0) {
      sections.push({
        key,
        heading: path.length > 0 ? path.join(CONFIGURED_ACTION_GROUP_SEPARATOR) : null,
        items
      });
    }

    for (const entry of groupEntries) {
      if (entry.type === "group") {
        visit(entry.entries, [...path, entry.label], entry.key);
      }
    }
  };

  visit(entries, [], "root");
  return sections;
}

function getActionPathSegments(name: string): string[] {
  const segments = name.split(">").map((segment) => segment.trim());
  return segments.length > 1 && segments.every(Boolean) ? segments : [name];
}
