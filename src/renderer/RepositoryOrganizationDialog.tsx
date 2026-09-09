import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Folder, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [draft, setDraft] = useState(organization);
  const [query, setQuery] = useState(initialQuery);
  const [newGroup, setNewGroup] = useState("");
  const [error, setError] = useState("");
  const setPreference = (path: string, patch: Partial<RepositoryPreference>) =>
    setDraft((current) => ({
      ...current,
      repositories: {
        ...current.repositories,
        [getRepoPathKey(path)]: { ...repositoryPreference(current, path), ...patch },
      },
    }));
  const moveProject = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const projects = [...current.projects];
      const [project] = projects.splice(index, 1);
      if (project) projects.splice(index + direction, 0, project);
      return { ...current, projects };
    });
  const matchingPaths = paths.filter((path) =>
    `${path} ${repositoryPreference(draft, path).alias}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const names = draft.projects.map((project) => project.name.trim().toLocaleLowerCase());
  const validNames = names.every(Boolean) && new Set(names).size === names.length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="repository-organizer sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Organize repositories</DialogTitle>
          <DialogDescription>
            Group related projects and keep daily repositories pinned. Aliases only change names in
            Githead. Hidden repositories remain searchable.
          </DialogDescription>
        </DialogHeader>
        <div className="repository-organizer-body">
          <section aria-label="Project groups" className="grid gap-2">
            <h3 className="text-sm font-medium">Project groups</h3>
            {draft.projects.map((project, index) => (
              <div key={project.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Group name ${index + 1}`}
                  value={project.name}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      projects: current.projects.map((item) =>
                        item.id === project.id ? { ...item, name: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${project.name} up`}
                  disabled={index === 0}
                  onClick={() => moveProject(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Move ${project.name} down`}
                  disabled={index === draft.projects.length - 1}
                  onClick={() => moveProject(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Delete group ${project.name}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      projects: current.projects.filter((item) => item.id !== project.id),
                      repositories: Object.fromEntries(
                        Object.entries(current.repositories).map(([path, preference]) => [
                          path,
                          preference.projectId === project.id
                            ? { ...preference, projectId: "" }
                            : preference,
                        ]),
                      ),
                    }))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {!validNames ? (
              <p role="alert" className="text-sm text-destructive">
                Use a unique, non-empty name for each group.
              </p>
            ) : null}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = newGroup.trim();
                if (!name || names.includes(name.toLocaleLowerCase())) return;
                setDraft((current) => ({
                  ...current,
                  projects: [
                    ...current.projects,
                    { id: crypto.randomUUID(), name, collapsed: false },
                  ],
                }));
                setNewGroup("");
              }}
            >
              <Input
                aria-label="New group name"
                placeholder="New group name"
                maxLength={80}
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!newGroup.trim() || names.includes(newGroup.trim().toLocaleLowerCase())}
              >
                <Plus />
                Add group
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Deleting a group moves its repositories to Ungrouped.
            </p>
          </section>
          <section aria-label="Repository organization" className="grid gap-3">
            <Input
              type="search"
              aria-label="Find repository to organize"
              placeholder="Find repository…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {matchingPaths.map((path, index) => {
              const preference = repositoryPreference(draft, path);
              return (
                <div key={path} className="repository-organizer-row">
                  <p className="text-sm font-medium">{repositoryName(path)}</p>
                  <p className="break-all text-xs text-muted-foreground">{path}</p>
                  <div className="repository-organizer-fields">
                    <div className="grid gap-1">
                      <Label htmlFor={`${id}-alias-${index}`}>Display alias</Label>
                      <Input
                        id={`${id}-alias-${index}`}
                        placeholder={repositoryName(path)}
                        maxLength={120}
                        value={preference.alias}
                        onChange={(event) => setPreference(path, { alias: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${id}-project-${index}`}>Project group</Label>
                      <select
                        id={`${id}-project-${index}`}
                        className="repository-project-select"
                        value={preference.projectId}
                        onChange={(event) => setPreference(path, { projectId: event.target.value })}
                      >
                        <option value="">Ungrouped</option>
                        {draft.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-5 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preference.pinned}
                        onChange={(event) => setPreference(path, { pinned: event.target.checked })}
                      />
                      Pinned
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preference.hidden}
                        onChange={(event) => setPreference(path, { hidden: event.target.checked })}
                      />
                      Hidden
                    </label>
                  </div>
                </div>
              );
            })}
            {!matchingPaths.length ? (
              <p className="text-sm text-muted-foreground">No repositories match your search.</p>
            ) : null}
          </section>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!validNames}
            onClick={() => {
              if (onSave(draft)) onClose();
              else setError("Unable to save repository organization. Try again.");
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
