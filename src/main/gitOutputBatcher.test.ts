import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IPC_CHANNELS } from "../shared/ipc";
import type { GitOutputEvent } from "../shared/types";
import { GitOutputBatcher, runWithGitOutputSink, type GitOutputTarget } from "./gitOutputBatcher";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GitOutputBatcher", () => {
  it("coalesces adjacent chunks and flushes after the fixed interval", async () => {
    const target = createTarget();
    const batcher = createBatcher();
    const sink = batcher.createSink(target.target);

    sink.write(output({ text: "one " }));
    sink.write(output({ text: "two\n" }));

    expect(target.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(31);
    expect(target.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(target.send).toHaveBeenCalledTimes(1);
    expect(target.send).toHaveBeenCalledWith(IPC_CHANNELS.gitOutput, output({ text: "one two\n" }));
  });

  it("keeps stdout and stderr in arrival order", () => {
    const target = createTarget();
    const batcher = createBatcher();
    const sink = batcher.createSink(target.target);

    sink.write(output({ stream: "stdout", text: "one\n" }));
    sink.write(output({ stream: "stderr", text: "warning\n" }));
    sink.write(output({ stream: "stdout", text: "two\n" }));
    sink.flush();

    expect(target.send.mock.calls.map((call) => (call[1] as GitOutputEvent).text)).toEqual([
      "one\n",
      "warning\n",
      "two\n"
    ]);
  });

  it("sends owned output only to its renderer", () => {
    const owner = createTarget();
    const other = createTarget();
    const batcher = createBatcher([owner.target, other.target]);

    const sink = batcher.createSink(owner.target);
    sink.write(output());
    sink.flush();

    expect(owner.send).toHaveBeenCalledTimes(1);
    expect(other.send).not.toHaveBeenCalled();
  });

  it("broadcasts output only when no owner exists", () => {
    const first = createTarget();
    const second = createTarget();
    const batcher = createBatcher([first.target, second.target]);

    const sink = batcher.createSink();
    sink.write(output());
    sink.flush();

    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).toHaveBeenCalledTimes(1);
  });

  it("drops owned output when its renderer is destroyed", () => {
    const owner = createTarget(true);
    const other = createTarget();
    const batcher = createBatcher([other.target]);

    const sink = batcher.createSink(owner.target);
    sink.write(output());
    sink.flush();

    expect(owner.send).not.toHaveBeenCalled();
    expect(other.send).not.toHaveBeenCalled();
  });

  it("flushes all pending output when the event limit is reached", () => {
    const target = createTarget();
    const batcher = new GitOutputBatcher({
      getBroadcastTargets: () => [],
      maxPendingEvents: 2
    });
    const sink = batcher.createSink(target.target);

    sink.write(output({ text: "one " }));
    sink.write(output({ text: "two\n" }));

    expect(target.send).toHaveBeenCalledTimes(1);
    expect(target.send).toHaveBeenCalledWith(IPC_CHANNELS.gitOutput, output({ text: "one two\n" }));
  });

  it("splits a large stream without changing its content", () => {
    const target = createTarget();
    const batcher = new GitOutputBatcher({
      getBroadcastTargets: () => [],
      maxBatchChars: 4
    });
    const sink = batcher.createSink(target.target);

    sink.write(output({ text: "abcdefghij" }));
    sink.flush();

    expect(target.send.mock.calls.map((call) => (call[1] as GitOutputEvent).text)).toEqual([
      "abcd",
      "efgh",
      "ij"
    ]);
  });

  it("clears queued output after an owner flush", async () => {
    const target = createTarget();
    const batcher = createBatcher();
    const sink = batcher.createSink(target.target);

    sink.write(output());
    sink.flush();
    await vi.advanceTimersByTimeAsync(32);

    expect(target.send).toHaveBeenCalledTimes(1);
  });

  it("flushes output before an operation completes", async () => {
    const target = createTarget();
    const batcher = createBatcher();
    const result = await runWithGitOutputSink(batcher.createSink(target.target), async (write) => {
      write(output());
      expect(target.send).not.toHaveBeenCalled();
      return "complete";
    });

    expect(result).toBe("complete");
    expect(target.send).toHaveBeenCalledTimes(1);
  });

  it("flushes output when an operation rejects", async () => {
    const target = createTarget();
    const batcher = createBatcher();

    await expect(runWithGitOutputSink(batcher.createSink(target.target), async (write) => {
      write(output());
      throw new DOMException("cancelled", "AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });

    expect(target.send).toHaveBeenCalledTimes(1);
  });

  it("flushes one owner without sending another owner's output", () => {
    const first = createTarget();
    const second = createTarget();
    const batcher = createBatcher();

    batcher.createSink(first.target).write(output({ runId: "first", text: "first\n" }));
    batcher.createSink(second.target).write(output({ runId: "second", text: "second\n" }));
    batcher.flushTarget(first.target);

    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).not.toHaveBeenCalled();

    batcher.flushAll();
    expect(second.send).toHaveBeenCalledTimes(1);
  });
});

function createBatcher(broadcastTargets: GitOutputTarget[] = []): GitOutputBatcher {
  return new GitOutputBatcher({
    getBroadcastTargets: () => broadcastTargets
  });
}

function createTarget(destroyed = false): {
  target: GitOutputTarget;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  return {
    target: {
      isDestroyed: () => destroyed,
      send
    },
    send
  };
}

function output(overrides: Partial<GitOutputEvent> = {}): GitOutputEvent {
  return {
    runId: "run-1",
    action: "fetch",
    stream: "stdout",
    text: "output\n",
    timestamp: "2026-08-06T10:00:00.000Z",
    ...overrides
  };
}
