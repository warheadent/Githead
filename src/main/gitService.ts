import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import type {
  CommitRef,
  GitAction,
  GitBranch,
  GitBranchRequest,
  GitCloneRequest,
  GitConfiguredAction,
  GitConfiguredActionRunRequest,
  GitConfiguredActionSaveRequest,
  GitCommitChangedFile,
  GitCommitDetails,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitFileResetRequest,
  GitCommitGraphRow,
  GitCommitHashRequest,
  GitCommitHistoryRequest,
  GitCommitRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitDiffSide,
  GitFileChangesRequest,
  GitFileDiff,
  GitFileDiffRequest,
  GitHunkRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitOutputEvent,
  GitPathRequest,
  GitPublishBranchRequest,
  GitRemoteBranch,
  GitRemote,
  GitRepositoryAccessCheckRequest,
  GitRepositoryAccessCheckResult,
  GitResetCommitRequest,
  GitRunRequest,
  GitRunResult,
  GitSafeDirectoryInfo,
  GitSafeDirectoryRequest,
  RepoSyncStatus,
  GitStatusFile,
  GitUpstreamRequest,
  GitHubRepository,
  RepoSummary
} from "../shared/types";
import { getSupportedGitHubOrigin, parseGitHubRemoteUrl } from "../shared/githubRemote";
import { gitCapabilities, isGitAction } from "../shared/types";
import { createEmptyActionsConfig, getActionKey, readActionsConfig, saveActionsConfigFile } from "./actionsConfig";
import { validateCloneRequest } from "./cloneValidation";
import type { ProcessOutput, ProcessResult, ProcessRunner } from "./processRunner";

export const GIT_ACTION_COMMANDS: Record<GitAction, string[]> = {
  fetch: [
    "fetch",
    "--all",
    "--prune"
  ],
  pull: [
    "pull",
    "--ff-only"
  ],
  push: [
    "push"
  ]
};

export type GitOutputHandler = (event: GitOutputEvent) => void;

export interface GitBranchRangeRequest {
  repoPath: string;
  baseRef: string;
  headRef: string;
}

export interface GitBranchRangeContext {
  diff: GitOperationResult;
  log: GitOperationResult;
}

const emptySummary = (
  repoPath: string,
  validationErrors: string[],
  safeDirectory: GitSafeDirectoryInfo | null = null
): RepoSummary => ({
  repoPath,
  kind: "git",
  capabilities: gitCapabilities(),
  isValid: false,
  branch: null,
  upstream: null,
  branches: [],
  hasHead: false,
  remotes: [],
  remoteBranches: [],
  defaultRemoteBranch: null,
  commitsAheadOfDefaultBranch: null,
  githubRepository: null,
  statusLines: [],
  files: [],
  safeDirectory,
  actionsConfig: createEmptyActionsConfig(),
  validationErrors
});

const DIFF_TEXT_LIMIT = 250_000;
const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 500;
const REPOSITORY_ACCESS_CHECK_TIMEOUT_MS = 30_000;

export class GitService {
  constructor(private readonly runner: ProcessRunner) {}

  async getRepoSummary(repoPath: string): Promise<RepoSummary> {
    const validation = await this.validateRepo(repoPath);

    if (!validation.isValid) {
      return emptySummary(repoPath, validation.validationErrors, validation.safeDirectory);
    }

    const [
      branchResult,
      upstreamResult,
      remoteResult,
      statusResult,
      headResult,
      branchesResult,
      remoteBranchesResult,
      rootResult
    ] = await Promise.all([
      this.runGit(repoPath, [
        "branch",
        "--show-current"
      ]),
      this.runGit(repoPath, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}"
      ]),
      this.runGit(repoPath, [
        "remote",
        "-v"
      ]),
      this.runGit(repoPath, [
        "status",
        "--porcelain=v2",
        "-z",
        "--branch",
        "--untracked-files=all"
      ]),
      this.runGit(repoPath, [
        "rev-parse",
        "--verify",
        "HEAD"
      ]),
      this.runGit(repoPath, [
        "branch",
        "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)"
      ]),
      this.runGit(repoPath, [
        "for-each-ref",
        "--format=%(refname)%09%(refname:short)%09%(symref)",
        "refs/remotes"
      ]),
      this.runGit(repoPath, [
        "rev-parse",
        "--show-toplevel"
      ])
    ]);
    const status = parsePorcelainStatus(statusResult.stdout);
    const branch = branchResult.stdout.trim() || null;
    const remotes = parseRemotes(remoteResult.stdout);
    const actionsConfig = rootResult.exitCode === 0
      ? await readActionsConfig(rootResult.stdout.trim())
      : {
          ...createEmptyActionsConfig(),
          error: rootResult.stderr.trim() || "Unable to locate repository root."
        };
    const hasHead = headResult.exitCode === 0;
    const defaultRemoteBranch = remoteBranchesResult.exitCode === 0
      ? parseRemoteDefaultBranch(remoteBranchesResult.stdout, remotes)
      : null;
    const commitsAheadOfDefaultBranch = defaultRemoteBranch && hasHead
      ? await this.countCommitsAhead(repoPath, defaultRemoteBranch.name)
      : null;

    return {
      repoPath,
      kind: "git",
      capabilities: gitCapabilities(),
      isValid: true,
      branch,
      upstream: upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() || null : null,
      branches: parseBranches(branchesResult.stdout, branch),
      hasHead,
      remotes,
      remoteBranches: remoteBranchesResult.exitCode === 0 ? parseRemoteBranches(remoteBranchesResult.stdout, remotes) : [],
      defaultRemoteBranch,
      commitsAheadOfDefaultBranch,
      githubRepository: getSupportedGitHubOrigin(remotes),
      statusLines: status.statusLines,
      files: status.files,
      actionsConfig,
      safeDirectory: null,
      validationErrors: []
    };
  }

  private async countCommitsAhead(repoPath: string, baseRef: string): Promise<number | null> {
    const result = await this.runGit(repoPath, [
      "rev-list",
      "--count",
      `${baseRef}..HEAD`
    ]);
    if (result.exitCode !== 0) {
      return null;
    }

    const count = Number.parseInt(result.stdout.trim(), 10);
    return Number.isFinite(count) ? count : null;
  }

  async addSafeDirectory(request: GitSafeDirectoryRequest): Promise<GitOperationResult> {
    const safeDirectoryPath = normalizeSafeDirectoryPath(request.repoPath);
    if ("error" in safeDirectoryPath) {
      return this.createOperationFailure(request.repoPath, safeDirectoryPath.error);
    }

    const result = await this.runner.run("git", [
      "config",
      "--global",
      "--add",
      "safe.directory",
      safeDirectoryPath.path
    ]);

    return {
      repoPath: safeDirectoryPath.path,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.error ? `${result.stderr}${result.error}` : result.stderr
    };
  }

  async getRepoSyncStatuses(repoPaths: string[]): Promise<RepoSyncStatus[]> {
    return Promise.all(repoPaths.map((repoPath) => this.getRepoSyncStatus(repoPath)));
  }

  async getRepoSyncStatus(repoPath: string): Promise<RepoSyncStatus> {
    try {
      const validation = await this.validateRepo(repoPath);
      if (!validation.isValid) {
        return createInvalidRepoSyncStatus(repoPath, validation.validationErrors.join(" "));
      }

      const statusResult = await this.runGit(repoPath, [
        "status",
        "--porcelain=v2",
        "-z",
        "--branch",
        "--untracked-files=no"
      ]);
      if (statusResult.exitCode !== 0) {
        return createInvalidRepoSyncStatus(repoPath, statusResult.stderr.trim() || "Unable to read repository sync status.");
      }

      const status = parsePorcelainStatus(statusResult.stdout);
      const counts = parseAheadBehindCounts(status.statusLines);

      return {
        repoPath,
        kind: "git",
        isValid: true,
        ahead: counts?.ahead ?? 0,
        behind: counts?.behind ?? 0,
        error: ""
      };
    } catch (error) {
      return createInvalidRepoSyncStatus(repoPath, error instanceof Error ? error.message : "Unable to read repository sync status.");
    }
  }

  async getGitHubRepository(repoPath: string): Promise<GitHubRepository | null> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      throw new Error(validation.validationErrors.join(" "));
    }

    const originResult = await this.runGit(repoPath, [
      "remote",
      "get-url",
      "origin"
    ]);
    if (originResult.exitCode !== 0) {
      return null;
    }

    return parseGitHubRemoteUrl(originResult.stdout.trim());
  }

  async checkRepositoryAccess(request: GitRepositoryAccessCheckRequest): Promise<GitRepositoryAccessCheckResult> {
    const source = request.source.trim();
    if (!source) {
      return createRepositoryAccessCheckFailure(source, "Enter a repository URL or path.");
    }

    const result = await this.runner.run("git", [
      "ls-remote",
      "--symref",
      "--",
      source,
      "HEAD",
      "refs/heads/*"
    ], {
      timeoutMs: REPOSITORY_ACCESS_CHECK_TIMEOUT_MS
    });
    const stderr = redactRepositorySourceCredentials(
      result.error ? `${result.stderr}${result.error}` : result.stderr,
      source
    );
    const stdout = redactRepositorySourceCredentials(result.stdout, source);
    const refs = parseRepositoryAccessRefs(result.stdout);

    return {
      source,
      exitCode: result.exitCode,
      stdout,
      stderr,
      branches: result.exitCode === 0 ? refs.branches : [],
      defaultBranch: result.exitCode === 0 ? refs.defaultBranch : null
    };
  }

  async cloneRepository(request: GitCloneRequest): Promise<GitOperationResult> {
    const validation = await validateCloneRequest(request);
    if ("error" in validation) {
      return this.createOperationFailure(request.parentPath, validation.error);
    }

    const args = [
      "clone",
      "--progress",
      ...(validation.branchName
        ? [
            "--branch",
            validation.branchName
          ]
        : []),
      ...(validation.depth
        ? [
            "--depth",
            String(validation.depth)
          ]
        : []),
      "--",
      validation.source,
      validation.destinationPath
    ];
    const result = await this.runner.run("git", args, {
      cwd: validation.parentPath
    });

    return {
      repoPath: validation.destinationPath,
      exitCode: result.exitCode,
      stdout: redactRepositorySourceCredentials(result.stdout || (result.exitCode === 0 ? "Repository cloned." : ""), validation.source),
      stderr: redactRepositorySourceCredentials(result.error ? `${result.stderr}${result.error}` : result.stderr, validation.source)
    };
  }

  writeCommitFileVersionToPath(
    repoPath: string,
    hash: string,
    filePath: string,
    outputPath: string
  ): Promise<{ exitCode: number; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn("git", [
        "-C",
        repoPath,
        "cat-file",
        "blob",
        `${hash}:${filePath}`
      ], {
        shell: false,
        windowsHide: true
      });
      const output = createWriteStream(outputPath);
      const stderrChunks: Buffer[] = [];
      let processResult: { exitCode: number; stderr: string; error?: string } | null = null;
      let outputFinished = false;
      let resolved = false;

      const maybeResolve = () => {
        if (resolved || !processResult || !outputFinished) {
          return;
        }

        resolved = true;
        resolve(processResult);
      };

      child.stdout.pipe(output);
      output.on("finish", () => {
        outputFinished = true;
        maybeResolve();
      });
      output.on("error", (error) => {
        outputFinished = true;
        processResult ??= {
          exitCode: -1,
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          error: error.message
        };
        maybeResolve();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
      child.on("error", (error) => {
        processResult ??= {
          exitCode: -1,
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          error: error.message
        };
        output.end();
        maybeResolve();
      });
      child.on("close", (code) => {
        processResult ??= {
          exitCode: code ?? -1,
          stderr: Buffer.concat(stderrChunks).toString("utf8")
        };
        maybeResolve();
      });
    });
  }

  async getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return {
        path: request.path,
        side: request.side,
        kind: "error",
        text: validation.validationErrors.join(" ")
      };
    }

    if (!request.path.trim()) {
      return {
        path: request.path,
        side: request.side,
        kind: "error",
        text: "Select a file to view the diff."
      };
    }

    const diffResult = request.side === "staged"
      ? await this.runGit(request.repoPath, [
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--",
        request.path
      ])
      : await this.getUnstagedDiff(request.repoPath, request.path);

    return normalizeDiffResult(request, diffResult);
  }

  async getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      throw new Error(validation.validationErrors.join(" "));
    }

    const headResult = await this.runGit(request.repoPath, [
      "rev-parse",
      "--verify",
      "HEAD"
    ]);
    if (headResult.exitCode !== 0) {
      return [];
    }

    const limit = sanitizeHistoryLimit(request.limit);
    const result = await this.runGit(request.repoPath, [
      "log",
      "--topo-order",
      "--parents",
      `--max-count=${limit}`,
      "--date=iso-strict",
      "--decorate=full",
      "--pretty=format:%x1f%H%x1f%h%x1f%D%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%ar%x1f%P%x1e"
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.error || "Unable to read commit history.");
    }

    return parseCommitHistory(result.stdout);
  }

  async getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      throw new Error(validation.validationErrors.join(" "));
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      throw new Error(hashResult.error);
    }

    const [
      metadataResult,
      nameStatusResult,
      numstatResult
    ] = await Promise.all([
      this.runGit(request.repoPath, [
        "show",
        "-s",
        "--date=iso-strict",
        "--decorate=full",
        "--pretty=format:%H%x1f%h%x1f%D%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%P%x1e%b",
        hashResult.hash
      ]),
      this.runGit(request.repoPath, [
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--name-status",
        "-r",
        "-z",
        "--find-renames",
        "--find-copies",
        hashResult.hash
      ]),
      this.runGit(request.repoPath, [
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--numstat",
        "-r",
        "-z",
        "--find-renames",
        "--find-copies",
        hashResult.hash
      ])
    ]);

    if (metadataResult.exitCode !== 0) {
      throw new Error(metadataResult.stderr.trim() || metadataResult.error || "Unable to read commit details.");
    }
    if (nameStatusResult.exitCode !== 0) {
      throw new Error(nameStatusResult.stderr.trim() || nameStatusResult.error || "Unable to read changed files.");
    }
    if (numstatResult.exitCode !== 0) {
      throw new Error(numstatResult.stderr.trim() || numstatResult.error || "Unable to read file stats.");
    }

    return {
      ...parseCommitDetails(metadataResult.stdout),
      files: mergeCommitFiles(
        parseCommitNameStatus(nameStatusResult.stdout),
        parseCommitNumstat(numstatResult.stdout)
      )
    };
  }

  async getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return {
        path: request.path,
        side: "unstaged",
        kind: "error",
        text: validation.validationErrors.join(" ")
      };
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      return {
        path: request.path,
        side: "unstaged",
        kind: "error",
        text: hashResult.error
      };
    }

    const pathResult = sanitizeSingleRepoPath(request.path);
    if ("error" in pathResult) {
      return {
        path: request.path,
        side: "unstaged",
        kind: "error",
        text: pathResult.error
      };
    }

    const diffResult = await this.runGit(request.repoPath, [
      "show",
      "--format=",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--find-copies",
      hashResult.hash,
      "--",
      pathResult.path
    ]);

    return normalizeDiffResult({
      repoPath: request.repoPath,
      path: pathResult.path,
      side: "unstaged"
    }, diffResult);
  }

  async resetFilesToCommit(request: GitCommitFileResetRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      return this.createOperationFailure(request.repoPath, hashResult.error);
    }

    const pathsResult = sanitizeRepoPaths(request.paths);
    if ("error" in pathsResult) {
      return this.createOperationFailure(request.repoPath, pathsResult.error);
    }

    return this.runGitOperation(request.repoPath, [
      "restore",
      "--worktree",
      `--source=${hashResult.hash}`,
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ], pathsResult.paths);
  }

  async stageFiles(request: GitPathRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const paths = sanitizePaths(request.paths);
    if (paths.length === 0) {
      return this.createOperationFailure(request.repoPath, "Select at least one file to stage.");
    }

    return this.runGitOperation(request.repoPath, [
      "add",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ], paths);
  }

  async unstageFiles(request: GitPathRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const paths = sanitizePaths(request.paths);
    if (paths.length === 0) {
      return this.createOperationFailure(request.repoPath, "Select at least one file to unstage.");
    }

    const headResult = await this.runGit(request.repoPath, [
      "rev-parse",
      "--verify",
      "HEAD"
    ]);
    const args = headResult.exitCode === 0
      ? [
        "restore",
        "--staged",
        "--pathspec-from-file=-",
        "--pathspec-file-nul"
      ]
      : [
        "rm",
        "--cached",
        "-r",
        "--pathspec-from-file=-",
        "--pathspec-file-nul"
      ];

    return this.runGitOperation(request.repoPath, args, paths);
  }

  async stageHunk(request: GitHunkRequest): Promise<GitOperationResult> {
    const validation = await this.validateHunkRequest(request, "unstaged");
    if ("error" in validation) {
      return this.createOperationFailure(request.repoPath, validation.error);
    }

    return this.runGitOperation(request.repoPath, [
      "apply",
      "--cached",
      "--whitespace=nowarn",
      "-"
    ], undefined, validation.patch);
  }

  async unstageHunk(request: GitHunkRequest): Promise<GitOperationResult> {
    const validation = await this.validateHunkRequest(request, "staged");
    if ("error" in validation) {
      return this.createOperationFailure(request.repoPath, validation.error);
    }

    return this.runGitOperation(request.repoPath, [
      "apply",
      "--cached",
      "--reverse",
      "--whitespace=nowarn",
      "-"
    ], undefined, validation.patch);
  }

  async commitChanges(request: GitCommitRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    if (!request.message.trim()) {
      return this.createOperationFailure(request.repoPath, "Enter a commit message.");
    }

    const result = await this.runGitOperation(request.repoPath, [
      "commit",
      "--file=-"
    ], undefined, `${request.message.trimEnd()}\n`);

    if (isMissingAuthorIdentityError(result)) {
      return {
        ...result,
        errorKind: "missing-author-identity"
      };
    }

    return result;
  }

  async resetBranchToCommit(request: GitResetCommitRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      return this.createOperationFailure(request.repoPath, hashResult.error);
    }

    if (!isResetMode(request.mode)) {
      return this.createOperationFailure(request.repoPath, "Reset mode is invalid.");
    }

    return this.runGitOperation(request.repoPath, [
      "reset",
      `--${request.mode}`,
      hashResult.hash
    ]);
  }

  async revertCommit(request: GitCommitHashRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      return this.createOperationFailure(request.repoPath, hashResult.error);
    }

    return this.runGitOperation(request.repoPath, [
      "revert",
      "--no-edit",
      hashResult.hash
    ]);
  }

  async createTag(request: GitCreateTagRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const hashResult = sanitizeCommitHash(request.hash);
    if ("error" in hashResult) {
      return this.createOperationFailure(request.repoPath, hashResult.error);
    }

    const tagResult = await this.validateTagName(request.repoPath, request.tagName);
    if ("error" in tagResult) {
      return this.createOperationFailure(request.repoPath, tagResult.error);
    }

    const tagArgs = [
      "tag",
      ...(request.force ? ["-f"] : []),
      ...(request.lightweight ? [] : ["-a", "-m", request.message.trim() || tagResult.tagName]),
      tagResult.tagName,
      hashResult.hash
    ];
    const tagOperation = await this.runGitOperation(request.repoPath, tagArgs);
    if (tagOperation.exitCode !== 0 || !request.pushRemote) {
      return tagOperation;
    }

    return this.pushTag(request.repoPath, request.pushRemote, tagResult.tagName, false);
  }

  async deleteTag(request: GitDeleteTagRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const tagResult = await this.validateTagName(request.repoPath, request.tagName);
    if ("error" in tagResult) {
      return this.createOperationFailure(request.repoPath, tagResult.error);
    }

    const deleteOperation = await this.runGitOperation(request.repoPath, [
      "tag",
      "-d",
      tagResult.tagName
    ]);
    if (deleteOperation.exitCode !== 0 || !request.pushRemote) {
      return deleteOperation;
    }

    return this.pushTag(request.repoPath, request.pushRemote, tagResult.tagName, true);
  }

  async switchBranch(request: GitBranchRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const branchResult = await this.validateBranchName(request.repoPath, request.branchName);
    if ("error" in branchResult) {
      return this.createOperationFailure(request.repoPath, branchResult.error);
    }

    return this.runGitOperation(request.repoPath, [
      "switch",
      "--no-guess",
      branchResult.branchName
    ]);
  }

  async createBranch(request: GitBranchRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const branchResult = await this.validateBranchName(request.repoPath, request.branchName);
    if ("error" in branchResult) {
      return this.createOperationFailure(request.repoPath, branchResult.error);
    }

    const existingResult = await this.runGit(request.repoPath, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchResult.branchName}`
    ]);
    if (existingResult.exitCode === 0) {
      return this.createOperationFailure(request.repoPath, "Branch already exists.");
    }

    return this.runGitOperation(request.repoPath, [
      "switch",
      "-c",
      branchResult.branchName
    ]);
  }

  async setBranchUpstream(request: GitUpstreamRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const branchResult = await this.validateBranchName(request.repoPath, request.branchName);
    if ("error" in branchResult) {
      return this.createOperationFailure(request.repoPath, branchResult.error);
    }

    const existingResult = await this.runGit(request.repoPath, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchResult.branchName}`
    ]);
    if (existingResult.exitCode !== 0) {
      return this.createOperationFailure(request.repoPath, "Branch does not exist.");
    }

    if (request.upstream === null) {
      return this.runGitOperation(request.repoPath, [
        "branch",
        "--unset-upstream",
        branchResult.branchName
      ]);
    }

    const upstream = request.upstream.trim();
    if (!upstream) {
      return this.createOperationFailure(request.repoPath, "Select an upstream.");
    }

    const remoteBranches = await this.getRemoteBranches(request.repoPath);
    if (!remoteBranches.some((remoteBranch) => remoteBranch.name === upstream)) {
      return this.createOperationFailure(request.repoPath, "Upstream must be a fetched remote branch.");
    }

    return this.runGitOperation(request.repoPath, [
      "branch",
      `--set-upstream-to=${upstream}`,
      branchResult.branchName
    ]);
  }

  async publishBranch(
    request: GitPublishBranchRequest,
    onOutput?: GitOutputHandler
  ): Promise<GitRunResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const action = "publish";

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createImmediateFailure({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        message: validation.validationErrors.join(" ")
      });
    }

    const branchResult = await this.validateBranchName(request.repoPath, request.branchName);
    if ("error" in branchResult) {
      return this.createImmediateFailure({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        message: branchResult.error
      });
    }

    const existingResult = await this.runGit(request.repoPath, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchResult.branchName}`
    ]);
    if (existingResult.exitCode !== 0) {
      return this.createImmediateFailure({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        message: "Branch does not exist."
      });
    }

    const remoteResult = await this.validateRemoteName(request.repoPath, request.remoteName);
    if ("error" in remoteResult) {
      return this.createImmediateFailure({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        message: remoteResult.error
      });
    }

    const currentBranchResult = await this.runGit(request.repoPath, [
      "branch",
      "--show-current"
    ]);
    if (currentBranchResult.exitCode !== 0 || currentBranchResult.stdout.trim() !== branchResult.branchName) {
      return this.createImmediateFailure({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        message: "Current branch changed before publishing. Refresh and try again."
      });
    }

    const publishResult = await this.runNamedActionCommand(request.repoPath, action, runId, [
      "push",
      "--set-upstream",
      remoteResult.remoteName,
      branchResult.branchName
    ], onOutput);

    if (publishResult.exitCode !== 0) {
      return this.createRunResult({
        runId,
        action,
        repoPath: request.repoPath,
        startedAt,
        result: publishResult,
        ...(onOutput ? { onOutput } : {})
      });
    }

    const tagResult = await this.runNamedActionCommand(request.repoPath, action, runId, [
      "push",
      remoteResult.remoteName,
      "--tags"
    ], onOutput);

    return this.createRunResult({
      runId,
      action,
      repoPath: request.repoPath,
      startedAt,
      result: {
        exitCode: tagResult.exitCode,
        stdout: `${publishResult.stdout}${tagResult.stdout}`,
        stderr: `${publishResult.stderr}${tagResult.stderr}`,
        ...(tagResult.error ? { error: tagResult.error } : {})
      },
      ...(onOutput ? { onOutput } : {})
    });
  }

  async getStagedDiff(repoPath: string): Promise<GitOperationResult> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(repoPath, validation.validationErrors.join(" "));
    }

    return this.runGitOperation(repoPath, [
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv"
    ]);
  }

  async getBranchRangeContext(request: GitBranchRangeRequest): Promise<GitBranchRangeContext> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      const failure = this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
      return { diff: failure, log: failure };
    }

    for (const ref of [request.baseRef, request.headRef]) {
      const error = getRefValidationError(ref);
      if (error) {
        const failure = this.createOperationFailure(request.repoPath, error);
        return { diff: failure, log: failure };
      }

      const verifyResult = await this.runGit(request.repoPath, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref.trim()}^{commit}`
      ]);
      if (verifyResult.exitCode !== 0) {
        const failure = this.createOperationFailure(request.repoPath, `Unknown git ref: ${ref.trim()}`);
        return { diff: failure, log: failure };
      }
    }

    const baseRef = request.baseRef.trim();
    const headRef = request.headRef.trim();
    const [diff, log] = await Promise.all([
      this.runGitOperation(request.repoPath, [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        `${baseRef}...${headRef}`
      ]),
      this.runGitOperation(request.repoPath, [
        "log",
        "--no-color",
        "--format=- %s",
        `${baseRef}..${headRef}`
      ])
    ]);

    return { diff, log };
  }

  async revertFileChanges(request: GitFileChangesRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const pathsResult = sanitizeRepoPaths(request.paths);
    if ("error" in pathsResult) {
      return this.createOperationFailure(request.repoPath, pathsResult.error);
    }

    if (request.side === "staged") {
      return this.unstageFiles({
        repoPath: request.repoPath,
        paths: pathsResult.paths
      });
    }

    const statusFiles = await this.getStatusFiles(request.repoPath, pathsResult.paths);
    if (statusFiles.some((statusFile) => statusFile?.indexStatus === "?")) {
      return this.createOperationFailure(
        request.repoPath,
        "Untracked files cannot be reverted. Use Delete to remove this file."
      );
    }

    return this.runGitOperation(request.repoPath, [
      "restore",
      "--worktree",
      "--pathspec-from-file=-",
      "--pathspec-file-nul"
    ], pathsResult.paths);
  }

  async addPathToIgnore(request: GitIgnorePathRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const pathResult = sanitizeSingleRepoPath(request.path);
    if ("error" in pathResult) {
      return this.createOperationFailure(request.repoPath, pathResult.error);
    }

    const rootResult = await this.runGit(request.repoPath, [
      "rev-parse",
      "--show-toplevel"
    ]);
    if (rootResult.exitCode !== 0) {
      return this.createOperationFailure(
        request.repoPath,
        rootResult.stderr.trim() || "Unable to locate repository root."
      );
    }

    const repoRoot = rootResult.stdout.trim();
    const ignorePath = path.join(repoRoot, ".gitignore");
    const rawPattern = normalizeIgnorePattern(pathResult.path);

    try {
      const existing = await readTextIfExists(ignorePath);
      const pattern = shouldEscapeIgnoreSpaces(existing) ? rawPattern.replace(/ /g, "\\ ") : rawPattern;
      const lines = existing.split(/\r?\n/);
      const hasPattern = lines.some((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith("#") && trimmed === pattern;
      });

      if (hasPattern) {
        return {
          repoPath: request.repoPath,
          exitCode: 0,
          stdout: "Path is already ignored.",
          stderr: ""
        };
      }

      const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
      await fs.writeFile(ignorePath, `${prefix}${pattern}\n`, "utf8");

      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: "Path added to .gitignore.",
        stderr: ""
      };
    } catch (error) {
      return this.createOperationFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to update .gitignore."
      );
    }
  }

  async runGitAction(
    request: GitRunRequest,
    onOutput?: GitOutputHandler
  ): Promise<GitRunResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();

    if (!isGitAction(request.action)) {
      return this.createImmediateFailure({
        runId,
        action: String(request.action),
        repoPath: request.repoPath,
        startedAt,
        message: "Unsupported git action."
      });
    }

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createImmediateFailure({
        runId,
        action: request.action,
        repoPath: request.repoPath,
        startedAt,
        message: validation.validationErrors.join(" ")
      });
    }

    const result = request.action === "push"
      ? await this.runPushWithTags(request, runId, onOutput)
      : await this.runActionCommand(request, runId, GIT_ACTION_COMMANDS[request.action], onOutput);

    const endedAt = new Date().toISOString();
    onOutput?.(
      this.createOutputEvent(
        runId,
        request.action,
        "system",
        `\n${request.action} exited with code ${result.exitCode}.\n`
      )
    );

    return {
      runId,
      action: request.action,
      repoPath: request.repoPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.error ? `${result.stderr}${result.error}` : result.stderr,
      startedAt,
      endedAt
    };
  }

  async runConfiguredAction(
    request: GitConfiguredActionRunRequest,
    onOutput?: GitOutputHandler
  ): Promise<GitRunResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const requestedName = request.name.trim();

    if (!requestedName) {
      return this.createImmediateFailure({
        runId,
        action: "Actions",
        repoPath: request.repoPath,
        startedAt,
        message: "Configured action name is required."
      });
    }

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createImmediateFailure({
        runId,
        action: requestedName,
        repoPath: request.repoPath,
        startedAt,
        message: validation.validationErrors.join(" ")
      });
    }

    const rootResult = await this.runGit(request.repoPath, [
      "rev-parse",
      "--show-toplevel"
    ]);
    if (rootResult.exitCode !== 0) {
      return this.createImmediateFailure({
        runId,
        action: requestedName,
        repoPath: request.repoPath,
        startedAt,
        message: rootResult.stderr.trim() || "Unable to locate repository root."
      });
    }

    const repoRoot = rootResult.stdout.trim();
    const actionsConfig = await readActionsConfig(repoRoot);
    if (actionsConfig.error) {
      return this.createImmediateFailure({
        runId,
        action: requestedName,
        repoPath: request.repoPath,
        startedAt,
        message: actionsConfig.error
      });
    }

    const configuredAction = actionsConfig.actions.find((action) => getActionKey(action.name) === getActionKey(requestedName));
    if (!configuredAction) {
      return this.createImmediateFailure({
        runId,
        action: requestedName,
        repoPath: request.repoPath,
        startedAt,
        message: "Configured action not found."
      });
    }

    const shellCommand = getShellCommand(configuredAction);
    const displayCommand = `${shellCommand.command} ${shellCommand.args.map(formatCommandArgument).join(" ")}`;
    onOutput?.(this.createOutputEvent(runId, configuredAction.name, "system", `> ${displayCommand}\n`));

    const result = await this.runner.run(shellCommand.command, shellCommand.args, {
      cwd: repoRoot,
      ...createTerminalColorRunOptions(),
      onOutput: (output) => {
        onOutput?.(this.createOutputEvent(runId, configuredAction.name, output.stream, output.text));
      }
    });

    const endedAt = new Date().toISOString();
    onOutput?.(
      this.createOutputEvent(
        runId,
        configuredAction.name,
        "system",
        `\n${configuredAction.name} exited with code ${result.exitCode}.\n`
      )
    );

    return {
      runId,
      action: configuredAction.name,
      repoPath: request.repoPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.error ? `${result.stderr}${result.error}` : result.stderr,
      startedAt,
      endedAt
    };
  }

  async saveConfiguredActions(request: GitConfiguredActionSaveRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const rootResult = await this.runGit(request.repoPath, [
      "rev-parse",
      "--show-toplevel"
    ]);
    if (rootResult.exitCode !== 0) {
      return this.createOperationFailure(
        request.repoPath,
        rootResult.stderr.trim() || "Unable to locate repository root."
      );
    }

    return saveActionsConfigFile(rootResult.stdout.trim(), request);
  }

  private async validateRepo(repoPath: string): Promise<Pick<RepoSummary, "isValid" | "validationErrors" | "safeDirectory">> {
    if (!repoPath.trim()) {
      return {
        isValid: false,
        validationErrors: [
          "Select a repository folder."
        ],
        safeDirectory: null
      };
    }

    const result = await this.runGit(repoPath, [
      "rev-parse",
      "--is-inside-work-tree"
    ]);

    if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
      const safeDirectory = parseSafeDirectoryFailure(result.stderr, repoPath);
      if (safeDirectory) {
        return {
          isValid: false,
          validationErrors: [
            safeDirectory.message
          ],
          safeDirectory
        };
      }

      return {
        isValid: false,
        validationErrors: [
          "Selected folder is not a git repository."
        ],
        safeDirectory: null
      };
    }

    return {
      isValid: true,
      validationErrors: [],
      safeDirectory: null
    };
  }

  private async validateBranchName(repoPath: string, branchName: string): Promise<
    { branchName: string } | { error: string }
  > {
    const trimmedBranchName = branchName.trim();

    if (!trimmedBranchName) {
      return {
        error: "Enter a branch name."
      };
    }

    if (trimmedBranchName.startsWith("-")) {
      return {
        error: "Branch name cannot start with a dash."
      };
    }

    const result = await this.runGit(repoPath, [
      "check-ref-format",
      "--branch",
      trimmedBranchName
    ]);

    if (result.exitCode !== 0) {
      return {
        error: result.stderr.trim() || "Branch name is invalid."
      };
    }

    return {
      branchName: result.stdout.trim() || trimmedBranchName
    };
  }

  private async validateTagName(repoPath: string, tagName: string): Promise<{ tagName: string } | { error: string }> {
    const trimmedTagName = tagName.trim();

    if (!trimmedTagName) {
      return {
        error: "Enter a tag name."
      };
    }

    if (trimmedTagName.startsWith("-")) {
      return {
        error: "Tag name cannot start with a dash."
      };
    }

    const result = await this.runGit(repoPath, [
      "check-ref-format",
      "--allow-onelevel",
      `refs/tags/${trimmedTagName}`
    ]);

    if (result.exitCode !== 0) {
      return {
        error: result.stderr.trim() || "Tag name is invalid."
      };
    }

    return {
      tagName: trimmedTagName
    };
  }

  private async pushTag(repoPath: string, remoteName: string, tagName: string, deleteRemote: boolean): Promise<GitOperationResult> {
    const remoteResult = await this.validateRemoteName(repoPath, remoteName);
    if ("error" in remoteResult) {
      return this.createOperationFailure(repoPath, remoteResult.error);
    }

    return this.runGitOperation(repoPath, [
      "push",
      remoteResult.remoteName,
      deleteRemote ? `:refs/tags/${tagName}` : `refs/tags/${tagName}`
    ]);
  }

  private async validateRemoteName(repoPath: string, remoteName: string): Promise<{ remoteName: string } | { error: string }> {
    const trimmedRemoteName = remoteName.trim();

    if (!trimmedRemoteName) {
      return {
        error: "Select a remote."
      };
    }

    const result = await this.runGit(repoPath, [
      "remote"
    ]);

    if (result.exitCode !== 0) {
      return {
        error: result.stderr.trim() || "Unable to read remotes."
      };
    }

    const remotes = new Set(splitLines(result.stdout).map((line) => line.trim()).filter((line) => line.length > 0));
    if (!remotes.has(trimmedRemoteName)) {
      return {
        error: "Remote is invalid."
      };
    }

    return {
      remoteName: trimmedRemoteName
    };
  }

  private runGit(
    repoPath: string,
    args: string[],
    onOutput?: (output: ProcessOutput) => void,
    stdin?: string | Buffer,
    env?: NodeJS.ProcessEnv
  ): Promise<ProcessResult> {
    const options = createRunOptions(onOutput, stdin, env);

    return this.runner.run("git", [
      "-C",
      repoPath,
      ...args
    ], options);
  }

  private async getUnstagedDiff(repoPath: string, filePath: string): Promise<ProcessResult> {
    const statusResult = await this.runGit(repoPath, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--",
      filePath
    ]);
    const statusFile = parsePorcelainStatus(statusResult.stdout).files.find((file) => file.path === filePath);

    if (statusFile?.indexStatus === "?") {
      const result = await this.runner.run("git", [
        "diff",
        "--no-index",
        "--no-color",
        "--",
        "/dev/null",
        filePath
      ], {
        cwd: repoPath
      });

      return {
        ...result,
        exitCode: result.exitCode === 1 ? 0 : result.exitCode
      };
    }

    return this.runGit(repoPath, [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--",
      filePath
    ]);
  }

  private async getStatusFiles(repoPath: string, filePaths: string[]): Promise<Array<GitStatusFile | undefined>> {
    const statusResult = await this.runGit(repoPath, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--",
      ...filePaths
    ]);

    const filesByPath = new Map(parsePorcelainStatus(statusResult.stdout).files.map((file) => [
      file.path,
      file
    ]));
    return filePaths.map((filePath) => filesByPath.get(filePath));
  }

  private async getRemoteBranches(repoPath: string): Promise<GitRemoteBranch[]> {
    const [
      remotesResult,
      remoteBranchesResult
    ] = await Promise.all([
      this.runGit(repoPath, [
        "remote",
        "-v"
      ]),
      this.runGit(repoPath, [
        "for-each-ref",
        "--format=%(refname)%09%(refname:short)%09%(symref)",
        "refs/remotes"
      ])
    ]);

    if (remoteBranchesResult.exitCode !== 0) {
      return [];
    }

    return parseRemoteBranches(
      remoteBranchesResult.stdout,
      remotesResult.exitCode === 0 ? parseRemotes(remotesResult.stdout) : []
    );
  }

  private async validateHunkRequest(
    request: GitHunkRequest,
    expectedSide: GitDiffSide
  ): Promise<{ patch: string } | { error: string }> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return {
        error: validation.validationErrors.join(" ")
      };
    }

    const pathResult = sanitizeSingleRepoPath(request.path);
    if ("error" in pathResult) {
      return pathResult;
    }

    if (request.side !== expectedSide) {
      return {
        error: expectedSide === "unstaged"
          ? "Only unstaged hunks can be staged."
          : "Only staged hunks can be unstaged."
      };
    }

    const patch = request.patch;
    if (!patch.trim()) {
      return {
        error: "Select a hunk to apply."
      };
    }

    return {
      patch: patch.endsWith("\n") ? patch : `${patch}\n`
    };
  }

  private async runActionCommand(
    request: GitRunRequest,
    runId: string,
    commandArgs: string[],
    onOutput?: GitOutputHandler
  ): Promise<ProcessResult> {
    return this.runNamedActionCommand(request.repoPath, request.action, runId, commandArgs, onOutput);
  }

  private async runNamedActionCommand(
    repoPath: string,
    action: string,
    runId: string,
    commandArgs: string[],
    onOutput?: GitOutputHandler
  ): Promise<ProcessResult> {
    const displayCommand = `git -C "${repoPath}" ${commandArgs.join(" ")}`;
    onOutput?.(this.createOutputEvent(runId, action, "system", `> ${displayCommand}\n`));

    return await this.runGit(repoPath, commandArgs, (output) => {
      onOutput?.(this.createOutputEvent(runId, action, output.stream, output.text));
    }, undefined, createTerminalColorEnv());
  }

  private async runPushWithTags(
    request: GitRunRequest,
    runId: string,
    onOutput?: GitOutputHandler
  ): Promise<ProcessResult> {
    const pushResult = await this.runActionCommand(request, runId, [
      "push"
    ], onOutput);

    if (pushResult.exitCode !== 0) {
      return pushResult;
    }

    const tagResult = await this.runActionCommand(request, runId, [
      "push",
      "--tags"
    ], onOutput);

    return {
      exitCode: tagResult.exitCode,
      stdout: `${pushResult.stdout}${tagResult.stdout}`,
      stderr: `${pushResult.stderr}${tagResult.stderr}`,
      ...(tagResult.error ? { error: tagResult.error } : {})
    };
  }

  private async runGitOperation(
    repoPath: string,
    args: string[],
    paths?: string[],
    stdin?: string
  ): Promise<GitOperationResult> {
    const input = paths ? createPathspecInput(paths) : stdin;
    const result = await this.runGit(repoPath, args, undefined, input);

    return {
      repoPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.error ? `${result.stderr}${result.error}` : result.stderr
    };
  }

  private createOperationFailure(repoPath: string, message: string): GitOperationResult {
    return {
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr: message
    };
  }

  private createImmediateFailure(params: {
    runId: string;
    action: string;
    repoPath: string;
    startedAt: string;
    message: string;
  }): GitRunResult {
    return {
      runId: params.runId,
      action: params.action,
      repoPath: params.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: params.message,
      startedAt: params.startedAt,
      endedAt: new Date().toISOString()
    };
  }

  private createRunResult(params: {
    runId: string;
    action: string;
    repoPath: string;
    startedAt: string;
    result: ProcessResult;
    onOutput?: GitOutputHandler;
  }): GitRunResult {
    const endedAt = new Date().toISOString();
    params.onOutput?.(
      this.createOutputEvent(
        params.runId,
        params.action,
        "system",
        `\n${params.action} exited with code ${params.result.exitCode}.\n`
      )
    );

    return {
      runId: params.runId,
      action: params.action,
      repoPath: params.repoPath,
      exitCode: params.result.exitCode,
      stdout: params.result.stdout,
      stderr: params.result.error ? `${params.result.stderr}${params.result.error}` : params.result.stderr,
      startedAt: params.startedAt,
      endedAt
    };
  }

  private createOutputEvent(
    runId: string,
    action: string,
    stream: GitOutputEvent["stream"],
    text: string
  ): GitOutputEvent {
    return {
      runId,
      action,
      stream,
      text,
      timestamp: new Date().toISOString()
    };
  }
}

function getRefValidationError(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) {
    return "Git ref must not be empty.";
  }

  if (trimmed.startsWith("-")) {
    return `Invalid git ref: ${trimmed}`;
  }

  return null;
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function parseSafeDirectoryFailure(stderr: string, repoPath: string): GitSafeDirectoryInfo | null {
  if (!/detected dubious ownership/i.test(stderr)) {
    return null;
  }

  const recommendedPath = stderr.match(/safe\.directory\s+(.+?)(?:\r?\n|$)/i)?.[1]?.trim();
  const repositoryPath = stderr.match(/repository at ['"](.+?)['"]/i)?.[1]?.trim();
  const fallbackPath = normalizeSafeDirectoryPath(repoPath);
  const safeDirectoryPath =
    recommendedPath ||
    repositoryPath ||
    ("path" in fallbackPath ? fallbackPath.path : repoPath.trim());

  return {
    required: true,
    path: safeDirectoryPath,
    message: "Git blocked this repository because its ownership differs from your current user."
  };
}

function normalizeSafeDirectoryPath(repoPath: string): { path: string } | { error: string } {
  const trimmedRepoPath = repoPath.trim();
  if (!trimmedRepoPath) {
    return {
      error: "Select a repository folder."
    };
  }

  if (!path.isAbsolute(trimmedRepoPath)) {
    return {
      error: "Repository folder must be an absolute path."
    };
  }

  return {
    path: path.normalize(path.resolve(trimmedRepoPath)).replace(/\\/g, "/")
  };
}

function createRunOptions(
  onOutput?: (output: ProcessOutput) => void,
  stdin?: string | Buffer,
  env?: NodeJS.ProcessEnv
): { onOutput?: (output: ProcessOutput) => void; stdin?: string | Buffer; env?: NodeJS.ProcessEnv } | undefined {
  if (!onOutput && stdin === undefined && !env) {
    return undefined;
  }

  return {
    ...(onOutput ? { onOutput } : {}),
    ...(stdin !== undefined ? { stdin } : {}),
    ...(env ? { env } : {})
  };
}

export function createTerminalColorEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv | undefined {
  if (baseEnv.NO_COLOR) {
    return undefined;
  }

  return {
    ...baseEnv,
    FORCE_COLOR: baseEnv.FORCE_COLOR || "1",
    TERM: baseEnv.TERM || "xterm-256color",
    COLORTERM: baseEnv.COLORTERM || "truecolor"
  };
}

function createTerminalColorRunOptions(): { env?: NodeJS.ProcessEnv } {
  const env = createTerminalColorEnv();
  return env ? { env } : {};
}

function createRepositoryAccessCheckFailure(source: string, message: string): GitRepositoryAccessCheckResult {
  return {
    source,
    exitCode: -1,
    stdout: "",
    stderr: message,
    branches: [],
    defaultBranch: null
  };
}

function redactRepositorySourceCredentials(text: string, source: string): string {
  const sourceWithCredentialsRedacted = redactUrlCredentials(source);
  return redactUrlCredentials(text.replaceAll(source, sourceWithCredentialsRedacted));
}

function redactUrlCredentials(text: string): string {
  return text.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^@\s/]+)@/g, "$1***@");
}

function parseRepositoryAccessRefs(stdout: string): { branches: string[]; defaultBranch: string | null } {
  const branches = new Set<string>();
  let defaultBranch: string | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const symrefMatch = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/.exec(trimmedLine);
    if (symrefMatch?.[1]) {
      defaultBranch = symrefMatch[1];
      branches.add(symrefMatch[1]);
      continue;
    }

    const branchMatch = /^[0-9a-f]{40}\s+refs\/heads\/(.+)$/i.exec(trimmedLine);
    if (branchMatch?.[1]) {
      branches.add(branchMatch[1]);
    }
  }

  return {
    branches: [...branches].sort((left, right) => left.localeCompare(right)),
    defaultBranch
  };
}

function sanitizePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
}

function sanitizeRepoPaths(paths: string[]): { paths: string[] } | { error: string } {
  const sanitizedPaths = sanitizePaths(paths);
  if (sanitizedPaths.length === 0) {
    return {
      error: "Select at least one file."
    };
  }

  for (const filePath of sanitizedPaths) {
    const pathResult = sanitizeSingleRepoPath(filePath);
    if ("error" in pathResult) {
      return pathResult;
    }
  }

  return {
    paths: sanitizedPaths
  };
}

function sanitizeSingleRepoPath(filePath: string): { path: string } | { error: string } {
  const trimmedPath = filePath.trim();

  if (!trimmedPath) {
    return {
      error: "Select a file."
    };
  }

  if (path.isAbsolute(trimmedPath)) {
    return {
      error: "File path must be relative to the repository."
    };
  }

  const normalizedPath = path.normalize(trimmedPath);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
    return {
      error: "File path must stay inside the repository."
    };
  }

  return {
    path: trimmedPath
  };
}

function isMissingAuthorIdentityError(result: GitOperationResult): boolean {
  if (result.exitCode === 0) {
    return false;
  }

  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return output.includes("author identity unknown")
    || output.includes("unable to auto-detect email address");
}

function sanitizeCommitHash(hash: string): { hash: string } | { error: string } {
  const trimmedHash = hash.trim();

  if (!/^[0-9a-f]{7,64}$/i.test(trimmedHash)) {
    return {
      error: "Commit hash is invalid."
    };
  }

  return {
    hash: trimmedHash
  };
}

function isResetMode(mode: string): mode is GitResetCommitRequest["mode"] {
  return mode === "soft" || mode === "mixed" || mode === "hard";
}

function sanitizeHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)));
}

function createPathspecInput(paths: string[]): Buffer {
  return Buffer.from(`${paths.join("\0")}\0`, "utf8");
}

function getShellCommand(action: GitConfiguredAction): { command: string; args: string[] } {
  if (action.shell === "powershell") {
    return {
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        action.command
      ]
    };
  }

  if (action.shell === "cmd") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        action.command
      ]
    };
  }

  return {
    command: "bash",
    args: [
      "-lc",
      action.command
    ]
  };
}

function formatCommandArgument(argument: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(argument) ? argument : JSON.stringify(argument);
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizeIgnorePattern(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function shouldEscapeIgnoreSpaces(existing: string): boolean {
  return existing
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#") && /\\ /.test(trimmed);
    });
}

function parseCommitHistory(text: string): GitCommitGraphRow[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const separatorIndex = line.indexOf("\x1f");
      if (separatorIndex === -1) {
        return [];
      }

      const fields = line.slice(separatorIndex + 1).replace(/\x1e$/, "").split("\x1f");
      const [
        hash = "",
        shortHash = "",
        rawRefs = "",
        subject = "",
        authorName = "",
        authorEmail = "",
        authorDate = "",
        relativeDate = "",
        rawParents = ""
      ] = fields;

      if (!hash) {
        return [];
      }

      return [
        {
          hash,
          shortHash,
          parents: splitCommitParents(rawParents),
          refs: parseCommitRefs(rawRefs),
          subject,
          authorName,
          authorEmail,
          authorDate,
          relativeDate
        }
      ];
    });
}

function splitCommitParents(rawParents: string): string[] {
  return rawParents.split(/\s+/).filter((parent) => parent.length > 0);
}

function parseCommitDetails(text: string): Omit<GitCommitDetails, "files"> {
  const [metadata = "", body = ""] = splitAtFirst(text, "\x1e");
  const [
    hash = "",
    shortHash = "",
    rawRefs = "",
    subject = "",
    authorName = "",
    authorEmail = "",
    authorDate = "",
    committerName = "",
    committerEmail = "",
    committerDate = "",
    rawParents = ""
  ] = metadata.split("\x1f");

  return {
    hash,
    shortHash,
    refs: parseCommitRefs(rawRefs),
    subject,
    body: body.trim(),
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    parents: rawParents.trim() ? rawParents.trim().split(/\s+/) : []
  };
}

function parseCommitRefs(text: string): CommitRef[] {
  return text
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
    .map((ref) => {
      if (ref === "HEAD") {
        return {
          name: ref,
          kind: "head"
        };
      }

      const name = ref
        .replace(/^HEAD -> /, "")
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/remotes\//, "")
        .replace(/^tag: refs\/tags\//, "")
        .replace(/^refs\/tags\//, "");

      if (ref.startsWith("tag: ") || ref.startsWith("refs/tags/")) {
        return {
          name,
          kind: "tag"
        };
      }
      if (ref.startsWith("refs/remotes/")) {
        return {
          name,
          kind: "remote"
        };
      }
      if (ref.startsWith("HEAD -> ") || ref.startsWith("refs/heads/")) {
        return {
          name,
          kind: "branch"
        };
      }

      return {
        name,
        kind: "other"
      };
    });
}

function parseCommitNameStatus(text: string): GitCommitChangedFile[] {
  const tokens = text.split("\0").filter((token) => token.length > 0);
  const files: GitCommitChangedFile[] = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index] ?? "";
    index += 1;

    if (/^[RC]\d+/.test(status)) {
      const originalPath = tokens[index] ?? "";
      const filePath = tokens[index + 1] ?? "";
      index += 2;
      files.push({
        path: filePath,
        originalPath,
        status: status[0] ?? status,
        additions: 0,
        deletions: 0
      });
      continue;
    }

    const filePath = tokens[index] ?? "";
    index += 1;
    files.push({
      path: filePath,
      status,
      additions: 0,
      deletions: 0
    });
  }

  return files;
}

function parseCommitNumstat(text: string): Map<string, Pick<GitCommitChangedFile, "additions" | "deletions">> {
  const tokens = text.split("\0");
  const stats = new Map<string, Pick<GitCommitChangedFile, "additions" | "deletions">>();

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    index += 1;
    if (!token) {
      continue;
    }

    const [rawAdditions = "-", rawDeletions = "-", inlinePath = ""] = token.split("\t");
    let filePath = inlinePath;
    if (!filePath) {
      index += 1;
      filePath = tokens[index] ?? "";
      index += 1;
    }

    if (!filePath) {
      continue;
    }

    stats.set(filePath, {
      additions: parseStatNumber(rawAdditions),
      deletions: parseStatNumber(rawDeletions)
    });
  }

  return stats;
}

function mergeCommitFiles(
  files: GitCommitChangedFile[],
  statsByPath: Map<string, Pick<GitCommitChangedFile, "additions" | "deletions">>
): GitCommitChangedFile[] {
  return files.map((file) => {
    const stats = statsByPath.get(file.path);
    return {
      ...file,
      additions: stats?.additions ?? 0,
      deletions: stats?.deletions ?? 0
    };
  }).sort((left, right) => {
    const statusCompare = left.status.localeCompare(right.status);
    return statusCompare === 0 ? left.path.localeCompare(right.path) : statusCompare;
  });
}

function parseStatNumber(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : 0;
}

function splitAtFirst(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  if (index === -1) {
    return [
      text,
      ""
    ];
  }

  return [
    text.slice(0, index),
    text.slice(index + separator.length)
  ];
}

function parsePorcelainStatus(text: string): { files: GitStatusFile[]; statusLines: string[] } {
  const records = text.split("\0").filter((record) => record.length > 0);
  const files: GitStatusFile[] = [];
  const branchLines: string[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";

    if (record.startsWith("# ")) {
      branchLines.push(record);
      continue;
    }

    if (record.startsWith("? ")) {
      const path = record.slice(2);
      files.push(createStatusFile(path, "?", "?", false));
      continue;
    }

    if (record.startsWith("1 ")) {
      const parsed = parseTrackedRecord(record, 8);
      if (parsed) {
        files.push(createStatusFile(parsed.path, parsed.indexStatus, parsed.worktreeStatus, false));
      }
      continue;
    }

    if (record.startsWith("2 ")) {
      const parsed = parseTrackedRecord(record, 9);
      const originalPath = records[index + 1];
      if (parsed) {
        files.push(createStatusFile(parsed.path, parsed.indexStatus, parsed.worktreeStatus, false, originalPath));
      }
      index += 1;
      continue;
    }

    if (record.startsWith("u ")) {
      const parsed = parseTrackedRecord(record, 9);
      if (parsed) {
        files.push(createStatusFile(parsed.path, parsed.indexStatus, parsed.worktreeStatus, true));
      }
    }
  }

  return {
    files,
    statusLines: [
      ...branchLines,
      ...files.map((file) => `${file.indexStatus}${file.worktreeStatus} ${file.path}`)
    ]
  };
}

function parseAheadBehindCounts(statusLines: string[]): { ahead: number; behind: number } | null {
  const aheadBehindLine = statusLines.find((line) => line.startsWith("# branch.ab "));
  const match = /^# branch\.ab \+(?<ahead>\d+) -(?<behind>\d+)$/.exec(aheadBehindLine ?? "");
  if (!match?.groups) {
    return null;
  }

  return {
    ahead: Number.parseInt(match.groups.ahead ?? "0", 10),
    behind: Number.parseInt(match.groups.behind ?? "0", 10)
  };
}

function createInvalidRepoSyncStatus(repoPath: string, error: string): RepoSyncStatus {
  return {
    repoPath,
    kind: "git",
    isValid: false,
    ahead: 0,
    behind: 0,
    error
  };
}

function parseBranches(text: string, currentBranch: string | null): GitBranch[] {
  const branchesByName = new Map<string, GitBranch>();

  for (const line of splitLines(text)) {
    const [name = "", upstream = "", head = ""] = line.split("\t");
    const branchName = name.trim();

    if (!branchName) {
      continue;
    }

    branchesByName.set(branchName, {
      name: branchName,
      current: head.trim() === "*" || branchName === currentBranch,
      upstream: upstream.trim() || null
    });
  }

  if (currentBranch && !branchesByName.has(currentBranch)) {
    branchesByName.set(currentBranch, {
      name: currentBranch,
      current: true,
      upstream: null
    });
  }

  return [...branchesByName.values()].sort((left, right) => {
    if (left.current !== right.current) {
      return left.current ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function parseRemoteDefaultBranch(text: string, remotes: GitRemote[]): GitRemoteBranch | null {
  const remoteNames = [...new Set(remotes.map((remote) => remote.name))]
    .sort((left, right) => right.length - left.length);
  const defaultBranches: GitRemoteBranch[] = [];

  for (const line of splitLines(text)) {
    const [refName = "", , symref = ""] = line.split("\t");
    if (!refName.startsWith("refs/remotes/") || !refName.endsWith("/HEAD") || !symref.trim()) {
      continue;
    }

    const targetPath = symref.trim().replace(/^refs\/remotes\//, "");
    const remote = remoteNames.find((remoteName) => targetPath.startsWith(`${remoteName}/`))
      ?? targetPath.split("/")[0]
      ?? "";
    const branch = remote ? targetPath.slice(remote.length + 1) : "";

    if (!remote || !branch) {
      continue;
    }

    defaultBranches.push({
      name: targetPath,
      remote,
      branch
    });
  }

  return defaultBranches.find((candidate) => candidate.remote === "origin")
    ?? defaultBranches[0]
    ?? null;
}

function parseRemoteBranches(text: string, remotes: GitRemote[]): GitRemoteBranch[] {
  const remoteNames = [...new Set(remotes.map((remote) => remote.name))]
    .sort((left, right) => right.length - left.length);
  const branchesByName = new Map<string, GitRemoteBranch>();

  for (const line of splitLines(text)) {
    const [refName = "", shortName = "", symref = ""] = line.split("\t");
    if (!refName.startsWith("refs/remotes/") || !shortName.trim() || symref.trim()) {
      continue;
    }

    const refPath = refName.slice("refs/remotes/".length);
    const remote = remoteNames.find((remoteName) => refPath.startsWith(`${remoteName}/`))
      ?? refPath.split("/")[0]
      ?? "";
    const branch = remote ? refPath.slice(remote.length + 1) : "";

    if (!remote || !branch) {
      continue;
    }

    branchesByName.set(shortName.trim(), {
      name: shortName.trim(),
      remote,
      branch
    });
  }

  return [...branchesByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function parseTrackedRecord(
  record: string,
  pathFieldIndex: number
): { indexStatus: string; worktreeStatus: string; path: string } | null {
  const fields = record.split(" ");
  const xy = fields[1];
  const path = fields.slice(pathFieldIndex).join(" ");

  if (!xy || xy.length < 2 || !path) {
    return null;
  }

  return {
    indexStatus: xy[0] ?? ".",
    worktreeStatus: xy[1] ?? ".",
    path
  };
}

function createStatusFile(
  path: string,
  indexStatus: string,
  worktreeStatus: string,
  isConflicted: boolean,
  originalPath?: string
): GitStatusFile {
  return {
    path,
    ...(originalPath ? { originalPath } : {}),
    indexStatus,
    worktreeStatus,
    isStaged: isConflicted || (indexStatus !== "." && indexStatus !== "?"),
    isUnstaged: isConflicted || worktreeStatus !== "." || indexStatus === "?",
    isConflicted
  };
}

function normalizeDiffResult(request: GitFileDiffRequest, result: ProcessResult): GitFileDiff {
  const stderr = result.error ? `${result.stderr}${result.error}` : result.stderr;

  if (result.exitCode !== 0) {
    return {
      path: request.path,
      side: request.side,
      kind: "error",
      text: stderr || result.stdout || "Unable to read diff."
    };
  }

  if (!result.stdout.trim()) {
    return {
      path: request.path,
      side: request.side,
      kind: "empty",
      text: "No diff is available for this file."
    };
  }

  if (isBinaryDiff(result.stdout)) {
    return {
      path: request.path,
      side: request.side,
      kind: "binary",
      text: "Binary file diff is not available."
    };
  }

  const truncated = result.stdout.length > DIFF_TEXT_LIMIT;
  return {
    path: request.path,
    side: request.side,
    kind: "text",
    text: truncated ? result.stdout.slice(0, DIFF_TEXT_LIMIT) : result.stdout,
    ...(truncated ? { truncated } : {})
  };
}

function isBinaryDiff(text: string): boolean {
  return /^Binary files .+ differ$/m.test(text) || /^GIT binary patch$/m.test(text);
}

function parseRemotes(text: string): GitRemote[] {
  return splitLines(text).flatMap((line) => {
    const match = /^(?<name>\S+)\s+(?<url>\S+)\s+\((?<direction>fetch|push)\)$/.exec(line);

    if (!match?.groups) {
      return [];
    }

    const { name, url, direction } = match.groups;
    if (!name || !url || (direction !== "fetch" && direction !== "push")) {
      return [];
    }

    return [
      {
        name,
        url,
        direction
      }
    ];
  });
}
