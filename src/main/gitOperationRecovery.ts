import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GitRepositoryOperationAction,
  GitRepositoryOperationActionAvailability,
  GitRepositoryOperationActionRequest,
  GitRepositoryOperationActionResult,
  GitRepositoryOperationKind,
  GitRepositoryOperationState
} from "../shared/types";
import type { ProcessResult, ProcessRunner } from "./processRunner";

const METADATA_FILE_LIMIT = 1024 * 1024;

interface GitOperationLayout {
  gitDir: string;
  commonDir: string;
  mergeHead: string;
  rebaseMerge: string;
  rebaseApply: string;
  cherryPickHead: string;
  revertHead: string;
  sequencer: string;
}

interface MetadataFile {
  exists: boolean;
  text: string;
  signature: string;
}

interface ParsedStatus {
  currentBranch: string | null;
  conflictedPaths: string[];
  hasChanges: boolean;
}

interface DetectedOperation {
  kind: GitRepositoryOperationKind;
  backend: GitRepositoryOperationState["backend"];
  originalBranch: string | null;
  sequence: GitRepositoryOperationState["sequence"];
  metadataSignatures: string[];
}

export class GitOperationRecoveryService {
  constructor(private readonly runner: ProcessRunner) {}

  async resolveMutationScope(repoPath: string): Promise<string> {
    const layout = await this.readLayout(repoPath);
    return layout?.commonDir ?? repoPath;
  }

  async detect(repoPath: string, porcelainStatus?: string): Promise<GitRepositoryOperationState | null> {
    const layout = await this.readLayout(repoPath);
    if (!layout) return null;

    const status = porcelainStatus ?? await this.readStatus(repoPath);
    if (status === null) return null;
    const parsedStatus = parseOperationStatus(status);
    const operation = await detectOperation(layout);
    if (!operation) return null;

    const hasConflicts = parsedStatus.conflictedPaths.length > 0;
    const phase = hasConflicts ? "conflicts" : "ready-to-continue";
    const actions = getOperationActions(operation.kind, hasConflicts, parsedStatus.hasChanges);
    const stateId = createHash("sha256")
      .update(operation.kind)
      .update("\0")
      .update(operation.backend ?? "")
      .update("\0")
      .update(status)
      .update("\0")
      .update(operation.metadataSignatures.join("\0"))
      .digest("hex")
      .slice(0, 24);

    return {
      stateId,
      kind: operation.kind,
      phase,
      backend: operation.backend,
      hasConflicts,
      conflictedPaths: parsedStatus.conflictedPaths,
      sequence: operation.sequence,
      originalBranch: operation.originalBranch ?? (operation.kind === "rebase" ? null : parsedStatus.currentBranch),
      currentBranch: parsedStatus.currentBranch,
      actions,
      summary: formatOperationSummary(operation.kind, phase, parsedStatus.conflictedPaths.length, operation.sequence)
    };
  }

  async runAction(request: GitRepositoryOperationActionRequest): Promise<GitRepositoryOperationActionResult> {
    const current = await this.detect(request.repoPath);
    if (!current || current.kind !== request.expectedKind || current.stateId !== request.expectedStateId) {
      return operationResult(
        request.repoPath,
        -1,
        "",
        "The repository operation changed after the last refresh. Review its current state and try again.",
        "stale",
        current
      );
    }

    const availability = current.actions[request.action];
    if (!availability.supported || !availability.enabled) {
      return operationResult(
        request.repoPath,
        -1,
        "",
        availability.disabledReason ?? `${formatOperationName(current.kind)} does not support ${request.action}.`,
        "failed",
        current
      );
    }

    const command = getGitOperationCommand(current.kind, request.action);
    if (!command) {
      return operationResult(
        request.repoPath,
        -1,
        "",
        `${formatOperationName(current.kind)} does not support ${request.action}.`,
        "failed",
        current
      );
    }

    const result = await this.runGit(request.repoPath, command);
    const next = await this.detect(request.repoPath);
    const stderr = result.error ? `${result.stderr}${result.error}` : result.stderr;
    if (result.exitCode === 0 && next === null) {
      return operationResult(request.repoPath, result.exitCode, result.stdout, stderr, "completed", null);
    }
    if (next) {
      const operationStillActive = result.exitCode === 0 && !stderr.trim()
        ? "Git returned successfully, but a fresh repository read shows that the operation is still active."
        : stderr;
      return operationResult(request.repoPath, result.exitCode, result.stdout, operationStillActive, "active", next);
    }
    return operationResult(request.repoPath, result.exitCode, result.stdout, stderr, "failed", null);
  }

  private async readLayout(repoPath: string): Promise<GitOperationLayout | null> {
    const result = await this.runGit(repoPath, [
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir",
      "--git-path", "MERGE_HEAD",
      "--git-path", "rebase-merge",
      "--git-path", "rebase-apply",
      "--git-path", "CHERRY_PICK_HEAD",
      "--git-path", "REVERT_HEAD",
      "--git-path", "sequencer"
    ]);
    if (result.exitCode !== 0) return null;
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length !== 8) return null;
    const [gitDir, commonDir, mergeHead, rebaseMerge, rebaseApply, cherryPickHead, revertHead, sequencer] = lines;
    if (!gitDir || !commonDir || !mergeHead || !rebaseMerge || !rebaseApply || !cherryPickHead || !revertHead || !sequencer) {
      return null;
    }
    return {
      gitDir: path.resolve(repoPath, gitDir),
      commonDir: path.resolve(repoPath, commonDir),
      mergeHead: path.resolve(repoPath, mergeHead),
      rebaseMerge: path.resolve(repoPath, rebaseMerge),
      rebaseApply: path.resolve(repoPath, rebaseApply),
      cherryPickHead: path.resolve(repoPath, cherryPickHead),
      revertHead: path.resolve(repoPath, revertHead),
      sequencer: path.resolve(repoPath, sequencer)
    };
  }

  private async readStatus(repoPath: string): Promise<string | null> {
    const result = await this.runGit(repoPath, [
      "--no-optional-locks",
      "status",
      "--porcelain=v2",
      "-z",
      "--branch",
      "--untracked-files=all"
    ]);
    return result.exitCode === 0 ? result.stdout : null;
  }

  private runGit(repoPath: string, args: string[]): Promise<ProcessResult> {
    return this.runner.run("git", ["-C", repoPath, ...args]);
  }
}

export function getGitOperationCommand(
  kind: GitRepositoryOperationKind,
  action: GitRepositoryOperationAction
): string[] | null {
  if (action === "skip" && kind === "merge") return null;
  const prefix = action === "continue" ? ["-c", "core.editor=true"] : [];
  return [...prefix, kind, `--${action}`];
}

export function getOperationActions(
  kind: GitRepositoryOperationKind,
  hasConflicts: boolean,
  hasChanges: boolean
): GitRepositoryOperationState["actions"] {
  const continueDisabledReason = hasConflicts
    ? "Resolve every conflict and stage each resolved file before continuing."
    : null;
  return {
    continue: actionAvailability(true, !hasConflicts, continueDisabledReason, false),
    skip: kind === "merge"
      ? actionAvailability(false, false, "Git merge does not support skipping a commit.", false)
      : actionAvailability(true, true, null, true),
    abort: actionAvailability(true, true, null, hasChanges)
  };
}

export function parseOperationStatus(status: string): ParsedStatus {
  const records = status.split("\0").filter(Boolean);
  const conflictedPaths: string[] = [];
  let currentBranch: string | null = null;
  let hasChanges = false;
  for (const record of records) {
    if (record.startsWith("# branch.head ")) {
      const branch = record.slice("# branch.head ".length).trim();
      currentBranch = branch && branch !== "(detached)" ? branch : null;
      continue;
    }
    if (!record.startsWith("# ")) hasChanges = true;
    if (!record.startsWith("u ")) continue;
    const pathValue = record.split(" ").slice(10).join(" ");
    if (pathValue) conflictedPaths.push(pathValue);
  }
  return {
    currentBranch,
    conflictedPaths: [...new Set(conflictedPaths)],
    hasChanges
  };
}

async function detectOperation(layout: GitOperationLayout): Promise<DetectedOperation | null> {
  if (await isDirectory(layout.rebaseMerge)) return detectRebase(layout.rebaseMerge, "merge");
  if (await isDirectory(layout.rebaseApply)) return detectRebase(layout.rebaseApply, "apply");

  const [cherryPickHead, revertHead, sequencerTodo] = await Promise.all([
    readMetadataFile(layout.cherryPickHead),
    readMetadataFile(layout.revertHead),
    readMetadataFile(path.join(layout.sequencer, "todo"))
  ]);
  const sequencerKind = parseSequencerKind(sequencerTodo.text);
  if (revertHead.exists || sequencerKind === "revert") {
    return detectSequencerOperation("revert", layout, revertHead, sequencerTodo);
  }
  if (cherryPickHead.exists || sequencerKind === "cherry-pick") {
    return detectSequencerOperation("cherry-pick", layout, cherryPickHead, sequencerTodo);
  }

  const mergeHead = await readMetadataFile(layout.mergeHead);
  if (mergeHead.exists) {
    return {
      kind: "merge",
      backend: null,
      originalBranch: null,
      sequence: null,
      metadataSignatures: [mergeHead.signature]
    };
  }
  return null;
}

async function detectRebase(directory: string, backend: "merge" | "apply"): Promise<DetectedOperation> {
  const progressFiles = backend === "merge" ? ["msgnum", "end"] : ["next", "last"];
  const [headName, current, total, origHead, stoppedSha, todo, done] = await Promise.all([
    readMetadataFile(path.join(directory, "head-name")),
    readMetadataFile(path.join(directory, progressFiles[0]!)),
    readMetadataFile(path.join(directory, progressFiles[1]!)),
    readMetadataFile(path.join(directory, "orig-head")),
    readMetadataFile(path.join(directory, "stopped-sha")),
    readMetadataFile(path.join(directory, "git-rebase-todo")),
    readMetadataFile(path.join(directory, "done"))
  ]);
  return {
    kind: "rebase",
    backend,
    originalBranch: parseBranchRef(headName.text),
    sequence: parseSequence(current.text, total.text),
    metadataSignatures: [headName, current, total, origHead, stoppedSha, todo, done].map((file) => file.signature)
  };
}

async function detectSequencerOperation(
  kind: "cherry-pick" | "revert",
  layout: GitOperationLayout,
  marker: MetadataFile,
  todo: MetadataFile
): Promise<DetectedOperation> {
  const [head, abortSafety] = await Promise.all([
    readMetadataFile(path.join(layout.sequencer, "head")),
    readMetadataFile(path.join(layout.sequencer, "abort-safety"))
  ]);
  return {
    kind,
    backend: null,
    originalBranch: null,
    sequence: null,
    metadataSignatures: [marker, todo, head, abortSafety].map((file) => file.signature)
  };
}

function actionAvailability(
  supported: boolean,
  enabled: boolean,
  disabledReason: string | null,
  requiresConfirmation: boolean
): GitRepositoryOperationActionAvailability {
  return { supported, enabled, disabledReason, requiresConfirmation };
}

function parseSequence(currentText: string, totalText: string): GitRepositoryOperationState["sequence"] {
  const current = Number.parseInt(currentText.trim(), 10);
  const total = Number.parseInt(totalText.trim(), 10);
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(total) || current < 1 || total < current) return null;
  return { current, total };
}

function parseBranchRef(value: string): string | null {
  const ref = value.trim();
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) || null : null;
}

function parseSequencerKind(todo: string): "cherry-pick" | "revert" | null {
  const command = todo.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
    ?.split(/\s+/, 1)[0];
  if (command === "pick") return "cherry-pick";
  if (command === "revert") return "revert";
  return null;
}

function formatOperationSummary(
  kind: GitRepositoryOperationKind,
  phase: GitRepositoryOperationState["phase"],
  conflictCount: number,
  sequence: GitRepositoryOperationState["sequence"]
): string {
  const name = formatOperationName(kind);
  const progress = sequence ? ` Commit ${sequence.current} of ${sequence.total}.` : "";
  if (phase === "conflicts") {
    return `${name} paused with ${conflictCount} unresolved ${conflictCount === 1 ? "conflict" : "conflicts"}.${progress} Resolve and stage the files before continuing.`;
  }
  return `${name} is paused and ready to continue.${progress}`;
}

export function formatOperationName(kind: GitRepositoryOperationKind): string {
  if (kind === "cherry-pick") return "Cherry-pick";
  return `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function readMetadataFile(filePath: string): Promise<MetadataFile> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return { exists: false, text: "", signature: `${filePath}:not-file` };
    if (stats.size > METADATA_FILE_LIMIT) {
      return { exists: true, text: "", signature: `${filePath}:${stats.size}:${stats.mtimeMs}:oversized` };
    }
    const text = await fs.readFile(filePath, "utf8");
    return { exists: true, text, signature: `${filePath}:${text}` };
  } catch (error) {
    if (isMissing(error)) return { exists: false, text: "", signature: `${filePath}:missing` };
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function operationResult(
  repoPath: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  outcome: GitRepositoryOperationActionResult["outcome"],
  state: GitRepositoryOperationState | null
): GitRepositoryOperationActionResult {
  return { repoPath, exitCode, stdout, stderr, outcome, state };
}
