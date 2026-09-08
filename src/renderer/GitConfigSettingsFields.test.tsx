// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GitConfigSettingsFields } from "./GitConfigSettingsFields";
import { useGitConfigSettings } from "./useGitConfigSettings";
import { emptyGitConfigValues, type GitConfigSaveRequest, type GitConfigSettings } from "../shared/gitConfig";

let saved: GitConfigSettings;
const getGitConfig = vi.fn(async () => structuredClone(saved));
const saveGitConfig = vi.fn(async (request: GitConfigSaveRequest) => {
  saved = { ...saved, values: { ...saved.values, ...request.changes }, revision: "updated" };
  return structuredClone(saved);
});
const chooseGitConfigFile = vi.fn(async () => "/chosen/ignore");
const testGitSigning = vi.fn(async () => ({ ok: true, message: "Signing succeeded." }));
function Editor({ open = true, repoPath = "/repo" }: { open?: boolean; repoPath?: string }) {
  const editor = useGitConfigSettings(open, repoPath, "repository");
  if (!open) return null;
  return <><GitConfigSettingsFields editor={editor} disabled={false} /><button disabled={!editor.dirty || editor.saving} onClick={() => { void editor.save(); }}>Save</button></>;
}

beforeEach(() => {
  saved = { repoPath: "/repo", scope: "repository", filePath: "/repo/.git/config", revision: "initial", values: emptyGitConfigValues(), effective: {}, inherited: {}, branchRebase: null };
  vi.clearAllMocks();
  Object.defineProperty(window, "githead", { configurable: true, value: { getGitConfig, saveGitConfig, chooseGitConfigFile, testGitSigning } });
});
afterEach(cleanup);

describe("Git settings editor", () => {
  it("keeps inherited false distinct from an explicit override and saves only changed fields", async () => {
    saved.effective["fetch.prune"] = { value: "false", scope: "global", origin: "file:/global" };
    render(<Editor />);
    const prune = await screen.findByLabelText("Remove stale remote references");
    expect((prune as HTMLSelectElement).value).toBe("inherit");
    fireEvent.change(prune, { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveGitConfig).toHaveBeenCalledWith(expect.objectContaining({ changes: { "fetch.prune": "false" }, revision: "initial" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true));
    fireEvent.change(prune, { target: { value: "inherit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveGitConfig).toHaveBeenLastCalledWith(expect.objectContaining({ changes: { "fetch.prune": null }, revision: "updated" })));
  });

  it("saves both pull parameters as one selection and keeps edits after a save error", async () => {
    render(<Editor />);
    fireEvent.change(await screen.findByLabelText("Pull behavior"), { target: { value: "rebase" } });
    saveGitConfig.mockRejectedValueOnce(new Error("Configuration changed outside this dialog."));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Configuration changed outside this dialog.")).toBeTruthy());
    expect(saveGitConfig).toHaveBeenCalledWith(expect.objectContaining({ changes: { "pull.rebase": "true", "pull.ff": "true" } }));
    expect((screen.getByLabelText("Pull behavior") as HTMLSelectElement).value).toBe("rebase");
    fireEvent.click(screen.getByRole("button", { name: "Reload and discard Git edits" }));
    await waitFor(() => expect((screen.getByLabelText("Pull behavior") as HTMLSelectElement).value).toBe("inherit"));
  });

  it("preserves advanced existing pull values when another setting changes", async () => {
    saved.values["pull.rebase"] = "merges";
    render(<Editor />);
    expect((await screen.findByLabelText("Pull behavior") as HTMLSelectElement).value).toBe("custom");
    fireEvent.change(screen.getByLabelText("Sign commits"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveGitConfig).toHaveBeenCalledWith(expect.objectContaining({ changes: { "commit.gpgsign": "true" } })));
  });

  it("loads selected paths into the draft and tests only saved signing settings", async () => {
    render(<Editor />);
    await screen.findByLabelText("Signing key");
    fireEvent.click(screen.getByRole("button", { name: "Test saved signing settings" }));
    await screen.findByText("Signing succeeded.");
    expect(testGitSigning).toHaveBeenCalledWith(expect.objectContaining({ repoPath: "/repo", scope: "repository" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose ignore file" }));
    await waitFor(() => expect((screen.getByLabelText("Ignore file") as HTMLInputElement).value).toBe("/chosen/ignore"));
    expect(screen.getByRole("button", { name: "Test saved signing settings" }).hasAttribute("disabled")).toBe(true);
    expect(saveGitConfig).not.toHaveBeenCalled();
  });

  it("discards edits on close and ignores a response from a previous repository", async () => {
    let resolveOld!: (value: GitConfigSettings) => void;
    getGitConfig.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Editor repoPath="/old" />);
    view.rerender(<Editor repoPath="/repo" />);
    fireEvent.change(await screen.findByLabelText("Sign commits"), { target: { value: "true" } });
    await act(async () => { resolveOld({ ...saved, repoPath: "/old" }); });
    expect((screen.getByLabelText("Sign commits") as HTMLSelectElement).value).toBe("true");
    view.rerender(<Editor open={false} />);
    view.rerender(<Editor />);
    expect((await screen.findByLabelText("Sign commits") as HTMLSelectElement).value).toBe("inherit");
    expect(saveGitConfig).not.toHaveBeenCalled();
  });
});
