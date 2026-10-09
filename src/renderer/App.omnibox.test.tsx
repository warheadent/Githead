// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { GitHubCloneRepository, GitHubRepositoryDiscovery, GitRepositoryAccessCheckResult } from "../shared/types";
import { parseRepositorySource } from "../shared/repositorySource";
import { createOperationResult, defer, githead, waitForRepositoryWorkspace } from "./AppTestHarness";
import { App } from "./App";

const inputName = "Search repositories or paste a source";
function repo(fullName: string, overrides: Partial<GitHubCloneRepository> = {}): GitHubCloneRepository {
  return { ...parseRepositorySource(fullName)!.github!, description: "A repository", private: false, fork: false,
    language: "TypeScript", pushedAt: "2026-10-08T12:00:00Z", defaultBranch: "main", canPush: true, ...overrides };
}
function discovery(repositories: GitHubCloneRepository[]): GitHubRepositoryDiscovery {
  return { repositories, hasMore: false, incomplete: false,
    connection: { state: "authenticated", source: "githubApp", accountLogin: "me", repositoryAccess: "unknown", message: "Connected", failure: null } };
}
async function openPicker() {
  const user = userEvent.setup();
  render(<App />);
  await waitForRepositoryWorkspace();
  await user.click(screen.getByRole("button", { name: "Add repository" }));
  return user;
}

describe("repository omnibox", () => {
  it("shows grouped GitHub repositories, badges, installation scope and keyboard selection", async () => {
    vi.mocked(githead.getGitHubRepositories).mockResolvedValue({ ok: true, rateLimit: null, data: discovery([
      repo("me/first", { private: true }), repo("team/second", { fork: true })
    ]) });
    const user = await openPicker();
    const options = await within(screen.getByRole("listbox", { name: "Repositories" })).findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain("Private");
    expect(options[1]!.textContent).toContain("Fork");
    expect(await screen.findByText(/Only repositories available to the Githead GitHub App/)).toBeTruthy();
    await user.keyboard("{ArrowDown}");
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowUp}");
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(githead.checkRepositoryAccess).toHaveBeenCalledWith({ source: "https://github.com/team/second.git", operationId: expect.any(String) }));
  });

  it("offers only the parsed clipboard source and ignores replies from closed panels", async () => {
    const first = defer<ReturnType<typeof parseRepositorySource>>();
    vi.mocked(githead.readRepositoryClipboard).mockReturnValueOnce(first.promise).mockResolvedValue(null);
    const user = await openPicker();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await act(async () => first.resolve(parseRepositorySource("me/old-clipboard")));
    expect(screen.queryByText("From clipboard")).toBeNull();
    await user.keyboard("{Escape}");
    vi.mocked(githead.readRepositoryClipboard).mockResolvedValue(parseRepositorySource("me/current"));
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    expect(await screen.findByText("From clipboard")).toBeTruthy();
    expect(within(screen.getByRole("listbox", { name: "Repositories" })).getByRole("option").textContent).toContain("me/current");
  });

  it.each(["Control", "Meta"])("opens the existing local-folder flow with %s+O", async (modifier) => {
    const user = await openPicker();
    await user.keyboard(`{${modifier}>}o{/${modifier}}`);
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalled());
    expect(screen.queryByRole("combobox", { name: inputName })).toBeNull();
  });

  it("passes local paths to the existing folder picker", async () => {
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "D:\\Code\\local{Enter}");
    await waitFor(() => expect(githead.chooseRepo).toHaveBeenCalledWith("D:\\Code\\local"));
    expect(githead.checkRepositoryAccess).not.toHaveBeenCalled();
  });

  it("reuses the existing GitHub device flow", async () => {
    vi.mocked(githead.beginGitHubDeviceFlow).mockResolvedValue({ flowId: "flow", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", intervalSeconds: 0, expiresAt: "2099-01-01T00:00:00Z" });
    vi.mocked(githead.pollGitHubDeviceFlow).mockResolvedValue({ state: "error", message: "Device flow expired", retryable: true });
    const user = await openPicker();
    await user.click(await screen.findByRole("button", { name: "Connect GitHub" }));
    await waitFor(() => expect(githead.beginGitHubDeviceFlow).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("dialog", { name: /Settings/ })).toBeTruthy();
    expect(githead.openExternalUrl).toHaveBeenCalledWith({ url: "https://github.com/login/device" });
  });

  it("filters locally, debounces GitHub search and ignores out-of-order responses", async () => {
    const old = defer<Awaited<ReturnType<typeof githead.getGitHubRepositories>>>();
    vi.mocked(githead.getGitHubRepositories).mockImplementation(async (request) => {
      if (request.query === "pen") return old.promise;
      return { ok: true, rateLimit: null, data: discovery(request.query ? [repo("team/latest")] : [repo("me/pen"), repo("me/other")]) };
    });
    const user = await openPicker();
    await screen.findByText("me/pen");
    await user.type(screen.getByRole("combobox", { name: inputName }), "pen");
    expect(screen.queryByText("me/other")).toBeNull();
    expect(vi.mocked(githead.getGitHubRepositories).mock.calls.some(([request]) => request.query)).toBe(false);
    await user.click(screen.getByRole("option", { name: /Search GitHub for/ }));
    await waitFor(() => expect(vi.mocked(githead.getGitHubRepositories).mock.calls.some(([request]) => request.query === "pen")).toBe(true));
    await user.clear(screen.getByRole("combobox", { name: inputName }));
    await user.type(screen.getByRole("combobox", { name: inputName }), "latest");
    await screen.findByRole("option", { name: /team\/latest/ });
    await act(async () => old.resolve({ ok: true, rateLimit: null, data: discovery([repo("team/stale")]) }));
    expect(screen.queryByText("team/stale")).toBeNull();
    expect(githead.cancelGitHubRequest).toHaveBeenCalledWith({ requestId: expect.stringContaining("repository-search:") });
  });

  it("shows rate-limit recovery without blocking pasted URLs", async () => {
    vi.mocked(githead.getGitHubRepositories).mockResolvedValue({ ok: false, error: { kind: "rateLimited", message: "GitHub rate limit reached", retryable: true, retryAfterAt: "2099-01-01T12:00:00Z", outcomeUnknown: false, source: "rest", rateLimit: null } });
    const user = await openPicker();
    expect(await screen.findByText(/GitHub rate limit reached/)).toBeTruthy();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    expect(screen.getByRole("form", { name: "Clone repository" })).toBeTruthy();
  });
});

describe("repository composer", () => {
  it("starts one automatic check under StrictMode and Enter performs a normal clone", async () => {
    const settings = await githead.getAppSettings();
    vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, cloneParentPath: "D:\\Code" });
    vi.mocked(githead.getGitHubCloneDetails).mockResolvedValue({ ok: true, rateLimit: null, data: { repository: repo("org/repo", { canPush: false }), forkDisabledReason: null } });
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    await waitFor(() => expect((screen.getByRole("button", { name: "Clone repository" }) as HTMLButtonElement).disabled).toBe(false));
    expect(githead.checkRepositoryAccess).toHaveBeenCalledTimes(1);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(githead.cloneRepository).toHaveBeenCalledTimes(1));
    expect(vi.mocked(githead.cloneRepository).mock.calls[0]![0].fork).toBeUndefined();
  });

  it("auto-checks once per selection and invalidates a late check on Back", async () => {
    const old = defer<GitRepositoryAccessCheckResult>();
    vi.mocked(githead.checkRepositoryAccess).mockReturnValueOnce(old.promise).mockResolvedValue({ source: "", exitCode: 0, stdout: "", stderr: "", branches: ["new-main"], defaultBranch: "new-main" });
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/old{Enter}");
    expect(githead.checkRepositoryAccess).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: expect.any(String) }));
    await user.clear(screen.getByRole("combobox", { name: inputName }));
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/new{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose branch" }).textContent).toContain("new-main"));
    await act(async () => old.resolve({ source: "", exitCode: 0, stdout: "", stderr: "", branches: ["old-main"], defaultBranch: "old-main" }));
    expect(screen.getByRole("button", { name: "Choose branch" }).textContent).toContain("new-main");
    expect(githead.checkRepositoryAccess).toHaveBeenCalledTimes(2);
  });

  it("restores a persisted parent and uses the collision suggestion", async () => {
    const settings = await githead.getAppSettings();
    vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, cloneParentPath: "D:\\Code" });
    vi.mocked(githead.getCloneDestination).mockImplementation(async (request) => ({ path: `${request.parentPath}\\${request.directoryName}`, exists: request.directoryName === "repo", suggestedName: "repo-2", error: null }));
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    expect(screen.getByRole("button", { name: "Destination folder" }).textContent).toContain("D:\\Code\\repo");
    const alternative = await screen.findByRole("button", { name: "Use repo-2?" });
    expect((screen.getByRole("button", { name: "Clone repository" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(alternative);
    await waitFor(() => expect((screen.getByRole("button", { name: "Clone repository" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("button", { name: "Destination folder" }).textContent).toContain("repo-2");
  });

  it("ignores a folder-exists response for an old destination", async () => {
    const old = defer<Awaited<ReturnType<typeof githead.getCloneDestination>>>();
    const settings = await githead.getAppSettings();
    vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, cloneParentPath: "D:\\Code" });
    vi.mocked(githead.getCloneDestination).mockReturnValueOnce(old.promise).mockResolvedValue({ path: "D:\\Code\\next", exists: false, suggestedName: null, error: null });
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    await waitFor(() => expect(githead.getCloneDestination).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Destination folder" }));
    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "next" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect((screen.getByRole("button", { name: "Clone repository" }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => old.resolve({ path: "D:\\Code\\repo", exists: true, suggestedName: "repo-2", error: null }));
    expect(screen.queryByRole("button", { name: "Use repo-2?" })).toBeNull();
  });

  it("hides unsupported Lore controls and Git-only options", async () => {
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "lore://studio.example/game{Enter}");
    expect(await screen.findByText(/Remote branch listing is unavailable/)).toBeTruthy();
    expect(screen.queryByText("Sparse workspace")).toBeNull();
    expect(screen.queryByText("Workspace view")).toBeNull();
    expect(screen.queryByText("Prefetch large binaries")).toBeNull();
    expect(screen.queryByText("Clone options")).toBeNull();
    expect(githead.getGitHubCloneDetails).not.toHaveBeenCalled();
  });

  it("disables Fork & clone with the auth reason and keeps ordinary clone available", async () => {
    const settings = await githead.getAppSettings();
    vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, cloneParentPath: "D:\\Code" });
    vi.mocked(githead.getGitHubCloneDetails).mockResolvedValue({ ok: true, rateLimit: null, data: { repository: repo("org/repo", { canPush: false }), forkDisabledReason: "The app lacks administration write access." } });
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    expect(await screen.findByText("The app lacks administration write access.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Fork & clone" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect((screen.getByRole("button", { name: "Clone repository" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("submits fork intent, preserves busy state on Escape and supports cancellation", async () => {
    const settings = await githead.getAppSettings();
    vi.mocked(githead.getAppSettings).mockResolvedValue({ ...settings, cloneParentPath: "D:\\Code" });
    vi.mocked(githead.getGitHubCloneDetails).mockResolvedValue({ ok: true, rateLimit: null, data: { repository: repo("org/repo", { canPush: false }), forkDisabledReason: null } });
    const clone = defer<ReturnType<typeof createOperationResult>>();
    vi.mocked(githead.cloneRepository).mockReturnValue(clone.promise);
    const user = await openPicker();
    await user.type(screen.getByRole("combobox", { name: inputName }), "org/repo{Enter}");
    const fork = await screen.findByRole("button", { name: "Fork & clone" });
    await waitFor(() => expect((fork as HTMLButtonElement).disabled).toBe(false));
    await user.click(fork);
    await waitFor(() => expect(githead.cloneRepository).toHaveBeenCalledWith(expect.objectContaining({ fork: true })));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("form", { name: "Clone repository" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel Clone" }));
    expect(githead.cancelGitOperation).toHaveBeenCalled();
    await act(async () => clone.resolve(createOperationResult({ exitCode: -1, stderr: "Clone cancelled" })));
    expect(within(screen.getByRole("form", { name: "Clone repository" })).getByText(/Clone cancelled/)).toBeTruthy();
  });
});
