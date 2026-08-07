import { highlightDiffRows, type HighlightedCode } from "./syntaxHighlighter";
import { parseDiffGroups, type DiffProcessingInput } from "./diffProcessingPlain";
import type { DiffRowGroup } from "./diffParser";

export type { DiffProcessingInput } from "./diffProcessingPlain";

export interface ProcessedDiff {
  groups: DiffRowGroup[];
  highlightedRows: HighlightedCode[][];
}

export function processDiff(input: DiffProcessingInput): ProcessedDiff {
  const groups = parseDiffGroups(input);

  return {
    groups,
    highlightedRows: groups.map((group) => highlightDiffRows(input.filePath, group.rows))
  };
}
