import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GitAction,
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
  hasHead: false,
  remotes: [],
  statusLines: [],
  files: [],
  validationErrors
});

const DIFF_TEXT_LIMIT = 250_000;

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
      headResult
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
      ])
    ]);
    const status = parsePorcelainStatus(statusResult.stdout);

    return {
      repoPath,
      isValid: true,
      branch: branchResult.stdout.trim() || null,
      upstream: upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() || null : null,
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
