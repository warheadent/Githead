import type { GitDiffSide, GitStatusFile } from "../shared/types";

export type FileStatusTone =
  | "added"
  | "untracked"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "conflict"
  | "neutral";

export interface FileStatusVisuals {
  code: string;
  tone: FileStatusTone;
  label: string;
}

const STATUS_LABELS: Record<FileStatusTone, string> = {
  added: "Added file",
  untracked: "Untracked file",
  modified: "Modified file",
  deleted: "Deleted file",
  renamed: "Renamed file",
  copied: "Copied file",
  conflict: "Conflicted file",
  neutral: "Changed file"
};

export function getStatusTone(status: string, isConflicted = false): FileStatusTone {
  const trimmed = status.trim();
  const upper = trimmed.toLocaleUpperCase();
  if (isConflicted || (/^[A-Z?]{1,2}$/.test(upper) && upper.includes("U"))) {
    return "conflict";
  }

  switch (normalizeStatusCode(trimmed)) {
    case "A":
      return "added";
    case "?":
      return "untracked";
    case "M":
    case "T":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "neutral";
  }
}

export function getStatusLabel(tone: FileStatusTone): string {
  return STATUS_LABELS[tone];
}

export function getFileStatusVisuals(file: GitStatusFile, side: GitDiffSide): FileStatusVisuals {
  if (file.submodule) {
    const details = [
      file.submodule.commitChanged ? "recorded commit changed" : "",
      file.submodule.trackedChanges ? "contains modified files" : "",
      file.submodule.untrackedChanges ? "contains untracked files" : "",
      !file.submodule.initialized ? "not initialized" : ""
    ].filter(Boolean).join(", ");
    return { code: "SM", tone: file.isConflicted ? "conflict" : "modified", label: `Submodule${details ? `: ${details}` : ""}` };
  }
  const code = getFileStatusCode(file, side);
  const tone = getStatusTone(code, file.isConflicted);

  return {
    code,
    tone,
    label: getStatusLabel(tone)
  };
}

export function getCommitFileStatusVisuals(status: string): FileStatusVisuals {
  const code = normalizeCommitStatus(status);
  const tone = getStatusTone(code);

  return {
    code,
    tone,
    label: getStatusLabel(tone)
  };
}

export function getFileStatusCode(file: GitStatusFile, side: GitDiffSide): string {
  if (file.isConflicted) {
    return "UU";
  }

  return side === "staged" ? file.indexStatus : file.worktreeStatus === "?" ? "?" : file.worktreeStatus;
}

function normalizeCommitStatus(status: string): string {
  const trimmed = status.trim();
  const lower = trimmed.toLocaleLowerCase();

  switch (lower) {
    case "added":
      return "A";
    case "untracked":
      return "?";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "typechanged":
    case "type-changed":
      return "T";
    default:
      return trimmed;
  }
}

function normalizeStatusCode(status: string): string {
  const upper = status.toLocaleUpperCase();
  if (/^[A-Z?]$/.test(upper)) {
    return upper;
  }
  if (/^[RC]\d+/.test(upper)) {
    return upper.charAt(0);
  }
  return upper;
}
