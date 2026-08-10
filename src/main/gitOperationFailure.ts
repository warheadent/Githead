import type { GitOperationErrorKind } from "../shared/types";

/** Classifies command output locally. The input must never be attached to telemetry. */
export function classifyGitOperationError(message: string): GitOperationErrorKind {
  const normalized = message.toLowerCase();
  if (/user\.name|user\.email|author identity unknown|tell me who you are/u.test(normalized)) {
    return "missing-author-identity";
  }
  if (/branch .* already exists|already uses this name/u.test(normalized)) return "branch-name-conflict";
  if (/operation (?:was )?cancelled|aborted/u.test(normalized)) return "cancelled";
  if (/timed out|timeout/u.test(normalized)) return "timeout";
  if (/conflict|would be overwritten|non-fast-forward|failed to push some refs/u.test(normalized)) return "conflict";
  if (/authentication failed|could not read username|terminal prompts disabled|not logged in|bad credentials/u.test(normalized)) return "authentication";
  if (/permission denied|forbidden|not authorized|authorization/u.test(normalized)) return "authorization";
  if (/could not resolve host|connection (?:reset|refused)|network is unreachable|unable to access/u.test(normalized)) return "network";
  if (/not a git repository|does not exist|not found|pathspec .* did not match/u.test(normalized)) return "not-found";
  if (/invalid|unknown option|usage:/u.test(normalized)) return "validation";
  return "process-failure";
}
