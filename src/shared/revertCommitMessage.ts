export function formatRevertCommitMessage(subject: string): string {
  return `revert: ${subject.trim()}`;
}
