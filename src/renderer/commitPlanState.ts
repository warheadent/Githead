import type { CommitPlan, CommitPlanChange } from "../shared/types";

function identity(change: CommitPlanChange): string {
  return `${change.path}\0${change.kind}\0${change.fingerprint}`;
}

/** Keep user edits attached only to changes whose content still matches. */
export function reconcileCommitPlan(plan: CommitPlan, currentChanges: CommitPlanChange[]): CommitPlan {
  const previous = new Map(plan.changes.map((change) => [identity(change), change]));
  const changes = currentChanges.map((change) => {
    const match = previous.get(identity(change));
    return match
      ? { ...change, id: match.id, contextIncomplete: Boolean(match.contextIncomplete || change.contextIncomplete) }
      : { ...change, id: `change-${change.fingerprint}`, contextIncomplete: Boolean(change.contextIncomplete) };
  });
  const available = new Set(changes.map((change) => change.id));
  const groups = plan.groups.map((group) => ({
    ...group,
    changeIds: group.changeIds.filter((id) => available.has(id)),
    needsReview: Boolean(group.needsReview) || group.changeIds.some((id) => !available.has(id))
  }));
  const assigned = new Set(groups.flatMap((group) => group.changeIds));
  return { ...plan, changes, groups, unassignedChangeIds: changes.filter((change) => !assigned.has(change.id)).map((change) => change.id) };
}

export function removeCommittedChanges(plan: CommitPlan, committed: Set<string>): CommitPlan {
  return {
    ...plan,
    changes: plan.changes.filter((change) => !committed.has(change.id)),
    groups: plan.groups.flatMap((group) => {
      const changeIds = group.changeIds.filter((id) => !committed.has(id));
      return changeIds.length === 0 && group.changeIds.length > 0 ? [] : [{ ...group, changeIds }];
    }),
    unassignedChangeIds: plan.unassignedChangeIds.filter((id) => !committed.has(id))
  };
}
