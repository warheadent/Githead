import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  GitAction,
  GitBranch,
  GitBranchRequest,
  GitRemoteBranchCheckoutRequest,
  GitHubPullRequestCheckoutRequest,
  GitRenameBranchRequest,
  GitDeleteBranchRequest,
  GitAddRemoteRequest,
  GitCloneRequest,
  GitCommitDetails,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitFileResetRequest,
  GitCommitGraphRow,
  GitCommitHashRequest,
  GitCommitHistoryRequest,
  GitCommitRequest,
  GitConfiguredActionRunRequest,
  GitConfiguredActionSaveRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitFileChangesRequest,
  GitFileDiff,
  GitFileDiffRequest,
  GitHubRepository,
  GitHunkRequest,
  GitLfsImageFetchRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitPathRequest,
  GitPublishBranchRequest,
  GitRemoveRemoteRequest,
  GitRemote,
  GitRemoteConfig,
  GitRenameRemoteRequest,
  GitRepositoryAccessCheckRequest,
  GitRepositoryAccessCheckResult,
  GitResetCommitRequest,
  GitRunRequest,
  GitRunResult,
  GitSafeDirectoryRequest,
  GitSetRemoteUrlRequest,
  GitUpstreamRequest,
  GitWorktreeCreateRequest,
  GitWorktreeList,
  GitWorktreeRemovalCheck,
  GitWorktreeRequest,
  GitWorktreeRemoveRequest,
  RepoSummary,
  RepoIdentitySection,
  RepoMetadataSection,
  RepoSectionRequest,
  RepoStatusSection,
  RepoSyncStatus
} from "../shared/types";
import { loreCapabilities } from "../shared/types";
import { createEmptyActionsConfig, readActionsConfig } from "./actionsConfig";
import { validateCloneRequest } from "./cloneValidation";
import type { GitOutputHandler } from "./gitService";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./processRunner";
import { mapRepoSyncStatuses } from "./repoSyncStatus";
import { imageFallbackText, isPreviewableImagePath, readImageFile, type ImageReadResult } from "./imageDiff";
import type { VcsService } from "./vcsService";
import {
  type LoreRevision,
  normalizeLoreDiff,
  parseLoreBranchList,
  parseLoreHistory,
  parseLoreRevision,
  parseLoreStatus
} from "./loreParsers";

const NOT_IMPLEMENTED = "This operation is not yet available for Lore repositories.";
const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 500;
const HASH_PATTERN = /^[0-9a-f]{7,64}$/i;
const REPOSITORY_ACCESS_CHECK_TIMEOUT_MS = 30_000;

/**
 * Maps Githead's three sync actions onto Lore commands. Lore is centralized and
 * has no true "fetch", so the renderer hides Fetch (capabilities.fetch=false)
 * and surfaces Sync instead; if invoked anyway, fetch performs a read-only
 * rescan. "pull" maps to `lore sync`, "push" to `lore push`.
 */
const LORE_ACTION_COMMANDS: Record<GitAction, string[]> = {
  fetch: [
    "status",
    "--scan"
  ],
  pull: [
    "sync"
  ],
  push: [
    "push"
  ]
};

/**
 * Lore (lore.org) backend, tested against `lore` CLI v0.8.x. Mirrors
 * {@link GitService}'s public surface via {@link VcsService} so `main.ts` routes
 * to it per repository.
 *
 * Read paths (status/history/diff) are implemented (Stage 2). Mutating ops are
 * Stage 3 and currently return structured failures; git-only features (hunk
 * staging, tags, upstream, safe.directory, ignore files) are unsupported and
 * hidden by the renderer via {@link RepoCapabilities}.
 *
 * All commands funnel through {@link runLore}, the analog of GitService's
 * `runGit`: `lore --repository <path> -P <args…>` (`-P` disables the pager).
 */
export class LoreService implements VcsService {
  constructor(private readonly runner: ProcessRunner) {}

  async getRepoSummary(repoPath: string): Promise<RepoSummary> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return this.invalidSummary(repoPath, validation.error);
    }
    const rootPath = validation.rootPath;

    const [statusResult, branchResult, actionsConfig, remoteUrl] = await Promise.all([
      this.runLore(rootPath, [
        "status",
        "--scan"
      ]),
      this.runLore(rootPath, [
        "branch",
        "list"
      ]),
      readActionsConfig(rootPath).catch(() => createEmptyActionsConfig()),
      this.readRemoteUrl(rootPath)
    ]);

    const status = parseLoreStatus(statusResult.stdout);
    const branches: GitBranch[] = parseLoreBranchList(branchResult.stdout).map((branch) => ({
      name: branch.name,
      current: branch.current,
      upstream: null
    }));
    const currentBranch = status.branch ?? branches.find((branch) => branch.current)?.name ?? null;
    const remotes: GitRemote[] = remoteUrl
      ? [
          {
            name: "origin",
            url: remoteUrl,
            direction: "fetch"
          }
        ]
      : [];

    return {
      repoPath: rootPath,
      kind: "lore",
      capabilities: loreCapabilities(),
      isValid: true,
      branch: currentBranch,
      upstream: null,
      branches,
      hasHead: (status.revisionNumber ?? 0) > 0,
      remotes,
      remoteBranches: [],
      defaultRemoteBranch: null,
      commitsAheadOfDefaultBranch: null,
      githubRepository: null,
      statusLines: [],
      files: status.files,
      safeDirectory: null,
      actionsConfig,
      validationErrors: []
    };
  }

  async getRepoIdentity(request: RepoSectionRequest): Promise<RepoIdentitySection> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) return { repoPath: request.repoPath, generation: request.generation, kind: "lore", capabilities: loreCapabilities(), isValid: false, branch: null, hasHead: false, safeDirectory: null, validationErrors: [validation.error] };
    const result = await this.runLore(validation.rootPath, ["status"]);
    const status = parseLoreStatus(result.stdout);
    return { repoPath: validation.rootPath, generation: request.generation, kind: "lore", capabilities: loreCapabilities(), isValid: true, branch: status.branch, hasHead: (status.revisionNumber ?? 0) > 0, safeDirectory: null, validationErrors: [] };
  }

  async getRepoStatus(request: RepoSectionRequest): Promise<RepoStatusSection> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) throw new Error(validation.error);
    const status = parseLoreStatus((await this.runLore(validation.rootPath, ["status", "--scan"])).stdout);
    return { repoPath: validation.rootPath, generation: request.generation, statusLines: [], files: status.files };
  }

  async getRepoMetadata(request: RepoSectionRequest): Promise<RepoMetadataSection> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) throw new Error(validation.error);
    const [branchesResult, actionsConfig, remoteUrl] = await Promise.all([this.runLore(validation.rootPath, ["branch", "list"]), readActionsConfig(validation.rootPath).catch(() => createEmptyActionsConfig()), this.readRemoteUrl(validation.rootPath)]);
    const branches = parseLoreBranchList(branchesResult.stdout).map((branch) => ({ name: branch.name, current: branch.current, upstream: null }));
    const remotes: GitRemote[] = remoteUrl ? [{ name: "origin", url: remoteUrl, direction: "fetch" }] : [];
    return { repoPath: validation.rootPath, generation: request.generation, upstream: null, branches, remotes, remoteBranches: [], defaultRemoteBranch: null, commitsAheadOfDefaultBranch: null, githubRepository: null, actionsConfig };
  }

  async getRepoSyncStatus(repoPath: string): Promise<RepoSyncStatus> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return {
        repoPath,
        kind: "lore",
        isValid: false,
        ahead: 0,
        behind: 0,
        error: validation.error
      };
    }

    // Lore is centralized; ahead/behind requires the server and is not derived
    // offline. Richer sync counts land in a later stage.
    return {
      repoPath: validation.rootPath,
      kind: "lore",
      isValid: true,
      ahead: 0,
      behind: 0,
      error: ""
    };
  }

  async getRepoSyncStatuses(repoPaths: string[]): Promise<RepoSyncStatus[]> {
    return mapRepoSyncStatuses(repoPaths, (repoPath) => this.getRepoSyncStatus(repoPath));
  }

  async getWorktrees(repoPath: string): Promise<GitWorktreeList> {
    return { commonDir: path.resolve(repoPath), worktrees: [] };
  }

  async createWorktree(request: GitWorktreeCreateRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Worktrees are not supported for Lore repositories.");
  }

  async checkWorktreeRemoval(request: GitWorktreeRequest): Promise<GitWorktreeRemovalCheck> {
    return { repoPath: request.repoPath, worktreePath: request.worktreePath, canRemove: false, canForceRemove: false, isClean: false, reason: "Worktrees are not supported for Lore repositories." };
  }

  async removeWorktree(request: GitWorktreeRemoveRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Worktrees are not supported for Lore repositories.");
  }

  async getGitHubRepository(_repoPath: string): Promise<GitHubRepository | null> {
    return null;
  }

  async getCommitHistory(request: GitCommitHistoryRequest): Promise<GitCommitGraphRow[]> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return [];
    }

    const limit = clampHistoryLimit(request.limit);
    const result = await this.runLore(validation.rootPath, [
      "history",
      String(limit)
    ]);
    if (result.exitCode !== 0) {
      return [];
    }

    const revisions = parseLoreHistory(result.stdout);
    // Lore prints history newest-first, so each revision's parent is the next
    // block. This renders linear history exactly; merge commits (a second
    // parent) are refined in a later stage.
    return revisions.map((revision, index) => this.toGraphRow(revision, revisions[index + 1] ?? null));
  }

  async getCommitDetails(request: GitCommitDetailsRequest): Promise<GitCommitDetails> {
    const hash = sanitizeHash(request.hash);
    if (!hash) {
      throw new Error("Revision signature is invalid.");
    }

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const [infoResult, parent] = await Promise.all([
      this.runLore(validation.rootPath, [
        "revision",
        "info",
        hash,
        "--delta"
      ]),
      this.getParentSignature(validation.rootPath, hash)
    ]);

    const revision = parseLoreRevision(infoResult.stdout);
    if (!revision) {
      throw new Error(infoResult.stderr.trim() || "Revision not found.");
    }

    return {
      hash: revision.signature,
      shortHash: shortHash(revision.signature),
      refs: [],
      subject: revision.subject,
      body: revision.body,
      authorName: revision.authorName,
      authorEmail: revision.authorEmail,
      authorDate: revision.date,
      committerName: revision.committerName,
      committerEmail: revision.committerEmail,
      committerDate: revision.date,
      parents: parent ? [
        parent
      ] : [],
      files: revision.files
    };
  }

  async getFileDiff(request: GitFileDiffRequest): Promise<GitFileDiff> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.diffError(request.path, request.side, validation.error);
    }

    if (!request.path.trim()) {
      return {
        path: request.path,
        side: request.side,
        kind: "empty",
        text: ""
      };
    }

    // Lore records staging as intent without materializing an index, so the
    // working-tree diff against the synced revision serves both sides.
    const result = await this.runLore(validation.rootPath, [
      "diff",
      request.path
    ]);
    if (result.exitCode !== 0) {
      return this.diffError(request.path, request.side, result.stderr.trim() || "Unable to read diff.");
    }

    const text = normalizeLoreDiff(result.stdout);
    if (text && isPreviewableImagePath(request.path)) {
      return await this.getWorkingImageDiff(validation.rootPath, request);
    }
    return {
      path: request.path,
      side: request.side,
      kind: text ? "text" : "empty",
      text
    };
  }

  async getCommitFileDiff(request: GitCommitFileDiffRequest): Promise<GitFileDiff> {
    const hash = sanitizeHash(request.hash);
    if (!hash) {
      return this.diffError(request.path, "unstaged", "Revision signature is invalid.");
    }

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.diffError(request.path, "unstaged", validation.error);
    }

    const parent = await this.getParentSignature(validation.rootPath, hash);
    if (!parent) {
      if (isPreviewableImagePath(request.path)) {
        const currentPath = safeRelativePath(request.path);
        if (currentPath) {
          return this.buildImageDiff(request.path, "unstaged", { kind: "missing" }, await this.readLoreRevisionImage(validation.rootPath, hash, currentPath));
        }
      }
      // A root revision has no earlier state, and Lore cannot diff against the
      // empty revision (`--source <zeros>` errors), so there is nothing to show.
      return {
        path: request.path,
        side: "unstaged",
        kind: "empty",
        text: "This is the initial revision; Lore cannot diff it against an earlier state."
      };
    }

    const result = await this.runLore(validation.rootPath, [
      "diff",
      "--source",
      parent,
      "--target",
      hash,
      request.path
    ]);
    if (result.exitCode !== 0) {
      return this.diffError(request.path, "unstaged", result.stderr.trim() || "Unable to read diff.");
    }

    const text = normalizeLoreDiff(result.stdout);
    if (text && isPreviewableImagePath(request.path)) {
      return await this.getCommitImageDiff(validation.rootPath, request, parent);
    }
    return {
      path: request.path,
      side: "unstaged",
      kind: text ? "text" : "empty",
      text
    };
  }

  async getStagedDiff(repoPath: string): Promise<GitOperationResult> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return this.failure(repoPath, validation.error);
    }

    const result = await this.runLore(validation.rootPath, [
      "diff"
    ]);
    return {
      repoPath,
      exitCode: result.exitCode,
      stdout: normalizeLoreDiff(result.stdout),
      stderr: result.stderr
    };
  }

  // --- Mutating operations (Stage 3) -------------------------------------

  async checkRepositoryAccess(request: GitRepositoryAccessCheckRequest): Promise<GitRepositoryAccessCheckResult> {
    const source = request.source.trim();
    if (!source) {
      return {
        source,
        exitCode: -1,
        stdout: "",
        stderr: "Enter a repository URL or path.",
        branches: [],
        defaultBranch: null
      };
    }

    const result = await this.runner.run("lore", [
      "-P",
      "repository",
      "info",
      source
    ], {
      timeoutMs: REPOSITORY_ACCESS_CHECK_TIMEOUT_MS
    });

    // Lore's branch listing for a remote requires server negotiation; the clone
    // form degrades to a free-text branch input when no branches are returned.
    return {
      source,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: combineStderr(result),
      branches: [],
      defaultBranch: null
    };
  }

  async cloneRepository(request: GitCloneRequest): Promise<GitOperationResult> {
    const validation = await validateCloneRequest(request);
    if ("error" in validation) {
      return this.failure(request.parentPath, validation.error);
    }

    const args = [
      "-P",
      "clone",
      validation.source,
      validation.directoryName,
      ...(validation.branchName ? [
        "--branch",
        validation.branchName
      ] : [])
    ];
    const result = await this.runner.run("lore", args, {
      cwd: validation.parentPath
    });

    return {
      repoPath: validation.destinationPath,
      exitCode: result.exitCode,
      stdout: result.stdout || (result.exitCode === 0 ? "Repository cloned." : ""),
      stderr: combineStderr(result)
    };
  }

  async writeCommitFileVersionToPath(
    repoPath: string,
    hash: string,
    filePath: string,
    outputPath: string
  ): Promise<{ exitCode: number; stderr: string; error?: string }> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return {
        exitCode: -1,
        stderr: validation.error
      };
    }

    const revision = sanitizeHash(hash);
    if (!revision) {
      return {
        exitCode: -1,
        stderr: "Revision signature is invalid."
      };
    }

    const result = await this.runLore(validation.rootPath, [
      "file",
      "write",
      "--path",
      filePath,
      "--revision",
      revision,
      "--output",
      outputPath
    ]);
    return {
      exitCode: result.exitCode,
      stderr: combineStderr(result)
    };
  }

  async stageFiles(request: GitPathRequest): Promise<GitOperationResult> {
    return this.runPathCommand(request.repoPath, "stage", request.paths, "No files to stage.");
  }

  async unstageFiles(request: GitPathRequest): Promise<GitOperationResult> {
    return this.runPathCommand(request.repoPath, "unstage", request.paths, "No files to unstage.");
  }

  async commitChanges(request: GitCommitRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    if (!request.message.trim()) {
      return this.failure(request.repoPath, "Commit message is required.");
    }

    // The message is a positional argument (not `-m`); `shell: false` keeps a
    // multi-line message safe. Lore requires an identity in .lore/config.toml
    // and surfaces a clear error if it is missing, which we pass through.
    const result = await this.runLore(validation.rootPath, [
      "commit",
      request.message
    ]);
    return this.toOperationResult(request.repoPath, result);
  }

  async resetFilesToCommit(request: GitCommitFileResetRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    const hash = sanitizeHash(request.hash);
    if (!hash) {
      return this.failure(request.repoPath, "Revision signature is invalid.");
    }

    const paths = cleanPaths(request.paths);
    if (paths.length === 0) {
      return this.failure(request.repoPath, "No files to reset.");
    }

    const result = await this.runLore(validation.rootPath, [
      "reset",
      "--revision",
      hash,
      ...paths
    ]);
    return this.toOperationResult(request.repoPath, result);
  }

  async revertFileChanges(request: GitFileChangesRequest): Promise<GitOperationResult> {
    return this.runPathCommand(request.repoPath, "reset", request.paths, "No files to revert.");
  }

  async resetBranchToCommit(request: GitResetCommitRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    const hash = sanitizeHash(request.hash);
    if (!hash) {
      return this.failure(request.repoPath, "Revision signature is invalid.");
    }

    // Lore has a single reset behavior; the soft/mixed/hard mode does not apply
    // (capabilities.resetModes is false, so the UI hides the selector).
    const result = await this.runLore(validation.rootPath, [
      "branch",
      "reset",
      hash
    ]);
    return this.toOperationResult(request.repoPath, result);
  }

  async revertCommit(request: GitCommitHashRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    const hash = sanitizeHash(request.hash);
    if (!hash) {
      return this.failure(request.repoPath, "Revision signature is invalid.");
    }

    const result = await this.runLore(validation.rootPath, [
      "revision",
      "revert",
      hash
    ]);
    return this.toOperationResult(request.repoPath, result);
  }

  async switchBranch(request: GitBranchRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    const branch = request.branchName.trim();
    if (!branch) {
      return this.failure(request.repoPath, "Branch name is required.");
    }

    const result = await this.runLore(validation.rootPath, [
      "branch",
      "switch",
      branch
    ]);
    return this.toOperationResult(request.repoPath, result);
  }

  async createBranch(request: GitBranchRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.failure(request.repoPath, validation.error);
    }

    const branch = request.branchName.trim();
    if (!branch) {
      return this.failure(request.repoPath, "Branch name is required.");
    }

    // Mirror `git checkout -b`: create the branch, then switch to it.
    const created = await this.runLore(validation.rootPath, [
      "branch",
      "create",
      branch
    ]);
    if (created.exitCode !== 0) {
      return this.toOperationResult(request.repoPath, created);
    }

    const switched = await this.runLore(validation.rootPath, [
      "branch",
      "switch",
      branch
    ]);
    return {
      repoPath: request.repoPath,
      exitCode: switched.exitCode,
      stdout: `${created.stdout}${switched.stdout}`,
      stderr: combineStderr(switched)
    };
  }

  async runGitAction(request: GitRunRequest, onOutput?: GitOutputHandler): Promise<GitRunResult> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID();

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return {
        runId,
        action: request.action,
        repoPath: request.repoPath,
        exitCode: -1,
        stdout: "",
        stderr: validation.error,
        startedAt,
        endedAt: startedAt
      };
    }

    const args = LORE_ACTION_COMMANDS[request.action] ?? [
      "sync"
    ];
    const options: ProcessRunOptions = {};
    if (onOutput) {
      options.onOutput = (output) =>
        onOutput({
          runId,
          action: request.action,
          stream: output.stream,
          text: output.text,
          timestamp: new Date().toISOString()
        });
    }
    const result = await this.runLore(validation.rootPath, args, options);
    const endedAt = new Date().toISOString();
    onOutput?.({
      runId,
      action: request.action,
      stream: "system",
      text: `\n${request.action} exited with code ${result.exitCode}.\n`,
      timestamp: endedAt
    });

    return {
      runId,
      action: request.action,
      repoPath: request.repoPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: combineStderr(result),
      startedAt,
      endedAt
    };
  }

  async runConfiguredAction(request: GitConfiguredActionRunRequest): Promise<GitRunResult> {
    return this.runFailure(request.repoPath, request.name.trim() || "Actions", NOT_IMPLEMENTED);
  }

  async saveConfiguredActions(request: GitConfiguredActionSaveRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, NOT_IMPLEMENTED);
  }

  // --- Unsupported on Lore (hidden by capabilities) ----------------------

  async stageHunk(request: GitHunkRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Hunk staging is not supported for Lore repositories.");
  }

  async unstageHunk(request: GitHunkRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Hunk staging is not supported for Lore repositories.");
  }

  async createTag(request: GitCreateTagRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Tags are not supported for Lore repositories.");
  }

  async deleteTag(request: GitDeleteTagRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Tags are not supported for Lore repositories.");
  }

  async setBranchUpstream(request: GitUpstreamRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Setting an upstream is not supported for Lore repositories.");
  }

  async publishBranch(request: GitPublishBranchRequest): Promise<GitRunResult> {
    return this.runFailure(request.repoPath, "publish", "Publishing branches is not supported for Lore repositories.");
  }

  async checkoutRemoteBranch(request: GitRemoteBranchCheckoutRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Remote branch checkout is not supported for Lore repositories.");
  }

  async checkoutGitHubPullRequest(request: GitHubPullRequestCheckoutRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "GitHub pull request checkout is not supported for Lore repositories.");
  }

  async renameBranch(request: GitRenameBranchRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Renaming branches is not supported for Lore repositories.");
  }

  async deleteBranch(request: GitDeleteBranchRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) return this.failure(request.repoPath, validation.error);
    const branchName = request.branchName.trim();
    if (!branchName) return this.failure(request.repoPath, "Branch name is required.");
    if (request.force) return this.failure(request.repoPath, "Force removal is not supported for Lore repositories.");
    const listed = await this.runLore(validation.rootPath, ["branch", "list"]);
    if (listed.exitCode !== 0) return this.toOperationResult(request.repoPath, listed);
    const branches = parseLoreBranchList(listed.stdout);
    const branch = branches.find((candidate) => candidate.name === branchName);
    if (!branch) return this.failure(request.repoPath, "Branch does not exist.");
    if (branch.current) return this.failure(request.repoPath, "Switch to another branch before archiving this branch.");
    const result = await this.runLore(validation.rootPath, ["branch", "archive", branchName]);
    return this.toOperationResult(request.repoPath, result);
  }

  async fetchLfsImageVersions(request: GitLfsImageFetchRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Git LFS image downloads are not supported for Lore repositories.");
  }

  async getRemoteConfigs(repoPath: string): Promise<GitRemoteConfig[]> {
    const remoteUrl = await this.readRemoteUrl(repoPath);
    return remoteUrl
      ? [{ name: "origin", fetchUrls: [remoteUrl], pushUrls: [], trackedBranches: [] }]
      : [];
  }

  async addRemote(request: GitAddRemoteRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Managing remotes is not supported for Lore repositories.");
  }

  async renameRemote(request: GitRenameRemoteRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Managing remotes is not supported for Lore repositories.");
  }

  async setRemoteUrl(request: GitSetRemoteUrlRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Managing remotes is not supported for Lore repositories.");
  }

  async removeRemote(request: GitRemoveRemoteRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Managing remotes is not supported for Lore repositories.");
  }

  async addPathToIgnore(request: GitIgnorePathRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Ignore files are not supported for Lore repositories.");
  }

  async addSafeDirectory(request: GitSafeDirectoryRequest): Promise<GitOperationResult> {
    return this.failure(request.repoPath, "Safe-directory configuration is not applicable to Lore repositories.");
  }

  // --- Internals ---------------------------------------------------------

  private runLore(repoPath: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    // `lore` resolves relative path arguments (diff/stage/unstage/reset paths)
    // against the process CWD, not `--repository` — so the working directory
    // must be the repo, mirroring `git -C`. Without this, path-relative commands
    // break whenever Githead's CWD differs from the repo (e.g. the packaged app
    // runs from its install directory).
    return this.runner.run("lore", [
      "--repository",
      repoPath,
      "-P",
      ...args
    ], {
      ...options,
      cwd: repoPath
    });
  }

  private async getWorkingImageDiff(repoPath: string, request: GitFileDiffRequest): Promise<GitFileDiff> {
    const relativePath = safeRelativePath(request.path);
    if (!relativePath) return this.diffError(request.path, request.side, "Image preview is unavailable.");
    const statusResult = await this.runLore(repoPath, ["status"]);
    const revision = parseLoreStatus(statusResult.stdout).revisionSignature;
    const before = revision ? await this.readLoreRevisionImage(repoPath, revision, relativePath) : { kind: "missing" } as ImageReadResult;
    const after = await readImageFile(path.resolve(repoPath, relativePath), relativePath);
    return this.buildImageDiff(request.path, request.side, before, after);
  }

  private async getCommitImageDiff(repoPath: string, request: GitCommitFileDiffRequest, parent: string): Promise<GitFileDiff> {
    const currentPath = safeRelativePath(request.path);
    const previousPath = safeRelativePath(request.originalPath ?? request.path);
    if (!currentPath || !previousPath) return this.diffError(request.path, "unstaged", "Image preview is unavailable.");
    const before = await this.readLoreRevisionImage(repoPath, parent, previousPath);
    const after = await this.readLoreRevisionImage(repoPath, request.hash, currentPath);
    return this.buildImageDiff(request.path, "unstaged", before, after);
  }

  private async readLoreRevisionImage(repoPath: string, revision: string, filePath: string): Promise<ImageReadResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "githead-image-"));
    const outputPath = path.join(tempDir, "image");
    try {
      const result = await this.runLore(repoPath, ["file", "write", "--path", filePath, "--revision", revision, "--output", outputPath]);
      if (result.exitCode !== 0) return { kind: "missing" };
      return await readImageFile(outputPath, filePath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildImageDiff(pathValue: string, side: GitFileDiff["side"], before: ImageReadResult, after: ImageReadResult): GitFileDiff {
    const acceptable = (value: ImageReadResult) => value.kind === "image" || value.kind === "missing";
    if (!acceptable(before) || !acceptable(after) || (before.kind === "missing" && after.kind === "missing")) {
      return { path: pathValue, side, kind: "binary", text: imageFallbackText([before, after]) };
    }
    return { path: pathValue, side, kind: "image", text: "", before: before.kind === "image" ? { status: "available", version: before.version } : { status: "absent" }, after: after.kind === "image" ? { status: "available", version: after.version } : { status: "absent" } };
  }

  private async runPathCommand(
    repoPath: string,
    command: string,
    requestedPaths: string[],
    emptyMessage: string
  ): Promise<GitOperationResult> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return this.failure(repoPath, validation.error);
    }

    const paths = cleanPaths(requestedPaths);
    if (paths.length === 0) {
      return this.failure(repoPath, emptyMessage);
    }

    const result = await this.runLore(validation.rootPath, [
      command,
      ...paths
    ]);
    return this.toOperationResult(repoPath, result);
  }

  private toOperationResult(repoPath: string, result: ProcessResult): GitOperationResult {
    return {
      repoPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: combineStderr(result)
    };
  }

  private async validateRepo(repoPath: string): Promise<
    | { isValid: true; error: ""; rootPath: string }
    | { isValid: false; error: string; rootPath: null }
  > {
    if (!repoPath?.trim()) {
      return {
        isValid: false,
        error: "Repository path is empty.",
        rootPath: null
      };
    }

    const rootPath = await findLoreRoot(repoPath);
    if (!rootPath) {
      return {
        isValid: false,
        error: "Selected folder is not a Lore repository.",
        rootPath: null
      };
    }

    const status = await this.runLore(rootPath, [
      "status"
    ]);
    if (status.exitCode !== 0) {
      return {
        isValid: false,
        error: status.stderr.trim() || "Unable to read Lore repository status.",
        rootPath: null
      };
    }

    return {
      isValid: true,
      error: "",
      rootPath
    };
  }

  private async readRemoteUrl(repoPath: string): Promise<string | null> {
    const configPath = path.join(repoPath, ".lore", "config.toml");
    const text = await fs.readFile(configPath, "utf8").catch(() => null);
    if (!text) {
      return null;
    }

    const match = /^\s*remote_url\s*=\s*"(?<url>[^"]*)"/m.exec(text);
    return match?.groups?.url?.trim() || null;
  }

  private async getParentSignature(repoPath: string, hash: string): Promise<string | null> {
    const result = await this.runLore(repoPath, [
      "history",
      "--revision",
      hash,
      "2"
    ]);
    if (result.exitCode !== 0) {
      return null;
    }

    const revisions = parseLoreHistory(result.stdout);
    return revisions[1]?.signature ?? null;
  }

  private toGraphRow(revision: LoreRevision, parent: LoreRevision | null): GitCommitGraphRow {
    return {
      hash: revision.signature,
      shortHash: shortHash(revision.signature),
      parents: parent ? [
        parent.signature
      ] : [],
      refs: [],
      subject: revision.subject,
      authorName: revision.authorName,
      authorEmail: revision.authorEmail,
      authorDate: revision.date,
      relativeDate: relativeDate(revision.date)
    };
  }

  private invalidSummary(repoPath: string, error: string): RepoSummary {
    return {
      repoPath,
      kind: "lore",
      capabilities: loreCapabilities(),
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
      safeDirectory: null,
      actionsConfig: createEmptyActionsConfig(),
      validationErrors: [
        error
      ]
    };
  }

  private diffError(filePath: string, side: GitFileDiff["side"], text: string): GitFileDiff {
    return {
      path: filePath,
      side,
      kind: "error",
      text
    };
  }

  private failure(repoPath: string, stderr: string): GitOperationResult {
    return {
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr
    };
  }

  private runFailure(repoPath: string, action: string, stderr: string): GitRunResult {
    const now = new Date().toISOString();
    return {
      runId: "lore-unsupported",
      action,
      repoPath,
      exitCode: -1,
      stdout: "",
      stderr,
      startedAt: now,
      endedAt: now
    };
  }
}

function safeRelativePath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed || path.isAbsolute(trimmed)) return null;
  const normalized = path.normalize(trimmed);
  return normalized === ".." || normalized.startsWith(`..${path.sep}`) ? null : trimmed;
}

function sanitizeHash(hash: string): string | null {
  const trimmed = hash.trim();
  return HASH_PATTERN.test(trimmed) ? trimmed : null;
}

function cleanPaths(paths: string[]): string[] {
  return paths.map((value) => value.trim()).filter((value) => value.length > 0);
}

function combineStderr(result: ProcessResult): string {
  return result.error ? `${result.stderr}${result.error}` : result.stderr;
}

async function findLoreRoot(repoPath: string): Promise<string | null> {
  let current = path.resolve(repoPath);

  while (true) {
    const stats = await fs.stat(path.join(current, ".lore")).catch(() => null);
    if (stats?.isDirectory()) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function shortHash(signature: string): string {
  return signature.slice(0, 8);
}

function clampHistoryLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_HISTORY_LIMIT);
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) {
    return "just now";
  }

  const units: Array<{ label: string; seconds: number }> = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 }
  ];

  for (const unit of units) {
    const value = Math.floor(seconds / unit.seconds);
    if (value >= 1) {
      return `${value} ${unit.label}${value === 1 ? "" : "s"} ago`;
    }
  }

  return "just now";
}
