import type { GitFileDiff, GitImageSide, GitImageVersion } from "../shared/types";

export function areFileDiffsEqual(left: GitFileDiff, right: GitFileDiff): boolean {
  if (
    left.path !== right.path ||
    left.side !== right.side ||
    left.kind !== right.kind
  ) {
    return false;
  }

  if (left.kind === "image" && right.kind === "image") {
    return areImageSidesEqual(left.before, right.before) && areImageSidesEqual(left.after, right.after);
  }

  if (left.kind === "text" && right.kind === "text") {
    return left.text === right.text && Boolean(left.truncated) === Boolean(right.truncated);
  }

  return left.kind !== "image" && right.kind !== "image" && left.text === right.text;
}

function areImageSidesEqual(left: GitImageSide, right: GitImageSide): boolean {
  if (left.status !== right.status) return false;
  if (left.status === "available" && right.status === "available") {
    return areImageVersionsEqual(left.version, right.version);
  }
  if ((left.status === "lfs-missing" || left.status === "lfs-corrupt") && (right.status === "lfs-missing" || right.status === "lfs-corrupt")) {
    return left.byteLength === right.byteLength && left.fetchable === right.fetchable;
  }
  if (left.status === "unavailable" && right.status === "unavailable") return left.reason === right.reason && left.message === right.message;
  return left.status === "absent" && right.status === "absent";
}

function areImageVersionsEqual(left: GitImageVersion, right: GitImageVersion): boolean {
  if (
    left.mimeType !== right.mimeType ||
    left.byteLength !== right.byteLength ||
    left.data.byteLength !== right.data.byteLength
  ) {
    return false;
  }

  for (let index = 0; index < left.data.byteLength; index += 1) {
    if (left.data[index] !== right.data[index]) return false;
  }
  return true;
}
