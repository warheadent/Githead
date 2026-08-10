import type { TagPushBehavior } from "../shared/types";

export interface ValidatedGitPushTarget {
  remoteName: string;
  refspec?: string;
  setUpstream?: boolean;
}

export interface GitPushCommandPhase {
  kind: "branch" | "tags";
  args: string[];
}

export interface GitPushCommandPlan {
  remoteName: string;
  tagPushBehavior: TagPushBehavior;
  phases: readonly GitPushCommandPhase[];
}

export type ValidatedGitPushRemoteName = { remoteName: string } | { error: string };

export function validateGitPushRemoteName(remoteName: string): ValidatedGitPushRemoteName {
  const trimmedRemoteName = remoteName.trim();
  if (!trimmedRemoteName) return { error: "Select a remote." };
  if (trimmedRemoteName.startsWith("-")) {
    return { error: "Push remote names cannot start with a dash." };
  }
  return { remoteName: trimmedRemoteName };
}

/**
 * Converts validated push policy into process commands. The renderer never
 * supplies this policy, and execution remains responsible for cancellation,
 * streaming, and failure classification.
 */
export function planGitPush(
  target: ValidatedGitPushTarget,
  tagPushBehavior: TagPushBehavior
): GitPushCommandPlan {
  const validatedRemote = validateGitPushRemoteName(target.remoteName);
  if ("error" in validatedRemote) throw new Error(validatedRemote.error);
  const { remoteName } = validatedRemote;
  const branchArgs = [
    "push",
    ...(tagPushBehavior === "follow" ? ["--follow-tags"] : []),
    ...(target.setUpstream ? ["--set-upstream"] : []),
    remoteName,
    ...(target.refspec ? [target.refspec] : [])
  ];
  const phases: GitPushCommandPhase[] = [{ kind: "branch", args: branchArgs }];

  if (tagPushBehavior === "all") {
    phases.push({
      kind: "tags",
      args: ["push", remoteName, "--tags"]
    });
  }

  return {
    remoteName,
    tagPushBehavior,
    phases
  };
}
