/** An existing index lock, not a permission or disk error involving that path. */
export function isGitIndexLockError(stderr: string): boolean {
  return /index\.lock[^\r\n]*file exists/i.test(stderr);
}
