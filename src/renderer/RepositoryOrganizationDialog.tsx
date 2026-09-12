import { useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  Folder,
  Info,
  List,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, TooltipButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRepoPathKey } from "./repositorySnapshotCache";
import {
  repositoryName,
  repositoryPreference,
  type RepositoryOrganization,
  type RepositoryPreference,
} from "./repositoryOrganization";

export function RepositoryOrganizationMenu({
  preference,
  onChange,
  onOrganize,
}: {
  preference: RepositoryPreference;
  onChange: (patch: Partial<RepositoryPreference>) => void;
  onOrganize: () => void;
}): ReactNode {
  return (
    <>
      <ContextMenuItem onSelect={() => onChange({ pinned: !preference.pinned })}>
        {preference.pinned ? <PinOff /> : <Pin />}
        {preference.pinned ? "Unpin repository" : "Pin repository"}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onChange({ hidden: !preference.hidden })}>
        {preference.hidden ? <Eye /> : <EyeOff />}
        {preference.hidden ? "Show repository" : "Hide repository"}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onOrganize}>
        <Folder />
        Organize repository…
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}

type OrganizerFilter = "all" | "ungrouped" | "hidden" | `group:${string}`;
type NameEdit =
  | { kind: "new"; paths: string[]; name: string }
  | { kind: "group"; id: string; name: string }
  | { kind: "repository"; path: string; name: string };

export function RepositoryOrganizationDialog({
  organization,
  paths,
  initialQuery,
  onClose,
  onSave,
}: {
  organization: RepositoryOrganization;
  paths: string[];
  initialQuery: string;
  onClose: () => void;
  onSave: (draft: RepositoryOrganization) => boolean;
}): ReactNode {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(organization);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<OrganizerFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<NameEdit | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const setPreferences = (targets: string[], patch: Partial<RepositoryPreference>) =>
    setDraft((current) => {
      const repositories = { ...current.repositories };
      for (const path of targets) {
        repositories[getRepoPathKey(path)] = { ...repositoryPreference(current, path), ...patch };
      }
      return { ...current, repositories };
    });
  const changeFilter = (next: OrganizerFilter) => {
    setFilter(next);
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
    setSelected(new Set());
  };
  const moveProject = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const projects = [...current.projects];
      const [project] = projects.splice(index, 1);
      if (project) projects.splice(index + direction, 0, project);
      return { ...current, projects };
    });
  const deleteProject = (projectId: string) => {
    setDraft((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      repositories: Object.fromEntries(
        Object.entries(current.repositories).map(([path, preference]) => [
          path,
          preference.projectId === projectId ? { ...preference, projectId: "" } : preference,
        ]),
      ),
    }));
    if (filter === `group:${projectId}`) changeFilter("ungrouped");
    setNotice("Group deleted. Its repositories are now Ungrouped. Save changes to apply.");
  };
  const projectNames = new Map(draft.projects.map((project) => [project.id, project.name]));
  const counts = new Map<string, number>();
  let hiddenCount = 0;
  const search = query.trim().toLocaleLowerCase();
  const matchingPaths = paths.filter((path) => {
    const preference = repositoryPreference(draft, path);
    counts.set(preference.projectId, (counts.get(preference.projectId) ?? 0) + 1);
    if (preference.hidden) hiddenCount++;
    const inFilter =
      filter === "all" ||
      (filter === "hidden" && preference.hidden) ||
      (filter === "ungrouped" && !preference.projectId) ||
      filter === `group:${preference.projectId}`;
    return (
      inFilter &&
      `${path} ${preference.alias} ${projectNames.get(preference.projectId) ?? ""}`
        .toLocaleLowerCase()
        .includes(search)
    );
  });
  const selectedPaths = matchingPaths.filter((path) => selected.has(path));
  const hasChanges =
    JSON.stringify(draft.projects) !== JSON.stringify(organization.projects) ||
    [
      ...new Set([...Object.keys(draft.repositories), ...Object.keys(organization.repositories)]),
    ].some((path) => {
      const before = repositoryPreference(organization, path);
      const after = repositoryPreference(draft, path);
      return (
        before.alias !== after.alias ||
        before.projectId !== after.projectId ||
        before.pinned !== after.pinned ||
        before.hidden !== after.hidden
      );
    });
  const filterName =
    filter === "all"
      ? "All repositories"
      : filter === "ungrouped"
        ? "Ungrouped"
        : filter === "hidden"
          ? "Hidden"
          : (projectNames.get(filter.slice(6)) ?? "All repositories");
  const moveSelected = (projectId: string) => {
    setPreferences(selectedPaths, { projectId });
    setSelected(new Set());
    setNotice(
      `${selectedPaths.length} repositories moved to ${projectNames.get(projectId) ?? "Ungrouped"}.`,
    );
  };
  const editName = edit?.name.trim() ?? "";
  const duplicateName =
    edit?.kind !== "repository" &&
    draft.projects.some(
      (project) =>
        !(edit?.kind === "group" && project.id === edit.id) &&
        project.name.toLocaleLowerCase() === editName.toLocaleLowerCase(),
    );
  const validEdit = edit?.kind === "repository" || Boolean(editName && !duplicateName);
  const applyName = () => {
    if (!edit || !validEdit) return;
    if (edit.kind === "repository") {
      setPreferences([edit.path], { alias: editName });
    } else if (edit.kind === "group") {
      setDraft((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === edit.id ? { ...project, name: editName } : project,
        ),
      }));
    } else {
      const projectId = crypto.randomUUID();
      setDraft((current) => {
        const repositories = { ...current.repositories };
        for (const path of edit.paths) {
          repositories[getRepoPathKey(path)] = {
            ...repositoryPreference(current, path),
            projectId,
          };
        }
        return {
          ...current,
          repositories,
          projects: [...current.projects, { id: projectId, name: editName, collapsed: false }],
        };
      });
      if (edit.paths.length) {
        setSelected(new Set());
        setNotice(`${edit.paths.length} repositories moved to ${editName}.`);
      }
    }
    setEdit(null);
  };
  const filterButton = (value: OrganizerFilter, name: string, count: number, icon: ReactNode) => (
    <Button
      variant="ghost"
      className="repository-organizer-filter"
      aria-pressed={filter === value}
      aria-label={`${name}, ${count} repositories`}
      onClick={() => changeFilter(value)}
    >
      {icon}
      <span className="truncate">{name}</span>
      <span className="repository-organizer-count">{count}</span>
    </Button>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="repository-organizer sm:max-w-[1040px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Organize repositories</DialogTitle>
          <DialogDescription>
            Choose a group to see its repositories, or select rows to move them together.
          </DialogDescription>
        </DialogHeader>
        <div className="repository-organizer-body">
          <nav className="repository-organizer-nav" aria-label="Repository filters">
            {filterButton("all", "All repositories", paths.length, <List />)}
            {filterButton("ungrouped", "Ungrouped", counts.get("") ?? 0, <Folder />)}
            {filterButton("hidden", "Hidden", hiddenCount, <EyeOff />)}
            <p className="repository-organizer-nav-heading">Groups</p>
            {draft.projects.map((project, index) => (
              <div className="repository-organizer-group" key={project.id}>
                {filterButton(
                  `group:${project.id}`,
                  project.name,
                  counts.get(project.id) ?? 0,
                  <Folder />,
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Manage group ${project.name}`}
                      tooltip={`Manage group ${project.name}`}
                    >
                      <MoreHorizontal />
                    </TooltipButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={() =>
                        setEdit({ kind: "group", id: project.id, name: project.name })
                      }
                    >
                      <Pencil />
                      Rename group
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === 0}
                      onSelect={() => moveProject(index, -1)}
                    >
                      <ArrowUp />
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === draft.projects.length - 1}
                      onSelect={() => moveProject(index, 1)}
                    >
                      <ArrowDown />
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => deleteProject(project.id)}
                    >
                      <Trash2 />
                      Delete group
                    </DropdownMenuItem>
                    <p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">
                      Repositories move to Ungrouped. No files are deleted.
                    </p>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            <Button
              variant="ghost"
              className="repository-organizer-new-group"
              onClick={() => setEdit({ kind: "new", paths: [], name: "" })}
            >
              <Plus />
              New group
            </Button>
          </nav>
          <section className="repository-organizer-content" aria-label="Repository organization">
            <div className="repository-organizer-toolbar">
              <Input
                ref={searchRef}
                type="search"
                aria-label="Find repository to organize"
                placeholder="Search by name, path, or group…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
                  setSelected(new Set());
                }}
              />
              <div className="repository-organizer-list-heading">
                <h3>
                  {filterName}
                  <span className="repository-organizer-count">{matchingPaths.length}</span>
                </h3>
                {selectedPaths.length ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedPaths.length} selected
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Move to group
                          <ChevronDown />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => moveSelected("")}>
                          Ungrouped
                        </DropdownMenuItem>
                        {draft.projects.map((project) => (
                          <DropdownMenuItem
                            key={project.id}
                            onSelect={() => moveSelected(project.id)}
                          >
                            {project.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setEdit({ kind: "new", paths: selectedPaths, name: "" })}
                        >
                          <Plus />
                          New group…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      Clear selection
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
            <div ref={tableScrollRef} className="repository-organizer-table-scroll">
              <table className="repository-organizer-table">
                <caption className="sr-only">Repositories in {filterName}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="repository-organizer-check-cell">
                      <label className="repository-organizer-check">
                        <input
                          type="checkbox"
                          aria-label="Select all shown repositories"
                          disabled={!matchingPaths.length}
                          checked={
                            matchingPaths.length > 0 &&
                            selectedPaths.length === matchingPaths.length
                          }
                          ref={(input) => {
                            if (input)
                              input.indeterminate =
                                selectedPaths.length > 0 &&
                                selectedPaths.length < matchingPaths.length;
                          }}
                          onChange={(event) =>
                            setSelected(event.target.checked ? new Set(matchingPaths) : new Set())
                          }
                        />
                      </label>
                    </th>
                    <th scope="col">Repository</th>
                    <th scope="col" className="repository-organizer-group-cell">
                      Group
                    </th>
                    <th scope="col" className="repository-organizer-state-cell">
                      <span className="inline-flex items-center gap-1">
                        Pinned
                        <TooltipButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label="About pinned repositories"
                          tooltip="Show in Pinned instead of its group. The group assignment is kept."
                        >
                          <Info />
                        </TooltipButton>
                      </span>
                    </th>
                    <th scope="col" className="repository-organizer-state-cell">
                      Visible
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matchingPaths.map((path) => {
                    const preference = repositoryPreference(draft, path);
                    const name = preference.alias || repositoryName(path);
                    return (
                      <tr key={path} data-selected={selected.has(path)}>
                        <td>
                          <label className="repository-organizer-check">
                            <input
                              type="checkbox"
                              aria-label={`Select ${path}`}
                              checked={selected.has(path)}
                              onChange={(event) =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(path);
                                  else next.delete(path);
                                  return next;
                                })
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <div className="repository-organizer-name">
                            <span className="truncate font-medium" title={name}>
                              {name}
                            </span>
                            <TooltipButton
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Rename ${path} in Githead`}
                              tooltip="Rename in Githead"
                              onClick={() =>
                                setEdit({ kind: "repository", path, name: preference.alias })
                              }
                            >
                              <Pencil />
                            </TooltipButton>
                          </div>
                          <p className="repository-organizer-path" title={path}>
                            {path}
                          </p>
                        </td>
                        <td>
                          <select
                            aria-label={`Group for ${path}`}
                            className="repository-project-select"
                            value={preference.projectId}
                            onChange={(event) =>
                              setPreferences([path], { projectId: event.target.value })
                            }
                          >
                            <option value="">Ungrouped</option>
                            {draft.projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className="repository-organizer-check">
                            <input
                              type="checkbox"
                              aria-label={`Pin ${path}`}
                              checked={preference.pinned}
                              onChange={(event) =>
                                setPreferences([path], { pinned: event.target.checked })
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <label className="repository-organizer-check">
                            <input
                              type="checkbox"
                              aria-label={`Show ${path}`}
                              checked={!preference.hidden}
                              onChange={(event) =>
                                setPreferences([path], { hidden: !event.target.checked })
                              }
                            />
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!matchingPaths.length ? (
                <div className="repository-organizer-empty">
                  <Folder />
                  <p>
                    {search
                      ? "No repositories match your search."
                      : filter === "hidden"
                        ? "No hidden repositories."
                        : "No repositories in this group."}
                  </p>
                  {search ? (
                    <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  ) : filter !== "all" && filter !== "hidden" ? (
                    <Button variant="outline" size="sm" onClick={() => changeFilter("all")}>
                      Choose from all repositories
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="repository-organizer-hint">
              Hidden repositories remain searchable. Groups include hidden and pinned members.
            </p>
          </section>
        </div>
        <div className="repository-organizer-footer">
          <div className="min-w-0 text-xs text-muted-foreground" role="status">
            <p>{hasChanges ? "Unsaved changes" : "No unsaved changes"}</p>
            {notice ? <p className="mt-1">{notice}</p> : null}
            {error ? (
              <p role="alert" className="mt-1 text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!hasChanges}
              onClick={() => {
                if (onSave(draft)) onClose();
                else setError("Unable to save repository organization. Try again.");
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </div>
        <Dialog
          open={edit !== null}
          onOpenChange={(open) => {
            if (!open) setEdit(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              searchRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {edit?.kind === "repository"
                  ? "Rename in Githead"
                  : edit?.kind === "group"
                    ? "Rename group"
                    : "New group"}
              </DialogTitle>
              <DialogDescription>
                {edit?.kind === "repository"
                  ? "Only the name in Githead changes. Leave empty to use the folder name."
                  : "Use a unique name for this group."}
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                applyName();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor={`${id}-name`}>
                  {edit?.kind === "repository" ? "Display name" : "Group name"}
                </Label>
                <Input
                  id={`${id}-name`}
                  value={edit?.name ?? ""}
                  maxLength={edit?.kind === "repository" ? 120 : 80}
                  placeholder={
                    edit?.kind === "repository" ? repositoryName(edit.path) : "Group name"
                  }
                  aria-invalid={Boolean(editName && duplicateName)}
                  aria-describedby={editName && duplicateName ? `${id}-name-error` : undefined}
                  onChange={(event) =>
                    setEdit((current) =>
                      current ? { ...current, name: event.target.value } : null,
                    )
                  }
                />
                {editName && duplicateName ? (
                  <p id={`${id}-name-error`} role="alert" className="text-sm text-destructive">
                    A group with this name already exists.
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!validEdit}>
                  {edit?.kind === "new" ? "Create group" : "Apply name"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
