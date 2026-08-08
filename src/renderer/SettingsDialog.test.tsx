// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsDialog, type SettingsDraft } from "./SettingsDialog";

afterEach(cleanup);

const savedDraft: SettingsDraft = {
  selectedProvider: "openrouter",
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
  it("uses the shared motion timing while reserving the message height", () => {
    render(dialog(savedDraft), { wrapper: TooltipProvider });

    const presence = screen.getByText("All changes are saved.").closest(".motion-presence");
    const swap = presence?.parentElement;

    expect(swap?.className).toContain("min-h-5");
    expect(presence?.className).toContain("[--motion-translate-y:-2px]");
    expect(presence?.className).toContain("[--motion-reduced-opacity:0.92]");
    expect(presence?.getAttribute("style")).toContain("--motion-enter-duration: 120ms");
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
    expect(document.querySelector(".motion-swap-outgoing")?.textContent).toContain("Unable to save settings.");
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

    fireEvent.change(select, { target: { value: "follow" } });
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ tagPushBehavior: "follow" }));
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
