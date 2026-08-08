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

/**
 * Converts validated push policy into process commands. The renderer never
 * supplies this policy, and execution remains responsible for cancellation,
 * streaming, and failure classification.
 */
export function planGitPush(
  target: ValidatedGitPushTarget,
  tagPushBehavior: TagPushBehavior
): GitPushCommandPlan {
  const branchArgs = [
    "push",
    ...(tagPushBehavior === "follow" ? ["--follow-tags"] : []),
    ...(target.setUpstream ? ["--set-upstream"] : []),
    target.remoteName,
    ...(target.refspec ? [target.refspec] : [])
  ];
  const phases: GitPushCommandPhase[] = [{ kind: "branch", args: branchArgs }];

  if (tagPushBehavior === "all") {
    phases.push({
      kind: "tags",
      args: ["push", target.remoteName, "--tags"]
    });
  }

  return {
    remoteName: target.remoteName,
    tagPushBehavior,
    phases
  };
}
