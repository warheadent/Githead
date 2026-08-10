// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsDialog, type SettingsDraft } from "./SettingsDialog";

afterEach(cleanup);

const savedDraft: SettingsDraft = {
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
  shareAnonymousDiagnostics: true,
  gitIdentityName: "Test User",
  gitIdentityEmail: "test@example.com",
  gitIdentityScope: "repository"
};

function dialog(draft: SettingsDraft, error = "", onOpenPerformanceDiagnostics = vi.fn()) {
  return (
    <SettingsDialog
      open
      draft={draft}
      aiSettings={null}
      saving={false}
      error={error}
      onOpenChange={vi.fn()}
      onDraftChange={vi.fn()}
      onSave={vi.fn()}
      onOpenPerformanceDiagnostics={onOpenPerformanceDiagnostics}
    />
  );
}

describe("SettingsDialog footer status", () => {
  it("uses the shared Motion presence while reserving the message height", () => {
    render(dialog(savedDraft), { wrapper: TooltipProvider });

    const presence = screen.getByText("All changes are saved.").closest(".motion-presence");
    const swap = presence?.parentElement;

    expect(swap?.className).toContain("min-h-5");
    expect(presence?.getAttribute("data-motion-state")).toBe("entered");
    expect(document.querySelector(".motion-swap-outgoing")).toBeNull();
  });

  it("swaps saved, error, and dirty messages without exposing stale live regions", () => {
    const view = render(dialog(savedDraft), { wrapper: TooltipProvider });

    view.rerender(dialog(savedDraft, "Unable to save settings."));
    expect(screen.getByRole("alert").textContent).toContain("Unable to save settings.");
    expect(document.querySelector(".motion-swap-outgoing")?.textContent).toContain("All changes are saved.");
    expect(document.querySelector(".motion-swap-outgoing")?.getAttribute("aria-hidden")).toBe("true");

    view.rerender(dialog({ ...savedDraft, autoFetchIntervalMinutes: "20" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("You have unsaved changes.");
    const outgoingMessages = [...document.querySelectorAll(".motion-swap-outgoing")];
    expect(outgoingMessages.some((message) => message.textContent?.includes("Unable to save settings."))).toBe(true);
    expect(outgoingMessages.every((message) => message.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("opens performance diagnostics from the Diagnostics category", () => {
    const onOpenPerformanceDiagnostics = vi.fn();
    render(dialog(savedDraft, "", onOpenPerformanceDiagnostics), { wrapper: TooltipProvider });

    fireEvent.change(screen.getByRole("combobox", { name: "Settings category" }), {
      target: { value: "diagnostics" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Open performance diagnostics" }));

    expect(onOpenPerformanceDiagnostics).toHaveBeenCalledOnce();
  });

  it("shows and edits the anonymous diagnostics preference in Privacy", () => {
    const onDraftChange = vi.fn();
    render(
      <SettingsDialog
        open
        initialCategory="privacy"
        draft={savedDraft}
        aiSettings={null}
        saving={false}
        error=""
        onOpenChange={vi.fn()}
        onDraftChange={onDraftChange}
        onSave={vi.fn()}
        onOpenPerformanceDiagnostics={vi.fn()}
      />,
      { wrapper: TooltipProvider }
    );

    expect(screen.getByRole("tab", { name: "Privacy", selected: true })).toBeTruthy();
    expect(screen.getByText("Control diagnostic data Githead sends outside this device.")).toBeTruthy();
    const checkbox = screen.getByRole("checkbox", { name: "Share anonymous diagnostics" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(/Turn this off to stop Githead analytics and tracking/)).toBeTruthy();
    expect(screen.getByText(/stay on this device/)).toBeTruthy();

    fireEvent.click(checkbox);
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ shareAnonymousDiagnostics: false }));
  });

  it("always shows app-wide GitHub connection details and recovery actions in Integrations", () => {
    const onConnectGitHub = vi.fn();
    const onManageRemotes = vi.fn();
    render(
      <SettingsDialog
        open
        initialCategory="integrations"
        draft={savedDraft}
        aiSettings={null}
        saving={false}
        error=""
        githubConnection={{
          state: "anonymous",
          source: "anonymous",
          accountLogin: null,
          repositoryAccess: "unknown",
          message: "Public repositories use anonymous GitHub access with a lower rate limit.",
          failure: null
        }}
        githubRepository={null}
        onOpenChange={vi.fn()}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onOpenPerformanceDiagnostics={vi.fn()}
        onConnectGitHub={onConnectGitHub}
        onManageRemotes={onManageRemotes}
      />,
      { wrapper: TooltipProvider }
    );

    expect(screen.getByRole("tab", { name: "Integrations" })).toBeTruthy();
    expect(screen.queryByText("Detected remote")).toBeNull();
    expect(screen.queryByText("origin · git@example.test:team/project.git")).toBeNull();
    expect(screen.getByText("No account")).toBeTruthy();
    expect(screen.getByText("Anonymous public access")).toBeTruthy();
    expect(screen.getByText(/Private repositories require/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage remotes" }));
    expect(onConnectGitHub).toHaveBeenCalledOnce();
    expect(onManageRemotes).toHaveBeenCalledOnce();
  });

  it("renders tag push behavior as a select with the current default and explanatory warning", () => {
    const onDraftChange = vi.fn();
    render(
      <SettingsDialog
        open
        draft={savedDraft}
        aiSettings={null}
        saving={false}
        error=""
        onOpenChange={vi.fn()}
        onDraftChange={onDraftChange}
        onSave={vi.fn()}
        onOpenPerformanceDiagnostics={vi.fn()}
      />,
      { wrapper: TooltipProvider }
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Settings category" }), {
      target: { value: "git-behaviors" }
    });

    const select = screen.getByRole("combobox", { name: "Tag push behavior" }) as HTMLSelectElement;
    expect(select.value).toBe("all");
    expect(screen.getByRole("option", { name: "Push all local tags (Default)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Push reachable annotated tags" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Do not push tags automatically" })).toBeTruthy();
    expect(screen.getByText(/may publish tags unrelated to the branch being pushed/)).toBeTruthy();
    expect(screen.getByText("After a branch push succeeds, Githead also pushes every local tag to the same remote.")).toBeTruthy();
    expect(screen.getByText(/does not affect manually creating, pushing, or deleting an individual tag/)).toBeTruthy();
    const upstreamCheckToggle = screen.getByRole("checkbox", {
      name: /Check the upstream before committing/
    }) as HTMLInputElement;
    expect(upstreamCheckToggle.checked).toBe(false);
    expect(screen.getByText(/Branches without a remote upstream can still commit locally/)).toBeTruthy();
    const leaseSelect = screen.getByRole("combobox", { name: "Reuse a remote check for" }) as HTMLSelectElement;
    expect(leaseSelect.value).toBe("120");
    expect(screen.getByText(/Commit Plan checks while generating/)).toBeTruthy();
    const containedCommitToggle = screen.getByRole("checkbox", {
      name: /Allow commits already contained in the current branch/
    }) as HTMLInputElement;
    expect(containedCommitToggle.checked).toBe(false);
    expect(screen.getByText(/Useful for reapplying reverted changes/)).toBeTruthy();

    fireEvent.change(select, { target: { value: "follow" } });
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ tagPushBehavior: "follow" }));
    fireEvent.click(upstreamCheckToggle);
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ requireUpToDateUpstreamBeforeCommit: true }));
    fireEvent.change(leaseSelect, { target: { value: "300" } });
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ remoteCheckLeaseSeconds: 300 }));
    fireEvent.click(containedCommitToggle);
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ allowCherryPickingContainedCommits: true }));
  });

  it("discards an unsaved Git Behaviors change through the existing cancel flow", () => {
    const onOpenChange = vi.fn();
    const view = render(
      <SettingsDialog
        open
        draft={savedDraft}
        aiSettings={null}
        saving={false}
        error=""
        onOpenChange={onOpenChange}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onOpenPerformanceDiagnostics={vi.fn()}
      />,
      { wrapper: TooltipProvider }
    );

    view.rerender(
      <SettingsDialog
        open
        draft={{ ...savedDraft, tagPushBehavior: "none" }}
        aiSettings={null}
        saving={false}
        error=""
        onOpenChange={onOpenChange}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onOpenPerformanceDiagnostics={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
