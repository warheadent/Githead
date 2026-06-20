import { AnsiUp } from "ansi_up";
import type { GitOperationResult, GitOutputEvent } from "../shared/types";

export type ActivityLogStream = GitOutputEvent["stream"];

export interface ActivityLogBlock {
  id: number;
  kind: "output" | "notice";
  stream: ActivityLogStream;
  runId: string;
  action: string;
  rawText: string;
  html: string;
  converter: AnsiUp | null;
}

export interface ActivityLogState {
  blocks: ActivityLogBlock[];
  nextBlockId: number;
  rawTextLength: number;
  trimmed: boolean;
  version: number;
}

export const ACTIVITY_LOG_MAX_RAW_CHARS = 2_000_000;
export const ACTIVITY_LOG_MAX_BLOCKS = 3_000;

const TRIM_NOTICE_TEXT = "... older output trimmed ...\n";

export function createActivityLogState(): ActivityLogState {
  return {
    blocks: [],
    nextBlockId: 1,
    rawTextLength: 0,
    trimmed: false,
    version: 0
  };
}

export function hasActivityLogOutput(state: ActivityLogState): boolean {
  return state.blocks.some((block) => block.kind === "output" && block.rawText.trim().length > 0);
}

export function appendActivityLogEvent(state: ActivityLogState, event: GitOutputEvent): ActivityLogState {
  return appendActivityLogChunk(state, {
    runId: event.runId,
    action: event.action,
    stream: event.stream,
    text: event.text
  });
}

export function appendActivityOperationResult(
  state: ActivityLogState,
  label: string,
  result: GitOperationResult
): ActivityLogState {
  let nextState = appendActivityLogChunk(state, {
    runId: "operation",
    action: label,
    stream: "system",
    text: `> ${label}\n`
  });

  if (result.stdout.trim().length > 0) {
    nextState = appendActivityLogChunk(nextState, {
      runId: "operation",
      action: label,
      stream: "stdout",
      text: ensureTrailingNewline(result.stdout)
    });
  }

  if (result.stderr.trim().length > 0) {
    nextState = appendActivityLogChunk(nextState, {
      runId: "operation",
      action: label,
      stream: "stderr",
      text: ensureTrailingNewline(result.stderr)
    });
  }

  return appendActivityLogChunk(nextState, {
    runId: "operation",
    action: label,
    stream: "system",
    text: `${label} exited with code ${result.exitCode}.\n\n`
  });
}

export function getActivityLogRawText(state: ActivityLogState): string {
  let previousText = "";

  return state.blocks
    .map((block) => {
      const prefix = getRawPrefix(block);
      const separator = previousText && !previousText.endsWith("\n") ? "\n" : "";
      const text = `${separator}${prefix}${block.rawText}`;
      previousText = block.rawText;
      return text;
    })
    .join("");
}

function appendActivityLogChunk(
  state: ActivityLogState,
  chunk: {
    runId: string;
    action: string;
    stream: ActivityLogStream;
    text: string;
  }
): ActivityLogState {
  if (!chunk.text) {
    return state;
  }

  const blocks = [...state.blocks];
  const lastBlock = blocks.at(-1);
  const canAppendToLast =
    lastBlock?.kind === "output" &&
    lastBlock.stream === chunk.stream &&
    lastBlock.runId === chunk.runId &&
    lastBlock.action === chunk.action;

  if (canAppendToLast) {
    const converter = lastBlock.converter ?? createAnsiConverter();
    const rawText = `${lastBlock.rawText}${chunk.text}`;
    const rendered = hasTerminalHyperlink(rawText) ? renderAnsiBlock(rawText) : null;
    const html = rendered?.html ?? `${lastBlock.html}${converter.ansi_to_html(chunk.text)}`;
    blocks[blocks.length - 1] = {
      ...lastBlock,
      rawText,
      html,
      converter: rendered?.converter ?? converter
    };

    return trimActivityLog({
      ...state,
      blocks,
      rawTextLength: state.rawTextLength + chunk.text.length,
      version: state.version + 1
    });
  }

  const rendered = renderAnsiBlock(chunk.text);
  const block: ActivityLogBlock = {
    id: state.nextBlockId,
    kind: "output",
    stream: chunk.stream,
    runId: chunk.runId,
    action: chunk.action,
    rawText: chunk.text,
    html: rendered.html,
    converter: rendered.converter
  };

  return trimActivityLog({
    ...state,
    blocks: [
      ...blocks,
      block
    ],
    nextBlockId: state.nextBlockId + 1,
    rawTextLength: state.rawTextLength + chunk.text.length,
    version: state.version + 1
  });
}

function trimActivityLog(state: ActivityLogState): ActivityLogState {
  let blocks = state.blocks;
  let rawTextLength = state.rawTextLength;
  let nextBlockId = state.nextBlockId;
  let trimmed = state.trimmed;

  while (countOutputBlocks(blocks) > ACTIVITY_LOG_MAX_BLOCKS) {
    const result = removeOldestOutputBlock(blocks, rawTextLength);
    if (!result) {
      break;
    }

    blocks = result.blocks;
    rawTextLength = result.rawTextLength;
    trimmed = true;
  }

  if (rawTextLength > ACTIVITY_LOG_MAX_RAW_CHARS) {
    trimmed = true;
    const hasTrimNotice = blocks[0]?.kind === "notice";
    const targetRawTextLength = ACTIVITY_LOG_MAX_RAW_CHARS - (hasTrimNotice ? 0 : TRIM_NOTICE_TEXT.length);

    while (rawTextLength > targetRawTextLength) {
      const removeIndex = blocks.findIndex((block) => block.kind === "output");
      if (removeIndex === -1) {
        break;
      }

      const block = blocks[removeIndex];
      if (!block) {
        break;
      }

      const excess = rawTextLength - targetRawTextLength;
      if (block.rawText.length <= excess) {
        const result = removeOldestOutputBlock(blocks, rawTextLength);
        if (!result) {
          break;
        }

        blocks = result.blocks;
        rawTextLength = result.rawTextLength;
        continue;
      }

      const rawText = block.rawText.slice(excess);
      const rendered = renderAnsiBlock(rawText);
      blocks = [
        ...blocks.slice(0, removeIndex),
        {
          ...block,
          rawText,
          html: rendered.html,
          converter: rendered.converter
        },
        ...blocks.slice(removeIndex + 1)
      ];
      rawTextLength -= excess;
      break;
    }
  }

  if (!trimmed) {
    return {
      ...state,
      blocks,
      rawTextLength
    };
  }

  if (blocks[0]?.kind === "notice") {
    return {
      ...state,
      blocks,
      rawTextLength,
      trimmed
    };
  }

  const noticeBlock: ActivityLogBlock = {
    id: nextBlockId,
    kind: "notice",
    stream: "system",
    runId: "trimmed",
    action: "Activity Log",
    rawText: TRIM_NOTICE_TEXT,
    html: escapeHtml(TRIM_NOTICE_TEXT),
    converter: null
  };

  nextBlockId += 1;

  return {
    ...state,
    blocks: [
      noticeBlock,
      ...blocks
    ],
    nextBlockId,
    rawTextLength: rawTextLength + TRIM_NOTICE_TEXT.length,
    trimmed
  };
}

function countOutputBlocks(blocks: ActivityLogBlock[]): number {
  return blocks.filter((block) => block.kind === "output").length;
}

function removeOldestOutputBlock(
  blocks: ActivityLogBlock[],
  rawTextLength: number
): { blocks: ActivityLogBlock[]; rawTextLength: number } | null {
  const removeIndex = blocks.findIndex((block) => block.kind === "output");
  if (removeIndex === -1) {
    return null;
  }

  return {
    blocks: [
      ...blocks.slice(0, removeIndex),
      ...blocks.slice(removeIndex + 1)
    ],
    rawTextLength: rawTextLength - (blocks[removeIndex]?.rawText.length ?? 0)
  };
}

function createAnsiConverter(): AnsiUp {
  const converter = new AnsiUp();
  converter.escape_html = true;
  converter.use_classes = true;
  converter.url_allowlist = {};
  return converter;
}

function renderAnsiBlock(rawText: string): { html: string; converter: AnsiUp } {
  const converter = createAnsiConverter();
  const text = hasTerminalHyperlink(rawText) ? stripTerminalHyperlinks(rawText) : rawText;
  return {
    html: converter.ansi_to_html(text),
    converter
  };
}

function hasTerminalHyperlink(text: string): boolean {
  return text.includes("\u001B]8;");
}

function stripTerminalHyperlinks(text: string): string {
  return text.replace(/\u001B\]8;[^\u0007]*(?:\u0007|\u001B\\)/g, "");
}

function getRawPrefix(block: ActivityLogBlock): string {
  if (block.kind === "notice" || block.stream === "system") {
    return "";
  }

  return `[${block.stream}] `;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
