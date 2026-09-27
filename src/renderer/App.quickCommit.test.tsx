// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { createStatusFile, createSummary, defer, githead, gitOutputCallback, repoPath } from "./AppTestHarness";
import { App } from "./App";
import type { GenerateAndCommitResult } from "../shared/types";

function selectFilesFixture() {
  vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [
    createStatusFile("src/selected.ts", { isUnstaged: true, worktreeStatus: "M" }),
    createStatusFile("docs/other.md", { isUnstaged: true, worktreeStatus: "M" })
  ] }));
}

async function useQuickDefault() {
  const settings = await githead.getAppSettings();
  vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, gitBehaviors: { ...settings.gitBehaviors, quickCommitByDefault: true } });
}

describe("File Status Quick Commit", { timeout: 15_000 }, () => {
  it("runs from the compose menu, displays progress, and preserves the manual draft", async () => {
    selectFilesFixture();
    const pending = defer<GenerateAndCommitResult>();
    vi.mocked(githead.generateAndCommit).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /src\/selected.ts/ }));
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "My manual draft");
    expect(screen.getByRole("button", { name: "Commit" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Quick Commit" }));
    await waitFor(() => expect(githead.generateAndCommit).toHaveBeenCalledWith({ repoPath, paths: ["src/selected.ts"], operationId: expect.any(String) }));
    expect(screen.getByRole("button", { name: "Generating…" }).hasAttribute("disabled")).toBe(true);
    const request = vi.mocked(githead.generateAndCommit).mock.calls[0]![0];
    act(() => gitOutputCallback?.({ repoPath, runId: request.operationId, action: "quick-commit-committing", stream: "system", text: "Committing selected files", timestamp: new Date().toISOString() }));
    expect(screen.getByRole("button", { name: "Committing…" }).hasAttribute("disabled")).toBe(true);
    await act(async () => pending.resolve({ repoPath, exitCode: 0, stdout: "Committed", stderr: "", generatedMessage: "AI message" }));
    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveProperty("value", "My manual draft");
    expect(githead.generateAndCommit).toHaveBeenCalledTimes(1);
    expect(githead.commitChanges).not.toHaveBeenCalled();
    expect(githead.stageFiles).not.toHaveBeenCalled();
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("swaps Quick Commit onto the button and Commit into the menu", async () => {
    selectFilesFixture();
    await useQuickDefault();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /src\/selected.ts/ }));
    expect(screen.getByRole("button", { name: "Quick Commit" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    expect(await screen.findByRole("menuitem", { name: "Commit" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Quick Commit" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Quick Commit" }));
    await waitFor(() => expect(githead.generateAndCommit).toHaveBeenCalledTimes(1));
  });

  it("keeps normal Commit usable in the menu when staged files block Quick Commit", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [createStatusFile("staged.ts", { isStaged: true, indexStatus: "M" })] }));
    await useQuickDefault();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("option", { name: /staged.ts/ });
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "Manual message");
    expect(screen.getByRole("button", { name: "Quick Commit" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "More commit actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Commit" }));
    await waitFor(() => expect(githead.commitChanges).toHaveBeenCalledWith({ repoPath, message: "Manual message", operationId: expect.any(String) }));
    expect(githead.generateAndCommit).not.toHaveBeenCalled();
  });

  it("commits only the selected files still visible under the filter", async () => {
    selectFilesFixture();
    await useQuickDefault();
    const user = userEvent.setup();
    render(<App />);
    const file = await screen.findByRole("option", { name: /src\/selected.ts/ });
    fireEvent.click(file);
    fireEvent.keyDown(file, { key: "a", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search changed files" }), { target: { value: "src/" } });
    expect(screen.getByText("1 selected file")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Quick Commit" }));
    await waitFor(() => expect(githead.generateAndCommit).toHaveBeenCalledWith({ repoPath, paths: ["src/selected.ts"], operationId: expect.any(String) }));
  });

  it("retains the generated message separately when committing fails", async () => {
    selectFilesFixture();
    await useQuickDefault();
    vi.mocked(githead.generateAndCommit).mockResolvedValue({ repoPath, exitCode: 1, stdout: "", stderr: "Selected files changed", generatedMessage: "Generated recovery message" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("option", { name: /src\/selected.ts/ }));
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Quick Commit" }));
    expect(within(await screen.findByRole("status", { name: "Generated commit message suggestion" })).getByText("Generated recovery message")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveProperty("value", "Keep this draft");
  });

  it("keeps Push as the primary action for a clean repository", async () => {
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ files: [], upstream: "origin/main", ahead: 2, behind: 0 }));
    await useQuickDefault();
    render(<App />);
    expect(await within(await screen.findByRole("region", { name: "Commit staged files" })).findByRole("button", { name: "Push 2 commits" })).toBeTruthy();
  });
});
