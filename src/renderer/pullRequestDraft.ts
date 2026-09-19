export interface PullRequestDraft {
  title: string;
  body: string;
  baseBranch: string;
  draft: boolean;
  templateId: string;
  undoBody: string | null;
  outcomeUnknown: boolean;
  applyDefaultTemplate: boolean;
}

function key(repoPath: string, branch: string): string {
  return `githead:pull-request:v1:${JSON.stringify([repoPath, branch])}`;
}

export function loadPullRequestDraft(repoPath: string, branch: string): PullRequestDraft | null {
  try {
    const raw = window.localStorage.getItem(key(repoPath, branch));
    if (!raw || raw.length > 500_000) return null;
    const value = JSON.parse(raw) as Partial<PullRequestDraft> | null;
    if (!value || typeof value.title !== "string" || typeof value.body !== "string"
      || typeof value.baseBranch !== "string" || typeof value.draft !== "boolean"
      || typeof value.templateId !== "string" || typeof value.outcomeUnknown !== "boolean" || typeof value.applyDefaultTemplate !== "boolean"
      || (value.undoBody !== null && typeof value.undoBody !== "string")) return null;
    return { title: value.title, body: value.body, baseBranch: value.baseBranch, draft: value.draft, templateId: value.templateId, undoBody: value.undoBody, outcomeUnknown: value.outcomeUnknown, applyDefaultTemplate: value.applyDefaultTemplate };
  } catch {
    return null;
  }
}

export function savePullRequestDraft(repoPath: string, branch: string, draft: PullRequestDraft): boolean {
  try {
    // Only content is persisted, never loading or in-flight mutation state.
    const { title, body, baseBranch, templateId, undoBody } = draft;
    const raw = JSON.stringify({ title, body, baseBranch, templateId, undoBody, draft: draft.draft, outcomeUnknown: draft.outcomeUnknown, applyDefaultTemplate: draft.applyDefaultTemplate });
    if (raw.length > 500_000) return false;
    window.localStorage.setItem(key(repoPath, branch), raw);
    return true;
  } catch {
    return false;
  }
}

export function removePullRequestDraft(repoPath: string, branch: string): void {
  try {
    window.localStorage.removeItem(key(repoPath, branch));
  } catch {
    // A storage failure must not turn a confirmed PR creation into a failed mutation.
  }
}
