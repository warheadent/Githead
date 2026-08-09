// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_PR_DESCRIPTION_PROMPT } from "../shared/prDescriptionPrompt";
import { DEFAULT_SOURCE_CONTROL_WRITING_STYLE } from "../shared/sourceControlWritingStyle";
import {
  createAiSettings,
  createOperationResult,
  createSummary,
  defaultProviderModels,
  defer,
  flushRendererAsync,
  githead,
  repoPath,
  repositoryRecents,
  waitForRepositoryWorkspace,
  type AiReasoningCapabilities,
  type AiSettings,
  type GitheadApi,
  type RepoSummary
} from "./AppTestHarness";
import { App } from "./App";

describe("App", { timeout: 10_000 }, () => {
  it("clones a repository, validates the result, and adds it to repositories", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: clonedRepo,
      stdout: "Repository cloned."
    }));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) => repositoryRecents(request.repoPath));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "",
        depth: null,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
    await waitForRepositoryWorkspace();
    expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: clonedRepo });
    });
  });

  it("keeps the setup screen open when cloning fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo",
      exitCode: 1,
      stderr: "fatal: authentication failed"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    expect(screen.getByText("Select a repository to continue.")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith("D:\\Work\\repo");
  });

  it("passes branch and depth options when cloning", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo"
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "git@github.com:openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Choose branch" }));
    await user.type(screen.getByRole("combobox", { name: "Search or enter a branch..." }), "main");
    await user.click(screen.getByRole("button", { name: "Use branch “main”" }));
    await user.type(screen.getByLabelText("Depth"), "1");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "git@github.com:openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "main",
        depth: 1,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
  });

  it("checks repository access, reports success, and populates branch choices", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "https://github.com/openai/repo.git",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [
        "develop",
        "main"
      ],
      defaultBranch: "main"
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(githead.checkRepositoryAccess).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        operationId: expect.any(String)
      });
    });
    expect(await screen.findByText("Repository is accessible.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose branch" }).textContent).toContain("main");

    await user.click(screen.getByRole("button", { name: "Choose branch" }));
    await user.click(screen.getByRole("option", { name: "develop" }));

    expect(screen.getByRole("button", { name: "Choose branch" }).textContent).toContain("develop");
  });

  it("preserves a manually typed branch after a successful repository check", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "git@github.com:openai/repo.git",
      exitCode: 0,
      stdout: "",
      stderr: "",
      branches: [
        "main"
      ],
      defaultBranch: "main"
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "git@github.com:openai/repo.git");
    await user.click(screen.getByRole("button", { name: "Choose branch" }));
    await user.type(screen.getByRole("combobox", { name: "Search or enter a branch..." }), "release");
    await user.click(screen.getByRole("button", { name: "Use branch “release”" }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Repository is accessible.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose branch" }).textContent).toContain("release");
  });

  it("shows repository check failures and clears them when the source changes", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.checkRepositoryAccess).mockResolvedValue({
      source: "https://github.com/openai/private.git",
      exitCode: 1,
      stdout: "",
      stderr: "fatal: authentication failed",
      branches: [],
      defaultBranch: null
    });

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    const sourceInput = screen.getByLabelText("Repository URL or path");
    await user.type(sourceInput, "https://github.com/openai/private.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    fireEvent.change(sourceInput, { target: { value: "https://github.com/openai/private.git-copy" } });

    const exitingMessage = screen.getByText("fatal: authentication failed").closest(".motion-presence");
    expect(exitingMessage?.getAttribute("data-motion-state")).toBe("exiting");
    expect(exitingMessage?.getAttribute("aria-hidden")).toBe("true");
    await waitFor(() => expect(screen.queryByText("fatal: authentication failed")).toBeNull());
  });

  it("releases the clone latch before the cloned repository refresh settles", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    const pendingRefresh = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({ repoPath: clonedRepo }));
    vi.mocked(githead.getRepoSummary).mockImplementation((requestedRepoPath) => requestedRepoPath === clonedRepo
      ? pendingRefresh.promise
      : Promise.resolve(createSummary({ repoPath: requestedRepoPath })));

    render(<App />);
    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.getRepoSummary).toHaveBeenCalledWith(clonedRepo);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    await flushRendererAsync();
    expect((screen.getByRole("button", { name: "Add existing" }) as HTMLButtonElement).disabled).toBe(false);

    pendingRefresh.resolve(createSummary({ repoPath: clonedRepo }));
    await flushRendererAsync();
  });

  it("disables clone actions while checking repository access", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);
    let resolveCheck: (value: Awaited<ReturnType<GitheadApi["checkRepositoryAccess"]>>) => void = () => undefined;
    vi.mocked(githead.checkRepositoryAccess).mockReturnValue(new Promise((resolve) => {
      resolveCheck = resolve;
    }));

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect((await screen.findByRole("button", { name: "Checking" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Clone Repository" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveCheck({
        source: "https://github.com/openai/repo.git",
        exitCode: 0,
        stdout: "",
        stderr: "",
        branches: [],
        defaultBranch: null
      });
    });
  });

  it("defaults clone depth to 0 and sends a full-clone request", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoRecents).mockResolvedValue([]);

    render(<App />);

    await screen.findByText("Select a repository to continue.");
    expect((screen.getByLabelText("Depth") as HTMLInputElement).value).toBe("0");
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith(expect.objectContaining({
        depth: null,
        operationId: expect.any(String)
      }));
    });
  });

  it("opens repository add choices from the repository sidebar", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));

    expect(screen.getByRole("button", { name: "Add existing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clone new" })).toBeTruthy();
    expect(screen.queryByLabelText("Repository URL or path")).toBeNull();
  });

  it("opens the clone form from the repository add popout", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));

    expect(screen.getByRole("heading", { name: "Clone repository" })).toBeTruthy();
    expect(screen.getByLabelText("Repository URL or path")).toBeTruthy();
    expect(screen.getByLabelText("Destination folder")).toBeTruthy();
  });

  it("clones from the sidebar popout, switches repositories, and resets the clone draft", async () => {
    const user = userEvent.setup();
    const clonedRepo = "D:\\Work\\repo";
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: clonedRepo,
      stdout: "Repository cloned."
    }));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({
      repoPath: requestedRepoPath
    }));
    vi.mocked(githead.addRepoRecent).mockImplementation(async (request) => repositoryRecents(repoPath, request.repoPath));

    render(<App />);

    await waitForRepositoryWorkspace();
    vi.mocked(githead.addRepoRecent).mockClear();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    await waitFor(() => {
      expect(githead.cloneRepository).toHaveBeenCalledWith({
        source: "https://github.com/openai/repo.git",
        parentPath: "D:\\Work",
        directoryName: "repo",
        branchName: "",
        depth: null,
        recurseSubmodules: true,
        operationId: expect.any(String)
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${clonedRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    await waitFor(() => {
      expect(githead.addRepoRecent).toHaveBeenCalledWith({ repoPath: clonedRepo });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Repository URL or path")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    expect((screen.getByLabelText("Repository URL or path") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Depth") as HTMLInputElement).value).toBe("0");
  });

  it("keeps the sidebar clone popout open when cloning fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.cloneRepository).mockResolvedValue(createOperationResult({
      repoPath: "D:\\Work\\repo",
      exitCode: 1,
      stderr: "fatal: authentication failed"
    }));

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(screen.getByRole("button", { name: "Clone new" }));
    await user.type(screen.getByLabelText("Repository URL or path"), "https://github.com/openai/repo.git");
    await user.type(screen.getByLabelText("Destination folder"), "D:\\Work");
    await user.click(screen.getByRole("button", { name: "Clone Repository" }));

    expect(await screen.findByText("fatal: authentication failed")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Clone repository" })).toBeTruthy();
    expect(screen.getByLabelText("Repository URL or path")).toBeTruthy();
    expect(githead.addRepoRecent).not.toHaveBeenCalledWith("D:\\Work\\repo");
  });

  it("ignores stale repository summaries when switching quickly", async () => {
    const user = userEvent.setup();
    const firstRepo = "D:\\Work\\First";
    const secondRepo = "D:\\Work\\Second";
    const firstSummary = defer<RepoSummary>();
    const secondSummary = defer<RepoSummary>();
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, firstRepo, secondRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, firstRepo, secondRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation((requestedRepoPath) => {
      if (requestedRepoPath === firstRepo) {
        return firstSummary.promise;
      }
      if (requestedRepoPath === secondRepo) {
        return secondSummary.promise;
      }

      return Promise.resolve(createSummary({
        repoPath: requestedRepoPath,
        branch: "main"
      }));
    });

    render(<App />);

    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: `Switch to ${firstRepo}` }));
    await user.click(screen.getByRole("button", { name: `Switch to ${secondRepo}` }));

    secondSummary.resolve(createSummary({
      repoPath: secondRepo,
      branch: "second"
    }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Switch to ${secondRepo}` }).getAttribute("aria-current")).toBe("true");
    });
    expect(await screen.findByText("second")).toBeTruthy();

    firstSummary.resolve(createSummary({
      repoPath: firstRepo,
      branch: "first"
    }));
    await waitFor(() => {
      expect(screen.queryByText("first")).toBeNull();
    });
  });

  it("switches branches from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branches: [
        {
          name: "main",
          current: true,
          upstream: "origin/main"
        },
        {
          name: "feature/nav",
          current: false,
          upstream: null
        }
      ]
    }));

    render(<App />);

    await screen.findByText("main");
    const branchTrigger = screen.getByRole("button", { name: "Switch branch" });
    expect(branchTrigger.textContent).toContain("main");
    await user.click(branchTrigger);
    expect((await screen.findByRole("option", { name: /main.*current/ })).getAttribute("aria-selected")).toBe("true");
    await user.click(await screen.findByRole("option", { name: /feature\/nav/ }));

    await waitFor(() => {
      expect(githead.switchBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/nav",
        operationId: expect.any(String)
      });
    });
  });

  it("creates a branch from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Create branch" }));
    await user.type(await screen.findByLabelText("Branch name"), "feature/new");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(githead.createBranch).toHaveBeenCalledWith({
        repoPath,
        branchName: "feature/new",
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the branch dialog open when branch creation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.createBranch).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Branch already exists."
    });

    render(<App />);

    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Create branch" }));
    await user.type(await screen.findByLabelText("Branch name"), "main");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Branch already exists.")).toBeTruthy();
    expect(screen.getByLabelText("Branch name")).toBeTruthy();
  });

  it("changes the current branch upstream from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature",
          remote: "origin",
          branch: "feature"
        }
      ]
    }));

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("option", { name: /origin\/feature/ }));

    await waitFor(() => {
      expect(githead.setBranchUpstream).toHaveBeenCalledWith({
        repoPath,
        branchName: "main",
        upstream: "origin/feature",
        operationId: expect.any(String)
      });
    });
  });

  it("clears the current branch upstream from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary());

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("option", { name: /No upstream/ }));

    await waitFor(() => {
      expect(githead.setBranchUpstream).toHaveBeenCalledWith({
        repoPath,
        branchName: "main",
        upstream: null,
        operationId: expect.any(String)
      });
    });
  });

  it("keeps the upstream picker available when changing upstream fails", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [
        {
          name: "origin/main",
          remote: "origin",
          branch: "main"
        },
        {
          name: "origin/feature",
          remote: "origin",
          branch: "feature"
        }
      ]
    }));
    vi.mocked(githead.setBranchUpstream).mockResolvedValue({
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: "Unable to set upstream."
    });

    render(<App />);

    await screen.findByText("origin/main");
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    await user.click(await screen.findByRole("option", { name: /origin\/feature/ }));

    expect(await screen.findByText("Unable to set upstream.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Change upstream" }));
    expect(await screen.findByRole("option", { name: /origin\/feature/ })).toBeTruthy();
  });

  it("saves OpenRouter settings with custom source control writing instructions", async () => {
    const user = userEvent.setup();
    const savedSettings = createAiSettings("openrouter", {
      providers: {
        ...createAiSettings().providers,
        openrouter: {
          model: "openrouter/auto",
          prDescriptionModel: "",
          reasoningEffort: "low",
          commitPlanReasoningEffort: "low",
          prDescriptionReasoningEffort: "low",
          hasApiKey: true
        }
      },
      commitMessagePrompt: "Write concise commit messages."
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(savedSettings);
    vi.mocked(githead.saveAiSettings).mockResolvedValue(savedSettings);

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.queryByLabelText("Site URL")).toBeNull();
    expect(screen.queryByLabelText("Site Title")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "AI" }));

    const writingStyle = await screen.findByLabelText("Writing style");
    fireEvent.change(writingStyle, { target: { value: "custom" } });
    const instructions = await screen.findByLabelText("Custom instructions");

    fireEvent.change(screen.getByLabelText("OpenRouter API Key"), { target: { value: "sk-or-key" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "openrouter/auto" } });
    fireEvent.change(screen.getByLabelText("Commit Plan Model"), { target: { value: "openrouter/plan" } });
    fireEvent.change(instructions, { target: { value: "Write a single-line commit message." } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAiSettings).toHaveBeenCalledWith({
        selectedProvider: "openrouter",
        providerModels: {
          openrouter: "openrouter/auto",
          openai: defaultProviderModels.openai,
          "codex-cli": defaultProviderModels["codex-cli"],
          anthropic: defaultProviderModels.anthropic,
          "claude-code": defaultProviderModels["claude-code"]
        },
        commitPlanModels: {
          openrouter: "openrouter/plan",
          openai: "",
          "codex-cli": "",
          anthropic: "",
          "claude-code": ""
        },
        commitPlanReasoningEfforts: {
          openrouter: "low",
          openai: "low",
          "codex-cli": "low",
          anthropic: "low",
          "claude-code": "low"
        },
        prDescriptionModels: {
          openrouter: "",
          openai: "",
          "codex-cli": "",
          anthropic: "",
          "claude-code": ""
        },
        reasoningEfforts: {
          openrouter: "low",
          openai: "low",
          "codex-cli": "low",
          anthropic: "low",
          "claude-code": "low"
        },
        prDescriptionReasoningEfforts: {
          openrouter: "low",
          openai: "low",
          "codex-cli": "low",
          anthropic: "low",
          "claude-code": "low"
        },
        apiKeys: {
          openrouter: "sk-or-key"
        },
        clearApiKeys: {
          openrouter: false
        },
        commitMessagePrompt: "Write concise commit messages.",
        prDescriptionPrompt: DEFAULT_PR_DESCRIPTION_PROMPT,
        sourceControlWritingStyle: {
          mode: "custom",
          customInstructions: "Write a single-line commit message."
        }
      });
    });
    expect(githead.saveAppSettings).not.toHaveBeenCalled();
  });

  it("resets the source control writing style to its default", async () => {
    const user = userEvent.setup();
    const savedSettings = createAiSettings("openrouter", {
      sourceControlWritingStyle: {
        mode: "custom",
        customInstructions: "Use sentence case."
      }
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(savedSettings);
    vi.mocked(githead.saveAiSettings).mockResolvedValue({
      ...savedSettings,
      sourceControlWritingStyle: { ...DEFAULT_SOURCE_CONTROL_WRITING_STYLE }
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    expect((screen.getByLabelText("Writing style") as HTMLSelectElement).value).toBe("custom");
    expect((screen.getByLabelText("Custom instructions") as HTMLTextAreaElement).value).toBe("Use sentence case.");
    await user.click(screen.getByRole("button", { name: "Reset source control writing style to default" }));
    expect((screen.getByLabelText("Writing style") as HTMLSelectElement).value).toBe("conventional_commits");
    expect(screen.queryByLabelText("Custom instructions")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({
        sourceControlWritingStyle: DEFAULT_SOURCE_CONTROL_WRITING_STYLE
      }));
    });
  });

  it("shows provider selection and CLI provider status in AI settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const provider = await screen.findByLabelText("Provider");
    expect(provider).toBeTruthy();
    await user.selectOptions(provider, "claude-code");

    expect(await screen.findByText("Claude Code status")).toBeTruthy();
    expect(screen.getByText("Claude Code was not detected.")).toBeTruthy();
  });

  it("checks out a fetched remote branch from the repository panel", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remoteBranches: [{ name: "origin/feature/review", remote: "origin", branch: "feature/review" }]
    }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("option", { name: /feature\/review.*origin/ }));
    await waitFor(() => expect(githead.checkoutRemoteBranch).toHaveBeenCalledWith({
      repoPath, branchName: "feature/review", remoteBranch: "origin/feature/review", operationId: expect.any(String)
    }));
  });

  it("hides only remote branches already tracked by a local branch", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      branches: [
        { name: "main", current: true, upstream: "origin/main" },
        { name: "release", current: false, upstream: "upstream/release" }
      ],
      remoteBranches: [
        { name: "origin/main", remote: "origin", branch: "main" },
        { name: "origin/release", remote: "origin", branch: "release" }
      ]
    }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    expect(screen.queryByRole("option", { name: /main.*origin/ })).toBeNull();
    expect(await screen.findByRole("option", { name: /release.*origin/ })).toBeTruthy();
  });

  it("manages branches and explains safe-delete refusals", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ branches: [
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/old", current: false, upstream: "origin/feature/old" }
    ] }));
    render(<App />);
    await screen.findByText("main");
    await user.click(screen.getByRole("button", { name: "Switch branch" }));
    await user.click(await screen.findByRole("button", { name: "Manage Branches…" }));
    expect(screen.getByRole("button", { name: "Delete main" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Rename feature/old" }));
    const input = screen.getByLabelText("New name");
    await user.clear(input);
    await user.type(input, "feature/new");
    await user.click(screen.getByRole("button", { name: "Rename Branch" }));
    await waitFor(() => expect(githead.renameBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", newBranchName: "feature/new", operationId: expect.any(String) }));
    vi.mocked(githead.deleteBranch).mockResolvedValue({
      repoPath,
      exitCode: 1,
      stdout: "",
      stderr: "error: the branch 'feature/old' is not fully merged\nhint: run git branch -D feature/old"
    });
    await user.click(await screen.findByRole("button", { name: "Delete feature/old" }));
    await user.click(screen.getByRole("button", { name: "Delete Branch" }));
    expect(githead.deleteBranch).toHaveBeenCalledWith({ repoPath, branchName: "feature/old", force: false, operationId: expect.any(String) });
    expect(await screen.findByText("This branch has commits that haven’t been merged. Merge them into another branch before deleting it.")).toBeTruthy();
    expect(screen.queryByText(/git branch -D/)).toBeNull();
    vi.mocked(githead.deleteBranch).mockResolvedValue({ repoPath, exitCode: 0, stdout: "", stderr: "" });
    await user.click(screen.getByRole("checkbox", { name: /Force delete/ }));
    await user.click(screen.getByRole("button", { name: "Force Delete Branch" }));
    await waitFor(() => expect(githead.deleteBranch).toHaveBeenLastCalledWith({ repoPath, branchName: "feature/old", force: true, operationId: expect.any(String) }));
  });

  it("shows model-aware reasoning controls for commit plans and PR descriptions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAiReasoningCapabilities).mockResolvedValue({
      status: "supported",
      supportedEfforts: ["low", "medium", "high", "xhigh"]
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const reasoning = await screen.findByLabelText("Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(reasoning.disabled).toBe(false));
    expect(reasoning.value).toBe("low");
    expect(within(reasoning).getByRole("option", { name: "Extra High" })).toBeTruthy();
    await user.selectOptions(reasoning, "medium");

    const commitPlanReasoning = await screen.findByLabelText("Commit Plan Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(commitPlanReasoning.disabled).toBe(false));
    await user.selectOptions(commitPlanReasoning, "xhigh");

    await user.type(screen.getByLabelText("PR Description Model"), "openai/gpt-5.4-nano");
    const prReasoning = await screen.findByLabelText("PR Description Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(prReasoning.disabled).toBe(false));
    await user.selectOptions(prReasoning, "high");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAiSettings).toHaveBeenCalledWith(expect.objectContaining({
      reasoningEfforts: expect.objectContaining({ openai: "medium" }),
      commitPlanReasoningEfforts: expect.objectContaining({ openai: "xhigh" }),
      prDescriptionReasoningEfforts: expect.objectContaining({ openai: "high" })
    })));
  });

  it("disables reasoning when the selected model is unsupported", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getAiReasoningCapabilities).mockResolvedValue({
      status: "unsupported",
      supportedEfforts: []
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));

    const reasoning = await screen.findByLabelText("Reasoning") as HTMLSelectElement;
    await waitFor(() => expect(screen.getAllByText("This model does not support configurable reasoning.")).toHaveLength(3));
    expect(reasoning.disabled).toBe(true);
  });

  it("ignores stale reasoning capability responses after the model changes", async () => {
    const user = userEvent.setup();
    const initial = defer<AiReasoningCapabilities>();
    const updated = defer<AiReasoningCapabilities>();
    vi.mocked(githead.getAiReasoningCapabilities).mockImplementation(({ model }) => (
      model === defaultProviderModels.openrouter ? initial.promise : updated.promise
    ));

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));
    await waitFor(() => expect(githead.getAiReasoningCapabilities).toHaveBeenCalledTimes(1));

    const model = screen.getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "vendor/new-model");
    await waitFor(() => expect(githead.getAiReasoningCapabilities).toHaveBeenCalledTimes(2));

    updated.resolve({ status: "supported", supportedEfforts: ["high"] });
    await waitFor(() => expect((screen.getByLabelText("Reasoning") as HTMLSelectElement).value).toBe("high"));
    initial.resolve({ status: "unsupported", supportedEfforts: [] });
    await act(async () => Promise.resolve());

    expect((screen.getByLabelText("Reasoning") as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByText("This model does not support configurable reasoning.")).toBeNull();
  });

  it("shows Git Identity and AI settings sections and saves identity fields", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getGitIdentity).mockResolvedValue({
      scope: "global",
      repositoryOverrideEnabled: false,
      name: "Existing User",
      email: "existing@example.test",
      repository: {
        name: "",
        email: ""
      },
      global: {
        name: "Existing User",
        email: "existing@example.test"
      }
    });

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await waitFor(() => {
      expect(githead.getGitIdentity).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const settingsDialog = screen.getByRole("dialog", { name: "Settings" });
    expect(settingsDialog.className).toContain("sm:max-w-[880px]");
    expect(settingsDialog.className).toContain("h-[min(780px,calc(100vh-2rem))]");
    expect(settingsDialog.className).toContain("overflow-clip");
    expect(screen.getByRole("tab", { name: "Appearance", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Git Identity", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sync", selected: false })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "AI", selected: false })).toBeTruthy();
    await screen.findByText("Git Identity", {
      selector: "h2"
    });
    expect(screen.queryByText("Provider settings for generated commit messages.")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("10");
    await user.click(screen.getByRole("tab", { name: "AI" }));
    expect(await screen.findByText("Configure providers and instructions for generated Git content.")).toBeTruthy();
    expect((screen.getByLabelText("Writing style") as HTMLSelectElement).value).toBe("conventional_commits");
    expect(screen.getByText("Uses Conventional Commit prefixes for commit messages and pull request titles. Pull request descriptions stay concise.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Git Identity" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Taylor");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "taylor@example.test");
    expect(screen.queryByRole("radiogroup", { name: "Save Git identity to" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveGitIdentity).toHaveBeenCalledWith({
        repoPath,
        name: "Taylor",
        email: "taylor@example.test",
        scope: "global",
        operationId: expect.any(String)
      });
    });
  });

  it("saves the auto-fetch interval from Sync settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Sync" }));

    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "15");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(githead.saveAppSettings).toHaveBeenCalledWith({
        autoFetchIntervalMinutes: 15,
        colorTheme: "githead",
        appearanceMode: "system",
        uiFont: "inter",
        codeFont: "system-mono",
        zoomFactor: 1,
        statusFileViewMode: "list",
        wrapDiffLines: false,
        gitBehaviors: {
          tagPushBehavior: "all",
          requireUpToDateUpstreamBeforeCommit: false,
          allowCherryPickingContainedCommits: false
        }
      });
    });
  });

  it("saves Git Behaviors while preserving the rest of the application settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Git Behaviors" }));
    await user.click(screen.getByRole("checkbox", { name: /Check the upstream before committing/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Tag push behavior" }), "none");
    await user.click(screen.getByRole("checkbox", { name: /Allow commits already contained/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith({
      autoFetchIntervalMinutes: 10,
      colorTheme: "githead",
      appearanceMode: "system",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: {
        tagPushBehavior: "none",
        requireUpToDateUpstreamBeforeCommit: true,
        allowCherryPickingContainedCommits: true
      }
    }));
  });

  it("recovers an unregistered settings save and does not start later save phases", async () => {
    const user = userEvent.setup();
    const pendingAiSave = defer<AiSettings>();
    vi.mocked(githead.saveAiSettings).mockReturnValue(pendingAiSave.promise);
    vi.mocked(githead.cancelGitOperation).mockResolvedValueOnce({ accepted: false, state: "not-found" });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "AI" }));
    const model = screen.getByLabelText("Model");
    await user.clear(model);
    await user.type(model, "vendor/detached-model");
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "15");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(githead.saveAiSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Cancel operation" }));
    await waitFor(() => expect(githead.cancelGitOperation).toHaveBeenCalledWith({ operationId: expect.any(String) }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    pendingAiSave.resolve(createAiSettings());
    await flushRendererAsync();

    expect(githead.saveAppSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("saves global identity without a repository trust preflight", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const name = screen.getByLabelText("Name");
    await user.type(name, "Global Identity");
    await user.type(screen.getByLabelText("Email"), "global@example.test");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(githead.saveGitIdentity).toHaveBeenCalledWith(expect.objectContaining({
      scope: "global",
      name: "Global Identity",
      email: "global@example.test"
    })));
    expect(githead.getRepoTrust).not.toHaveBeenCalled();
  });

  it("protects unsaved settings and keeps drafts while navigating categories", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Sync" }));
    const interval = screen.getByLabelText("Auto-fetch interval");
    await user.clear(interval);
    await user.type(interval, "20");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);

    await user.click(screen.getByRole("tab", { name: "AI" }));
    await user.click(screen.getByRole("tab", { name: "Sync" }));
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("20");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect((screen.getByLabelText("Auto-fetch interval") as HTMLInputElement).value).toBe("20");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("closes settings and drops repository identity drafts when an open picker switches repositories", async () => {
    const user = userEvent.setup();
    const otherRepo = "D:\\Work\\Settings-B";
    const pendingRepositoryChoice = defer<string | null>();
    vi.mocked(githead.chooseRepo).mockReturnValue(pendingRepositoryChoice.promise);
    vi.mocked(githead.getRepoRecents).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.addRepoRecent).mockResolvedValue(repositoryRecents(repoPath, otherRepo));
    vi.mocked(githead.getRepoSummary).mockImplementation(async (requestedRepoPath) => createSummary({ repoPath: requestedRepoPath }));

    render(<App />);
    await waitForRepositoryWorkspace();
    await user.click(screen.getByRole("button", { name: "Add repository" }));
    await user.click(await screen.findByRole("button", { name: "Add existing" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Name"), "Repository A Draft");

    pendingRepositoryChoice.resolve(otherRepo);
    await waitFor(() => expect(githead.getRepoSummary).toHaveBeenCalledWith(otherRepo));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).not.toContain("Repository A Draft");
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
  });

  it("previews, restores, and saves accessible color themes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Settings" });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("githead"));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const themes = within(screen.getByRole("group", { name: "Color theme" })).getAllByRole("radio");
    expect(themes).toHaveLength(12);
    expect((screen.getByRole("radio", { name: /Githead/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);

    for (const theme of ["Copper", "Sakura", "Midnight"] as const) {
      await user.click(screen.getByRole("radio", { name: new RegExp(theme) }));
      expect(document.documentElement.dataset.theme).toBe(theme.toLowerCase());
      expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);
      expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    }

    await user.click(screen.getByRole("radio", { name: /Tidepool/ }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("tidepool");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(document.documentElement.dataset.theme).toBe("githead");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("radio", { name: /Ember/ }));
    await user.click(screen.getByRole("radio", { name: "Light" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith({
      autoFetchIntervalMinutes: 10,
      colorTheme: "ember",
      appearanceMode: "light",
      uiFont: "inter",
      codeFont: "system-mono",
      zoomFactor: 1,
      statusFileViewMode: "list",
      wrapDiffLines: false,
      gitBehaviors: {
        tagPushBehavior: "all",
        requireUpToDateUpstreamBeforeCommit: false,
        allowCherryPickingContainedCommits: false
      }
    }));
  });

  it("previews, restores, and saves interface and code fonts", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const uiFont = screen.getByLabelText("Interface font") as HTMLSelectElement;
    const codeFont = screen.getByLabelText("Code font") as HTMLSelectElement;
    expect(uiFont.options).toHaveLength(4);
    expect(codeFont.options).toHaveLength(5);

    await user.selectOptions(uiFont, "ibm-plex-sans");
    await user.selectOptions(codeFont, "jetbrains-mono");
    expect(document.documentElement.dataset.uiFont).toBe("ibm-plex-sans");
    expect(document.documentElement.dataset.codeFont).toBe("jetbrains-mono");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(document.documentElement.dataset.uiFont).toBe("inter");
    expect(document.documentElement.dataset.codeFont).toBe("system-mono");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.selectOptions(screen.getByLabelText("Interface font"), "roboto");
    await user.selectOptions(screen.getByLabelText("Code font"), "source-code-pro");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith(expect.objectContaining({
      uiFont: "roboto",
      codeFont: "source-code-pro"
    })));
  });

  it("previews, restores, and saves every notched interface scale", async () => {
    const user = userEvent.setup();
    const defaultAiSettings = createAiSettings();
    const unconfiguredAiSettings = createAiSettings("openrouter", {
      providers: {
        ...defaultAiSettings.providers,
        openrouter: {
          ...defaultAiSettings.providers.openrouter,
          hasApiKey: false
        }
      }
    });
    vi.mocked(githead.getAiSettings).mockResolvedValue(unconfiguredAiSettings);
    vi.mocked(githead.saveAiSettings).mockRejectedValue(new Error("Enter an OpenRouter API key."));
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    const slider = screen.getByRole("slider", { name: "Interface scale" }) as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("8");
    expect(slider.step).toBe("1");
    expect(slider.getAttribute("aria-valuetext")).toBe("100%");

    const factors = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    for (const [index, factor] of factors.entries()) {
      fireEvent.change(slider, { target: { value: String(index) } });
      await waitFor(() => expect(githead.setWindowZoomFactor).toHaveBeenLastCalledWith(factor));
    }
    expect(slider.getAttribute("aria-valuetext")).toBe("200%");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved settings?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(githead.setWindowZoomFactor).toHaveBeenLastCalledWith(1));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    fireEvent.change(screen.getByRole("slider", { name: "Interface scale" }), { target: { value: "5" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(githead.saveAppSettings).toHaveBeenCalledWith(expect.objectContaining({
      zoomFactor: 1.25
    })));
    expect(githead.saveAiSettings).not.toHaveBeenCalled();
    expect(githead.saveGitIdentity).not.toHaveBeenCalled();
  });

  it("opens remote management from the sidebar and adds a local remote without fetching", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({ remotes: [], upstream: null, remoteBranches: [] }));
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));

    expect(await screen.findByRole("dialog", { name: "Manage Remotes" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add Remote" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("origin");
    await user.type(screen.getByLabelText("URL"), "https://example.test/project.git");
    await user.click(screen.getByRole("button", { name: "Add Remote" }));

    await waitFor(() => expect(githead.addRemote).toHaveBeenCalledWith({
      repoPath,
      name: "origin",
      url: "https://example.test/project.git",
      operationId: expect.any(String)
    }));
    expect(githead.runGitAction).not.toHaveBeenCalled();
  });

  it("opens the hosted repository from the remote fact", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      remotes: [{ name: "origin", url: "git@github.com:openai/codex.git", direction: "fetch" }]
    }));

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Open remote repository" }));

    expect(githead.openExternalUrl).toHaveBeenCalledWith({
      url: "https://github.com/openai/codex"
    });
  });

  it("protects advanced remote URLs while retaining rename and remove actions", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([
      {
        name: "origin",
        fetchUrls: ["https://example.test/repo.git", "https://mirror.test/repo.git"],
        pushUrls: ["git@example.test:project/repo.git"],
        trackedBranches: ["main"]
      }
    ]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));

    expect(await screen.findByText("Advanced")).toBeTruthy();
    expect(screen.getByText("https://mirror.test/repo.git")).toBeTruthy();
    expect(screen.getByText("git@example.test:project/repo.git")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit URL" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains branch and GitHub impact before removing origin", async () => {
    const user = userEvent.setup();
    vi.mocked(githead.getRepoSummary).mockResolvedValue(createSummary({
      githubRepository: {
        owner: "warheadent",
        name: "Githead",
        fullName: "warheadent/Githead",
        webUrl: "https://github.com/warheadent/Githead"
      }
    }));
    vi.mocked(githead.getRemoteConfigs).mockResolvedValue([
      {
        name: "origin",
        fetchUrls: ["https://github.com/warheadent/Githead.git"],
        pushUrls: [],
        trackedBranches: ["main", "feature/nav"]
      }
    ]);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Manage remotes" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    expect(screen.getByText("Branch tracking will be cleared")).toBeTruthy();
    expect(screen.getByText(/branches main, feature\/nav/)).toBeTruthy();
    expect(screen.getByText("GitHub views will be disconnected")).toBeTruthy();
    expect(githead.removeRemote).not.toHaveBeenCalled();
  });
});
