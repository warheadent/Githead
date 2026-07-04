import { describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "../shared/types";
import type { ProcessResult, ProcessRunner, ProcessRunOptions } from "./processRunner";
import { GitHubService } from "./githubService";

const repository: GitHubRepository = {
  owner: "openai",
  name: "githead",
  fullName: "openai/githead",
  webUrl: "https://github.com/openai/githead"
};

describe("GitHubService", () => {
  it("loads workflow runs for the supported GitHub origin", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      workflow_runs: [
        {
          id: 123,
          name: "CI",
          run_number: 42,
          status: "completed",
          conclusion: "success",
          head_branch: "main",
          event: "push",
          head_sha: "abcdef1234567890",
          html_url: "https://github.com/openai/githead/actions/runs/123",
          run_started_at: "2026-05-30T10:00:00Z",
          updated_at: "2026-05-30T10:05:00Z",
          head_commit: {
            message: "feat: add workflow tab\n\nBody"
          }
        }
      ]
    }));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.getWorkflowRuns({
      repoPath: "D:\\Repo"
    })).resolves.toEqual([
      {
        id: "123",
        name: "CI",
        runNumber: 42,
        status: "completed",
        conclusion: "success",
        branch: "main",
        event: "push",
        commitSha: "abcdef1234567890",
        commitMessage: "feat: add workflow tab",
        url: "https://github.com/openai/githead/actions/runs/123",
        startedAt: "2026-05-30T10:00:00Z",
        updatedAt: "2026-05-30T10:05:00Z"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/githead/actions/runs?per_page=30",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept": "application/vnd.github+json"
        })
      })
    );
  });

  it("uses GitHub CLI auth when a process runner is available", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const runner = new FakeRunner([
      ok(JSON.stringify({
        workflow_runs: [
          {
            id: 321,
            name: "Authenticated CI",
            status: "completed",
            conclusion: "success"
          }
        ]
      }))
    ]);
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl, runner);

    await expect(service.getWorkflowRuns({
      repoPath: "D:\\Repo"
    })).resolves.toEqual([
      expect.objectContaining({
        id: "321",
        name: "Authenticated CI"
      })
    ]);
    expect(runner.calls[0]).toEqual({
      command: "gh",
      args: [
        "api",
        "--method",
        "GET",
        "/repos/openai/githead/actions/runs?per_page=30",
        "--header",
        "Accept: application/vnd.github+json",
        "--header",
        "X-GitHub-Api-Version: 2022-11-28"
      ]
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("loads open issue and pull request counts with GitHub CLI auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const runner = new FakeRunner([
      ok(JSON.stringify({
        total_count: 1100
      })),
      ok(JSON.stringify({
        total_count: 42
      }))
    ]);
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl, runner);

    await expect(service.getOpenCounts({
      repoPath: "D:\\Repo"
    })).resolves.toEqual({
      issues: 1100,
      pullRequests: 42
    });
    expect(runner.calls).toEqual([
      {
        command: "gh",
        args: [
          "api",
          "--method",
          "GET",
          `/search/issues?q=${encodeURIComponent("repo:openai/githead is:open is:issue")}&per_page=1`,
          "--header",
          "Accept: application/vnd.github+json",
          "--header",
          "X-GitHub-Api-Version: 2022-11-28"
        ]
      },
      {
        command: "gh",
        args: [
          "api",
          "--method",
          "GET",
          `/search/issues?q=${encodeURIComponent("repo:openai/githead is:open is:pr")}&per_page=1`,
          "--header",
          "Accept: application/vnd.github+json",
          "--header",
          "X-GitHub-Api-Version: 2022-11-28"
        ]
      }
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("loads open issue and pull request counts with REST fallback", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        total_count: 7
      }))
      .mockResolvedValueOnce(jsonResponse({
        total_count: 13
      }));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.getOpenCounts({
      repoPath: "D:\\Repo"
    })).resolves.toEqual({
      issues: 7,
      pullRequests: 13
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.github.com/search/issues?q=${encodeURIComponent("repo:openai/githead is:open is:issue")}&per_page=1`,
      expect.any(Object)
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.github.com/search/issues?q=${encodeURIComponent("repo:openai/githead is:open is:pr")}&per_page=1`,
      expect.any(Object)
    );
  });

  it("loads open issues and filters pull requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      {
        number: 7,
        title: "Add issue tab",
        state: "open",
        user: {
          login: "taylor"
        },
        labels: [
          {
            name: "enhancement"
          }
        ],
        comments: 3,
        updated_at: "2026-05-30T11:00:00Z",
        html_url: "https://github.com/openai/githead/issues/7"
      },
      {
        number: 8,
        title: "Pull request",
        pull_request: {}
      }
    ]));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.getIssues({
      repoPath: "D:\\Repo"
    })).resolves.toEqual([
      {
        number: 7,
        title: "Add issue tab",
        state: "open",
        authorLogin: "taylor",
        labels: [
          "enhancement"
        ],
        comments: 3,
        updatedAt: "2026-05-30T11:00:00Z",
        url: "https://github.com/openai/githead/issues/7"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/githead/issues?state=open&per_page=50",
      expect.any(Object)
    );
  });

  it("loads open pull requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      {
        number: 11,
        title: "Add pull request tab",
        state: "open",
        user: {
          login: "taylor"
        },
        head: {
          ref: "feature/github-pr-tab"
        },
        base: {
          ref: "main"
        },
        labels: [
          {
            name: "ui"
          }
        ],
        comments: 2,
        review_comments: 5,
        draft: true,
        updated_at: "2026-05-30T12:00:00Z",
        html_url: "https://github.com/openai/githead/pull/11"
      }
    ]));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.getPullRequests({
      repoPath: "D:\\Repo"
    })).resolves.toEqual([
      {
        number: 11,
        title: "Add pull request tab",
        state: "open",
        authorLogin: "taylor",
        sourceBranch: "feature/github-pr-tab",
        targetBranch: "main",
        labels: [
          "ui"
        ],
        comments: 7,
        draft: true,
        updatedAt: "2026-05-30T12:00:00Z",
        url: "https://github.com/openai/githead/pull/11"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/githead/pulls?state=open&per_page=50",
      expect.any(Object)
    );
  });

  it("rejects repositories without a supported GitHub origin", async () => {
    const service = new GitHubService(createRepositoryProvider(null), vi.fn<typeof fetch>());

    await expect(service.getIssues({
      repoPath: "D:\\Repo"
    })).rejects.toThrow("Selected repository does not have a supported GitHub origin.");
  });

  it("creates a pull request with REST fallback", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      number: 12,
      title: "Add pull request creation",
      html_url: "https://github.com/openai/githead/pull/12",
      draft: true
    }, {
      status: 201
    }));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.createPullRequest({
      repoPath: "D:\\Repo",
      title: "Add pull request creation",
      body: "Adds a Create PR dialog.",
      baseBranch: "main",
      headBranch: "feature/create-pr",
      draft: true
    })).resolves.toEqual({
      number: 12,
      title: "Add pull request creation",
      url: "https://github.com/openai/githead/pull/12",
      draft: true
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/githead/pulls",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        })
      })
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Add pull request creation",
      head: "feature/create-pr",
      base: "main",
      body: "Adds a Create PR dialog.",
      draft: true
    });
  });

  it("creates a pull request through GitHub CLI with the payload on stdin", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const runner = new FakeRunner([
      ok(JSON.stringify({
        number: 5,
        title: "CLI pull request",
        html_url: "https://github.com/openai/githead/pull/5",
        draft: false
      }))
    ]);
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl, runner);

    await expect(service.createPullRequest({
      repoPath: "D:\\Repo",
      title: "CLI pull request",
      body: "",
      baseBranch: "main",
      headBranch: "feature/cli",
      draft: false
    })).resolves.toEqual({
      number: 5,
      title: "CLI pull request",
      url: "https://github.com/openai/githead/pull/5",
      draft: false
    });

    expect(runner.calls[0]?.args).toEqual([
      "api",
      "--method",
      "POST",
      "/repos/openai/githead/pulls",
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      "X-GitHub-Api-Version: 2022-11-28",
      "--input",
      "-"
    ]);
    expect(JSON.parse(String(runner.calls[0]?.options?.stdin))).toEqual({
      title: "CLI pull request",
      head: "feature/cli",
      base: "main",
      body: "",
      draft: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces validation details when pull request creation fails with 422", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      message: "Validation Failed",
      errors: [
        {
          message: "A pull request already exists for openai:feature/create-pr."
        }
      ]
    }, {
      status: 422
    }));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.createPullRequest({
      repoPath: "D:\\Repo",
      title: "Duplicate",
      body: "",
      baseBranch: "main",
      headBranch: "feature/create-pr",
      draft: false
    })).rejects.toThrow("A pull request already exists for openai:feature/create-pr.");
  });

  it("adds an authentication hint when pull request creation is unauthorized", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      message: "Requires authentication"
    }, {
      status: 401
    }));
    const service = new GitHubService(createRepositoryProvider(repository), fetchImpl);

    await expect(service.createPullRequest({
      repoPath: "D:\\Repo",
      title: "Needs auth",
      body: "",
      baseBranch: "main",
      headBranch: "feature/auth",
      draft: false
    })).rejects.toThrow("Authenticate GitHub CLI with gh auth login or set GITHUB_TOKEN, then try again.");
  });
});

interface RunnerCall {
  command: string;
  args: string[];
  options?: ProcessRunOptions;
}

class FakeRunner implements ProcessRunner {
  readonly calls: RunnerCall[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push({
      command,
      args,
      ...(options ? { options } : {})
    });

    const result = this.results.shift();
    if (!result) {
      throw new Error("Fake runner has no result queued.");
    }

    return result;
  }
}

function ok(stdout = ""): ProcessResult {
  return {
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function createRepositoryProvider(repository: GitHubRepository | null): {
  getGitHubRepository(repoPath: string): Promise<GitHubRepository | null>;
} {
  return {
    getGitHubRepository: vi.fn(async () => repository)
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}
