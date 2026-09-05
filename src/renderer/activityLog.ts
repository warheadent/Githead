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
  /** Segmentation must not add stream labels or newlines to exported output. */
  continuation: boolean;
  sealed: boolean;
}

export interface ActivityLogRun {
  id: string;
  action: string;
  repoPath: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

interface StreamParser {
  converter: AnsiUp;
  hyperlinkPrefix: string;
  inHyperlink: boolean;
  hyperlinkEscape: boolean;
  ansiPending: string;
  discardAnsi: boolean;
}

export interface ActivityLogState {
  blocks: ActivityLogBlock[];
  runs: ActivityLogRun[];
  parsers: Map<string, StreamParser>;
  nextBlockId: number;
  rawTextLength: number;
  trimmed: boolean;
  version: number;
}

export const ACTIVITY_LOG_MAX_RAW_CHARS = 2_000_000;
export const ACTIVITY_LOG_MAX_BLOCKS = 3_000;
export const ACTIVITY_LOG_MAX_RUNS = 100;
export const ACTIVITY_LOG_SEGMENT_CHARS = 4_096;
const TRIM_NOTICE_TEXT = "... older output trimmed ...\n";
const TERMINAL_HYPERLINK_PREFIX = "\u001B]8;";

export function createActivityLogState(): ActivityLogState {
  return { blocks: [], runs: [], parsers: new Map(), nextBlockId: 1, rawTextLength: 0, trimmed: false, version: 0 };
}

export function hasActivityLogOutput(state: ActivityLogState): boolean {
  return state.runs.length > 0;
}

export function appendActivityLogEvent(state: ActivityLogState, event: GitOutputEvent): ActivityLogState {
  if (!event.text && event.exitCode === undefined) return state;
  const previousRun = state.runs.find((run) => run.id === event.runId);
  const run: ActivityLogRun = {
    id: event.runId,
    action: previousRun?.action ?? event.action,
    repoPath: event.repoPath ?? previousRun?.repoPath ?? "",
    startedAt: event.startedAt ?? previousRun?.startedAt ?? event.timestamp,
    endedAt: event.exitCode === undefined ? previousRun?.endedAt ?? null : event.timestamp,
    exitCode: event.exitCode ?? previousRun?.exitCode ?? null
  };
  const runs = previousRun ? state.runs.map((current) => current.id === run.id ? run : current) : [...state.runs, run];
  const blocks = [...state.blocks];
  const parsers = new Map(state.parsers);
  const parserKey = JSON.stringify([event.runId, event.stream]);
  let parser = parsers.get(parserKey);
  if (!parser && event.text) {
    const converter = new AnsiUp();
    converter.escape_html = true;
    converter.use_classes = true;
    converter.url_allowlist = {};
    parser = { converter, hyperlinkPrefix: "", inHyperlink: false, hyperlinkEscape: false, ansiPending: "", discardAnsi: false };
    parsers.set(parserKey, parser);
  }
  if (parser) {
    parsers.delete(parserKey);
    parsers.set(parserKey, parser);
  }
  let nextBlockId = state.nextBlockId;
  let offset = 0;
  while (offset < event.text.length && parser) {
    const last = blocks.at(-1);
    const adjacent = last?.kind === "output" && last.runId === event.runId && last.stream === event.stream && last.action === event.action;
    const append = adjacent && !last.sealed && last.rawText.length < ACTIVITY_LOG_SEGMENT_CHARS;
    const remaining = ACTIVITY_LOG_SEGMENT_CHARS - (append ? last.rawText.length : 0);
    let text = event.text.slice(offset, offset + remaining);
    const sealed = text.length === remaining;
    // Prefer complete lines when closing a segment. A single oversized line still has a hard cap.
    if (sealed) {
      const newline = text.lastIndexOf("\n");
      if (newline >= 0) text = text.slice(0, newline + 1);
    }
    const html = parser.converter.ansi_to_html(completeAnsiSequences(parser, stripTerminalHyperlinks(parser, text)));
    if (append) {
      blocks[blocks.length - 1] = { ...last, rawText: last.rawText + text, html: last.html + html, sealed };
    } else {
      blocks.push({
        id: nextBlockId++, kind: "output", runId: event.runId, action: event.action,
        stream: event.stream, rawText: text, html, continuation: Boolean(adjacent), sealed
      });
    }
    offset += text.length;
  }
  return trimActivityLog({
    blocks, runs, parsers, nextBlockId, rawTextLength: state.rawTextLength + event.text.length,
    trimmed: state.trimmed, version: state.version + 1
  });
}

export function appendActivityOperationResult(
  state: ActivityLogState,
  label: string,
  result: GitOperationResult,
  runId = `operation-${state.nextBlockId}-${state.version}`,
  timestamp = new Date().toISOString()
): ActivityLogState {
  const event = { runId, action: label, repoPath: result.repoPath, timestamp };
  let next = appendActivityLogEvent(state, { ...event, stream: "system", text: `> ${label}\n` });
  if (result.stdout.trim()) next = appendActivityLogEvent(next, { ...event, stream: "stdout", text: ensureTrailingNewline(result.stdout) });
  if (result.stderr.trim()) next = appendActivityLogEvent(next, { ...event, stream: "stderr", text: ensureTrailingNewline(result.stderr) });
  return appendActivityLogEvent(next, {
    ...event, stream: "system", text: `${label} exited with code ${result.exitCode}.\n\n`, exitCode: result.exitCode
  });
}

export function getActivityLogRawText(state: ActivityLogState, runId?: string): string {
  let previous: ActivityLogBlock | undefined;
  return state.blocks.filter((block) => !runId || block.runId === runId || block.kind === "notice").map((block) => {
    const continuation = block.continuation && previous?.runId === block.runId && previous.stream === block.stream;
    const prefix = continuation || block.kind === "notice" || block.stream === "system" ? "" : `[${block.stream}] `;
    const separator = !continuation && previous && !previous.rawText.endsWith("\n") ? "\n" : "";
    previous = block;
    return `${separator}${prefix}${block.rawText}`;
  }).join("");
}

function trimActivityLog(state: ActivityLogState): ActivityLogState {
  let { blocks, runs, rawTextLength, nextBlockId, trimmed } = state;
  if (runs.length > ACTIVITY_LOG_MAX_RUNS) {
    runs = runs.slice(-ACTIVITY_LOG_MAX_RUNS);
    const retained = new Set(runs.map((run) => run.id));
    blocks = blocks.filter((block) => {
      if (block.kind === "notice" || retained.has(block.runId)) return true;
      rawTextLength -= block.rawText.length;
      return false;
    });
    trimmed = true;
  }
  // Discard complete segments. Never slice and reparse the retained history.
  let removeCount = blocks[0]?.kind === "notice" ? 1 : 0;
  if (removeCount) rawTextLength -= TRIM_NOTICE_TEXT.length;
  while (blocks.length - removeCount > ACTIVITY_LOG_MAX_BLOCKS || rawTextLength + (trimmed ? TRIM_NOTICE_TEXT.length : 0) > ACTIVITY_LOG_MAX_RAW_CHARS) {
    const block = blocks[removeCount++];
    if (!block) break;
    rawTextLength -= block.rawText.length;
    trimmed = true;
  }
  blocks = blocks.slice(removeCount);
  if (trimmed) {
    const notice = state.blocks[0]?.kind === "notice" ? state.blocks[0] : {
      id: nextBlockId++, kind: "notice" as const, stream: "system" as const, runId: "trimmed", action: "Activity Log",
      rawText: TRIM_NOTICE_TEXT, html: TRIM_NOTICE_TEXT, continuation: false, sealed: true
    };
    blocks.unshift(notice);
    rawTextLength += TRIM_NOTICE_TEXT.length;
  }
  // Parser state also survives Clear. Bound this cache independently of visible history.
  while (state.parsers.size > ACTIVITY_LOG_MAX_RUNS * 3) {
    const oldest = state.parsers.keys().next().value;
    if (oldest === undefined) break;
    state.parsers.delete(oldest);
  }
  return { ...state, blocks, runs, rawTextLength, nextBlockId, trimmed };
}

/** Incremental OSC 8 filtering. Even an unfinished URL retains only a few characters. */
function stripTerminalHyperlinks(parser: StreamParser, text: string): string {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    if (!parser.inHyperlink && !parser.hyperlinkPrefix) {
      const escape = text.indexOf("\u001B", index);
      if (escape === -1) return output + text.slice(index);
      output += text.slice(index, escape);
      index = escape;
    }
    const character = text[index]!;
    if (parser.inHyperlink) {
      if (character === "\u0007" || (parser.hyperlinkEscape && character === "\\")) parser.inHyperlink = false;
      parser.hyperlinkEscape = character === "\u001B";
      continue;
    }
    parser.hyperlinkPrefix += character;
    while (parser.hyperlinkPrefix && !TERMINAL_HYPERLINK_PREFIX.startsWith(parser.hyperlinkPrefix)) {
      output += parser.hyperlinkPrefix[0];
      parser.hyperlinkPrefix = parser.hyperlinkPrefix.slice(1);
    }
    if (parser.hyperlinkPrefix === TERMINAL_HYPERLINK_PREFIX) {
      parser.hyperlinkPrefix = "";
      parser.inHyperlink = true;
      parser.hyperlinkEscape = false;
    }
  }
  return output;
}

/** Never let the converter retain an unbounded, unfinished CSI sequence. */
function completeAnsiSequences(parser: StreamParser, text: string): string {
  let output = "";
  for (let index = 0; index < text.length; index++) {
    if (!parser.ansiPending) {
      const escape = text.indexOf("\u001b", index);
      if (escape === -1) return output + text.slice(index);
      output += text.slice(index, escape);
      parser.ansiPending = "\u001b";
      index = escape;
      continue;
    }
    const character = text[index]!;
    if (parser.ansiPending.length === 1) {
      if (character === "[") parser.ansiPending += character;
      else { output += parser.ansiPending + character; parser.ansiPending = ""; }
    } else if (character >= "@" && character <= "~") {
      if (!parser.discardAnsi) output += parser.ansiPending + character;
      parser.ansiPending = "";
      parser.discardAnsi = false;
    } else if (character < " " || character > "~") {
      output += character;
      parser.ansiPending = "";
      parser.discardAnsi = false;
    } else if (parser.ansiPending.length < 256) {
      parser.ansiPending += character;
    } else {
      parser.discardAnsi = true;
    }
  }
  return output;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
