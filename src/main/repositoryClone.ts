import { isLoreSource } from "../shared/repositorySource";
import path from "node:path";
import type { GitAddRemoteRequest, GitCloneRequest, GitOperationResult } from "../shared/types";
import { validateCloneRequest } from "./cloneValidation";
import type { GitHubRepositoryDiscoveryService } from "./githubRepositoryDiscovery";

interface CloneService { cloneRepository(request: GitCloneRequest): Promise<GitOperationResult> }

export async function cloneRepositoryWithSource(
  request: GitCloneRequest,
  signal: AbortSignal,
  services: {
    git: CloneService & { addRemote(request: GitAddRemoteRequest): Promise<GitOperationResult> };
    lore: CloneService;
    github: Pick<GitHubRepositoryDiscoveryService, "fork">;
    rememberParent(parentPath: string): Promise<void>;
  }
): Promise<GitOperationResult> {
  let forkUrl = "";
  let clonedPath = "";
  try {
    signal.throwIfAborted();
    const lore = isLoreSource(request.source);
    if (request.fork && lore) throw new Error("Lore repositories cannot be forked on GitHub.");
    if (request.fork) {
      // Validate before creating anything remotely; Git validates again after the
      // fork is ready, since another process may have occupied the destination.
      const validation = await validateCloneRequest(request);
      if ("error" in validation) return { repoPath: request.parentPath, exitCode: -1, stdout: "", stderr: validation.error };
      const fork = await services.github.fork(request.source, request.branchName ?? "", signal);
      forkUrl = fork.webUrl;
    }
    signal.throwIfAborted();
    const result = await (lore ? services.lore : services.git).cloneRepository({
      ...request, source: forkUrl ? `${forkUrl}.git` : request.source
    });
    if (result.exitCode !== 0) return {
      ...result,
      stderr: `${result.stderr}${forkUrl ? `\nYour fork remains at ${forkUrl}. Paste its URL to retry cloning.` : ""}`
    };
    clonedPath = result.repoPath;
    if (forkUrl) {
      signal.throwIfAborted();
      const upstream = await services.git.addRemote({ repoPath: result.repoPath, name: "upstream", url: request.source.trim() });
      if (upstream.exitCode !== 0) return { ...upstream, stderr: `Clone saved at ${result.repoPath}, but adding upstream failed: ${upstream.stderr} Open this folder and add upstream ${request.source.trim()} in repository settings.` };
    }
    try { await services.rememberParent(path.normalize(request.parentPath.trim())); }
    catch { return { ...result, stderr: `${result.stderr}\nCloned successfully, but the destination preference could not be saved.`.trim() }; }
    return result;
  } catch (error) {
    return { repoPath: clonedPath || request.parentPath, exitCode: -1, stdout: "",
      stderr: `${error instanceof Error ? error.message : "Unable to clone repository."}${clonedPath ? ` Clone saved at ${clonedPath}; open it locally and check its remotes before retrying.` : forkUrl ? ` Your fork remains at ${forkUrl}.` : ""}` };
  }
}
