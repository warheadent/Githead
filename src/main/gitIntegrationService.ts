import { createHash, randomUUID } from "node:crypto";
import type {
  GitCherryPickPreview,
  GitCommitChangedFile,
  GitIntegrationCommit,
  GitIntegrationExecuteRequest,
  GitIntegrationFile,
  GitIntegrationPreview,
  GitIntegrationPreviewRequest,
  GitIntegrationPreviewResult,
  GitIntegrationRef,
  GitIntegrationResult,
  GitMergePreview,
  GitRebasePreview,
  GitRepositoryOperationState
} from "../shared/types";
import type { ProcessOutput, ProcessResult, ProcessRunner } from "./processRunner";
import { GitOperationRecoveryService } from "./gitOperationRecovery";

const OID_PATTERN = /^[0-9a-fA-F]{7,64}$/;

interface RepositorySnapshot {
  branch: string | null;
  headOid: string | null;
  statusText: string;
  operation: GitRepositoryOperationState | null;
}

interface ResolvedRef {
  ref: GitIntegrationRef;
  fullName: string;
  oid: string;
}

export class GitIntegrationService {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly recovery: GitOperationRecoveryService
  ) {}

  async preview(request: GitIntegrationPreviewRequest): Promise<GitIntegrationPreviewResult> {
    try {
      if (request.kind === "merge") return await this.previewMerge(request.repoPath, request.source);
      if (request.kind === "rebase") return await this.previewRebase(request.repoPath, request.newBase);
      return await this.previewCherryPick(
        request.repoPath,
        request.commitOids,
        request.allowAlreadyContained === true
      );
    } catch (error) {
      return {
        outcome: "failed",
        preview: null,
        message: error instanceof Error ? error.message : "Unable to inspect the requested Git operation."
      };
    }
  }

  async execute(
    request: GitIntegrationExecuteRequest,
    onOutput?: (output: ProcessOutput) => void
  ): Promise<GitIntegrationResult> {
    const previewResult = await this.preview(request);
    const preview = previewResult.preview;
    if (!preview) return failure(request, previewResult.message);
    if (preview.snapshotId !== request.expectedSnapshotId) {
      return failure(
        request,
        "The branch, HEAD, selected ref, or working tree changed after this confirmation opened. Review the refreshed preview and try again.",
        "stale",
        preview.headOid
      );
    }
    if (preview.blockingReasons.length > 0) {
      return failure(request, preview.blockingReasons.join(" "), "failed", preview.headOid);
    }

    const command = commandFor(request, preview);
    onOutput?.({ stream: "stdout", text: `> git ${displayCommand(command)}\n` });
    const result = await this.runGit(request.repoPath, command, onOutput);
    const [fresh, operation] = await Promise.all([
      this.readSnapshot(request.repoPath),
      this.recovery.detect(request.repoPath)
    ]);
    const stderr = appendIndexLockGuidance(result.error ? `${result.stderr}${result.error}` : result.stderr);

    if (operation) {
      const progress = await this.readProgress(request, preview, fresh.headOid);
      return {
        repoPath: request.repoPath,
        kind: request.kind,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr,
        outcome: "active",
        message: operation.hasConflicts
          ? `${operation.summary} The operation was preserved for recovery.`
          : `${operation.summary} Use the recovery controls to continue or abort.`,
        previousHeadOid: preview.headOid,
        headOid: fresh.headOid,
        completedCommitOids: progress.completed,
        stoppedCommitOid: progress.stopped,
        operationState: operation,
        forceWithLease: null
      };
    }

    if (result.exitCode !== 0) {
      return {
        ...failure(request, stderr.trim() || "Git could not complete the operation.", "failed", fresh.headOid),
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr
      };
    }

    const verification = await this.verifyCompletion(request, preview, fresh);
    return {
      repoPath: request.repoPath,
      kind: request.kind,
      exitCode: verification.ok ? 0 : -1,
      stdout: result.stdout,
      stderr: verification.ok ? stderr : verification.message,
      outcome: verification.outcome,
      message: verification.message,
      previousHeadOid: preview.headOid,
      headOid: fresh.headOid,
      completedCommitOids: request.kind === "cherry-pick" ? request.commitOids : [],
      stoppedCommitOid: null,
      operationState: null,
      forceWithLease: createForceWithLeaseOffer(request, preview, fresh.headOid, verification.outcome)
    };
  }

  private async previewMerge(repoPath: string, source: GitIntegrationRef): Promise<GitIntegrationPreviewResult> {
    const [snapshot, resolved] = await Promise.all([this.readSnapshot(repoPath), this.resolveRef(repoPath, source)]);
    const blockingReasons = commonBlockingReasons(snapshot, true);
    const warnings = await this.worktreeWarnings(repoPath, resolved);
    const [counts, commitOids, files] = snapshot.headOid
      ? await Promise.all([
          this.runRequired(repoPath, ["rev-list", "--left-right", "--count", `${snapshot.headOid}...${resolved.oid}`]),
          this.readCommitOids(repoPath, ["rev-list", "--reverse", "--topo-order", `${snapshot.headOid}..${resolved.oid}`]),
          this.readChangedFiles(repoPath, ["diff", "--name-status", "-z", "-M", snapshot.headOid, resolved.oid])
        ])
      : [{ stdout: "0\t0" } as ProcessResult, [resolved.oid], []];
    const [ahead = 0, behind = 0] = counts.stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
    const commits = await this.readCommits(repoPath, commitOids);
    const preview: GitMergePreview = {
      kind: "merge",
      repoPath,
      snapshotId: snapshotId("merge", snapshot, { source, sourceOid: resolved.oid }),
      currentBranch: snapshot.branch,
      headOid: snapshot.headOid,
      clean: isClean(snapshot.statusText),
      blockingReasons,
      warnings,
      commits,
      files,
      source,
      sourceOid: resolved.oid,
      ahead,
      behind,
      canFastForward: ahead === 0 && behind > 0,
      alreadyUpToDate: behind === 0
    };
    return previewResult(preview);
  }

  private async previewRebase(repoPath: string, newBase: GitIntegrationRef): Promise<GitIntegrationPreviewResult> {
    const [snapshot, resolved] = await Promise.all([this.readSnapshot(repoPath), this.resolveRef(repoPath, newBase)]);
    const blockingReasons = commonBlockingReasons(snapshot, true);
    const warnings = await this.worktreeWarnings(repoPath, resolved);
    const upstreamResult = snapshot.branch
      ? await this.runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
      : null;
    const upstream = upstreamResult?.exitCode === 0 ? upstreamResult.stdout.trim() || null : null;
    const upstreamOidResult = upstream
      ? await this.runGit(repoPath, ["rev-parse", "--verify", "--quiet", `${upstream}^{commit}`])
      : null;
    const upstreamOid = upstreamOidResult?.exitCode === 0 ? upstreamOidResult.stdout.trim() || null : null;
    if (upstream) warnings.push(`This branch tracks ${upstream}. Rebasing rewrites commits and may require a separate force-with-lease push.`);
    const commitOids = snapshot.headOid
      ? await this.readCommitOids(repoPath, ["rev-list", "--reverse", "--topo-order", "--cherry-pick", "--right-only", `${resolved.oid}...${snapshot.headOid}`])
      : [];
    const [commits, files, ancestor] = await Promise.all([
      this.readCommits(repoPath, commitOids),
      snapshot.headOid ? this.readChangedFiles(repoPath, ["diff", "--name-status", "-z", "-M", resolved.oid, snapshot.headOid]) : Promise.resolve([]),
      snapshot.headOid ? this.runGit(repoPath, ["merge-base", "--is-ancestor", resolved.oid, snapshot.headOid]) : Promise.resolve(null)
    ]);
    const preview: GitRebasePreview = {
      kind: "rebase",
      repoPath,
      snapshotId: snapshotId("rebase", snapshot, { newBase, newBaseOid: resolved.oid }),
      currentBranch: snapshot.branch,
      headOid: snapshot.headOid,
      clean: isClean(snapshot.statusText),
      blockingReasons,
      warnings,
      commits,
      files,
      newBase,
      newBaseOid: resolved.oid,
      upstream,
      upstreamOid,
      published: Boolean(upstream),
      expectedRewrittenCommitCount: commits.length,
      alreadyUpToDate: ancestor?.exitCode === 0
    };
    return previewResult(preview);
  }

  private async previewCherryPick(
    repoPath: string,
    requestedOids: string[],
    allowAlreadyContained: boolean
  ): Promise<GitIntegrationPreviewResult> {
    if (requestedOids.length === 0) throw new Error("Select at least one commit to cherry-pick.");
    if (requestedOids.length > 100) throw new Error("Cherry-pick at most 100 commits at a time.");
    const snapshot = await this.readSnapshot(repoPath);
    const commitOids: string[] = [];
    for (const requested of requestedOids) commitOids.push(await this.resolveCommit(repoPath, requested));
    if (new Set(commitOids).size !== commitOids.length) throw new Error("The cherry-pick selection contains the same commit more than once.");
    const [commits, alreadyContainedCommitOids] = await Promise.all([
      this.readCommits(repoPath, commitOids),
      snapshot.headOid
        ? this.readContainedCommitOids(repoPath, snapshot.headOid, commitOids)
        : Promise.resolve([])
    ]);
    const mergeCommitOids = commits.filter((commit) => commit.files.length >= 0 && commitParentCount(commit) > 1).map((commit) => commit.oid);
    const blockingReasons = commonBlockingReasons(snapshot, false);
    if (mergeCommitOids.length > 0) blockingReasons.push("Merge commits require an explicit mainline parent and are not supported in this version.");
    if (alreadyContainedCommitOids.length > 0 && !allowAlreadyContained) {
      blockingReasons.push(formatContainedCommitMessage(alreadyContainedCommitOids));
    }
    const warnings = alreadyContainedCommitOids.length > 0 && allowAlreadyContained
      ? [`${formatContainedCommitMessage(alreadyContainedCommitOids)} Git may stop if the selected changes already exist.`]
      : [];
    const files = dedupeFiles(commits.flatMap((commit) => commit.files.map((file) => ({
      path: file.path,
      ...(file.originalPath ? { originalPath: file.originalPath } : {}),
      status: file.status
    }))));
    const preview: GitCherryPickPreview = {
      kind: "cherry-pick",
      repoPath,
      snapshotId: snapshotId("cherry-pick", snapshot, { commitOids, allowAlreadyContained }),
      currentBranch: snapshot.branch,
      headOid: snapshot.headOid,
      clean: isClean(snapshot.statusText),
      blockingReasons,
      warnings,
      commits,
      files,
      commitOids,
      mergeCommitOids,
      alreadyContainedCommitOids
    };
    return previewResult(preview);
  }

  private async readContainedCommitOids(repoPath: string, headOid: string, commitOids: string[]): Promise<string[]> {
    const contained = new Set<string>();
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < commitOids.length) {
        const oid = commitOids[nextIndex++];
        if (!oid) continue;
        if (oid === headOid) {
          contained.add(oid);
          continue;
        }
        const result = await this.runGit(repoPath, ["merge-base", "--is-ancestor", oid, headOid]);
        if (result.exitCode === 0) {
          contained.add(oid);
        } else if (result.exitCode !== 1) {
          throw new Error(processMessage(result, `Unable to check whether commit ${oid.slice(0, 7)} is already contained in HEAD.`));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, commitOids.length) }, worker));
    return commitOids.filter((oid) => contained.has(oid));
  }

  private async readSnapshot(repoPath: string): Promise<RepositorySnapshot> {
    const [branch, head, status] = await Promise.all([
      this.runGit(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      this.runGit(repoPath, ["rev-parse", "--verify", "--quiet", "HEAD"]),
      this.runGit(repoPath, ["--no-optional-locks", "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all"])
    ]);
    if (status.exitCode !== 0) throw new Error(processMessage(status, "Unable to read the working tree."));
    return {
      branch: branch.exitCode === 0 ? branch.stdout.trim() || null : null,
      headOid: head.exitCode === 0 ? head.stdout.trim() || null : null,
      statusText: status.stdout,
      operation: await this.recovery.detect(repoPath, status.stdout)
    };
  }

  private async resolveRef(repoPath: string, ref: GitIntegrationRef): Promise<ResolvedRef> {
    const name = ref.name.trim();
    if (!name || (ref.kind !== "local" && ref.kind !== "remote")) throw new Error("Select a valid local or fetched remote branch.");
    const fullName = ref.kind === "local" ? `refs/heads/${name}` : `refs/remotes/${name}`;
    const validation = await this.runGit(repoPath, ["check-ref-format", fullName]);
    if (validation.exitCode !== 0) throw new Error("The selected branch name is invalid.");
    const oid = await this.runGit(repoPath, ["rev-parse", "--verify", "--quiet", `${fullName}^{commit}`]);
    if (oid.exitCode !== 0 || !oid.stdout.trim()) throw new Error("The selected branch no longer exists or does not point to a commit.");
    return { ref: { kind: ref.kind, name }, fullName, oid: oid.stdout.trim() };
  }

  private async resolveCommit(repoPath: string, requested: string): Promise<string> {
    const value = requested.trim();
    if (!OID_PATTERN.test(value)) throw new Error("A selected commit hash is invalid.");
    const result = await this.runGit(repoPath, ["rev-parse", "--verify", "--quiet", `${value}^{commit}`]);
    if (result.exitCode !== 0 || !result.stdout.trim()) throw new Error(`Commit ${value} no longer exists.`);
    return result.stdout.trim();
  }

  private async readCommits(repoPath: string, oids: string[]): Promise<GitIntegrationCommit[]> {
    const commits: GitIntegrationCommit[] = [];
    for (const oid of oids) {
      const [metadata, files] = await Promise.all([
        this.runRequired(repoPath, ["show", "--no-patch", "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%P", oid]),
        this.readChangedFiles(repoPath, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", "-M", oid])
      ]);
      const [fullOid = oid, shortOid = oid.slice(0, 7), subject = "", authorName = "", authorEmail = "", authorDate = "", parents = ""] = metadata.stdout.replace(/\r?\n$/, "").split("\0");
      commits.push({
        oid: fullOid,
        shortOid,
        parentOids: parents.trim() ? parents.trim().split(/\s+/) : [],
        subject,
        authorName,
        authorEmail,
        authorDate,
        files: files.map((file): GitCommitChangedFile => ({ ...file, additions: 0, deletions: 0 }))
      });
    }
    return commits;
  }

  private async readCommitOids(repoPath: string, args: string[]): Promise<string[]> {
    const result = await this.runRequired(repoPath, args);
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  private async readChangedFiles(repoPath: string, args: string[]): Promise<GitIntegrationFile[]> {
    const result = await this.runRequired(repoPath, args);
    return parseNameStatusZ(result.stdout);
  }

  private async worktreeWarnings(repoPath: string, resolved: ResolvedRef): Promise<string[]> {
    if (resolved.ref.kind !== "local") return [];
    const result = await this.runGit(repoPath, ["worktree", "list", "--porcelain", "-z"]);
    if (result.exitCode !== 0) return [];
    const records = result.stdout.split("\0");
    let worktreePath = "";
    for (const record of records) {
      if (record.startsWith("worktree ")) worktreePath = record.slice("worktree ".length);
      if (record === `branch ${resolved.fullName}` && worktreePath) {
        return [`${resolved.ref.name} is checked out at ${worktreePath}. Githead will only read that branch ref; it will not modify the other worktree.`];
      }
    }
    return [];
  }

  private async verifyCompletion(
    request: GitIntegrationExecuteRequest,
    preview: GitIntegrationPreview,
    fresh: RepositorySnapshot
  ): Promise<{ ok: boolean; outcome: GitIntegrationResult["outcome"]; message: string }> {
    if (request.kind === "merge") {
      const merge = preview as GitMergePreview;
      if (fresh.branch !== preview.currentBranch) return invalid("Git finished, but the current branch changed unexpectedly.");
      if (request.mode === "squash") {
        if (fresh.headOid !== preview.headOid) return invalid("Git finished the squash, but HEAD moved unexpectedly.");
        return isClean(fresh.statusText)
          ? { ok: true, outcome: "no-op", message: "Already up to date; there were no changes to stage." }
          : { ok: true, outcome: "staged", message: "Squash changes are staged. Review them in File Status, then create the commit in the commit composer." };
      }
      if (merge.alreadyUpToDate && fresh.headOid === preview.headOid) return { ok: true, outcome: "no-op", message: "Already up to date." };
      if (!fresh.headOid || fresh.headOid === preview.headOid) return invalid("Git reported success, but a fresh HEAD read did not confirm the merge.");
      return { ok: true, outcome: "completed", message: `Merged ${merge.source.name} into ${preview.currentBranch}.` };
    }
    if (request.kind === "cherry-pick") {
      if (request.noCommit) {
        if (fresh.headOid !== preview.headOid) return invalid("Git applied the commits without committing, but HEAD moved unexpectedly.");
        return isClean(fresh.statusText)
          ? { ok: true, outcome: "no-op", message: "The selected commits produced no working-tree changes." }
          : { ok: true, outcome: "staged", message: "The selected commits are applied without new commits. Review and commit the staged changes when ready." };
      }
      if (!fresh.headOid || fresh.headOid === preview.headOid) return invalid("Git reported success, but a fresh HEAD read did not confirm new commits.");
      return { ok: true, outcome: "completed", message: `Cherry-picked ${request.commitOids.length} ${request.commitOids.length === 1 ? "commit" : "commits"}.` };
    }
    if (fresh.branch !== preview.currentBranch) return invalid("Git finished, but the rebased branch is no longer checked out.");
    if (!fresh.headOid) return invalid("Git reported success, but Githead could not read the rebased HEAD.");
    const base = preview as GitRebasePreview;
    const ancestor = await this.runGit(request.repoPath, ["merge-base", "--is-ancestor", base.newBaseOid, fresh.headOid]);
    if (ancestor.exitCode !== 0) return invalid("Git reported success, but the selected new base is not an ancestor of the fresh HEAD.");
    return fresh.headOid === preview.headOid
      ? { ok: true, outcome: "no-op", message: "Already up to date; no commits needed replaying." }
      : { ok: true, outcome: "completed", message: `Rebased ${preview.currentBranch} onto ${base.newBase.name}. No push was performed.` };
  }

  private async readProgress(
    request: GitIntegrationExecuteRequest,
    preview: GitIntegrationPreview,
    freshHead: string | null
  ): Promise<{ completed: string[]; stopped: string | null }> {
    if (request.kind !== "cherry-pick") {
      const stopped = request.kind === "rebase" ? await this.runGit(request.repoPath, ["rev-parse", "--verify", "--quiet", "REBASE_HEAD"]) : null;
      return { completed: [], stopped: stopped?.exitCode === 0 ? stopped.stdout.trim() || null : null };
    }
    let completedCount = 0;
    if (preview.headOid && freshHead && preview.headOid !== freshHead) {
      const result = await this.runGit(request.repoPath, ["rev-list", "--count", `${preview.headOid}..${freshHead}`]);
      if (result.exitCode === 0) completedCount = Math.min(request.commitOids.length, Number.parseInt(result.stdout.trim(), 10) || 0);
    }
    const stoppedResult = await this.runGit(request.repoPath, ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"]);
    return {
      completed: request.commitOids.slice(0, completedCount),
      stopped: stoppedResult.exitCode === 0
        ? (stoppedResult.stdout.trim() || request.commitOids[completedCount] || null)
        : (request.commitOids[completedCount] ?? null)
    };
  }

  private async runRequired(repoPath: string, args: string[]): Promise<ProcessResult> {
    const result = await this.runGit(repoPath, args);
    if (result.exitCode !== 0) throw new Error(processMessage(result, "Git could not build the operation preview."));
    return result;
  }

  private runGit(repoPath: string, args: string[], onOutput?: (output: ProcessOutput) => void): Promise<ProcessResult> {
    return this.runner.run("git", ["-C", repoPath, ...args], {
      ...(onOutput ? { onOutput } : {}),
      env: {
        ...process.env,
        GIT_EDITOR: "true",
        GIT_SEQUENCE_EDITOR: "true",
        GIT_MERGE_AUTOEDIT: "no"
      }
    });
  }
}

function commonBlockingReasons(snapshot: RepositorySnapshot, requireBranch: boolean): string[] {
  const reasons: string[] = [];
  if (requireBranch && !snapshot.branch) reasons.push("Check out a local branch first; merge and rebase are unavailable in detached HEAD state.");
  if (!snapshot.headOid) reasons.push("The repository does not have a commit at HEAD yet.");
  if (snapshot.operation) reasons.push(`Finish or abort the active ${snapshot.operation.kind} before starting another integration operation.`);
  if (!isClean(snapshot.statusText)) reasons.push("Commit or stash staged and unstaged changes before continuing. Githead will not stash them automatically.");
  return reasons;
}

function isClean(statusText: string): boolean {
  return statusText.split("\0").every((record) => !record || record.startsWith("# "));
}

function snapshotId(kind: string, snapshot: RepositorySnapshot, selection: unknown): string {
  return createHash("sha256")
    .update(kind).update("\0")
    .update(snapshot.branch ?? "").update("\0")
    .update(snapshot.headOid ?? "").update("\0")
    .update(snapshot.statusText).update("\0")
    .update(snapshot.operation?.stateId ?? "").update("\0")
    .update(JSON.stringify(selection))
    .digest("hex")
    .slice(0, 24);
}

function previewResult<T extends GitIntegrationPreview>(preview: T): GitIntegrationPreviewResult {
  return {
    outcome: preview.blockingReasons.length > 0 ? "blocked" : "ready",
    preview,
    message: preview.blockingReasons[0] ?? "Review the preview before continuing."
  };
}

function formatContainedCommitMessage(commitOids: string[]): string {
  if (commitOids.length === 1) {
    return `Commit ${commitOids[0]!.slice(0, 7)} is already contained in the current branch.`;
  }
  return `${commitOids.length} selected commits are already contained in the current branch.`;
}

function commandFor(request: GitIntegrationExecuteRequest, preview: GitIntegrationPreview): string[] {
  if (request.kind === "merge") {
    const source = preview as GitMergePreview;
    const mode = request.mode === "ff-only" ? ["--ff-only"]
      : request.mode === "no-ff" ? ["--no-ff"]
        : request.mode === "squash" ? ["--squash"] : [];
    return ["merge", "--no-edit", ...mode, source.sourceOid];
  }
  if (request.kind === "cherry-pick") {
    return ["cherry-pick", ...(request.noCommit ? ["--no-commit"] : []), ...request.commitOids];
  }
  const rebase = preview as GitRebasePreview;
  return ["rebase", ...(request.preserveMerges ? ["--rebase-merges"] : []), rebase.newBaseOid];
}

function displayCommand(args: string[]): string {
  return args.map((arg) => /^[A-Za-z0-9._:/=-]+$/.test(arg) ? arg : JSON.stringify(arg)).join(" ");
}

function failure(
  request: Pick<GitIntegrationExecuteRequest, "kind" | "repoPath">,
  message: string,
  outcome: GitIntegrationResult["outcome"] = "failed",
  headOid: string | null = null
): GitIntegrationResult {
  return {
    repoPath: request.repoPath,
    kind: request.kind,
    exitCode: -1,
    stdout: "",
    stderr: message,
    outcome,
    message,
    previousHeadOid: headOid,
    headOid,
    completedCommitOids: [],
    stoppedCommitOid: null,
    operationState: null,
    forceWithLease: null
  };
}

function createForceWithLeaseOffer(
  request: GitIntegrationExecuteRequest,
  preview: GitIntegrationPreview,
  freshHeadOid: string | null,
  outcome: GitIntegrationResult["outcome"]
): import("../shared/types").GitForceWithLeaseOffer | null {
  if (request.kind !== "rebase" || preview.kind !== "rebase" || outcome !== "completed" || !freshHeadOid || !preview.currentBranch || !preview.upstream || !preview.upstreamOid) return null;
  const separator = preview.upstream.indexOf("/");
  if (separator <= 0 || separator === preview.upstream.length - 1) return null;
  return {
    branchName: preview.currentBranch,
    remoteName: preview.upstream.slice(0, separator),
    remoteBranchName: preview.upstream.slice(separator + 1),
    expectedRemoteOid: preview.upstreamOid,
    expectedHeadOid: freshHeadOid
  };
}

function invalid(message: string): { ok: false; outcome: "failed"; message: string } {
  return { ok: false, outcome: "failed", message };
}

function processMessage(result: ProcessResult, fallback: string): string {
  return result.stderr.trim() || result.error || fallback;
}

function appendIndexLockGuidance(stderr: string): string {
  return /(?:index\.lock|another git process)/i.test(stderr)
    ? `${stderr.trimEnd()}\nGithead did not remove any lock file. Close the other Git process, verify it stopped, and retry.`
    : stderr;
}

export function parseNameStatusZ(text: string): GitIntegrationFile[] {
  const records = text.split("\0");
  const files: GitIntegrationFile[] = [];
  for (let index = 0; index < records.length;) {
    const status = records[index++] ?? "";
    if (!status) continue;
    const firstPath = records[index++] ?? "";
    if (!firstPath) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const nextPath = records[index++] ?? "";
      if (nextPath) files.push({ path: nextPath, originalPath: firstPath, status });
    } else {
      files.push({ path: firstPath, status });
    }
  }
  return files;
}

function dedupeFiles(files: GitIntegrationFile[]): GitIntegrationFile[] {
  const byPath = new Map<string, GitIntegrationFile>();
  for (const file of files) byPath.set(file.path, file);
  return [...byPath.values()];
}

function commitParentCount(commit: GitIntegrationCommit): number {
  return commit.parentOids.length;
}

// Keep this exported for deterministic activity-log tests without exposing raw Git arguments over IPC.
export function createIntegrationRunId(): string {
  return randomUUID();
}
