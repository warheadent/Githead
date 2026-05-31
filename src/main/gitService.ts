import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CommitRef,
  GitAction,
  GitBranch,
  GitBranchRequest,
  GitCommitChangedFile,
  GitCommitDetails,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitGraphRow,
  GitCommitHistoryRequest,
  GitCommitRequest,
  GitDiffSide,
  GitFileDiff,
  GitFileDiffRequest,
  GitIgnorePathRequest,
  GitOperationResult,
  GitOutputEvent,
  GitPathRequest,
  GitRemote,
  GitRunRequest,
  GitRunResult,
  GitStatusFile,
  RepoSummary
} from "../shared/types";
import { isGitAction } from "../shared/types";
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

const emptySummary = (repoPath: string, validationErrors: string[]): RepoSummary => ({
  repoPath,
  isValid: false,
  branch: null,
  upstream: null,
  branches: [],
  hasHead: false,
  remotes: [],
  statusLines: [],
  files: [],
  validationErrors
});

const DIFF_TEXT_LIMIT = 250_000;
const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 500;

export class GitService {
  constructor(private readonly runner: ProcessRunner) {}

  async getRepoSummary(repoPath: string): Promise<RepoSummary> {
    const validation = await this.validateRepo(repoPath);

    if (!validation.isValid) {
      return emptySummary(repoPath, validation.validationErrors);
    }

    const [
      branchResult,
      upstreamResult,
      remoteResult,
      statusResult,
      headResult,
      branchesResult
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
      ])
    ]);
    const status = parsePorcelainStatus(statusResult.stdout);
    const branch = branchResult.stdout.trim() || null;

    return {
      repoPath,
      isValid: true,
      branch,
      upstream: upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() || null : null,
      branches: parseBranches(branchesResult.stdout, branch),
      hasHead: headResult.exitCode === 0,
      remotes: parseRemotes(remoteResult.stdout),
      statusLines: status.statusLines,
      files: status.files,
      validationErrors: []
    };
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

  async commitChanges(request: GitCommitRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    if (!request.message.trim()) {
      return this.createOperationFailure(request.repoPath, "Enter a commit message.");
    }

    return this.runGitOperation(request.repoPath, [
      "commit",
      "--file=-"
    ], undefined, `${request.message.trimEnd()}\n`);
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

  async getStagedDiff(repoPath: string): Promise<GitOperationResult> {
    const validation = await this.validateRepo(repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(repoPath, validation.validationErrors.join(" "));
    }

    return this.runGitOperation(repoPath, [
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff"
    ]);
  }

  async revertFileChanges(request: GitFileDiffRequest): Promise<GitOperationResult> {
    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createOperationFailure(request.repoPath, validation.validationErrors.join(" "));
    }

    const pathResult = sanitizeSingleRepoPath(request.path);
    if ("error" in pathResult) {
      return this.createOperationFailure(request.repoPath, pathResult.error);
    }

    if (request.side === "staged") {
      return this.unstageFiles({
        repoPath: request.repoPath,
        paths: [
          pathResult.path
        ]
      });
    }

    const statusFile = await this.getStatusFile(request.repoPath, pathResult.path);
    if (statusFile?.indexStatus === "?") {
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
    ], [
      pathResult.path
    ]);
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
        request,
        startedAt,
        message: "Unsupported git action."
      });
    }

    const validation = await this.validateRepo(request.repoPath);
    if (!validation.isValid) {
      return this.createImmediateFailure({
        runId,
        request,
        startedAt,
        message: validation.validationErrors.join(" ")
      });
    }

    const commandArgs = GIT_ACTION_COMMANDS[request.action];
    const displayCommand = `git -C "${request.repoPath}" ${commandArgs.join(" ")}`;
    onOutput?.(this.createOutputEvent(runId, request.action, "system", `> ${displayCommand}\n`));

    const result = await this.runGit(request.repoPath, commandArgs, (output) => {
      onOutput?.(this.createOutputEvent(runId, request.action, output.stream, output.text));
    });

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

  private async validateRepo(repoPath: string): Promise<Pick<RepoSummary, "isValid" | "validationErrors">> {
    if (!repoPath.trim()) {
      return {
        isValid: false,
        validationErrors: [
          "Select a repository folder."
        ]
      };
    }

    const result = await this.runGit(repoPath, [
      "rev-parse",
      "--is-inside-work-tree"
    ]);

    if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
      return {
        isValid: false,
        validationErrors: [
          "Selected folder is not a git repository."
        ]
      };
    }

    return {
      isValid: true,
      validationErrors: []
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

  private runGit(
    repoPath: string,
    args: string[],
    onOutput?: (output: ProcessOutput) => void,
    stdin?: string | Buffer
  ): Promise<ProcessResult> {
    const options = createRunOptions(onOutput, stdin);

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
      "--",
      filePath
    ]);
  }

  private async getStatusFile(repoPath: string, filePath: string): Promise<GitStatusFile | undefined> {
    const statusResult = await this.runGit(repoPath, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--",
      filePath
    ]);

    return parsePorcelainStatus(statusResult.stdout).files.find((file) => file.path === filePath);
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
    request: GitRunRequest;
    startedAt: string;
    message: string;
  }): GitRunResult {
    return {
      runId: params.runId,
      action: params.request.action,
      repoPath: params.request.repoPath,
      exitCode: -1,
      stdout: "",
      stderr: params.message,
      startedAt: params.startedAt,
      endedAt: new Date().toISOString()
    };
  }

  private createOutputEvent(
    runId: string,
    action: GitAction,
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

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function createRunOptions(
  onOutput?: (output: ProcessOutput) => void,
  stdin?: string | Buffer
): { onOutput?: (output: ProcessOutput) => void; stdin?: string | Buffer } | undefined {
  if (!onOutput && stdin === undefined) {
    return undefined;
  }

  return {
    ...(onOutput ? { onOutput } : {}),
    ...(stdin !== undefined ? { stdin } : {})
  };
}

function sanitizePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
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

function sanitizeHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)));
}

function createPathspecInput(paths: string[]): Buffer {
  return Buffer.from(`${paths.join("\0")}\0`, "utf8");
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
