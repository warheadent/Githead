export interface ParsedCommitSubject {
  type: string;
  label: string;
  scope: string | null;
  breaking: boolean;
  description: string;
}

const SUBJECT_PATTERN = /^(?<type>[A-Za-z][A-Za-z0-9-]*)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?:[ \t]+(?<description>\S.*)$/;

const TYPE_LABELS: Record<string, string> = {
  build: "Build",
  chore: "Chore",
  ci: "CI",
  docs: "Docs",
  feat: "Feature",
  fix: "Fix",
  perf: "Perf",
  refactor: "Refactor",
  revert: "Revert",
  style: "Style",
  test: "Test"
};

export function parseCommitSubject(subject: string): ParsedCommitSubject | null {
  const match = SUBJECT_PATTERN.exec(subject);
  if (!match?.groups) {
    return null;
  }

  const type = match.groups.type?.toLowerCase() ?? "";
  const rawScope = match.groups.scope;
  const scope = rawScope === undefined ? null : rawScope.trim();
  const description = match.groups.description?.trim() ?? "";
  if (!type || scope === "" || !description) {
    return null;
  }

  const breaking = match.groups.breaking === "!";
  const baseLabel = TYPE_LABELS[type] ?? toTitleCase(type);

  return {
    type,
    label: `${baseLabel}${breaking ? "!" : ""}`,
    scope,
    breaking,
    description
  };
}

function toTitleCase(type: string): string {
  return type
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join("-");
}
