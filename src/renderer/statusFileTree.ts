import type { GitStatusFile } from "../shared/types";

export interface StatusFileTreeFolder {
  kind: "folder";
  id: string;
  name: string;
  folders: StatusFileTreeFolder[];
  files: GitStatusFile[];
  descendantFiles: GitStatusFile[];
}

export type StatusFileTreeRow =
  | { kind: "folder"; folder: StatusFileTreeFolder; level: number; position: number; setSize: number }
  | { kind: "file"; file: GitStatusFile; level: number; position: number; setSize: number };

export function buildStatusFileTree(files: GitStatusFile[]): StatusFileTreeFolder {
  const root: StatusFileTreeFolder = { kind: "folder", id: "", name: "", folders: [], files: [], descendantFiles: [] };
  const folders = new Map<string, StatusFileTreeFolder>([["", root]]);

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let parent = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const id = parts.slice(0, index + 1).join("/");
      let folder = folders.get(id);
      if (!folder) {
        folder = { kind: "folder", id, name: parts[index]!, folders: [], files: [], descendantFiles: [] };
        folders.set(id, folder);
        parent.folders.push(folder);
      }
      parent = folder;
    }
    parent.files.push(file);
  }

  populateAndSort(root);
  return root;
}

export function flattenStatusFileTree(
  root: StatusFileTreeFolder,
  collapsedFolders: ReadonlySet<string>
): StatusFileTreeRow[] {
  const rows: StatusFileTreeRow[] = [];
  appendVisibleRows(root, 1, collapsedFolders, rows);
  return rows;
}

function appendVisibleRows(
  folder: StatusFileTreeFolder,
  level: number,
  collapsedFolders: ReadonlySet<string>,
  rows: StatusFileTreeRow[]
): void {
  const setSize = folder.folders.length + folder.files.length;
  for (const [index, child] of folder.folders.entries()) {
    rows.push({ kind: "folder", folder: child, level, position: index + 1, setSize });
    if (!collapsedFolders.has(child.id)) {
      appendVisibleRows(child, level + 1, collapsedFolders, rows);
    }
  }

  for (const [index, file] of folder.files.entries()) {
    rows.push({ kind: "file", file, level, position: folder.folders.length + index + 1, setSize });
  }
}

function populateAndSort(folder: StatusFileTreeFolder): GitStatusFile[] {
  folder.folders.sort((left, right) => left.name.localeCompare(right.name));
  folder.files.sort((left, right) => fileName(left.path).localeCompare(fileName(right.path)));
  folder.descendantFiles = [
    ...folder.files,
    ...folder.folders.flatMap(populateAndSort)
  ];
  return folder.descendantFiles;
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
