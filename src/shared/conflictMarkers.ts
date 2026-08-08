const GIT_CONFLICT_MARKER = /^(?:<{7,}|\|{7,}|={7,}|>{7,})(?: |$)/m;

export function containsGitConflictMarkers(text: string): boolean {
  return GIT_CONFLICT_MARKER.test(text);
}
