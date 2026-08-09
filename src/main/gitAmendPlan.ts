import type { GitAmendMode } from "../shared/types";

export interface GitAmendCommandPlan {
  args: string[];
  stdin?: string;
  expectedMessage: string;
  includesStagedChanges: boolean;
}

export function createGitAmendCommandPlan(
  mode: GitAmendMode,
  message: string,
  existingMessage: string
): GitAmendCommandPlan {
  if (mode !== "message-only" && mode !== "staged-edit" && mode !== "staged-keep") {
    throw new TypeError("The amend mode is invalid.");
  }

  if (mode === "staged-keep") {
    return {
      args: ["commit", "--amend", "--no-edit"],
      expectedMessage: normalizeCommitMessage(existingMessage),
      includesStagedChanges: true
    };
  }

  const normalizedMessage = normalizeCommitMessage(message);
  if (!normalizedMessage.trim()) {
    throw new TypeError("Enter a commit message.");
  }
  if (mode === "message-only" && normalizedMessage === normalizeCommitMessage(existingMessage)) {
    throw new TypeError("Change the commit message before amending.");
  }

  return {
    args: mode === "message-only"
      ? ["commit", "--amend", "--only", "--file=-"]
      : ["commit", "--amend", "--file=-"],
    stdin: `${normalizedMessage}\n`,
    expectedMessage: normalizedMessage,
    includesStagedChanges: mode === "staged-edit"
  };
}

export function normalizeCommitMessage(message: string): string {
  return message.replace(/\r\n/g, "\n").trimEnd();
}
