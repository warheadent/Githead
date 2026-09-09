import { useCallback, useEffect, useState } from "react";
import type { RepositoryGroup } from "../shared/types";
import { getRepoPathKey } from "./repositorySnapshotCache";

export const REPOSITORY_ORGANIZATION_KEY = "githead:repository-organization:v1";
const CHANGE_EVENT = "githead:repository-organization-changed";
export interface RepositoryPreference {
  alias: string;
  projectId: string;
  pinned: boolean;
  hidden: boolean;
}
export interface RepositoryProject {
  id: string;
  name: string;
  collapsed: boolean;
}
export interface RepositoryOrganization {
  version: 1;
  projects: RepositoryProject[];
  repositories: Record<string, RepositoryPreference>;
  expandedWorktrees: string[];
}
export const emptyRepositoryPreference: RepositoryPreference = {
  alias: "",
  projectId: "",
  pinned: false,
  hidden: false,
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function normalizeRepositoryOrganization(value: unknown): RepositoryOrganization {
  const result: RepositoryOrganization = {
    version: 1,
    projects: [],
    repositories: {},
    expandedWorktrees: [],
  };
  if (!isObject(value) || value.version !== 1) return result;
  const ids = new Set<string>();
  if (Array.isArray(value.projects))
    for (const project of value.projects) {
      if (
        !isObject(project) ||
        typeof project.id !== "string" ||
        !project.id ||
        ids.has(project.id) ||
        typeof project.name !== "string" ||
        !project.name.trim()
      )
        continue;
      ids.add(project.id);
      result.projects.push({
        id: project.id,
        name: project.name.trim(),
        collapsed: project.collapsed === true,
      });
    }
  if (isObject(value.repositories))
    for (const [path, preference] of Object.entries(value.repositories)) {
      if (!isObject(preference) || !getRepoPathKey(path)) continue;
      result.repositories[getRepoPathKey(path)] = {
        alias: typeof preference.alias === "string" ? preference.alias.trim() : "",
        projectId:
          typeof preference.projectId === "string" && ids.has(preference.projectId)
            ? preference.projectId
            : "",
        pinned: preference.pinned === true,
        hidden: preference.hidden === true,
      };
    }
  if (Array.isArray(value.expandedWorktrees))
    result.expandedWorktrees = [
      ...new Set(value.expandedWorktrees.filter((id): id is string => typeof id === "string")),
    ];
  return result;
}

export function readRepositoryOrganization(): RepositoryOrganization {
  try {
    return normalizeRepositoryOrganization(
      JSON.parse(window.localStorage.getItem(REPOSITORY_ORGANIZATION_KEY) ?? "null"),
    );
  } catch {
    return normalizeRepositoryOrganization(null);
  }
}

// Use the same storage for the welcome screen and sidebar, including other windows.
export function useRepositoryOrganization() {
  const [organization, setOrganization] = useState(readRepositoryOrganization);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    const refresh = () => setOrganization(readRepositoryOrganization());
    const onStorage = (event: StorageEvent) => {
      if (event.key === REPOSITORY_ORGANIZATION_KEY || event.key === null) refresh();
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const update = useCallback(
    (change: (current: RepositoryOrganization) => RepositoryOrganization): boolean => {
      try {
        const next = normalizeRepositoryOrganization(change(readRepositoryOrganization()));
        window.localStorage.setItem(REPOSITORY_ORGANIZATION_KEY, JSON.stringify(next));
        setSaveError("");
        window.dispatchEvent(new Event(CHANGE_EVENT));
        return true;
      } catch {
        setSaveError("Unable to save repository organization. Try again.");
        return false;
      }
    },
    [],
  );
  return { organization, update, saveError };
}

export function repositoryName(path: string): string {
  return (
    path
      .trim()
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}
export function repositoryPreference(
  organization: RepositoryOrganization,
  path: string,
): RepositoryPreference {
  return organization.repositories[getRepoPathKey(path)] ?? emptyRepositoryPreference;
}
export function repositoryLabels(
  paths: string[],
  organization: RepositoryOrganization,
): Map<string, { name: string; detail: string }> {
  const labels = new Map(
    paths.map((path) => [
      getRepoPathKey(path),
      { name: repositoryPreference(organization, path).alias || repositoryName(path), detail: "" },
    ]),
  );
  const duplicates = new Map<string, string[]>();
  for (const path of paths) {
    const name = labels.get(getRepoPathKey(path))!.name.toLocaleLowerCase();
    duplicates.set(name, [...(duplicates.get(name) ?? []), path]);
  }
  for (const matches of duplicates.values()) {
    if (matches.length < 2) continue;
    const parents = matches.map((path) =>
      path
        .replace(/[\\/]+$/, "")
        .split(/[\\/]/)
        .slice(0, -1),
    );
    matches.forEach((path, index) => {
      const parts = parents[index]!;
      let length = 1;
      while (
        length < parts.length &&
        parents.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.slice(-length).join("/").toLocaleLowerCase() ===
              parts.slice(-length).join("/").toLocaleLowerCase(),
        )
      )
        length++;
      labels.get(getRepoPathKey(path))!.detail = parts.slice(-length).join("/") || "/";
    });
  }
  return labels;
}
export interface RepositorySection {
  id: string;
  name: string;
  paths: string[];
  collapsed: boolean;
}
export function organizeRepositories(
  paths: string[],
  groups: RepositoryGroup[],
  organization: RepositoryOrganization,
  query: string,
  showHidden: boolean,
  activePath: string,
): RepositorySection[] {
  const search = query.trim().toLocaleLowerCase();
  const byPath = new Map(groups.map((group) => [getRepoPathKey(group.anchorPath), group]));
  const sections: RepositorySection[] = [
    { id: "pinned", name: "Pinned", paths: [], collapsed: false },
    ...organization.projects.map((project) => ({
      id: `project:${project.id}`,
      name: project.name,
      paths: [],
      collapsed: project.collapsed && !search,
    })),
    {
      id: "ungrouped",
      name: organization.projects.length ? "Ungrouped" : "All repositories",
      paths: [],
      collapsed: false,
    },
  ];
  const bySection = new Map(sections.map((section) => [section.id, section]));
  for (const path of paths) {
    const preference = repositoryPreference(organization, path);
    const group = byPath.get(getRepoPathKey(path));
    const active =
      getRepoPathKey(path) === getRepoPathKey(activePath) ||
      group?.worktrees.some(
        (worktree) => getRepoPathKey(worktree.path) === getRepoPathKey(activePath),
      );
    if (preference.hidden && !showHidden && !search && !active) continue;
    const project = preference.projectId
      ? bySection.get(`project:${preference.projectId}`)
      : undefined;
    const terms = [
      path,
      preference.alias,
      project?.name ?? "",
      ...(group?.worktrees.flatMap((worktree) => [worktree.path, worktree.branch ?? ""]) ?? []),
    ];
    if (search && !terms.some((term) => term.toLocaleLowerCase().includes(search))) continue;
    const section = preference.pinned
      ? bySection.get("pinned")!
      : (project ?? bySection.get("ungrouped")!);
    section.paths.push(path);
  }
  return sections.filter(
    (section) => section.paths.length > 0 || (!search && section.id.startsWith("project:")),
  );
}
