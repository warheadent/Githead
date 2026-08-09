import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GitAmendErrorKind,
  GitAmendExecuteRequest,
  GitAmendMode,
  GitAmendPreview,
  GitAmendPreviewRequest,
  GitAmendPreviewResult,
  GitAmendRecoveryPoint,
  GitAmendRestoreRequest,
  GitAmendRestoreResult,
  GitAmendResult,
  GitAmendStagedFile,
  GitRepositoryOperationState
} from "../shared/types";
import { createGitAmendCommandPlan, normalizeCommitMessage } from "./gitAmendPlan";
import { GitOperationRecoveryService } from "./gitOperationRecovery";
import type { ProcessOutput, ProcessResult, ProcessRunner } from "./processRunner";

const RECOVERY_REF_PREFIX = "refs/githead/amend-recovery/";
const RECOVERY_REF_LIMIT = 20;
const RECOVERY_REF_PATTERN = /^refs\/githead\/amend-recovery\/[0-9]{13}-[0-9a-f-]{36}$/;

interface HeadMetadata {
  oid: string;
  shortOid: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  commitDate: string;
  message: string;
  treeOid: string;
}

interface AmendSnapshot {
  repoPath: string;
  repositoryId: string;
  gitDir: string;
  commonDir: string;
  branch: string | null;
  head: HeadMetadata;
  indexFingerprint: string;
  indexTreeOid: string;
  stagedFiles: GitAmendStagedFile[];
  hasStagedChanges: boolean;
  upstream: string | null;
  publication: GitAmendPreview["publication"];
  publishedRefs: string[];
  operation: GitRepositoryOperationState | null;
}

interface CompletionVerification {
  ok: boolean;
  message: string;
  head: HeadMetadata | null;
}

export class GitAmendService {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly recovery: GitOperationRecoveryService
  ) {}

  async preview(request: GitAmendPreviewRequest): Promise<GitAmendPreviewResult> {
    try {
      const snapshot = await this.readSnapshot(request.repoPath);
      const defaultMode = selectDefaultMode(request.source, snapshot.hasStagedChanges);
      const mode = request.mode ?? defaultMode;
      if (!isAmendMode(mode)) {
        return previewFailure("The amend mode is invalid.");
      }

      const blockingReasons: string[] = [];
      if (snapshot.operation) {
        blockingReasons.push(`Finish or abort the active ${formatOperationName(snapshot.operation.kind)} before amending.`);
      }
      if (mode !== "message-only" && !snapshot.hasStagedChanges) {
        blockingReasons.push("Stage at least one change before using this amend mode.");
      }

      const snapshotId = createSnapshotId(snapshot, mode);
      const recoveryPoints = await this.readRecoveryPoints(snapshot);
      const preview: GitAmendPreview = {
        repoPath: request.repoPath,
        repositoryId: snapshot.repositoryId,
        snapshotId,
        source: request.source,
        mode,
        defaultMode,
        currentBranch: snapshot.branch,
        headOid: snapshot.head.oid,
        shortHeadOid: snapshot.head.shortOid,
        subject: snapshot.head.subject,
        message: snapshot.head.message,
        authorName: snapshot.head.authorName,
        authorEmail: snapshot.head.authorEmail,
        commitDate: snapshot.head.commitDate,
        stagedFiles: snapshot.stagedFiles,
        indexFingerprint: snapshot.indexFingerprint,
        upstream: snapshot.upstream,
        publication: snapshot.publication,
        publishedRefs: snapshot.publishedRefs,
        blockingReasons,
        recoveryPoints
      };
      return {
        outcome: blockingReasons.length > 0 ? "blocked" : "ready",
        preview,
        message: blockingReasons.length > 0 ? blockingReasons.join(" ") : "Review and confirm the amend."
      };
    } catch (error) {
      return previewFailure(error instanceof Error ? error.message : "Unable to inspect the last commit.");
    }
  }

  async execute(
    request: GitAmendExecuteRequest,
    onOutput?: (output: ProcessOutput) => void
  ): Promise<GitAmendResult> {
    const previewResult = await this.preview({
      repoPath: request.repoPath,
      source: request.source,
      mode: request.mode
    });
    const preview = previewResult.preview;
    if (!preview) {
      return amendFailure(request.repoPath, previewResult.message, classifyPreviewFailure(previewResult.message));
    }
    if (preview.snapshotId !== request.expectedSnapshotId) {
      return amendFailure(
        request.repoPath,
        "The repository, branch, HEAD, or staged state changed. Reopen the amend dialog and review it again.",
        "stale",
        "stale",
        preview.headOid
      );
    }
    if (preview.blockingReasons.length > 0) {
      const kind: GitAmendErrorKind = preview.blockingReasons.some((reason) => reason.includes("active"))
        ? "operation-active"
        : "invalid-message";
      return amendFailure(request.repoPath, preview.blockingReasons.join(" "), kind, "failed", preview.headOid);
    }

    let plan;
    try {
      plan = createGitAmendCommandPlan(request.mode, request.message, preview.message);
    } catch (error) {
      return amendFailure(
        request.repoPath,
        error instanceof Error ? error.message : "The amend request is invalid.",
        "invalid-message",
        "failed",
        preview.headOid
      );
    }

    let before: AmendSnapshot;
    try {
      before = await this.readSnapshot(request.repoPath);
    } catch (error) {
      return amendFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Unable to recheck the repository.",
        "stale",
        "stale",
        preview.headOid
      );
    }
    if (createSnapshotId(before, request.mode) !== request.expectedSnapshotId) {
      return amendFailure(
        request.repoPath,
        "The repository, branch, HEAD, or staged state changed. Reopen the amend dialog and review it again.",
        "stale",
        "stale",
        before.head.oid
      );
    }

    const workingFingerprint = await this.readWorkingFingerprint(request.repoPath);
    let recoveryRef: string;
    try {
      recoveryRef = await this.createRecoveryPoint(request.repoPath, before.head.oid);
    } catch (error) {
      return amendFailure(
        request.repoPath,
        error instanceof Error ? error.message : "Githead could not create the amend recovery point.",
        undefined,
        "failed",
        before.head.oid
      );
    }

    onOutput?.({ stream: "stdout", text: `> git ${plan.args.join(" ")}\n` });
    const result = await this.runGit(request.repoPath, plan.args, {
      ...(plan.stdin === undefined ? {} : { stdin: plan.stdin }),
      env: createNoninteractiveGitEnvironment(),
      ...(onOutput ? { onOutput } : {})
    });
    const verification = await this.verifyAmend(before, request.mode, plan.expectedMessage, workingFingerprint);
    const stderr = processErrorText(result);

    if (verification.ok && verification.head) {
      await this.cleanupRecoveryPoints(request.repoPath, recoveryRef);
      return {
        repoPath: request.repoPath,
        exitCode: 0,
        stdout: result.stdout,
        stderr,
        outcome: "completed",
        message: "The last commit was amended. No push was started.",
        previousHeadOid: before.head.oid,
        headOid: verification.head.oid,
        recoveryRef
      };
    }

    if (verification.head && verification.head.oid !== before.head.oid) {
      return amendFailure(
        request.repoPath,
        `Git changed HEAD, but Githead could not verify the amend. ${verification.message} The recovery point was kept.`,
        "verification-failed",
        "failed",
        verification.head.oid,
        before.head.oid,
        recoveryRef,
        result
      );
    }

    const classified = await this.classifyCommitFailure(request.repoPath, result);
    return amendFailure(
      request.repoPath,
      classified.message || stderr || verification.message || "Git could not amend the commit.",
      classified.kind,
      classified.outcome,
      verification.head?.oid ?? before.head.oid,
      before.head.oid,
      recoveryRef,
      result
    );
  }

  async restore(
    request: GitAmendRestoreRequest,
    onOutput?: (output: ProcessOutput) => void
  ): Promise<GitAmendRestoreResult> {
    if (!RECOVERY_REF_PATTERN.test(request.recoveryRef)) {
      return restoreFailure(request.repoPath, "The amend recovery reference is invalid.");
    }

    let before: AmendSnapshot;
    try {
      before = await this.readSnapshot(request.repoPath);
    } catch (error) {
      return restoreFailure(request.repoPath, error instanceof Error ? error.message : "Unable to inspect the repository.");
    }
    if (before.operation) {
      return restoreFailure(request.repoPath, `Finish or abort the active ${formatOperationName(before.operation.kind)} before restoring.`);
    }
    const points = await this.readRecoveryPoints(before);
    const selected = points.find((point) => point.ref === request.recoveryRef);
    if (!selected || selected.restoreToken !== request.expectedRestoreToken) {
      return restoreFailure(
        request.repoPath,
        "The repository or recovery point changed. Reopen the amend dialog and review it again.",
        "stale",
        before.head.oid
      );
    }
    if (selected.oid === before.head.oid) {
      return restoreFailure(request.repoPath, "HEAD already points to this recovery commit.", "stale", before.head.oid);
    }

    const workingFingerprint = await this.readWorkingFingerprint(request.repoPath);
    const safetyRef = await this.createRecoveryPoint(request.repoPath, before.head.oid).catch(() => null);
    if (!safetyRef) {
      return restoreFailure(request.repoPath, "Githead could not create a recovery point for the current commit.");
    }

    onOutput?.({ stream: "stdout", text: "> git reset --soft <amend-recovery>\n" });
    const result = await this.runGit(request.repoPath, ["reset", "--soft", selected.oid], {
      env: createNoninteractiveGitEnvironment(),
      ...(onOutput ? { onOutput } : {})
    });
    const [head, indexFingerprint, afterWorking, operation] = await Promise.all([
      this.readHeadMetadata(request.repoPath).catch(() => null),
      this.readIndexFingerprint(request.repoPath).catch(() => ""),
      this.readWorkingFingerprint(request.repoPath).catch(() => ""),
      this.recovery.detect(request.repoPath).catch(() => null)
    ]);
    const verified = result.exitCode === 0
      && head?.oid === selected.oid
      && indexFingerprint === before.indexFingerprint
      && afterWorking === workingFingerprint
      && operation === null;
    if (!verified) {
      return restoreFailure(
        request.repoPath,
        "Githead could not verify the restore. The current-commit recovery point was kept.",
        "failed",
        head?.oid ?? null,
        before.head.oid,
        safetyRef,
        result
      );
    }

    await this.cleanupRecoveryPoints(request.repoPath, safetyRef);
    return {
      repoPath: request.repoPath,
      exitCode: 0,
      stdout: result.stdout,
      stderr: processErrorText(result),
      outcome: "completed",
      message: "The old commit is HEAD again. The index and working files were kept. Changes from the amended commit may now be staged.",
      previousHeadOid: before.head.oid,
      headOid: selected.oid,
      recoveryRef: safetyRef
    };
  }

  private async readSnapshot(repoPath: string): Promise<AmendSnapshot> {
    const layout = await this.runGit(repoPath, [
      "rev-parse",
      "--path-format=absolute",
      "--git-dir",
      "--git-common-dir"
    ]);
    if (layout.exitCode !== 0) throw new Error(processMessage(layout, "Select a valid Git repository."));
    const [gitDir = "", commonDir = ""] = layout.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!gitDir || !commonDir) throw new Error("Unable to identify the Git worktree.");

    const [branchResult, head, indexFingerprint, indexTree, stagedResult, stagedCheck, operation, upstreamResult, remoteContains] = await Promise.all([
      this.runGit(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      this.readHeadMetadata(repoPath),
      this.readIndexFingerprint(repoPath),
      this.runGit(repoPath, ["write-tree"]),
      this.runGit(repoPath, ["diff", "--cached", "--name-status", "-z", "-M", "HEAD", "--"]),
      this.runGit(repoPath, ["diff", "--cached", "--quiet", "--no-ext-diff", "HEAD", "--"]),
      this.recovery.detect(repoPath),
      this.runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
      this.runGit(repoPath, ["for-each-ref", "--format=%(refname:short)", "--contains=HEAD", "refs/remotes"])
    ]);
    if (indexTree.exitCode !== 0) {
      throw new Error(processMessage(indexTree, "The index contains unresolved entries and cannot be amended."));
    }
    if (stagedResult.exitCode !== 0 || (stagedCheck.exitCode !== 0 && stagedCheck.exitCode !== 1)) {
      throw new Error(processMessage(stagedResult.exitCode !== 0 ? stagedResult : stagedCheck, "Unable to inspect staged changes."));
    }

    const upstream = upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() || null : null;
    const publishedRefs = remoteContains.exitCode === 0
      ? remoteContains.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
      : [];
    let publication: GitAmendPreview["publication"] = publishedRefs.length > 0 ? "published" : upstream ? "unknown" : "local";
    if (publication !== "published" && upstream) {
      const counts = await this.runGit(repoPath, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
      if (counts.exitCode === 0) {
        const [, aheadText = "0"] = counts.stdout.trim().split(/\s+/);
        publication = Number.parseInt(aheadText, 10) > 0 ? "local-ahead" : "unknown";
      }
    }

    const resolvedGitDir = path.resolve(repoPath, gitDir);
    const resolvedCommonDir = path.resolve(repoPath, commonDir);
    return {
      repoPath,
      repositoryId: hashParts(resolvedGitDir, resolvedCommonDir),
      gitDir: resolvedGitDir,
      commonDir: resolvedCommonDir,
      branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() || null : null,
      head,
      indexFingerprint,
      indexTreeOid: indexTree.stdout.trim(),
      stagedFiles: parseNameStatus(stagedResult.stdout),
      hasStagedChanges: stagedCheck.exitCode === 1,
      upstream,
      publication,
      publishedRefs,
      operation
    };
  }

  private async readHeadMetadata(repoPath: string): Promise<HeadMetadata> {
    const result = await this.runGit(repoPath, [
      "show",
      "-s",
      "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%cI%x00%B%x00%T",
      "HEAD"
    ]);
    if (result.exitCode !== 0) {
      throw new Error("This repository has no commit to amend.");
    }
    const [oid = "", shortOid = "", subject = "", authorName = "", authorEmail = "", authorDate = "", commitDate = "", message = "", treeOid = ""] = result.stdout.split("\0");
    if (!oid.trim() || !treeOid.trim()) throw new Error("Unable to read the current commit.");
    return {
      oid: oid.trim(),
      shortOid: shortOid.trim(),
      subject,
      authorName,
      authorEmail,
      authorDate,
      commitDate,
      message: normalizeCommitMessage(message),
      treeOid: treeOid.trim()
    };
  }

  private async readIndexFingerprint(repoPath: string): Promise<string> {
    const result = await this.runGit(repoPath, ["ls-files", "--stage", "-v", "-z"]);
    if (result.exitCode !== 0) throw new Error(processMessage(result, "Unable to fingerprint the index."));
    return hashParts(result.stdout);
  }

  private async readWorkingFingerprint(repoPath: string): Promise<string> {
    const [diff, untracked] = await Promise.all([
      this.runGit(repoPath, ["diff", "--no-ext-diff", "--binary"]),
      this.runGit(repoPath, ["ls-files", "--others", "--exclude-standard", "-z"])
    ]);
    if (diff.exitCode !== 0 || untracked.exitCode !== 0) {
      throw new Error(processMessage(diff.exitCode !== 0 ? diff : untracked, "Unable to inspect working files."));
    }
    return hashParts(diff.stdout, untracked.stdout);
  }

  private async verifyAmend(
    before: AmendSnapshot,
    mode: GitAmendMode,
    expectedMessage: string,
    workingFingerprint: string
  ): Promise<CompletionVerification> {
    const [head, indexFingerprint, afterWorking, operation, stagedCheck] = await Promise.all([
      this.readHeadMetadata(before.repoPath).catch(() => null),
      this.readIndexFingerprint(before.repoPath).catch(() => ""),
      this.readWorkingFingerprint(before.repoPath).catch(() => ""),
      this.recovery.detect(before.repoPath).catch(() => null),
      this.runGit(before.repoPath, ["diff", "--cached", "--quiet", "--no-ext-diff", "HEAD", "--"])
    ]);
    if (!head) return { ok: false, message: "HEAD could not be read after Git returned.", head: null };
    if (head.oid === before.head.oid) return { ok: false, message: "HEAD did not change.", head };
    if (normalizeCommitMessage(head.message) !== normalizeCommitMessage(expectedMessage)) {
      return { ok: false, message: "The replacement commit message is not the confirmed message.", head };
    }
    const expectedTree = mode === "message-only" ? before.head.treeOid : before.indexTreeOid;
    if (head.treeOid !== expectedTree) return { ok: false, message: "The replacement commit tree is not the confirmed tree.", head };
    if (indexFingerprint !== before.indexFingerprint) return { ok: false, message: "The index changed during amend.", head };
    if (afterWorking !== workingFingerprint) return { ok: false, message: "Unstaged or untracked working state changed during amend.", head };
    if (mode !== "message-only" && stagedCheck.exitCode !== 0) {
      return { ok: false, message: "The confirmed staged changes are still staged after amend.", head };
    }
    if (operation) return { ok: false, message: "A Git operation remains active after amend.", head };
    return { ok: true, message: "The amended commit was verified.", head };
  }

  private async createRecoveryPoint(repoPath: string, oid: string): Promise<string> {
    const recoveryRef = `${RECOVERY_REF_PREFIX}${Date.now()}-${randomUUID()}`;
    const result = await this.runGit(repoPath, ["update-ref", "--create-reflog", recoveryRef, oid]);
    if (result.exitCode !== 0) {
      throw new Error(processMessage(result, "Githead could not create a durable amend recovery point."));
    }
    return recoveryRef;
  }

  private async readRecoveryPoints(snapshot: AmendSnapshot): Promise<GitAmendRecoveryPoint[]> {
    const result = await this.runGit(snapshot.repoPath, [
      "for-each-ref",
      "--sort=-refname",
      "--count=20",
      "--format=%(refname)%00%(objectname)%00%(objectname:short)%00%(subject)%00%(committerdate:iso-strict)",
      RECOVERY_REF_PREFIX
    ]);
    if (result.exitCode !== 0) return [];
    return result.stdout.split(/\r?\n/).flatMap((line) => {
      const [ref = "", oid = "", shortOid = "", subject = "", commitDate = ""] = line.split("\0");
      if (!RECOVERY_REF_PATTERN.test(ref) || !oid) return [];
      return [{
        ref,
        oid,
        shortOid,
        subject,
        commitDate,
        restoreToken: hashParts(snapshot.repositoryId, snapshot.branch ?? "", snapshot.head.oid, snapshot.indexFingerprint, ref, oid)
      }];
    });
  }

  private async cleanupRecoveryPoints(repoPath: string, keepRef: string): Promise<void> {
    const result = await this.runGit(repoPath, [
      "for-each-ref",
      "--sort=-refname",
      "--format=%(refname)%00%(objectname)",
      RECOVERY_REF_PREFIX
    ]);
    if (result.exitCode !== 0) return;
    const refs = result.stdout.split(/\r?\n/).flatMap((line) => {
      const [ref = "", oid = ""] = line.split("\0");
      return RECOVERY_REF_PATTERN.test(ref) && oid ? [{ ref, oid }] : [];
    });
    const retained = new Set(refs.slice(0, RECOVERY_REF_LIMIT).map((entry) => entry.ref));
    retained.add(keepRef);
    await Promise.all(refs.filter((entry) => !retained.has(entry.ref)).map((entry) =>
      this.runGit(repoPath, ["update-ref", "-d", entry.ref, entry.oid]).then(() => undefined)
    ));
  }

  private async classifyCommitFailure(
    repoPath: string,
    result: ProcessResult
  ): Promise<{ kind?: GitAmendErrorKind; outcome: GitAmendResult["outcome"]; message: string }> {
    const text = processErrorText(result);
    if (result.terminationReason === "aborted") {
      return { kind: "cancelled", outcome: "cancelled", message: "The amend was cancelled before a verified commit was created. The recovery point was kept." };
    }
    if (result.terminationReason === "timedOut") {
      return { kind: "timed-out", outcome: "timed-out", message: "The amend timed out. Githead verified that HEAD did not change. The recovery point was kept." };
    }
    if (/author identity unknown|unable to auto-detect email address|please tell me who you are/i.test(text)) {
      return { kind: "missing-author-identity", outcome: "failed", message: "Git needs an author name and email before it can amend this commit." };
    }
    if (/failed to sign|gpg failed|signing failed|cannot run gpg|no secret key|pinentry/i.test(text)) {
      return { kind: "signing-failed", outcome: "failed", message: `Git could not sign the amended commit. ${text}`.trim() };
    }
    if (/terminal prompts disabled|could not read username|device not configured|editor.*(cannot|failed)|unable to start editor/i.test(text)) {
      return { kind: "noninteractive-prompt", outcome: "failed", message: "Git requested an editor or prompt that cannot run through Githead. Check the activity log and Git configuration." };
    }
    if (await this.hasCommitHook(repoPath)) {
      return { kind: "hook-rejected", outcome: "failed", message: `A commit hook rejected the amend. ${text}`.trim() };
    }
    return { outcome: "failed", message: text };
  }

  private async hasCommitHook(repoPath: string): Promise<boolean> {
    const hookNames = ["pre-commit", "prepare-commit-msg", "commit-msg"];
    const paths = await Promise.all(hookNames.map(async (name) => {
      const result = await this.runGit(repoPath, ["rev-parse", "--git-path", `hooks/${name}`]);
      return result.exitCode === 0 ? result.stdout.trim() : "";
    }));
    for (const hookPath of paths) {
      if (!hookPath) continue;
      const resolved = path.isAbsolute(hookPath) ? hookPath : path.resolve(repoPath, hookPath);
      const stat = await fs.stat(resolved).catch(() => null);
      if (stat?.isFile() && (process.platform === "win32" || (stat.mode & 0o111) !== 0)) return true;
    }
    return false;
  }

  private runGit(
    repoPath: string,
    args: string[],
    options: Parameters<ProcessRunner["run"]>[2] = {}
  ): Promise<ProcessResult> {
    return this.runner.run("git", ["-C", repoPath, ...args], options);
  }
}

function selectDefaultMode(source: GitAmendPreviewRequest["source"], hasStagedChanges: boolean): GitAmendMode {
  return hasStagedChanges && source === "composer" ? "staged-edit" : "message-only";
}

function isAmendMode(value: unknown): value is GitAmendMode {
  return value === "message-only" || value === "staged-edit" || value === "staged-keep";
}

function createSnapshotId(snapshot: AmendSnapshot, mode: GitAmendMode): string {
  return hashParts(
    snapshot.repositoryId,
    snapshot.gitDir,
    snapshot.commonDir,
    snapshot.branch ?? "DETACHED",
    snapshot.head.oid,
    snapshot.head.message,
    snapshot.indexFingerprint,
    snapshot.indexTreeOid,
    mode
  );
}

function hashParts(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}

function parseNameStatus(text: string): GitAmendStagedFile[] {
  const tokens = text.split("\0").filter(Boolean);
  const files: GitAmendStagedFile[] = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++] ?? "";
    if (/^[RC][0-9]+/.test(status)) {
      const originalPath = tokens[index++] ?? "";
      const filePath = tokens[index++] ?? "";
      if (filePath) files.push({ path: filePath, originalPath, status: status[0] ?? status });
      continue;
    }
    const filePath = tokens[index++] ?? "";
    if (filePath) files.push({ path: filePath, status: status[0] ?? status });
  }
  return files;
}

function createNoninteractiveGitEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_EDITOR: "true",
    GIT_SEQUENCE_EDITOR: "true",
    GIT_MERGE_AUTOEDIT: "no",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    LC_ALL: "C"
  };
}

function processErrorText(result: ProcessResult): string {
  return `${result.stderr}${result.error ?? ""}`.trim();
}

function processMessage(result: ProcessResult, fallback: string): string {
  return processErrorText(result) || fallback;
}

function formatOperationName(kind: GitRepositoryOperationState["kind"]): string {
  return kind === "cherry-pick" ? "cherry-pick" : kind;
}

function previewFailure(message: string): GitAmendPreviewResult {
  return { outcome: "failed", preview: null, message };
}

function classifyPreviewFailure(message: string): GitAmendErrorKind | undefined {
  if (/no commit to amend/i.test(message)) return "no-head";
  if (/active .* before amending/i.test(message)) return "operation-active";
  return undefined;
}

function amendFailure(
  repoPath: string,
  message: string,
  amendErrorKind?: GitAmendErrorKind,
  outcome: GitAmendResult["outcome"] = "failed",
  headOid: string | null = null,
  previousHeadOid: string | null = null,
  recoveryRef: string | null = null,
  processResult?: ProcessResult
): GitAmendResult {
  return {
    repoPath,
    exitCode: processResult?.exitCode ?? -1,
    stdout: processResult?.stdout ?? "",
    stderr: message,
    outcome,
    message,
    previousHeadOid,
    headOid,
    recoveryRef,
    ...(amendErrorKind ? { amendErrorKind } : {})
  };
}

function restoreFailure(
  repoPath: string,
  message: string,
  outcome: GitAmendRestoreResult["outcome"] = "failed",
  headOid: string | null = null,
  previousHeadOid: string | null = null,
  recoveryRef: string | null = null,
  processResult?: ProcessResult
): GitAmendRestoreResult {
  return {
    repoPath,
    exitCode: processResult?.exitCode ?? -1,
    stdout: processResult?.stdout ?? "",
    stderr: message,
    outcome,
    message,
    previousHeadOid,
    headOid,
    recoveryRef
  };
}
