import fs from "node:fs/promises";
import path from "node:path";
import type { GitCloneRequest } from "../shared/types";
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

  const parentPath = path.normalize(request.parentPath.trim());
  if (!parentPath || !path.isAbsolute(parentPath)) {
    return {
      error: "Select an absolute destination folder."
    };
  }

  const parentStats = await getStats(parentPath);
  if (!parentStats?.isDirectory()) {
    return {
      error: "Destination folder does not exist."
    };
  }

  const directoryName = request.directoryName.trim();
  if (!directoryName) {
    return {
      error: "Enter a destination folder name."
    };
  }

  if (
    path.isAbsolute(directoryName) ||
    directoryName === "." ||
    directoryName === ".." ||
    directoryName.includes("/") ||
    directoryName.includes("\\") ||
    path.normalize(directoryName) !== directoryName
  ) {
    return {
      error: "Destination folder name cannot include a path."
    };
  }

  const destinationPath = path.resolve(parentPath, directoryName);
  const relativeDestination = path.relative(parentPath, destinationPath);
  if (!relativeDestination || relativeDestination.startsWith("..") || path.isAbsolute(relativeDestination)) {
    return {
      error: "Destination folder must stay inside the selected folder."
    };
  }

  const destinationStats = await getStats(destinationPath);
  if (destinationStats) {
    if (!destinationStats.isDirectory()) {
      return {
        error: "Destination path already exists and is not a folder."
      };
    }

    const entries = await fs.readdir(destinationPath);
    if (entries.length > 0) {
      return {
        error: "Destination folder already exists and is not empty."
      };
    }
  }

  const branchName = request.branchName?.trim() ?? "";
  if (branchName.startsWith("-")) {
    return {
      error: "Branch name cannot start with a dash."
    };
  }

  const requestedDepth = request.depth ?? null;
  if (requestedDepth !== null && (!Number.isInteger(requestedDepth) || requestedDepth < 0)) {
    return {
      error: "Clone depth must be 0 or a positive whole number."
    };
  }
  const depth = requestedDepth && requestedDepth > 0 ? requestedDepth : null;

  return {
    source,
    parentPath,
    directoryName,
    destinationPath,
    branchName: branchName || null,
    depth
  };
}
