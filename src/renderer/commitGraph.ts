import type { GitCommitGraphRow } from "../shared/types";

export type CommitGraphTokenKind =
  | "commit"
  | "vertical"
  | "horizontal"
  | "diagonal-slash"
  | "diagonal-backslash"
  | "empty"
  | "unknown";

export interface CommitGraphToken {
  char: string;
  lane: number;
  kind: CommitGraphTokenKind;
}

export type CommitHistoryVisualRow =
  | {
      kind: "connector";
      id: string;
      graph: string;
    }
  | {
      kind: "commit";
      commit: GitCommitGraphRow;
    };

export function getCommitHistoryVisualRows(history: GitCommitGraphRow[]): CommitHistoryVisualRow[] {
  return history.flatMap((commit) => [
    ...(commit.graphLinesBefore ?? []).map((graph, index) => ({
      kind: "connector" as const,
      id: `${commit.hash}:connector:${index}:${graph}`,
      graph
    })),
    {
      kind: "commit" as const,
      commit
    }
  ]);
}

export function getCommitGraphTokens(
  graphText: string,
  options: { fallbackCommit?: boolean } = {}
): CommitGraphToken[] {
  const fallbackCommit = options.fallbackCommit ?? true;
  const chars = graphText.length > 0 ? [...graphText] : fallbackCommit ? ["*"] : [];

  return chars.map((char, lane) => ({
    char,
    lane,
    kind: getCommitGraphTokenKind(char)
  }));
}

function getCommitGraphTokenKind(char: string): CommitGraphTokenKind {
  if (char === "*") {
    return "commit";
  }

  if (char === "|") {
    return "vertical";
  }

  if (char === "_" || char === "-") {
    return "horizontal";
  }

  if (char === "/") {
    return "diagonal-slash";
  }

  if (char === "\\") {
    return "diagonal-backslash";
  }

  return char.trim().length === 0 ? "empty" : "unknown";
}
