import { getGitConflictMarkerKind } from "../shared/conflictMarkers";
import { highlightCode, type HighlightedCode } from "./syntaxHighlighter";

export type ConflictCodeLineKind = "context" | "delete" | "add" | "marker";
export type ConflictCodeTone = "current" | "incoming" | "result";

export interface ConflictCodeLine {
  number: number;
  kind: ConflictCodeLineKind;
  marker: "" | "-" | "+" | "!";
  highlighted: HighlightedCode;
}

const MAX_EXACT_DIFF_CELLS = 250_000;

export function createConflictCodeLines({
  filePath,
  baseText,
  text,
  tone,
  syntaxHighlight = true
}: {
  filePath: string;
  baseText: string | null;
  text: string;
  tone: ConflictCodeTone;
  syntaxHighlight?: boolean;
}): ConflictCodeLine[] {
  const textLines = splitCodeLines(text);
  const highlightedLines = syntaxHighlight
    ? highlightCode(filePath, text)
    : textLines.map((value): HighlightedCode => ({ kind: "plain", value }));
  const changedLines = classifyChangedLines(baseText, text);
  let conflictSection: "current" | "base" | "incoming" | null = null;

  return textLines.map((_, index) => {
    const markerKind = tone === "result" ? getGitConflictMarkerKind(textLines[index] ?? "") : null;

    if (markerKind) {
      if (markerKind === "current") conflictSection = "current";
      if (markerKind === "base") conflictSection = "base";
      if (markerKind === "separator") conflictSection = "incoming";
      const line = createLine(index, "marker", "!", highlightedLines[index]);
      if (markerKind === "incoming") conflictSection = null;
      return line;
    }

    if (tone === "result" && conflictSection) {
      if (conflictSection === "current") return createLine(index, "delete", "-", highlightedLines[index]);
      if (conflictSection === "incoming") return createLine(index, "add", "+", highlightedLines[index]);
      return createLine(index, "marker", "!", highlightedLines[index]);
    }

    if (!changedLines[index]) return createLine(index, "context", "", highlightedLines[index]);
    if (tone === "current") return createLine(index, "delete", "-", highlightedLines[index]);
    return createLine(index, "add", "+", highlightedLines[index]);
  });
}

export function classifyChangedLines(baseText: string | null, text: string): boolean[] {
  const lines = splitCodeLines(text);

  if (baseText === null) return lines.map(() => true);

  const baseLines = splitCodeLines(baseText);
  const changed = lines.map(() => true);
  let prefixLength = 0;

  while (
    prefixLength < baseLines.length
    && prefixLength < lines.length
    && baseLines[prefixLength] === lines[prefixLength]
  ) {
    changed[prefixLength] = false;
    prefixLength += 1;
  }

  let baseSuffix = baseLines.length - 1;
  let lineSuffix = lines.length - 1;
  while (
    baseSuffix >= prefixLength
    && lineSuffix >= prefixLength
    && baseLines[baseSuffix] === lines[lineSuffix]
  ) {
    changed[lineSuffix] = false;
    baseSuffix -= 1;
    lineSuffix -= 1;
  }

  const baseMiddle = baseLines.slice(prefixLength, baseSuffix + 1);
  const lineMiddle = lines.slice(prefixLength, lineSuffix + 1);

  if (baseMiddle.length === 0 || lineMiddle.length === 0) return changed;
  if (baseMiddle.length * lineMiddle.length > MAX_EXACT_DIFF_CELLS) return changed;

  const columnCount = lineMiddle.length + 1;
  const lengths = new Uint32Array((baseMiddle.length + 1) * columnCount);

  for (let baseIndex = baseMiddle.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let lineIndex = lineMiddle.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const cell = baseIndex * columnCount + lineIndex;
      lengths[cell] = baseMiddle[baseIndex] === lineMiddle[lineIndex]
        ? 1 + lengths[(baseIndex + 1) * columnCount + lineIndex + 1]!
        : Math.max(
          lengths[(baseIndex + 1) * columnCount + lineIndex]!,
          lengths[baseIndex * columnCount + lineIndex + 1]!
        );
    }
  }

  let baseIndex = 0;
  let lineIndex = 0;
  while (baseIndex < baseMiddle.length && lineIndex < lineMiddle.length) {
    if (baseMiddle[baseIndex] === lineMiddle[lineIndex]) {
      changed[prefixLength + lineIndex] = false;
      baseIndex += 1;
      lineIndex += 1;
    } else if (
      lengths[(baseIndex + 1) * columnCount + lineIndex]!
      >= lengths[baseIndex * columnCount + lineIndex + 1]!
    ) {
      baseIndex += 1;
    } else {
      lineIndex += 1;
    }
  }

  return changed;
}

function createLine(
  index: number,
  kind: ConflictCodeLineKind,
  marker: ConflictCodeLine["marker"],
  highlighted: HighlightedCode | undefined
): ConflictCodeLine {
  return {
    number: index + 1,
    kind,
    marker,
    highlighted: highlighted ?? { kind: "plain", value: "" }
  };
}

function splitCodeLines(text: string): string[] {
  return text.split(/\r?\n/);
}
