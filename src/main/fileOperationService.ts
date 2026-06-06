import fs from "node:fs/promises";
import path from "node:path";
import type {
  FileSystemPathListRequest,
  FileSystemPathRequest,
  GitOperationResult
} from "../shared/types";

type TrashItem = (absolutePath: string) => Promise<void>;
type OpenPath = (absolutePath: string) => Promise<string>;

export function resolveRepoFilePath(request: FileSystemPathRequest):
  | { repoRoot: string; absolutePath: string }
  | { error: string } {
  if (!request.repoPath.trim()) {
    return {
      error: "Select a repository folder."
    };
  }

  if (!request.path.trim()) {
    return {
      error: "Select a file."
    };
  }

  if (path.isAbsolute(request.path)) {
    return {
      error: "File path must be relative to the repository."
    };
  }

  const repoRoot = path.resolve(request.repoPath);
  const absolutePath = path.resolve(repoRoot, request.path);
  const relativePath = path.relative(repoRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      error: "File path must stay inside the repository."
    };
  }

  return {
    repoRoot,
    absolutePath
  };
}

export async function deleteFiles(
  request: FileSystemPathListRequest,
  trashItem: TrashItem
): Promise<GitOperationResult> {
  const paths = sanitizePathList(request.paths);
  if (paths.length === 0) {
    return createOperationFailure(request.repoPath, "Select at least one file to delete.");
  }

  const resolvedPaths: string[] = [];
  for (const filePath of paths) {
    const resolved = resolveRepoFilePath({
      repoPath: request.repoPath,
      path: filePath
    });
    if ("error" in resolved) {
      return createOperationFailure(request.repoPath, resolved.error);
    }

    const stats = await getStats(resolved.absolutePath);
    if (!stats) {
      return createOperationFailure(request.repoPath, "File does not exist.");
    }

    resolvedPaths.push(resolved.absolutePath);
  }

  for (const absolutePath of resolvedPaths) {
    await trashItem(absolutePath);
  }

  return createOperationSuccess(
    request.repoPath,
    resolvedPaths.length === 1 ? "File moved to Recycle Bin." : `${resolvedPaths.length} files moved to Recycle Bin.`
  );
}

export async function showRepositoryInExplorer(
  repoPath: string,
  openPath: OpenPath
): Promise<GitOperationResult> {
  if (!repoPath.trim()) {
    return createOperationFailure(repoPath, "Select a repository folder.");
  }

  const resolvedRepoPath = path.resolve(repoPath);
  const stats = await getStats(resolvedRepoPath);
  if (!stats) {
    return createOperationFailure(repoPath, "Repository folder does not exist.");
  }

  if (!stats.isDirectory()) {
    return createOperationFailure(repoPath, "Repository path must be a folder.");
  }

  const error = await openPath(resolvedRepoPath);
  if (error) {
    return createOperationFailure(repoPath, error);
  }

  return createOperationSuccess(repoPath, "Shown in Explorer.");
}

export async function getStats(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function sanitizePathList(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
}

function createOperationSuccess(repoPath: string, stdout: string): GitOperationResult {
  return {
    repoPath,
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function createOperationFailure(repoPath: string, stderr: string): GitOperationResult {
  return {
    repoPath,
    exitCode: -1,
    stdout: "",
    stderr
  };
}
