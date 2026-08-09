// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { gitCapabilities, type GitCommitGraphRow, type GitRemoteConfig } from "../shared/types";
import { BranchManagementDialog } from "./BranchManagementDialog";
import { PushToBranchDialog, type PushToBranchDialogState } from "./PushToBranchDialog";
import { RemoteManagementDialog } from "./RemoteManagementDialog";
import { RepositoryActionsDialog } from "./RepositoryActionsDialog";
import { SettingsDialog, type SettingsDraft } from "./SettingsDialog";
import { TagDialog, type TagDialogState } from "./TagDialog";

afterEach(cleanup);

const settingsDraft: SettingsDraft = {
  selectedProvider: "openrouter",
  commitPlanGranularity: "file",
  providerModels: { openrouter: "", openai: "", "codex-cli": "", anthropic: "", "claude-code": "" },
  commitPlanModels: { openrouter: "", openai: "", "codex-cli": "", anthropic: "", "claude-code": "" },
  commitPlanReasoningEfforts: { openrouter: "medium", openai: "medium", "codex-cli": "medium", anthropic: "medium", "claude-code": "medium" },
  prDescriptionModels: { openrouter: "", openai: "", "codex-cli": "", anthropic: "", "claude-code": "" },
  reasoningEfforts: { openrouter: "medium", openai: "medium", "codex-cli": "medium", anthropic: "medium", "claude-code": "medium" },
  prDescriptionReasoningEfforts: { openrouter: "medium", openai: "medium", "codex-cli": "medium", anthropic: "medium", "claude-code": "medium" },
  apiKeys: {},
  clearApiKeys: {},
  commitMessagePrompt: "Write a commit message.",
  prDescriptionPrompt: "Write a pull request description.",
  sourceControlWritingStyle: { mode: "conventional_commits", customInstructions: "" },
  autoFetchIntervalMinutes: "10",
  colorTheme: "githead",
  appearanceMode: "system",
  uiFont: "inter",
  codeFont: "system-mono",
  zoomFactor: 1,
  tagPushBehavior: "all",
  requireUpToDateUpstreamBeforeCommit: false,
  remoteCheckLeaseSeconds: 120,
  allowCherryPickingContainedCommits: false,
  gitIdentityName: "Test User",
  gitIdentityEmail: "test@example.com",
  gitIdentityScope: "repository"
};

const tagState: TagDialogState = {
  open: true,
  hash: "0123456789abcdef",
  tab: "add",
  tagName: "v1.0.0",
  message: "Release",
  lightweight: false,
  force: false,
  pushRemote: null,
  deleteTagName: "v1.0.0",
  deletePushRemote: null,
  deleteConfirmed: true,
  error: ""
};

const taggedCommit: GitCommitGraphRow = {
  hash: tagState.hash,
  shortHash: "0123456",
  parents: [],
  refs: [{ name: "v1.0.0", kind: "tag" }],
  subject: "Release commit",
  authorName: "Test User",
  authorEmail: "test@example.com",
  authorDate: "2026-07-26T00:00:00.000Z",
  relativeDate: "now"
};

const remote: GitRemoteConfig = {
  name: "origin",
  fetchUrls: ["https://example.com/repo.git"],
  pushUrls: [],
  trackedBranches: []
};

describe("coordinated operation dialog cancellation", () => {
  it("keeps Settings cancellation available while save controls remain disabled", () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    render(<SettingsDialog open draft={settingsDraft} aiSettings={null} saving error="" onOpenChange={onOpenChange} onDraftChange={vi.fn()} onSave={onSave} onOpenPerformanceDiagnostics={vi.fn()} />, { wrapper: TooltipProvider });

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const save = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    fireEvent.submit(save.closest("form")!);
    fireEvent.click(cancel);

    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps Repository Actions cancellation available while a file save is active", () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    render(<RepositoryActionsDialog open summary={null} draft={{ shared: [], local: [] }} savingTarget="shared" error="" onOpenChange={onOpenChange} onDraftChange={vi.fn()} onAddAction={vi.fn()} onDeleteAction={vi.fn()} onRestoreAction={vi.fn()} onMoveAction={vi.fn()} onSave={onSave} />, { wrapper: TooltipProvider });

    const cancel = screen.getByRole("button", { name: "Cancel save" }) as HTMLButtonElement;
    const save = screen.getByRole("button", { name: "Saving" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    fireEvent.click(cancel);

    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    { tab: "add" as const, mutationName: "Creating…" },
    { tab: "remove" as const, mutationName: "Removing…" }
  ])("keeps Tag $tab cancellation available while its mutation is disabled", ({ tab, mutationName }) => {
    const onOpenChange = vi.fn();
    const onCreate = vi.fn();
    const onDelete = vi.fn();
    render(<TagDialog state={{ ...tagState, tab }} commit={taggedCommit} remotes={["origin"]} saving onOpenChange={onOpenChange} onStateChange={vi.fn()} onCreate={onCreate} onDelete={onDelete} />, { wrapper: TooltipProvider });

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const mutation = screen.getByRole("button", { name: mutationName }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(mutation.disabled).toBe(true);
    fireEvent.click(mutation);
    fireEvent.submit(mutation.closest("form")!);
    fireEvent.click(cancel);

    expect(onCreate).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps push cancellation available while preventing a second push", () => {
    const onOpenChange = vi.fn();
    const onPush = vi.fn();
    const state: PushToBranchDialogState = {
      open: true,
      sourceBranch: "main",
      remoteName: "origin",
      destinationMode: "existing",
      destinationBranch: "release",
      newBranchName: "",
      error: ""
    };
    render(<PushToBranchDialog state={state} remotes={["origin"]} remoteBranches={[{ name: "origin/release", remote: "origin", branch: "release" }]} currentUpstream="origin/main" saving onOpenChange={onOpenChange} onStateChange={vi.fn()} onPush={onPush} />, { wrapper: TooltipProvider });

    const cancel = screen.getByRole("button", { name: "Cancel push" }) as HTMLButtonElement;
    const push = screen.getByRole("button", { name: "Pushing" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(push.disabled).toBe(true);
    fireEvent.click(push);
    fireEvent.submit(push.closest("form")!);
    fireEvent.click(cancel);

    expect(onPush).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps Remote removal cancellation available while the destructive submit is disabled", async () => {
    const onOpenChange = vi.fn();
    const onRemove = vi.fn().mockResolvedValue(null);
    const onRefreshRemote = vi.fn().mockResolvedValue(remote);
    const renderDialog = (busy: boolean) => <RemoteManagementDialog open repoPath="C:\\repo" remotes={[remote]} loading={false} busy={busy} loadError="" hasGitHubOrigin={false} onOpenChange={onOpenChange} onReload={vi.fn()} onRefreshRemote={onRefreshRemote} onAdd={vi.fn()} onRename={vi.fn()} onSetUrl={vi.fn()} onRemove={onRemove} />;
    const view = render(renderDialog(false), { wrapper: TooltipProvider });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByText("Remove origin?");
    view.rerender(renderDialog(true));

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const remove = screen.getByRole("button", { name: "Remove Remote" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    fireEvent.submit(remove.closest("form")!);
    fireEvent.click(cancel);

    expect(onRemove).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps Branch removal cancellation available while the destructive submit is disabled", () => {
    const onOpenChange = vi.fn();
    const onRemove = vi.fn().mockResolvedValue(null);
    const renderDialog = (busy: boolean) => <BranchManagementDialog open repoPath="C:\\repo" kind="git" capabilities={gitCapabilities()} branches={[{ name: "main", current: true, upstream: "origin/main" }, { name: "feature", current: false, upstream: null }]} busy={busy} onOpenChange={onOpenChange} onRename={vi.fn()} onRemove={onRemove} />;
    const view = render(renderDialog(false), { wrapper: TooltipProvider });

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));
    view.rerender(renderDialog(true));

    const cancel = screen.getByRole("button", { name: "Cancel operation" }) as HTMLButtonElement;
    const remove = screen.getByRole("button", { name: "Delete Branch" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    fireEvent.submit(remove.closest("form")!);
    fireEvent.click(cancel);

    expect(onRemove).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
