import type { GenerateAndCommitRequest, GenerateAndCommitResult } from "../shared/types";
import { canStageStatusFile } from "../shared/statusFiles";
import { createCommitPlanChanges } from "./commitPlanChanges";
import type { CommitMessageService } from "./commitMessageService";
import type { GitService, GitOutputHandler } from "./gitService";

type QuickCommitGit = Pick<GitService, "getRepoStatus" | "getCommitPlanDiffs" | "quickCommitFiles" | "getRepositoryOperationState">;

/** The IPC caller holds the repository operation lock throughout generation and commit. */
export class QuickCommitService {
  constructor(
    private readonly git: QuickCommitGit,
    private readonly messages: Pick<CommitMessageService, "generateCommitMessageFromDiff">
  ) {}

  async generateAndCommit(
    request: GenerateAndCommitRequest,
    signal: AbortSignal,
    onOutput?: GitOutputHandler,
    remoteCheckLeaseDurationMs?: number,
    onPhase?: (phase: "generating" | "committing") => void,
    onWarning?: (warning: string) => void
  ): Promise<GenerateAndCommitResult> {
    const failure = (stderr: string): GenerateAndCommitResult => ({ repoPath: request.repoPath, exitCode: -1, stdout: "", stderr });
    signal.throwIfAborted();
    const paths = [...new Set(request.paths)];
    if (paths.length === 0) return failure("Select unstaged files before using Quick Commit.");
    const status = await this.git.getRepoStatus({ repoPath: request.repoPath, generation: 0 });
    signal.throwIfAborted();
    if (status.operationState) return failure("Finish the current repository operation before using Quick Commit.");
    if (status.files.some((file) => file.isStaged)) return failure("Commit or unstage existing changes before using Quick Commit.");
    const eligible = new Set(status.files.filter((file) => file.isUnstaged && !file.isConflicted && canStageStatusFile(file)).map((file) => file.path));
    if (paths.some((filePath) => !eligible.has(filePath))) return failure("The selected files changed. Review the selection and try Quick Commit again.");

    const diffs = await this.git.getCommitPlanDiffs({ repoPath: request.repoPath, paths, signal });
    signal.throwIfAborted();
    if (diffs.length !== paths.length || diffs.some((diff) => diff.kind === "error" || diff.kind === "empty")) {
      return failure("Unable to read every selected change. Refresh File Status and try Quick Commit again.");
    }
    const changes = createCommitPlanChanges(diffs, "file");
    const diff = changes.map((change) => `File: ${change.path}\n${change.promptText}`).join("\n\n");
    onPhase?.("generating");
    const generated = await this.messages.generateCommitMessageFromDiff({ repoPath: request.repoPath }, diff, signal, onWarning);
    signal.throwIfAborted();
    if (generated.exitCode !== 0) return generated;
    const generatedMessage = generated.stdout.trim();
    if (!generatedMessage) return failure("The AI provider returned an empty commit message.");
    try {
      if (await this.git.getRepositoryOperationState(request.repoPath)) {
        return { ...failure("The repository operation changed. Review File Status before committing."), generatedMessage };
      }
      signal.throwIfAborted();
      onPhase?.("committing");
      const result = await this.git.quickCommitFiles({ repoPath: request.repoPath, changes, message: generatedMessage }, onOutput, remoteCheckLeaseDurationMs);
      return { ...result, generatedMessage, stderr: [generated.stderr, result.stderr].filter(Boolean).join("\n") };
    } catch (error) {
      return { ...failure(error instanceof Error ? error.message : "Quick Commit did not complete. Refresh File Status before retrying."), generatedMessage };
    }
  }
}
