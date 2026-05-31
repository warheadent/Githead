import { describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "../shared/types";
import type { ProcessResult, ProcessRunner } from "./processRunner";
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
});

interface RunnerCall {
  command: string;
  args: string[];
}

class FakeRunner implements ProcessRunner {
  readonly calls: RunnerCall[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(command: string, args: string[]): Promise<ProcessResult> {
    this.calls.push({
      command,
      args
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
