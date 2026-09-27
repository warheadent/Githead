import type { GitStatusFile } from "./types";

export function canStageStatusFile(file: GitStatusFile): boolean {
  return file.submodule?.canStage !== false;
}
