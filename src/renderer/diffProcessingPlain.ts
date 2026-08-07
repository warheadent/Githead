import { groupDiffRowsByHunk, parseUnifiedDiff, type DiffRowGroup } from "./diffParser";
import type { HighlightedCode } from "./syntaxHighlighter";

export interface DiffProcessingInput {
  filePath: string;
  text: string;
  truncated: boolean;
}

export interface PlainProcessedDiff {
  groups: DiffRowGroup[];
  highlightedRows: HighlightedCode[][];
}

export function processDiffPlain(input: DiffProcessingInput): PlainProcessedDiff {
  const groups = parseDiffGroups(input);

  return {
    groups,
    highlightedRows: groups.map((group) => group.rows.map((row) => ({
      kind: "plain",
      value: row.text
    })))
  };
}

export function parseDiffGroups(input: DiffProcessingInput): DiffRowGroup[] {
  const notices = input.truncated ? ["Diff truncated."] : [];
  return groupDiffRowsByHunk(parseUnifiedDiff(input.text, notices));
}
