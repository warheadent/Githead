// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadPullRequestDraft, removePullRequestDraft, savePullRequestDraft } from "./pullRequestDraft";

const draft = { title: "Fix", body: "Notes", baseBranch: "main", draft: true, templateId: "template", undoBody: "Before", outcomeUnknown: false, applyDefaultTemplate: false };
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe("pull request drafts", () => {
  it("isolates drafts by repository and branch and removes only the completed draft", () => {
    savePullRequestDraft("/one", "feature", draft);
    savePullRequestDraft("/two", "feature", { ...draft, body: "Other" });
    savePullRequestDraft("/one", "other", { ...draft, body: "Another branch" });
    expect(loadPullRequestDraft("/one", "feature")).toEqual(draft);
    removePullRequestDraft("/one", "feature");
    expect(loadPullRequestDraft("/one", "feature")).toBeNull();
    expect(loadPullRequestDraft("/two", "feature")?.body).toBe("Other");
    expect(loadPullRequestDraft("/one", "other")?.body).toBe("Another branch");
  });

  it("reports unavailable storage without breaking editing or successful creation", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
    expect(savePullRequestDraft("/repo", "feature", draft)).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Disabled"); });
    expect(loadPullRequestDraft("/repo", "feature")).toBeNull();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Disabled"); });
    expect(() => removePullRequestDraft("/repo", "feature")).not.toThrow();
  });

  it("ignores corrupt or oversized drafts", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    for (const raw of ["{", "null", "[]", JSON.stringify({ ...draft, body: 42 }), " ".repeat(500_001)]) {
      get.mockReturnValue(raw);
      expect(loadPullRequestDraft("/repo", "feature")).toBeNull();
    }
  });
});
