import fs from "node:fs/promises";
import path from "node:path";
import type { CloneDestinationStatus, GitCloneRequest } from "../shared/types";
import { getStats } from "./fileOperationService";

export interface ValidCloneRequest {
  source: string;
  parentPath: string;
  directoryName: string;
  destinationPath: string;
  branchName: string | null;
  depth: number | null;
}

export async function validateCloneRequest(request: GitCloneRequest): Promise<ValidCloneRequest | { error: string }> {
  const source = request.source.trim();
  if (!source) {
    return {
      error: "Enter a repository URL or path."
    };
  }

  const destination = await inspectCloneDestination(request, false);
  if (destination.error) return { error: destination.error };
  const parentPath = path.normalize(request.parentPath.trim());
  const directoryName = request.directoryName.trim();
  const destinationPath = destination.path;
  if (destination.exists) {
    const destinationStats = await getStats(destinationPath);
    if (!destinationStats?.isDirectory()) return { error: "Destination path already exists and is not a folder." };
    if ((await fs.readdir(destinationPath)).length > 0) return { error: "Destination folder already exists and is not empty." };
  }

  const branchName = request.branchName?.trim() ?? "";
  if (branchName.startsWith("-")) return { error: "Branch name cannot start with a dash." };
  const requestedDepth = request.depth ?? null;
  if (requestedDepth !== null && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
    return { error: "Clone depth must be 0 or a positive whole number." };
  }
  return { source, parentPath, directoryName, destinationPath, branchName: branchName || null,
    depth: requestedDepth && requestedDepth > 0 ? requestedDepth : null };
}

export async function inspectCloneDestination(request: Pick<GitCloneRequest, "parentPath" | "directoryName">, suggestAlternative = true): Promise<CloneDestinationStatus> {
  const invalid = (error: string): CloneDestinationStatus => ({ path: "", exists: false, suggestedName: null, error });
  const parentPath = path.normalize(request.parentPath.trim());
  if (!parentPath || !path.isAbsolute(parentPath)) {
    return invalid("Select an absolute destination folder.");
  }

  const parentStats = await getStats(parentPath);
  if (!parentStats?.isDirectory()) {
    return invalid("Destination folder does not exist.");
  }

  const directoryName = request.directoryName.trim();
  if (!directoryName) {
    return invalid("Enter a destination folder name.");
  }

  if (
    path.isAbsolute(directoryName) ||
    directoryName === "." ||
    directoryName === ".." ||
    directoryName.includes("/") ||
    directoryName.includes("\\") ||
    path.normalize(directoryName) !== directoryName
  ) {
    return invalid("Destination folder name cannot include a path.");
  }
  if (Array.from(directoryName).some((character) => character.charCodeAt(0) < 32) || (process.platform === "win32" && (
    /[<>:"|?*]/.test(directoryName) || /[. ]$/.test(directoryName) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(directoryName)
  ))) return invalid("Enter a valid destination folder name.");

  const destinationPath = path.resolve(parentPath, directoryName);
  const relativeDestination = path.relative(parentPath, destinationPath);
  if (!relativeDestination || relativeDestination.startsWith("..") || path.isAbsolute(relativeDestination)) {
    return invalid("Destination folder must stay inside the selected folder.");
  }

  const exists = await pathExists(destinationPath);
  let suggestedName: string | null = null;
  if (exists && suggestAlternative) {
    for (let suffix = 2; suffix <= 1000; suffix++) {
      if (!await pathExists(path.join(parentPath, `${directoryName}-${suffix}`))) {
        suggestedName = `${directoryName}-${suffix}`;
        break;
      }
    }
  }
  return { path: destinationPath, exists, suggestedName, error: null };
}

async function pathExists(filePath: string): Promise<boolean> {
  try { await fs.lstat(filePath); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
