import { describe, expect, it, vi } from "vite-plus/test";
import type { GitOutputEvent } from "../shared/types";
import {
  ACTIVITY_LOG_MAX_BLOCKS,
  ACTIVITY_LOG_MAX_RAW_CHARS,
  appendActivityLogEvent,
  appendActivityOperationResult,
  createActivityLogState,
  getActivityLogRawText,
  hasActivityLogOutput
} from "./activityLog";

function output(overrides: Partial<GitOutputEvent> = {}): GitOutputEvent {
  return {
    runId: "run-1",
    action: "fetch",
    stream: "stdout",
    text: "output\n",
    timestamp: "2026-06-20T10:00:00.000Z",
    ...overrides
  };
}

describe("activityLog", () => {
  it("scans only incoming text and the split-prefix boundary for terminal hyperlinks", () => {
    let state = createActivityLogState();
    const text = "build output\n".repeat(100);
    const includes = String.prototype.includes;
    let scannedChars = 0;
    const scanSpy = vi.spyOn(String.prototype, "includes").mockImplementation(function (this: string, search, position) {
      if (search === "\u001B]8;") scannedChars += this.length;
      return includes.call(this, search, position);
    });

    try {
      for (let index = 0; index < 20; index += 1) {
        state = appendActivityLogEvent(state, output({ text }));
      }
    } finally {
      scanSpy.mockRestore();
    }

    expect(state.blocks[0]?.rawText).toBe(text.repeat(20));
    expect(state.blocks[0]?.html).toBe(text.repeat(20));
    expect(scannedChars).toBeLessThanOrEqual(20 * (text.length + 3));
  });

  it("preserves hyperlink filtering at every chunk boundary", () => {
    const text = "before \u001B]8;;https://example.test\u0007link\u001B]8;;\u0007 after";
    const expected = appendActivityLogEvent(createActivityLogState(), output({ text }));

    for (let split = 1; split < text.length; split += 1) {
      let state = appendActivityLogEvent(createActivityLogState(), output({ text: text.slice(0, split) }));
      state = appendActivityLogEvent(state, output({ text: text.slice(split) }));
      expect(state.blocks[0]?.html).toBe(expected.blocks[0]?.html);
      expect(state.blocks[0]?.rawText).toBe(text);
    }

    let state = createActivityLogState();
    for (const character of text) state = appendActivityLogEvent(state, output({ text: character }));
    expect(state.blocks[0]?.html).toBe(expected.blocks[0]?.html);
  });

  it("groups adjacent stream chunks and labels raw output once", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({ text: "one " }));
    state = appendActivityLogEvent(state, output({ text: "two\n" }));

    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]?.rawText).toBe("one two\n");
    expect(getActivityLogRawText(state)).toBe("[stdout] one two\n");
  });

  it("starts a new block when the stream changes", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({ stream: "stdout", text: "ok\n" }));
    state = appendActivityLogEvent(state, output({ stream: "stderr", text: "warning\n" }));

    expect(state.blocks.map((block) => block.stream)).toEqual([
      "stdout",
      "stderr"
    ]);
    expect(getActivityLogRawText(state)).toBe("[stdout] ok\n[stderr] warning\n");
  });

  it("keeps interleaved runs in chronological, run-specific blocks", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({ runId: "run-build", action: "Build", text: "build one\n" }));
    state = appendActivityLogEvent(state, output({ runId: "run-test", action: "Test", text: "test one\n" }));
    state = appendActivityLogEvent(state, output({ runId: "run-build", action: "Build", text: "build two\n" }));

    expect(state.blocks.map((block) => [block.runId, block.action, block.rawText])).toEqual([
      ["run-build", "Build", "build one\n"],
      ["run-test", "Test", "test one\n"],
      ["run-build", "Build", "build two\n"]
    ]);
    expect(getActivityLogRawText(state)).toBe(
      "[stdout] build one\n[stdout] test one\n[stdout] build two\n"
    );
  });

  it("converts split ANSI sequences and escapes HTML", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({ text: "\u001B[3" }));
    state = appendActivityLogEvent(state, output({ text: "2mgreen <script>\u001B[39m\n" }));

    expect(state.blocks[0]?.html).toContain("ansi-green-fg");
    expect(state.blocks[0]?.html).toContain("green &lt;script&gt;");
    expect(state.blocks[0]?.html).not.toContain("<script>");
  });

  it("does not emit terminal hyperlinks from OSC URL sequences", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({
      text: "\u001B]8;;https://example.test\u0007link\u001B]8;;\u0007\n"
    }));

    expect(state.blocks[0]?.html).toContain("link");
    expect(state.blocks[0]?.html).not.toContain("<a ");
  });

  it("formats operation results into grouped output blocks", () => {
    const state = appendActivityOperationResult(createActivityLogState(), "Generating commit message", {
      repoPath: "D:\\Githead",
      exitCode: 1,
      stdout: "partial",
      stderr: "failed"
    });

    expect(state.blocks.map((block) => block.stream)).toEqual([
      "system",
      "stdout",
      "stderr",
      "system"
    ]);
    expect(getActivityLogRawText(state)).toContain("> Generating commit message\n");
    expect(getActivityLogRawText(state)).toContain("[stdout] partial\n");
    expect(getActivityLogRawText(state)).toContain("[stderr] failed\n");
    expect(getActivityLogRawText(state)).toContain("Generating commit message exited with code 1.");
  });

  it("reports output and clears by creating a fresh state", () => {
    const state = appendActivityLogEvent(createActivityLogState(), output());

    expect(hasActivityLogOutput(state)).toBe(true);
    expect(hasActivityLogOutput(createActivityLogState())).toBe(false);
  });

  it("trims old blocks when block cap is exceeded", () => {
    let state = createActivityLogState();

    for (let index = 0; index < ACTIVITY_LOG_MAX_BLOCKS + 1; index += 1) {
      state = appendActivityLogEvent(state, output({
        runId: `run-${index}`,
        text: `${index}\n`
      }));
    }

    expect(state.trimmed).toBe(true);
    expect(state.blocks[0]?.kind).toBe("notice");
    expect(getActivityLogRawText(state)).toContain("older output trimmed");
    expect(state.blocks.some((block) => block.rawText === "0\n")).toBe(false);
  });

  it("trims old blocks when raw character cap is exceeded", () => {
    let state = createActivityLogState();

    state = appendActivityLogEvent(state, output({
      runId: "run-large-1",
      text: "a".repeat(ACTIVITY_LOG_MAX_RAW_CHARS)
    }));
    state = appendActivityLogEvent(state, output({
      runId: "run-large-2",
      text: "b".repeat(100)
    }));

    expect(state.trimmed).toBe(true);
    expect(state.blocks[0]?.kind).toBe("notice");
    expect(getActivityLogRawText(state)).toContain("b".repeat(100));
  });

  it("preserves the latest output from a single oversized block", () => {
    const state = appendActivityLogEvent(createActivityLogState(), output({
      text: `${"a".repeat(ACTIVITY_LOG_MAX_RAW_CHARS)}tail\n`
    }));

    expect(state.trimmed).toBe(true);
    expect(state.rawTextLength).toBeLessThanOrEqual(ACTIVITY_LOG_MAX_RAW_CHARS);
    expect(getActivityLogRawText(state)).toContain("tail\n");
  });
});
