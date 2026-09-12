import type { GitDiffSide, GitStatusFile } from "../shared/types";
import { getFileStatusVisuals, type FileStatusTone } from "./fileStatusVisuals";

export type StatusFileFilter = "all" | FileStatusTone;

export function filterStatusFiles(
  files: GitStatusFile[],
  side: GitDiffSide,
  query: string,
  status: StatusFileFilter
): GitStatusFile[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search && status === "all") return files;
  return files.filter((file) => (
    (!search || file.path.toLocaleLowerCase().includes(search) || file.originalPath?.toLocaleLowerCase().includes(search)) &&
    (status === "all" || getFileStatusVisuals(file, side).tone === status)
  ));
}
