import { DEFAULT_PROCESS_MAX_OUTPUT_BYTES, type ProcessResult, type ProcessRunOptions } from "./processRunner";

/**
 * Repository-wide `git status` can print far more than Githead lists, for
 * example when an untracked dependency folder holds many files. Read it in
 * truncate mode, so oversized output yields a partial status instead of a
 * failed refresh.
 */
export const GIT_STATUS_MAX_OUTPUT_BYTES = DEFAULT_PROCESS_MAX_OUTPUT_BYTES;
export const GIT_STATUS_OUTPUT_OPTIONS = {
  outputMode: "truncate",
  maxOutputBytes: GIT_STATUS_MAX_OUTPUT_BYTES
} as const satisfies ProcessRunOptions;

/**
 * Returns the complete NUL-terminated records of `-z` status output. A
 * truncated stream ends inside a record, which is dropped.
 */
export function completeStatusRecords(result: Pick<ProcessResult, "stdout" | "stdoutTruncated">): string {
  return result.stdoutTruncated ? result.stdout.slice(0, result.stdout.lastIndexOf("\0") + 1) : result.stdout;
}
