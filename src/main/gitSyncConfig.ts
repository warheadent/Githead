import type { ProcessRunner } from "./processRunner";

/** Honor Git's configured policy; retain Githead defaults only when no policy is set. */
export async function gitSyncArgs(
  runner: ProcessRunner,
  repoPath: string,
  action: "fetch" | "pull",
  branchName?: string,
  remoteName?: string
): Promise<string[]> {
  const result = await runner.run("git", [
    "-C", repoPath, "config", "--null", "--get-regexp", "^(pull\\.(ff|rebase)|branch\\..*\\.rebase|fetch\\.prune)$"
  ]);
  if (result.exitCode !== 0 && !(result.exitCode === 1 && !result.stderr && !result.error)) {
    throw new Error(result.stderr.trim() || result.error || "Unable to read Git sync settings.");
  }
  const keys = new Set(result.stdout.split("\0").filter(Boolean).map((entry) => entry.split("\n")[0]));
  if (action === "fetch") {
    // A config default lets each remote's prune setting retain precedence.
    return [...(keys.has("fetch.prune") ? [] : ["-c", "fetch.prune=true"]), "fetch", ...(remoteName ? [remoteName] : ["--all"])];
  }
  const configured = keys.has("pull.ff") || keys.has("pull.rebase") || Boolean(branchName && keys.has(`branch.${branchName}.rebase`));
  return ["pull", ...(configured ? ["--no-edit"] : ["--ff-only"])];
}
