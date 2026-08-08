const GIT_CONFLICT_MARKER = /^(?:<{7,}|\|{7,}|={7,}|>{7,})(?: |$)/m;

export type GitConflictMarkerKind = "current" | "base" | "separator" | "incoming";

export function containsGitConflictMarkers(text: string): boolean {
  return GIT_CONFLICT_MARKER.test(text);
}

export function getGitConflictMarkerKind(line: string): GitConflictMarkerKind | null {
  if (/^<{7,}(?: |$)/.test(line)) return "current";
  if (/^\|{7,}(?: |$)/.test(line)) return "base";
  if (/^={7,}(?: |$)/.test(line)) return "separator";
  if (/^>{7,}(?: |$)/.test(line)) return "incoming";
  return null;
}
