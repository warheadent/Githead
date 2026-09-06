import { MAX_COMMIT_PLAN_CHANGES, MAX_COMMIT_PLAN_GROUPS } from "../shared/commitPlanLimits";
import type { CommitPlan, CommitPlanChange, CommitPlanGroup } from "../shared/types";

export interface CommitPlanDraft {
  plan: CommitPlan | null;
  includedChangeIds: string[];
  excludedPaths: string[];
}

const MAX_DRAFT_CHARS = 2_000_000;

export function commitPlanDraftKey(repoPath: string): string {
  return `githead:commit-plan:v1:${repoPath}`;
}

export function loadCommitPlanDraft(repoPath: string): CommitPlanDraft | null {
  try {
    const raw = window.localStorage.getItem(commitPlanDraftKey(repoPath));
    if (!raw || raw.length > MAX_DRAFT_CHARS) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !stringList(value.includedChangeIds, MAX_COMMIT_PLAN_CHANGES) || !stringList(value.excludedPaths, MAX_DRAFT_CHARS)) return null;
    if (value.plan !== null && !isPlan(value.plan)) return null;
    return { plan: value.plan, includedChangeIds: value.includedChangeIds, excludedPaths: value.excludedPaths };
  } catch {
    return null;
  }
}

export function saveCommitPlanDraft(repoPath: string, draft: CommitPlanDraft): boolean {
  try {
    const raw = JSON.stringify({ version: 1, ...draft });
    if (raw.length > MAX_DRAFT_CHARS) return false;
    window.localStorage.setItem(commitPlanDraftKey(repoPath), raw);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringList(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every((item) => typeof item === "string");
}

function isChange(value: unknown): value is CommitPlanChange {
  return isRecord(value) && typeof value.id === "string" && typeof value.path === "string"
    && (value.kind === "file" || value.kind === "hunk") && typeof value.label === "string"
    && typeof value.fingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.fingerprint)
    && (value.contextIncomplete === undefined || typeof value.contextIncomplete === "boolean");
}

function isGroup(value: unknown): value is CommitPlanGroup {
  return isRecord(value) && typeof value.id === "string" && typeof value.message === "string"
    && typeof value.rationale === "string" && stringList(value.changeIds, MAX_COMMIT_PLAN_CHANGES)
    && (value.needsReview === undefined || typeof value.needsReview === "boolean");
}

function isPlan(value: unknown): value is CommitPlan {
  if (!isRecord(value) || (value.granularity !== "file" && value.granularity !== "hunk")
    || !Array.isArray(value.changes) || value.changes.length > MAX_COMMIT_PLAN_CHANGES || !value.changes.every(isChange)
    || !Array.isArray(value.groups) || value.groups.length > MAX_COMMIT_PLAN_GROUPS || !value.groups.every(isGroup)
    || !stringList(value.unassignedChangeIds, MAX_COMMIT_PLAN_CHANGES)) return false;
  const ids = new Set(value.changes.map((change) => change.id));
  const assigned = value.groups.flatMap((group) => group.changeIds);
  return ids.size === value.changes.length && new Set(value.groups.map((group) => group.id)).size === value.groups.length
    && new Set(assigned).size === assigned.length && assigned.every((id) => ids.has(id))
    && value.unassignedChangeIds.every((id) => ids.has(id) && !assigned.includes(id));
}
